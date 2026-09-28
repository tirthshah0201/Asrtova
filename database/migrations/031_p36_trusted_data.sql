-- ============================================
-- Astrova Phase 36 — Trusted Heritage Data Refinement
-- ============================================
-- 1. Deterministic slug remediation for the 22 migration-030
--    entities (pre-audited: 22/22 collision-free, ASCII-clean,
--    matching the existing lowercase-hyphen naming convention).
--    Every UPDATE is guarded: only fills NULL slugs, and refuses
--    to write a slug that already exists on another row.
-- 2. Source provenance columns: authority_tier (Step-4 hierarchy),
--    license, verified_date.
-- 3. Provenance backfill for all 22 registered sources.
-- 4. Adds the verified canonical URL for the UNESCO World Heritage
--    List (HTTP 200 checked during the Phase 36 audit).
-- 5. Registers Wikidata (CC0) as a Tier-3 open dataset source so
--    enrichment proposals carry durable attribution.
-- ============================================

-- ---- 1. Slug remediation (22 records, deterministic) ----

UPDATE heritage_entities SET slug = 'charminar'
 WHERE slug IS NULL AND name = 'Charminar'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'charminar');
UPDATE heritage_entities SET slug = 'dwarkadhish-temple'
 WHERE slug IS NULL AND name = 'Dwarkadhish Temple'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'dwarkadhish-temple');
UPDATE heritage_entities SET slug = 'gateway-of-india'
 WHERE slug IS NULL AND name = 'Gateway of India'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'gateway-of-india');
UPDATE heritage_entities SET slug = 'kamakhya-temple'
 WHERE slug IS NULL AND name = 'Kamakhya Temple'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'kamakhya-temple');
UPDATE heritage_entities SET slug = 'mahabodhi-temple'
 WHERE slug IS NULL AND name = 'Mahabodhi Temple'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'mahabodhi-temple');
UPDATE heritage_entities SET slug = 'shore-temple'
 WHERE slug IS NULL AND name = 'Shore Temple'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'shore-temple');
UPDATE heritage_entities SET slug = 'victoria-memorial'
 WHERE slug IS NULL AND name = 'Victoria Memorial'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'victoria-memorial');
UPDATE heritage_entities SET slug = 'virupaksha-temple'
 WHERE slug IS NULL AND name = 'Virupaksha Temple'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'virupaksha-temple');
UPDATE heritage_entities SET slug = 'buddhist-chanting-of-ladakh'
 WHERE slug IS NULL AND name = 'Buddhist Chanting of Ladakh'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'buddhist-chanting-of-ladakh');
UPDATE heritage_entities SET slug = 'chhau-dance'
 WHERE slug IS NULL AND name = 'Chhau Dance'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'chhau-dance');
UPDATE heritage_entities SET slug = 'deepavali'
 WHERE slug IS NULL AND name = 'Deepavali'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'deepavali');
UPDATE heritage_entities SET slug = 'durga-puja'
 WHERE slug IS NULL AND name = 'Durga Puja'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'durga-puja');
UPDATE heritage_entities SET slug = 'kalbelia'
 WHERE slug IS NULL AND name = 'Kalbelia'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'kalbelia');
UPDATE heritage_entities SET slug = 'kumbh-mela'
 WHERE slug IS NULL AND name = 'Kumbh Mela'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'kumbh-mela');
UPDATE heritage_entities SET slug = 'kutiyattam'
 WHERE slug IS NULL AND name = 'Kutiyattam'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'kutiyattam');
UPDATE heritage_entities SET slug = 'mudiyettu'
 WHERE slug IS NULL AND name = 'Mudiyettu'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'mudiyettu');
UPDATE heritage_entities SET slug = 'navroz'
 WHERE slug IS NULL AND name = 'Navroz'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'navroz');
UPDATE heritage_entities SET slug = 'ramlila'
 WHERE slug IS NULL AND name = 'Ramlila'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'ramlila');
UPDATE heritage_entities SET slug = 'sankirtana'
 WHERE slug IS NULL AND name = 'Sankirtana'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'sankirtana');
UPDATE heritage_entities SET slug = 'thathera-brass-craft'
 WHERE slug IS NULL AND name = 'Thathera Brass Craft'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'thathera-brass-craft');
UPDATE heritage_entities SET slug = 'vedic-chanting'
 WHERE slug IS NULL AND name = 'Vedic Chanting'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'vedic-chanting');
UPDATE heritage_entities SET slug = 'yoga'
 WHERE slug IS NULL AND name = 'Yoga'
   AND NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.slug = 'yoga');

-- ---- 2. Source provenance columns ----

ALTER TABLE sources ADD COLUMN IF NOT EXISTS authority_tier smallint;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS license text;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS verified_date date;

-- ---- 3. Provenance backfill ----

-- Authority tiers (Phase 36 trusted-source hierarchy):
--   Tier 1 — ASI, Ministry of Culture / Indian Culture Portal,
--            UNESCO World Heritage Centre, UNESCO Intangible
--            Cultural Heritage, National Archives of India,
--            official State/UT culture/tourism/heritage departments
--   Tier 2 — recognized institutional / open heritage datasets
--   Tier 3 — Wikidata, Wikimedia Commons
--   Tier 4 — OpenStreetMap (geographic information only; not a sources row)
--   Tier 5 — Astrova-derived estimates (the 18 source-less curated records)
UPDATE sources SET authority_tier = 1 WHERE title IN (
  'Archaeological Survey of India',
  'Indian Culture Portal',
  'Incredible India',
  'National Archives of India',
  'UNESCO World Heritage List',
  'UNESCO Intangible Cultural Heritage',
  'Assam Tourism', 'Delhi Tourism', 'Goa Tourism', 'Gujarat Tourism',
  'Kashmir Tourism', 'Kerala Tourism', 'Madhya Pradesh Tourism',
  'Maharashtra Tourism', 'Odisha Tourism', 'Punjab Tourism',
  'Rajasthan Tourism', 'Tamil Nadu Tourism'
);
UPDATE sources SET authority_tier = 2 WHERE title IN (
  'Gandhi Ashram Trust',
  'Shiromani Gurdwara Parbandhak Committee',
  'Satkosia Tiger Reserve Authority',
  'Geographical Indications Registry'
);
UPDATE sources SET authority_tier = 3 WHERE source_type = 'OPEN_DATASET';

-- License / terms labels (conservative, human-readable descriptors;
-- open-data licenses live in providers.ts for the API providers).
UPDATE sources SET license = '© UNESCO — terms of use apply'
 WHERE source_type = 'UNESCO' AND license IS NULL;
UPDATE sources SET license = 'Government terms of use — attribution required'
 WHERE source_type IN ('GOVERNMENT', 'TOURISM', 'ASI', 'ARCHIVE') AND license IS NULL;
UPDATE sources SET license = 'Institutional terms of use — attribution required'
 WHERE source_type = 'CULTURAL_INSTITUTION' AND license IS NULL;
UPDATE sources SET license = 'CC0 1.0' WHERE source_type = 'OPEN_DATASET' AND license IS NULL;

-- Verified date: the Phase 36 audit verified registration, status,
-- tier and (where present) URL reachability for every source on
-- 2026-09-27. National Archives of India is excluded because its
-- URL did not resolve from the audit environment and needs re-check.
UPDATE sources SET verified_date = DATE '2026-09-27'
 WHERE verified_date IS NULL
   AND title <> 'National Archives of India';

-- ---- 4. Verified canonical URL for the UNESCO World Heritage List ----
-- https://whc.unesco.org/en/list/ returned HTTP 200 during the audit.
UPDATE sources SET url = 'https://whc.unesco.org/en/list/'
 WHERE title = 'UNESCO World Heritage List'
   AND (url IS NULL OR url = '');

-- ---- 5. Wikidata as a registered Tier-3 open dataset source ----
-- Extend the source_type vocabulary with OPEN_DATASET (additive;
-- existing values unchanged).
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_source_type_check;
ALTER TABLE sources ADD CONSTRAINT sources_source_type_check CHECK (source_type IN (
  'OFFICIAL', 'GOVERNMENT', 'UNESCO', 'ASI', 'TOURISM', 'ACADEMIC',
  'MUSEUM', 'ARCHIVE', 'NEWS', 'CULTURAL_INSTITUTION', 'OPEN_DATASET', 'OTHER'
));

INSERT INTO sources (title, source_type, verification_status, publisher, url, license, authority_tier, retrieved_date, verified_date, notes)
VALUES (
  'Wikidata', 'OPEN_DATASET', 'REVIEWED', 'Wikimedia Foundation',
  'https://www.wikidata.org/', 'CC0 1.0', 3, DATE '2026-09-27', DATE '2026-09-27',
  'Structured open knowledge base used only for controlled enrichment proposals. Proposed facts are shown for human review and are never merged into Astrova records automatically.'
)
ON CONFLICT DO NOTHING;
