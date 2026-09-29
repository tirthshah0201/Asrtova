-- ============================================================
-- Phase 38 — Trusted operating-hours expansion (Parts N, O, P)
-- ============================================================
-- Every row below was researched on 2026-09-29 against the source
-- URL it records. Review policy (documented):
--   * VERIFIED            — the site operator / protecting authority
--                            publishes fixed clock hours we retrieved.
--   * ASTROVA_ESTIMATE    — the authority publishes sunrise/sunset-
--                            relative hours the schema cannot express;
--                           clock times are clearly-labelled Astrova
--                            approximations, never official times.
--   * CONFLICT            — two trusted sources disagree and the
--                            review could not establish which schedule
--                            governs. Nothing is chosen automatically.
--   * source_type uses the shared vocabulary in test-demo-data
--     (OFFICIAL covers ASI/operator portals; CULTURAL_INSTITUTION
--     covers the Victoria Memorial Hall's own site).
-- Nothing is overwritten unless this migration records why.

-- ------------------------------------------------------------
-- 1. Amber Fort — CONFLICT RETAINED after provenance review (Part P)
--    Review 2026-09-29:
--      * Rajasthan Tourism's official booking portal
--        (obms-tourist.rajasthan.gov.in/place-details/Amber-Fort,
--        retrieved live) currently publishes "Timings 8.00 am to
--        9.00 pm" — Phase 37 had recorded 07:00–20:00 from the same
--        portal, so the portal's own value has changed since.
--      * Widely published day-visit hours are 08:00–17:30 (opening
--        time now agrees; closing time does not).
--      * Rajasthan Tourism's destination page (tourism.rajasthan.gov.in
--        /amber-palace.html) publishes NO timings at all.
--      * It remains unclear whether the portal's 21:00 closing covers
--        the ticketed monument or the evening light-and-sound show.
--    No source establishes which schedule is authoritative for the
--    day visit, so the conflict is RETAINED (never auto-resolved) and
--    the sample value is refreshed to the portal's current claim.
-- ------------------------------------------------------------
UPDATE heritage_operating_hours
   SET open_time = TIME '08:00',
       close_time = TIME '21:00',
       source_type = 'OFFICIAL',
       source_url = 'https://obms-tourist.rajasthan.gov.in/place-details/Amber-Fort',
       special_note =
         'CONFLICT — REVIEWED 2026-09-29, RETAINED: the Rajasthan Tourism booking portal publishes 08:00–21:00 (retrieved live; Phase 37 recorded 07:00–20:00 from the same portal), while widely published day-visit hours are 08:00–17:30. The official destination page publishes no timings. It is unclear whether the 21:00 closing covers the monument or the evening light-and-sound show, so no schedule is claimed. Sample value only.',
       schedule_status = 'CONFLICT',
       verification_status = 'UNVERIFIED'
  FROM heritage_entities he
 WHERE heritage_operating_hours.heritage_id = he.id
   AND he.slug = 'amber-fort';

-- ------------------------------------------------------------
-- 2. Red Fort — CONFLICT RESOLVED (Part P)
--    Review 2026-09-29, evidence recorded:
--      * ASI order dated 13 February 2026, signed by the Director
--        General of the Archaeological Survey of India, directs that
--        the Red Fort be open on all days of the week including
--        Monday; it came into force on 16 February 2026 (PTI report,
--        Economic Times, 21 February 2026 — source_url below).
--      * Listings still showing "closed Monday" predate the order and
--        are stale, not a live disagreement.
--      * Day-visit hours 09:30–16:30 (last entry 16:00) are the
--        published ticketed hours; seasonal variation is noted.
--      * ASI additionally closes the monument 15 July – 15 August
--        each year for Independence Day preparations (Times of India,
--        15 July 2026) — stored as a dated override below.
--    Final status: VERIFIED, open seven days.
-- ------------------------------------------------------------
DELETE FROM heritage_operating_hours h
 USING heritage_entities he
 WHERE h.heritage_id = he.id AND he.slug = 'red-fort';

-- Weekly default, Tuesday–Sunday (Monday is effective-dated below).
INSERT INTO heritage_operating_hours
  (heritage_id, day_of_week, open_time, close_time, special_note,
   source_url, source_type, schedule_status, verification_status)
SELECT he.id, d.dow, TIME '09:30', TIME '16:30',
       'Open all seven days. ASI order dated 2026-02-13 (Director General, ASI) opened the Red Fort on Mondays from 2026-02-16; listings showing Monday closure predate that order. Last entry 16:00; published timings vary seasonally. Evidence: PTI report 2026-02-21.',
       'https://m.economictimes.com/news/india/red-fort-to-remain-open-on-all-days-of-week-asi/articleshow/128643146.cms',
       'NEWS', 'VERIFIED', 'VERIFIED'
  FROM heritage_entities he
  CROSS JOIN (VALUES (0),(2),(3),(4),(5),(6)) AS d(dow)
 WHERE he.slug = 'red-fort'
ON CONFLICT DO NOTHING;

-- History: Monday was closed until the ASI order came into force.
INSERT INTO heritage_operating_hours
  (heritage_id, day_of_week, is_closed, effective_until, special_note,
   source_url, source_type, schedule_status, verification_status)
SELECT he.id, 1, TRUE, DATE '2026-02-15',
       'Historical record: the Red Fort was closed on Mondays until the ASI order of 2026-02-13 came into force on 2026-02-16.',
       'https://m.economictimes.com/news/india/red-fort-to-remain-open-on-all-days-of-week-asi/articleshow/128643146.cms',
       'NEWS', 'VERIFIED', 'VERIFIED'
  FROM heritage_entities he
 WHERE he.slug = 'red-fort'
ON CONFLICT DO NOTHING;

-- Monday since the order came into force.
INSERT INTO heritage_operating_hours
  (heritage_id, day_of_week, open_time, close_time, effective_from, special_note,
   source_url, source_type, schedule_status, verification_status)
SELECT he.id, 1, TIME '09:30', TIME '16:30', DATE '2026-02-16',
       'Monday opening introduced by the ASI order dated 2026-02-13, in force from 2026-02-16 (Director General, ASI). See the Tuesday–Sunday rows for the general schedule.',
       'https://m.economictimes.com/news/india/red-fort-to-remain-open-on-all-days-of-week-asi/articleshow/128643146.cms',
       'NEWS', 'VERIFIED', 'VERIFIED'
  FROM heritage_entities he
 WHERE he.slug = 'red-fort'
ON CONFLICT DO NOTHING;

-- Annual closure window (dated override, supersedes the weekly default).
INSERT INTO heritage_operating_hours
  (heritage_id, day_of_week, is_closed, effective_from, effective_until, special_note,
   source_url, source_type, schedule_status, verification_status)
SELECT he.id, d.dow, TRUE, DATE '2026-07-15', DATE '2026-08-15',
       'ASI closes the Red Fort to the public from 15 July to 15 August each year for Independence Day preparations; this row records the 2026 window (Times of India, 2026-07-15).',
       'https://timesofindia.indiatimes.com/india/red-fort-to-remain-closed-to-public-from-july-15-to-aug-15/articleshow/132422321.cms',
       'NEWS', 'VERIFIED', 'VERIFIED'
  FROM heritage_entities he
  CROSS JOIN generate_series(0, 6) AS d(dow)
 WHERE he.slug = 'red-fort'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 3. Qutub Minar — NEW CONFLICT discovered during Part N research
--    Two Tier-1 government sources publish different closing times
--    for the same monument on the same day (both retrieved
--    2026-09-29):
--      * ASI world-heritage page: "OPENING HOURS Open from Sunrise
--        to 08:00pm" (asi.nic.in/pages/WorldHeritageQutbMinar).
--      * Incredible India (Ministry of Tourism): "Opening time -
--        Sunrise to sunset, may vary seasonally"
--        (incredibleindia.gov.in/en/delhi/delhi/qutub-minar).
--    Sunset is not 20:00 in any Delhi season, so the claims differ.
--    Both are Tier 1 and neither is the other's subordinate; the
--    schema also cannot express sunrise-relative opening as an
--    official clock time. Per Part O the conflict is RETAINED, not
--    auto-resolved. The Phase 37 OSM demo (07:00–17:00) is
--    superseded by this evidence-based conflict record.
-- ------------------------------------------------------------
DELETE FROM heritage_operating_hours h
 USING heritage_entities he
 WHERE h.heritage_id = he.id AND he.slug = 'qutub-minar';

INSERT INTO heritage_operating_hours
  (heritage_id, day_of_week, open_time, close_time, special_note,
   source_url, source_type, schedule_status, verification_status)
SELECT he.id, d.dow, TIME '06:00', TIME '20:00',
       'CONFLICT — REVIEWED 2026-09-29, RETAINED: the ASI world-heritage page publishes sunrise–20:00 while Incredible India (Ministry of Tourism) publishes sunrise–sunset (seasonal) for the same monument. Both are Tier 1 and the opening time is sunrise-relative, so no official clock time can be claimed. Sample value: opening approximates sunrise, closing per ASI. Phase 37 OSM demo sample (07:00–17:00) superseded.',
       'https://asi.nic.in/pages/WorldHeritageQutbMinar',
       'OFFICIAL', 'CONFLICT', 'UNVERIFIED'
  FROM heritage_entities he
  CROSS JOIN generate_series(0, 6) AS d(dow)
 WHERE he.slug = 'qutub-minar'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 4. Hawa Mahal — DEMO deliberately retained (documented decision)
--    The Rajasthan Tourism booking portal now publishes
--    09:00–19:00 (retrieved live 2026-09-29), while the Phase 37
--    DEMO rows carry the OSM sample 09:00–18:30. The official
--    upgrade is recorded here for a future pass, but Phase 38
--    intentionally keeps one live DEMO-labelled schedule so the
--    DEMO labelling path (Phase 38 Part I) stays covered end to
--    end. The existing hawa-mahal rows are NOT touched.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 5. Victoria Memorial, Kolkata — VERIFIED (new coverage)
--    Source: the institution's own website, victoriamemorial-cal.org
--    /visit-us/ (site footer: updated 2026-09-29; retrieved
--    2026-09-29): "Opening Hours: 10.00 AM – 6.00 PM. The galleries
--    remain closed on Mondays and designated National Holidays."
--    The separately-ticketed gardens (06:00–18:00 daily) are not the
--    monument visit schedule and are mentioned in the note only.
-- ------------------------------------------------------------
INSERT INTO heritage_operating_hours
  (heritage_id, day_of_week, open_time, close_time, is_closed, special_note,
   source_url, source_type, schedule_status, verification_status)
SELECT he.id, d.dow,
       CASE WHEN d.dow = 1 THEN NULL ELSE TIME '10:00' END,
       CASE WHEN d.dow = 1 THEN NULL ELSE TIME '18:00' END,
       d.dow = 1,
       CASE WHEN d.dow = 1
            THEN 'Closed on Mondays and designated National Holidays per the official Victoria Memorial Hall website (retrieved 2026-09-29). Gardens are open daily 06:00–18:00 but are a separate, separately-ticketed area.'
            ELSE 'Museum galleries 10:00–18:00 per the official Victoria Memorial Hall website (retrieved 2026-09-29); closed on Mondays and designated National Holidays. Gardens (06:00–18:00 daily) are a separate, separately-ticketed area.' END,
       'https://victoriamemorial-cal.org/visit-us/',
       'CULTURAL_INSTITUTION', 'VERIFIED', 'VERIFIED'
  FROM heritage_entities he
  CROSS JOIN generate_series(0, 6) AS d(dow)
 WHERE he.slug = 'victoria-memorial'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 6. Ajanta Caves — VERIFIED (new coverage)
--    Source: ASI world-heritage page (retrieved 2026-09-29):
--    "OPENING HOURS Open from 9 A.M. to 5 P.M. (Closed on Monday)".
-- ------------------------------------------------------------
INSERT INTO heritage_operating_hours
  (heritage_id, day_of_week, open_time, close_time, is_closed, special_note,
   source_url, source_type, schedule_status, verification_status)
SELECT he.id, d.dow,
       CASE WHEN d.dow = 1 THEN NULL ELSE TIME '09:00' END,
       CASE WHEN d.dow = 1 THEN NULL ELSE TIME '17:00' END,
       d.dow = 1,
       'ASI publishes 09:00–17:00, closed on Mondays (world-heritage page, retrieved 2026-09-29).',
       'https://asi.nic.in/pages/WorldHeritageAjantaCaves',
       'OFFICIAL', 'VERIFIED', 'VERIFIED'
  FROM heritage_entities he
  CROSS JOIN generate_series(0, 6) AS d(dow)
 WHERE he.slug = 'ajanta-caves'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 7. Ellora Caves — ASTROVA_ESTIMATE (sunrise/sunset cannot be an
--    official clock time)
--    Source: ASI world-heritage page (retrieved 2026-09-29):
--    "OPENING HOURS - Open from sunrise to sunset (Closed on
--    Tuesday)". The schema needs clock times for an open day, so the
--    open/close values below are clearly-labelled Astrova
--    approximations of sunrise/sunset — schedule_status
--    ASTROVA_ESTIMATE, never presented as official times.
-- ------------------------------------------------------------
INSERT INTO heritage_operating_hours
  (heritage_id, day_of_week, open_time, close_time, is_closed, special_note,
   source_url, source_type, schedule_status, verification_status)
SELECT he.id, d.dow,
       CASE WHEN d.dow = 2 THEN NULL ELSE TIME '06:00' END,
       CASE WHEN d.dow = 2 THEN NULL ELSE TIME '18:00' END,
       d.dow = 2,
       'ASI publishes sunrise–sunset and closure on Tuesdays (world-heritage page, retrieved 2026-09-29). The clock times shown are ASTROVA ESTIMATES approximating sunrise/sunset — not official times.',
       'https://asi.nic.in/pages/WorldHeritageElloraCaves',
       'OFFICIAL', 'ASTROVA_ESTIMATE', 'UNVERIFIED'
  FROM heritage_entities he
  CROSS JOIN generate_series(0, 6) AS d(dow)
 WHERE he.slug = 'ellora-caves'
ON CONFLICT DO NOTHING;
