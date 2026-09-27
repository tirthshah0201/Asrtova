/*
 * Enrichment unit checks (Feature H — safe pipeline half).
 * Pure functions only; no network. Run after `npm run build` (backend) with:
 *   node backend/tests/test-enrichment.js
 */

const assert = require("assert");
const {
  normalizeLabel,
  labelSimilarity,
  coordinateDistanceKm,
  parseWikidataYear,
  MIN_MATCH_SCORE,
  CONFLICT_DISTANCE_KM,
} = require("../dist/services/enrichment");

/* ---- normalizeLabel ---- */
assert.strictEqual(normalizeLabel("Amber Fort!"), "amber fort");
assert.strictEqual(normalizeLabel("  Majuli   Island  "), "majuli island");
assert.strictEqual(normalizeLabel("Chettinad’s Mansions"), "chettinad s mansions");

/* ---- labelSimilarity ---- */
assert.strictEqual(labelSimilarity("Amber Fort", "Amber Fort"), 1, "identical labels score 1");
assert.ok(
  labelSimilarity("Amber Fort", "Amber Fort, Jaipur") >= 0.7,
  "containment handles qualifiers"
);
assert.ok(
  labelSimilarity("Hawa Mahal", "Palace of Winds") < MIN_MATCH_SCORE,
  "unrelated names must fall below threshold"
);
const partial = labelSimilarity("Amber Fort", "Amber Palace");
assert.ok(partial > 0.3 && partial < 1, `token overlap is fractional (got ${partial})`);
assert.strictEqual(labelSimilarity("", "anything"), 0, "empty label scores 0");
assert.strictEqual(labelSimilarity("anything", ""), 0, "empty candidate scores 0");

/* ---- coordinateDistanceKm ---- */
const jaipurDelhi = coordinateDistanceKm(26.9124, 75.7873, 28.6139, 77.209);
assert.ok(Math.abs(jaipurDelhi - 236) < 15, `Jaipur–Delhi ≈ 236km (got ${jaipurDelhi.toFixed(1)})`);
assert.strictEqual(Math.round(coordinateDistanceKm(23.0225, 72.5714, 23.0225, 72.5714)), 0);
assert.strictEqual(coordinateDistanceKm(null, 75.8, 26.9, 75.8), null, "null latitude → null");
assert.strictEqual(coordinateDistanceKm(undefined, undefined, 26.9, 75.8), null);
assert.strictEqual(
  coordinateDistanceKm(Number.NaN, 75.8, 26.9, 75.8),
  null,
  "NaN must never be treated as (0,0)"
);

/* ---- parseWikidataYear ---- */
assert.strictEqual(parseWikidataYear("+1592-00-00T00:00:00Z"), "1592");
assert.strictEqual(parseWikidataYear("-0300-00-00T00:00:00Z"), "300 BCE");
assert.strictEqual(parseWikidataYear(null), null, "null time → null, never fabricated");
assert.strictEqual(parseWikidataYear("not a date"), null);

/* ---- threshold sanity (documents the pipeline constants) ---- */
assert.ok(MIN_MATCH_SCORE > 0 && MIN_MATCH_SCORE < 1, "match threshold in (0,1)");
assert.strictEqual(CONFLICT_DISTANCE_KM, 5, "conflict threshold is 5 km");

console.log("Enrichment checks: 4/4 passed");
