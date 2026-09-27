# Heritage Visit Intelligence — Technical Report

**Date:** 2026-09-27 · **Scope:** backend services, API contracts, frontend components, failure modes, verified behavior.
Companion documents: `HERITAGE-VISIT-INTELLIGENCE-IMPLEMENTATION-REPORT.md` (26-section module report), `LIVE-VISITOR-INTELLIGENCE.md` (original A/C sub-feature note, retained for history).

---

## 1. Component map

```
frontend/app/heritage/[id]/page.tsx
 └── components/heritage/LiveVisitorIntelligence.tsx   ← GET /visitor-intelligence
      ├── components/heritage/VisitCostEstimator.tsx   ← GET /visit-cost
      └── components/heritage/NearbyExplorer.tsx       ← GET /nearby

backend/src/routes/heritage.ts
 ├── GET /:id/visitor-intelligence  → services/visitorIntelligence.ts → Open-Meteo ×2
 ├── GET /:id/nearby                → services/nearby.ts             → own DB + Overpass
 └── GET /:id/visit-cost            → services/visitCostEstimator.ts → local model

cross-cutting: middleware/apiKey (requireDevelopmentApiKey),
               middleware/rateLimit (30 / 20 / 60 per 10 min per IP),
               database (parameterized query), proxy route (X-API-Key server-side)
```

## 2. Provider adapter design

| Adapter | Timeout | Cache | Fallback | Failure contract |
|---|---|---|---|---|
| `fetchJson` (Open-Meteo, shared) | 5 s, `AbortController` | 10 min/key, 200 entries; **weather-less responses never cached** | stale previous response if present | `errors[]` populated, `stale: true` when serving previous data, provider error logged server-side only |
| `fetchOverpassFrom` | 15 s | 6 h/key (lat/lon rounded to 3 dp), 100 entries | second mirror `overpass.kumi.systems` | heritage list still returned; `places/stays` empty + `meta.errors` (or stale data with `stale: true`) |

Requests issued for weather + air quality run in parallel via `Promise.allSettled`, so one provider failing never blocks the other.

## 3. Key algorithms

### 3.1 Best time to visit (`buildRecommendation`)
1. Convert provider wall-clock strings to absolute instants: naive strings are parsed as UTC and **minus** `utc_offset_seconds` (the offset-sign bug fixed on 2026-09-27); zoned strings parse directly.
2. Candidate pool ladder: **future (≤48 h) + daylight (`is_day=1`)** → future (any) → all hours (fallback ⇒ `confidence: "low"` if chosen hour is past).
3. Score each hour 0–90: temperature 0–25 (18–30 °C band optimal), rain probability 0–20 (≤20 %), UV 0–20 (≤5), wind 0–15 (≤20 km/h), daylight +10/+4.
4. Pick the max; window = that hour → +3 h, labelled with **Today/Tomorrow/weekday** computed in the provider's wall clock; reasons list capped at 4 (appends "daylight hours").
5. Confidence from pool size: ≥12 high, ≥4 moderate, else low.

### 3.2 Coordinate validation (`hasRealCoordinates`)
Rejects `null`/`undefined`/`""` (JS `Number(null) === 0` was the Null Island root cause), non-finite values, out-of-range lat/lon, and the exact pair `(0, 0)` (placeholder "Null Island"). Used in **both** the visitor-intelligence and nearby services.

### 3.3 Cost estimator (`estimateVisitCost`)
- Billing model: `days = ceil(durationHours/8) ≥ 1`; `nights = days` when duration ≥ 6 h else 0; `rooms = ceil(visitors/2)`.
- Rate card (INR, min/typical/max): transport (walk 0; public 100/250/500 per person-day; private 1200/2200/4500 per group-day; taxi 1600/3000/6000), food (budget 300/500/800, mid 700/1200/2000, premium 2000/3500/7000 per person-day), stay (800/1500/3000, 2000/3500/6000, 5000/9000/20000 per room-night), guide 500/1500/4000 per visit, parking 20/60/250 per vehicle, misc 50/150/400 · 150/400/1000 · 400/1000/2500 per person.
- Every line carries `provenance: "astrova_model"` + a human-readable `basis`; totals are simple sums; `officialFee` is always `null` with explanatory notes.
- `normalizeCostInput` clamps: visitors 1–50 (default 2), duration 1–24 h (default 4), unknown enums fall back (verified: `transport=rocket`, `food=42`, `stay=castle`, `visitors=9999`, `durationHours=-5` → safe 200).

### 3.4 Nearby
- **Heritage (E):** join `heritage_entities → locations`, compute haversine in-process over ≤96 rows, sort, cap 8. Distance rounded to 0.1 km; `0` displays as "same mapped location" (location-level coordinates).
- **Places/stays (F/G):** Overpass QL union — `tourism` (museum/gallery/attraction/artwork/viewpoint/theme_park/zoo/aquarium), `amenity` (restaurant/cafe/fast_food/bar/pub, parking, bus_station), `railway` (station/halt), `leisure` (park/garden), `historic` (memorial/monument/castle/temple/archaeological_site) within 3 km; stays = `tourism` hotel/guest_house/hostel/apartment/motel. Normalization: drop unnamed and coordless records, dedupe by `name+rounded-coords`, classify into categories, compute distance, sort, cap 30 places / 20 stays. Fields exposed only when present: `website`, `phone`, `stars` (1–5 parsed). **No price/rating/availability/open-status field can be produced.**

## 4. API reference (verified live)

| Endpoint | Success | Notes |
|---|---|---|
| `GET /api/heritage/:id/visitor-intelligence` | 200, 38 KB | `:id` = UUID or slug; `availability:"location_unavailable"` when coordinates missing (adalaj-stepwell: weather null, error message set) |
| `GET /api/heritage/:id/nearby` | 200, 7.6 KB cold / 0.2 s warm | `meta.cached` marks cache hits; `meta.stale` only on provider failure with previous data |
| `GET /api/heritage/:id/visit-cost?…` | 200, ~1.1 KB | arbitrary/invalid query params clamped |
| unknown id (all three) | 404 `HERITAGE_NOT_FOUND` | incl. `../..` traversal input |
| no API key | 401 | before rate-limit consumption |
| >30 VI req/10 min | 429 (observed request #31) | sliding window, in-memory |
| backend/DB down | 502 `PROXY_ERROR` / safe page-level error UI | no stack traces anywhere |

## 5. Response shapes (abridged)

```jsonc
// visitor-intelligence
{ "success": true, "data": {
  "heritage": { "id", "name", "slug", "location": {…} | null },
  "availability": "available" | "location_unavailable",
  "situation": { "status": "information_unavailable", "label": "Current status unavailable",
                 "reason", "source": null, "checkedAt" },
  "weather": { "current": {temperature, apparentTemperature, relativeHumidity, precipitation,
                            weatherCode, windSpeed, cloudCover, uvIndex, sunrise, sunset},
               "hourly": [ {time, temperature, …, isDay} ],   // 168 rows
               "daily": [ {time, temperatureMax/Min, precipitationProbability, sunrise, sunset} ],
               "utcOffsetSeconds": 19800 },
  "airQuality": { "current": { index, category, pm25, pm10, ozone, nitrogenDioxide, carbonMonoxide, dust } },
  "recommendation": { "bestWindow": "Tomorrow, 6:00 am - 9:00 am", "score": 90,
                      "confidence": "high", "reasons": ["…"] },
  "sources": [ { "name": "Open-Meteo", "type": "weather and air quality", "url": … } ],
  "meta": { generatedAt, weatherFetchedAt, airQualityFetchedAt, stale, errors[] } } }
```

```jsonc
// visit-cost
{ "data": { "heritageId": "…", "estimate": {
  "currency": "INR", "visitors", "durationHours", "days", "nights",
  "lines": [ { "category", "min", "typical", "max", "basis", "provenance": "astrova_model" } ],
  "total": { "min", "typical", "max" }, "officialFee": null, "notes": [ "…estimates…" ] } } }
```

## 6. Failure-mode matrix (all executed)

| Scenario | Expected | Observed |
|---|---|---|
| Entity without coordinates (adalaj-stepwell) | `location_unavailable`, coordinates message, cost estimator still works, nearby message | ✅ |
| Open-Meteo weather fails, AQI ok | weather null + `errors[]`, UI provider-failure message with Retry, AQI may still render | ✅ (transient failure observed live, handled) |
| Open-Meteo both fail, no stale | both null, never cached, next request retries | ✅ (cache policy changed) |
| Overpass fails/times out | heritage + explicit places error, stale allowed | ✅ (504 during audit handled; mirror added) |
| Backend down | proxy 502 → page-level safe error + Try Again, no stack | ✅ |
| Rate limit exceeded | 429 + UI error card with Retry; restart clears (in-memory) | ✅ |
| Unknown id / traversal | 404 | ✅ |
| Junk cost params | clamped 200 | ✅ |
| Anonymous API | 401 | ✅ |
| Non-admin session on admin route | 403 (401 anonymous) | ✅ |

## 7. Verified data facts (live database)

- 15 content tables + the `_migrations` bookkeeping table (16 total in `information_schema.tables`), 19 FKs, indexes on heritage slug/name/location/category/source and locations slug/state/type.
- Migrations: **30/30 applied** (0 pending), including `030_p1_authoritative_sources.sql` recorded as applied by the project runner.
- `heritage_entities`: 96 rows post-migration (74 before); `locations`: 54 (54/54 with coordinates); `sources`: 22 (18 before); `relationships`: 49; `media`: 72; `collections`: 6; `collection_items`: 98; `users`: 5 (audit test account removed); `user_favorites`: 7 (audit favorite removed).
- 32/96 entities have `location_id IS NULL` → these now correctly get `location_unavailable` (previously served (0,0) weather).
- 14 entities linked to UNESCO ICH source after migration 030.

## 7b. Verification results (final pre-commit run)

- Backend TypeScript: exit 0 · Frontend TypeScript: exit 0 · Backend build: exit 0 · Frontend production build: exit 0 (13/13 pages).
- `test-visitor-intelligence.js`: **7/7 passed** (includes future-only + daylight + timezone-offset regression cases).
- `test-visit-module.js`: **16/16 passed** (cost clamping, haversine, same-location handling, situation honesty).
- `db-audit.js`: **34 checks, 0 failures**.
- Feature H (trusted-source provenance): **PARTIAL** — existing `sources` provenance + verification status surfaced, migration 030 added four authoritative sources; automated normalize → conflict → approval pipeline remains deferred.
- Heritage status: always `information_unavailable` without a trusted live source (deliberate; no fabricated open/closed states).
- Hotel room prices / availability / ratings: **not implemented** (OpenStreetMap name/distance/website/phone only).

## 8. Configuration

No new environment variables. Providers are keyless open data. Existing: `DATABASE_URL`, `JWT_SECRET`, `DEMO_API_KEY` (server-side proxy only), `PORT`. Rate limits and timeouts are code constants (`CACHE_TTL_MS`, `REQUEST_TIMEOUT_MS`, `MAX_CACHE_ENTRIES`).

## 9. Known engineering trade-offs

- In-memory cache/limits: single-server only (documented; Redis deferred).
- Overpass mirror list second endpoint unreachable from the audit network (45 s connect hang) — the 15 s per-endpoint timeout bounds worst-case failure latency to ~30 s.
- Haversine over all rows (96) chosen over SQL distance functions for portability/simplicity — fine at this scale.
- `situation` union type allows future statuses but always returns `information_unavailable` today — deliberate honesty constraint.
