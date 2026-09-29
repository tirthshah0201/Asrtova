/* ============================================================
   Astrova — Generation adapter (Phase 37 Parts G, K, M;
                              Phase 38 Parts C–H)

   Backend selection order (all optional, none hard-coded as required):

     1. Ollama            (local open model)  — OLLAMA_URL / OLLAMA_MODEL
     2. OpenAI-compatible (LLM_API_KEY set)   — LLM_BASE_URL / LLM_MODEL
     3. Local extractive composer             — always available

   Phase 37 verified this environment had no LLM runtime, so (3) was the
   default. Phase 38 re-audited: Ollama 0.34.4 is now installed with the
   qwen2.5:1.5b model (986 MB, verified through /api/tags and a real
   generation request). getGenerationStatus() now PROBES the runtime and
   resolves an actually-installed model instead of assuming one.

   Phase 38 Part H — LLM output is never trusted blindly:
     * sanitizeGenerationOutput() strips control characters, clamps
       length and rejects output that looks like it leaked credentials
       or tries to instruct the caller (malicious output -> fallback).
     * validateCitations() removes every [n] marker that does not point
       at a retrieved context block BEFORE the answer leaves this module.
     * An answer with no surviving citation is regenerated once with
       stricter instructions, then falls back to the extractive composer
       so an unsupported factual claim can never reach the API.
   ============================================================ */

import { ragStrings, rankSentences, buildSystemPrompt, buildUserPrompt, hasIndicScript, looksLikeInjection, tokenize } from "./prompt";
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

/* ---- Phase 38 Part S: generation latency metrics (in-memory only) ---- */

export interface GenerationMetric {
  backend: GenerationBackend;
  model: string | null;
  status: "generated" | "unavailable";
  elapsedMs: number;
  at: number;
}

const METRIC_LIMIT = 50;
const recentGenerations: GenerationMetric[] = [];

function recordMetric(metric: GenerationMetric): void {
  recentGenerations.push(metric);
  if (recentGenerations.length > METRIC_LIMIT) recentGenerations.shift();
}

export interface GenerationMetricsReport {
  samples: number;
  p50Ms: number | null;
  p95Ms: number | null;
  lastMs: number | null;
  lastBackend: GenerationBackend | null;
  lastStatus: string | null;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function getGenerationMetrics(): GenerationMetricsReport {
  const all = [...recentGenerations].sort((a, b) => a.at - b.at);
  const times = all.map((m) => m.elapsedMs).sort((a, b) => a - b);
  const last = all[all.length - 1];
  return {
    samples: all.length,
    p50Ms: percentile(times, 50),
    p95Ms: percentile(times, 95),
    lastMs: last ? last.elapsedMs : null,
    lastBackend: last ? last.backend : null,
    lastStatus: last ? last.status : null,
  };
}

/** Clear recorded metrics (tests). */
export function resetGenerationMetrics(): void {
  recentGenerations.length = 0;
}

/* ---- Runtime probing ---- */

function ollamaUrl(): string {
  return (process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
}

/** Preference order when OLLAMA_MODEL does not name an installed model. */
const OLLAMA_MODEL_PREFERENCE = ["qwen2.5:1.5b", "llama3.2", "llama3.2:1b"];

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

/** "qwen2.5:1.5b" matches installed "qwen2.5:1.5b" and "qwen2.5:latest"-style tags. */
function modelMatches(installed: string, wanted: string): boolean {
  const norm = (s: string) => (s.includes(":") ? s : `${s}:latest`);
  return norm(installed) === norm(wanted);
}

interface OllamaResolution {
  ok: boolean;
  model: string | null;
  reason: string;
}

/** Probe /api/tags and resolve a model that is ACTUALLY installed. */
async function resolveOllama(): Promise<OllamaResolution> {
  const url = ollamaUrl();
  let installed: string[] = [];
  try {
    const res = await fetchWithTimeout(`${url}/api/tags`, { method: "GET" }, 1500);
    if (!res.ok) {
      return { ok: false, model: null, reason: `Ollama answered with HTTP ${res.status} at ${url}.` };
    }
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    installed = (data.models || []).map((m) => m.name || "").filter(Boolean);
  } catch {
    return { ok: false, model: null, reason: `No Ollama server answered at ${url}.` };
  }

  if (installed.length === 0) {
    return {
      ok: false,
      model: null,
      reason: `Ollama is reachable at ${url} but no models are installed (run: ollama pull qwen2.5:1.5b).`,
    };
  }

  const wanted = (process.env.OLLAMA_MODEL || "").trim();
  if (wanted) {
    const exact = installed.find((name) => modelMatches(name, wanted));
    if (exact) return { ok: true, model: exact, reason: `Ollama reachable at ${url}; installed model ${exact} verified via /api/tags.` };
    // Requested model missing — fall back to an installed one, documented.
    const fallback = installed.find((name) =>
      OLLAMA_MODEL_PREFERENCE.some((p) => modelMatches(name, p))
    ) || installed[0];
    return {
      ok: true,
      model: fallback,
      reason: `Ollama reachable at ${url} but requested model "${wanted}" is not installed; using installed "${fallback}".`,
    };
  }

  const preferred =
    OLLAMA_MODEL_PREFERENCE.map((p) => installed.find((name) => modelMatches(name, p))).find(Boolean) ||
    installed[0];
  return { ok: true, model: preferred, reason: `Ollama reachable at ${url}; using installed model ${preferred}.` };
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
  const ollama = await resolveOllama();
  if (ollama.ok) {
    return { backend: "ollama", model: ollama.model, reason: ollama.reason };
  }
  return {
    backend: "local_extractive",
    model: null,
    reason:
      `No LLM runtime available (${ollama.reason}; LLM_API_KEY is empty). ` +
      "Answers are composed from retrieved sentences only.",
  };
}

/* ---- Phase 38 Part H: citation validation ---- */

export interface CitationValidation {
  /** Answer with every invalid [n] marker removed. */
  text: string;
  valid: number[];
  invalid: number[];
  hasValidCitation: boolean;
}

/**
 * Verify every [n] marker against the retrieved context blocks.
 * Markers that do not resolve to a retrieved chunk (spoofed, out of
 * range, malformed) are REMOVED from the text — an LLM cannot invent a
 * source number that the retrieval step did not produce.
 */
export function validateCitations(text: string, chunks: RetrievedChunk[]): CitationValidation {
  const valid = new Set<number>();
  const invalid = new Set<number>();
  const maxRank = chunks.reduce((max, c) => Math.max(max, c.rank), 0);
  const validRanks = new Set(chunks.map((c) => c.rank));

  const cleaned = text.replace(/\[(\d{1,4})\]/g, (marker, digits) => {
    const n = Number(digits);
    if (n >= 1 && n <= maxRank && validRanks.has(n)) {
      valid.add(n);
      return marker;
    }
    invalid.add(n);
    return "";
  });

  const sortedValid = [...valid].sort((a, b) => a - b);
  const sortedInvalid = [...invalid].sort((a, b) => a - b);
  return {
    text: cleaned.replace(/\s{2,}/g, " ").trim(),
    valid: sortedValid,
    invalid: sortedInvalid,
    hasValidCitation: sortedValid.length > 0,
  };
}

/* ---- Phase 38 Part U: output safety ---- */

const MAX_ANSWER_CHARS = 2400;

/**
 * Phase 38 Part I: when the model states the context lacks the answer,
 * canonicalise to the INFORMATION UNAVAILABLE contract instead of
 * returning a prose "not found" as a success answer. Conservative
 * patterns only — genuine factual answers never phrase themselves as
 * total absence of information.
 */
const ABSENCE_PATTERN = /\b(?:does not contain any|does not (?:mention|provide|include) any|no (?:such )?(?:information|details) (?:is )?(?:available|provided|contained)|not (?:available|mentioned|provided) in (?:the )?(?:context|sources|provided)|cannot be found (?:in|within))\b/i;

/**
 * Phase 38 Part H (extended): a cited schedule-bearing chunk carries
 * provenance labels in its first sentence (CONFLICT / DEMO / ASTROVA
 * ESTIMATE). An answer that cites such a chunk but drops the label
 * would misrepresent the data, so it is rejected and regenerated.
 */
export function provenanceViolations(text: string, chunks: RetrievedChunk[]): string[] {
  const cited = new Set(
    [...text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1]))
  );
  const violations: string[] = [];
  const isScheduleBlock = (c: RetrievedChunk) =>
    /\((?:CONFLICT|DEMO|ASTROVA ESTIMATE)/.test(c.content);

  // A schedule-bearing block carries provenance labels in its first
  // sentence. An answer that cites such a chunk but drops the label
  // would misrepresent the data, so it is rejected and regenerated.
  for (const chunk of chunks) {
    if (!cited.has(chunk.rank)) continue;
    if (
      chunk.content.includes("(CONFLICT — published sources disagree)") &&
      !/conflict|sources? disagree/i.test(text)
    ) {
      violations.push(
        `the answer cites the CONFLICT schedule of ${chunk.title} but never says the sources disagree — mention CONFLICT and that published sources disagree`
      );
    }
    if (
      chunk.content.includes("(DEMO — demo data, not verified)") &&
      !/\bdemo\b/i.test(text)
    ) {
      violations.push(
        `the answer cites the DEMO schedule of ${chunk.title} but never says it is demo data — mention DEMO`
      );
    }
    if (
      chunk.content.includes("(ASTROVA ESTIMATE") &&
      !/estimate|approximat/i.test(text)
    ) {
      violations.push(
        `the answer cites the estimated schedule of ${chunk.title} but never says the times are approximate estimates`
      );
    }
  }

  // Stating clock times while citing only non-schedule blocks (e.g.
  // quoting hours from a schedule block but attributing them to the
  // entity's description block) is mis-attribution: the answer must
  // cite a schedule block for its times.
  const hasClockTime = /\b\d{1,2}:\d{2}\b/.test(text.replace(/\[\d+\]/g, ""));
  const scheduleBlocks = chunks.filter(isScheduleBlock);
  const citedSchedule = scheduleBlocks.some((c) => cited.has(c.rank));
  if (hasClockTime && scheduleBlocks.length > 0 && !citedSchedule) {
    violations.push(
      "the answer states clock times but cites no operating-hours CONTEXT block — cite the schedule block for any time claim"
    );
  }

  // Phase 38 Part G: no invented hours. Every clock time in the answer
  // must appear verbatim in at least one retrieved CONTEXT block;
  // anything else is a fabricated schedule (e.g. a second made-up
  // time range next to a correct one) and is rejected.
  const canonTime = (t: string) => {
    const [h, m] = t.split(":");
    return `${Number(h)}:${m}`;
  };
  const contextTimes = new Set<string>();
  for (const chunk of chunks) {
    for (const m of chunk.content.matchAll(/\b\d{1,2}:\d{2}\b/g)) {
      contextTimes.add(canonTime(m[0]));
    }
  }
  if (contextTimes.size > 0) {
    for (const m of text.matchAll(/\b\d{1,2}:\d{2}\b/g)) {
      if (!contextTimes.has(canonTime(m[0]))) {
        violations.push(
          `the answer states the time ${m[0]} which appears in no retrieved CONTEXT block — remove it or use only the times given in CONTEXT`
        );
      }
    }
  }

  return violations;
}

export interface OutputSafety {
  safe: boolean;
  text: string;
  reason: string | null;
}

/**
 * Never let raw model output through unexamined: strip control
 * characters, clamp length, and reject credential-looking material or
 * instruction-override text (malicious/hijacked output falls back to the
 * extractive composer instead of reaching the public API).
 */
export function sanitizeGenerationOutput(raw: string): OutputSafety {
  // eslint-disable-next-line no-control-regex
  const stripped = String(raw || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();

  if (stripped.length === 0) {
    return { safe: false, text: "", reason: "model returned empty output" };
  }
  const leaks =
    /sk-[A-Za-z0-9_-]{16,}/.test(stripped) ||
    /DATABASE_URL/i.test(stripped) ||
    /postgres(?:ql)?:\/\/[^\s]+@[^\s]+/i.test(stripped) ||
    /Bearer\s+[A-Za-z0-9._-]{20,}/i.test(stripped);
  if (leaks) {
    return { safe: false, text: "", reason: "model output contained credential-like material" };
  }
  if (looksLikeInjection(stripped)) {
    return { safe: false, text: "", reason: "model output contained instruction-override text" };
  }
  const text = stripped.length > MAX_ANSWER_CHARS ? `${stripped.slice(0, MAX_ANSWER_CHARS)}…` : stripped;
  return { safe: true, text, reason: null };
}

/* ---- LLM callers ---- */

async function generateWithOllama(prompt: string, model: string): Promise<string> {
  const res = await fetchWithTimeout(
    `${ollamaUrl()}/api/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.2, num_predict: 320 },
      }),
    },
    60_000
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
    choices?: Array<{ message?: { content: string } }>;
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

/**
 * Phase 38 Part G: deterministic grounding check. When a question mixes
 * known subject matter with at least two significant terms that appear
 * in NO retrieved chunk (e.g. "wifi", "password"), the retrieved
 * context cannot answer it — an LLM must not be asked to try, because a
 * small model will happily invent a negative claim. Questions whose
 * terms are ALL absent are treated as cross-lingual/transliterated and
 * left to the normal pipeline (Part M), and Indic-script questions are
 * skipped because their tokens cannot appear in Latin chunks.
 */
export function questionUnanswerable(question: string, chunks: RetrievedChunk[]): boolean {
  if (hasIndicScript(question)) return false;
  const terms = tokenize(question);
  if (terms.length < 3) return false;
  const corpus = chunks.map((c) => `${c.title} ${c.content}`.toLowerCase()).join("\n");
  const present = terms.filter((t) => corpus.includes(t));
  const missing = terms.length - present.length;
  if (present.length === 0) return false; // fully cross-lingual / unmatched
  return missing >= 2;
}

export interface GenerateInput {
  question: string;
  chunks: RetrievedChunk[];
  language: string;
}

/** Retry instruction when the first answer failed validation. */
function buildRetryInstruction(problems: string[]): string {
  return [
    "REMINDER — your previous answer was rejected by the citation validator:",
    ...problems.map((p) => `- ${p}`),
    "- every factual sentence MUST end with a citation like [1] matching a CONTEXT block number.",
    "- preserve provenance labels (CONFLICT / DEMO / estimate) in the wording of the answer.",
    "- if you cannot answer from a CONTEXT block, reply with exactly: INFORMATION UNAVAILABLE.",
    "",
    "",
  ].join("\n");
}

const UNAVAILABLE_MARKER = /INFORMATION UNAVAILABLE/i;

export async function generateAnswer(input: GenerateInput): Promise<GenerationResult> {
  const started = Date.now();
  const strings = ragStrings(input.language);
  const system = buildSystemPrompt(input.language);
  const user = buildUserPrompt(input.question, input.chunks, input.language);
  const status = await getGenerationStatus();

  // Deterministic pre-generation grounding check (Part G): never hand a
  // question to the model when the context demonstrably lacks its terms.
  if (input.chunks.length > 0 && questionUnanswerable(input.question, input.chunks)) {
    const elapsedMs = Date.now() - started;
    return {
      text: strings.noAnswer,
      backend: status.backend,
      model: status.model,
      status: "unavailable",
      note: "Grounding check: the question mentions terms that appear in no retrieved context block, so no answer was generated.",
      elapsedMs,
    };
  }

  const finish = (
    text: string,
    backend: GenerationBackend,
    model: string | null,
    resultStatus: "generated" | "unavailable",
    note: string
  ): GenerationResult => {
    const elapsedMs = Date.now() - started;
    recordMetric({ backend, model, status: resultStatus, elapsedMs, at: Date.now() });
    return { text, backend, model, status: resultStatus, note, elapsedMs };
  };

  if (status.backend === "ollama" || status.backend === "openai_compatible") {
    const model = status.model;
    const callLlm = async (prefix: string): Promise<string> => {
      const prompt = `${system}\n\n${prefix}${user}`;
      return status.backend === "ollama"
        ? generateWithOllama(prompt, model || "unknown")
        : generateWithOpenAi(system, `${prefix}${user}`);
    };

    let lastNote = "";
    let retryProblems: string[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const raw = await callLlm(attempt === 0 ? "" : buildRetryInstruction(retryProblems));

        const safety = sanitizeGenerationOutput(raw);
        if (!safety.safe) {
          lastNote = `${status.backend} output rejected (${safety.reason});`;
          break; // fall back to extractive below
        }

        // The model declared it cannot answer from context: canonicalise
        // to the localized INFORMATION UNAVAILABLE contract string.
        if (
          (UNAVAILABLE_MARKER.test(safety.text) || ABSENCE_PATTERN.test(safety.text)) &&
          safety.text.split(/\s+/).length <= 60
        ) {
          return finish(
            strings.noAnswer,
            status.backend,
            model,
            "unavailable",
            `${status.backend}${model ? ` (${model})` : ""} reported the supplied context does not contain the answer.`
          );
        }

        const validation = validateCitations(safety.text, input.chunks);
        if (validation.hasValidCitation) {
          const violations = provenanceViolations(validation.text, input.chunks);
          if (violations.length === 0) {
            const note =
              `${status.backend}${model ? ` (${model})` : ""} answer validated: ` +
              `${validation.valid.length} citation(s) resolved to retrieved context` +
              (validation.invalid.length > 0 ? `, ${validation.invalid.length} invalid marker(s) removed` : "") +
              (attempt === 1 ? " (after one stricter retry)" : "") +
              ".";
            return finish(validation.text, status.backend, model, "generated", note);
          }
          retryProblems = violations;
          lastNote =
            `${status.backend} answer dropped provenance labels (${violations.length} violation(s));`;
          continue;
        }
        retryProblems = [
          validation.invalid.length > 0
            ? `it cited source numbers that do not exist (${validation.invalid.join(", ")})`
            : "it made factual claims with no [n] citation at all",
        ];
        lastNote =
          `${status.backend} answer cited nothing verifiable` +
          (validation.invalid.length > 0
            ? ` (${validation.invalid.length} invalid marker(s) removed)`
            : "") +
          ";";
      } catch (err) {
        lastNote = `${status.backend} failed (${(err as Error).message});`;
        break; // runtime errors are not fixed by retrying
      }
    }

    // Part H: never return unsupported factual claims — compose from
    // retrieved sentences instead (or report unavailable).
    const fallback = composeExtractive(input.question, input.chunks, input.language);
    return finish(
      fallback.text,
      "local_extractive",
      null,
      fallback.status,
      `${lastNote} answered from retrieved sentences only.`
    );
  }

  const local = composeExtractive(input.question, input.chunks, input.language);
  return finish(
    local.text,
    "local_extractive",
    null,
    local.status,
    `${strings.generationNote} ${status.reason}`
  );
}
