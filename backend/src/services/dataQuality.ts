/* ============================================
   Astrova — Data Quality & Enrichment Governance
   (Phase 36 — Trusted Heritage Data Refinement)
   ============================================

   Pure functions only: no I/O, no network, no database.
   Everything here is unit-tested by
   backend/tests/test-data-quality.js.

   Responsibilities:
   - Trusted-source authority tier mapping (Step 4 hierarchy)
   - Enrichment proposal field whitelist + value validation
   - Review status transition rules (DRAFT → … → VERIFIED/REJECTED)
   - Duplicate scoring that reports POSSIBLE DUPLICATE only with
     enough evidence, and never merges anything
   - Slug safety checks used when remediating NULL slugs
   - Description quality checks (Step 11)

   Invariants:
   - Never fabricates a value; invalid input → null/reason, not guess.
   - Never resolves a conflict silently; conflicts map to CONFLICT
     ("CONFLICT REQUIRES REVIEW"), never to an automatic winner.
   ============================================ */

import { generateSlug, isValidSlug } from "../utils/slug";

/* ---- Authority tiers (Phase 36 trusted-source hierarchy) ---- */

export const AUTHORITY_TIERS = {
  /** ASI, Ministry of Culture / Indian Culture Portal, UNESCO WHC/ICH,
      National Archives of India, official State/UT departments */
  OFFICIAL: 1,
  /** Recognized institutional / open heritage datasets */
  INSTITUTIONAL: 2,
  /** Wikidata, Wikimedia Commons (Inheritage NOT integrated) */
  OPEN_REFERENCE: 3,
  /** OpenStreetMap — geographic information only, never historical */
  GEOGRAPHIC: 4,
  /** Astrova-derived estimates/calculations */
  ASTROVA_ESTIMATE: 5,
} as const;

const TIER1_SOURCE_TYPES = new Set([
  "OFFICIAL",
  "GOVERNMENT",
  "UNESCO",
  "ASI",
  "TOURISM",
  "ARCHIVE",
]);

const TIER2_SOURCE_TYPES = new Set([
  "ACADEMIC",
  "MUSEUM",
  "CULTURAL_INSTITUTION",
]);

/**
 * Map a sources.source_type value to an authority tier (1–5).
 * OPEN_DATASET → Tier 3; NEWS/OTHER → Tier 2 is NOT justified, so they
 * fall through to Tier 3 only for OPEN_DATASET and otherwise return null
 * (tier unassigned — callers must treat null as "no tier claimed").
 */
export function tierForSourceType(sourceType: string | null | undefined): number | null {
  if (!sourceType) return null;
  const st = sourceType.toUpperCase();
  if (st === "OPEN_DATASET") return AUTHORITY_TIERS.OPEN_REFERENCE;
  if (TIER1_SOURCE_TYPES.has(st)) return AUTHORITY_TIERS.OFFICIAL;
  if (TIER2_SOURCE_TYPES.has(st)) return AUTHORITY_TIERS.INSTITUTIONAL;
  return null;
}

/** Human label for a tier, used in API/UI copy. */
export function tierLabel(tier: number | null | undefined): string {
  switch (tier) {
    case 1: return "OFFICIAL";
    case 2: return "INSTITUTIONAL";
    case 3: return "OPEN DATASET";
    case 4: return "GEOGRAPHIC ONLY";
    case 5: return "ASTROVA ESTIMATE";
    default: return "UNRATED";
  }
}

/**
 * OSM is Tier 4: never a historical source. Guard used when a source is
 * being classified so OpenStreetMap can never be promoted to a
 * historical authority.
 */
export function isHistoricalAuthority(tier: number | null | undefined): boolean {
  return tier === 1 || tier === 2 || tier === 3;
}

/* ---- Proposal field whitelist & validation ---- */

export const PROPOSAL_FIELDS = [
  "description",
  "official_website",
  "inception_year",
  "coordinates",
  "instance_of",
] as const;

export type ProposalField = (typeof PROPOSAL_FIELDS)[number];

export interface ProposalValidation {
  ok: boolean;
  /** Normalized (trimmed) value when ok; undefined otherwise. */
  value?: string;
  reason?: string;
}

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_TEXT_LENGTH = 500;

/**
 * Validate one enrichment proposal field against its value.
 * Rejects malformed external data instead of storing it — the external
 * payload is never trusted blindly.
 */
export function validateProposalField(field: string, value: unknown): ProposalValidation {
  if (!(PROPOSAL_FIELDS as readonly string[]).includes(field)) {
    return { ok: false, reason: `Field "${field}" is not in the proposal whitelist.` };
  }
  if (typeof value !== "string") {
    return { ok: false, reason: "Value must be a string." };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, reason: "Value is empty." };
  }

  switch (field as ProposalField) {
    case "description": {
      if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
        return { ok: false, reason: `Description exceeds ${MAX_DESCRIPTION_LENGTH} characters.` };
      }
      // Strip any HTML-ish payload from external sources; plain text only.
      if (/<[a-z/][^>]*>/i.test(trimmed)) {
        return { ok: false, reason: "Description contains markup." };
      }
      return { ok: true, value: trimmed };
    }
    case "official_website": {
      let url: URL;
      try {
        url = new URL(trimmed);
      } catch {
        return { ok: false, reason: "Not a valid URL." };
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return { ok: false, reason: "Only http(s) URLs are allowed." };
      }
      if (trimmed.length > MAX_TEXT_LENGTH) {
        return { ok: false, reason: "URL too long." };
      }
      return { ok: true, value: trimmed };
    }
    case "inception_year": {
      // Accepts "1592", "300 BCE", "circa 1592"? — no: exact formats only,
      // because fuzzy external text must not masquerade as a date.
      if (/^\d{1,6}$/.test(trimmed)) return { ok: true, value: trimmed };
      if (/^\d{1,6}\s+BCE$/.test(trimmed)) return { ok: true, value: trimmed };
      return { ok: false, reason: "Year must be digits or digits + BCE." };
    }
    case "coordinates": {
      const match = trimmed.match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
      if (!match) return { ok: false, reason: 'Coordinates must be "lat, lon".' };
      const lat = Number(match[1]);
      const lon = Number(match[2]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return { ok: false, reason: "Coordinates are not finite numbers." };
      }
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return { ok: false, reason: "Coordinates out of range." };
      }
      // Null Island guard: never accept a proposal at exactly 0,0 —
      // that is the classic missing-data artifact, not a real location.
      if (lat === 0 && lon === 0) {
        return { ok: false, reason: "Null Island (0,0) is not a valid location." };
      }
      return { ok: true, value: `${lat}, ${lon}` };
    }
    case "instance_of": {
      if (!/^Q[1-9]\d{0,9}$/.test(trimmed)) {
        return { ok: false, reason: "Expected an external item identifier (QID)." };
      }
      return { ok: true, value: trimmed };
    }
  }
}

/* ---- Review status model ---- */

export const PROPOSAL_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "VERIFIED",
  "REJECTED",
  "CONFLICT",
] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/**
 * Allowed review transitions.
 * - VERIFIED ⇄ REJECTED is never a direct flip: a reviewer must first
 *   reopen the proposal to PENDING_REVIEW, so no decision is ever
 *   quietly overwritten.
 * - CONFLICT → VERIFIED/REJECTED is allowed: resolving a conflict IS
 *   the review action, and it is always an explicit human decision.
 * - Reopening is an explicit admin action, not an automatic reset.
 */
const TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> = {
  DRAFT: ["PENDING_REVIEW", "REJECTED"],
  PENDING_REVIEW: ["VERIFIED", "REJECTED", "CONFLICT"],
  CONFLICT: ["VERIFIED", "REJECTED", "PENDING_REVIEW"],
  VERIFIED: ["PENDING_REVIEW"],
  REJECTED: ["PENDING_REVIEW"],
};

export function canTransition(from: string, to: string): boolean {
  if (!(PROPOSAL_STATUSES as readonly string[]).includes(from)) return false;
  if (!(PROPOSAL_STATUSES as readonly string[]).includes(to)) return false;
  return TRANSITIONS[from as ProposalStatus].includes(to as ProposalStatus);
}

/**
 * Initial status for a freshly extracted proposal:
 * conflicts present → CONFLICT ("CONFLICT REQUIRES REVIEW"),
 * otherwise → PENDING_REVIEW. Never auto-VERIFIED.
 */
export function initialStatusFor(conflictCount: number): ProposalStatus {
  return conflictCount > 0 ? "CONFLICT" : "PENDING_REVIEW";
}

/* ---- Duplicate detection (Step 9) ---- */

export interface DuplicateCandidate {
  name: string;
  state?: string | null;
  category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface DuplicateVerdict {
  /** 0–1 composite score. */
  score: number;
  /** Only ever "POSSIBLE DUPLICATE" — nothing is called a confirmed
      duplicate and nothing is merged automatically. */
  verdict: "POSSIBLE DUPLICATE" | "UNLIKELY";
  reasons: string[];
}

/** Score above which evidence is strong enough to flag a possible duplicate. */
export const POSSIBLE_DUPLICATE_THRESHOLD = 0.75;

/** Lowercase, strip punctuation/diacritic marks, collapse whitespace. */
export function normalizeName(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Token Jaccard similarity with containment boost (mirrors enrichment.ts). */
function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) {
    return Math.max(0.7, Math.min(na.length, nb.length) / Math.max(na.length, nb.length));
  }
  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}

function haversineKm(a: DuplicateCandidate, b: DuplicateCandidate): number | null {
  if (
    a.latitude == null || a.longitude == null ||
    b.latitude == null || b.longitude == null ||
    !Number.isFinite(a.latitude) || !Number.isFinite(a.longitude) ||
    !Number.isFinite(b.latitude) || !Number.isFinite(b.longitude)
  ) return null;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Score two records for duplicate likelihood.
 *
 * Evidence weights:
 * - normalized name similarity  (dominant signal)
 * - same state                   (boost)
 * - same category                (small boost)
 * - coordinate proximity < 5 km  (boost); absence adds no score
 *
 * With insufficient evidence the verdict stays UNLIKELY — we would
 * rather miss a duplicate than merge two distinct heritage records.
 * The caller may only FLAG "POSSIBLE DUPLICATE" for human review;
 * automatic merging is forbidden by the pipeline contract.
 */
export function scoreDuplicate(a: DuplicateCandidate, b: DuplicateCandidate): DuplicateVerdict {
  const reasons: string[] = [];
  const sim = nameSimilarity(a.name, b.name);
  let score = sim * 0.7;
  if (sim >= 0.99) reasons.push("identical normalized names");
  else if (sim >= 0.7) reasons.push(`similar names (${Math.round(sim * 100)}%)`);

  const stateA = normalizeName(a.state);
  const stateB = normalizeName(b.state);
  if (stateA && stateB && stateA === stateB) {
    score += 0.1;
    reasons.push("same state");
  }

  const catA = normalizeName(a.category);
  const catB = normalizeName(b.category);
  if (catA && catB && catA === catB) {
    score += 0.05;
    reasons.push("same category");
  }

  const dist = haversineKm(a, b);
  if (dist != null) {
    if (dist < 5) {
      score += 0.15;
      reasons.push(`within ${dist.toFixed(1)} km`);
    } else if (dist > 100) {
      score -= 0.15;
      reasons.push(`${Math.round(dist)} km apart`);
    }
  }

  score = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  return {
    score,
    verdict: score >= POSSIBLE_DUPLICATE_THRESHOLD ? "POSSIBLE DUPLICATE" : "UNLIKELY",
    reasons,
  };
}

/* ---- Slug safety (Step 3 remediation guard) ---- */

export interface SlugSafety {
  ok: boolean;
  slug: string;
  reason?: string;
}

/**
 * Deterministically check whether a slug generated from `name` is safe
 * to write: valid format, non-empty, and not colliding with any slug
 * already in `existing` (excluding `excludeId` for self-comparison).
 * Returns ok:false with a reason instead of silently altering the slug
 * when editorial judgment would be required.
 */
export function safeSlugFor(
  name: string,
  existing: Set<string>,
  excludeId?: string
): SlugSafety {
  const slug = generateSlug(name);
  if (!slug) {
    return { ok: false, slug: "", reason: "Name produces no usable slug — needs editorial review." };
  }
  if (!isValidSlug(slug)) {
    return { ok: false, slug, reason: "Generated slug fails format validation." };
  }
  if (existing.has(slug)) {
    return { ok: false, slug, reason: `Collision with existing slug "${slug}" — needs editorial review.` };
  }
  void excludeId; // self-match handled by callers passing a pre-filtered set
  return { ok: true, slug };
}

/* ---- Description quality (Step 11) ---- */

const PLACEHOLDER_PATTERNS = /^(todo|tbd|lorem ipsum|placeholder|coming soon|test description|n\/?a)[.!]?$/i;

export interface DescriptionIssues {
  issues: string[];
  ok: boolean;
}

/**
 * Flag description quality problems without ever rewriting content.
 * Issues: EMPTY, TOO_SHORT (<40 chars), PLACEHOLDER, MALFORMED
 * (markup or >50 consecutive identical characters), and DUPLICATE is
 * detected separately across the corpus via findDuplicateDescriptions.
 */
export function describeIssues(description: string | null | undefined): DescriptionIssues {
  const issues: string[] = [];
  const text = (description ?? "").trim();
  if (!text) {
    issues.push("EMPTY");
    return { issues, ok: false };
  }
  if (text.length < 40) issues.push("TOO_SHORT");
  if (PLACEHOLDER_PATTERNS.test(text)) issues.push("PLACEHOLDER");
  if (/<[a-z/][^>]*>/i.test(text)) issues.push("MALFORMED");
  if (/(.)\1{50,}/.test(text)) issues.push("MALFORMED");
  return { issues, ok: issues.length === 0 };
}

/**
 * Find descriptions shared by more than one record (normalized for
 * comparison). Returns groups of ids; empty when all are distinct.
 */
export function findDuplicateDescriptions(
  rows: Array<{ id: string; description: string | null }>
): string[][] {
  const byText = new Map<string, string[]>();
  for (const row of rows) {
    const key = normalizeName(row.description);
    if (!key) continue;
    const bucket = byText.get(key) ?? [];
    bucket.push(row.id);
    byText.set(key, bucket);
  }
  return [...byText.values()].filter((ids) => ids.length > 1);
}
