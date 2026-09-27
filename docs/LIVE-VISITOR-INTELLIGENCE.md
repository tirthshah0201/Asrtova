# Live Visitor Intelligence

## Status

Implemented for heritage detail pages. The feature is additive and does not change the heritage schema or permanent heritage data.

## Architecture

`Heritage detail -> Next.js /api/proxy -> Express /api/heritage/:id/visitor-intelligence -> Visitor Intelligence service -> Open-Meteo`

The service resolves the existing `heritage_entities.location_id` relationship and uses the verified latitude and longitude in `locations`. The browser never receives a server credential and cannot provide an arbitrary provider URL.

## APIs and attribution

- Open-Meteo Forecast API provides current, hourly, and seven-day weather data.
- Open-Meteo Air Quality API provides current AQI and pollutant readings where available.
- Existing Leaflet/OpenStreetMap map infrastructure is preserved.
- The UI attributes weather and air quality to Open-Meteo and map data to OpenStreetMap contributors.
- No API key is required. No `OPEN_METEO_API_KEY` variable was added.
- Wikidata enrichment is not implemented.

## Endpoint

`GET /api/heritage/:id/visitor-intelligence`

The identifier accepts the same UUID or slug form as the existing heritage detail endpoint. The response contains the resolved heritage/location identity, normalized current weather, hourly and daily forecast data, air quality, Astrova recommendation, source links, timestamps, stale state, and non-sensitive provider errors.

Entities without valid coordinates return a successful `location_unavailable` response. They do not receive guessed or fabricated coordinates.

## Caching and failure handling

The service uses an in-memory cache with a ten-minute TTL and a maximum of 200 coordinate/entity entries. This is consistent with the current single-server rate-limiter model and avoids a migration or duplicated weather table. A fresh cache hit avoids provider requests. On provider failure after an expired entry, the last response is returned with `meta.stale: true` and a visible cached indicator. Weather and air quality are fetched independently, so partial provider failure does not hide the other available dataset.

Provider requests are restricted to the two fixed Open-Meteo hosts and use a five-second abort timeout. The endpoint has a 30-request-per-10-minute per-IP limiter in addition to the existing API-key middleware. Provider errors are sanitized before reaching the browser.

## Recommendation algorithm

The "Best time to visit" result is an Astrova-derived recommendation, not an official authority statement and not a provider field. Each hourly forecast is scored using:

- temperature comfort
- precipitation probability
- UV index
- wind speed
- daylight

The highest-scoring available hour is shown as a three-hour window with a score, confidence, and reasons. Missing fields receive neutral partial credit rather than fabricated values.

## Frontend behavior

The detail page renders a responsive Live Visitor Intelligence section after location resolution. It includes current conditions, air quality, the derived recommendation, a seven-day forecast, last-updated/stale state, provider attribution, a retry action, skeleton loading state, and a missing-coordinate state. Existing story, map, media, sources, related heritage, favorites, authentication, and navigation remain separate.

## Database decision

No migration was required. Weather and air-quality payloads are temporary external observations, not permanent heritage facts. The database remains Astrova's source of truth for heritage identity, location, and coordinates.

The existing schema relevant to the feature is:

- `heritage_entities.location_id -> locations.id`
- `locations.latitude`
- `locations.longitude`
- `locations.state`

## Testing and coverage

Static validation performed:

- root `npm run typecheck`: passed for frontend and backend
- backend `npm run build`: run after implementation as part of release verification
- frontend `npm run build`: run after implementation as part of release verification
- `node backend/tests/test-visitor-intelligence.js`: recommendation checks for valid, empty, and partial hourly data

For a live database coverage report, run this query against the configured PostgreSQL database:

```sql
SELECT
  COUNT(*) AS total_heritage_entities,
  COUNT(*) FILTER (WHERE l.latitude BETWEEN -90 AND 90 AND l.longitude BETWEEN -180 AND 180) AS valid_coordinates,
  COUNT(*) FILTER (WHERE l.latitude IS NULL OR l.longitude IS NULL OR l.latitude NOT BETWEEN -90 AND 90 OR l.longitude NOT BETWEEN -180 AND 180) AS missing_or_invalid_coordinates
FROM heritage_entities he
LEFT JOIN locations l ON l.id = he.location_id;
```

Then request the endpoint for every valid-coordinate UUID or slug and record provider failures separately. The current shell did not expose a confirmed live database connection or running browser session, so live entity counts, external-provider availability, and viewport screenshots are not claimed as verified here.

## Limitations and future work

Weather is external data and can be delayed or unavailable. Air-quality coverage and update frequency depend on Open-Meteo. OpenStreetMap may be incomplete for local details, and it does not guarantee opening hours. The feature does not provide heritage opening/closing status, conservation condition, structural monitoring, RAG, or AI prediction. Missing Astrova coordinates prevent the feature. Hosted Open-Meteo usage is subject to its fair-use and non-commercial conditions. Future work may add distributed caching, controlled prefetching, richer weather-code presentation, and optional source-attributed Wikidata fields after a separate data-governance review.
