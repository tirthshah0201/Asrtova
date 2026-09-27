/* ========================================
   Astrova — Heritage Enrichment (Feature H, PARTIAL)
   ========================================

   Implements the safe half of the trusted-source pipeline:

     External source → Extract → Normalize → Duplicate detection
                     → Conflict detection → [Verification/Approval = DEFERRED]

   Design constraints (Phase 6):
   - NEVER writes to heritage_entities. Astrova data is never overwritten by
     an external source in this phase; the pipeline stops before "Approval"
     and the report documents that honestly as PARTIAL.
   - Every proposal carries full provenance: source name, source URL,
     license, retrieved_at. Nothing is presented as verified Astrova data.
   - Duplicate detection: an external record that maps to an entity we
     already track (same Wikidata QID already linked, or same normalized
     name within a short distance) is reported as a duplicate, not merged.
   - Conflict detection: coordinate distance, label mismatch, and category
     disagreement are reported as conflicts for a human to review.
   - The match is scored; low-confidence matches are rejected outright so
     the UI never shows a dubious "reference" as fact.

   Provider: Wikidata (CC0 1.0) — open data, no API key, rate-limit polite.
   ======================================== */

import { WIKIDATA, fetchJson, isRecord, sourceEntry } from "./providers";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const REQUEST_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // Wikidata is stable; 24h is safe
const MAX_CACHE_ENTRIES = 200;
/** Beyond this distance an external record is a different place. */
export const CONFLICT_DISTANCE_KM = 5;
/** Label similarity below this rejects the match entirely. */
export const MIN_MATCH_SCORE = 0.55;

const USER_AGENT = "Astrova-Heritage-Platform/1.0 (heritage enrichment)";

export type EnrichmentStatus =
  | "matched"        // clean match, no conflicts
  | "matched_with_conflicts"
  | "duplicate"      // already represented in Astrova
  | "no_match"       // external source has nothing plausible
  | "unavailable";   // provider failed / timed out

export interface EnrichmentField {
  field: string;
  value: string;
  provenance: {
    source: string;
    sourceUrl: string;
    license: string;
    retrievedAt: string;
  };
}

export interface EnrichmentConflict {
  type: "distance" | "label" | "missing_coordinates";
  detail: string;
}

export interface EnrichmentResult {
  status: EnrichmentStatus;
  /** External candidate, present for matched/duplicate statuses. */
  candidate: {
    wikidataId: string;
    label: string;
    description: string | null;
    url: string;
    distanceFromEntityKm: number | null;
    matchScore: number;
  } | null;
  /** Proposed facts, each individually attributed. Never merged automatically. */
  proposals: EnrichmentField[];
  conflicts: EnrichmentConflict[];
  /** Set when the external record is already represented in Astrova. */
  duplicateOf: { reason: string } | null;
  sources: Array<{ name: string; type: string; url: string }>;
  meta: {
    generatedAt: string;
    provider: string;
    license: string;
    approvalStatus: "pending_review" | "not_applicable";
    note: string;
  };
}

interface WikidataSearchHit {
  id: string;
  label?: string;
  description?: string;
}

interface EntityInput {
  name: string;
  slug: string;
  wikidataId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

const cache = new Map<string, { result: EnrichmentResult; expiresAt: number }>();

/* ---- Normalize helpers (exported for unit tests) ---- */

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Token-overlap similarity in [0,1]: |intersection| / |union| of words,
 * boosted to 1.0 when one normalized label contains the other (handles
 * "Amber Fort" vs "Amber Fort, Jaipur").
 */
export function labelSimilarity(a: string, b: string): number {
  const na = normalizeLabel(a);
  const nb = normalizeLabel(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer = Math.max(na.length, nb.length);
    return Math.max(0.7, shorter / longer);
  }
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  const intersection = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Great-circle distance; returns null when either coordinate is missing. */
export function coordinateDistanceKm(
  lat1: number | null | undefined,
  lon1: number | null | undefined,
  lat2: number | null | undefined,
  lon2: number | null | undefined
): number | null {
  if (
    lat1 == null || lon1 == null || lat2 == null || lon2 == null ||
    !Number.isFinite(Number(lat1)) || !Number.isFinite(Number(lon1)) ||
    !Number.isFinite(Number(lat2)) || !Number.isFinite(Number(lon2))
  ) {
    return null;
  }
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(Number(lat2) - Number(lat1));
  const dLon = toRad(Number(lon2) - Number(lon1));
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(Number(lat1))) *
      Math.cos(toRad(Number(lat2))) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Extract a year from a Wikidata time value like "+1592-00-00T00:00:00Z". */
export function parseWikidataYear(time: unknown): string | null {
  if (typeof time !== "string") return null;
  const match = time.match(/^([+-]?\d{1,6})-/);
  if (!match) return null;
  const year = Number(match[1]);
  if (!Number.isFinite(year)) return null;
  return year < 0 ? `${Math.abs(year)} BCE` : String(year);
}

/* ---- Provider calls ---- */

async function searchWikidata(name: string): Promise<WikidataSearchHit[]> {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: name,
    language: "en",
    type: "item",
    limit: "5",
    format: "json",
  });
  const payload = await fetchJson<unknown>(`${WIKIDATA_API}?${params}`, {
    timeoutMs: REQUEST_TIMEOUT_MS,
    headers: { "User-Agent": USER_AGENT },
  });
  if (!isRecord(payload) || !Array.isArray(payload.search)) return [];
  return (payload.search as unknown[])
    .filter(isRecord)
    .map((hit) => ({
      id: String(hit.id ?? ""),
      label: typeof hit.label === "string" ? hit.label : undefined,
      description: typeof hit.description === "string" ? hit.description : undefined,
    }))
    .filter((hit) => hit.id.length > 0);
}

interface EntityDetails {
  label: string;
  description: string | null;
  coordinates: { lat: number; lon: number } | null;
  officialWebsite: string | null;
  inceptionYear: string | null;
  instanceOf: string | null;
}

async function fetchEntityDetails(qid: string): Promise<EntityDetails | null> {
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: qid,
    props: "labels|descriptions|claims",
    languages: "en",
    format: "json",
  });
  const payload = await fetchJson<unknown>(`${WIKIDATA_API}?${params}`, {
    timeoutMs: REQUEST_TIMEOUT_MS,
    headers: { "User-Agent": USER_AGENT },
  });
  if (!isRecord(payload) || !isRecord(payload.entities)) return null;
  const entity = payload.entities[qid];
  if (!isRecord(entity)) return null;

  const label = isRecord(entity.labels) && isRecord(entity.labels.en)
    ? String(entity.labels.en.value ?? "")
    : "";
  if (!label) return null;

  const description = isRecord(entity.descriptions) && isRecord(entity.descriptions.en)
    ? String(entity.descriptions.en.value ?? "")
    : null;

  const claims = isRecord(entity.claims) ? entity.claims : {};

  // P625 coordinates
  let coordinates: { lat: number; lon: number } | null = null;
  const coordClaim = Array.isArray(claims.P625) ? claims.P625[0] : null;
  if (isRecord(coordClaim)) {
    const snak = isRecord(coordClaim.mainsnak) ? coordClaim.mainsnak : null;
    const value = snak && isRecord(snak.datavalue) ? snak.datavalue.value : null;
    if (isRecord(value) && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude))) {
      coordinates = { lat: Number(value.latitude), lon: Number(value.longitude) };
    }
  }

  // P856 official website
  let officialWebsite: string | null = null;
  const siteClaim = Array.isArray(claims.P856) ? claims.P856[0] : null;
  if (isRecord(siteClaim)) {
    const snak = isRecord(siteClaim.mainsnak) ? siteClaim.mainsnak : null;
    const value = snak && isRecord(snak.datavalue) ? snak.datavalue.value : null;
    if (typeof value === "string" && /^https?:\/\//i.test(value)) {
      officialWebsite = value;
    }
  }

  // P571 inception
  let inceptionYear: string | null = null;
  const inceptionClaim = Array.isArray(claims.P571) ? claims.P571[0] : null;
  if (isRecord(inceptionClaim)) {
    const snak = isRecord(inceptionClaim.mainsnak) ? inceptionClaim.mainsnak : null;
    const value = snak && isRecord(snak.datavalue) ? snak.datavalue.value : null;
    if (isRecord(value)) inceptionYear = parseWikidataYear(value.time);
  }

  // P31 instance-of (QID only — resolved labels would need another call)
  let instanceOf: string | null = null;
  const instanceClaim = Array.isArray(claims.P31) ? claims.P31[0] : null;
  if (isRecord(instanceClaim)) {
    const snak = isRecord(instanceClaim.mainsnak) ? instanceClaim.mainsnak : null;
    const value = snak && isRecord(snak.datavalue) ? snak.datavalue.value : null;
    if (isRecord(value) && typeof value.id === "string") instanceOf = value.id;
  }

  return { label, description, coordinates, officialWebsite, inceptionYear, instanceOf };
}

/* ---- Pipeline ---- */

/**
 * Extract → normalize → duplicate-detect → conflict-detect for one entity.
 * Never throws for provider problems: returns status "unavailable".
 */
export async function getEnrichment(entity: EntityInput): Promise<EnrichmentResult> {
  const cacheKey = `${entity.slug}:${entity.wikidataId ?? ""}:${entity.latitude ?? ""}:${entity.longitude ?? ""}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const baseSources = [sourceEntry(WIKIDATA, "structured open heritage reference (CC0)")];
  const retrievedAt = new Date().toISOString();
  const metaNote =
    "Proposals are extracted from Wikidata and shown for review. Astrova does not merge external facts automatically — verification and approval remain a manual step in this phase.";

  const build = (
    status: EnrichmentStatus,
    candidate: EnrichmentResult["candidate"],
    proposals: EnrichmentField[],
    conflicts: EnrichmentConflict[],
    duplicateOf: EnrichmentResult["duplicateOf"]
  ): EnrichmentResult => ({
    status,
    candidate,
    proposals,
    conflicts,
    duplicateOf,
    sources: baseSources,
    meta: {
      generatedAt: retrievedAt,
      provider: WIKIDATA.name,
      license: WIKIDATA.license,
      approvalStatus:
        status === "matched" || status === "matched_with_conflicts"
          ? "pending_review"
          : "not_applicable",
      note: metaNote,
    },
  });

  let hits: WikidataSearchHit[];
  try {
    hits = await searchWikidata(entity.name);
  } catch (error) {
    console.error("[Enrichment] Wikidata search failed:", String(error));
    return build("unavailable", null, [], [
      { type: "missing_coordinates", detail: "External reference service is temporarily unavailable." },
    ], null);
  }
  if (hits.length === 0) {
    return build("no_match", null, [], [], null);
  }

  // Score every hit against the Astrova name; take the best.
  let best: { hit: WikidataSearchHit; score: number } | null = null;
  for (const hit of hits) {
    const score = labelSimilarity(entity.name, hit.label ?? "");
    if (!best || score > best.score) best = { hit, score };
  }
  if (!best || best.score < MIN_MATCH_SCORE) {
    return build("no_match", null, [], [
      { type: "label", detail: `Closest external label scored ${(best?.score ?? 0).toFixed(2)} — below the ${(MIN_MATCH_SCORE * 100).toFixed(0)}% confidence threshold.` },
    ], null);
  }

  let details: EntityDetails | null;
  try {
    details = await fetchEntityDetails(best.hit.id);
  } catch (error) {
    console.error("[Enrichment] Wikidata entity fetch failed:", String(error));
    return build("unavailable", null, [], [
      { type: "missing_coordinates", detail: "External reference service is temporarily unavailable." },
    ], null);
  }
  if (!details) {
    return build("no_match", null, [], [], null);
  }

  /* ---- Duplicate detection ---- */
  // The entity already stores this exact Wikidata QID → duplicate.
  if (entity.wikidataId && entity.wikidataId === best.hit.id) {
    return build(
      "duplicate",
      null,
      [],
      [],
      { reason: `Astrova already links this entity to ${best.hit.id}.` }
    );
  }

  /* ---- Conflict detection ---- */
  const conflicts: EnrichmentConflict[] = [];
  const distanceKm = coordinateDistanceKm(
    entity.latitude,
    entity.longitude,
    details.coordinates?.lat,
    details.coordinates?.lon
  );
  if (distanceKm != null && distanceKm > CONFLICT_DISTANCE_KM) {
    const labelIsExact = Math.max(best.score, labelSimilarity(entity.name, details.label)) >= 0.95;
    conflicts.push({
      type: "distance",
      detail: labelIsExact
        ? `Labels match exactly but coordinates differ by ${distanceKm.toFixed(1)} km — Astrova stores city-level coordinates, so confirm which point of interest this reference describes before approving (threshold ${CONFLICT_DISTANCE_KM} km).`
        : `External coordinates are ${distanceKm.toFixed(1)} km from the Astrova location (threshold ${CONFLICT_DISTANCE_KM} km) — likely a different place with a similar name.`,
    });
  }
  if (details.coordinates == null && entity.latitude != null) {
    conflicts.push({
      type: "missing_coordinates",
      detail: "External record has no coordinates, so location agreement could not be confirmed.",
    });
  }
  const finalScore = Math.max(best.score, labelSimilarity(entity.name, details.label));

  // Hard reject: name similarity too low AND far away — do not surface.
  if (finalScore < MIN_MATCH_SCORE && distanceKm != null && distanceKm > CONFLICT_DISTANCE_KM) {
    return build(
      "no_match",
      null,
      [],
      conflicts,
      null
    );
  }

  const candidate: EnrichmentResult["candidate"] = {
    wikidataId: best.hit.id,
    label: details.label,
    description: details.description,
    url: `https://www.wikidata.org/wiki/${best.hit.id}`,
    distanceFromEntityKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
    matchScore: Math.round(finalScore * 100) / 100,
  };

  /* ---- Normalize → attributed proposals ---- */
  const provenance = {
    source: WIKIDATA.name,
    sourceUrl: candidate.url,
    license: WIKIDATA.license,
    retrievedAt,
  };
  const proposals: EnrichmentField[] = [];
  if (details.description) {
    proposals.push({ field: "description", value: details.description, provenance });
  }
  if (details.officialWebsite) {
    proposals.push({ field: "official_website", value: details.officialWebsite, provenance });
  }
  if (details.inceptionYear) {
    proposals.push({ field: "inception_year", value: details.inceptionYear, provenance });
  }
  if (details.coordinates) {
    proposals.push({
      field: "coordinates",
      value: `${details.coordinates.lat}, ${details.coordinates.lon}`,
      provenance,
    });
  }
  if (details.instanceOf) {
    proposals.push({ field: "instance_of", value: details.instanceOf, provenance });
  }

  const status: EnrichmentStatus =
    conflicts.length > 0 ? "matched_with_conflicts" : "matched";
  const result = build(status, candidate, proposals, conflicts, null);

  cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value as string);
  }
  return result;
}

export function clearEnrichmentCache(): void {
  cache.clear();
}
