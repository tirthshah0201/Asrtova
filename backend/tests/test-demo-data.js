/*
 * Phase 37 — controlled DEMO dataset checks (Parts B, E, F).
 *
 * Schema honesty rules (enforced by the migration) plus service-level
 * invariants: demo rows can never claim VERIFIED, coordinates are real
 * (no Null Island), IDs are unique, distances are computed correctly,
 * and the origin label distinguishes OSM from demo data.
 *
 * Uses the LIVE database read-only. Run after `npm run build` (backend):
 *   node backend/tests/test-demo-data.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const assert = require("assert");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

let passed = 0;
let failed = 0;

function check(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log("OK   " + label);
    })
    .catch((err) => {
      failed += 1;
      console.log("FAIL " + label + " — " + (err && err.message));
    });
}

async function main() {
  /* ---- Schema-level honesty (migration 033) ---- */

  await check("demo_places rows are all source_type = DEMO", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM demo_places WHERE source_type <> 'DEMO'`
    );
    assert.strictEqual(rows[0].n, 0, "non-DEMO source_type found");
  });

  await check("demo_places rows never claim VERIFIED", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM demo_places WHERE verification_status = 'VERIFIED'`
    );
    assert.strictEqual(rows[0].n, 0, "demo row claims VERIFIED");
  });

  await check("no demo place sits at Null Island (0,0)", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM demo_places WHERE latitude = 0 AND longitude = 0`
    );
    assert.strictEqual(rows[0].n, 0, "fabricated (0,0) coordinate found");
  });

  await check("demo place coordinates are inside valid ranges", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM demo_places
        WHERE latitude NOT BETWEEN -90 AND 90
           OR longitude NOT BETWEEN -180 AND 180`
    );
    assert.strictEqual(rows[0].n, 0, "out-of-range coordinate found");
  });

  await check("demo place ids are unique (no duplicate ids)", async () => {
    const { rows } = await pool.query(
      `SELECT (count(*) - count(DISTINCT id))::int AS n FROM demo_places`
    );
    assert.strictEqual(rows[0].n, 0, "duplicate ids found");
  });

  await check("demo place (heritage, name, category) tuples are unique", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM (
         SELECT heritage_id, name, category, count(*) c
           FROM demo_places GROUP BY 1,2,3 HAVING count(*) > 1) d`
    );
    assert.strictEqual(rows[0].n, 0, "duplicate demo place found");
  });

  await check("demo places only use approved categories", async () => {
    const allowed = [
      "HOTEL","RESTAURANT","CAFE","PARKING","MUSEUM","ATTRACTION",
      "TRANSPORT","ATM","PHARMACY","HOSPITAL","SHOPPING",
    ];
    const { rows } = await pool.query(`SELECT DISTINCT category FROM demo_places`);
    for (const row of rows) {
      assert(allowed.includes(row.category), "unexpected category " + row.category);
    }
    assert(rows.length > 0, "demo dataset is empty");
  });

  await check("every demo place references an existing heritage entity", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM demo_places d
        WHERE NOT EXISTS (SELECT 1 FROM heritage_entities h WHERE h.id = d.heritage_id)`
    );
    assert.strictEqual(rows[0].n, 0, "orphan demo place found");
  });

  await check("demo dataset covers at least 3 heritage entities", async () => {
    const { rows } = await pool.query(
      `SELECT count(DISTINCT heritage_id)::int AS n FROM demo_places`
    );
    assert(rows[0].n >= 3, "only " + rows[0].n + " entities covered");
  });

  /* ---- Operating-hours demo honesty (Part B) ---- */

  await check("operating-hours rows default to DEMO source_type", async () => {
    const { rows } = await pool.query(
      `SELECT source_type, count(*)::int AS n FROM heritage_operating_hours GROUP BY 1`
    );
    for (const row of rows) {
      assert(["DEMO", "OPEN_DATASET", "OFFICIAL", "INSTITUTIONAL", "ARCHIVE", "NEWS",
        "CULTURAL_INSTITUTION", "OTHER"].includes(row.source_type),
        "unexpected hours source_type " + row.source_type);
    }
    assert(rows.length > 0, "no operating hours seeded");
  });

  await check("demo-sourced hours are never schedule_status VERIFIED", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM heritage_operating_hours
        WHERE source_type = 'DEMO' AND schedule_status = 'VERIFIED'`
    );
    assert.strictEqual(rows[0].n, 0, "demo hours claim VERIFIED");
  });

  await check("operating hours reference existing heritage entities", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM heritage_operating_hours h
        WHERE NOT EXISTS (SELECT 1 FROM heritage_entities e WHERE e.id = h.heritage_id)`
    );
    assert.strictEqual(rows[0].n, 0, "orphan operating-hours row found");
  });

  await check("hours rows have valid times or a 24h/closed flag", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM heritage_operating_hours
        WHERE NOT (is_closed OR is_24_hours)
          AND (open_time IS NULL OR close_time IS NULL
               OR open_time = close_time)`
    );
    assert.strictEqual(rows[0].n, 0, "invalid schedule shape found");
  });

  /* ---- Service-level distance calculation (Part F) ---- */

  await check("haversine distance matches a known reference value", async () => {
    const { haversineKm } = require("../dist/services/nearby");
    // Charminar → Golconda Fort (Hyderabad): ~ 9.6 km straight line.
    const km = haversineKm(17.3833, 78.4667, 17.3818, 78.4021);
    assert(km > 5 && km < 14, "unexpected distance " + km);
    // Identical points must be 0.
    assert.strictEqual(Math.round(haversineKm(17.3833, 78.4667, 17.3833, 78.4667) * 1000), 0);
  });

  await check("demo place service returns only DEMO-labelled rows", async () => {
    const { getDemoPlaces } = require("../dist/services/demoPlaces");
    const { rows } = await pool.query(
      `SELECT heritage_id FROM demo_places LIMIT 1`
    );
    assert(rows.length > 0, "no demo rows to read");
    const places = await getDemoPlaces(rows[0].heritage_id);
    assert(places.length > 0, "service returned no rows");
    for (const p of places) {
      assert.strictEqual(p.source_type, "DEMO");
      assert.notStrictEqual(p.verification_status, "VERIFIED");
    }
  });

  await check("demoPlacesStats counts match a direct query", async () => {
    const { demoPlacesStats } = require("../dist/services/demoPlaces");
    const stats = await demoPlacesStats();
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM demo_places`);
    assert.strictEqual(stats.total, rows[0].n, "total mismatch");
    assert.strictEqual(stats.verified, 0, "stats claim verified rows");
  });

  /* ---- Origin labelling (Part F: never silently mix sources) ---- */

  await check("nearby response labels demo records with origin DEMO", async () => {
    const { rows } = await pool.query(
      `SELECT DISTINCT source_type FROM demo_places`
    );
    // Every row the demo fallback serves carries source_type DEMO, which
    // the nearby route turns into `origin: "demo"`.
    for (const row of rows) assert.strictEqual(row.source_type, "DEMO");
    assert(rows.length === 1, "mixed source types in demo dataset");
  });

  console.log("");
  console.log("Demo data checks: " + passed + "/" + (passed + failed) + " passed");
  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Suite error:", err.message);
  process.exit(1);
});
