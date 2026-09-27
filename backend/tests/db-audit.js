/* Read-only Astrova database connectivity audit.
 * Run: node backend/tests/db-audit.js
 * Never modifies data, never prints credentials.
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const { Pool } = require("pg");

const REQUIRED_TABLES = [
  "heritage_entities", "locations", "historical_periods", "media",
  "sources", "collections", "collection_items", "users", "user_favorites",
  "chatbot_knowledge", "conversations", "conversation_messages",
  "supported_states", "relationships", "analytics_events",
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("FAIL: DATABASE_URL missing");
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  const results = [];
  const ok = (name, detail) => results.push(["OK", name, detail]);
  const fail = (name, detail) => results.push(["FAIL", name, detail]);

  try {
    const r = await pool.query("SELECT version()");
    ok("connect", r.rows[0].version.split(",")[0]);
  } catch (e) {
    fail("connect", e.message);
    printAndExit(results, pool);
    return;
  }

  // Tables
  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"
  );
  const tableSet = new Set(tables.rows.map((t) => t.table_name));
  for (const t of REQUIRED_TABLES) {
    tableSet.has(t) ? ok("table:" + t, "present") : fail("table:" + t, "MISSING");
  }

  // Row counts
  const countTables = ["heritage_entities", "locations", "historical_periods", "media", "sources", "collections", "collection_items", "users", "user_favorites", "supported_states", "relationships"];
  for (const t of countTables) {
    if (!tableSet.has(t)) continue;
    try {
      const c = await pool.query(`SELECT count(*)::int AS n FROM ${t}`);
      c.rows[0].n > 0 ? ok("rows:" + t, String(c.rows[0].n)) : fail("rows:" + t, "0 rows");
    } catch (e) {
      fail("rows:" + t, e.message);
    }
  }

  // Columns required by visitor intelligence + core queries
  const colChecks = [
    ["locations", ["id", "name", "state", "latitude", "longitude"]],
    ["heritage_entities", ["id", "name", "slug", "location_id"]],
  ];
  for (const [t, cols] of colChecks) {
    if (!tableSet.has(t)) continue;
    const c = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
      [t]
    );
    const have = new Set(c.rows.map((x) => x.column_name));
    const missing = cols.filter((x) => !have.has(x));
    missing.length === 0 ? ok("cols:" + t, "all present") : fail("cols:" + t, "missing " + missing.join(","));
  }

  // Coordinate coverage in locations
  if (tableSet.has("locations")) {
    const coord = await pool.query(
      "SELECT count(*)::int AS total, count(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)::int AS with_coords FROM locations"
    );
    const { total, with_coords } = coord.rows[0];
    ok("locations coords", `${with_coords}/${total} with coordinates`);
  }

  // heritage → location join sanity (visitor intelligence query shape)
  if (tableSet.has("heritage_entities") && tableSet.has("locations")) {
    try {
      const j = await pool.query(`SELECT count(*)::int AS n
        FROM heritage_entities he LEFT JOIN locations l ON he.location_id = l.id
        WHERE he.location_id IS NOT NULL AND l.id IS NULL`);
      j.rows[0].n === 0 ? ok("FK join integrity", "no orphan location_id") : fail("FK join integrity", `${j.rows[0].n} orphans`);
      const sample = await pool.query(`SELECT he.slug, l.latitude, l.longitude
        FROM heritage_entities he JOIN locations l ON he.location_id = l.id
        WHERE l.latitude IS NOT NULL AND l.longitude IS NOT NULL LIMIT 3`);
      ok("VI query sample", JSON.stringify(sample.rows));
    } catch (e) {
      fail("FK join integrity", e.message);
    }
  }

  // Indexes on key tables
  if (tableSet.has("heritage_entities")) {
    const idx = await pool.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename IN ('heritage_entities','locations')"
    );
    ok("indexes", idx.rows.map((i) => i.indexname).join(", ") || "none");
  }

  // FK constraints count
  const fks = await pool.query(
    "SELECT count(*)::int AS n FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY' AND table_schema='public'"
  );
  ok("foreign keys", String(fks.rows[0].n));

  printAndExit(results, pool);
}

function printAndExit(results, pool) {
  let failures = 0;
  for (const [status, name, detail] of results) {
    if (status === "FAIL") failures++;
    console.log(`${status.padEnd(4)} ${name}: ${detail}`);
  }
  console.log(`\n${results.length} checks, ${failures} failures`);
  pool.end().catch(() => {});
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.log("FAIL fatal:", e.message);
  process.exit(1);
});
