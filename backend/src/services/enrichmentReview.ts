/* ============================================
   Astrova — Enrichment Review Store
   (Phase 36 — Controlled Enrichment + Verification Workflow)
   ============================================

   Persists Wikidata enrichment proposals into enrichment_proposals
   (migration 032) so a human review workflow exists:

     EXTERNAL SOURCE → IDENTIFICATION → EXTRACTION → NORMALIZATION
       → FIELD VALIDATION → DUPLICATE DETECTION → CONFLICT DETECTION
       → PROVENANCE ATTACHMENT → REVIEW / APPROVAL → DATABASE

   Contract:
   - NEVER writes to heritage_entities. Approval marks a proposal
     VERIFIED as a reference record carrying provenance; curated
     entity fields are untouched by this module.
   - Upserts are guarded by the UNIQUE(entity_id, external_id, field,
     proposed_value) constraint: re-extraction refreshes conflicts and
     provenance but NEVER resets an existing VERIFIED/REJECTED decision.
   - All SQL is parameterized. reviewer_note / reviewed_by are
     admin-only and never included in public responses.
   - Duplicate scans only ever report "POSSIBLE DUPLICATE".
   ============================================ */

import { query } from "../database";
import type { EnrichmentResult } from "./enrichment";
import {
  PROPOSAL_FIELDS,
  validateProposalField,
  initialStatusFor,
  canTransition,
  scoreDuplicate,
  type ProposalStatus,
} from "./dataQuality";

export interface StoredProposal {
  [key: string]: unknown;
  id: string;
  entity_id: string;
  entity_name: string;
  entity_slug: string | null;
  external_id: string;
  field: string;
  proposed_value: string;
  current_value: string | null;
  source_name: string;
  source_url: string | null;
  license: string | null;
  conflicts: Array<{ type: string; detail: string }>;
  status: ProposalStatus;
  reviewer_note: string | null;
  retrieved_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

/* ---- Step 6/8: extraction → validation → persistence ---- */

export interface SyncSummary {
  inserted: number;
  refreshed: number;
  skipped: number;
  reasons: string[];
}

/**
 * Persist one entity's enrichment result as reviewable proposals.
 *
 * Guarded rules:
 * - Only whitelisted, validated fields are stored (Step: FIELD VALIDATION).
 * - Conflicted proposals start as CONFLICT, clean ones as PENDING_REVIEW.
 * - Existing rows keep their review status: VERIFIED/REJECTED decisions
 *   are never overwritten by re-extraction (no blind overwrite).
 * - The current Astrova value is captured for side-by-side review.
 */
export async function syncProposals(
  entityId: string,
  result: EnrichmentResult
): Promise<SyncSummary> {
  const summary: SyncSummary = { inserted: 0, refreshed: 0, skipped: 0, reasons: [] };

  if (result.status !== "matched" && result.status !== "matched_with_conflicts") {
    return summary;
  }
  const externalId = result.candidate?.wikidataId;
  if (!externalId) {
    summary.reasons.push("No external candidate identifier — nothing to persist.");
    return summary;
  }

  const initialStatus = initialStatusFor(result.conflicts.length);
  const conflictsJson = JSON.stringify(result.conflicts);

  for (const proposal of result.proposals) {
    // FIELD VALIDATION — malformed external data never reaches the table.
    const validation = validateProposalField(proposal.field, proposal.value);
    if (!validation.ok || validation.value === undefined) {
      summary.skipped++;
      summary.reasons.push(`${proposal.field}: ${validation.reason ?? "invalid"}`);
      continue;
    }
    if (!(PROPOSAL_FIELDS as readonly string[]).includes(proposal.field)) {
      summary.skipped++;
      continue;
    }

    try {
      const { rowCount } = await query(
        `INSERT INTO enrichment_proposals
           (entity_id, external_id, field, proposed_value, current_value,
            source_name, source_url, license, conflicts, status)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10
         WHERE NOT EXISTS (
           SELECT 1 FROM enrichment_proposals
           WHERE entity_id = $1 AND external_id = $2
             AND field = $3 AND proposed_value = $4
         )
         ON CONFLICT (entity_id, external_id, field, proposed_value) DO NOTHING`,
        [
          entityId,
          externalId,
          proposal.field,
          validation.value,
          await currentValueFor(entityId, proposal.field),
          proposal.provenance.source,
          proposal.provenance.sourceUrl,
          proposal.provenance.license,
          conflictsJson,
          initialStatus,
        ]
      );
      if (rowCount && rowCount > 0) {
        summary.inserted++;
      } else {
        // Row exists: refresh conflicts/provenance unless a human decided.
        const refreshed = await query(
          `UPDATE enrichment_proposals
              SET conflicts = $4::jsonb,
                  source_url = $5,
                  license = $6
            WHERE entity_id = $1 AND external_id = $2 AND field = $3
              AND proposed_value = $7
              AND status IN ('DRAFT', 'PENDING_REVIEW')
            RETURNING id`,
          [
            entityId,
            externalId,
            proposal.field,
            conflictsJson,
            proposal.provenance.sourceUrl,
            proposal.provenance.license,
            validation.value,
          ]
        );
        if (refreshed.rowCount && refreshed.rowCount > 0) summary.refreshed++;
        else summary.skipped++; // VERIFIED/REJECTED/CONFLICT rows keep their state
      }
    } catch (err) {
      summary.skipped++;
      summary.reasons.push(`${proposal.field}: ${(err as Error).message}`);
    }
  }
  return summary;
}

/** Astrova's current value for a proposed field (for review comparison). */
async function currentValueFor(entityId: string, field: string): Promise<string | null> {
  const columnByField: Record<string, string> = {
    description: "description",
  };
  const column = columnByField[field];
  if (!column) return null; // entity has no curated column for this field
  const { rows } = await query<{ value: string | null }>(
    `SELECT ${column} AS value FROM heritage_entities WHERE id = $1`,
    [entityId]
  );
  return rows[0]?.value ?? null;
}

/* ---- Step 10: admin listing ---- */

export interface ListOptions {
  status?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
}

export async function listProposals(
  opts: ListOptions = {}
): Promise<{ rows: StoredProposal[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.status && (["DRAFT", "PENDING_REVIEW", "VERIFIED", "REJECTED", "CONFLICT"] as const).includes(opts.status as ProposalStatus)) {
    params.push(opts.status);
    conditions.push(`p.status = $${params.length}`);
  }
  if (opts.entityId) {
    params.push(opts.entityId);
    conditions.push(`p.entity_id = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  params.push(limit, offset);
  const { rows } = await query<StoredProposal>(
    `SELECT p.id, p.entity_id, he.name AS entity_name, he.slug AS entity_slug,
            p.external_id, p.field, p.proposed_value, p.current_value,
            p.source_name, p.source_url, p.license, p.conflicts, p.status,
            p.reviewer_note, p.retrieved_at, p.reviewed_at, p.reviewed_by,
            p.created_at, p.updated_at
       FROM enrichment_proposals p
       JOIN heritage_entities he ON he.id = p.entity_id
       ${where}
      ORDER BY p.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, params.length - 2);
  const countWhere = conditions.length
    ? `WHERE ${conditions.map((c) => c.replace(/\$\d+/g, (m) => m)).join(" AND ")}`
    : "";
  const total = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM enrichment_proposals p
     JOIN heritage_entities he ON he.id = p.entity_id ${countWhere}`,
    countParams
  );

  return { rows: rows as unknown as StoredProposal[], total: total.rows[0]?.n ?? rows.length };
}

/* ---- Step 14: review transitions ---- */

export interface ReviewAction {
  proposalId: string;
  action: "verify" | "reject" | "reopen";
  reviewer: string;
  note?: string;
}

export interface ReviewResult {
  ok: boolean;
  status?: ProposalStatus;
  error?: string;
}

const ACTION_TARGET: Record<ReviewAction["action"], ProposalStatus> = {
  verify: "VERIFIED",
  reject: "REJECTED",
  reopen: "PENDING_REVIEW",
};

/**
 * Apply a review decision with transition validation.
 * Approval is reference-only: it never touches heritage_entities.
 */
export async function reviewProposal(action: ReviewAction): Promise<ReviewResult> {
  const target = ACTION_TARGET[action.action];
  if (!target) return { ok: false, error: "Unknown review action." };

  const { rows } = await query<{ status: ProposalStatus }>(
    `SELECT status FROM enrichment_proposals WHERE id = $1`,
    [action.proposalId]
  );
  if (rows.length === 0) return { ok: false, error: "Proposal not found." };

  const current = rows[0].status;
  if (current === target) {
    return { ok: true, status: current }; // idempotent no-op
  }
  if (!canTransition(current, target)) {
    return { ok: false, error: `Cannot move from ${current} to ${target}.` };
  }

  const note = action.note?.trim().slice(0, 1000) || null;
  const updated = await query<{ status: ProposalStatus }>(
    `UPDATE enrichment_proposals
        SET status = $2,
            reviewer_note = CASE WHEN $3::text IS NULL THEN reviewer_note ELSE $3 END,
            reviewed_by = $4,
            reviewed_at = now()
      WHERE id = $1
      RETURNING status`,
    [action.proposalId, target, note, action.reviewer]
  );
  if (updated.rows.length === 0) return { ok: false, error: "Proposal not found." };
  return { ok: true, status: updated.rows[0].status };
}

/* ---- Step 15: public annotation (safe projection) ---- */

export interface PublicProposalReview {
  status: "PENDING_REVIEW" | "VERIFIED" | "CONFLICT" | "REJECTED";
  reviewedAt: string | null;
}

/**
 * Review annotations for one entity, keyed by external_id|field|value.
 * Includes REJECTED rows so callers can hide them explicitly; never
 * returns reviewer notes or reviewer identity.
 */
export async function publicReviewFor(
  entityId: string
): Promise<Map<string, PublicProposalReview>> {
  const { rows } = await query<{
    external_id: string;
    field: string;
    proposed_value: string;
    status: ProposalStatus;
    reviewed_at: string | null;
  }>(
    `SELECT external_id, field, proposed_value, status, reviewed_at
       FROM enrichment_proposals
      WHERE entity_id = $1 AND status <> 'DRAFT'`,
    [entityId]
  );
  const map = new Map<string, PublicProposalReview>();
  for (const row of rows) {
    map.set(`${row.external_id}|${row.field}|${row.proposed_value}`, {
      status: row.status as PublicProposalReview["status"],
      reviewedAt: row.reviewed_at,
    });
  }
  return map;
}

/* ---- Step 9: duplicate scan across the corpus ---- */

export interface PossibleDuplicate {
  a: { id: string; name: string; slug: string | null };
  b: { id: string; name: string; slug: string | null };
  score: number;
  reasons: string[];
}

/**
 * Scan heritage_entities pairwise (O(n²) is fine at n=96) and return
 * only POSSIBLE DUPLICATE flags above threshold. Never merges, never
 * deletes — reporting for human review only.
 */
export async function scanPossibleDuplicates(
  threshold?: number
): Promise<{ pairs: PossibleDuplicate[]; scanned: number }> {
  const { rows } = await query<{
    id: string;
    name: string;
    slug: string | null;
    category: string | null;
    state: string | null;
    latitude: number | null;
    longitude: number | null;
  }>(
    `SELECT he.id, he.name, he.slug, he.category, l.state,
            l.latitude, l.longitude
       FROM heritage_entities he
       LEFT JOIN locations l ON he.location_id = l.id`
  );

  const pairs: PossibleDuplicate[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const verdict = scoreDuplicate(rows[i], rows[j]);
      const limit = threshold ?? 0.75;
      if (verdict.verdict === "POSSIBLE DUPLICATE" && verdict.score >= limit) {
        pairs.push({
          a: { id: rows[i].id, name: rows[i].name, slug: rows[i].slug },
          b: { id: rows[j].id, name: rows[j].name, slug: rows[j].slug },
          score: verdict.score,
          reasons: verdict.reasons,
        });
      }
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  return { pairs, scanned: rows.length };
}
