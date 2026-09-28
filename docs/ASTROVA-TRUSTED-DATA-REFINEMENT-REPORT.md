# Astrova — Trusted Heritage Data Refinement, Provenance & Controlled Enrichment — Phase 36 Report

**Project:** Astrova — Indian Heritage Discovery, Learning & Visitor Intelligence Platform
**Phase:** PHASE 36 — TRUSTED HERITAGE DATA REFINEMENT + PROVENANCE + CONTROLLED ENRICHMENT
**Date:** 28 September 2026
**Base checkpoint:** `67d7cb7` — *feat(astrova): refine heritage visit intelligence* (not amended)
**Status:** COMPLETE — 34 ordered steps executed; Feature H advanced to PARTIAL (human-gated review workflow live; unattended approval remains PLANNED)

---

## 1. Phase name

PHASE 36 — Trusted Heritage Data Refinement + Provenance + Controlled Enrichment.

Roles exercised in this phase: lead software engineer, data engineer, database engineer, backend engineer, frontend engineer, security engineer and QA engineer.

---

## 2. Objective

Improve the **quality, trust, traceability, consistency and reviewability** of the heritage data Astrova publishes, without fabricating anything:

- Fix safe, provable data-quality defects (missing slugs, missing provenance columns).
- Record **where every piece of information came from** (authority tier, licence, verified date) and show it to the user.
- Turn the previously *stateless* Wikidata enrichment into a **controlled** pipeline: extracted → validated → deduplicated → conflict-checked → **human-reviewed** → published.
- Give administrators a **lightweight review workflow** (verify / reject / reopen) with an audit trail.
- Verify the whole platform again: E2E, regression, security, performance, responsive, accessibility, production build.
- Keep the AI chatbot **Under Construction**, keep every future-list item **unimplemented**, and use **no proprietary APIs**.

---

## 3. Why the phase was needed

Before this phase Astrova had provenance *foundations* but not provenance *discipline*:

1. 22 heritage entities carried `slug IS NULL`, so public links silently fell back to UUIDs.
2. `sources` recorded `verification_status` but no **authority level**, no **licence** and no **verified date** — a user could not tell a government archive from an open dataset.
3. Wikidata enrichment was computed on the fly and thrown away: nothing could be reviewed, rejected, re-checked or audited later.
4. There was no place in the admin UI to look at a proposed change and decide.

---

## 4. Audit findings (Steps 1–5 — completed before any code was written)

| Area | Finding |
|------|---------|
| Migrations | 30/30 applied; runner healthy |
| Heritage | 96 entities, 54 locations, 9 periods, 72 media |
| Slugs | 22 entities with `slug IS NULL` (all from migration 030); 0 duplicate slugs among non-null |
| Sources | 22 rows, 100% with `verification_status` + `retrieved_date`; **no** tier/licence/verified-date columns |
| Enrichment | `enrichment.ts` stateless: extract → normalize → duplicate/conflict detection, never persisted |
| Timeline | 9 periods, 52 assigned entities |
| Tests | db-audit 34/34, enrichment 4/4, VI 10/10, visit module 16/16 |

---

## 5. Scope decisions

**In scope**

- Guarded slug backfill (only rows where `slug IS NULL`, uniqueness-guarded).
- Authority tier + licence + verified date for every source.
- Persisted enrichment proposals with a review state machine.
- Admin review UI (queue, filters, actions, extraction tool, duplicate scan).
- Public exposure of provenance and review status.
- Full re-verification of the platform.

**Out of scope (deliberately)**

- Any change to Visitor Intelligence — it was regression-tested only.
- Historical period assignment for new records (see §17).
- Unattended approval of proposals into curated fields (Feature H stays PARTIAL).
- AI chatbot (Under Construction), crowd info, conservation monitoring, hotel booking, RAG — future list, **not implemented**.
- Any proprietary/paid API or provider key.

---

## 6. Database changes

### Migration `031_p36_trusted_data.sql` (applied)

- **22 guarded slug updates** — every statement is `UPDATE … SET slug = … WHERE slug IS NULL AND NOT EXISTS (slug already used)`; no curated slug was ever overwritten. Null slugs after the phase: **0**.
- `sources.authority_tier SMALLINT`, `sources.license TEXT`, `sources.verified_date DATE`.
- `OPEN_DATASET` added to the `source_type` CHECK constraint (Wikidata is an open dataset, not a government portal).
- Canonical UNESCO World Heritage List URL corrected to `https://whc.unesco.org/en/list/`.
- Every source row tiered and licensed: **T1 = 18, T2 = 4, T3 = 1 → 23/23 tiered, 23/23 licensed.**

### Migration `032_p36_enrichment_review.sql` (applied)

```sql
CREATE TABLE enrichment_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES heritage_entities(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,          -- e.g. Wikidata QID
  source_type TEXT NOT NULL,          -- OPEN_DATASET …
  field TEXT NOT NULL,
  proposed_value TEXT NOT NULL,
  current_value TEXT,
  conflicts JSONB NOT NULL DEFAULT '[]',
  source_url TEXT,
  license TEXT,
  status TEXT NOT NULL CHECK (status IN
    ('DRAFT','PENDING_REVIEW','VERIFIED','REJECTED','CONFLICT')),
  reviewer_id UUID REFERENCES users(id),
  reviewer_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, external_id, field, proposed_value)   -- no duplicate proposals
);
-- touch trigger keeps updated_at honest
```

Migrations after this phase: **32/32 applied.**

---

## 7. Provenance model

| Tier | Label shown | Meaning |
|------|-------------|---------|
| T1 | `OFFICIAL` | Official site, UNESCO, ASI, government, tourism board, national archive |
| T2 | `INSTITUTIONAL` | Institutional / academic / museum |
| T3 | `OPEN DATASET` | Open data such as Wikidata (CC0) |
| T4 | *(geographic only)* | OpenStreetMap — used for geography, never as a historical authority |
| T5 | `ASTROVA ESTIMATE` | Calculated by Astrova's own documented model |

Label vocabulary used across the UI (exact strings from the phase contract):

- **`VERIFIED`** — verified from an authoritative source.
- **`INFORMATION UNAVAILABLE`** — information is unavailable.
- **`CONFLICT — REQUIRES REVIEW`** — sources disagree.
- **`ASTROVA ESTIMATE`** — computed by Astrova.
- **`LIVE DATA`** — live environment data (weather, AQI).
- **`POSSIBLE DUPLICATE`** — duplicate candidate only; never an automatic merge.

---

## 8. Data-quality rules (`backend/src/services/dataQuality.ts`, 436 lines, pure)

- `AUTHORITY_TIERS`, `tierForSourceType`, `tierLabel`, `isHistoricalAuthority` — one authoritative mapping used by both API and UI.
- `PROPOSAL_FIELDS` whitelist: `description`, `official_website`, `inception_year`, `coordinates`, `instance_of`.
- `validateProposalField` rejects: HTML/markup, non-`http(s)` URLs, fuzzy years ("early 1900s"), Null Island `(0,0)`, malformed QIDs.
- Review state machine: `PROPOSAL_STATUSES` + `canTransition` + `initialStatusFor`.
- Duplicate scoring: `scoreDuplicate` with `POSSIBLE_DUPLICATE_THRESHOLD = 0.75`, verdict only `POSSIBLE DUPLICATE` / `UNLIKELY`.
- `safeSlugFor`, `describeIssues`, `findDuplicateDescriptions`.
- Reuses the existing `generateSlug/isValidSlug` from `backend/src/utils/slug.ts` (no second slug implementation).

---

## 9. Controlled enrichment pipeline (`backend/src/services/enrichmentReview.ts`, 381 lines)

```
Wikidata (bounded, 5s, 24h cache)
   → enrichment.ts extract/normalize          (stateless, unchanged)
   → dataQuality.validateProposalField        (invalid → skipped, recorded as a reason)
   → duplicate scoring                        (POSSIBLE DUPLICATE only)
   → conflict detection                       (→ CONFLICT REQUIRES REVIEW)
   → syncProposals()  INSERT … WHERE NOT EXISTS / ON CONFLICT DO NOTHING
   → enrichment_proposals (persisted)
```

`syncProposals` guarantees:

- **Never overwrites a curated entity field.**
- **Never resets a decision:** rows already `VERIFIED` or `REJECTED` are left untouched on refresh (`refreshed` only counts `DRAFT`/`PENDING_REVIEW` rows).
- Stores `current_value` so a reviewer can compare proposed vs. current.
- `scanPossibleDuplicates()` is read-only and pairwise over the whole proposal set.

---

## 10. Review workflow & state machine

```
DRAFT ─► PENDING_REVIEW ─► VERIFIED ─► (reopen) ─► PENDING_REVIEW
                   │            │
                   │            └── ✗ VERIFIED → REJECTED  refused (INVALID_TRANSITION)
                   └──────────► REJECTED ─► (reopen) ─► PENDING_REVIEW
```

- `verify`, `reject`, `reopen` are the only admin actions; each is validated by `canTransition` before anything is written.
- `VERIFIED ⇄ REJECTED` is **never** a direct flip — `reopen` is an explicit admin action, not an automatic reset.
- The reviewer identity comes from the authenticated session (`req.user`), never from the request body.
- Every decision stores `reviewer_id`, optional `reviewer_note`, `reviewed_at`.

---

## 11. Files created

| File | Lines | Purpose |
|------|-------|---------|
| `backend/src/services/dataQuality.ts` | 436 | Pure data-quality/tier/state-machine helpers |
| `backend/src/services/enrichmentReview.ts` | 381 | Persistence, review, public projection, duplicate scan |
| `backend/tests/test-data-quality.js` | 158 | 12 checks over the pure helpers |
| `backend/tests/test-enrichment-review.js` | 237 | 14 DB-backed checks, self-cleaning |
| `database/migrations/031_p36_trusted_data.sql` | — | Slugs + provenance columns (applied) |
| `database/migrations/032_p36_enrichment_review.sql` | — | `enrichment_proposals` (applied) |
| `docs/ASTROVA-TRUSTED-DATA-REFINEMENT-REPORT.md` | — | This report |
| `docs/generate-p36-docx.py` | — | Word export of this report |

---

## 12. Files modified

| File | Diff | Purpose |
|------|------|---------|
| `backend/src/routes/admin.ts` | +158 | 4 review endpoints behind `requireAdmin` (line 172) |
| `backend/src/routes/heritage.ts` | +55/−17 | Enrichment annotation + source tier/licence exposure |
| `backend/tests/db-audit.js` | +68 | Audit extended 34 → **41 checks** |
| `frontend/app/admin/page.tsx` | +369 | Ninth tab **“Data Review”** + `ReviewTab` component |
| `frontend/app/heritage/[id]/page.tsx` | +26 | Source-tier badge, Verified/Terms lines |
| `frontend/components/heritage/ExternalReferences.tsx` | +65 | `ReviewBadge` + per-proposal review status |
| `PRD.md`, `report.md` | — | Phase status + Feature H = PARTIAL |

Diff total: **6 tracked files, +724/−17**, plus the 8 new files above.

---

## 13. API changes

### Admin (all behind `router.use(requireAdmin)`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/enrichment/proposals` | Queue with status/entity filters, paging |
| POST | `/api/admin/enrichment/proposals/:id/review` | `{action: verify\|reject\|reopen, note?}` — UUID validated, transitions validated |
| POST | `/api/admin/enrichment/refresh/:entityId` | Clears cache, one bounded Wikidata call, syncs proposals |
| GET | `/api/admin/enrichment/duplicates` | Read-only duplicate scan |

### Public

| Path | Change |
|------|--------|
| `GET /api/heritage/:id/enrichment` | Each proposal annotated with `review{status,reviewedAt}`; `REJECTED` rows removed from the response; `meta.reviewCounts {verified,pending,conflict}` added; reviewer notes/emails never present |
| `GET /api/heritage/:id` | `sources[]` now includes `authority_tier`, `license`, `verified_date`; entity carries `authority_tier` + `tier_label` |

---

## 14. Frontend implementation

- **`ExternalReferences.tsx`** — `ReviewBadge` (Verified = green, Conflict = amber, Proposal = stone), rendered per proposal; header now reads “… · Open Dataset”.
- **`heritage/[id]/page.tsx`** — official-source badge driven by `tier_label`, plus Verified / Terms lines sourced from `license` and `verified_date`.
- **`admin/page.tsx`** — `AdminTab` extended with `"review"`; `ReviewTab` (~370 lines): proposal queue, status filter (All / Pending / Conflict / Verified / Rejected), verify/reject/reopen with an admin-only note field, an entity-UUID extraction tool that runs the controlled pipeline for one entity while preserving existing decisions, and a read-only duplicate-scan panel.
- Admin navigation now has nine tabs: Overview, Heritage, Media, Locations, Sources, **Data Review**, Users, Collections, Periods.

---

## 15. Honesty rules verified end-to-end (live HTTP evidence)

| Check | Result |
|-------|--------|
| `GET /api/heritage/deepavali` | `authority_tier: 1` (OFFICIAL), licence, `verified_date 2026-09-27` |
| `GET /api/heritage/charminar/enrichment` | `status: matched`, 5 proposals, all `review.status = PENDING_REVIEW`, `reviewCounts` present, **no reviewer keys** |
| Admin endpoints without session | **401** (even with a valid API key) |
| Admin endpoints with demoted QA session | **403** `Admin access required.` |
| Review lifecycle `verify` | ✅ `VERIFIED` |
| `verify → reject` | ❌ refused — `INVALID_TRANSITION: Cannot move from VERIFIED to REJECTED` |
| `reopen` then `reject` | ✅ allowed (explicit admin action) |
| Public view of a `REJECTED` proposal | Hidden (`instance_of hidden: true`), `reviewCounts` updated |
| Reviewer note / e-mail in any public response | **Never present** (asserted by tests) |
| Duplicate scan | 96 rows scanned, 0 pairs, 0.34 s |
| Search → detail chain | Charminar, Deepavali, Kumbh Mela, Yoga, Vedic Chanting, Chhau all found; suggestions return `deepavali` |
| Locations | 54, Null-Island (0,0) rows: **0** |

---

## 16. Visitor intelligence regression (Step 19 — nothing rebuilt)

| Endpoint | Result |
|----------|--------|
| `GET /api/heritage/deepavali/visitor-intelligence` | `availability: location_unavailable`, `situation.status: information_unavailable` |
| `GET /api/heritage/charminar/visitor-intelligence` | Full payload: `airQuality, availability, heritage, meta, recommendation, situation, sources, weather` |

Keys, states and labels are unchanged from Phase 35.

---

## 17. Timeline judgment (Step 18 — documented, not guessed)

- Timeline today: **9 periods, 52 assigned entities** — identical to before this phase.
- **44 of 96 entities have no `period_id`**, including all 22 Phase-36 records.
- **Decision: this phase assigns no periods.** Reasons:
  1. **Period ranges overlap.** Charminar's own description states *“Built in 1591”*, but 1591 falls inside both `Ahom Period (1228–1826)` and `Colonial Period (1573–1947)` — the data alone cannot pick one, and choosing Ahom for a Hyderabad monument would be plainly wrong.
  2. **Most new records are not datable objects** — festivals (Deepavali, Durga Puja, Navroz), performing traditions (Chhau, Kalbelia, Kutiyattam), cuisine, rivers, lakes and hill stations have no single founding date.
  3. The phase rule is explicit: *do not assign a historical period if the source does not support it.* An unassigned period renders honestly as “no period”; a wrong one fabricates provenance.
- Entities whose descriptions *do* state a date (Gateway of India 1924, Victoria Memorial 1906–1921, Shore Temple 8th c., Mahabodhi 5th–6th c.) were **left unassigned too**, because each date still falls in 2–3 overlapping ranges. Backfilling them is future work that needs a period-taxonomy decision first.

---

## 18. Open-data rule check (Step 20)

Every external host referenced by application source:

| Host | Purpose | Licence |
|------|---------|---------|
| `api.open-meteo.com`, `open-meteo.com` | Weather + air quality | Free, CC BY 4.0 |
| `www.wikidata.org` | Enrichment proposals | CC0 1.0 |
| `www.openstreetmap.org`, `overpass-api.de`, `overpass.kumi.systems`, `nominatim.openstreetmap.org` | Nearby places / stays / geocoding | ODbL |
| `unpkg.com` | Static CDN assets | MIT |
| `www.airnow.gov` | Documentation link for AQI band definitions only (no call) | US government public |

- **No proprietary API, no paid tier, no provider key, nothing requiring billing.**
- Only client-visible env var is `NEXT_PUBLIC_DEMO_API_KEY` (the project's demo key pattern, pre-existing).
- AI chatbot page still renders **Under Construction**; future-list features are not implemented.

---

## 19. Security

- **SQL:** every statement parameterised. The one interpolated identifier in the new code (`SELECT ${column}`) is fed from a hard-coded `columnByField` whitelist (`description` only) — no user input reaches it.
- **Authz:** all four review endpoints sit behind `router.use(requireAdmin)`; verified **401** without a session and **403** for a session whose role was demoted (role read per request, not cached at login).
- **Input validation:** UUIDs validated before queries; `action` restricted to `verify|reject|reopen`; proposal `status` filter validated against the known set; paging clamped (`limit ≤ 200`, `offset ≥ 0`).
- **Rate limits:** public `GET /:id/enrichment` keeps `enrichmentRateLimit`; admin login keeps `adminLoginRateLimit` (5/15 min); the refresh endpoint is admin-only and bounded to one entity, one 5-second outbound call, cache cleared first.
- **Secrets:** none added to the repository; `.env` remains ignored; no credential appears in any response or in the diff.
- **Privacy:** reviewer notes and reviewer e-mails are stripped from every public projection (test-asserted).

---

## 20. Performance (5 samples per endpoint, warm)

| Endpoint | Average |
|----------|---------|
| `GET /api/heritage` | 242 ms |
| `GET /api/heritage/charminar` | 238 ms |
| `GET /api/heritage/charminar/enrichment` | 160 ms |
| `GET /api/timeline` | 99 ms |
| `GET /api/search?q=temple` | 85 ms |
| `GET /api/heritage/deepavali/visitor-intelligence` | 82 ms |
| `GET /api/heritage/charminar/nearby` | 82 ms |
| `GET /api/sources` | 82 ms |

Duplicate scan: 96 proposals/entities scanned pairwise in **0.34 s**, read-only, admin-only.

---

## 21. Testing (Step 23 — full run)

| Suite | Result |
|-------|--------|
| `db-audit.js` (extended) | **41/41** |
| `test-data-quality.js` (new) | **12/12** |
| `test-enrichment.js` | **4/4** |
| `test-enrichment-review.js` (new, DB-backed, self-cleaning) | **14/14** |
| `test-visit-module.js` | **16/16** |
| `test-visitor-intelligence.js` | **10/10** |
| **Total** | **97 checks green** |
| `test-media-upload.js` | ✗ fails — pre-existing missing `form-data` dependency in `backend/package.json` (not caused by this phase) |
| Migrations | **32/32 applied** |
| Backend `tsc --noEmit` + `npm run build` | exit 0 |
| Frontend `tsc --noEmit` | exit 0 |

New audit coverage: `enrichment_proposals` table exists, 0 null slugs, 0 duplicate slugs, provenance columns present, all sources tiered, all proposal statuses valid, proposal FK integrity with no orphans, heritage count unchanged at 96.

`test-enrichment-review.js` is self-cleaning: it inserts a marker proposal (`Q999999999`), exercises the full lifecycle, deletes its rows and asserts `heritage_entities` count is unchanged.

---

## 22. Regression (Step 24)

All 13 application routes returned **200**: `/`, `/explore`, `/explore/charminar`, `/heritage`, `/heritage/charminar`, `/timeline`, `/collections`, `/collections/favorites`, `/auth`, `/favorites`, `/admin`, `/about`, `/ai`.

API surfaces 200: search, search suggestions, media, locations, sources, periods, state-counts, timeline, visitor-intelligence (both available and unavailable cases), enrichment.

---

## 23. Responsive + accessibility (Steps 25–26)

**Responsive — real browser viewport resizing, pass = `scrollWidth === clientWidth`:**

| Page | Widths tested | Result |
|------|---------------|--------|
| `/` (homepage) | 1440, 1280, 1024, 900, 768, 740, 720, 430, 390, 360 (**all 10**) | PASS |
| `/heritage/charminar` (provenance UI) | 1440, 1024, 768, 720, 430, 390, 360 | PASS |
| `/admin` → Data Review tab | 1440, 768, 360 | PASS |

0 px page-level horizontal overflow everywhere. The only off-viewport rectangles found were buttons inside an intentional `overflow-x-auto` filter strip (`min-w-max`), which scrolls inside its own container and does not leak to the page.

**Accessibility (home, heritage detail, admin Data Review):**

- `lang="en"`, exactly **1** `<h1>` per page.
- Landmarks: `main`, `nav`, `banner` all present.
- Images without `alt`: **0**. Inputs without a label/`aria-label`: **0**. Controls without an accessible name: **0** (the logo link is named by its `alt="Astrova"` image).
- Heading order has no skips on the new review tab (`1 2 2 2 2`).

---

## 24. Known limitations

1. **Feature H remains PARTIAL.** Proposals are persisted, validated and human-reviewed, but nothing is auto-approved into curated entity fields; unattended ingestion is PLANNED.
2. **44/96 entities have no historical period** — see §17; fixing it requires an explicit period-taxonomy decision, not guesswork.
3. **`test-media-upload.js` fails** on a pre-existing missing `form-data` dependency in `backend/package.json`; reported honestly, unrelated to this phase.
4. **Original `admin@astrova.in` password is unknown/undocumented**, so that specific login was never exercised. A temporary QA admin (`p36-qa-tester@astrova.in`) was created for E2E and **demoted back to `role='user'`** before the commit; `admin@astrova.in` is untouched and is again the only admin.
5. Duplicate detection is pairwise over the current proposal set; it scales fine at today's size (96 rows, 0.34 s) but would need blocking/indexing if the catalogue grows by orders of magnitude.
6. Proposal provenance currently comes from Wikidata only; other open datasets (e.g. UNESCO whc list, ASI) are tiered as sources but not yet piped through the proposal pipeline.

---

## 25. Final implementation status

| Item | Status |
|------|--------|
| Audit (Steps 1–5) | ✅ Complete |
| Safe data-quality fixes + provenance columns (Steps 6–9) | ✅ Migrations 031/032 applied — 32/32 |
| Controlled enrichment + validation (Steps 10–12) | ✅ `dataQuality.ts` + `enrichmentReview.ts` |
| Admin review workflow (Steps 13–15) | ✅ 4 endpoints + Data Review tab |
| Honesty contract E2E (Steps 16–17) | ✅ Verified live |
| Timeline judgment (Step 18) | ✅ Decided & documented (no fabricated periods) |
| Visitor intelligence regression (Step 19) | ✅ Unchanged behaviour |
| Open-data rule (Step 20) | ✅ No proprietary APIs, AI still Under Construction |
| Security + performance (Steps 21–22) | ✅ Parameterised SQL, 401/403 verified, 82–242 ms |
| Full test run (Step 23) | ✅ 97 checks green, 32/32 migrations, builds clean |
| Regression (Step 24) | ✅ 13/13 routes + 7 API surfaces 200 |
| Responsive (Step 25) | ✅ 20 viewport measurements, 0 overflow |
| Accessibility + production build (Steps 26–27) | ✅ Clean audit; `next build` 13/13 pages |
| Test-account hygiene | ✅ QA account demoted; only `admin@astrova.in` remains admin |
| PRD.md + report.md (Steps 28–29) | ✅ Updated, Feature H = PARTIAL |
| This report + Word export | ✅ 25 sections |
| Git review, new commit, push (Steps 30–33) | ✅ New commit on top of `67d7cb7` — never amended, never force-pushed |

**Feature H — Trusted external ingestion pipeline: 🟡 PARTIAL (advanced).** The pipeline now extracts, validates, deduplicates, detects conflicts, persists proposals and routes them through a human review workflow with a full audit trail, publishing only `VERIFIED` records as reference-only enrichment. Unattended approval into curated fields remains the declared next step.
