/* ============================================================
   Astrova — RAG vector retrieval (Phase 37 Parts J and L)

   pgvector cosine similarity + provenance-aware re-ranking.

   Why re-ranking: "nearest vector" alone would happily return a Tier 5
   estimate when a Tier 1 official record is a close second. Retrieval
   therefore adds small, documented bonuses for authority tier and
   verification status, and every returned chunk carries the breakdown so
   the ranking is explainable.

   Filters: language (with graceful fallback), heritage entity,
   minimum similarity, configurable top-K, and a hard exclusion of any
   row that is not an accepted verification status.
   ============================================================ */

import { query } from "../../database";
import {
  EmbeddingUnavailableError,
  embeddingDimensions,
  embeddingModelName,
  getEmbeddingProvider,
  toVectorLiteral,
} from "./embed";
import { tokenize, hasIndicScript } from "./prompt";

export const DEFAULT_TOP_K = 5;
/** Calibrated against this model in this environment: relevant passages
 *  score 0.81–0.90 while off-topic passages top out around 0.78. */
export const DEFAULT_MIN_SCORE = 0.8;
const MAX_TOP_K = 20;

export interface RetrievalOptions {
  language?: string | null;
  heritageId?: string | null;
  topK?: number;
  minScore?: number;
}

export interface RetrievedChunk {
  id: string;
  title: string;
  content: string;
  language: string;
  authorityTier: number | null;
  sourceType: string;
  verificationStatus: "UNVERIFIED" | "REVIEWED" | "VERIFIED";
  sourceUrl: string | null;
  license: string | null;
  heritageId: string | null;
  /** Raw cosine similarity from pgvector. */
  similarity: number;
  /** +0.01 per authority tier above T5 (T1 => +0.04). */
  tierBonus: number;
  /** +0.02 VERIFIED, +0.01 REVIEWED. */
  verificationBonus: number;
  /** Final ranking score = similarity + tierBonus + verificationBonus. */
  score: number;
  rank: number;
}

export interface RetrievalMeta {
  count: number;
  topK: number;
  minScore: number;
  model: string;
  dimensions: number;
  elapsedMs: number;
  languageFilter: string | null;
  languageFallback: boolean;
  heritageFilter: string | null;
  pgvector: boolean;
  queryChars: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  meta: RetrievalMeta;
}

export class RetrievalUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetrievalUnavailableError";
  }
}

interface CandidateRow {
  [key: string]: unknown;
  id: string;
  title: string;
  content: string;
  language: string;
  authority_tier: number | null;
  source_type: string;
  verification_status: "UNVERIFIED" | "REVIEWED" | "VERIFIED";
  source_url: string | null;
  license: string | null;
  heritage_id: string | null;
  similarity: number | string;
}

let pgvectorCache: boolean | null = null;

export async function pgvectorAvailable(): Promise<boolean> {
  if (pgvectorCache !== null) return pgvectorCache;
  try {
    const { rows } = await query<{ present: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS present`
    );
    pgvectorCache = Boolean(rows[0]?.present);
  } catch {
    pgvectorCache = false;
  }
  return pgvectorCache;
}

export function tierBonusFor(tier: number | null): number {
  if (!tier || tier < 1 || tier > 5) return 0;
  return (5 - tier) * 0.01;
}

export function verificationBonusFor(status: string): number {
  if (status === "VERIFIED") return 0.02;
  if (status === "REVIEWED") return 0.01;
  return 0;
}

async function candidates(
  vectorLiteral: string,
  language: string | null,
  heritageId: string | null,
  limit: number
): Promise<CandidateRow[]> {
  const { rows } = await query<CandidateRow>(
    `SELECT id, title, content, language, authority_tier, source_type,
            verification_status, source_url, license, heritage_id,
            1 - (embedding <=> $1::vector) AS similarity
       FROM rag_chunks
      WHERE embedding IS NOT NULL
        AND verification_status IN ('UNVERIFIED','REVIEWED','VERIFIED')
        AND ($2::text IS NULL OR language = $2)
        AND ($3::uuid IS NULL OR heritage_id = $3)
      ORDER BY embedding <=> $1::vector
      LIMIT $4`,
    [vectorLiteral, language, heritageId, limit]
  );
  return rows;
}

export async function retrieve(
  queryText: string,
  options: RetrievalOptions = {}
): Promise<RetrievalResult> {
  const started = Date.now();
  const topK = Math.min(Math.max(options.topK || DEFAULT_TOP_K, 1), MAX_TOP_K);
  const minScore = Number.isFinite(options.minScore as number)
    ? (options.minScore as number)
    : DEFAULT_MIN_SCORE;
  const language = options.language || null;
  const heritageId = options.heritageId || null;

  const pgvector = await pgvectorAvailable();
  const meta: RetrievalMeta = {
    count: 0,
    topK,
    minScore,
    model: embeddingModelName(),
    dimensions: embeddingDimensions(),
    elapsedMs: 0,
    languageFilter: language,
    languageFallback: false,
    heritageFilter: heritageId,
    pgvector,
    queryChars: queryText.length,
  };

  if (!pgvector) {
    throw new RetrievalUnavailableError(
      "pgvector is not available on this database, so vector retrieval cannot run."
    );
  }

  const provider = getEmbeddingProvider();
  let vector: number[];
  try {
    const [embedded] = await provider.embed([queryText], "query");
    vector = embedded;
  } catch (err) {
    if (err instanceof EmbeddingUnavailableError) {
      throw new RetrievalUnavailableError(err.message);
    }
    throw new RetrievalUnavailableError(`Query embedding failed: ${(err as Error).message}`);
  }

  const literal = toVectorLiteral(vector);
  const fetchK = Math.min(topK * 4, 80);

  // Same-script lexical gate (Phase 38): a short query in the same
  // script as a candidate must share at least one content term with it
  // — pure vector similarity inflates scores between generically-
  // worded passages in one language (e.g. a Charminar question
  // "matching" an unrelated Hindi monument description at 0.81).
  // Cross-script candidates are exempt: token overlap is structurally
  // impossible there, so the multilingual embedding decides.
  const queryTerms = tokenize(queryText);
  const queryIndic = hasIndicScript(queryText);
  const lexicalOk = (text: string): boolean => {
    if (queryTerms.length === 0) return true;
    if (hasIndicScript(text) !== queryIndic) return true;
    const hay = text.toLowerCase();
    return queryTerms.some((t) => hay.includes(t));
  };

  const scoreRows = (rows: CandidateRow[]): RetrievedChunk[] =>
    rows
      .filter((row) => lexicalOk(`${row.title} ${row.content}`))
      .map((row) => {
        const similarity = Number(row.similarity);
        const tierBonus = tierBonusFor(row.authority_tier);
        const verificationBonus = verificationBonusFor(row.verification_status);
        return {
          id: row.id,
          title: row.title,
          content: row.content,
          language: row.language,
          authorityTier: row.authority_tier,
          sourceType: row.source_type,
          verificationStatus: row.verification_status,
          sourceUrl: row.source_url,
          license: row.license,
          heritageId: row.heritage_id,
          similarity: Number.isFinite(similarity) ? Number(similarity.toFixed(6)) : 0,
          tierBonus,
          verificationBonus,
          score: Number(
            ((Number.isFinite(similarity) ? similarity : 0) + tierBonus + verificationBonus).toFixed(6)
          ),
          rank: 0,
        };
      })
      .filter((c) => c.similarity >= minScore)
      .sort((a, b) => b.score - a.score || b.similarity - a.similarity)
      .slice(0, topK)
      .map((chunk, index) => ({ ...chunk, rank: index + 1 }));

  let scored = scoreRows(await candidates(literal, language, heritageId, fetchK));
  // Same-language preference with a documented fallback to the shared base:
  // only when the language-filtered results fall below the threshold.
  if (scored.length === 0 && language) {
    const withoutLanguage = scoreRows(await candidates(literal, null, heritageId, fetchK));
    if (withoutLanguage.length > 0) {
      scored = withoutLanguage;
      meta.languageFallback = true;
    }
  }

  meta.count = scored.length;
  meta.elapsedMs = Date.now() - started;
  return { chunks: scored, meta };
}

/** Clear the cached pgvector probe (tests). */
export function resetPgvectorCache(): void {
  pgvectorCache = null;
}
