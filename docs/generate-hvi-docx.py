"""Generate docs/HERITAGE-VISIT-INTELLIGENCE-IMPLEMENTATION-REPORT.docx (python-docx)."""
from docx import Document
from docx.shared import Pt, Inches, RGBColor
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
title = doc.add_heading("Astrova — Heritage Visit Intelligence", level=0)
for r in title.runs:
    r.font.color.rgb = TERRACOTTA
sub = doc.add_paragraph()
sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = sub.add_run("Module Implementation Report — Indian Heritage Discovery, Learning & Visitor Intelligence Platform\n27 September 2026 · Status: IMPLEMENTED (Features A–G verified end-to-end)")
r.italic = True

h1("1. Objective")
para("Expand Astrova from heritage discovery into heritage learning and visit planning with an honest, "
     "source-attributed, explainable module: LEARN → UNDERSTAND → CHECK CONDITIONS → PLAN VISIT → "
     "ESTIMATE COST → EXPLORE NEARBY → CONTINUE LEARNING — using only Astrova's own data plus open-data "
     "providers (Open-Meteo, OpenStreetMap/Overpass), never fabricating status, prices, ratings or availability.")

h1("2. Architecture")
mono(
"""Browser (heritage detail page)
   │  components: LiveVisitorIntelligence ─ VisitCostEstimator ─ NearbyExplorer
   ▼
Next.js /api/proxy/[...path]     (X-API-Key attached server-side; cookies/headers forwarded)
   ▼
Express backend (:3001)          requireDevelopmentApiKey + per-IP rate limits (30 / 20 / 60 per 10 min)
   ├─ visitorIntelligence.ts ──► Open-Meteo Forecast  +  Open-Meteo Air Quality   (5s timeout, 10-min cache)
   ├─ nearby.ts ───────────────► Neon PostgreSQL (own coordinates, haversine)
   │                        └──► Overpass API (OSM)  → fallback mirror          (15s timeout, 6-h cache)
   └─ visitCostEstimator.ts ───► local documented model rate card (no external calls)
   ▼
Neon PostgreSQL (heritage_entities · locations · sources · …  — 30 migrations, no schema change)"""
)
bullets([
    "Provider adapters are isolated services — a provider can be replaced without touching routes or UI.",
    "No new environment variables; all providers are keyless open data; no credentials ever reach the browser.",
])

h1("3. Implementation summary")
table(
    ["Feature", "Source", "Implementation"],
    [
        ["A — Live environment", "Open-Meteo (forecast + air quality)", "Current/hourly/daily weather, UV, humidity, wind, rain chance, cloud cover, sunrise/sunset; US AQI with standard bands, PM2.5/PM10/O3/NO2/CO/dust; source, retrieved time, current indicator, unavailable states"],
        ["B — Heritage situation", "none (honest state)", "Structured states modelled (open/closed/restricted/maintenance/unavailable); always 'Current status unavailable' until a trusted live source exists"],
        ["C — Best time to visit", "Astrova model over Open-Meteo", "Explainable 0–90 score over FUTURE DAYLIGHT hours (48h horizon), Today/Tomorrow label, reasons, confidence; labelled 'Astrova recommendation'"],
        ["D — Cost estimator", "Astrova model rate card", "visitors/duration/transport/food/stay/guide/parking/misc → min/typical/max INR + category breakdown; every line provenance='astrova_model'; officialFee always null"],
        ["E — Nearby heritage", "Astrova DB (locations)", "haversine over own coordinates, top 8, category + location + detail link"],
        ["F — Nearby places", "OpenStreetMap / Overpass", "3km radius: culture, attractions, food, parks, parking, transport; named records only; no ratings/prices/availability"],
        ["G — Stay nearby", "OpenStreetMap / Overpass", "hotels/guest houses/hostels; name, kind, distance, website/phone/stars only when present in source"],
        ["H — Trusted heritage data", "sources table + migration 030", "Provenance with verification_status (VERIFIED/REVIEWED), publisher, URL; 4 authoritative sources registered; automated ingestion pipeline PLANNED"],
    ],
)

h1("4. Data flow")
mono(
"""DB → provider/service → backend → API → Next.js proxy → frontend service → hook → component → UI → user result

visitor-intelligence:  location lookup ─► Open-Meteo ×2 (parallel) ─► normalize ─► situation
                       ─► recommendation (future+daylight) ─► 10-min cache ─► JSON ─► conditions/AQI/best-time cards
nearby:                location lookup ─► haversine over own rows ┐
                       Overpass query (15s, fallback, 6-h cache) ──┴► heritage/places/stays ─► explorer card
visit-cost:            entity existence check ─► clamped inputs ─► rate-card math ─► totals + lines ─► estimator card"""
)

h1("5. Important API flows (verified live)")
table(
    ["Request", "Result"],
    [
        ["GET /api/heritage/amber-fort/visitor-intelligence", "200 — 168 hourly, 7 daily, AQI 104 'Unhealthy for Sensitive Groups', best window 'Tomorrow, 6:00 am - 9:00 am' (score 90)"],
        ["GET /api/heritage/adalaj-stepwell/visitor-intelligence", "200 — availability 'location_unavailable' (no coordinates; formerly served Null-Island weather)"],
        ["GET /api/heritage/amber-fort/nearby", "200 — 8 nearby heritage, 30 places, 20 stays; 8.8s cold → 0.2s cached"],
        ["GET /api/heritage/amber-fort/visit-cost?visitors=3&…", "200 — ₹ min/typical/max with category breakdown, officialFee null"],
        ["All three endpoints without API key", "401"],
        ["VI endpoint request #31 within 10 min", "429 (verified)"],
        ["Unknown id / traversal input", "404 HERITAGE_NOT_FOUND"],
        ["Junk parameters (visitors=9999, transport=rocket…)", "200 with clamped values"],
    ],
)

h1("6. Database changes")
bullets([
    "No schema changes — existing locations/sources model supports the module; no redundant tables created.",
    "Migration 030_p1_authoritative_sources.sql was never applied (invalid \\' escapes caused a PostgreSQL syntax error); "
    "fixed to standard '' quoting and applied — sources 18→22, heritage entities 74→96, 14 UNESCO-ICH links, migrations 30/30.",
    "Post-migration verification: 34/34 audit checks, 19 FKs intact, no orphans, row counts recorded.",
])

h1("7. External data sources")
table(
    ["Service", "Purpose", "License / attribution", "Failure behaviour"],
    [
        ["Open-Meteo Forecast", "Weather, UV, sunrise/sunset", "Free non-commercial API; CC BY 4.0 — shown in UI", "5s timeout, stale reuse, errors[], no failure caching"],
        ["Open-Meteo Air Quality", "AQI + pollutants", "CC BY 4.0 — shown in UI", "Same isolation; other provider unaffected"],
        ["Overpass API (OpenStreetMap)", "Nearby places and stays", "ODB L — © OpenStreetMap contributors (UI footer)", "15s timeout, fallback mirror, heritage stays available, explicit error/stale state"],
        ["Astrova heritage database", "Nearby heritage, coordinates", "Own data (location-level)", "n/a"],
    ],
)

h1("8. Source / provenance model")
mono(
"""External source ─► normalization ─► duplicate detection ─► conflict detection ─► verification ─► approval ─► Astrova data
        (implemented today: sources table + verification_status + entity.source_id + UI 'Sources & References'
         + per-response sources[] attribution; automated ingestion pipeline = PLANNED)"""
)
bullets([
    "Every provider response carries meta.generatedAt (retrieved time), sources[] and stale/errors flags.",
    "Cost lines carry provenance='astrova_model'; official fees are never claimed (officialFee: null).",
    "Best-time is labelled 'Astrova recommendation' with an explicit non-official disclaimer.",
    "Migration 030 added: Indian Culture Portal, Incredible India, UNESCO Intangible Cultural Heritage, National Archives of India (all VERIFIED).",
])

h1("9. Testing")
table(
    ["Suite", "Result"],
    [
        ["test-visitor-intelligence.js (recommendation regressions)", "7/7 PASS"],
        ["test-visit-module.js (cost, haversine, Overpass normalization)", "16/16 PASS"],
        ["db-audit.js (live database)", "34/34 PASS"],
        ["Migrations", "30/30 applied"],
        ["Typecheck backend + frontend", "PASS (0 errors)"],
        ["Backend build", "PASS"],
        ["Frontend production build", "PASS (13/13 pages; fixed pre-existing /explore Suspense failure)"],
        ["API regression (direct + proxy)", "19 + 15 endpoints 200; auth chain 201/200/200; admin 401/403"],
        ["E2E browser (amber-fort, adalaj-stepwell)", "PASS — all cards, states, retry paths"],
        ["Failure states (backend down, 429, provider fail, 404, junk input)", "PASS"],
        ["Responsive 1440/1280/1024/900/768/740/720/430/390/360", "PASS — no horizontal overflow"],
        ["Regression: home, explore, heritage, detail, timeline, collections, auth, favorites, admin, media, about, AI placeholder", "PASS (AI still Under Construction)"],
    ],
)

h1("10. Security & performance")
bullets([
    "Security: API key server-side only; parameterized SQL; per-IP rate limits (verified 429); identifier validation (verified 404); sanitized errors (no stack traces in induced failures); keyless providers; no client-side secrets.",
    "Performance: 10-minute weather cache (1.2s cold → 0.16s warm); 6-hour Overpass cache (≈9s → 0.2s); parallel provider calls; cost estimator is local; no provider calls outside the heritage detail page; bounded caches.",
    "Future hardening: Redis-backed limits, circuit breakers, request-schema validation, distributed cache.",
])

h1("11. Known limitations")
bullets([
    "Heritage situation always 'Current status unavailable' — no trusted live-status open data exists; deliberately not fabricated.",
    "Cost figures are model estimates; no verified official entry fees stored.",
    "Nearby heritage distances are location-level ('same mapped location' when shared).",
    "Overpass/OSM coverage is uneven in rural areas; up to 6h stale cache (labelled).",
    "No hotel prices, availability or ratings by design.",
    "In-memory caches/limits are single-server; admin full login not re-verified (no credentials available).",
])

h1("12. Future improvements")
bullets([
    "Trusted live-status ingestion pipeline (Wikidata/Inheritage → normalize → duplicate/conflict detection → review → Astrova data) for Feature B.",
    "Verified official fee sources (ASI / state tourism) behind provenance review for Feature D.",
    "Wikidata/Wikimedia Commons enrichment of entity fields; richer hotel intelligence phase; distributed cache.",
])

h1("13. Final status")
table(
    ["Area", "Status"],
    [
        ["Connectivity audit + fixes", "VERIFIED (34/34 DB, full API matrix, builds)"],
        ["Features A, C, D, E, F, G", "IMPLEMENTED & VERIFIED end-to-end"],
        ["Feature B (situation)", "IMPLEMENTED (honest unavailable state); live-status source PLANNED"],
        ["Feature H (trusted data)", "PARTIAL — provenance in place; ingestion pipeline PLANNED"],
        ["Regression suite", "PASS"],
        ["Git", "branch main · working tree modified · NO commit · NO push"],
    ],
)

doc.save("HERITAGE-VISIT-INTELLIGENCE-IMPLEMENTATION-REPORT.docx")
print("written HERITAGE-VISIT-INTELLIGENCE-IMPLEMENTATION-REPORT.docx")
