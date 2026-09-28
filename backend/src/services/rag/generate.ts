/* ============================================================
   Astrova — Generation adapter (Phase 37 Parts G, K and M)

   Backend selection order (all optional, none hard-coded as required):

     1. Ollama            (local open model)  — OLLAMA_URL / OLLAMA_MODEL
     2. OpenAI-compatible (LLM_API_KEY set)   — LLM_BASE_URL / LLM_MODEL
     3. Local extractive composer             — always available

   This environment was verified BEFORE this file was written:
     * LLM_API_KEY is empty
     * no `ollama` binary on PATH and no server on :11434
   So the default backend here is (3), which composes the answer ONLY
   from retrieved sentences and labels itself honestly. It is not a
   fake generator: it never invents text, and the response records which
   backend produced the answer.
   ============================================================ */

import { ragStrings, rankSentences, buildSystemPrompt, buildUserPrompt, hasIndicScript, looksLikeInjection } from "./prompt";
import type { RetrievedChunk } from "./retrieve";

export type GenerationBackend = "ollama" | "openai_compatible" | "local_extractive";

export interface GenerationResult {
  text: string;
  backend: GenerationBackend;
  model: string | null;
  status: "generated" | "unavailable";
  note: string;
  elapsedMs: number;
}

export interface GenerationStatus {
  backend: GenerationBackend;
  model: string | null;
  reason: string;
}

function ollamaUrl(): string {
  return (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
}

function ollamaModel(): string {
  return process.env.OLLAMA_MODEL || "llama3.2";
}

function openAiKey(): string {
  return (process.env.LLM_API_KEY || "").trim();
}

function openAiBaseUrl(): string {
  return (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
}

function openAiModel(): string {
  return process.env.LLM_MODEL && process.env.LLM_MODEL !== "gpt-4"
    ? process.env.LLM_MODEL
    : process.env.LLM_MODEL || "gpt-4o-mini";
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Which backend would actually be used right now, and why. */
export async function getGenerationStatus(): Promise<GenerationStatus> {
  if (openAiKey()) {
    return {
      backend: "openai_compatible",
      model: openAiModel(),
      reason: "LLM_API_KEY is set — an OpenAI-compatible endpoint will be used.",
    };
  }
  try {
    const res = await fetchWithTimeout(`${ollamaUrl()}/api/tags`, { method: "GET" }, 1500);
    if (res.ok) {
      return { backend: "ollama", model: ollamaModel(), reason: `Ollama reachable at ${ollamaUrl()}.` };
    }
  } catch {
    /* not running */
  }
  return {
    backend: "local_extractive",
    model: null,
    reason:
      "No LLM runtime detected (LLM_API_KEY is empty and no Ollama server answered). " +
      "Answers are composed from retrieved sentences only.",
  };
}

async function generateWithOllama(prompt: string): Promise<string> {
  const res = await fetchWithTimeout(
    `${ollamaUrl()}/api/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: ollamaModel(), prompt, stream: false, options: { temperature: 0.2 } }),
    },
    45_000
  );
  if (!res.ok) throw new Error(`ollama returned ${res.status}`);
  const data = (await res.json()) as { response?: string };
  if (!data.response || !data.response.trim()) throw new Error("ollama returned an empty response");
  return data.response.trim();
}

async function generateWithOpenAi(system: string, user: string): Promise<string> {
  const res = await fetchWithTimeout(
    `${openAiBaseUrl()}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey()}`,
      },
      body: JSON.stringify({
        model: openAiModel(),
        temperature: 0.2,
        max_tokens: 260,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    },
    45_000
  );
  if (!res.ok) throw new Error(`LLM endpoint returned ${res.status}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error("LLM returned an empty response");
  return text.trim();
}

/**
 * Compose an answer strictly from retrieved sentences. Every sentence
 * comes from a retrieved chunk and keeps its [rank] citation.
 */
export function composeExtractive(
  question: string,
  chunks: RetrievedChunk[],
  language: string
): { text: string; status: "generated" | "unavailable" } {
  const strings = ragStrings(language);
  const choices = rankSentences(question, chunks);

  let picked: { choice: (typeof choices)[number]; rank: number }[] = [];

  if (choices.length > 0 && chunks.length > 0) {
    // Best sentence per retrieved chunk, strongest chunks first.
    const bestByChunk = new Map<string, { choice: (typeof choices)[number]; rank: number }>();
    for (const choice of choices) {
      const existing = bestByChunk.get(choice.chunk.id);
      if (!existing || choice.overlap > existing.choice.overlap) {
        bestByChunk.set(choice.chunk.id, { choice, rank: choice.chunk.rank });
      }
    }
    picked = [...bestByChunk.values()]
      .sort((a, b) => a.rank - b.rank || b.choice.overlap - a.choice.overlap)
      .slice(0, 3);
  } else if (chunks.length > 0) {
    // Cross-lingual case: the question and the retrieved chunks use
    // different scripts, so token overlap is structurally impossible.
    // The vector similarity already passed the calibrated threshold, so
    // quote the lead sentence of the strongest retrieved chunks — still
    // only retrieved sentences, never composed text. Same-script queries
    // keep the strict overlap requirement above.
    const questionIndic = hasIndicScript(question);
    const crossLingual = chunks.some((c) => hasIndicScript(c.content) !== questionIndic);
    if (crossLingual) {
      // Only the single strongest chunk: with no lexical overlap we cannot
      // verify which other chunks are on-topic, and citing them would
      // risk presenting off-topic facts as an answer.
      const top = chunks[0];
      const lead = top
        ? top.content
            .split(/(?<=[.!?।])\s+/)
            .map((s) => s.trim())
            .find((s) => s.length > 20 && !looksLikeInjection(s))
        : undefined;
      if (lead) {
        picked = [{ choice: { sentence: lead, chunk: top, overlap: 0 }, rank: top.rank }];
      }
    }
  }

  if (picked.length === 0) return { text: strings.noAnswer, status: "unavailable" };

  const body = picked
    .map(({ choice, rank }) => `${choice.sentence} [${rank}]`)
    .join(" ");

  return { text: `${strings.sourcedLead} ${body}`, status: "generated" };
}

export interface GenerateInput {
  question: string;
  chunks: RetrievedChunk[];
  language: string;
}

export async function generateAnswer(input: GenerateInput): Promise<GenerationResult> {
  const started = Date.now();
  const strings = ragStrings(input.language);
  const system = buildSystemPrompt(input.language);
  const user = buildUserPrompt(input.question, input.chunks, input.language);
  const status = await getGenerationStatus();

  if (status.backend === "ollama" || status.backend === "openai_compatible") {
    try {
      const text =
        status.backend === "ollama"
          ? await generateWithOllama(`${system}\n\n${user}`)
          : await generateWithOpenAi(system, user);
      return {
        text,
        backend: status.backend,
        model: status.model,
        status: "generated",
        note: `Generated by ${status.backend}${status.model ? ` (${status.model})` : ""}.`,
        elapsedMs: Date.now() - started,
      };
    } catch (err) {
      // Fall through to the honest local composer rather than failing.
      const fallback = composeExtractive(input.question, input.chunks, input.language);
      return {
        text: fallback.text,
        backend: "local_extractive",
        model: null,
        status: fallback.status,
        note: `${status.backend} failed (${(err as Error).message}); answered from retrieved sentences only.`,
        elapsedMs: Date.now() - started,
      };
    }
  }

  const local = composeExtractive(input.question, input.chunks, input.language);
  return {
    text: local.text,
    backend: "local_extractive",
    model: null,
    status: local.status,
    note: `${strings.generationNote} ${status.reason}`,
    elapsedMs: Date.now() - started,
  };
}
