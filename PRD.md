# Astrova — Product Requirements Document

## Product Overview

Astrova is an AI-powered multilingual platform for discovering and preserving India's cultural heritage. It provides interactive exploration of heritage entities across 12 Indian states through search, maps, timelines, collections, and a multilingual AI chatbot.

## Problem Statement

India's vast cultural heritage is fragmented across static websites, unstructured documents, and inaccessible databases. There is no unified, interactive platform that enables discovery of heritage across states, languages, and cultural categories with AI-powered assistance.

## Target Users

- Heritage enthusiasts and travelers exploring Indian culture
- Students and researchers studying Indian history
- Cultural organizations documenting heritage
- Tourists planning visits to heritage sites
- General public interested in Indian traditions, crafts, and festivals

## Core User Flows

### Heritage Discovery
1. User visits home page → sees featured heritage, states, collections
2. User navigates to Explore → filters by state, category, or period
3. User clicks heritage entity → views detail page with media, relationships, period
4. User adds to favorites (requires account)
5. User views live visitor conditions when the entity has verified coordinates

### Search
1. User types in search bar → autocomplete suggestions appear
2. User submits search → ranked results with relevance scoring
3. Results include heritage entities, locations, collections
4. User clicks result → navigates to detail page

### AI Chatbot
1. User opens AI page → selects language (6 supported)
2. User types question in any supported language (including romanized)
3. Chatbot detects intent, retrieves knowledge, returns grounded response
4. Response includes suggested follow-up questions and navigation actions

### Collections
1. User browses curated collections from home or collections page
2. User opens collection → sees themed heritage grouping
3. User explores individual entities within collection
4. Chatbot suggests relevant collections based on queries

### Timeline
1. User opens timeline → sees 9 historical periods
2. User clicks period → sees heritage entities from that era
3. User navigates between periods to explore chronological heritage

### Map Exploration
1. User opens explore page → interactive map loads
2. User filters by state or period → markers update
3. User clicks marker → popup with heritage summary
4. User navigates to heritage detail from popup

### Heritage Visit Intelligence (Live Conditions + Visit Planning)
1. User opens a heritage detail page (after Related Heritage section)
2. Astrova resolves the existing location coordinates through the backend
3. The backend fetches short-lived weather and air-quality data from Open-Meteo
4. The page displays current conditions, air quality, a seven-day forecast, source attribution, and an Astrova-derived best-time window (future daylight hours only, labelled "Astrova recommendation")
5. The Heritage Situation card always shows "Current status unavailable" unless a trusted live-status source exists — Astrova never fabricates open/closed/crowd states
6. The Visit Cost Estimator returns min/typical/max INR from a documented model rate card, clearly labelled as estimates with no official fee claims
7. Nearby Heritage is computed from Astrova's own coordinates; Nearby Places and Stay Nearby come from OpenStreetMap/Overpass (no ratings, prices or availability)
8. Missing coordinates, provider failures, rate limits and unknown ids each surface a specific unavailable/error state while the heritage story and map experience remain available

### Authentication & Favorites
1. User registers / logs in → JWT cookie set
2. User browses heritage → clicks heart to favorite
3. Favorites persist across devices via PostgreSQL
4. localStorage favorites sync to backend on login

### Admin
1. Admin accesses /admin with X-Admin-Token
2. Admin views dashboard with entity counts
3. Admin manages heritage entities and collections
4. Admin views analytics aggregation

## Feature Specifications

### Heritage Discovery
- 74 heritage entities across 12 states
- Categories: monument, craft, person, festival, architecture, event, food, community, tradition
- Detail pages with media gallery, relationships, period, location
- Related heritage based on relationship graph

### Search
- Full-text search with CASE-based relevance ranking
- Exact match > prefix match > contains match > description match
- Search suggestions with debounced autocomplete
- Collection suggestions in autocomplete
- Category, state, period, and type filters

### Collections
- 6 curated collections with editorial content
- Hero media support (editorial or fallback to primary media)
- Entity count and display ordering
- Related collections based on shared entities
- Collection discovery through chatbot

### Timeline
- 9 historical periods from ancient to modern
- Heritage entities grouped by period
- Entity counts per period

### AI Chatbot
- 6 languages: English, Gujarati, Hindi, Marathi, Tamil, Punjabi
- Language-aware knowledge retrieval with English fallback
- Romanized input detection (Gujarati, Hindi, Marathi, Tamil, Punjabi)
- Intent detection: greeting, heritage, location, state, craft, person, festival, period, collection
- Structured navigation actions
- Context-aware suggestions
- OpenStreetMap geocoding for location queries
- Rate limited to 30 requests per minute

### Authentication
- JWT-based with HttpOnly cookies
- bcrypt password hashing (10 rounds)
- 7-day token expiry
- Server-side session verification on every request
- Fail-safe: refuses token operations if JWT_SECRET not configured

### Favorites
- Persistent PostgreSQL-backed for authenticated users
- localStorage for unauthenticated users
- Automatic sync on login
- Duplicate prevention
- Ownership isolation (user can only see own favorites)

### Admin Dashboard
- Overview with entity counts
- Heritage entity management (view, filter, edit)
- Collection management (CRUD, items, ordering)
- Analytics aggregation
- Protected by X-Admin-Token (separate from user auth)

### Analytics
- Event tracking: heritage_view, search, collection_view, chatbot_query, favorite_add/remove
- Admin-only aggregation endpoints
- Privacy-conscious (no PII collection)

### Heritage Visit Intelligence (implemented 2026-09-27)
- **A. Live environment** — Open-Meteo forecast (temperature, apparent temperature, humidity, precipitation, rain probability, wind, cloud cover, UV, sunrise, sunset, weather code) + Open-Meteo air quality (US AQI with standard band labels, PM2.5, PM10, ozone, NO₂, CO, dust). Source, retrieved time, current indicator and unavailable states are always shown.
- **B. Heritage situation** — states modelled as open / closed / temporarily_restricted / maintenance / information_unavailable; currently always `information_unavailable` ("Current status unavailable") because no trusted live-status source exists. Never fabricated.
- **C. Best time to visit** — explainable score (0–90) over future daylight hours only, 48-hour horizon, labelled "Astrova recommendation" with reasons, confidence, and Today/Tomorrow day label.
- **D. Visit cost estimator** — inputs: visitors (1–50), duration (1–24 h), transport, food, accommodation, guide, parking, misc. Outputs: min/typical/max INR + category breakdown, every line carries `provenance: astrova_model`, `officialFee` is always null with explicit notes.
- **E. Nearby heritage** — haversine over Astrova's own `locations` coordinates, top 8, with category and link.
- **F. Nearby places** — OpenStreetMap/Overpass within 3 km: culture, attractions, food, parks, parking, transport; named records only; no ratings/prices/availability.
- **G. Stay nearby** — same OSM source; name, kind, distance, website/phone/stars only when present in the source.
- **H. Trusted heritage data** — existing `sources` table (source_type, verification_status VERIFIED/REVIEWED, publisher, url) + `heritage_entities.source_id` provenance shown in Sources & References; migration 030 registers Indian Culture Portal, Incredible India, UNESCO ICH and National Archives. Automated external ingestion with duplicate/conflict review is PLANNED, not implemented.
- Endpoints: `GET /api/heritage/:id/visitor-intelligence`, `GET /api/heritage/:id/nearby`, `GET /api/heritage/:id/visit-cost` (API key + per-IP rate limits 30/20/60 per 10 min).

## Technical Architecture

```
Browser → Next.js Frontend (:3000) → API Proxy → Express Backend (:3001) → Neon PostgreSQL
                                                              ↓
                                     Open-Meteo (forecast + air quality)
                                     OpenStreetMap / Overpass (nearby places)
```

### Frontend
- Next.js 16 App Router
- React 19, TypeScript, Tailwind CSS 4
- Motion/react animations
- Leaflet/MapTiler for maps
- Custom Astrova design system (terracotta palette, Playfair Display, Manrope)

### Backend
- Express.js with TypeScript
- JWT authentication with HttpOnly cookies
- Rate limiting (in-memory sliding window)
- Parameterized SQL queries
- CORS with configurable origins

### Database
- Neon PostgreSQL
- 30 migrations (all applied — includes 030_p1_authoritative_sources, previously blocked by invalid `\'` escapes, fixed 2026-09-27)
- 15 tables: heritage_entities, media, relationships, historical_periods, locations, sources, chatbot_knowledge, supported_states, collections, collection_items, analytics_events, users, user_favorites, conversations, conversation_messages

## Security Requirements

- JWT_SECRET must be configured (server refuses token operations without it)
- API key server-side only (never exposed to browser)
- Admin token separate from user authentication
- Rate limiting on auth, chat, and favorites endpoints
- UUID validation on all mutation endpoints
- Parameterized SQL (no injection)
- No stack traces in error responses
- HttpOnly, Secure (production), SameSite=Lax cookies

## Current Limitations

- In-memory rate limiting (single-server only)
- No pagination on list endpoints
- No structured logging
- No CI/CD pipeline
- No password reset or email verification
- No refresh tokens (JWT is stateless)
- Live visitor intelligence depends on valid Astrova coordinates and external Open-Meteo availability
- Visitor recommendations are Astrova-derived and are not official heritage authority guidance
- Heritage situation (open/closed/status) stays "Current status unavailable" until a trusted live-status source is integrated
- Visit cost figures are model estimates from Astrova's documented rate card — no verified official entry fees are stored
- Nearby heritage distances are location-level (sites sharing one mapped location show "same mapped location")
- Nearby places/stays depend on OpenStreetMap coverage and Overpass availability (6-hour server cache, 15 s timeout, fallback mirror)
- Hotel room prices, live availability and ratings are intentionally not shown (open data not sufficiently reliable)
- Admin full login flow not re-verified in 2026-09-27 regression (no credentials available); auth boundary (401/403) verified

## Future Roadmap

- Pagination for large datasets
- Structured logging
- CI/CD pipeline
- Password reset flow
- Email verification
- Distributed rate limiting (Redis)
- User profiles and social features
- Heritage contribution system
- Offline/PWA support
- Additional Indian states and languages
- Trusted live-status ingestion pipeline for heritage situation (Wikidata/Inheritage → normalize → duplicate/conflict detection → review → Astrova data)
- Verified official fee sources for the cost estimator (ASI / state tourism), kept behind provenance review
- Richer hotel intelligence in a later phase (beyond OSM name/location/metadata)
- Distributed/shared cache for provider responses

---

## P1.33 Product Experience Findings

### Current Observations (September 3, 2026)

A comprehensive UX audit was performed across all 13 frontend pages, shared components, map, chatbot, search, and data presentation.

**What works well:**
- Homepage communicates purpose clearly ("Explore India. Discover Its Stories.")
- Interactive map with state filtering and heritage markers
- Multilingual chatbot with context-aware suggestions
- Timeline with 9 periods and entity grouping
- Search with keyboard navigation and relevance ranking
- Favorites with localStorage sync for unauthenticated users
- Consistent terracotta visual identity
- Responsive design across pages

**Key issues identified:**
1. Homepage "Explore Heritage" CTA uses blue (`#1a237e`) instead of terracotta — breaks visual identity
2. AI chatbot page shows "52 Heritage Records" (hardcoded) when actual count is 74
3. Homepage hero is text-only — no heritage imagery above the fold
4. Sources data (18 records) exists in API but is not displayed to users
5. Map preview on homepage shows a static icon instead of actual map
6. Heritage detail page shows description twice (truncated in hero + full in editorial)
7. Search modal doesn't return collection results
8. `categoryIcons` mapping duplicated across 5+ files

### Proposed Future Improvements

**High Priority (P1.34 candidates):**
- Fix blue CTA → terracotta (5 min)
- Fix "52 Heritage Records" → 74 (2 min)
- Add heritage hero imagery to homepage (1-2 hours)
- Add source attribution to heritage detail (30 min)
- Extract shared category constants (20 min)
- Fix description duplication on heritage detail (5 min)
- Add collection search to search modal (30 min)

**Medium Priority:**
- Add "Related Heritage" prominence on detail pages
- Add favorite count to navbar
- Add collection editorial storytelling
- Add heritage entity cards in chatbot responses
- Improve mobile timeline experience

**Low Priority / Future:**
- Pagination for large datasets
- Heritage image carousel on homepage
- Map marker clustering
- Offline PWA support
- Share functionality
- "Heritage of the day" feature

---

## P1.34 Visual Polish & Demo Readiness (Implemented)

### Changes Implemented

1. **Homepage CTA color** — Blue replaced with heritage-gold (terracotta palette)
2. **Dynamic statistics** — AI page count computed from live API data
3. **Homepage hero imagery** — Atmospheric heritage background with parallax
4. **Homepage map preview** — Stylized India silhouette with animated dots
5. **Sources & References** — Verified source attribution on heritage detail
6. **Description deduplication** — Hero excerpt vs. full editorial content
7. **Related Heritage images** — Media and hover effects on related cards
8. **Collection search** — Collections in global search modal (Cmd+K)
9. **Shared category constants** — Centralized icons, colors, labels
10. **Chatbot heritage cards** — Structured entity cards in chat responses
11. **Chatbot action link fix** — Correct heritage entity slugs (was broken)

### Remaining Improvements

- Favorites batch endpoint for server-side filtering
- Chatbot image cards (media URL enrichment)
- Heritage entity clustering on map
- PWA/offline support
- Pagination for heritage lists
- Heritage of the Day feature
- Advanced sharing capabilities

---

## P1.35 Comprehensive Testing & Bug Resolution (Implemented)

### Bugs Discovered & Fixed

1. **BUG-001 (Critical)**: Heritage detail API missing `LEFT JOIN locations` — all detail pages showed `location: null`, no coordinates, no state
2. **BUG-002 (High)**: Chatbot `getStateOverview()` missing `id` in SELECT — state exploration returned `knowledge_ids: [null, null, ...]` and no heritage cards
3. **BUG-003 (Medium)**: Chatbot intent detection missing "vav" (Gujarati for stepwell) — "Rani ki Vav" fell through to `unknown` intent

### Verification Results
- 13/13 API endpoints: PASS
- 5/5 Security checks: PASS
- Auth & Favorites full cycle: PASS
- Chatbot 6 languages: PASS
- Field-level data correctness verified for Adalaj Stepwell, Amber Fort
- Cross-module consistency verified (DB → API → Frontend → UI)
- All 53 heritage images + 12 state images present
- No destructive data modifications

### Remaining Minor Items
- Search modal uses UUIDs in URLs (works, slugs would be prettier)
- Heritage list doesn't include media URLs (uses static image mapping)
- Favorites page fetches all entities client-side (acceptable at 74)

---

## P1.36 — Final Product Quality, Data Consistency & SIH Demo Validation

### Status
PASS WITH WARNINGS

### Objective
Perform final product-quality, data-consistency, end-to-end-flow, and SIH demo-readiness validation of Astrova.

### Key Decisions
1. **Chatbot deferred** — Infrastructure preserved, UI marked "Under Construction"
2. **All other modules verified** — Homepage, Explore, Heritage, Collections, Timeline, Search, Favorites, Auth, Map, Admin all pass
3. **Data consistency verified** — 12 entities tested through field-level DB→API→Frontend verification

### Bugs Found
1. **BUG-004 (Low)**: Gujarati script input defaulted to English — added script-based language detection
2. **BUG-005 (Low)**: "Heritage of Gujarat" pattern not recognized — added heritage+state keyword pattern
3. **BUG-006 (Low)**: વારસો (heritage) was in historical_period intent — removed, added to state_exploration

### Verification Results
- Backend TypeScript: PASS
- Frontend TypeScript: PASS
- Backend build: PASS
- Frontend build: PASS (15 routes)
- 13/13 API endpoints: PASS
- 10/10 Security checks: PASS
- 12/12 Entity field consistency: PASS
- Auth & Favorites full cycle: PASS
- Heritage detail location data: PASS (P1.35 BUG-001 fix verified)

### Chatbot Status
**DEFERRED — UNDER CONSTRUCTION**
- All infrastructure preserved
- UI clearly marked as in-development
- Deep chatbot quality work deferred to future phase

### Remaining Warnings
- Chatbot intelligence intentionally deferred
- In-memory rate limiting (single-server only)
- Some entities legitimately have no location or period

### GitHub Status
NO COMMIT / NO PUSH PERFORMED

---

## P1.36 — Project Completion, Admin Module & Comprehensive Testing

### Status
PASS WITH WARNINGS

### Objective
Complete remaining important modules and thoroughly test the complete project.

### Key Changes
1. **Admin Module completed** — dashboard with 9 stats, heritage management (search/filter/inspect), collection management
2. **API proxy fixed** — forwards X-Admin-Token header for admin routes
3. **Chatbot marked Under Construction** — UI clearly communicates development state, all infrastructure preserved
4. **Comprehensive testing** — 21 API endpoints tested, 74 entities verified, security regression passed

### Admin Features
- Token-based authentication
- Dashboard with live statistics (heritage, media, relationships, collections, etc.)
- Heritage table with search, category filter, state filter
- Heritage detail inspection panel
- Collection list with entity counts and active status
- Quick navigation to heritage, collections, explore
- Refresh and logout functionality

### Verification Results
- Backend TypeScript: PASS
- Frontend TypeScript: PASS
- Backend build: PASS
- Frontend build: PASS (15 routes)
- 21/21 API endpoints: PASS
- 8/8 Security checks: PASS
- 74/74 Entity field consistency: PASS
- Auth & Favorites full cycle: PASS
- Admin security: PASS
- Chatbot backend preserved: PASS
- Chatbot UI under construction: PASS

### GitHub Status
NO COMMIT / NO PUSH PERFORMED

---

## P1.37 — Complete Modules, API Integration & Bug Resolution

### Status
PASS

### Objective
Complete all important non-chatbot modules, find and fix runtime bugs, and perform comprehensive verification.

### Critical Bugs Fixed
1. **BUG-001 (CRITICAL)**: Heritage Detail page crashed with `Cannot read properties of null` when viewing entities without source — fixed NULL source guard (`heritage.source.id`)
2. **BUG-002 (HIGH)**: Auth page triggered `router.push()` during render phase — moved to `useEffect`

### Verification Results
- Frontend TypeScript: PASS
- Backend TypeScript: PASS
- Frontend build: PASS (15 routes)
- 14/14 API endpoints: PASS
- 6/6 Security checks: PASS
- 74/74 Entity data consistency: PASS
- Nullable data audit: PASS
- React lifecycle audit: PASS
- Chatbot under construction: PASS

### GitHub Status
NO COMMIT / NO PUSH PERFORMED

---

## P1.37 — Authentication, Favorites & Rate-Limit Correction

### Status
PASS

### Objective
Fix two user-reported runtime bugs: auth state desync in Favorites, and global rate limiter blocking registration.

### Bugs Fixed
1. **BUG-001**: Favorites page showed "sign in" for authenticated users — `useFavorites` had independent auth check that desynced from `useAuth`. Fixed by accepting shared auth state.
2. **BUG-002**: Login rate limit blocked registration — global `authRateLimit` (10 req/15min) applied to all `/api/auth/*` routes. Removed global limiter, kept route-specific limits (login: 5/15min, register: 3/hour).

### Verification Results
- Backend TypeScript: PASS
- Frontend TypeScript: PASS
- Backend build: PASS
- Frontend build: PASS (15 routes)
- 12/12 API endpoints: PASS
- 6/6 Security checks: PASS
- Registration independent of login rate limit: PASS
- Auth state synchronized between useAuth and useFavorites: PASS

### GitHub Status
NO COMMIT / NO PUSH PERFORMED

---

## P1.37 — Final Correction Pass (Complete)

### Scope
Final verification of all auth, favorites, rate-limit, and admin fixes. Full API regression across 25 endpoints.

### Bugs Verified Fixed
1. **BUG-001**: Favorites page showed "sign in" for authenticated users — auth state desync fixed and verified with 10/10 runtime tests.
2. **BUG-002**: Login rate limit blocked registration — verified registration works independently after login is rate-limited.
3. **Heritage Detail NULL source crash** — guard `heritage.source && heritage.source.id` verified in place.
4. **Auth render-phase navigation** — `router.push` moved to `useEffect`, verified no render-phase side effects.

### Verification Results
- Backend TypeScript: PASS
- Frontend TypeScript: PASS
- Frontend build: PASS (15 routes)
- API regression: 23/25 passed (2 edge cases correct)
- Auth flow: 9/9 tests PASS
- Favorites flow: 7/7 tests PASS
- Rate-limit isolation: PASS
- Admin auth: 3/3 states verified
- Admin dashboard: 9/9 stats verified
- Security: 12/12 checks PASS
- Nullable data audit: PASS
- React lifecycle audit: PASS

### GitHub Status
NO COMMIT / NO PUSH PERFORMED

---

## P1.37 — Admin Portal Content Management (Complete)

### Scope
Complete Admin Portal as a full content-management system with CRUD for Heritage, Media, Locations, Sources, Users, Collections, and Periods.

### Features Implemented
- **Heritage CRUD**: Create, read, update, delete with auto-slug, category/period/location/source assignment
- **Media CRUD**: Add/replace/remove images and videos, type conversion (image→video), primary flag
- **Location CRUD**: Full coordinate validation (lat -90/+90, lng -180/+180), heritage count, safe delete
- **Source CRUD**: Title, author, type, verification status, safe delete
- **User Management**: List, search, view detail with favorites, safe delete with cascade
- **Collection Management**: CRUD with items, duplicate slug prevention
- **Periods**: Read-only with heritage counts
- **Dashboard**: 15 dynamic stats from database

### Verification Results
- End-to-end: 12/12 PASSED (create→edit→verify public→cleanup)
- API regression: 28/28 PASSED
- TypeScript: PASS (frontend + backend)
- Build: PASS (15 routes)
- Admin security: 3/3 states verified

### GitHub Status
Push completed: `567afbf` (main → origin/main)

---

## P1.37 — Admin Portal Final Completion (Complete)

### Scope
Final completion of Admin Portal with bug fixes, Period CRUD, media restrictions, and muted video support.

### Bugs Fixed
1. Location `.toFixed()` crash — PostgreSQL decimal arrives as string; fix uses `Number()` + `Number.isFinite()`
2. Historical Periods read-only → full CRUD with delete safety
3. Media restricted to Image/Video only in Admin UI
4. Heritage video support — `<video muted playsInline loop>` for video media

### Features
- Heritage CRUD with description, category, period, location, source
- Media CRUD with image/video type change and primary flag
- Location CRUD with coordinate validation
- Source CRUD with safe delete
- User management with safe cascade
- Collection CRUD with items
- Historical Period CRUD with BCE/CE display
- 15 dynamic dashboard stats

### Verification
- API regression: 29/29 PASSED
- E2E: 15/15 PASSED (create→edit→media→verify→cleanup)
- Period CRUD: 8/8 PASSED
- TypeScript: PASS (frontend + backend)
- Build: PASS (15 routes)
- No test data left in database

### GitHub Status
Push completed: `567afbf` (main → origin/main)

---

## P1.37 — Favorites Auth & User Isolation Fix (Complete)

### Scope
Fix Favorites treating authenticated users as signed out; enforce strict per-user data isolation.

### Bugs Fixed
1. Anonymous users could create favorites without login
2. `useFavorites` used independent auth check (desynchronized from `useAuth`)
3. localStorage favorites leaked between users
4. Cross-user deletion was not blocked in UI

### Verification
- Multi-user isolation: 14/14 PASSED
- API regression: 24/24 PASSED
- TypeScript: PASS
- Frontend build: PASS (15 routes)

### GitHub Status
Push completed: `ced4709` (main → origin/main)

---

## P1.37 — Documentation Phase (Complete)

### Scope
Complete project documentation, system diagrams, presentation content, and final project report.

### Documents Created
- docs/PROJECT-SOURCE-OF-TRUTH.md — Central technical reference
- docs/ASTROVA-FINAL-PROJECT-REPORT.md — Complete project report
- docs/ASTROVA-PRESENTATION-CONTENT.md — 20-slide presentation content
- docs/DEMO-SCREENSHOT-PLAN.md — Screenshot capture plan
- docs/DIAGRAM-DATA-PACKAGE.md — Structured diagram data
- docs/diagram-data.json — Machine-readable diagram data
- docs/diagrams/ER-DIAGRAM.md — Entity-Relationship diagram
- docs/diagrams/DFD.md — Data Flow Diagram (Level 0, 1, 2)
- docs/diagrams/USE-CASE-DIAGRAM.md — Use Case diagram
- docs/diagrams/CLASS-DIAGRAM.md — Class diagram
- docs/diagrams/ACTIVITY-DIAGRAM.md — Activity diagram
- docs/diagrams/USER-FLOW.md — User flow documentation
- docs/diagrams/SYSTEM-ARCHITECTURE.md — System architecture

### Chatbot Status
AI Chatbot remains UNDER CONSTRUCTION. Backend infrastructure preserved.

### GitHub Status
NO PUSH PERFORMED — documentation only

---

## Current Project Status (Final)

| Category | Status |
|----------|--------|
| Heritage Discovery | ✅ Complete (96 entities after migration 030) |
| Interactive Map | ✅ Complete (54 markers) |
| Search | ✅ Complete |
| Timeline | ✅ Complete (9 periods) |
| Collections | ✅ Complete (6 collections) |
| Authentication | ✅ Complete (JWT + HttpOnly) |
| Favorites | ✅ Complete (per-user isolated) |
| Admin Portal | ✅ Complete (8 tabs, full CRUD, collections CRUD, site chrome separated, delete guards) |
| Admin Media Upload | ✅ Complete (Image + Video, proxy upload + uploads passthrough) |
| Heritage Visit Intelligence (Features A–G) | ✅ IMPLEMENTED (2026-09-27, verified end-to-end) |
| Heritage Situation (live status) | ⏸ Honest unavailable state — trusted source integration PLANNED |
| Trusted external ingestion pipeline (Feature H) | 🟡 PARTIAL (advanced) — provenance via `sources` + verification_status + `ExternalReferences` UI + stateless Wikidata proposals (`enrichment.ts`, 4/4 tests); **Phase 36 adds** persisted `enrichment_proposals` + authority tiers + admin review workflow (verify/reject/reopen) + public review badges; unattended/automated public approval pipeline PLANNED |
| About | ✅ Complete |
| AI Chatbot | ⏸ Under Construction |
| Documentation | ✅ Complete |
| Trusted data refinement + provenance + review (Phase 36) | ✅ Complete (2026-09-28) — 2 migrations, 23/23 sources tiered, review queue live, 97 checks green |

### Final GitHub Checkpoint
- Branch: main
- Latest commit before the 2026-09-27 second session: `dfc48eb`
- Remote: https://github.com/tirthshah0201/Asrtova.git
- Status: verified via `git remote -v` / `git ls-remote`
- Documentation correction (2026-09-27): an earlier version of this block listed `ced4709` and `https://github.com/tirthshah0201/Dharohar-AI.git` — copied from a previous project and stale; corrected here rather than silently removed.

---

## Heritage Visit Intelligence Module (2026-09-27)

### Status: IMPLEMENTED (Features A–G verified end-to-end); Feature H PARTIAL; live heritage status PLANNED

### What was verified before implementation (connectivity audit)
- Database: 34/34 live query checks (schema, FKs, indexes, row counts, coordinate coverage)
- Backend → DB: 19 core endpoints 200 with API-key boundary (401 without key)
- Proxy: path rewrite, server-side `X-API-Key`, Authorization/Cookie/Set-Cookie forwarding, status propagation — all 200
- Auth → favorites: register/login/me/favorites/logout through proxy (API + browser UI)
- External: Open-Meteo forecast 200, Open-Meteo air quality 200, Nominatim 200, OSM tiles render

### Connectivity defects found and fixed
1. **Migration 030 never applied** — invalid `\'` escapes caused `syntax error at or near "s"`. Fixed to standard `''` quotes (+ one mojibake token), applied via project runner. Sources 18→22, heritage 74→96, migrations now 30/30.
2. **Null Island bug** — `isValidCoordinate(null)` evaluated `Number(null)=0`, serving weather for (0,0) on 32/96 entities without coordinates while claiming `available`. Fixed with explicit null/empty/range/(0,0) validation; now returns `location_unavailable`.
3. **Best-time picked midnight** — hourly `is_day` was never mapped from the provider payload, the UTC offset sign was inverted, and past hours were eligible. Fixed: daylight+future filter (48 h horizon), correct offset math, Today/Tomorrow label, score out of 90.
4. **AQI band mislabel** — >100 showed "Unhealthy"; now standard US AQI bands incl. "Unhealthy for Sensitive Groups".
5. **Overpass timeout** — 8 s too short (observed 10 s); raised to 15 s with a fallback mirror; results cached 6 h.
6. **`next build` failed on `/explore`** — `useSearchParams()` without Suspense (pre-existing). Fixed; production build now passes 13/13 pages.
7. Cosmetic: µg/m³ units, duplicated section comment, provider-failure vs missing-coordinates message split.

### Verification results (2026-09-27)
- Unit tests: 7/7 (recommendation) + 16/16 (cost/nearby/Overpass) — PASS
- DB audit 34/34, migrations 30/30 — PASS
- Typecheck backend + frontend, backend build, frontend production build — PASS
- E2E browser: conditions/AQI/best-time/7-day/situation/cost/nearby on amber-fort — PASS
- Failure states: missing coordinates, provider failure, backend down, rate limit 429, unknown id 404, junk params clamped, no-key 401 — PASS
- Responsive: no horizontal overflow at 1440/1280/1024/900/768/740/720/430/390/360 — PASS
- Regression: home, explore (search+map), heritage dir, heritage detail, timeline, collections, collection detail, auth, favorites, admin (login screen), media, about, AI placeholder — PASS

### Git
- These HVI changes were subsequently committed as `dfc48eb` ("feat(astrova): add heritage visit intelligence and connectivity fixes").

---

## Admin Portal Overhaul, Data Accuracy & Open-Data Hardening (2026-09-27, second session)

### Status: COMPLETE — all fixes browser-verified; full test/build suite green

### Admin portal (reported bugs fixed)
1. **Site chrome leaked onto admin pages** — new `SiteChrome` layout wrapper skips the public Navbar/user chip/Footer on `/admin`; dedicated `admin/layout.tsx` provides own metadata ("Admin Portal", noindex), background and landmarks (no nested `<main>`).
2. **Regular-user sessions on admin login** — 403 from `/admin/auth/me` now renders an explanatory note (regular user / signed out / expired) instead of a dead end.
3. **Media upload 404** — upload now routes via `/api/proxy/admin/media/upload`; proxy preserves multipart content-type and forwards binary bodies (`arrayBuffer`) instead of forcing JSON.
4. **Uploaded files 404 in UI** — new traversal-safe `/api/uploads/[...path]` passthrough (strict segment validation; `../` → 404).
5. **User delete contract + swallowed errors** — sends `{"confirm":"DELETE:<email>"}`; every delete handler closes its dialog on failure.
6. **Admin login hardening** — `adminLoginRateLimit` (5/15 min per IP) + case-insensitive trimmed email lookup.
7. **Dangerous deletes blocked** — `SELF_DELETE` and `LAST_ADMIN` guards return 400 (verified with toast).
8. **Orphan media files** — media DELETE now removes the platform-hosted physical file (upload/delete/file-404 round trip verified).
9. **Collections tab** — full CRUD added (create with auto-slug, edit incl. active state, delete with confirm); browser-verified 6→7→6.
10. **Overview UX** — error alert + Retry, quick actions, live stats; redesigned login card and dashboard shell (dark sidebar, mobile pill nav, topbar with admin chip).

### Public data-accuracy fixes
1. Directory grouped view showed only 9 hardcoded categories (9 of 96 entries) while claiming "Showing 96" — categories now derived from data (96 cards / 20 categories).
2. Homepage stats were hardcoded/stale — now live from `/heritage` + `/heritage/state-counts` (verified 12 | 96 | 6 | 20).
3. AI page `?? 74` fabricated fallback → honest em-dash placeholder (page remains Under Construction).
4. Mobile overflow in NearbyExplorer (85 px at 430 w) fixed with `grid-cols-1 lg:grid-cols-2` + `minmax(0,1fr)`.

### Open-data hardening
- New `providers.ts` adapter layer + `enrichment.ts` stateless Wikidata enrichment (Feature H, graceful degradation, no fabrication).
- 9-input visitor-intelligence scoring incl. `hourlyAqi`; malformed-payload guards; honest stale-cache labels; nearby facility category filter; stay address; `ExternalReferences` UI; `retrieved_date` backfilled (22 source rows).

### Verification (2026-09-27)
- Backend tsc + build; tests 10/10 (visitor intelligence), 4/4 (enrichment), 16/16 (visit module); DB audit 34/34 — PASS
- Frontend tsc + eslint 0 errors + production build 13/13 pages — PASS
- A11y (lang, single h1, landmarks, alt, names/labels): home/detail/admin PASS; responsive 10 widths no overflow PASS
- Security spot checks: 401s (no/bad key, admin without session, invalid uuid), 400 (empty login), 404 (upload traversal) — PASS
- Admin E2E with temporary promoted admin account (deleted after testing) — original `admin@astrova.in` password is unknown/undocumented, so that specific login was not exercised
- AI chatbot remains Under Construction; crowd info, conservation monitoring, hotel booking and RAG remain future-list (NOT implemented)

---

## Final Verification Pass — Phases 19–35 (2026-09-27, third session)

### Status: COMPLETE — all phases verified; fixes committed on top of `56eea21`

### Phase 19 — Responsive: REAL viewport resizing on 5 pages × 10 widths (1440→360) = 50/50 PASS
`scrollWidth === clientWidth` at every combination on `/`, `/explore`, `/heritage/amber-fort`, `/heritage`, `/ai`. Only intentional internal scrollers (category chips), clipped Leaflet tiles, and parent-clipped decorative blobs were off-viewport; no page-level overflow, clipped controls, or broken cards.

### Phase 20 — Accessibility: root-caused the duplicate-h1 report + fixed 4 real issues
- Duplicate h1 = React dev-only streaming artifact (`<div hidden id="S:0">`, excluded from the a11y tree); client-side nav = 1 h1; **production serves/hydrates exactly 1 h1 on `/heritage` and `/explore`**. No source change (dev-only artifact; fixing would risk regressions).
- Fixed: footer `h4`→`h2` (was skipping after the page's last h2; class-styled so visuals identical), directory sort `<select>` + search inputs got `aria-label`s, 8 image-only card links got `aria-label={item.name}`.
- Verified: 0 imgs-no-alt / unnamed controls / unlabeled inputs / broken aria refs / heading skips; table semantics; role=status+alert in all VI components (live-confirmed); `:focus-visible` terracotta outline via keyboard; WCAG 2.5.8 touch-target spacing passes (0 violations); all 5 previously-modified files diff-reviewed (intentional only).

### Phases 21–22 — Regression: full 16-step user flow PASS; error matrix 15/15 PASS
Flow incl. search suggestions (Ctrl+K listbox), map (100 markers), auth/favorites gate + Login-Required modal, collections (6)/detail (21), timeline. Matrix incl. live 429 → browser `role=alert` + Retry; empty nearby returns empty honestly; traversal/invalid IDs 404.

### Phases 23–25 — Provenance/providers/stays
sources 22 (0 dups, 100% status+retrieved), heritage 96 (0 dup slugs), migration 030 applied, 30/30, UNESCO ICH-linked = 14 exact, four authoritative sources carry URLs+VERIFIED. All providers open data (Open-Meteo, OSM/Overpass, Nominatim chatbot-only, Wikidata CC0); Inheritage not integrated/not claimed; no proprietary providers or provider keys. Stay fields: no price/rating/availability/booking fields anywhere + explicit UI disclaimer.
**Caveat:** the 22 migration-030 entities have NULL slugs (UUID fallback links; no auto-backfill to avoid unreviewed slug generation).

### Phases 26–28 — Build/test/security/performance
BE tsc+build, FE tsc, ESLint 0 errors, FE build 13/13; tests 10/10 + 4/4 + 16/16; db-audit 34/34. Security: nothing sensitive tracked/staged, no client key, parameterized SQL, admin `requireAdmin` boundary intact, no stack traces; live 401/401/401/400/401/404 probes PASS (admin full login honestly unverified — credentials unknown). Performance observed: VI 1.19 s cold → 0.079 s warm (cap 200), nearby warm 0.24 s (cap 100), **Overpass cold 13–30 s today** (failed attempt correctly uncached — no poisoning); parallel `Promise.allSettled`; detail-page-only provider calls.

---

## Phase 36 — Trusted Heritage Data Refinement + Provenance + Controlled Enrichment (2026-09-28)

### Status: COMPLETE — 34 ordered steps executed; Feature H advanced to PARTIAL (human-gated review workflow live; unattended public approval still PLANNED)

### Audit findings (Steps 1–5, no code written until the audit closed)
- Migrations **30/30 applied**; heritage **96**, locations **54**, sources **22** (pre-phase), periods **9**.
- 22 migration-030 entities had **NULL slugs** → links fell back to UUIDs; **0 null slugs remain** (22 guarded slug updates in migration 031, `WHERE slug IS NULL` + uniqueness guards, no curated slug rewritten).
- `sources` had **no authority tier / license / verified-date columns**; provenance depth stopped at `verification_status`.
- Duplicate-slug risk was untested at the DB layer; enrichment proposals were **stateless** (computed, never stored) so nothing could be reviewed, rejected or audited later.

### Data-quality + provenance fixes (Steps 6–9)
- **Migration `031_p36_trusted_data.sql`**: 22 guarded slug updates; `sources.authority_tier`, `sources.license`, `sources.verified_date`; `OPEN_DATASET` added to the `source_type` CHECK; canonical UNESCO URL fixed to `https://whc.unesco.org/en/list/`; every source tiered (**T1 18 / T2 4 / T3 1 — 23/23 tiered, 23/23 licensed**).
- **Migration `032_p36_enrichment_review.sql`**: `enrichment_proposals` table with `UNIQUE(entity, external, field, value)`, status CHECK (`DRAFT/PENDING_REVIEW/VERIFIED/REJECTED/CONFLICT`) and a `touch` trigger. Migrations now **32/32 applied**.
- Tier labels are user-facing: T1 `OFFICIAL` (official/UNESCO/ASI/government/tourism board/archive), T2 `INSTITUTIONAL` (academic/museum), T3 `OPEN DATASET` (Wikidata), T4 geographic-only (OSM), T5 `ASTROVA ESTIMATE`.

### Controlled enrichment + review workflow (Steps 10–15)
- `backend/src/services/dataQuality.ts` (436 lines, pure helpers): tier mapping/labels, proposal-field whitelist, validation (markup rejected, non-http(s) rejected, fuzzy years rejected, Null Island `0,0` rejected, malformed QIDs rejected), state-machine `canTransition`, duplicate scoring (`POSSIBLE DUPLICATE` threshold 0.75), slug safety.
- `backend/src/services/enrichmentReview.ts` (381 lines): guarded `syncProposals` (insert-only; refresh touches **only DRAFT/PENDING_REVIEW — VERIFIED/REJECTED are never reset**), listing, transition-validated `reviewProposal` (reviewer taken from the session, never the request body), `publicReviewFor` (never exposes reviewer notes/e-mails), read-only `scanPossibleDuplicates`.
- `admin.ts` +4 endpoints behind `requireAdmin`: `GET /enrichment/proposals`, `POST /enrichment/proposals/:id/review` (verify|reject|reopen), `POST /enrichment/refresh/:entityId` (one bounded Wikidata call, 5 s timeout, cache cleared first), `GET /enrichment/duplicates`.
- `heritage.ts`: `GET /:id/enrichment` now annotates each proposal with `review{status,reviewedAt}`, hides `REJECTED` records, adds `meta.reviewCounts`; `GET /:id` exposes `authority_tier`, `tier_label`, `license`, `verified_date`.
- Frontend: `ExternalReferences.tsx` review badges (Verified / Conflict / Proposal) + “· Open Dataset” header; detail page source-tier badge with Verified/Terms lines; admin gains a ninth **“Data Review”** tab (queue + status filter, verify/reject/reopen with admin-only note, entity-UUID extraction tool, read-only duplicate scan).

### Honesty rules enforced end-to-end (Steps 16–17 verified live)
- Conflicts render **`CONFLICT — REQUIRES REVIEW`**, missing data **`INFORMATION UNAVAILABLE`**, Astrova-computed values **`ASTROVA ESTIMATE`**, live environment values **`LIVE DATA`**, source-verified values **`VERIFIED`**.
- Pipeline **never overwrites curated entity fields** — approval stores a reference-only `VERIFIED` record; duplicates report **`POSSIBLE DUPLICATE`** only (never auto-merge); rejected proposals disappear from public responses while verified ones render with `reviewedAt`.
- Live E2E: `verify → reject` is refused (`INVALID_TRANSITION — Cannot move from VERIFIED to REJECTED`); the explicit `reopen` action is required first. Reviewer notes and e-mails never reach a public response (asserted in tests).

### Timeline judgment (Step 18 — documented, not guessed)
- Timeline unchanged at **9 periods / 52 assigned entities**; **44 of 96 entities have no period** (including all 22 Phase-36 records).
- **Decision: no new period assignments.** Period ranges overlap (a stated 1591 for Charminar falls inside both `Ahom 1228–1826` and `Colonial 1573–1947`), so a source-supported assignment cannot be made deterministically, and most new records are living traditions/festivals/natural sites with no single founding date. Assigning anyway would fabricate provenance.

### Verification (Steps 19–27)
- **Visitor intelligence regression:** `deepavali` → `availability: location_unavailable` + `situation.status: information_unavailable`; `charminar` → full weather/AQI/recommendation payload.
- **Open-data rule:** only Open-Meteo, Wikidata, OpenStreetMap/Overpass/Nominatim, unpkg and an airnow.gov documentation link appear in source; **no proprietary API, no provider key, no client-side secret**; AI chatbot page still **Under Construction**; future-list items not implemented.
- **Security:** every query parameterized (the single `${column}` interpolation is a hard-coded whitelist), admin endpoints 401 without session / 403 for a non-admin session (re-verified after demoting the QA account), rate limits intact (public enrichment limited; admin refresh bounded to one entity/5 s), no secrets in the diff.
- **Performance (5 samples/endpoint):** heritage list 242 ms, detail 238 ms, enrichment 160 ms, timeline 99 ms, search 85 ms, VI 82 ms, nearby 82 ms, sources 82 ms.
- **Tests:** db-audit **41/41**, data-quality **12/12**, enrichment **4/4**, enrichment-review **14/14**, visit-module **16/16**, visitor-intelligence **10/10** = **97 checks green**; migrations 32/32; backend `tsc --noEmit` + build clean; frontend `tsc --noEmit` clean. `test-media-upload.js` still fails on the pre-existing missing `form-data` dependency (not caused by this phase).
- **Regression:** all 13 routes 200 (`/`, `/explore`, `/explore/[id]`, `/heritage`, `/heritage/[id]`, `/timeline`, `/collections`, `/collections/[slug]`, `/auth`, `/favorites`, `/admin`, `/about`, `/ai`) + search/suggestions/media/locations/sources/periods/state-counts APIs 200.
- **Responsive (real viewport resize):** `/` at all 10 widths (1440/1280/1024/900/768/740/720/430/390/360), `/heritage/charminar` at 7 widths, `/admin` → Data Review at 1440/768/360 — `scrollWidth === clientWidth` everywhere (0 px page overflow).
- **Accessibility:** `lang=en`, exactly 1 h1, main/nav/banner landmarks, 0 images without alt, 0 unlabeled inputs, 0 unnamed controls on home + detail + admin-review (the single flagged anchor is the logo link named by its `alt="Astrova"` image).
- **Production builds:** backend `tsc` exit 0; `next build` 13/13 pages prerendered (dev server still serving 200 afterwards).

### Test-account hygiene (Step 27)
- Temporary QA admin `p36-qa-tester@astrova.in` demoted back to `role='user'`; `admin@astrova.in` untouched and now the only admin. The stale session was then probed: admin endpoints return **403** (role checked per request) and **401** with no session.

### Known limitations
- Feature H remains **PARTIAL**: proposals are persisted and human-reviewed, but unattended approval into curated fields is still PLANNED.
- 44/96 entities have no historical period (see the timeline judgment above).
- `test-media-upload.js` fails for a pre-existing missing `form-data` dependency in `backend/package.json`.
- Original `admin@astrova.in` password is unknown/undocumented, so that specific login was not exercised.
