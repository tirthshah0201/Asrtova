/* ============================================================
   Astrova — RAG chat orchestration (Phase 37 Parts G, N, O and P)

   User question
     → language detection
     → query normalisation (+ injection screen)
     → embedding
     → vector retrieval with provenance filters
     → context assembly
     → generation (Ollama / OpenAI-compatible / local extractive)
     → answer + citations
     → conversation + retrieval storage

   Storage rules: conversation rows keep the question/answer only; the
   retrieved documents live in rag_retrievals keyed by conversation.
   ============================================================ */

import { query } from "../../database";
import { isValidLanguage, SUPPORTED_LANGUAGES } from "../../config/languages";
import { tierLabel } from "../dataQuality";
import { sourceTypeLabel } from "../operatingHours";
import { generateAnswer, type GenerationResult } from "./generate";
import {
  looksLikeInjection,
  ragStrings,
  sanitizeQuestion,
  MAX_QUESTION_CHARS,
} from "./prompt";
import {
  RetrievalUnavailableError,
  retrieve,
  type RetrievalMeta,
  type RetrievedChunk,
} from "./retrieve";

export type RagStatus = "success" | "no_answer" | "retrieval_unavailable" | "error";

export interface ChatSource {
  n: number;
  title: string;
  sourceLabel: string;
  authorityTier: number | null;
  tierLabel: string;
  verificationStatus: string;
  url: string | null;
  license: string | null;
  language: string;
  score: number;
}

export interface RagChatInput {
  message: string;
  language?: string;
  sessionId?: string | null;
  conversationId?: string | null;
  heritageId?: string | null;
  topK?: number;
  minScore?: number;
}

export interface RagChatResult {
  status: RagStatus;
  answer: string;
  language: string;
  sources: ChatSource[];
  retrieval: {
    count: number;
    topK: number;
    minScore: number;
    model: string;
    languageFallback: boolean;
    heritageFiltered: boolean;
    elapsedMs: number;
    queryChars: number;
  };
  generation: {
    backend: string;
    model: string | null;
    status: string;
    note: string;
    elapsedMs: number;
  };
  conversationId: string | null;
  injectionAttempt: boolean;
  unavailableReason: string | null;
}

/* ---- Language detection (Part O) ---- */

/**
 * The client-supplied language always wins (it is validated upstream).
 * Otherwise the script decides: Devanagari can be Hindi or Marathi, so it
 * defaults to Hindi — callers that know better send `language`.
 */
export function detectLanguage(message: string, declared?: string | null): string {
  if (declared && isValidLanguage(declared)) return declared;
  const sample = message.slice(0, 200);
  if (/[\u0A80-\u0AFF]/.test(sample)) return "gu"; // Gujarati
  if (/[\u0A00-\u0A7F]/.test(sample)) return "pa"; // Gurmukhi
  if (/[\u0B80-\u0BFF]/.test(sample)) return "ta"; // Tamil
  if (/[\u0900-\u097F]/.test(sample)) return "hi"; // Devanagari
  if (/[\u0980-\u09FF]/.test(sample)) return "hi"; // fallback for other Indic scripts
  return "en";
}

/* ---- Query normalisation ---- */

export interface NormalizedQuery {
  text: string;
  originalLength: number;
  truncated: boolean;
  injectionAttempt: boolean;
}

export function normalizeQuery(raw: unknown): NormalizedQuery {
  const original = String(raw ?? "");
  const cleaned = sanitizeQuestion(original);
  return {
    text: cleaned,
    originalLength: original.length,
    truncated: cleaned.length >= MAX_QUESTION_CHARS,
    injectionAttempt: looksLikeInjection(original),
  };
}

/* ---- Heritage entity resolution ---- */

async function resolveHeritageFilter(
  message: string,
  explicitId: string | null
): Promise<string | null> {
  if (explicitId) return explicitId;
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM heritage_entities
      WHERE $1 ILIKE '%' || name || '%'
      ORDER BY length(name) DESC
      LIMIT 1`,
    [message]
  );
  return rows[0]?.id ?? null;
}

/* ---- Citations ---- */

/**
 * Only chunks the answer actually cites (`[n]` markers) are returned as
 * sources. An answer that cites nothing still credits its strongest
 * grounding chunk, but never dumps the whole retrieval window — that
 * would present off-topic neighbours as supporting sources.
 */
function toCitedSources(answer: string, chunks: RetrievedChunk[]): ChatSource[] {
  const cited = new Set(
    [...answer.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1]))
  );
  const chosen = chunks.filter((c) => cited.has(c.rank));
  const final = chosen.length > 0 ? chosen : chunks.slice(0, 1);
  return final.map((chunk) => ({
    n: chunk.rank,
    title: chunk.title,
    sourceLabel: sourceTypeLabel(chunk.sourceType),
    authorityTier: chunk.authorityTier,
    tierLabel: chunk.authorityTier ? tierLabel(chunk.authorityTier) : "UNRATED",
    verificationStatus: chunk.verificationStatus,
    url: chunk.sourceUrl,
    license: chunk.license,
    language: chunk.language,
    score: chunk.score,
  }));
}

/* ---- Conversation storage (Part P) ---- */

async function persist(
  input: RagChatInput,
  language: string,
  answer: string,
  chunks: RetrievedChunk[],
  status: RagStatus
): Promise<string | null> {
  try {
    let conversationId = input.conversationId || null;
    if (conversationId) {
      const existing = await query<{ id: string }>(
        `SELECT id FROM conversations WHERE id = $1`,
        [conversationId]
      );
      if (existing.rows.length === 0) conversationId = null;
    }
    if (!conversationId) {
      const created = await query<{ id: string }>(
        `INSERT INTO conversations (session_id, language) VALUES ($1, $2) RETURNING id`,
        [input.sessionId || null, language]
      );
      conversationId = created.rows[0].id;
    } else {
      await query(`UPDATE conversations SET language = $2 WHERE id = $1`, [
        conversationId,
        language,
      ]);
    }

    const chunkIds = chunks.map((c) => c.id);
    await query(
      `INSERT INTO conversation_messages (conversation_id, role, content, intent, knowledge_ids)
       VALUES ($1, 'user', $2, 'rag', $3)`,
      [conversationId, input.message, chunkIds.length ? chunkIds : null]
    );
    await query(
      `INSERT INTO conversation_messages (conversation_id, role, content, intent)
       VALUES ($1, 'assistant', $2, 'rag')`,
      [conversationId, answer]
    );

    for (const chunk of chunks) {
      await query(
        `INSERT INTO rag_retrievals (conversation_id, chunk_id, query_text, language, score, rank_position)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [conversationId, chunk.id, input.message, language, chunk.score, chunk.rank]
      );
    }
    return conversationId;
  } catch (err) {
    // Logging must never break the chat response.
    console.error("[RAG] conversation persistence failed:", (err as Error).message);
    return input.conversationId || null;
  }
}

/* ---- Main pipeline ---- */

export async function runRagChat(input: RagChatInput): Promise<RagChatResult> {
  const started = Date.now();
  const normalized = normalizeQuery(input.message);
  const language = detectLanguage(normalized.text, input.language);
  const strings = ragStrings(language);

  const empty: RagChatResult = {
    status: "error",
    answer: strings.noAnswer,
    language,
    sources: [],
    retrieval: {
      count: 0,
      topK: input.topK || 5,
      minScore: input.minScore ?? 0.35,
      model: "",
      languageFallback: false,
      heritageFiltered: false,
      elapsedMs: 0,
      queryChars: normalized.text.length,
    },
    generation: { backend: "none", model: null, status: "unavailable", note: "", elapsedMs: 0 },
    conversationId: null,
    injectionAttempt: normalized.injectionAttempt,
    unavailableReason: null,
  };

  if (!normalized.text) {
    empty.status = "error";
    empty.unavailableReason = "empty_question";
    empty.answer = strings.unavailable;
    return empty;
  }

  const heritageFilter = await resolveHeritageFilter(normalized.text, input.heritageId || null);

  let retrieval: Awaited<ReturnType<typeof retrieve>>;
  try {
    retrieval = await retrieve(normalized.text, {
      language,
      heritageId: heritageFilter,
      topK: input.topK,
      minScore: input.minScore,
    });
    // Entity filter can be too narrow — fall back to the unfiltered base.
    if (retrieval.chunks.length === 0 && heritageFilter && !input.heritageId) {
      retrieval = await retrieve(normalized.text, {
        language,
        heritageId: null,
        topK: input.topK,
        minScore: input.minScore,
      });
    }
  } catch (err) {
    const reason =
      err instanceof RetrievalUnavailableError ? (err as Error).message : (err as Error).message;
    empty.status = "retrieval_unavailable";
    empty.unavailableReason = reason;
    empty.answer = strings.noAnswer;
    empty.retrieval.elapsedMs = Date.now() - started;
    return empty;
  }

  const meta: RetrievalMeta = retrieval.meta;
  const chunks = retrieval.chunks;
  empty.retrieval = {
    count: chunks.length,
    topK: meta.topK,
    minScore: meta.minScore,
    model: meta.model,
    languageFallback: meta.languageFallback,
    heritageFiltered: Boolean(heritageFilter) && chunks.length > 0,
    elapsedMs: Date.now() - started,
    queryChars: normalized.text.length,
  };

  let generation: GenerationResult;
  const composeFrom = async (selected: RetrievedChunk[]) => {
    if (selected.length === 0) {
      return {
        text: strings.noAnswer,
        backend: "local_extractive" as const,
        model: null,
        status: "unavailable" as const,
        note: "No chunk passed the similarity threshold — no answer composed.",
        elapsedMs: 0,
      };
    }
    return generateAnswer({ question: normalized.text, chunks: selected, language });
  };

  generation = await composeFrom(chunks);

  // Same-language chunks may be on-topic yet carry no sentence that
  // answers the question (or the entity has no chunk in this language).
  // Retry once on the shared multilingual base before giving up.
  if (generation.status !== "generated" && retrieval.meta.languageFilter) {
    try {
      const shared = await retrieve(normalized.text, {
        language: null,
        heritageId: heritageFilter,
        topK: input.topK,
        minScore: input.minScore,
      });
      if (shared.chunks.length > 0) {
        const retry = await composeFrom(shared.chunks);
        if (retry.status === "generated") {
          retrieval = shared;
          generation = retry;
          empty.retrieval = {
            count: shared.chunks.length,
            topK: shared.meta.topK,
            minScore: shared.meta.minScore,
            model: shared.meta.model,
            languageFallback: true,
            heritageFiltered: empty.retrieval.heritageFiltered,
            elapsedMs: Date.now() - started,
            queryChars: normalized.text.length,
          };
        }
      }
    } catch {
      // Shared-base retry is best-effort; the first answer stands.
    }
  }

  const chunksFinal = retrieval.chunks;
  const status: RagStatus =
    generation.status === "generated" && chunksFinal.length > 0 ? "success" : "no_answer";

  // Honest contract: sources are cited ONLY for a factual answer. A
  // no_answer response never points the user at chunks that did not
  // actually support an answer.
  const sources = status === "success" ? toCitedSources(generation.text, chunksFinal) : [];
  const unavailableReason =
    status === "success"
      ? null
      : chunksFinal.length === 0
        ? "no_chunk_above_threshold"
        : "no_relevant_sentence_in_retrieved_context";

  const conversationId = await persist(input, language, generation.text, chunksFinal, status);

  return {
    status,
    answer: generation.text,
    language,
    sources,
    retrieval: empty.retrieval,
    generation: {
      backend: generation.backend,
      model: generation.model,
      status: generation.status,
      note: generation.note,
      elapsedMs: generation.elapsedMs,
    },
    conversationId,
    injectionAttempt: normalized.injectionAttempt,
    unavailableReason,
  };
}

export { SUPPORTED_LANGUAGES };
