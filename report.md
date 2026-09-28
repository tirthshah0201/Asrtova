# Astrova — Project Report

## Phase 36 — Trusted Heritage Data Refinement + Provenance + Controlled Enrichment (2026-09-28)

Status: **COMPLETE** — 34 ordered steps executed against checkpoint `67d7cb7`; Feature H advanced to **PARTIAL (advanced)**: a human-gated review workflow is live, unattended public approval remains PLANNED.

### What shipped
- **Migrations 30→32 (both applied):** `031_p36_trusted_data.sql` (22 guarded slug updates for the slug-less migration-030 entities, `sources.authority_tier` / `license` / `verified_date`, `OPEN_DATASET` source type, canonical UNESCO URL) and `032_p36_enrichment_review.sql` (`enrichment_proposals` with `UNIQUE(entity, external, field, value)`, status CHECK, touch trigger).
- **New backend services:** `dataQuality.ts` (tier model, proposal-field whitelist + validation, review state machine, duplicate scoring) and `enrichmentReview.ts` (guarded insert-only sync that never resets a `VERIFIED`/`REJECTED` decision, transition-validated review, public projection that strips reviewer notes/e-mails, read-only duplicate scan).
- **Four admin endpoints** behind `requireAdmin`: proposal listing, `verify|reject|reopen` review, single-entity bounded refresh, duplicate scan.
- **Public contract:** `GET /api/heritage/:id/enrichment` annotates `review{status,reviewedAt}`, hides `REJECTED`, returns `meta.reviewCounts`; `GET /api/heritage/:id` exposes `authority_tier`, `tier_label`, `license`, `verified_date`.
- **Frontend:** review badges in `ExternalReferences`, source-tier badge on the detail page, and a ninth admin tab **“Data Review”** (queue + status filter, verify/reject/reopen with admin-only note, UUID extraction tool, duplicate-scan panel).
- **Data state after the phase:** 23/23 sources tiered (T1 18, T2 4, T3 1) and licensed; 0 null slugs; 96 heritage entities unchanged.

### Decisions made honestly
- **Timeline (Step 18):** no period assignments were added. 44/96 entities remain unassigned because period ranges overlap (Charminar's stated 1591 sits inside both `Ahom 1228–1826` and `Colonial 1573–1947`) and most new records are living traditions or natural sites with no founding date. Timeline stays at 9 periods / 52 entities rather than fabricating provenance.
- **Review state machine:** `VERIFIED` and `REJECTED` cannot flip directly — `reopen` is an explicit admin action. Refreshes touch only `DRAFT`/`PENDING_REVIEW` rows.
- **Duplicates:** reported as `POSSIBLE DUPLICATE` only; conflicts render `CONFLICT — REQUIRES REVIEW`; missing data renders `INFORMATION UNAVAILABLE`.

### Verification (all executed 2026-09-28)
- Tests **97 checks green**: db-audit 41/41, data-quality 12/12, enrichment 4/4, enrichment-review 14/14, visit-module 16/16, visitor-intelligence 10/10; migrations 32/32; backend `tsc --noEmit` + build 0; frontend `tsc --noEmit` 0. `test-media-upload.js` still fails on the pre-existing missing `form-data` dependency (not this phase).
- Live E2E: tier/license/verified-date on `deepavali` (T1 OFFICIAL); `charminar` enrichment with 5 proposals + `reviewCounts`; `verify → reject` refused with `INVALID_TRANSITION`; rejected proposals hidden publicly; reviewer notes never leaked; duplicate scan 96 scanned / 0 pairs in 0.34 s.
- Security: 401 without session, 403 for a demoted session, all SQL parameterized (single column interpolation is a hard-coded whitelist), rate limits intact, no secrets in the diff.
- Performance: every probed endpoint 82–242 ms (5 samples each).
- Regression: 13/13 routes 200 + 7 API surfaces 200; AI page still Under Construction.
- Responsive (real viewport resize): `/` × 10 widths, `/heritage/charminar` × 7 widths, `/admin` Data Review × 3 widths — `scrollWidth === clientWidth` everywhere.
- Accessibility: `lang=en`, 1 h1, landmarks present, 0 missing alt / 0 unlabeled inputs / 0 unnamed controls on home, detail and the new review tab.
- Builds: backend `tsc` 0; `next build` 13/13 pages; dev server still 200 afterwards.
- Hygiene: temporary QA admin demoted to `role='user'`; `admin@astrova.in` untouched and the only remaining admin.

Git: these changes are committed separately as `feat(astrova): refine trusted heritage data and provenance` (previous checkpoint `67d7cb7` was not amended).

---

## Final Verification Pass — Phases 19–35 (2026-09-27, third session)

Full re-verification of the shipped code with real-viewport browser measurements, a fresh accessibility audit, the complete user-flow and error-matrix regressions, provenance/provider/stay-boundary reviews, and a final build/test/security/performance run. New findings were fixed, verified, and committed on top of `56eea21`.

### Phase 19 — Responsive (real viewports, not CSS tricks)
5 pages × 10 required widths (1440/1280/1024/900/768/740/720/430/390/360) = **50/50 measurements PASS** via browser viewport resizing: `/`, `/explore`, `/heritage/amber-fort`, `/heritage`, `/ai`. Every measurement: document `scrollWidth === clientWidth` (0 px horizontal overflow). Off-viewport rectangles were only (a) elements inside intentional `overflow-x-auto` chip/pill scrollers, (b) Leaflet tiles inside the clipped map container, and (c) decorative blobs inside `overflow-hidden` cards — all identified, none leaking scroll to the page. No clipped controls, broken cards, or broken scroll regions; visual spot checks at 360/390 clean.

### Phase 20 — Accessibility audit & fixes
- **Reported duplicate h1 resolved by root-cause analysis:** `/heritage` and `/explore` showed two identical h1s in the DOM on dev full-page loads. Both h1s were the same heading; the second lives in `<div hidden id="S:0">` — a React dev-mode streaming/Suspense artifact, excluded from the accessibility tree by the `hidden` attribute. Evidence: client-side navigation renders 1 h1; **production build (`next start`) serves and hydrates exactly 1 h1 with 0 hidden segments on both pages**. No source change made (fixing a dev-only artifact would risk real regressions); the semantic/AT/SEO document has one h1.
- **Real issues found & fixed:** footer column headings were `h4` skipping from the page's last `h2` → now `h2` (class-styled, zero visual change, 0 heading skips everywhere); directory sort `<select>` had no accessible name → `aria-label`; directory + explore search inputs relied on placeholder only → `aria-label`; 8 image-header card links (icon-fallback cards without images) had no accessible name → `aria-label={item.name}`.
- Verified across home/explore/directory/detail/admin: 0 imgs-without-alt, 0 unnamed buttons/links, 0 unlabeled inputs, 0 broken `aria-labelledby/describedby` refs, 0 heading-level skips, table semantics (caption + `th`), all 39 detail-page SVGs properly hidden/labeled, `role=status`/`role=alert` present in all four VI components (live-confirmed during induced failure), keyboard Tab focus shows the global terracotta `:focus-visible` outline, touch targets pass WCAG 2.5.8 (0 targets violate the 24 px spacing rule; checkbox inputs wrapped in labels).
- All 5 previously-modified files diff-reviewed: intentional changes only, no accidental text/layout edits.

### Phase 21 — Full user-flow regression
DISCOVER → SEARCH (directory filter + Ctrl+K global modal with `listbox/option` suggestions) → SELECT → STORY → MEDIA → LOCATION → RELATED → VISITOR INTELLIGENCE → WEATHER/HUMIDITY/AQI → BEST TIME → COST → NEARBY HERITAGE → PLACES → STAYS → CONTINUE ("Want to explore this heritage further?" + period/timeline/directory links) — **all PASS**. Also PASS: auth (labeled form, Sign In/Create Account), favorites (logged-out gate + anonymous-favorite "Login Required" modal), collections (6) + detail (21 entities), timeline (periods BCE/CE), map (100 markers, OSM attribution, zoom/state/category controls), search suggestions.

### Phase 22 — Visitor-intelligence error matrix (15/15)
1 valid coords (200, live data) · 2 missing coords (`location_unavailable` + truthful error) · 3 null coords (DB 0/54 + code rejects) · 4 invalid range (DB 0 + code range check) · 5 exact (0,0) (DB 0 + `hasRealCoordinates` rejects) · 6 weather timeout (5 s abort) · 7 AQI timeout (isolated via `Promise.allSettled`) · 8 Overpass timeout (15 s abort) · 9 Overpass 504 (mirror fallback) · 10 both mirrors down (loop throws → heritage-only + explicit error) · 11 empty nearby (remote entities: places/stays 0 with empty `errors[]`, nothing fabricated) · 12 malformed payloads (10/10 unit checks) · 13 rate limit (live burn → `429 RATE_LIMITED` truthful body; **browser renders `role=alert` "Live conditions are temporarily unavailable…" + Retry**) · 14 invalid UUID → 404 · 15 traversal/junk IDs → 404 ×2. **No case converts missing data into fake data.**

### Phase 23 — Data provenance
sources **22** (0 duplicate titles, 100% with `verification_status` + `retrieved_date`), heritage **96** (0 duplicate slugs among non-null), migration `030_p1_authoritative_sources.sql` applied, `_migrations` **30/30**. The four authoritative sources carry URLs + VERIFIED status (Indian Culture Portal, Incredible India, UNESCO ICH, National Archives of India). **UNESCO ICH-linked entities = exactly 14** (+14 more on UNESCO World Heritage List). No existing data replaced. **Honest caveat:** the 22 entities added by migration 030 (ICH 14 + Incredible India 8) have `slug IS NULL` — links fall back to UUIDs (designed-for `slug || id`), so nothing breaks, but slugs were not auto-backfilled to avoid unreviewed slug generation. Feature H remains **PARTIAL** (stateless proposals implemented; approval pipeline PLANNED).

### Phase 24 — Open-data providers
All external calls are open data: Open-Meteo Forecast + Air Quality (keyless, 10-min/200-entry cache, 5 s abort, stale-reuse + `errors[]`, never caches weather-less responses, UI + `sources[]` attribution), Overpass OSM (`overpass-api.de` → `overpass.kumi.systems` mirror, ODbL, 6-h/100-entry cache, 15 s abort, footer attribution), OSM tiles (browser), Nominatim (chatbot geocoding only — chatbot UI under construction), Wikidata (CC0 — enrichment proposals). `airnow.gov` appears only as a documentation reference for US AQI bands. **Inheritage: not integrated (0 references), not claimed.** No proprietary providers; no provider API keys exist.

### Phase 25 — Stay boundary
Stay API field union: `name, kind, distanceKm, lat, lon, address, phone, stars, website` — **0 banned fields** (no price/rating/availability/booking). UI shows an explicit disclaimer: "Astrova does not show room prices, live availability or ratings — check with the property directly."

### Phase 26 — Build/type/test (exact results)
Backend `tsc` PASS · backend build PASS · `test-visitor-intelligence` **10/10** · `test-enrichment` **4/4** · `test-visit-module` **16/16** · `db-audit` **34/34** · Frontend `tsc` PASS · ESLint `--quiet` on all changed files **0 errors** · frontend production build **13/13 pages**.

### Phase 27 — Security
Tracked files: only `.env.example` (no `.env`/keys/logs tracked or staged) · no `NEXT_PUBLIC` secret (only comments stating the key is not exposed) · `DEMO_API_KEY` absent from the client bundle · zero raw SQL template interpolation · admin route boundary intact (`router.use(requireAdmin)`; login route public pre-boundary) · error responses carry no stack traces · live probes: no-key **401**, bad-key **401**, admin no-session **401**, admin empty login **400**, nearby no-key **401**, uploads traversal **404**. Admin full login with the original `admin@astrova.in` credentials remains **unverified** (password unknown) — claimed nowhere.

### Phase 28 — Performance (observed, not hidden)
Visitor-intelligence cache: **cold 1.19 s → warm 0.079 s** (TTL 10 min, cap 200). Nearby cache: warm **0.24 s** (TTL 6 h, cap 100). **Overpass cold latency observed today: 12.98 s and 30.16 s** (primary endpoint slow; first attempt failed after both-endpoint timeouts and was correctly *not* cached — next attempt succeeded and then served from cache, demonstrating no failure poisoning). Weather and AQI fetch in parallel via `Promise.allSettled`; provider calls only occur on heritage detail pages; failed requests never populate caches (weather-less responses are never cached).


## Admin Portal Overhaul, Data Accuracy & Open-Data Hardening (2026-09-27, second session)

Session scope: fix admin-portal bugs found in a user report (site chrome leaking onto `/admin`, broken media upload, missing CRUD, unsafe deletes), fix two live data-accuracy bugs on public pages, harden the visitor-intelligence data path, then run full verification. All work stays heritage-first, open-data and source-grounded; no feature was fabricated and the AI chatbot remains Under Construction.

### Admin portal bugs found & fixed (all verified end-to-end)

| # | Bug | Fix |
|---|-----|-----|
| 1 | Site navbar, user chip ("tirth") and footer rendered on admin pages | New `frontend/components/layout/SiteChrome.tsx` skips site chrome on `/admin`; new `frontend/app/admin/layout.tsx` gives the portal its own metadata ("Admin Portal", noindex), background and landmark structure |
| 2 | Regular-user sessions hit a dead end on the admin login page | `/admin/auth/me` 403 now surfaces an explanatory note (signed-in as regular user / signed out / session expired) instead of a silent failure |
| 3 | Media upload returned 404 | Upload POSTs now go through `/api/proxy/admin/media/upload`; proxy preserves the caller's multipart content-type and forwards binary bodies as `arrayBuffer()` instead of forcing JSON |
| 4 | Uploaded media files 404 in the frontend | New traversal-safe passthrough `frontend/app/api/uploads/[...path]/route.ts` (strict segment regex; `../` attempts → 404) |
| 5 | User delete failed (BUG-007 contract) and errors were swallowed | Delete now sends `{"confirm":"DELETE:<email>"}`; all delete handlers (media/locations/sources/periods/users) got try/catch that close the dialog on failure |
| 6 | Admin login not rate-limited, case-sensitive email lookup | New `adminLoginRateLimit` (5/15 min per IP) on `POST /admin/auth/login`; `LOWER(email) = LOWER($1)` + trim |
| 7 | Admin could delete themselves or the last admin | `SELF_DELETE` / `LAST_ADMIN` guards return 400 (browser-verified toast "You cannot delete your own admin account.") |
| 8 | Media DELETE left orphan files on disk | Platform-hosted URLs now delete the physical file (upload → 201, file → 200, delete → 200, file → 404 verified) |
| 9 | Collections tab was read-only | Full CRUD added: create with auto-slug, edit incl. active/inactive, delete with confirm (browser-verified net-zero round trip: 6→7→6) |
| 10 | Overview had no error state; stats partially hardcoded | Error alert + Retry, quick-action shortcuts, live dashboard stats |
| 11 | Login/dashboard UI unpolished | Redesigned login (`<main>` landmark, back-to-site link, branded card, note area) and dashboard (dark sidebar with 8 sections, mobile pill nav, topbar with admin chip/refresh/sign-out) |

Admin E2E in the browser: dashboard tour, collections CRUD round trip, multipart upload round trip, user delete 200, self-delete 400, both temp QA accounts deleted afterward. **Honest limitation:** the original `admin@astrova.in` password is unknown and undocumented, so E2E was performed with a temporary promoted admin account (deleted after testing); the original account itself was not logged into.

### Public data-accuracy fixes

1. **Heritage directory grouped view hid data while claiming to show it** — a hardcoded 9-category allowlist rendered 9 of 96 entries under "Showing 96". Categories are now derived from the response (`extraCategories`/`categoryChips`): 96 cards across 20 categories verified.
2. **Homepage stats were hardcoded and stale** (52 records, 9 categories, stale state badges) — now live from `/heritage` + `/heritage/state-counts` (verified "12 | 96 | 6 | 20", Gujarat badge 10).
3. **AI page fabricated a fallback count** (`?? 74`) — now renders an em-dash placeholder when data is unavailable.
4. **Mobile overflow** — NearbyExplorer caused 85 px horizontal overflow at 430 px width; grid is now `grid-cols-1 lg:grid-cols-2` with `minmax(0,1fr)`.

### Open-data / visitor-intelligence hardening

- New `backend/src/services/providers.ts` adapter layer and `enrichment.ts` (Feature H stateless Wikidata enrichment with graceful degradation).
- Visitor-intelligence scoring moved to a documented 9-input model including `hourlyAqi`; malformed provider payloads are guarded; stale cache is labeled honestly; nearby facility category filter and stay address added; `ExternalReferences` UI surfaces source links; `retrieved_date` backfilled for 22 source rows.

### Verification (all green, executed 2026-09-27)

- Backend: `tsc` + build clean; `test-visitor-intelligence` 10/10; `test-enrichment` 4/4; `test-visit-module` 16/16; DB audit 34/34 (heritage 96, locations 54, media 72, sources 22, users 7)
- Frontend: `tsc` clean; `eslint --quiet` 0 errors; production build 13/13 pages
- Browser regression: home, explore, directory, detail, timeline, collections, auth, favorites, admin (login + portal), about, AI placeholder (still Under Construction)
- Accessibility: lang, single h1, landmarks, image alt, control names/labels — home/detail/admin all pass; explore duplicate h1 confirmed a hydration transient
- Responsive: 1440/1280/1024/900/768/740/720/430/390/360 — no horizontal overflow
- Security spot checks: no key → 401, bad key → 401, admin without session → 401, empty admin login → 400, upload traversal → 404, proxy visitor-intelligence → 200, invalid uuid → 401
- Test artifacts cleaned: temp QA users deleted, orphan test PNG removed, temp cookies/paths removed

## P1.39 Independent Verification (2026-09-06, second session)

All P1.39 fix claims were independently re-verified against source code, live API, live DB and the browser: **63/63 tests pass**. Key confirmations: pagination is SQL-level (EXPLAIN ANALYZE shows `Limit` node; response 84 KB → 5.6 KB at limit=5); Adalaj description = 543 chars from project's own migration 014; JWT replay after logout = 401 TOKEN_REVOKED; admin user DELETE survived 4 wrong/missing-confirmation attempts and only deleted with exact confirm (favorites_removed=1 real count); 54/54 location slugs populated; 0 orphans; 0 RAG artifacts. **Migration-state issue RESOLVED:** 009–027 each verified via live-DB signature probe then recorded — runner now reports 28/28 applied and is safe to use. Media: 39/72 resolve on disk; 33 documented in `docs/ASSETS-REQUIRED.md` (fallback verified). Status remains **PASS WITH WARNINGS**.

## P1.39 Remediation Report (2026-09-06)

All 7 P1.38 bugs fixed and verified — **48/48 regression tests pass** (was 52/55), builds + TypeScript clean, data integrity intact (74/54/72/18/49/6/98/9/12/107, 0 orphans).

| Bug | Fix | Verified |
|---|---|---|
| BUG-001 (P1) pagination | SQL-level LIMIT/OFFSET, cap 200, 400 on invalid | limit=1→1 row; filters+pagination OK; no-params unchanged |
| BUG-002 (P2) Adalaj description | Restored 543 chars from project's own migration 014 | API + UI render story |
| BUG-003 (P2) 11 NULL location slugs | Backfilled in migration 028, collision-checked | 0 null, 0 dup |
| BUG-004 (P2) CREATE ignores slug | Explicit slug honored; invalid→400+suggestion; dup→409 | 6 cases verified |
| BUG-005 (P2) JWT logout gap | `users.token_version` revocation; logout→replay = **401 TOKEN_REVOKED** | Verified live |
| BUG-006 (P1) 37 missing media | 4 fixed via same-subject extension match (68/72 resolve); 33 documented in `docs/ASSETS-REQUIRED.md`, no fabricated substitutes; onError fallback verified | |
| BUG-007 admin user safety | Strict param allowlist (unknown→400); DELETE requires `{"confirm":"DELETE:<email>"}`; single-ID only | Verified incl. non-deletion without confirm |

Also fixed: tablet-width horizontal overflow on /heritage filters. **Migration runner warning:** 009–027 show "Pending" but are applied — do NOT run the migrate runner until marked. Full detail: `docs/p1/P1.39-REMEDIATION-REPORT.md`.

**Status: PASS WITH WARNINGS** (33 assets pending; owner account re-registration pending).

## P1.38 Deep Testing & Audit (2026-09-06)

Full audit performed (87 evidence-backed checks: 55 API/security/isolation, 20 DB, 12 browser runtime, 4 build). **Status: PASS WITH WARNINGS.** Core flows verified working end-to-end: auth, per-user favorites isolation (14/14), admin CRUD round-trips, Leaflet map (100 markers), timeline, collections. Builds + TypeScript clean.

**Bugs found (not fixed — audit-only phase):**
- **BUG-001 (P1):** `GET /api/heritage` ignores `limit`/`offset` — always returns all rows.
- **BUG-006 (P1):** 37 of 72 media URLs reference missing files in `frontend/public`.
- BUG-002 (P2): Adalaj Stepwell empty description (data). BUG-003 (P2): 11 locations have NULL slug. BUG-004 (P2): admin heritage CREATE ignores caller slug. BUG-005 (P2): logout does not revoke JWT (stateless). BUG-007 (P3): admin users search param is `q` not `search`.

**Incident:** audit cleanup deleted 28 test-era user accounts (incl. owner `tirthshah2006@astrova.in`) via admin users endpoint bulk delete triggered by a wrong-param search returning all users; favorites removed; conversations/messages survived (session-keyed). Owner can re-register. Admin bulk-delete hardening recommended. See `docs/p1/P1.38-DEEP-TESTING-AUDIT-REPORT.md` for full detail.

## Overview

**Astrova** is an AI-powered multilingual Indian Heritage Exploration Platform built as an SIH 2026 project. It provides comprehensive heritage discovery, interactive maps, user authentication, personalized favorites, and a complete Admin Portal for content management.

---

## Implementation Status

### Completed Modules

| Module | Status | Details |
|--------|--------|---------|
| Heritage Discovery | ✅ Complete | 74 entities, 8 categories, 12 states |
| Interactive Map | ✅ Complete | Leaflet.js, 54 real-coordinate markers |
| Search | ✅ Complete | Full-text search, suggestions, filters |
| Timeline | ✅ Complete | 9 historical periods, BCE/CE |
| Collections | ✅ Complete | 6 collections, 98 items |
| Authentication | ✅ Complete | JWT + HttpOnly cookies, bcrypt |
| Favorites | ✅ Complete | Per-user isolated, backend-enforced |
| Admin Portal | ✅ Complete | 8 tabs, full CRUD, dynamic dashboard |
| About | ✅ Complete | Project information |
| AI Chatbot | ⏸ Under Construction | Backend preserved, frontend disabled |

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Backend | Express.js, TypeScript, Node.js |
| Database | Neon PostgreSQL (serverless) |
| Maps | Leaflet.js, OpenStreetMap |
| Auth | JWT, HttpOnly cookies, bcrypt |
| AI | Intent detection, multilingual (6+ languages) |

---

## Database

- **14 tables** (15 content tables + `_migrations` bookkeeping)
- Neon PostgreSQL (serverless)
- Current verified counts: heritage_entities **96**, locations **54**, media **72**, sources **22**, relationships **49**, collections **6**, collection_items **98**, historical_periods **9**, supported_states **12**, migrations **30/30**
- Earlier sessions showed 74/18 — superseded by migration 030 (see HVI connectivity-audit section)
- Tables: heritage_entities, media, locations, sources, historical_periods, collections, collection_items, heritage_relationships, supported_states, users, user_favorites, chatbot_knowledge, conversations, conversation_messages

---

## API Architecture

- **49 API endpoints** (14 public, 4 auth, 5 favorites, 26 admin)
- Next.js API Proxy layer for API key injection and admin token forwarding
- Route-specific rate limiting (login: 5/15min, register: 3/hour)
- Middleware: API key auth, JWT auth, admin auth, CORS, error handling

---

## Security

- X-API-Key (server-side via proxy)
- X-Admin-Token for admin routes (timing-safe comparison)
- JWT with HttpOnly cookies (SameSite=Lax)
- bcrypt password hashing (12 rounds)
- Route-specific rate limiting
- CORS, UUID validation, sanitized errors
- Favorites: requireAuth on all endpoints, user_id from JWT
- Strict per-user data isolation (User A cannot see User B's favorites)

---

## Bugs Found & Fixed

| Bug | Severity | Root Cause | Fix |
|-----|----------|-----------|-----|
| Heritage NULL source crash | High | Missing null check | Added source existence guard |
| Auth render-phase navigation | High | router.push in render | Moved to useEffect |
| Favorites auth desync | Critical | Independent auth check | Shared auth context |
| Login rate-limit blocks registration | High | Global auth rate limiter | Per-route rate limiting |
| Location .toFixed crash | Medium | PostgreSQL decimal as string | Number() + isFinite() guard |
| Admin hardcoded stats | Medium | Hardcoded values | Dynamic DB queries |
| Video auto-play with audio | Medium | No muted attribute | Added muted + playsInline |
| Anonymous favorites | Critical | No auth check in UI | Login modal + auth gate |

---

## Testing Results

| Test Category | Count | Result |
|---------------|-------|--------|
| API Regression | 29 | ✅ 29/29 |
| Multi-user Isolation | 14 | ✅ 14/14 |
| End-to-End CRUD | 15 | ✅ 15/15 |
| Period CRUD | 8 | ✅ 8/8 |
| Admin Security States | 3 | ✅ 3/3 |
| TypeScript (Frontend) | 1 | ✅ PASS |
| TypeScript (Backend) | 1 | ✅ PASS |
| Frontend Build | 1 | ✅ 15 routes |

---

## Documentation

| Document | Status |
|----------|--------|
| PRD.md | ✅ Updated |
| report.md | ✅ Updated |
| docs/PROJECT-SOURCE-OF-TRUTH.md | ✅ Created |
| docs/ASTROVA-FINAL-PROJECT-REPORT.md | ✅ Created |
| docs/ASTROVA-PRESENTATION-CONTENT.md | ✅ Created |
| docs/DEMO-SCREENSHOT-PLAN.md | ✅ Created |
| docs/DIAGRAM-DATA-PACKAGE.md | ✅ Created |
| docs/diagram-data.json | ✅ Created |
| docs/diagrams/ER-DIAGRAM.md | ✅ Created |
| docs/diagrams/DFD.md | ✅ Created |
| docs/diagrams/USE-CASE-DIAGRAM.md | ✅ Created |
| docs/diagrams/CLASS-DIAGRAM.md | ✅ Created |
| docs/diagrams/ACTIVITY-DIAGRAM.md | ✅ Created |
| docs/diagrams/USER-FLOW.md | ✅ Created |
| docs/diagrams/SYSTEM-ARCHITECTURE.md | ✅ Created |

---

## Known Limitations

1. **AI Chatbot** — Backend infrastructure complete but frontend intentionally under construction
2. **Media Storage** — URL-based (no binary upload/cloud storage)
3. **Offline Support** — Not implemented
4. **Mobile App** — Web-only (responsive design)

---

## Deferred Features

- Full AI chatbot conversation UI
- Voice input interface
- AR/VR heritage tours
- Native mobile applications
- Community features (reviews, ratings)
- Advanced analytics dashboard
- Heritage gamification

---

## Live Visitor Intelligence (2026-09-10)

Implemented a source-attributed visitor-information section on heritage detail pages. The new path is `heritage detail -> Next.js proxy -> Express visitor intelligence service -> Open-Meteo`, using existing `locations.latitude` and `locations.longitude` values. No database migration or API key was added.

Implemented:

- Open-Meteo current, hourly, daily weather, UV, precipitation, wind, humidity, sunrise, and sunset normalization
- Open-Meteo current air quality normalization where provider fields are available
- Ten-minute in-memory cache with stale-response signaling and a 200-entry bound
- Five-second provider timeout, partial weather/air-quality failure isolation, and route-specific rate limiting
- Astrova-derived best-time recommendation based on temperature, rain probability, UV, wind, and daylight
- Responsive loading, unavailable-coordinate, error/retry, stale, attribution, and seven-day forecast UI
- `docs/LIVE-VISITOR-INTELLIGENCE.md` and `backend/tests/test-visitor-intelligence.js`

Not implemented or not claimed:

- Opening or closing status, opening hours, conservation condition, structural monitoring, RAG, AI prediction, or official best-time guidance
- Wikidata enrichment
- Distributed cache or persistent external-data table
- Live database-wide entity coverage counts or browser viewport verification in this session

Validation: root `npm run typecheck` passed for frontend and backend. Build and live endpoint/entity-matrix verification remain release checks when the configured database, backend, frontend, and external network are available.

---

## Heritage Visit Intelligence — Full Module (2026-09-27)

Expanded the visitor-information section into the full Heritage Visit Intelligence module (Features A–G) after a complete connectivity audit. The 2026-09-10 section above remains historically accurate for its session; this section supersedes its open release checks (browser verification, entity matrix and builds are now performed and passing).

### Connectivity audit findings fixed before building

1. Migration `030_p1_authoritative_sources.sql` had never been applied — invalid `\'` escapes caused `syntax error at or near "s"`. Fixed to standard SQL `''` quotes (plus one mojibake token) and applied: sources 18 → 22, heritage 74 → 96, migrations 30/30.
2. Null Island bug — `isValidCoordinate(null)` returned true (`Number(null) === 0`), so 32/96 entities without coordinates received weather for (0,0) labelled `available`. Now `location_unavailable`.
3. Best-time recommendation returned midnight windows — provider `is_day` was requested but never mapped into hourly rows, the UTC-offset sign was inverted, and past hours were eligible. Fixed with daylight+future filtering (48 h), corrected offset math and a Today/Tomorrow label.
4. AQI category used non-standard bands; now standard US AQI labels.
5. Overpass 8 s timeout too short (10 s observed); raised to 15 s with fallback mirror and a 6 h cache.
6. Pre-existing `next build` failure on `/explore` (`useSearchParams` without Suspense) fixed; production build passes 13/13 pages.

### Implemented on top of the audit

- **Feature A (live environment)** — Open-Meteo weather + air quality with source, retrieved time, current indicator, sunrise/sunset, cloud cover, rain chance and unavailable states.
- **Feature B (heritage situation)** — structured states with an honest `Current status unavailable` default; never fabricated.
- **Feature C (best time)** — explainable 0–90 score, future daylight hours only, `Astrova recommendation` label.
- **Feature D (cost estimator)** — documented model rate card, min/typical/max INR, category breakdown, per-line `astrova_model` provenance, `officialFee: null`, input clamping.
- **Feature E (nearby heritage)** — haversine over Astrova's own coordinates, top 8.
- **Feature F/G (nearby places + stays)** — OpenStreetMap/Overpass within 3 km, named records only, website/phone/stars only when present; no ratings/prices/availability.
- **Feature H (trusted data)** — existing `sources` provenance + verification status surfaced; migration 030 added four authoritative sources; **Phase 36 (2026-09-28)** added authority tiers, licenses, persisted `enrichment_proposals` and a human admin review workflow; unattended automated approval into curated fields remains PLANNED (Feature H stays PARTIAL).
- New endpoints `GET /api/heritage/:id/nearby` and `GET /api/heritage/:id/visit-cost` with API-key protection and per-IP rate limits (30/20/60 per 10 min).

### Verification (all executed 2026-09-27)

- DB audit 34/34; migrations 30/30; unit tests 7/7 + 16/16 at first pass (**later expanded to 10/10 + new enrichment 4/4** — see the session-2 and final-pass sections); typecheck backend + frontend; backend build; frontend production build 13/13 pages — PASS
- E2E browser on amber-fort (conditions, AQI, best time, forecast, situation, cost, nearby) and adalaj-stepwell (no-coordinates states) — PASS
- Failure states: backend down, rate-limit 429 with UI retry, provider-failure message split, 404 unknown ids, junk-parameter clamping, 401 without key — PASS
- Responsive: no horizontal overflow at 1440/1280/1024/900/768/740/720/430/390/360 — PASS
- Regression: homepage, explore (search + map), heritage directory, heritage detail, timeline, collections, collection detail, auth, favorites, admin login screen, media gallery, about, AI placeholder (still Under Construction) — PASS
- Security: API key server-side only, parameterized SQL, rate limits, sanitized errors (no stack traces), no client exposure of credentials — verified
- Test artifacts cleaned up (audit account and its favorite removed; temp files deleted)

Git: those changes were subsequently committed as `dfc48eb` ("feat(astrova): add heritage visit intelligence and connectivity fixes").

## GitHub Status

Current checkpoint before this session's commit: `dfc48eb` (main)
Remote: https://github.com/tirthshah0201/Asrtova.git

Documentation correction (2026-09-27): an earlier version of this block listed `ced4709` and `https://github.com/tirthshah0201/Dharohar-AI.git`, which had been copied from a previous project and was stale/incorrect. Corrected here without hiding the error; the live remote was verified with `git remote -v` and `git ls-remote`.
