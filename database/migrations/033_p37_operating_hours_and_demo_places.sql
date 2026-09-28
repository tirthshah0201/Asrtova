-- ============================================================
-- Phase 37 — Heritage operating hours + controlled DEMO nearby data
-- ============================================================
-- Decisions (documented, per Phase 37 Part A):
--   * Weekly schedule is stored NORMALISED (one row per heritage + day)
--     rather than a JSON blob, so it can carry the existing provenance
--     columns (source_id / source_type / verification_status), be indexed
--     per day, and be validated with ordinary CHECK constraints.
--   * day_of_week uses PostgreSQL EXTRACT(DOW) semantics:
--     0 = Sunday … 6 = Saturday.
--   * Provenance vocabulary is reused from `sources`; 'DEMO' was added to
--     the new tables' own source_type CHECK (the `sources` table itself is
--     NOT altered — curated provenance is untouched).
--   * Nothing in heritage_entities is overwritten.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Per-location timezone (Part D — timezone handling)
--    India-wide default; future international locations set their own.
-- ------------------------------------------------------------
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'locations_timezone_not_empty'
  ) THEN
    ALTER TABLE locations
      ADD CONSTRAINT locations_timezone_not_empty
      CHECK (length(trim(timezone)) > 0);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Operating hours
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS heritage_operating_hours (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  heritage_id         UUID NOT NULL REFERENCES heritage_entities(id) ON DELETE CASCADE,
  day_of_week         SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun … 6=Sat
  open_time           TIME,
  close_time          TIME,
  is_closed           BOOLEAN NOT NULL DEFAULT FALSE,
  is_24_hours         BOOLEAN NOT NULL DEFAULT FALSE,
  special_note        TEXT,
  source_id           UUID REFERENCES sources(id) ON DELETE SET NULL,
  source_url          TEXT,
  source_type         TEXT NOT NULL DEFAULT 'DEMO'
                      CHECK (source_type IN (
                        'OFFICIAL','GOVERNMENT','UNESCO','ASI','TOURISM','ACADEMIC',
                        'MUSEUM','ARCHIVE','NEWS','CULTURAL_INSTITUTION',
                        'OPEN_DATASET','OTHER','DEMO')),
  schedule_status     TEXT NOT NULL DEFAULT 'DEMO'
                      CHECK (schedule_status IN
                        ('VERIFIED','DEMO','CONFLICT','ASTROVA_ESTIMATE')),
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
                      CHECK (verification_status IN
                        ('UNVERIFIED','REVIEWED','VERIFIED')),
  effective_from      DATE,
  effective_until     DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A day is either: closed, 24 hours, or an open→close window.
  CONSTRAINT hours_shape_valid CHECK (
    (is_closed AND NOT is_24_hours AND open_time IS NULL AND close_time IS NULL)
    OR (is_24_hours AND NOT is_closed AND open_time IS NULL AND close_time IS NULL)
    OR (NOT is_closed AND NOT is_24_hours
        AND open_time IS NOT NULL AND close_time IS NULL)
    OR (NOT is_closed AND NOT is_24_hours
        AND open_time IS NOT NULL AND close_time IS NOT NULL
        AND open_time <> close_time)
  ),
  CONSTRAINT hours_source_url_http
    CHECK (source_url IS NULL OR source_url ~* '^https?://')
);

-- One default (no effective-dating) schedule row per heritage + day.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hours_default_day
  ON heritage_operating_hours (heritage_id, day_of_week)
  WHERE effective_from IS NULL AND effective_until IS NULL;

-- Dated overrides (seasonal / temporary) never collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hours_dated_day
  ON heritage_operating_hours (heritage_id, day_of_week, effective_from)
  WHERE effective_from IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hours_heritage_day
  ON heritage_operating_hours (heritage_id, day_of_week);

CREATE INDEX IF NOT EXISTS idx_hours_status
  ON heritage_operating_hours (schedule_status);

-- touch trigger (same convention as enrichment_proposals)
CREATE OR REPLACE FUNCTION touch_operating_hours() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hours_touch ON heritage_operating_hours;
CREATE TRIGGER trg_hours_touch
  BEFORE UPDATE ON heritage_operating_hours
  FOR EACH ROW EXECUTE FUNCTION touch_operating_hours();

-- ------------------------------------------------------------
-- 3. Controlled DEMO nearby dataset (Part E)
--    No rating / review / availability / price / booking columns exist
--    by design, so demo rows can never claim them.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS demo_places (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  heritage_id         UUID NOT NULL REFERENCES heritage_entities(id) ON DELETE CASCADE,
  name                TEXT NOT NULL CHECK (length(trim(name)) > 0),
  category            TEXT NOT NULL CHECK (category IN (
                        'HOTEL','RESTAURANT','CAFE','PARKING','MUSEUM',
                        'ATTRACTION','TRANSPORT','ATM','PHARMACY',
                        'HOSPITAL','SHOPPING')),
  latitude            DOUBLE PRECISION NOT NULL
                      CHECK (latitude BETWEEN -90 AND 90),
  longitude           DOUBLE PRECISION NOT NULL
                      CHECK (longitude BETWEEN -180 AND 180),
  address             TEXT,
  phone               TEXT,
  website             TEXT,
  source_type         TEXT NOT NULL DEFAULT 'DEMO'
                      CHECK (source_type = 'DEMO'),       -- demo rows can never claim otherwise
  source_url          TEXT,
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'
                      CHECK (verification_status IN ('UNVERIFIED','REVIEWED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT demo_places_website_http
    CHECK (website IS NULL OR website ~* '^https?://'),
  CONSTRAINT demo_places_no_fake_claims
    CHECK (verification_status <> 'VERIFIED'),            -- never a fake verified status
  CONSTRAINT demo_places_no_null_island
    CHECK (NOT (latitude = 0 AND longitude = 0))           -- no fabricated (0,0) coordinates
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_demo_place
  ON demo_places (heritage_id, category, name);

CREATE INDEX IF NOT EXISTS idx_demo_places_heritage
  ON demo_places (heritage_id, category);

DROP TRIGGER IF EXISTS trg_demo_places_touch ON demo_places;
CREATE TRIGGER trg_demo_places_touch
  BEFORE UPDATE ON demo_places
  FOR EACH ROW EXECUTE FUNCTION touch_operating_hours();

-- ============================================================
-- 4. DEMO operating hours (clearly marked: DEMO + UNVERIFIED)
--    Each row records where the sample value came from. None of these
--    rows is claimed as official or verified.
-- ============================================================

-- Hawa Mahal — daily 09:00–18:30, copied from the OpenStreetMap
-- opening_hours tag (node 542886858). DEMO / UNVERIFIED.
INSERT INTO heritage_operating_hours
  (heritage_id, day_of_week, open_time, close_time, special_note,
   source_url, source_type, schedule_status, verification_status)
SELECT he.id, d.dow, TIME '09:00', TIME '18:30',
       'Demo hours — not verified. Sample from the OpenStreetMap opening_hours tag.',
       'https://www.openstreetmap.org/node/542886858',
       'DEMO', 'DEMO', 'UNVERIFIED'
  FROM heritage_entities he
  CROSS JOIN generate_series(0, 6) AS d(dow)
 WHERE he.slug = 'hawa-mahal'
ON CONFLICT DO NOTHING;

-- Qutub Minar — daily 07:00–17:00, copied from the OpenStreetMap
-- ticket-office opening_hours tag (node 1486856990). DEMO / UNVERIFIED.
INSERT INTO heritage_operating_hours
  (heritage_id, day_of_week, open_time, close_time, special_note,
   source_url, source_type, schedule_status, verification_status)
SELECT he.id, d.dow, TIME '07:00', TIME '17:00',
       'Demo hours — not verified. Sample from the OpenStreetMap ticket-office opening_hours tag.',
       'https://www.openstreetmap.org/node/1486856990',
       'DEMO', 'DEMO', 'UNVERIFIED'
  FROM heritage_entities he
  CROSS JOIN generate_series(0, 6) AS d(dow)
 WHERE he.slug = 'qutub-minar'
ON CONFLICT DO NOTHING;

-- Amber Fort — daily 07:00–20:00 from the Rajasthan Tourism official
-- booking portal. CONFLICT: other widely published listings state
-- 08:00–17:30, so the schedule is flagged for review rather than shown
-- as an authoritative open/closed claim.
INSERT INTO heritage_operating_hours
  (heritage_id, day_of_week, open_time, close_time, special_note,
   source_url, source_type, schedule_status, verification_status)
SELECT he.id, d.dow, TIME '07:00', TIME '20:00',
       'CONFLICT — REQUIRES REVIEW: the Rajasthan Tourism booking portal lists 07:00–20:00 while other public listings state 08:00–17:30. Sample value only.',
       'https://obms-tourist.rajasthan.gov.in/place-details/Amber-Fort',
       'DEMO', 'CONFLICT', 'UNVERIFIED'
  FROM heritage_entities he
  CROSS JOIN generate_series(0, 6) AS d(dow)
 WHERE he.slug = 'amber-fort'
ON CONFLICT DO NOTHING;

-- Red Fort — daily 09:30–16:30. CONFLICT: ASI announced seven-day
-- opening (Feb 2026) while several third-party listings still show a
-- Monday closure, so no open/closed claim is made from this data.
INSERT INTO heritage_operating_hours
  (heritage_id, day_of_week, open_time, close_time, special_note,
   source_url, source_type, schedule_status, verification_status)
SELECT he.id, d.dow, TIME '09:30', TIME '16:30',
       'CONFLICT — REQUIRES REVIEW: ASI reports the Red Fort open all seven days (Feb 2026) while several listings still show a Monday closure. Sample value only.',
       'https://m.economictimes.com/news/india/red-fort-to-remain-open-on-all-days-of-week-asi/articleshow/128643146.cms',
       'DEMO', 'CONFLICT', 'UNVERIFIED'
  FROM heritage_entities he
  CROSS JOIN generate_series(0, 6) AS d(dow)
 WHERE he.slug = 'red-fort'
ON CONFLICT DO NOTHING;

-- Entities without a schedule (e.g. charminar, gateway-of-india, and
-- every Phase-36 record without a location) deliberately get NO rows:
-- they must report INFORMATION UNAVAILABLE, never a manufactured time.

-- ============================================================
-- 5. DEMO nearby places (Part E)
--    Real names and coordinates retrieved from OpenStreetMap at build
--    time (Overpass API), stored as clearly marked DEMO records.
--    source_url points at the originating OSM node for traceability.
-- ============================================================
INSERT INTO demo_places
  (heritage_id, name, category, latitude, longitude, address, phone, website, source_url)
VALUES
  ((SELECT id FROM heritage_entities WHERE slug = 'amber-fort'), 'Karnataka Bank', 'ATM', 26.91869, 75.798565, NULL, NULL, NULL, 'https://www.openstreetmap.org/node/3677353029'),
  ((SELECT id FROM heritage_entities WHERE slug = 'amber-fort'), 'Nibs', 'CAFE', 26.915555, 75.794939, NULL, NULL, NULL, 'https://www.openstreetmap.org/node/3685074596'),
  ((SELECT id FROM heritage_entities WHERE slug = 'amber-fort'), 'ALCS: Cosmetic Surgery, Hair Transplant & Laser Clinic in Jaipur', 'HOSPITAL', 26.904707, 75.780569, '1 Shivaji Nagar, Civil Lines, jaipur – 302006, Rajasthan, India 1 Shivaji Nagar, Civil Lines Jaipur', NULL, NULL, 'https://www.openstreetmap.org/node/2694200840'),
  ((SELECT id FROM heritage_entities WHERE slug = 'amber-fort'), 'Hari Mahal Palace', 'HOTEL', 26.910545, 75.789608, 'Jaipur', NULL, NULL, 'https://www.openstreetmap.org/node/2684749333'),
  ((SELECT id FROM heritage_entities WHERE slug = 'amber-fort'), 'Sanjay Medical Store', 'PHARMACY', 26.916169, 75.810798, NULL, NULL, NULL, 'https://www.openstreetmap.org/node/3806704620'),
  ((SELECT id FROM heritage_entities WHERE slug = 'amber-fort'), 'Spice Court', 'RESTAURANT', 26.910891, 75.788968, 'Achrol House, Civil Lines Jaipur', NULL, NULL, 'https://www.openstreetmap.org/node/2684721077'),
  ((SELECT id FROM heritage_entities WHERE slug = 'amber-fort'), 'Vishal', 'SHOPPING', 26.917067, 75.8004209, NULL, NULL, NULL, 'https://www.openstreetmap.org/node/3258246837'),
  ((SELECT id FROM heritage_entities WHERE slug = 'amber-fort'), 'Ram Mandir Bus Stop', 'TRANSPORT', 26.902757, 75.7861855, NULL, NULL, NULL, 'https://www.openstreetmap.org/node/2105800556'),
  ((SELECT id FROM heritage_entities WHERE slug = 'qutub-minar'), 'State Bank of India', 'ATM', 28.626106, 77.219771, NULL, NULL, NULL, 'https://www.openstreetmap.org/node/2410180164'),
  ((SELECT id FROM heritage_entities WHERE slug = 'qutub-minar'), 'Teen Murti Haifa War Memorial', 'ATTRACTION', 28.604712, 77.198888, NULL, NULL, NULL, 'https://www.openstreetmap.org/node/308887236'),
  ((SELECT id FROM heritage_entities WHERE slug = 'qutub-minar'), 'Madras Coffee House', 'CAFE', 28.631851, 77.216309, NULL, '+91 11 2336 3074', NULL, 'https://www.openstreetmap.org/node/3242109751'),
  ((SELECT id FROM heritage_entities WHERE slug = 'qutub-minar'), 'Imperial Hotel', 'HOTEL', 28.625283, 77.218363, 'New Delhi', NULL, NULL, 'https://www.openstreetmap.org/node/1556466157'),
  ((SELECT id FROM heritage_entities WHERE slug = 'qutub-minar'), 'Parliament Visitor Parking', 'PARKING', 28.616201, 77.210017, 'New Delhi', NULL, NULL, 'https://www.openstreetmap.org/node/943245928'),
  ((SELECT id FROM heritage_entities WHERE slug = 'qutub-minar'), 'Spice Route', 'RESTAURANT', 28.625384, 77.218118, 'New Delhi', NULL, NULL, 'https://www.openstreetmap.org/node/1556466158'),
  ((SELECT id FROM heritage_entities WHERE slug = 'qutub-minar'), 'Shivaji Stadium Metro Station', 'TRANSPORT', 28.6288963, 77.2113218, 'New Delhi', NULL, NULL, 'https://www.openstreetmap.org/node/554257833'),
  ((SELECT id FROM heritage_entities WHERE slug = 'sabarmati-ashram'), 'ashram-managers guesthouse', 'ATTRACTION', 23.061685, 72.579377, NULL, NULL, NULL, 'https://www.openstreetmap.org/node/695652807'),
  ((SELECT id FROM heritage_entities WHERE slug = 'sabarmati-ashram'), 'Cyber Cafe', 'CAFE', 23.042288, 72.569958, NULL, NULL, NULL, 'https://www.openstreetmap.org/node/695666627'),
  ((SELECT id FROM heritage_entities WHERE slug = 'sabarmati-ashram'), 'Sabermati Ashram Guesthouse', 'HOTEL', 23.061384, 72.579973, NULL, NULL, NULL, 'https://www.openstreetmap.org/node/695652801'),
  ((SELECT id FROM heritage_entities WHERE slug = 'sabarmati-ashram'), 'Calico Textile Museum', 'MUSEUM', 23.05418, 72.592476, NULL, NULL, NULL, 'https://www.openstreetmap.org/node/3335472845'),
  ((SELECT id FROM heritage_entities WHERE slug = 'sabarmati-ashram'), 'Vrundavan Restaurant;AKHBAR NAGAR CIRCLE', 'RESTAURANT', 23.067425, 72.564572, NULL, NULL, NULL, 'https://www.openstreetmap.org/node/2477174077'),
  ((SELECT id FROM heritage_entities WHERE slug = 'sabarmati-ashram'), 'Shree Aaiji Super Market', 'SHOPPING', 23.0856343, 72.5646439, NULL, NULL, NULL, 'https://www.openstreetmap.org/node/2211695012'),
  ((SELECT id FROM heritage_entities WHERE slug = 'sabarmati-ashram'), 'Sabarmati Railway Station', 'TRANSPORT', 23.0770712, 72.5890677, 'Ahmedabad', NULL, NULL, 'https://www.openstreetmap.org/node/323189766')
ON CONFLICT DO NOTHING;
