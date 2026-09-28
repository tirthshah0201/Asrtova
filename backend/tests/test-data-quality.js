/*
 * Phase 36 — data-quality unit checks (pure functions, no network, no DB).
 * Run after `npm run build` (backend) with:
 *   node backend/tests/test-data-quality.js
 */

const assert = require("assert");
const {
  AUTHORITY_TIERS,
  tierForSourceType,
  tierLabel,
  isHistoricalAuthority,
  PROPOSAL_FIELDS,
  validateProposalField,
  PROPOSAL_STATUSES,
  canTransition,
  initialStatusFor,
  POSSIBLE_DUPLICATE_THRESHOLD,
  normalizeName,
  scoreDuplicate,
  safeSlugFor,
  describeIssues,
  findDuplicateDescriptions,
} = require("../dist/services/dataQuality");

/* ---- Authority tier mapping (Step 4 hierarchy) ---- */
assert.strictEqual(tierForSourceType("ASI"), 1, "ASI is Tier 1");
assert.strictEqual(tierForSourceType("UNESCO"), 1, "UNESCO is Tier 1");
assert.strictEqual(tierForSourceType("GOVERNMENT"), 1, "GOVERNMENT is Tier 1");
assert.strictEqual(tierForSourceType("TOURISM"), 1, "state tourism is Tier 1");
assert.strictEqual(tierForSourceType("ARCHIVE"), 1, "archives are Tier 1");
assert.strictEqual(tierForSourceType("MUSEUM"), 2, "museum is Tier 2");
assert.strictEqual(tierForSourceType("ACADEMIC"), 2, "academic is Tier 2");
assert.strictEqual(tierForSourceType("OPEN_DATASET"), 3, "open dataset is Tier 3");
assert.strictEqual(tierForSourceType("NEWS"), null, "NEWS gets no authority tier");
assert.strictEqual(tierForSourceType(null), null, "null source type → null");
assert.strictEqual(tierForSourceType(""), null, "empty source type → null");

assert.strictEqual(tierLabel(1), "OFFICIAL");
assert.strictEqual(tierLabel(5), "ASTROVA ESTIMATE");
assert.strictEqual(tierLabel(null), "UNRATED");

assert.ok(isHistoricalAuthority(1) && isHistoricalAuthority(2) && isHistoricalAuthority(3));
assert.ok(!isHistoricalAuthority(4), "OSM (Tier 4) is never a historical authority");
assert.ok(!isHistoricalAuthority(5), "Astrova estimates are never historical authority");
assert.ok(!isHistoricalAuthority(null));

/* ---- Proposal field whitelist ---- */
assert.deepStrictEqual(
  [...PROPOSAL_FIELDS],
  ["description", "official_website", "inception_year", "coordinates", "instance_of"]
);

/* ---- Proposal value validation (malformed external data) ---- */
assert.ok(validateProposalField("description", "A brief history of the temple.").ok);
assert.strictEqual(validateProposalField("hacked_field", "x").ok, false, "non-whitelisted field rejected");
assert.strictEqual(validateProposalField("description", 42).ok, false, "non-string rejected");
assert.strictEqual(validateProposalField("description", "   ").ok, false, "empty rejected");
assert.strictEqual(
  validateProposalField("description", "<script>alert(1)</script>").ok,
  false,
  "markup rejected"
);

const urlOk = validateProposalField("official_website", "https://asi.nic.in/");
assert.ok(urlOk.ok, "https URL accepted");
assert.strictEqual(validateProposalField("official_website", "javascript:alert(1)").ok, false, "non-http(s) rejected");
assert.strictEqual(validateProposalField("official_website", "not a url").ok, false, "garbage URL rejected");

assert.ok(validateProposalField("inception_year", "1592").ok);
assert.ok(validateProposalField("inception_year", "300 BCE").ok);
assert.strictEqual(validateProposalField("inception_year", "circa 1592").ok, false, "fuzzy text rejected");
assert.strictEqual(validateProposalField("inception_year", "1592/1600").ok, false);

assert.ok(validateProposalField("coordinates", "26.9124, 75.7873").ok);
assert.strictEqual(validateProposalField("coordinates", "0, 0").ok, false, "Null Island rejected");
assert.strictEqual(validateProposalField("coordinates", "91, 10").ok, false, "lat out of range rejected");
assert.strictEqual(validateProposalField("coordinates", "abc, def").ok, false, "non-numeric rejected");

assert.ok(validateProposalField("instance_of", "Q12345").ok);
assert.strictEqual(validateProposalField("instance_of", "Q0").ok, false, "QID must not start with 0");
assert.strictEqual(validateProposalField("instance_of", "https://example.com").ok, false);

/* ---- Review status transitions (Step 14) ---- */
assert.deepStrictEqual([...PROPOSAL_STATUSES], ["DRAFT", "PENDING_REVIEW", "VERIFIED", "REJECTED", "CONFLICT"]);
assert.ok(canTransition("PENDING_REVIEW", "VERIFIED"));
assert.ok(canTransition("PENDING_REVIEW", "REJECTED"));
assert.ok(canTransition("PENDING_REVIEW", "CONFLICT"));
assert.ok(canTransition("CONFLICT", "VERIFIED"), "resolving a conflict is an explicit review");
assert.ok(canTransition("CONFLICT", "REJECTED"));
assert.ok(canTransition("DRAFT", "PENDING_REVIEW"));
assert.ok(!canTransition("VERIFIED", "REJECTED"), "verified decisions are terminal");
assert.ok(!canTransition("REJECTED", "VERIFIED"), "rejected decisions are terminal");
assert.ok(!canTransition("VERIFIED", "CONFLICT"));
assert.ok(!canTransition("BOGUS", "VERIFIED"), "unknown status never transitions");
assert.ok(!canTransition("PENDING_REVIEW", "BOGUS"));

assert.strictEqual(initialStatusFor(0), "PENDING_REVIEW");
assert.strictEqual(initialStatusFor(2), "CONFLICT", "conflicts start as CONFLICT — never auto-resolved");

/* ---- Duplicate detection (Step 9) ---- */
assert.ok(POSSIBLE_DUPLICATE_THRESHOLD > 0 && POSSIBLE_DUPLICATE_THRESHOLD < 1);
assert.strictEqual(normalizeName("Chettinad’s Mansions"), "chettinad s mansions");
assert.strictEqual(normalizeName(null), "");
assert.strictEqual(normalizeName("École School"), "ecole school", "diacritics normalized");

const near = scoreDuplicate(
  { name: "Charminar", state: "Telangana", category: "monument", latitude: 17.3616, longitude: 78.4747 },
  { name: "Charminar Monument", state: "Telangana", category: "monument", latitude: 17.362, longitude: 78.4745 }
);
assert.strictEqual(near.verdict, "POSSIBLE DUPLICATE", "near-identical records flagged");
assert.ok(near.score >= POSSIBLE_DUPLICATE_THRESHOLD, `score ${near.score} ≥ threshold`);
assert.ok(near.reasons.length > 0, "verdict carries evidence");

const apart = scoreDuplicate(
  { name: "Charminar", state: "Telangana", category: "monument", latitude: 17.36, longitude: 78.47 },
  { name: "Sun Temple", state: "Odisha", category: "temple", latitude: 20.24, longitude: 86.0 }
);
assert.strictEqual(apart.verdict, "UNLIKELY", "distinct records not flagged");

const insufficient = scoreDuplicate({ name: "Temple" }, { name: "Temple" });
assert.ok(
  insufficient.verdict === "UNLIKELY" || insufficient.score < 1,
  "name-only evidence stays conservative without corroborating state/category/coords"
);

/* ---- Slug safety (Step 3 guard) ---- */
const existing = new Set(["charminar", "deepavali"]);
const safe = safeSlugFor("Kumbh Mela", existing);
assert.ok(safe.ok, "collision-free name is safe");
assert.strictEqual(safe.slug, "kumbh-mela");
const collision = safeSlugFor("Charminar", existing);
assert.strictEqual(collision.ok, false, "collision refused — needs editorial review");
assert.ok(/collision/i.test(collision.reason));
const empty = safeSlugFor("!!!", existing);
assert.strictEqual(empty.ok, false, "unsluggable name refused");

/* ---- Description quality (Step 11) ---- */
assert.deepStrictEqual(describeIssues("").issues, ["EMPTY"]);
assert.deepStrictEqual(describeIssues(null).issues, ["EMPTY"]);
assert.ok(describeIssues("Too short.").issues.includes("TOO_SHORT"));
assert.ok(describeIssues("TODO").issues.includes("PLACEHOLDER"));
assert.ok(describeIssues("<b>bold</b>").issues.includes("MALFORMED"));
const good = describeIssues(
  "The Charminar was completed in 1591 and remains the defining monument of Hyderabad."
);
assert.ok(good.ok, "a real description passes");

const dupGroups = findDuplicateDescriptions([
  { id: "1", description: "Identical text describing one monument." },
  { id: "2", description: "Identical text describing one monument." },
  { id: "3", description: "Something entirely different with enough length to pass." },
]);
assert.strictEqual(dupGroups.length, 1, "one duplicate group found");
assert.deepStrictEqual(dupGroups[0].sort(), ["1", "2"]);
assert.strictEqual(findDuplicateDescriptions([{ id: "9", description: null }]).length, 0);

console.log("Data-quality checks: 12/12 passed");
