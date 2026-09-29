/* ============================================================
   Astrova — RAG knowledge ingestion (Phase 37 Parts I and L)

   Builds provenance-carrying chunks from Astrova's OWN trusted data:

     Tier 1/2  sources table (ASI, UNESCO, tourism boards, archives …)
     Tier 3    Wikidata-linked records
     Astrova   heritage descriptions, chatbot knowledge, method notes

   Guarantees:
     * duplicate prevention via deterministic sha256 content hashing
     * rejected enrichment is never ingested (the pipeline does not read
       enrichment_proposals at all, and the schema forbids REJECTED rows)
     * every chunk keeps source_id / tier / licence / url / verification
       status so retrieval can filter and cite on provenance
     * language is preserved (6 supported languages), never translated
       before retrieval, so provenance survives
   ============================================================ */

import { createHash } from "crypto";
import { query } from "../../database";
import { tierForSourceType } from "../dataQuality";
import {
  DEFAULT_DIMENSIONS,
  DEFAULT_MODEL,
  EmbeddingUnavailableError,
  getEmbeddingProvider,
} from "./embed";

export const SUPPORTED_RAG_LANGUAGES = ["en", "hi", "gu", "mr", "ta", "pa"] as const;
export type RagLanguage = (typeof SUPPORTED_RAG_LANGUAGES)[number];

const MAX_CHUNK_CHARS = 700;
const CHUNK_OVERLAP = 120;
const EMBED_BATCH = 16;

export interface ChunkDraft {
  [key: string]: unknown;
  title: string;
  content: string;
  contentHash: string;
  language: RagLanguage;
  authorityTier: number | null;
  license: string | null;
  sourceUrl: string | null;
  sourceType: string;
  verificationStatus: "UNVERIFIED" | "REVIEWED" | "VERIFIED";
  sourceId: string | null;
  heritageId: string | null;
  knowledgeId: string | null;
  chunkIndex: number;
}

/* ---- Hashing + chunking ---- */

/** Deterministic hash: language-scoped so identical text in two languages
 *  is two chunks (and the UNIQUE constraint never collapses languages). */
export function hashContent(language: string, content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(`${language}:${normalized}`, "utf8").digest("hex");
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Split long text into <=MAX_CHUNK_CHARS pieces with sentence overlap. */
export function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_CHUNK_CHARS) return [clean];

  const sentences = splitSentences(clean);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current && current.length + sentence.length + 1 > MAX_CHUNK_CHARS) {
      chunks.push(current.trim());
      const tail = current.slice(-CHUNK_OVERLAP);
      current = `${tail} ${sentence}`.trim();
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
    if (sentence.length > MAX_CHUNK_CHARS) {
      for (let i = 0; i < sentence.length; i += MAX_CHUNK_CHARS) {
        const piece = sentence.slice(i, i + MAX_CHUNK_CHARS);
        if (piece.length >= 200) chunks.push(piece);
      }
      current = "";
    }
  }
  if (current.trim().length > 0) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [clean];
}

function asLanguage(value: unknown): RagLanguage {
  const code = String(value || "en").toLowerCase();
  return (SUPPORTED_RAG_LANGUAGES as readonly string[]).includes(code)
    ? (code as RagLanguage)
    : "en";
}

/* ---- Provenance mapping ---- */

/** chatbot_knowledge.source label -> sources.title alias. */
const SOURCE_ALIASES: Record<string, string> = {
  ASI: "Archaeological Survey of India",
  "GI Registry India": "Geographical Indications Registry",
  "Kashmir Tourism Official": "Kashmir Tourism",
  "MP Tourism": "Madhya Pradesh Tourism",
  SGPC: "Shiromani Gurdwara Parbandhak Committee",
  "Satkosia Tiger Reserve": "Satkosia Tiger Reserve Authority",
  UNESCO: "UNESCO Intangible Cultural Heritage",
};

interface SourceRow {
  [key: string]: unknown;
  id: string;
  title: string;
  source_type: string;
  authority_tier: number | null;
  license: string | null;
  url: string | null;
  verification_status: string;
}

/** Metadata half of a chunk draft (content is added by the chunker). */
type DraftMeta = Pick<
  ChunkDraft,
  | "title"
  | "language"
  | "authorityTier"
  | "license"
  | "sourceUrl"
  | "sourceType"
  | "verificationStatus"
  | "sourceId"
  | "heritageId"
  | "knowledgeId"
>;

/** Map a free-text source label onto the sources registry. */
function resolveSource(label: string | null | undefined, registry: SourceRow[]): {
  source: SourceRow | null;
  sourceType: string;
} {
  if (!label) return { source: null, sourceType: "OTHER" };
  const wanted = (SOURCE_ALIASES[label] || label).toLowerCase();
  const hit =
    registry.find((s) => s.title.toLowerCase() === wanted) ||
    registry.find((s) => wanted.includes(s.title.toLowerCase()) || s.title.toLowerCase().includes(wanted));
  if (hit) return { source: hit, sourceType: hit.source_type };

  const lower = label.toLowerCase();
  let sourceType = "OTHER";
  if (lower.includes("unesco")) sourceType = "UNESCO";
  else if (lower.includes("asi") || lower.includes("archaeological")) sourceType = "ASI";
  else if (lower.includes("tourism")) sourceType = "TOURISM";
  else if (lower.includes("wikidata")) sourceType = "OPEN_DATASET";
  else if (lower.includes("museum")) sourceType = "MUSEUM";
  else if (lower.includes("archive")) sourceType = "ARCHIVE";
  else if (lower.includes("registry") || lower.includes("government")) sourceType = "GOVERNMENT";
  return { source: null, sourceType };
}

function verificationFor(source: SourceRow | null): "UNVERIFIED" | "REVIEWED" | "VERIFIED" {
  if (!source) return "UNVERIFIED";
  return source.verification_status === "VERIFIED" ? "VERIFIED" : "REVIEWED";
}

/* ---- Draft builders ---- */

interface KnowledgeRow {
  [key: string]: unknown;
  id: string;
  heritage_name: string | null;
  description: string | null;
  significance: string | null;
  related_event: string | null;
  related_person: string | null;
  related_craft: string | null;
  keywords: string | null;
  source: string | null;
  language: string | null;
  heritage_entity_id: string | null;
}

interface HeritageRow {
  [key: string]: unknown;
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  source_id: string | null;
}

/** Astrova's own method notes — labelled ASTROVA_DERIVED / tier 5 so the
 *  chatbot can explain estimate-bearing features without inventing facts. */
const ASTROVA_METHOD_DOCS = [
  {
    title: "Astrova best-time recommendation (method)",
    content:
      "Astrova's Best Time to visit is an ASTROVA ESTIMATE, not an official figure. It is computed from Open-Meteo forecast data over future daylight hours only: temperature, feels-like temperature, humidity, rain probability, precipitation, UV index, wind speed, hourly AQI and daylight. The score runs from 0 to 90 and is labelled 'Astrova recommendation'. It is never presented as an official or verified statement.",
  },
  {
    title: "Astrova visit cost estimator (method)",
    content:
      "Astrova's visit cost estimator is an ASTROVA ESTIMATE built from a documented local rate card for entry, transport, food, parking, stay and guide costs. It returns minimum, typical and maximum INR figures. Official fees are never claimed: officialFee stays null unless a trustworthy official source provides the fee.",
  },
  {
    title: "Astrova heritage situation and operating hours",
    content:
      "Astrova shows an open or closed status only when an operating-hours schedule exists for the site, and it uses the heritage location's timezone. Schedules marked DEMO are shown as 'Demo hours — not verified'. When no schedule exists the answer is INFORMATION UNAVAILABLE, and when sources disagree the answer is CONFLICT — REQUIRES REVIEW. Astrova never invents an opening time.",
  },
  {
    title: "Astrova nearby data sources",
    content:
      "Astrova prefers live OpenStreetMap/Overpass data for nearby places and stays. If OpenStreetMap returns nothing, Astrova may fall back to a small controlled DEMO dataset that is explicitly labelled 'Astrova demo dataset (DEMO, not verified)'. Sources are never silently mixed, and Astrova does not claim hotel prices, ratings, availability or booking information.",
  },
];

async function loadSourceRegistry(): Promise<SourceRow[]> {
  const { rows } = await query<SourceRow>(
    `SELECT id, title, source_type, authority_tier, license, url, verification_status
       FROM sources`
  );
  return rows;
}

/** Build every draft (pure-ish: reads Astrova's own tables, no network). */
export async function buildDrafts(): Promise<ChunkDraft[]> {
  const registry = await loadSourceRegistry();
  const drafts: ChunkDraft[] = [];

  const push = (base: DraftMeta, text: string) => {
    const pieces = chunkText(text);
    pieces.forEach((content, index) => {
      drafts.push({
        ...base,
        content,
        contentHash: hashContent(base.language, content),
        chunkIndex: index,
      });
    });
  };

  /* 1 — chatbot knowledge (multilingual, provenance via sources registry) */
  const { rows: knowledge } = await query<KnowledgeRow>(
    `SELECT id, heritage_name, description, significance, related_event, related_person,
            related_craft, keywords, source, language, heritage_entity_id
       FROM chatbot_knowledge`
  );

  for (const row of knowledge) {
    const parts = [
      row.description,
      row.significance ? `Significance: ${row.significance}` : null,
      row.related_event ? `Related event: ${row.related_event}` : null,
      row.related_person ? `Related person: ${row.related_person}` : null,
      row.related_craft ? `Related craft: ${row.related_craft}` : null,
      row.keywords ? `Keywords: ${row.keywords}` : null,
      row.source ? `Source: ${row.source}` : null,
    ].filter((v): v is string => Boolean(v && String(v).trim()));

    if (parts.length === 0) continue;
    const { source, sourceType } = resolveSource(row.source, registry);
    const tier = source?.authority_tier ?? tierForSourceType(sourceType);

    push(
      {
        title: row.heritage_name || row.source || "Astrova knowledge",
        language: asLanguage(row.language),
        authorityTier: tier,
        license: source?.license ?? null,
        sourceUrl: source?.url ?? null,
        sourceType,
        verificationStatus: verificationFor(source),
        sourceId: source?.id ?? null,
        heritageId: row.heritage_entity_id,
        knowledgeId: row.id,
      },
      parts.join("\n\n")
    );
  }

  /* 2 — heritage descriptions (Astrova curated records + linked source) */
  const { rows: heritage } = await query<HeritageRow>(
    `SELECT he.id, he.name, he.slug, he.description, he.category, he.source_id,
            s.title AS source_title, s.source_type AS source_kind,
            s.authority_tier, s.license, s.url, s.verification_status
       FROM heritage_entities he
       LEFT JOIN sources s ON he.source_id = s.id
      WHERE he.description IS NOT NULL AND length(trim(he.description)) > 0`
  );

  const sourceById = new Map(registry.map((s) => [s.id, s]));
  const titleToSource = new Map(registry.map((s) => [s.title, s]));

  for (const row of heritage) {
    const linked = row.source_id ? sourceById.get(row.source_id) : undefined;
    const linkedTitle = (row as { source_title?: string }).source_title ?? null;
    const source =
      linked ?? (linkedTitle ? titleToSource.get(linkedTitle) : undefined) ?? null;
    const sourceType =
      source?.source_type ||
      (row as unknown as { source_kind?: string }).source_kind ||
      "OTHER";

    push(
      {
        title: row.name,
        language: "en",
        authorityTier: source?.authority_tier ?? tierForSourceType(sourceType),
        license: source?.license ?? null,
        sourceUrl: source?.url ?? null,
        sourceType,
        verificationStatus: verificationFor(source ?? null),
        sourceId: source?.id ?? row.source_id ?? null,
        heritageId: row.id,
        knowledgeId: null,
      },
      `${row.name}${row.category ? ` (${row.category})` : ""}: ${row.description}`
    );
  }

  /* 3 — Astrova method notes (self-described, tier 5) */
  for (const doc of ASTROVA_METHOD_DOCS) {
    push(
      {
        title: doc.title,
        language: "en",
        authorityTier: 5,
        license: null,
        sourceUrl: null,
        sourceType: "ASTROVA_DERIVED",
        verificationStatus: "REVIEWED",
        sourceId: null,
        heritageId: null,
        knowledgeId: null,
      },
      doc.content
    );
  }

  /* 4 — operating-hours summaries (Phase 38 Parts N and I)
     Derived from heritage_operating_hours so the chatbot can answer
     hours questions with the stored provenance labels (VERIFIED /
     DEMO / CONFLICT / ASTROVA_ESTIMATE) instead of inventing times.
     Only rows effective today are summarised; each chunk carries the
     schedule's source_url, source_type and verification status. */
  for (const draft of await buildHoursDrafts()) drafts.push(draft);

  return drafts;
}

const HOURS_TITLE_PREFIX = "Operating hours — ";

/** Current (effective today) hours summaries, one chunk per entity. */
async function buildHoursDrafts(): Promise<ChunkDraft[]> {
  const drafts: ChunkDraft[] = [];
  const { rows } = await query<{
    heritage_id: string;
    name: string;
    day_of_week: number;
    open_time: string | null;
    close_time: string | null;
    is_closed: boolean;
    is_24_hours: boolean;
    schedule_status: string;
    verification_status: string;
    source_type: string;
    source_url: string | null;
    special_note: string | null;
  }>(
    `SELECT h.heritage_id, he.name, h.day_of_week,
            h.open_time::text AS open_time, h.close_time::text AS close_time,
            h.is_closed, h.is_24_hours, h.schedule_status, h.verification_status,
            h.source_type, h.source_url, h.special_note
       FROM heritage_operating_hours h
       JOIN heritage_entities he ON he.id = h.heritage_id
      WHERE (h.effective_from IS NULL OR h.effective_from <= CURRENT_DATE)
        AND (h.effective_until IS NULL OR h.effective_until >= CURRENT_DATE)
      ORDER BY he.name, h.day_of_week`
  );

  const byEntity = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byEntity.get(row.heritage_id) || [];
    list.push(row);
    byEntity.set(row.heritage_id, list);
  }

  const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const STATUS_PRIORITY = ["CONFLICT", "DEMO", "ASTROVA_ESTIMATE", "VERIFIED"];

  for (const [heritageId, list] of byEntity) {
    const name = list[0].name;
    const status =
      STATUS_PRIORITY.find((s) => list.some((r) => r.schedule_status === s)) || "VERIFIED";
    const sourceUrl = list.find((r) => r.source_url)?.source_url ?? null;
    const sourceType = list[0].source_type;
    const note = list.find((r) => r.special_note)?.special_note ?? null;

    // Group days that share one window: {Mon–Fri: 09:00–17:00, Sat: closed}
    const groups = new Map<string, number[]>();
    for (const r of list) {
      const window = r.is_closed
        ? "closed"
        : r.is_24_hours
          ? "open 24 hours"
          : `${(r.open_time || "").slice(0, 5)}–${(r.close_time || "").slice(0, 5)}`;
      const days = groups.get(window) || [];
      days.push(r.day_of_week);
      groups.set(window, days);
    }
    const dayLines = [...groups.entries()]
      .map(([window, days]) => {
        const sorted = [...days].sort((a, b) => a - b);
        const label =
          sorted.length === 7 && window !== "closed"
            ? "Daily"
            : sorted.map((d) => DAY_ABBR[d]).join(", ");
        return `${label}: ${window}`;
      })
      .join("; ");

    const honesty =
      status === "CONFLICT"
        ? "Published sources disagree (CONFLICT): present this as a conflict and do not state a single schedule."
        : status === "DEMO"
          ? "This is DEMO data (Astrova demo dataset) — never describe it as verified."
          : status === "ASTROVA_ESTIMATE"
            ? "The clock times are Astrova estimates, not official times."
            : "The schedule is VERIFIED against the cited source.";

    const statusLead =
      status === "CONFLICT"
        ? "CONFLICT — published sources disagree"
        : status === "DEMO"
          ? "DEMO — demo data, not verified"
          : status === "ASTROVA_ESTIMATE"
            ? "ASTROVA ESTIMATE — approximate times"
            : "VERIFIED";

    const content = [
      `${name} operating hours (${statusLead}): ${dayLines}.`,
      note ? `Note: ${note}` : null,
      `Provenance: schedule status ${status}, source type ${sourceType}${sourceUrl ? `, source ${sourceUrl}` : ""}.`,
      honesty,
    ]
      .filter(Boolean)
      .join("\n");

    const verificationStatus: ChunkDraft["verificationStatus"] =
      status === "VERIFIED" ? "VERIFIED" : "UNVERIFIED";

    drafts.push({
      title: `${HOURS_TITLE_PREFIX}${name}`,
      content,
      contentHash: hashContent("en", content),
      language: "en",
      authorityTier: tierForSourceType(sourceType),
      license: null,
      sourceUrl,
      sourceType,
      verificationStatus,
      sourceId: null,
      heritageId,
      knowledgeId: null,
      chunkIndex: 0,
    });
  }

  return drafts;
}

/* ---- Ingestion ---- */

export interface IngestReport {
  status: "COMPLETED" | "FAILED";
  model: string;
  dimensions: number;
  chunksSeen: number;
  chunksInserted: number;
  chunksUpdated: number;
  chunksSkipped: number;
  chunksRemoved: number;
  error: string | null;
  elapsedMs: number;
}

export async function ingestKnowledge(options: { embed?: boolean } = {}): Promise<IngestReport> {
  const started = Date.now();
  const provider = getEmbeddingProvider();
  const report: IngestReport = {
    status: "COMPLETED",
    model: provider.model,
    dimensions: provider.dimensions,
    chunksSeen: 0,
    chunksInserted: 0,
    chunksUpdated: 0,
    chunksSkipped: 0,
    chunksRemoved: 0,
    error: null,
    elapsedMs: 0,
  };

  const run = await query<{ id: string }>(
    `INSERT INTO rag_ingest_runs (model, status) VALUES ($1, 'RUNNING') RETURNING id`,
    [provider.model]
  );
  const runId = run.rows[0].id;

  try {
    if (provider.dimensions !== DEFAULT_DIMENSIONS) {
      throw new Error(
        `embedding dimensions ${provider.dimensions} do not match rag_chunks vector(${DEFAULT_DIMENSIONS})`
      );
    }

    const drafts = await buildDrafts();
    report.chunksSeen = drafts.length;

    const { rows: existing } = await query<{ content_hash: string }>(
      `SELECT content_hash FROM rag_chunks`
    );
    const known = new Set(existing.map((r) => r.content_hash));
    const fresh = drafts.filter((d) => !known.has(d.contentHash));
    report.chunksSkipped = drafts.length - fresh.length;

    if (options.embed !== false && fresh.length > 0) {
      for (let i = 0; i < fresh.length; i += EMBED_BATCH) {
        const batch = fresh.slice(i, i + EMBED_BATCH);
        const vectors = await provider.embed(
          batch.map((d) => `${d.title}. ${d.content}`),
          "passage"
        );
        for (let j = 0; j < batch.length; j += 1) {
          const draft = batch[j];
          const vector = vectors[j];
          const res = await query<{ id: string }>(
            `INSERT INTO rag_chunks
               (source_id, heritage_id, knowledge_id, title, content, content_hash,
                language, authority_tier, license, source_url, source_type,
                verification_status, chunk_index, embedding, embedding_model)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::vector,$15)
             ON CONFLICT (content_hash) DO NOTHING
             RETURNING id`,
            [
              draft.sourceId,
              draft.heritageId,
              draft.knowledgeId,
              draft.title,
              draft.content,
              draft.contentHash,
              draft.language,
              draft.authorityTier,
              draft.license,
              draft.sourceUrl,
              draft.sourceType,
              draft.verificationStatus,
              draft.chunkIndex,
              vectorLiteral(vector),
              provider.model,
            ]          );
          if (res.rows.length > 0) report.chunksInserted += 1;
          else report.chunksSkipped += 1;
        }
      }
    }

    // Refresh provenance metadata for chunks already known (no re-embed).
    for (const draft of drafts) {
      if (known.has(draft.contentHash)) {
        const res = await query(
          `UPDATE rag_chunks
              SET title = $2, source_id = $3, heritage_id = $4, knowledge_id = $5,
                  authority_tier = $6, license = $7, source_url = $8,
                  source_type = $9, verification_status = $10, language = $11
            WHERE content_hash = $1
              AND (title IS DISTINCT FROM $2 OR source_id IS DISTINCT FROM $3
                   OR authority_tier IS DISTINCT FROM $6
                   OR verification_status IS DISTINCT FROM $9)`,
          [
            draft.contentHash,
            draft.title,
            draft.sourceId,
            draft.heritageId,
            draft.knowledgeId,
            draft.authorityTier,
            draft.license,
            draft.sourceUrl,
            draft.sourceType,
            draft.verificationStatus,
            draft.language,
          ]
        );
        report.chunksUpdated += res.rowCount ?? 0;
      }
    }

    // Phase 38: operating-hours summaries are DERIVED from
    // heritage_operating_hours, so a schedule change must remove the
    // outdated summary chunk instead of leaving a stale one behind.
    const hoursHashes = drafts
      .filter((d) => d.title.startsWith(HOURS_TITLE_PREFIX))
      .map((d) => d.contentHash);
    const stale = await query<{ id: string }>(
      `DELETE FROM rag_chunks
        WHERE title LIKE $2
          AND NOT (content_hash = ANY($1::text[]))
        RETURNING id`,
      [hoursHashes, `${HOURS_TITLE_PREFIX}%`]
    );
    report.chunksRemoved = stale.rows.length;

    report.elapsedMs = Date.now() - started;
    await query(
      `UPDATE rag_ingest_runs
          SET status = 'COMPLETED', chunks_seen = $2, chunks_inserted = $3,
              chunks_skipped = $4, finished_at = now()
        WHERE id = $1`,
      [runId, report.chunksSeen, report.chunksInserted, report.chunksSkipped]
    );
    return report;
  } catch (err) {
    const message =
      err instanceof EmbeddingUnavailableError
        ? err.message
        : (err as Error).message || "ingestion failed";
    report.status = "FAILED";
    report.error = message;
    report.elapsedMs = Date.now() - started;
    await query(
      `UPDATE rag_ingest_runs SET status = 'FAILED', error = $2, finished_at = now() WHERE id = $1`,
      [runId, message.slice(0, 500)]
    );
    return report;
  }
}

export function vectorLiteral(vector: number[]): string {
  return `[${vector.map((v) => (Number.isFinite(v) ? v : 0)).join(",")}]`;
}

export const RAG_MODEL = DEFAULT_MODEL;
