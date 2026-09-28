"""Generate docs/ASTROVA-TRUSTED-DATA-REFINEMENT-REPORT.docx (python-docx).

Cloned from docs/generate-hvi-docx.py so the Phase 36 report matches the
project's existing Word-report style (terracotta headings, Calibri body,
Consolas code blocks, 'Light Grid Accent 1' tables).

Run:  python3 docs/generate-p36-docx.py
"""
import os

from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

TERRACOTTA = RGBColor(0xC1, 0x50, 0x2E)
CHARCOAL = RGBColor(0x2B, 0x2B, 0x2B)

doc = Document()

style = doc.styles["Normal"]
style.font.name = "Calibri"
style.font.size = Pt(10.5)


def h1(text):
    p = doc.add_heading(text, level=1)
    for r in p.runs:
        r.font.color.rgb = TERRACOTTA
    return p


def h2(text):
    p = doc.add_heading(text, level=2)
    for r in p.runs:
        r.font.color.rgb = CHARCOAL
    return p


def para(text, bold=False, italic=False):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.bold = bold
    r.italic = italic
    return p


def bullets(items):
    for item in items:
        doc.add_paragraph(item, style="List Bullet")


def mono(text):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.font.name = "Consolas"
    r.font.size = Pt(8)
    return p


def table(headers, rows):
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = "Light Grid Accent 1"
    for i, h in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = h
        for p in cell.paragraphs:
            for r in p.runs:
                r.bold = True
    for ri, row in enumerate(rows, start=1):
        for ci, val in enumerate(row):
            t.rows[ri].cells[ci].text = str(val)
    doc.add_paragraph()


# ---------------------------------------------------------------- title
title = doc.add_heading("Astrova — Trusted Heritage Data Refinement", level=0)
for r in title.runs:
    r.font.color.rgb = TERRACOTTA
sub = doc.add_paragraph()
sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = sub.add_run(
    "Phase 36 Report — Provenance + Controlled Enrichment\n"
    "28 September 2026 · Status: COMPLETE · Feature H = PARTIAL (advanced)"
)
r.italic = True

h1("1. Phase name")
para("PHASE 36 — Trusted Heritage Data Refinement + Provenance + Controlled Enrichment, "
     "delivered under the lead software / data / database / backend / frontend / security / QA "
     "engineering roles for the Astrova platform.")

h1("2. Objective")
para("Improve the quality, trust, traceability, consistency and reviewability of the heritage data "
     "Astrova publishes without fabricating anything: fix safe data-quality defects, record where "
     "every piece of information came from (authority tier, licence, verified date), turn the "
     "stateless Wikidata enrichment into a controlled pipeline (extract → validate → deduplicate → "
     "conflict-check → human review → publish), give administrators a lightweight review workflow "
     "with an audit trail, and re-verify the platform end to end.")
bullets([
    "AI chatbot stays Under Construction.",
    "Future-list items are NOT implemented.",
    "No proprietary APIs, no provider keys.",
])

h1("3. Why the phase was needed")
bullets([
    "22 heritage entities had slug IS NULL, so public links silently fell back to UUIDs.",
    "sources carried verification_status but no authority level, no licence and no verified date — "
    "a user could not tell a government archive from an open dataset.",
    "Wikidata enrichment was computed and thrown away: nothing could be reviewed, rejected or audited later.",
    "The admin portal had no place to inspect and decide on a proposed change.",
])

h1("4. Audit findings (Steps 1–5, before any code)")
table(
    ["Area", "Finding"],
    [
        ["Migrations", "30/30 applied; runner healthy"],
        ["Data", "96 heritage entities, 54 locations, 9 periods, 72 media"],
        ["Slugs", "22 entities with slug IS NULL (from migration 030); 0 duplicate slugs"],
        ["Sources", "22 rows, 100% verification_status + retrieved_date; no tier/licence/verified_date"],
        ["Enrichment", "Stateless — extract/normalize/duplicate/conflict computed, never persisted"],
        ["Timeline", "9 periods, 52 assigned entities"],
        ["Tests", "db-audit 34/34, enrichment 4/4, VI 10/10, visit module 16/16"],
    ],
)

h1("5. Scope decisions")
h2("In scope")
bullets([
    "Guarded slug backfill (only rows where slug IS NULL, uniqueness-guarded).",
    "Authority tier + licence + verified date for every source.",
    "Persisted enrichment proposals with a review state machine.",
    "Admin review UI (queue, filters, actions, extraction tool, duplicate scan).",
    "Public exposure of provenance and review status; full platform re-verification.",
])
h2("Out of scope (deliberately)")
bullets([
    "Any change to Visitor Intelligence — regression-tested only.",
    "Historical period assignment for new records (see section 17).",
    "Unattended approval of proposals into curated fields (Feature H stays PARTIAL).",
    "AI chatbot, crowd info, conservation monitoring, hotel booking, RAG — future list, not implemented.",
    "Any proprietary/paid API or provider key.",
])

h1("6. Database changes")
para("Migration 031_p36_trusted_data.sql (applied):", bold=True)
bullets([
    "22 guarded slug updates — UPDATE … WHERE slug IS NULL AND NOT EXISTS (slug already used); "
    "no curated slug ever overwritten. Null slugs after the phase: 0.",
    "sources.authority_tier SMALLINT, sources.license TEXT, sources.verified_date DATE.",
    "OPEN_DATASET added to the source_type CHECK constraint.",
    "Canonical UNESCO URL corrected to https://whc.unesco.org/en/list/.",
    "Every source tiered and licensed: T1 = 18, T2 = 4, T3 = 1 → 23/23 tiered, 23/23 licensed.",
])
para("Migration 032_p36_enrichment_review.sql (applied):", bold=True)
mono(
    """CREATE TABLE enrichment_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES heritage_entities(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,        -- e.g. Wikidata QID
  source_type TEXT NOT NULL,        -- OPEN_DATASET ...
  field TEXT NOT NULL,
  proposed_value TEXT NOT NULL,
  current_value TEXT,
  conflicts JSONB NOT NULL DEFAULT '[]',
  source_url TEXT, license TEXT,
  status TEXT NOT NULL CHECK (status IN
    ('DRAFT','PENDING_REVIEW','VERIFIED','REJECTED','CONFLICT')),
  reviewer_id UUID REFERENCES users(id),
  reviewer_note TEXT, reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, external_id, field, proposed_value)
);"""
)
para("Migrations after this phase: 32/32 applied.")

h1("7. Provenance model")
table(
    ["Tier", "Label shown", "Meaning"],
    [
        ["T1", "OFFICIAL", "Official site, UNESCO, ASI, government, tourism board, national archive"],
        ["T2", "INSTITUTIONAL", "Institutional / academic / museum"],
        ["T3", "OPEN DATASET", "Open data such as Wikidata (CC0)"],
        ["T4", "(geographic only)", "OpenStreetMap — geography only, never a historical authority"],
        ["T5", "ASTROVA ESTIMATE", "Calculated by Astrova's own documented model"],
    ],
)
para("User-visible vocabulary: VERIFIED · INFORMATION UNAVAILABLE · CONFLICT — REQUIRES REVIEW · "
     "ASTROVA ESTIMATE · LIVE DATA · POSSIBLE DUPLICATE.")

h1("8. Data-quality rules (dataQuality.ts, 436 lines, pure)")
bullets([
    "AUTHORITY_TIERS, tierForSourceType, tierLabel, isHistoricalAuthority — one mapping used by API and UI.",
    "PROPOSAL_FIELDS whitelist: description, official_website, inception_year, coordinates, instance_of.",
    "validateProposalField rejects markup, non-http(s) URLs, fuzzy years, Null Island (0,0), malformed QIDs.",
    "PROPOSAL_STATUSES + canTransition + initialStatusFor for the review state machine.",
    "scoreDuplicate with POSSIBLE_DUPLICATE_THRESHOLD = 0.75 → verdict POSSIBLE DUPLICATE / UNLIKELY only.",
    "safeSlugFor, describeIssues, findDuplicateDescriptions; reuses utils/slug.ts (no second slug implementation).",
])

h1("9. Controlled enrichment pipeline (enrichmentReview.ts, 381 lines)")
mono(
    """Wikidata (bounded, 5s timeout, 24h cache)
  -> enrichment.ts extract/normalize       (stateless, unchanged)
  -> dataQuality.validateProposalField     (invalid -> skipped + reason)
  -> duplicate scoring                     (POSSIBLE DUPLICATE only)
  -> conflict detection                    (-> CONFLICT REQUIRES REVIEW)
  -> syncProposals()  INSERT ... WHERE NOT EXISTS / ON CONFLICT DO NOTHING
  -> enrichment_proposals (persisted, reviewable, auditable)"""
)
bullets([
    "Never overwrites a curated entity field.",
    "Never resets a decision: VERIFIED / REJECTED rows are untouched on refresh.",
    "Stores current_value so reviewers can compare proposed vs. current.",
    "scanPossibleDuplicates() is read-only and pairwise over the whole proposal set.",
])

h1("10. Review workflow and state machine")
mono(
    """DRAFT -> PENDING_REVIEW -> VERIFIED -> (reopen) -> PENDING_REVIEW
                |               |
                |               +-- X VERIFIED -> REJECTED refused (INVALID_TRANSITION)
                +-------------> REJECTED -> (reopen) -> PENDING_REVIEW"""
)
bullets([
    "verify / reject / reopen are the only admin actions; each is validated by canTransition before any write.",
    "VERIFIED and REJECTED never flip directly — reopen is an explicit admin action, not an automatic reset.",
    "Reviewer identity comes from the authenticated session, never the request body.",
    "Every decision stores reviewer_id, optional reviewer_note and reviewed_at.",
])

h1("11. Files created")
table(
    ["File", "Lines", "Purpose"],
    [
        ["backend/src/services/dataQuality.ts", "436", "Pure tier / validation / state-machine helpers"],
        ["backend/src/services/enrichmentReview.ts", "381", "Persistence, review, public projection, duplicate scan"],
        ["backend/tests/test-data-quality.js", "158", "12 checks over the pure helpers"],
        ["backend/tests/test-enrichment-review.js", "237", "14 DB-backed, self-cleaning checks"],
        ["database/migrations/031_p36_trusted_data.sql", "—", "Slugs + provenance columns (applied)"],
        ["database/migrations/032_p36_enrichment_review.sql", "—", "enrichment_proposals table (applied)"],
        ["docs/ASTROVA-TRUSTED-DATA-REFINEMENT-REPORT.md", "—", "This report (25 sections)"],
        ["docs/generate-p36-docx.py", "—", "Word export of this report"],
    ],
)

h1("12. Files modified")
table(
    ["File", "Diff", "Purpose"],
    [
        ["backend/src/routes/admin.ts", "+158", "4 review endpoints behind requireAdmin (line 172)"],
        ["backend/src/routes/heritage.ts", "+55/-17", "Enrichment annotation + source tier/licence exposure"],
        ["backend/tests/db-audit.js", "+68", "Audit extended 34 -> 41 checks"],
        ["frontend/app/admin/page.tsx", "+369", "Ninth tab 'Data Review' + ReviewTab component"],
        ["frontend/app/heritage/[id]/page.tsx", "+26", "Source-tier badge, Verified/Terms lines"],
        ["frontend/components/heritage/ExternalReferences.tsx", "+65", "ReviewBadge + per-proposal review status"],
        ["PRD.md, report.md", "—", "Phase status; Feature H = PARTIAL"],
    ],
)
para("Tracked diff: 6 files, +724/-17, plus the 8 new files listed above.")

h1("13. API changes")
h2("Admin (behind requireAdmin)")
table(
    ["Method", "Path", "Purpose"],
    [
        ["GET", "/api/admin/enrichment/proposals", "Queue with status/entity filters and paging"],
        ["POST", "/api/admin/enrichment/proposals/:id/review", "verify | reject | reopen, UUID + transition validated"],
        ["POST", "/api/admin/enrichment/refresh/:entityId", "Cache cleared, one bounded Wikidata call, sync"],
        ["GET", "/api/admin/enrichment/duplicates", "Read-only duplicate scan"],
    ],
)
h2("Public")
bullets([
    "GET /api/heritage/:id/enrichment — each proposal annotated with review{status, reviewedAt}; REJECTED rows "
    "removed; meta.reviewCounts {verified, pending, conflict} added; reviewer notes/emails never present.",
    "GET /api/heritage/:id — sources[] now includes authority_tier, license, verified_date; entity carries "
    "authority_tier and tier_label.",
])

h1("14. Frontend implementation")
bullets([
    "ExternalReferences.tsx — ReviewBadge (Verified green / Conflict amber / Proposal stone) per proposal; "
    "header reads '... · Open Dataset'.",
    "heritage/[id]/page.tsx — official-source badge from tier_label plus Verified / Terms lines from "
    "license and verified_date.",
    "admin/page.tsx — AdminTab 'review' + ReviewTab (~370 lines): queue, status filter, verify/reject/reopen "
    "with admin-only note, entity-UUID extraction tool, read-only duplicate-scan panel.",
    "Admin navigation now has nine tabs: Overview, Heritage, Media, Locations, Sources, Data Review, "
    "Users, Collections, Periods.",
])

h1("15. Honesty rules verified end-to-end (live HTTP evidence)")
table(
    ["Check", "Result"],
    [
        ["GET /api/heritage/deepavali", "authority_tier 1 (OFFICIAL), licence, verified_date 2026-09-27"],
        ["GET /api/heritage/charminar/enrichment", "5 proposals, all PENDING_REVIEW, reviewCounts present, no reviewer keys"],
        ["Admin endpoints, no session", "401 even with a valid API key"],
        ["Admin endpoints, demoted QA session", "403 'Admin access required.'"],
        ["verify", "Accepted -> VERIFIED"],
        ["verify -> reject", "Refused: INVALID_TRANSITION (Cannot move from VERIFIED to REJECTED)"],
        ["reopen then reject", "Accepted — explicit admin action"],
        ["REJECTED proposal, public view", "Hidden; reviewCounts updated"],
        ["Reviewer note / email publicly", "Never present (test-asserted)"],
        ["Duplicate scan", "96 scanned, 0 pairs, 0.34 s"],
        ["Search chain", "Charminar, Deepavali, Kumbh Mela, Yoga, Vedic Chanting, Chhau found; suggestions return deepavali"],
        ["Locations", "54 total, Null-Island (0,0) rows: 0"],
    ],
)

h1("16. Visitor intelligence regression (Step 19)")
table(
    ["Endpoint", "Result"],
    [
        ["GET /api/heritage/deepavali/visitor-intelligence",
         "availability location_unavailable; situation.status information_unavailable"],
        ["GET /api/heritage/charminar/visitor-intelligence",
         "Full payload: airQuality, availability, heritage, meta, recommendation, situation, sources, weather"],
    ],
)
para("Keys, states and labels are unchanged from Phase 35 — the existing implementation was not rebuilt.")

h1("17. Timeline judgment (Step 18 — documented, not guessed)")
bullets([
    "Timeline today: 9 periods, 52 assigned entities — identical to before this phase.",
    "44 of 96 entities have no period_id, including all 22 Phase-36 records.",
    "Decision: this phase assigns no periods. Period ranges overlap — Charminar's own text says 'Built in 1591', "
    "which sits inside both Ahom (1228–1826) and Colonial (1573–1947); the data cannot pick one, and Ahom for a "
    "Hyderabad monument would be plainly wrong.",
    "Most new records are not datable objects: festivals, performing traditions, cuisine, rivers, lakes, hill stations.",
    "The phase rule is explicit — do not assign a historical period if the source does not support it.",
    "Gateway of India (1924), Victoria Memorial (1906–1921), Shore Temple (8th c.) and Mahabodhi (5th–6th c.) were "
    "left unassigned too: each date still falls in 2–3 overlapping ranges. Backfilling needs a taxonomy decision first.",
])

h1("18. Open-data rule check (Step 20)")
table(
    ["Host", "Purpose", "Licence"],
    [
        ["api.open-meteo.com / open-meteo.com", "Weather + air quality", "Free, CC BY 4.0"],
        ["www.wikidata.org", "Enrichment proposals", "CC0 1.0"],
        ["openstreetmap.org / overpass-api.de / kumi.systems / nominatim", "Nearby places, stays, geocoding", "ODbL"],
        ["unpkg.com", "Static CDN assets", "MIT"],
        ["www.airnow.gov", "Documentation link for AQI bands (no call)", "US government public"],
    ],
)
bullets([
    "No proprietary API, no paid tier, no provider key, nothing requiring billing.",
    "Only client-visible env var is NEXT_PUBLIC_DEMO_API_KEY (pre-existing demo pattern).",
    "AI chatbot page still renders Under Construction; future-list features not implemented.",
])

h1("19. Security")
bullets([
    "SQL: every statement parameterised. The single interpolated identifier (SELECT ${column}) comes from a "
    "hard-coded columnByField whitelist (description only) — no user input reaches it.",
    "Authz: all four review endpoints sit behind router.use(requireAdmin); verified 401 with no session and 403 "
    "for a session whose role was demoted (role read per request).",
    "Input validation: UUIDs validated; action restricted to verify|reject|reopen; status filter validated; "
    "paging clamped (limit <= 200, offset >= 0).",
    "Rate limits: public enrichment keeps enrichmentRateLimit; admin login keeps adminLoginRateLimit; the refresh "
    "endpoint is admin-only and bounded to one entity, one 5-second call, cache cleared first.",
    "Secrets: none added; .env ignored; no credential in any response or in the diff.",
    "Privacy: reviewer notes and emails stripped from every public projection (test-asserted).",
])

h1("20. Performance (5 samples per endpoint, warm)")
table(
    ["Endpoint", "Average"],
    [
        ["GET /api/heritage", "242 ms"],
        ["GET /api/heritage/charminar", "238 ms"],
        ["GET /api/heritage/charminar/enrichment", "160 ms"],
        ["GET /api/timeline", "99 ms"],
        ["GET /api/search?q=temple", "85 ms"],
        ["GET /api/heritage/deepavali/visitor-intelligence", "82 ms"],
        ["GET /api/heritage/charminar/nearby", "82 ms"],
        ["GET /api/sources", "82 ms"],
        ["Duplicate scan (admin, read-only)", "0.34 s for 96 rows"],
    ],
)

h1("21. Testing (Step 23 — full run)")
table(
    ["Suite", "Result"],
    [
        ["db-audit.js (extended)", "41/41"],
        ["test-data-quality.js (new)", "12/12"],
        ["test-enrichment.js", "4/4"],
        ["test-enrichment-review.js (new, DB-backed, self-cleaning)", "14/14"],
        ["test-visit-module.js", "16/16"],
        ["test-visitor-intelligence.js", "10/10"],
        ["TOTAL", "97 checks green"],
        ["test-media-upload.js", "Fails — pre-existing missing form-data dependency (not this phase)"],
        ["Migrations", "32/32 applied"],
        ["Backend tsc --noEmit + build", "exit 0"],
        ["Frontend tsc --noEmit", "exit 0"],
    ],
)
bullets([
    "New audit coverage: enrichment_proposals exists, 0 null slugs, 0 duplicate slugs, provenance columns present, "
    "all sources tiered, all proposal statuses valid, proposal FK integrity with no orphans, heritage count = 96.",
    "test-enrichment-review.js is self-cleaning: marker proposal Q999999999, full lifecycle, rows deleted, "
    "heritage_entities count asserted unchanged.",
])

h1("22. Regression (Step 24)")
bullets([
    "All 13 application routes returned 200: /, /explore, /explore/charminar, /heritage, /heritage/charminar, "
    "/timeline, /collections, /collections/favorites, /auth, /favorites, /admin, /about, /ai.",
    "API surfaces 200: search, suggestions, media, locations, sources, periods, state-counts, timeline, "
    "visitor-intelligence (available and unavailable cases), enrichment.",
])

h1("23. Responsive + accessibility (Steps 25–26)")
para("Responsive — real browser viewport resizing; pass = scrollWidth === clientWidth:", bold=True)
table(
    ["Page", "Widths tested", "Result"],
    [
        ["`/` homepage", "1440, 1280, 1024, 900, 768, 740, 720, 430, 390, 360 (all 10)", "PASS"],
        ["/heritage/charminar (provenance UI)", "1440, 1024, 768, 720, 430, 390, 360", "PASS"],
        ["/admin → Data Review tab", "1440, 768, 360", "PASS"],
    ],
)
para("0 px page-level horizontal overflow everywhere; the only off-viewport rectangles were buttons inside an "
     "intentional overflow-x-auto filter strip, which scrolls within its own container.")
para("Accessibility (home, heritage detail, admin Data Review):", bold=True)
bullets([
    "lang='en', exactly one h1 per page; main / nav / banner landmarks present.",
    "Images without alt: 0. Inputs without label or aria-label: 0. Controls without an accessible name: 0 "
    "(the logo link is named by its alt='Astrova' image).",
    "Heading order on the new review tab: 1 2 2 2 2 — no skips.",
])

h1("24. Known limitations")
bullets([
    "Feature H remains PARTIAL: proposals are persisted, validated and human-reviewed, but nothing is "
    "auto-approved into curated entity fields; unattended ingestion is PLANNED.",
    "44/96 entities have no historical period — see section 17; fixing it needs a period-taxonomy decision.",
    "test-media-upload.js fails on a pre-existing missing form-data dependency; unrelated to this phase.",
    "Original admin@astrova.in password is unknown/undocumented, so that login was never exercised. A temporary "
    "QA admin was created for E2E and demoted back to role='user' before the commit; admin@astrova.in is untouched "
    "and is again the only admin.",
    "Duplicate detection is pairwise — fine at 96 rows (0.34 s), would need blocking at much larger scale.",
    "Proposal provenance comes from Wikidata only; other open datasets are tiered as sources but not yet piped "
    "through the proposal pipeline.",
])

h1("25. Final implementation status")
table(
    ["Item", "Status"],
    [
        ["Audit (Steps 1–5)", "COMPLETE"],
        ["Data-quality fixes + provenance columns (Steps 6–9)", "COMPLETE — migrations 031/032 applied, 32/32"],
        ["Controlled enrichment + validation (Steps 10–12)", "COMPLETE — dataQuality.ts + enrichmentReview.ts"],
        ["Admin review workflow (Steps 13–15)", "COMPLETE — 4 endpoints + Data Review tab"],
        ["Honesty contract E2E (Steps 16–17)", "VERIFIED live"],
        ["Timeline judgment (Step 18)", "DECIDED & documented — no fabricated periods"],
        ["Visitor intelligence regression (Step 19)", "UNCHANGED behaviour"],
        ["Open-data rule (Step 20)", "No proprietary APIs; AI still Under Construction"],
        ["Security + performance (Steps 21–22)", "Parameterised SQL, 401/403 verified, 82–242 ms"],
        ["Full test run (Step 23)", "97 checks green, 32/32 migrations, builds clean"],
        ["Regression (Step 24)", "13/13 routes + 7 API surfaces 200"],
        ["Responsive (Step 25)", "20 viewport measurements, 0 overflow"],
        ["Accessibility + build (Steps 26–27)", "Clean audit; next build 13/13 pages"],
        ["Test-account hygiene", "QA account demoted; only admin@astrova.in remains admin"],
        ["PRD.md + report.md (Steps 28–29)", "Updated; Feature H = PARTIAL"],
        ["This report + Word export", "25 sections"],
        ["Git review, commit, push (Steps 30–33)", "New commit on top of 67d7cb7 — never amended, never force-pushed"],
    ],
)
para("Feature H — Trusted external ingestion pipeline: PARTIAL (advanced). The pipeline extracts, validates, "
     "deduplicates, detects conflicts, persists proposals and routes them through a human review workflow with a "
     "full audit trail, publishing only VERIFIED records as reference-only enrichment. Unattended approval into "
     "curated fields remains the declared next step.", bold=True)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "ASTROVA-TRUSTED-DATA-REFINEMENT-REPORT.docx")
doc.save(out)
print("written", out)
