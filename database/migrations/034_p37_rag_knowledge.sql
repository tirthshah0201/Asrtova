-- ============================================================
-- Phase 37 — RAG knowledge base (pgvector) + retrieval audit
-- ============================================================
-- Decisions (documented, per Phase 37 Parts I and J):
--   * `chatbot_knowledge` (107 rows, state/heritage structured facts) is
--     NOT altered. It cannot carry embedding/provenance-chunk metadata
--     without corrupting the existing chatbot infrastructure, so RAG uses
--     a NEW chunk model that ingests FROM it (and from heritage/source
--     records) with full provenance.
--   * Vector search uses PostgreSQL pgvector inside the same Neon
--     database — no separate vector database.
--   * Dimension is 384 because the selected model is
--     Xenova/multilingual-e5-small (verified: outputs 384-dim vectors).
--     The model is recorded per chunk in embedding_model so a future
--     model change is visible rather than silently incompatible.
-- ============================================================

-- pgvector extension (0.8.6 already present on this Neon branch).
CREATE EXTENSION IF NOT EXISTS vector;

-- ------------------------------------------------------------
-- 1. Knowledge chunks with provenance + embeddings
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rag_chunks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id           UUID REFERENCES sources(id) ON DELETE SET NULL,
  heritage_id         UUID REFERENCES heritage_entities(id) ON DELETE CASCADE,
  knowledge_id        UUID REFERENCES chatbot_knowledge(id) ON DELETE SET NULL,
  title               TEXT NOT NULL CHECK (length(trim(title)) > 0),
  content             TEXT NOT NULL CHECK (length(trim(content)) > 0),
  content_hash        TEXT NOT NULL UNIQUE,   -- sha256 hex → duplicate prevention
  language            TEXT NOT NULL DEFAULT 'en'
                      CHECK (language IN ('en','hi','gu','mr','ta','pa')),
  authority_tier      SMALLINT CHECK (authority_tier BETWEEN 1 AND 5),
  license             TEXT,
  source_url          TEXT,
  source_type         TEXT NOT NULL DEFAULT 'OPEN_DATASET'
                      CHECK (source_type IN (
                        'OFFICIAL','GOVERNMENT','UNESCO','ASI','TOURISM','ACADEMIC',
                        'MUSEUM','ARCHIVE','NEWS','CULTURAL_INSTITUTION',
                        'OPEN_DATASET','OTHER','DEMO','ASTROVA_DERIVED')),
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
                      CHECK (verification_status IN ('UNVERIFIED','REVIEWED','VERIFIED')),
  chunk_index         SMALLINT NOT NULL DEFAULT 0 CHECK (chunk_index >= 0),
  embedding           vector(384),
  embedding_model     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rag_chunks_source_url_http
    CHECK (source_url IS NULL OR source_url ~* '^https?://'),
  CONSTRAINT rag_chunks_never_from_rejected
    -- rejected enrichment may never enter the knowledge base
    CHECK (verification_status <> 'REJECTED')
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_language   ON rag_chunks (language);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_heritage   ON rag_chunks (heritage_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_tier       ON rag_chunks (authority_tier);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_verif      ON rag_chunks (verification_status);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_source     ON rag_chunks (source_id);

-- Cosine-similarity ANN index for vector retrieval.
CREATE INDEX IF NOT EXISTS idx_rag_chunks_embedding
  ON rag_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE OR REPLACE FUNCTION touch_rag_chunks() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rag_chunks_touch ON rag_chunks;
CREATE TRIGGER trg_rag_chunks_touch
  BEFORE UPDATE ON rag_chunks
  FOR EACH ROW EXECUTE FUNCTION touch_rag_chunks();

-- ------------------------------------------------------------
-- 2. Retrieval context kept SEPARATE from conversation rows
--    (conversation_messages stays as-is; we never store full documents
--     in a conversation row — only the chunk references + scores here.)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rag_retrievals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  chunk_id        UUID REFERENCES rag_chunks(id) ON DELETE SET NULL,
  query_text      TEXT,
  language        TEXT,
  score           REAL,
  rank_position   SMALLINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rag_retrievals_conversation
  ON rag_retrievals (conversation_id);

-- ------------------------------------------------------------
-- 3. Ingestion runs (admin visibility, no secrets stored)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rag_ingest_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model           TEXT,
  chunks_seen     INTEGER NOT NULL DEFAULT 0,
  chunks_inserted INTEGER NOT NULL DEFAULT 0,
  chunks_skipped  INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'RUNNING'
                  CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
  error           TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ
);
