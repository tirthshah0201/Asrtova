/*
 * Phase 36 — enrichment review workflow integration checks.
 * Uses the LIVE database but only touches rows this test creates
 * (marker external_id Q999999999), which it removes afterwards.
 * Never modifies heritage data. Run after `npm run build` (backend):
 *   node backend/tests/test-enrichment-review.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const assert = require("assert");
const { Pool } = require("pg");
const {
  syncProposals,
  reviewProposal,
  listProposals,
  publicReviewFor,
  scanPossibleDuplicates,
} = require("../dist/services/enrichmentReview");

const MARKER = "Q999999999";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

/** Minimal EnrichmentResult shaped like the live pipeline output. */
function fakeResult(overrides = {}) {
  const provenance = {
    source: "Wikidata",
    sourceUrl: `https://www.wikidata.org/wiki/${MARKER}`,
    license: "CC0 1.0",
    retrievedAt: new Date().toISOString(),
  };
  return {
    status: "matched",
    candidate: {
      wikidataId: MARKER,
      label: "Test Monument",
      description: null,
      url: `https://www.wikidata.org/wiki/${MARKER}`,
      distanceFromEntityKm: 0,
      matchScore: 0.98,
    },
    proposals: [
      { field: "description", value: "A test proposal used only by the Phase 36 integration test suite.", provenance },
      { field: "inception_year", value: "1592", provenance },
      { field: "official_website", value: "javascript:alert(1)", provenance }, // must be rejected by validation
    ],
    conflicts: [],
    duplicateOf: null,
    sources: [],
    meta: {
      generatedAt: provenance.retrievedAt,
      provider: "Wikidata",
      license: "CC0 1.0",
      approvalStatus: "pending_review",
      note: "test",
    },
    ...overrides,
  };
}

async function cleanup() {
  await pool.query(`DELETE FROM enrichment_proposals WHERE external_id = $1`, [MARKER]);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("FAIL: DATABASE_URL missing");
    process.exit(1);
  }

  let passed = 0;
  const ok = (msg) => { passed++; console.log(`  OK   ${msg}`); };

  try {
    // Baseline: entity to attach proposals to
    const ent = await pool.query(
      `SELECT id FROM heritage_entities WHERE slug IS NOT NULL ORDER BY created_at LIMIT 1`
    );
    assert.ok(ent.rows.length > 0, "need at least one heritage entity");
    const entityId = ent.rows[0].id;

    const before = await pool.query(
      `SELECT count(*)::int AS n FROM enrichment_proposals`
    );

    await cleanup();

    /* 1. Guarded sync: valid proposals stored, malformed one skipped. */
    const sync1 = await syncProposals(entityId, fakeResult());
    assert.strictEqual(sync1.inserted, 2, `2 valid proposals inserted (got ${sync1.inserted})`);
    assert.strictEqual(sync1.skipped, 1, "javascript: URL must be skipped");
    assert.ok(
      sync1.reasons.some((r) => r.startsWith("official_website")),
      "skip reason names the rejected field"
    );
    ok("sync inserts validated proposals and skips malformed external data");

    /* 2. Initial status is PENDING_REVIEW (no conflicts). */
    const rows1 = await pool.query(
      `SELECT id, status, current_value FROM enrichment_proposals WHERE entity_id = $1 AND external_id = $2`,
      [entityId, MARKER]
    );
    assert.strictEqual(rows1.rows.length, 2);
    assert.ok(rows1.rows.every((r) => r.status === "PENDING_REVIEW"));
    ok("fresh proposals start as PENDING_REVIEW — never auto-verified");

    /* 3. Re-sync is idempotent: no duplicates, no status reset. */
    const sync2 = await syncProposals(entityId, fakeResult());
    assert.strictEqual(sync2.inserted, 0, "re-sync inserts nothing new");
    const rows2 = await pool.query(
      `SELECT count(*)::int AS n FROM enrichment_proposals WHERE external_id = $1`,
      [MARKER]
    );
    assert.strictEqual(rows2.rows[0].n, 2, "UNIQUE constraint holds");
    ok("re-sync is idempotent (UNIQUE entity/external/field/value)");

    /* 4. Conflicted sync starts as CONFLICT, not silently resolved. */
    const conflicted = fakeResult({
      conflicts: [{ type: "distance", detail: "External coordinates differ by 12.0 km." }],
      proposals: [
        {
          field: "coordinates",
          value: "26.9124, 75.7873",
          provenance: {
            source: "Wikidata",
            sourceUrl: `https://www.wikidata.org/wiki/${MARKER}`,
            license: "CC0 1.0",
            retrievedAt: new Date().toISOString(),
          },
        },
      ],
    });
    const sync3 = await syncProposals(entityId, conflicted);
    assert.strictEqual(sync3.inserted, 1);
    const confRow = await pool.query(
      `SELECT status, conflicts FROM enrichment_proposals WHERE external_id = $1 AND field = 'coordinates'`,
      [MARKER]
    );
    assert.strictEqual(confRow.rows[0].status, "CONFLICT", "conflicted proposal → CONFLICT");
    assert.strictEqual(confRow.rows[0].conflicts.length, 1, "conflict detail persisted");
    ok("conflicting extraction lands as CONFLICT with reasons attached");

    /* 5. Review transitions. */
    const descRow = await pool.query(
      `SELECT id FROM enrichment_proposals WHERE external_id = $1 AND field = 'description'`,
      [MARKER]
    );
    const descId = descRow.rows[0].id;

    let r = await reviewProposal({ proposalId: descId, action: "verify", reviewer: "tester@astrova.in" });
    assert.ok(r.ok && r.status === "VERIFIED");
    ok("PENDING_REVIEW → VERIFIED");

    // Verified is not directly flippable to rejected — must reopen first.
    r = await reviewProposal({ proposalId: descId, action: "reject", reviewer: "tester@astrova.in" });
    assert.ok(!r.ok, "VERIFIED → REJECTED must be refused");
    assert.ok(/cannot move/i.test(r.error || ""), "refusal explains the transition rule");
    ok("VERIFIED cannot flip straight to REJECTED");

    r = await reviewProposal({ proposalId: descId, action: "reopen", reviewer: "tester@astrova.in" });
    assert.ok(r.ok && r.status === "PENDING_REVIEW");
    r = await reviewProposal({ proposalId: descId, action: "reject", reviewer: "tester@astrova.in", note: "stale" });
    assert.ok(r.ok && r.status === "REJECTED");
    ok("reopen → PENDING_REVIEW → REJECTED with reviewer note");

    r = await reviewProposal({ proposalId: "00000000-0000-0000-0000-000000000000", action: "verify", reviewer: "x" });
    assert.ok(!r.ok && /not found/i.test(r.error || ""));
    ok("unknown proposal id → not found");

    /* 6. Re-sync after a human decision never resets it. */
    const sync4 = await syncProposals(entityId, fakeResult());
    assert.strictEqual(sync4.inserted, 0);
    const descAfter = await pool.query(
      `SELECT status FROM enrichment_proposals WHERE id = $1`,
      [descId]
    );
    assert.strictEqual(descAfter.rows[0].status, "REJECTED", "REJECTED survives re-extraction");
    ok("re-extraction never overwrites a review decision");

    /* 7. Public projection: statuses only, REJECTED present for caller to filter,
          no reviewer note/identity anywhere. */
    const pub = await publicReviewFor(entityId);
    const key = `${MARKER}|description|A test proposal used only by the Phase 36 integration test suite.`;
    assert.ok(pub.has(key), "public map covers stored proposal");
    assert.strictEqual(pub.get(key).status, "REJECTED", "caller can filter REJECTED");
    assert.ok(!("reviewer_note" in pub.get(key)), "no reviewer note exposed");
    assert.ok(!("reviewedBy" in pub.get(key)), "no reviewer identity exposed");
    ok("public projection carries status only — never review metadata");

    /* 8. Admin listing sees everything incl. note. */
    const listed = await listProposals({ entityId, limit: 100 });
    const found = listed.rows.find((x) => x.id === descId);
    assert.ok(found, "admin list contains the proposal");
    assert.strictEqual(found.reviewer_note, "stale", "admin sees reviewer notes");
    ok("admin listing includes reviewer notes (admin-only)");

    /* 9. Duplicate scan is read-only and conservative. */
    const scan = await scanPossibleDuplicates();
    assert.ok(scan.scanned >= 96, `corpus scanned (${scan.scanned})`);
    assert.ok(Array.isArray(scan.pairs));
    assert.ok(
      scan.pairs.every((p) => p.verdict !== "DUPLICATE" || p.score === undefined) &&
        scan.pairs.every((p) => p.score >= 0.75),
      "only above-threshold POSSIBLE DUPLICATE flags returned"
    );
    const countAfterScan = await pool.query(`SELECT count(*)::int AS n FROM heritage_entities`);
    assert.strictEqual(countAfterScan.rows[0].n, 96, "scan never modifies heritage records");
    ok("duplicate scan read-only; flags only above threshold");

    /* 10. Cleanup test rows, verify baseline restored. */
    await cleanup();
    const after = await pool.query(`SELECT count(*)::int AS n FROM enrichment_proposals`);
    assert.strictEqual(after.rows[0].n, before.rows[0].n, "test rows removed; baseline restored");
    ok("self-cleaning: marker rows removed, baseline restored");

    const finalCount = await pool.query(`SELECT count(*)::int AS n FROM heritage_entities`);
    assert.strictEqual(finalCount.rows[0].n, 96, "heritage_entities untouched");
    ok("heritage_entities count unchanged (96)");

    console.log(`\nEnrichment review workflow: ${passed}/${passed} passed`);
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await cleanup().catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().catch((e) => {
  console.error("FAIL fatal:", e.message);
  process.exit(1);
});
