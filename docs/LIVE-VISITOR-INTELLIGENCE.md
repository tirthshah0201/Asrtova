# Live Visitor Intelligence

## Status

Implemented for heritage detail pages. The feature is additive and does not change the heritage schema or permanent heritage data. Extended during the 2026-09-27 sessions: provider metadata adapter, nine-input scoring with hourly AQI, malformed-payload guards, and a source-provenance surface (`ExternalReferences`).

## Architecture

`Heritage detail -> Next.js /api/proxy -> Express /api/heritage/:id/visitor-intelligence -> Visitor Intelligence service -> Open-Meteo`

The service resolves the existing `heritage_entities.location_id` relationship and uses the verified latitude and longitude in `locations`. The browser never receives a server credential and cannot provide an arbitrary provider URL. Provider metadata (name, purpose, license, attribution/terms) is registered as `ProviderMeta` records in `backend/src/services/providers.ts`, and all external requests share one `fetchJson` timeout/JSON-shape guard.

## APIs and attribution

- Open-Meteo Forecast API provides current, hourly, and seven-day weather data.
- Open-Meteo Air Quality API provides current AQI and pollutant readings where available.
- Existing Leaflet/OpenStreetMap map infrastructure is preserved.
- The UI attributes weather and air quality to Open-Meteo and map data to OpenStreetMap contributors.
- No API key is required. No `OPEN_METEO_API_KEY` variable was added.
- Wikidata enrichment exists as a **stateless, proposal-only** service (`backend/src/services/enrichment.ts`, Feature H): extract → normalize → duplicate/conflict detection with full provenance (CC0 1.0). It never writes to Astrova heritage data; automated approval remains future work.

## Endpoint

`GET /api/heritage/:id/visitor-intelligence`

The identifier accepts the same UUID or slug form as the existing heritage detail endpoint. The response contains the resolved heritage/location identity, normalized current weather, hourly and daily forecast data, air quality, Astrova recommendation, source links, timestamps, stale state, and non-sensitive provider errors.

Entities without valid coordinates return a successful `location_unavailable` response. They do not receive guessed or fabricated coordinates. Malformed provider payloads are guarded: bad fields degrade to honest partial data with `errors[]` instead of crashing or being cached.

## Caching and failure handling

The service uses an in-memory cache with a ten-minute TTL and a maximum of 200 coordinate/entity entries. This is consistent with the current single-server rate-limiter model and avoids a migration or duplicated weather table. A fresh cache hit avoids provider requests. On provider failure after an expired entry, the last response is returned with `meta.stale: true` and a visible cached indicator; weather-less responses are never cached, so recovery is immediate. Weather and air quality are fetched independently, so partial provider failure does not hide the other available dataset.

Provider requests are restricted to the two fixed Open-Meteo hosts and use a five-second abort timeout. The endpoint has a 30-request-per-10-minute per-IP limiter in addition to the existing API-key middleware. Provider errors are sanitized before reaching the browser.

## Recommendation algorithm

The "Best time to visit" result is an Astrova-derived recommendation, not an official authority statement and not a provider field. Each hourly forecast is scored 0–90 across **nine inputs** (weights sum to 90):

- temperature comfort (0–18)
- apparent / feels-like temperature (0–7)
- relative humidity (0–8)
- precipitation probability (0–12)
- precipitation amount (0–5)
- UV index (0–12)
- wind speed (0–8)
- air quality — US AQI for that hour (0–10; neutral credit when absent)
- daylight (0–10)

The highest-scoring available hour is shown as a three-hour window with a score, confidence, and reasons. Only future, daylight hours are eligible (48-hour horizon; past-only data falls back with low confidence). Missing fields receive neutral partial credit rather than fabricated values, and each credited input adds a human-readable reason.

## Frontend behavior

The detail page renders a responsive Live Visitor Intelligence section after location resolution. It includes current conditions, air quality, the derived recommendation, a seven-day forecast, last-updated/stale state, provider attribution, a retry action, skeleton loading state, and a missing-coordinate state. A separate `ExternalReferences` surface under Sources & References shows source links, verification status, and retrieved dates (22 rows backfilled). Existing story, map, media, sources, related heritage, favorites, authentication, and navigation remain separate.

## Database decision

No migration was required. Weather and air-quality payloads are temporary external observations, not permanent heritage facts. The database remains Astrova's source of truth for heritage identity, location, and coordinates.

The existing schema relevant to the feature is:

- `heritage_entities.location_id -> locations.id`
- `locations.latitude`
- `locations.longitude`
- `locations.state`

## Testing and coverage

Verification performed (final run 2026-09-27):

- root `npm run typecheck`: passed for frontend and backend
- backend + frontend production builds: pass (13/13 pages); ESLint `--quiet`: 0 errors on changed files
- `node backend/tests/test-visitor-intelligence.js`: **10/10** — valid, empty, partial, and malformed hourly data; daylight/future preference; offset regression; hourly-AQI scoring input
- `node backend/tests/test-enrichment.js`: **4/4** — Feature H proposal pipeline (never writes)
- `node backend/tests/test-visit-module.js`: **16/16**; `node backend/tests/db-audit.js`: **34/34**
- Browser E2E: success, loading, empty, unavailable, partial provider failure, rate limit, 404, 401, and responsive widths 1440→360 without horizontal overflow

For a live database coverage report, run this query against the configured PostgreSQL database:

```sql
SELECT
  COUNT(*) AS total_heritage_entities,
  COUNT(*) FILTER (WHERE l.latitude BETWEEN -90 AND 90 AND l.longitude BETWEEN -180 AND 180) AS valid_coordinates,
  COUNT(*) FILTER (WHERE l.latitude IS NULL OR l.longitude IS NULL OR l.latitude NOT BETWEEN -90 AND 90 OR l.longitude NOT BETWEEN -180 AND 180) AS missing_or_invalid_coordinates
FROM heritage_entities he
LEFT JOIN locations l ON l.id = he.location_id;
```

Then request the endpoint for every valid-coordinate UUID or slug and record provider failures separately. This was executed in the 2026-09-27 sessions (96 entities, 64 with valid coordinates, 32 correctly returning `location_unavailable`); earlier session notes about an unverified shell were superseded by that run.

## Limitations and future work

Weather is external data and can be delayed or unavailable. Air-quality coverage and update frequency depend on Open-Meteo. OpenStreetMap may be incomplete for local details, and it does not guarantee opening hours. The feature does not provide heritage opening/closing status, conservation condition, structural monitoring, RAG, or AI prediction. Missing Astrova coordinates prevent the feature. Hosted Open-Meteo usage is subject to its fair-use and non-commercial conditions. Future work may add distributed caching, controlled prefetching, richer weather-code presentation, and automated approval of the stateless Wikidata proposals after a separate data-governance review.
