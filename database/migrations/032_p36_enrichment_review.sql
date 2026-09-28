-- ============================================
-- Astrova Phase 36 — Controlled Enrichment Review
-- ============================================
-- Persists enrichment proposals so a human review/approval
-- workflow exists. Proposal lifecycle:
--
--   DRAFT            manually staged (reserved)
--   PENDING_REVIEW   extracted from an external source, awaiting review
--   CONFLICT         conflicts with existing Astrova data — REQUIRES REVIEW
--   VERIFIED         reviewed and approved as a verified reference
--   REJECTED         reviewed and dismissed
--
-- Approval never blindly overwrites curated Astrova fields: an
-- approved proposal becomes a verified reference record carrying
-- full provenance (source, URL, license, retrieved_at, reviewed_at).
-- Entity-column application, if ever enabled, must guard against
-- non-empty current values.
-- ============================================

CREATE TABLE IF NOT EXISTS enrichment_proposals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       uuid NOT NULL REFERENCES heritage_entities(id) ON DELETE CASCADE,
  external_id     text NOT NULL,             -- e.g. Wikidata QID
  field           text NOT NULL,             -- whitelist enforced in service layer
  proposed_value  text NOT NULL,
  current_value   text,                      -- Astrova's value at review time (null = missing)
  source_name     text NOT NULL,
  source_url      text,
  license          text,
  conflicts       jsonb NOT NULL DEFAULT '[]'::jsonb,
  status          text NOT NULL DEFAULT 'PENDING_REVIEW'
                  CHECK (status IN ('DRAFT','PENDING_REVIEW','VERIFIED','REJECTED','CONFLICT')),
  reviewer_note   text,                      -- admin-only; never exposed publicly
  retrieved_at    timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz,
  reviewed_by     text,                      -- admin email; never exposed publicly
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, external_id, field, proposed_value)
);

CREATE INDEX IF NOT EXISTS idx_enrichment_proposals_status
  ON enrichment_proposals (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enrichment_proposals_entity
  ON enrichment_proposals (entity_id);

-- Keep updated_at fresh without an application trigger dependency.
CREATE OR REPLACE FUNCTION touch_enrichment_proposals() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enrichment_proposals_touch ON enrichment_proposals;
CREATE TRIGGER trg_enrichment_proposals_touch
  BEFORE UPDATE ON enrichment_proposals
  FOR EACH ROW EXECUTE FUNCTION touch_enrichment_proposals();
