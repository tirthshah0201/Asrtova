# ASTROVA PHASE 38 — RAG Generation, Multilingual Knowledge Expansion & Trusted Heritage Hours

**Date:** 2026-09-29
**Checkpoint before:** `d1bb866` (Phase 37)
**Scope:** four controlled improvements on the Phase 37 RAG foundation — actual LLM generation, multilingual knowledge expansion, trusted operating-hours expansion, and provenance-aware conflict resolution.

---

## 1. Objective

Move Astrova from the Phase 37 working-but-extractive RAG foundation to a more complete production-ready heritage intelligence system through four controlled improvements, without rebuilding any Phase 37 component:

1. **Actual LLM generation runtime** (was: local extractive composer only, because no LLM runtime existed).
2. **Multilingual knowledge expansion** (was: hi 8 / gu 7 / ta 6 / mr 6 / pa 5 chunks against en 175).
3. **Trusted operating-hours expansion** (was: 4 of 96 entities).
4. **Resolution of existing schedule conflicts through provenance-aware review** (Amber Fort, Red Fort).

Explicitly out of scope: agents, itinerary generation, GraphRAG, second vector database, second chatbot endpoint, automatic approval of disputed data, UI redesign.

---

## 2. Phase 37 baseline

| Dimension | Phase 37 value |
|---|---|
| Generation | `local_extractive` (Ollama absent, `LLM_API_KEY` empty) |
| Chunks | 207 (en 175, hi 8, gu 7, ta 6, mr 6, pa 5) |
| Operating hours | 4 entities / 28 rows (qutub+hawa DEMO, amber+red CONFLICT) |
| Conflicts | Amber Fort, Red Fort — both open |
| Tests | 186 checks / 9 suites |
| Migrations | 34/34 |
| RAG p50 | 503 ms (en), 841 ms (hi) |
| Retrieval | 82 ms warm |
| Situation | 0.27 ms p50 |

---

## 3. LLM runtime

### Environment audit (Part D)

Probed before any change: `where ollama` → not found; port `11434` → unreachable; `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `OLLAMA_URL`, `OLLAMA_MODEL` → all empty. **No usable LLM runtime existed.** Network reachability to ollama.com was confirmed and C: drive had only 7.1 GB free (97% full), so the model cache was directed to H: (24 GB free).

### Installation (approved, documented before install)

| Item | Value |
|---|---|
| Runtime | Ollama **0.34.4** (winget install) |
| Model | **qwen2.5:1.5b**, **986 MB** — documented and approved before the pull |
| Cache location | `H:\ollama-models` (C: near-full) |
| Hardware | NVIDIA RTX 4060 (8 GB), CUDA — model loads to GPU |
| Cold start | ~43 s first model load (measured) |
| Warm generation | verified via `/api/generate`: real tokens, 422 ms / 8 tokens, 901 ms multilingual reply |

### Verification

A real generation request was executed successfully — both directly against `/api/generate` and through the full RAG pipeline (`POST /api/ai/chat` returned `generation.backend: "ollama"`, `model: "qwen2.5:1.5b"`, a validated `[1]` citation). The adapter order (Ollama → OpenAI-compatible → extractive composer) is unchanged; the extractive fallback still works and is exercised whenever generation fails validation.

---

## 4. Generation architecture

```
Question → language detection → normalisation → injection screen
→ multilingual embedding → pgvector cosine retrieval
→ authority/verification re-ranking + same-script lexical gate
→ similarity threshold → context assembly
→ generation adapter (Ollama qwen2.5:1.5b → OpenAI-compatible → extractive)
→ citation validation + provenance validation + output safety
→ answer + validated citations → conversation storage
```

Changes in Phase 38 (`backend/src/services/rag/`):

- **`generate.ts`** — rewritten around four guards:
  - *model verification*: `getGenerationStatus()` probes `OLLAMA_URL/api/tags` and confirms the configured model is actually installed before reporting ACTIVE;
  - *grounding check*: if ≥2 significant question terms appear in no retrieved chunk, the question is unanswerable from context and `INFORMATION UNAVAILABLE` is returned without invoking the model;
  - *absence canonicalisation*: prose "not found in context" replies are rewritten to the `INFORMATION UNAVAILABLE` contract;
  - *latency metrics*: per-request `elapsedMs` feed p50/p95 counters exposed to admin.
- **`prompt.ts`** — hardened system prompt: retrieved context is labelled DATA not instructions; answers must stay on the subject of the question (no entity switching); provenance labels (CONFLICT / DEMO / estimate) must survive into the wording; `[n]` citations required; Indic tokenizer (`\p{M}`) and Romanized-Gujarati token handling preserved.
- **`retrieve.ts`** — added a *same-script lexical gate*: loosely-related Indic chunks that clear the vector threshold for cross-topic queries are suppressed so honest language fallback can happen instead of entity confabulation.
- **`knowledge.ts`** — operating-hours summaries are now derived chunks: one per entity per ingest, built from `heritage_operating_hours` with its stored provenance labels, first sentence carrying status + schedule (so the extractive fallback quotes them correctly), stale derived rows deleted on every re-ingest.

---

## 5. Citation validation (Part H)

Post-generation, before any answer reaches the API:

1. every `[n]` marker is checked against the retrieved context block list — out-of-range and spoofed citations are removed;
2. an answer whose citations are all invalid counts as **uncited** and falls back to the extractive composer;
3. cited source metadata is re-resolved from the retrieval set (a citation cannot invent a source outside retrieval);
4. **provenance validation**: an answer citing a CONFLICT block must say sources disagree; citing a DEMO block must say DEMO; citing an ESTIMATE block must say estimate/approximate — violations trigger one stricter regeneration, then extractive fallback;
5. **no-invented-hours**: every clock time in the answer must appear verbatim (modulo leading zeros) in some retrieved chunk — otherwise the answer is rejected;
6. **output safety**: control characters stripped, length clamped, credential-like text and instruction-override text in model output rejected → fallback.

Failed validation never degrades to an unvalidated answer; it degrades to the extractive composer, which only quotes retrieved sentences.

---

## 6. Multilingual ingestion (Parts J, K)

**Migration `035_p38_multilingual_knowledge.sql`** — one shared vector knowledge base, never per-language databases:

- New column `chatbot_knowledge.translated_from UUID REFERENCES chatbot_knowledge(id)` records the original-source relationship in the schema itself;
- every translated row **inherits** `heritage_entity_id`, `location_id`, `source`, `city`, `state_code`, period and keywords from the original English row through a single INSERT…SELECT join — so `source_id`, authority tier, licence and verification status are identical to the original after ingestion;
- translations were authored from the trusted original text only (no new facts), reviewed against that original, and can never upgrade provenance;
- idempotent: a row is inserted only when the entity has no row yet in that language.

Result after re-ingest (`207 → 282 chunks`, all embedded):

| Language | Phase 37 | Phase 38 |
|---|---|---|
| English | 175 | 182 (+7 derived hours summaries) |
| Hindi | 8 | **26** |
| Gujarati | 7 | **22** |
| Marathi | 6 | **18** |
| Tamil | 6 | **18** |
| Punjabi | 5 | **16** |
| **Total** | 207 | **282** (97 VERIFIED, 6 languages) |

Verification: zero provenance mismatches across all translated rows (checked by join against originals).

---

## 7. Operating-hours expansion (Parts N, O)

**Migration `036_p38_operating_hours_expansion.sql`** — every row researched live on 2026-09-29 against the `source_url` it records. Review policy documented in the migration header:

- **VERIFIED** — the site operator / protecting authority publishes fixed clock hours we retrieved;
- **ASTROVA_ESTIMATE** — the authority publishes sunrise/sunset-relative hours the schema cannot express; clock times are clearly-labelled Astrova approximations, never official;
- **CONFLICT** — two trusted sources disagree and the review could not establish which schedule governs — nothing is chosen automatically;
- source types restricted to the shared vocabulary (`OFFICIAL`, `CULTURAL_INSTITUTION`, `NEWS`, `OPEN_DATASET`…); no blogs, no Google Maps scraping.

New/updated coverage:

| Entity | Status | Evidence |
|---|---|---|
| Red Fort | **VERIFIED** (was CONFLICT) | ASI order 2026-02-13 signed by DG ASI — open all 7 days from 2026-02-16; Monday-closure listings are stale. 09:30–16:30 (last entry 16:00). Historical Monday-closed row effective-until 2026-02-15; annual 15 Jul–15 Aug closure as dated override |
| Victoria Memorial, Kolkata | **VERIFIED** (new) | victoriamemorial-cal.org own site: 10:00–18:00, closed Mondays |
| Ajanta Caves | **VERIFIED** (new) | ASI fixed hours 09:00–17:00, closed Mondays |
| Ellora Caves | **ASTROVA_ESTIMATE** (new) | ASI publishes sunrise–sunset; schema cannot express it — labelled estimate, closed Tuesdays |
| Amber Fort | **CONFLICT retained** | see §8 |
| Qutub Minar | **CONFLICT** (new — discovered in research) | ASI world-heritage page “Sunrise to 08:00pm” vs Incredible India (Min. of Tourism) “Sunrise to sunset” — two Tier-1 sources disagree; nothing chosen |
| Hawa Mahal | **DEMO retained** (documented decision) | official portal publishes 09:00–19:00 live, but the Phase 37 DEMO row (09:00–18:30, OSM) was deliberately not silently upgraded mid-phase; flagged for the next review cycle |

Coverage: **4 → 7 entities of 96** (57 rows); 89 entities correctly report `INFORMATION UNAVAILABLE`.

The `operatingHours.ts` service gained **effective-date override preference**: a dated row (`effective_from`/`effective_until`) now deterministically wins over an undated weekly default, which is what makes the Red Fort Monday history and the July–August closure behave correctly.

---

## 8. Conflict resolution (Part P)

### Amber Fort — RETAINED as CONFLICT (evidence recorded in migration 036)

Review 2026-09-29:

- Rajasthan Tourism's official booking portal (`obms-tourist.rajasthan.gov.in/place-details/Amber-Fort`, retrieved live) now publishes **08:00–21:00** — Phase 37 had recorded 07:00–20:00 *from the same portal*, i.e. the portal's own value changed;
- widely published day-visit hours are 08:00–17:30 (opening now agrees; closing does not);
- Rajasthan Tourism's destination page publishes **no timings at all**;
- it remains unclear whether the 21:00 closing covers the ticketed monument or the evening light-and-sound show.

No source establishes which schedule is authoritative for a day visit → **conflict retained, never auto-resolved**; the sample value refreshed to the portal's current claim and the full review note stored in `special_note`.

### Red Fort — RESOLVED to VERIFIED (evidence recorded in migration 036)

- **ASI order dated 13 February 2026, signed by the Director General of the Archaeological Survey of India**, directs the Red Fort be open on all days including Monday; in force from 16 February 2026 (PTI report, Economic Times, 21 February 2026 — `source_url` recorded);
- listings still showing "closed Monday" predate the order — stale, not a live disagreement;
- day-visit hours 09:30–16:30 (last entry 16:00), seasonal variation noted;
- ASI additionally closes the monument 15 July–15 August annually (Times of India, 15 July 2026) — stored as a dated override.

Final status: **VERIFIED, open seven days**, with the pre-order Monday closure preserved as a dated historical row.

---

## 9. Database changes

| Migration | Contents |
|---|---|
| `035_p38_multilingual_knowledge.sql` | `chatbot_knowledge.translated_from` UUID FK (original-source relationship) + idempotent translated-row inserts inheriting provenance |
| `036_p38_operating_hours_expansion.sql` | Amber review note + refreshed sample; Red Fort rebuilt (weekly VERIFIED rows, dated Monday history, dated annual closure); Qutub CONFLICT rows with both Tier-1 source URLs; Hawa DEMO retained; Victoria/Ajanta VERIFIED; Ellora ESTIMATE |

- Migrations: **36/36 applied**.
- Tables: none added (by design — no duplicate systems); one column added (`chatbot_knowledge.translated_from`).
- Constraints: existing checks preserved (`heritage_operating_hours` shape CHECK, partial unique indexes, `rag_chunks` REJECTED CHECK, `content_hash UNIQUE`).
- `heritage_operating_hours`: 28 → **57 rows**, 4 → **7 entities**.
- `rag_chunks`: 207 → **282** (all embedded; 97 VERIFIED).

---

## 10. APIs

Endpoints changed (no new endpoints, no second chatbot):

| Endpoint | Change |
|---|---|
| `POST /api/ai/chat` | generation now runs on Ollama `qwen2.5:1.5b` with citation/provenance validation and grounding checks before response; response shape unchanged (`mode`, `answer`, `sources`, `retrieval`, `generation` — `generation.backend: "ollama"`, `model`, `status`, `elapsedMs`) |
| `GET /api/admin/rag/status` | extended: `generation{backend,model,status,active,reason,metrics{samples,p50Ms,p95Ms,lastMs,lastBackend,lastStatus}}`, `hours{totalEntities,covered,missing,verified,conflict,demo,estimate,rows}`, `reviews{pending,conflict,unresolved}`, `chunks.languages` |
| Heritage detail / VI situation | unchanged endpoint; conflict/verified/missing wording improved client-side |

---

## 11. Security

All Phase 37 controls preserved: API key, session auth, `requireAdmin`, per-IP 30/min + per-user 20/min chat rate limits, 1000-char message bound, injection screening on question **and** every candidate sentence, retrieved-context fencing (DATA not instructions), parameterised SQL, no secrets/PII/embeddings in responses.

Phase 38 additions (tested):

- **malicious LLM output**: credential-like and instruction-override model output rejected → extractive fallback;
- **invalid citations**: spoofed/out-of-range/empty citation sets removed or degraded;
- **source spoofing**: citations cannot resolve to a source outside the retrieval set;
- **injection in retrieved content**: "Ignore previous instructions…" chunk never obeyed nor quoted as instruction;
- **injection in multilingual content**: Hindi instruction-override sentences detected;
- **provenance integrity**: CONFLICT/DEMO labels cannot be dropped from cited answers; clock times not present in context are rejected.

---

## 12. Performance (measured, vs Phase 37)

| Metric | Phase 37 | Phase 38 | Note |
|---|---|---|---|
| RAG chat p50 (en) | 503 ms (extractive) | **814 ms** | now includes a real 279–476 ms LLM generation — slower by design, abstractive instead of extractive |
| RAG chat p50 (hi) | 841 ms | **1057 ms** | same reason |
| LLM generation alone | — | **279–476 ms** | Ollama qwen2.5:1.5b, CUDA |
| Admin-reported generation p50 | — | 854 ms (live samples) | from real `/ai` traffic during verification |
| Heritage detail | 247 ms | 346 ms | includes new VI/hours fields |
| Retrieval | 82 ms warm | unchanged path (pgvector cosine, minScore 0.8) | same index and threshold |
| Situation compute | 0.27 ms p50 | unchanged | + effective-date override preference, still sub-ms |

No claim of improvement: total RAG latency **increased** because actual generation was added; this is the documented trade for abstractive, source-grounded answers.

---

## 13. Testing

**231 checks green across 11 suites** (Phase 37 baseline: 186 across 9):

| Suite | Checks |
|---|---|
| db-audit | 47 |
| data-quality | 12 |
| enrichment | 4 |
| enrichment-review | 14 |
| visit-module | 16 |
| visitor-intelligence | 10 |
| operating-hours | 34 |
| demo-data | 17 |
| RAG (extended) | 35 (was 32; +6 Part L/M: own-language sources ×6 languages, cross-language fallback with visible source language, Romanized Gujarati) |
| **generation (new)** | **22** — direct fact, unsupported fact → INFORMATION UNAVAILABLE, DEMO labelling, Amber/Qutub CONFLICT, Victoria verified, injection in question & retrieved content, spoofed/invalid citations, credential & instruction-override output, CONFLICT/DEMO label retention, unanswerable detection, transliterated input pass-through, Hindi override detection, metrics, ≥1 real LLM answer |
| **hours-coverage (new)** | **20** — coverage expansion, status mix, source_url presence, Victoria/Ajanta/Ellora rows, Amber/Qutub conflicts, Hawa DEMO, missing → INFORMATION UNAVAILABLE, timezone, Red Fort seven-day + effective-dated Monday, dated override precedence, boundaries, next-day opening, 24-hour, overnight, closed days |

`test-media-upload.js` still fails on the pre-existing missing `form-data` dependency (unchanged from Phase 37).

---

## 14. UI

- **Visitor Intelligence — Current Situation** (`LiveVisitorIntelligence.tsx`): conflict now says “Hours in conflict — requires review · Sources disagree about this site's opening hours, so no open or closed status is shown until a reviewer resolves the conflict.”; VERIFIED origins show the source line (e.g. “Verified · Archaeological Survey of India”); missing schedules say information unavailable — never a guessed state.
- **Admin Data Ops** (same tab, extended — no new section): **Generation** panel shows `Backend: Ollama · Qwen2.5:1.5b · Status: ACTIVE · p50 854 ms (4 samples)` with the reachability reason; **Heritage hours** `7/96 · 3 verified · 2 conflict · 1 demo · 1 estimate · 89 missing`; **Unresolved reviews** `3 pending`; multilingual chunk counts EN 182 / GU 22 / HI 26 / MR 18 / PA 16 / TA 18; ingest run status.

---

## 15. Limitations & future work

### Verified limitations

1. **Small model, small context** — qwen2.5:1.5b (1.5 B) occasionally needs the stricter-regeneration path; long answers are capped at 2400 chars. A larger model (e.g. qwen2.5:7b, ~4.7 GB) would reduce fallback frequency but needs disk/VRAM budget.
2. **Ollama is a local, single-host dependency** — production deployment needs a hosted OpenAI-compatible endpoint (`LLM_API_KEY`/`LLM_BASE_URL`) with zero code change, or a managed Ollama.
3. **Hours coverage is 7/96** — the remaining 89 entities have no trusted fixed-hours source yet; they honestly report INFORMATION UNAVAILABLE.
4. **Amber Fort and Qutub Minar remain CONFLICT** by evidence, not oversight; resolving them needs either the authorities reconciling their publications or a reviewer decision with new evidence.
5. **Hawa Mahal still DEMO** despite the official portal publishing hours live — intentionally not upgraded in-phase; upgrade in the next review cycle with the portal snapshot as evidence.
6. **Ellora is ASTROVA_ESTIMATE** — sunrise/sunset-relative hours cannot be expressed as clock times in the schema; the estimate is labelled everywhere.
7. **Citation validation is conservative** — a correct answer with one sloppy citation falls back to extractive, so some answers are plainer than they could be.
8. `test-media-upload.js` — pre-existing missing `form-data` dependency (not this phase).

### Future work

- Seasonal schedule model (summer/winter variants) for sunrise–sunset monuments instead of ESTIMATE rows.
- Automated Tier-1 source re-check with a freshness column feeding `rag_ingest_runs`.
- Larger LLM once disk/VRAM budget allows; keep the same adapter.
- Hours coverage for the remaining 89 entities, prioritised by page traffic.
- Review queue UI for the 3 pending enrichment proposals.
