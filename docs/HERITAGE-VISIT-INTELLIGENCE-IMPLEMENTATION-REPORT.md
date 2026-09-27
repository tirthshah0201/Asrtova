# Heritage Visit Intelligence — Implementation Report

**Module name:** Heritage Visit Intelligence (Astrova Visitor Intelligence)
**Date:** 2026-09-27
**Status:** IMPLEMENTED (Features A–G verified end-to-end) · Feature H PARTIAL · live heritage status PLANNED
**Repository branch:** `main` (working tree only — no commit, no push)

---

## 1. Module name

Heritage Visit Intelligence — the visit-planning module of Astrova that extends heritage discovery into learning, condition-checking, visit planning, cost estimation and nearby exploration: **LEARN → UNDERSTAND → CHECK CONDITIONS → PLAN VISIT → ESTIMATE COST → EXPLORE NEARBY → CONTINUE LEARNING**.

## 2. Objective

Give every heritage detail page an honest, source-attributed, explainable visit-planning layer built exclusively on Astrova's own data plus open-data providers, without ever fabricating status, prices, ratings or availability.

## 3. Why the module was added

Astrova previously answered *what is this place* but not *can I go, what will it be like, what will it cost, and what else is nearby*. The module closes that gap while staying heritage-first and open-data-only (no proprietary travel APIs).

## 4. Existing architecture used

- **Database:** Neon PostgreSQL — existing `locations.latitude/longitude`, `heritage_entities.location_id`, `sources` (provenance + `verification_status`), 30 migrations. **No new tables or columns were required.**
- **Backend:** Express + TypeScript; existing `query()` parameterized layer, `requireDatabase`, `requireDevelopmentApiKey`, in-memory `rateLimit` factory.
- **Proxy:** existing Next.js `/api/proxy/[...path]` route (server-side `X-API-Key`, Authorization/Cookie/Set-Cookie forwarding).
- **Frontend:** `useApi` hook, `ApiClient`, Astrova design system (terracotta/cream/charcoal, `font-display`), heritage detail page section order.
- **Provider adapters pattern:** `visitorIntelligence.ts` (Open-Meteo), `nearby.ts` (Overpass), `visitCostEstimator.ts` (model) — each isolated so a provider can be replaced without touching routes/UI.

## 5. Connectivity audit (performed before any feature code)

| Layer | Method | Result |
|---|---|---|
| Database | live query script (`backend/tests/db-audit.js`) | 34/34 PASS (schema, 19 FKs, indexes, row counts, 54/54 coordinates, orphan check) |
| Migrations | project runner status | 29/30 applied → **defect found** (see §6) |
| Backend → DB | 19 core GET endpoints with API key | all 200; 401 without key |
| Auth chain | register/login/me/favorites/logout through proxy | 201/200/200/201/200 → 401 after logout |
| Proxy | path rewrite, key injection, header/cookie forwarding, status propagation | all verified (10 endpoints, both direct and proxied) |
| External: Open-Meteo Forecast | live request | 200 (168 hourly, 7 daily) |
| External: Open-Meteo Air Quality | live request | 200 (US AQI, PM2.5, PM10, O₃, NO₂, CO, dust) |
| External: Nominatim | live request | 200 |
| External: OSM tiles / Leaflet | browser | map renders |
| Frontend pages | browser sweep | home, explore, heritage, detail, timeline, collections, auth, favorites, admin, about, AI placeholder all render |
| Typecheck baseline | `tsc --noEmit` both packages | 0 errors |

## 6. Problems discovered

1. **Migration 030 never applied** — invalid `\'` escapes → `syntax error at or near "s"` in PostgreSQL; runner aborted before recording it. Four authoritative sources and 22 verified heritage entities silently absent from production.
2. **Null Island bug** — `isValidCoordinate(null)` evaluated `Number(null) = 0`, so the 32/96 entities without coordinates received weather for lat 0/lon 0 while reporting `availability: "available"` (confirmed via API response timestamps in UTC).
3. **Best-time returned midnight windows** — three stacked root causes: provider `is_day` was requested but **never mapped** into hourly rows (daylight filter was a no-op), the location UTC offset was **added instead of subtracted**, and past hours were eligible.
4. **AQI category mislabel** — >100 mapped straight to "Unhealthy" (US AQI 101–150 is "Unhealthy for Sensitive Groups").
5. **Overpass timeout too aggressive** — 8 s while the endpoint routinely takes ~10 s; plus single-endpoint dependency.
6. **`next build` failed** (pre-existing) — `/explore` used `useSearchParams()` without a `<Suspense>` boundary; production build impossible.
7. **Wrong unavailable message** — UI conflated "provider failed" with "coordinates missing".
8. **Failure caching** — a provider failure could be cached for the full 10-minute TTL, delaying recovery.
9. Cosmetic: `ug/m3` instead of µg/m³, duplicated section comment, misleading `stale` flag on fresh cache hits.

## 7. Root causes

See §6 — each defect was traced to its cause (SQL string escaping semantics, JS `Number(null) === 0`, missing payload field mapping, offset sign error, provider latency measurement, Next.js static-generation requirement, UI state conflation, cache policy).

## 8. Fixes applied

1. Migration file corrected (`\'` → `''`, mojibake token) and applied via `node database/migrate.js migrate` → sources 18→22, heritage 74→96, **migrations 30/30**.
2. `hasRealCoordinates()` — explicit null/empty rejection, range check, exact (0,0) rejection; entity returns `location_unavailable`.
3. `isDay` mapped from `is_day`; `buildRecommendation(hourly, utcOffsetSeconds)` filters to **future + daylight** hours on a 48-hour horizon with correct offset math and a **Today/Tomorrow** label; past-only data falls back with `confidence: low` (regression-tested).
4. Standard US AQI bands (Good → Hazardous).
5. Overpass timeout 15 s, fallback mirror (`overpass.kumi.systems`), 6-hour in-memory cache (200 entries bound), `User-Agent` set.
6. `/explore` wrapped in `<Suspense>` — **production build passes 13/13 pages**.
7. UI splits `location_unavailable` (coordinates message) from `available` + null weather (provider-failure message with Retry).
8. Weather-less responses are never cached; provider failures are logged server-side only.
9. µg/m³ units, comment cleanup, `meta.cached` vs `meta.stale` distinction.

## 9. Files modified

| File | Change |
|---|---|
| `database/migrations/030_p1_authoritative_sources.sql` | SQL escape fixes + mojibake fix; applied |
| `backend/src/services/visitorIntelligence.ts` | coordinate validation, situation (B), AQI bands, recommendation rewrite, offset/day mapping, cache policy, logging |
| `backend/src/routes/heritage.ts` | added `GET /:id/nearby`, `GET /:id/visit-cost` |
| `backend/src/middleware/rateLimit.ts` | added `nearbyRateLimit` (20/10min), `visitCostRateLimit` (60/10min) |
| `frontend/components/heritage/LiveVisitorIntelligence.tsx` | full section: conditions + AQI + situation + best time + forecast + embedded cost/nearby |
| `frontend/app/heritage/[id]/page.tsx` | section moved after Related Heritage (spec order) |
| `frontend/app/explore/page.tsx` | Suspense boundary (build fix) |
| `PRD.md`, `report.md` | status/documentation updates |

## 10. Files created

| File | Purpose |
|---|---|
| `backend/src/services/nearby.ts` | Features E/F/G — haversine + Overpass adapter |
| `backend/src/services/visitCostEstimator.ts` | Feature D — model rate card + estimator |
| `frontend/components/heritage/VisitCostEstimator.tsx` | Feature D UI |
| `frontend/components/heritage/NearbyExplorer.tsx` | Features E/F/G UI |
| `backend/tests/test-visit-module.js` | 16 unit checks (cost, haversine, Overpass normalization) |
| `backend/tests/test-visitor-intelligence.js` | extended to 7 checks (daylight/future/offset regressions) |
| `backend/tests/db-audit.js` | reusable read-only DB connectivity audit |
| `docs/HERITAGE-VISIT-INTELLIGENCE-IMPLEMENTATION-REPORT.md` | this report |
| `docs/HERITAGE-VISIT-INTELLIGENCE-TECHNICAL-REPORT.md` | technical report |
| `docs/HERITAGE-VISIT-INTELLIGENCE-IMPLEMENTATION-REPORT.docx` | Word summary |

## 11. Database changes

- **No schema changes.** The existing model (locations coordinates, sources provenance) supports the module cleanly; no redundant tables created.
- **Data change:** migration `030_p1_authoritative_sources.sql` applied (additive, idempotent `ON CONFLICT DO NOTHING` + guarded updates): +4 sources (Indian Culture Portal, Incredible India, UNESCO ICH, National Archives of India), +22 heritage entities, +14 UNESCO-ICH-linked entities. Post-migration audit 34/34, FK integrity intact.

## 12. API changes

| Endpoint | Method | Auth | Rate limit | Response |
|---|---|---|---|---|
| `/api/heritage/:id/visitor-intelligence` | GET | API key | 30/10min/IP | `heritage`, `availability`, `situation`, `weather` (current/hourly/daily/utcOffsetSeconds), `airQuality`, `recommendation`, `sources`, `meta` (generatedAt, stale, errors) |
| `/api/heritage/:id/nearby` | GET | API key | 20/10min/IP | `entity`, `availability`, `nearby` {`heritage[]`, `places[]`, `stays[]`, `sources[]`, `meta` (radiusM, cached, stale, errors)} |
| `/api/heritage/:id/visit-cost` | GET | API key | 60/10min/IP | `heritageId`, `estimate` {currency, totals, lines[] with `provenance: astrova_model`, `officialFee: null`, notes[]} |

Error contracts: 404 `HERITAGE_NOT_FOUND`, 401 without key, 429 rate limited, 502 `VISITOR_INTELLIGENCE_UNAVAILABLE` / `NEARBY_UNAVAILABLE`, 500 sanitized `VISIT_COST_UNAVAILABLE`. Query parameters are clamped server-side (visitors 1–50, duration 1–24 h, enum fields fall back to defaults).

## 13. External service integrations

| Service | Purpose | Endpoint | Auth | Consumer | Failure behavior | Caching |
|---|---|---|---|---|---|---|
| Open-Meteo Forecast | weather + UV + sunrise/sunset | `api.open-meteo.com/v1/forecast` | none (free) | `visitorIntelligence.ts` | 5 s timeout, stale reuse, `errors[]`, no failure caching | 10 min in-memory |
| Open-Meteo Air Quality | AQI + pollutants | `air-quality-api.open-meteo.com/v1/air-quality` | none (free) | `visitorIntelligence.ts` | same | 10 min in-memory |
| Overpass API (OSM) | nearby places + stays | `overpass-api.de` → fallback `overpass.kumi.systems` | none (fair use) | `nearby.ts` | 15 s timeout, fallback mirror, heritage-only response with explicit error | 6 h in-memory, 100 entries |
| OpenStreetMap tiles | map (pre-existing) | `tile.openstreetmap.org` | none | Leaflet map | pre-existing | browser |

## 14. Provider / license / source information

- **Open-Meteo**: free non-commercial weather API, CC BY 4.0 data attribution — displayed in the UI footer and `sources[]`.
- **OpenStreetMap / Overpass**: data © OpenStreetMap contributors, **ODbL** — displayed in the Nearby footer and `sources[]`.
- **Astrova heritage database**: own data, distances labelled location-level.
- **Cost figures**: Astrova model rate card (documented in `visitCostEstimator.ts`), labelled estimates — **not** externally sourced prices; `officialFee` always null.

## 15. Frontend implementation

`heritage/[id]` page section order: Story → At a Glance → Explore the Place → Gallery → Sources & References → You May Also Explore → **Visitor Intelligence** → Ask Astrova (Under Construction) → Continue Exploring.

- `LiveVisitorIntelligence` — conditions card (temp, feels-like, condition, humidity, wind, rain, cloud cover, UV, rain chance, sunrise/sunset, "Current · Open-Meteo"), AQI card (standard band label, AQI, PM2.5/PM10/O₃ in µg/m³), situation card, best-time card (score/90, confidence, reasons, "Astrova recommendation" + non-official disclaimer), 7-day forecast, attribution with retrieved time; loading skeletons, error+Retry, coordinate/provider unavailable states.
- `VisitCostEstimator` — 8 inputs, min/typical/max cards, category table with per-line basis, estimate disclaimers, error+Retry.
- `NearbyExplorer` — nearby heritage (links, "same mapped location" note), places grouped by category with distance, stays with website/phone/stars-as-mapped, OSM ODbL attribution, unavailable states.
- Astrova visual language preserved (terracotta/cream/charcoal/gold, rounded-2xl cards, `font-display` headings).

## 16. Backend implementation

- Provider adapters as separate services with timeouts, bounded caches, stale signaling, fallback endpoint, structured `meta.errors`, sanitized route errors, server-side-only provider logging.
- Pure, exported testable functions: `buildRecommendation`, `estimateVisitCost`, `normalizeCostInput`, `haversineKm`, `normalizeOverpassElements`.
- Parameterized SQL only; UUID/slug validation on identifiers; cache-bounded LRU-ish eviction.

## 17. Data flow

```
Browser  →  Next.js page (useApi)  →  /api/proxy/* (X-API-Key server-side)
   →  Express route (API-key + rate limit)
       →  visitorIntelligence: DB(location) → Open-Meteo ×2 → normalize → situation + recommendation → 10-min cache
       →  nearby: DB(location) → haversine over own data ┐
              → Overpass (15 s, fallback, 6-h cache) ──────┴→ heritage/places/stays
       →  visit-cost: DB(existence check) → model rate card → totals + lines (provenance)
   ←  JSON { success, data, meta }  ←  proxy (status + Set-Cookie)  ←  component cards  ←  UI
```

## 18. Security

**Implemented:** API key injected only in the Next.js proxy (never `NEXT_PUBLIC`, never sent by the browser); JWT/HttpOnly cookie forwarding; parameterized SQL; per-IP rate limits on all three endpoints (30/20/60 per 10 min, verified 429); identifier validation (404 on unknown/path-traversal input, verified); input clamping; sanitized error responses (no stack traces — verified during induced failures); server-side-only provider logging; no third-party credentials exist for these providers (keyless open data); no secrets in client bundle.
**Future hardening:** distributed (Redis) rate limiting, strict CORS in dev, admin credential rotation, request-schema validation library, provider circuit breakers.

## 19. Performance

- 10-min VI cache (0.16 s repeat vs ~1.2 s cold), 6-h Overpass cache (0.2 s repeat vs ~9–10 s cold), weather-less responses never cached.
- Two Open-Meteo calls issued in parallel (`Promise.allSettled`); 5 s weather/AQI timeout; 15 s Overpass timeout with fair-use User-Agent.
- Cost estimation is a local calculation (no external calls); nearby heritage is an in-process scan of 96 rows.
- Rate limits prevent page-view storms from reaching providers; no provider calls on pages other than heritage detail.
- Dev-only duplicate fetches observed under React StrictMode (single in production build).

## 20. Accessibility

- Semantic section/heading hierarchy with `aria-labelledby` on all three cards; `aria-label` on retry buttons, loading regions and icon decorations (`aria-hidden`); form controls tied via `label htmlFor`; real `<table>` with `sr-only` caption and column headers for the cost breakdown; visible focus states on inputs; error states announced in text (not color-only); meaningful alt text on heritage images (pre-existing pattern); contrast follows the established palette (dark recommendation card uses white/gold text).

## 21. Responsive verification

Measured `scrollWidth` vs `clientWidth` at **1440, 1280, 1024, 900, 768, 740, 720, 430, 390, 360** — **no horizontal overflow at any width**; media queries confirmed active at mobile widths (hamburger nav present); card grids collapse 2→1 columns; cost table scrolls within its own container. Visual spot checks at mobile and desktop widths captured during verification.

## 22. Testing

- `backend/tests/test-visitor-intelligence.js` — **7/7** (scoring, empty/partial forecasts, daylight preference, future preference with offset, past-only low-confidence fallback, IST offset sign regression).
- `backend/tests/test-visit-module.js` — **16/16** (cost ordering/clamping/officialFee null/provenance/overnight model, haversine known distances, Overpass dedupe/unnamed-drop/coordless-drop/stay split/no fabricated fields/category classification/sorting).
- `backend/tests/db-audit.js` — **34/34**.
- Live E2E per feature (browser + API): success, loading, empty, unavailable, partial provider failure, timeout, invalid input, missing coordinates, API failure, rate limit, auth boundary.

## 23. Regression testing

Verified after the changes: homepage · explore (search + Leaflet map) · heritage directory (79 cards) · heritage detail (section order correct) · timeline · collections + collection detail · auth (UI login/logout) · favorites (toggle + list, authenticated) · admin portal (login screen; 401 anonymous / 403 non-admin) · media gallery · about · AI placeholder (**still Under Construction — not activated**). API regression: 19 direct + 15 proxied endpoints all 200; auth chain 201/200/200/200; admin boundaries 401/401. Typechecks, backend build, frontend production build (13/13 pages) — all pass.

## 24. Known limitations

- Heritage **situation** is always "Current status unavailable" — no trusted live-status open-data source exists; intentionally not fabricated.
- **Cost** figures are model estimates; no verified official entry fees are stored (`officialFee: null`).
- **Nearby heritage distances** are location-level; entities sharing a mapped location show "same mapped location" (not zero-distance precision).
- **Nearby places/stays** depend on OSM coverage (uneven in rural India) and Overpass availability; 6-hour cache means up to 6 h staleness (labelled `cached`).
- **Hotels**: no prices, availability or ratings by design; stars shown only as mapped in OSM.
- Coordinates are city/location-level, so weather is location-level, not monument micro-climate.
- In-memory caches/limits are single-server.
- Admin full login not re-verified (credentials unavailable in this environment).

## 25. Deferred work

- Trusted live-status ingestion for Feature B (Wikidata/Inheritage → normalize → duplicate/conflict detection → verification/approval → Astrova data) — architecture documented, pipeline PLANNED.
- Verified official fee sources for the cost estimator.
- Feature H automated ingestion pipeline (currently provenance via `sources` only).
- Wikidata/Commons enrichment of entity fields.
- Shared/distributed cache, provider circuit breakers, deeper hotel intelligence phase.

## 26. Final implementation status

| Item | Status |
|---|---|
| Connectivity audit + fixes (incl. migration 030) | **VERIFIED** (34/34 DB, 34 API probes, auth chain, builds) |
| Feature A — live environment | **IMPLEMENTED & VERIFIED** |
| Feature B — heritage situation | **IMPLEMENTED** (honest unavailable state; status source PLANNED) |
| Feature C — best time | **IMPLEMENTED & VERIFIED** (7/7 unit + live) |
| Feature D — cost estimator | **IMPLEMENTED & VERIFIED** (16/16 unit + live) |
| Feature E — nearby heritage | **IMPLEMENTED & VERIFIED** |
| Feature F — nearby places | **IMPLEMENTED & VERIFIED** |
| Feature G — stays | **IMPLEMENTED & VERIFIED** |
| Feature H — trusted data | **PARTIAL** (provenance in place; ingestion pipeline PLANNED) |
| Regression suite | **PASS** |
| Security / performance / responsive / a11y review | **PASS** (see §18–§21) |
| Documentation (PRD, report, module + technical + Word reports) | **COMPLETE** |
| Git | branch `main`, working tree modified, **no commit, no push** |
