/*
 * Phase 38 — operating-hours coverage checks (Part Q).
 *
 * Live-database verification of the Phase 38 expansion:
 *   - coverage beyond the Phase 37 baseline (4 entities)
 *   - newly added VERIFIED schedules (Red Fort, Victoria Memorial,
 *     Ajanta Caves)
 *   - conflicting schedules (Amber Fort retained, Qutub Minar added)
 *   - DEMO and ASTROVA_ESTIMATE labels
 *   - missing schedules -> INFORMATION UNAVAILABLE
 *   - timezone resolution
 *   - effective_from / effective_until (Red Fort's Monday policy change
 *     and the annual July–August closure window)
 *   - closed days, opening/closing boundaries, next-day opening,
 *     24-hour and overnight schedules (synthetic)
 *
 * Run after `npm run build` (backend):
 *   node backend/tests/test-hours-coverage.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const assert = require("assert");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
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

async function idFor(slug) {
  const { rows } = await pool.query(`SELECT id FROM heritage_entities WHERE slug = $1`, [slug]);
  assert(rows.length > 0, "no entity for slug " + slug);
  return rows[0].id;
}

/** Minimal HourRow builder for synthetic boundary checks. */
function row(dow, open, close, extra = {}) {
  return {
    id: `row-${dow}`,
    day_of_week: dow,
    open_time: open ? `${open}:00` : null,
    close_time: close ? `${close}:00` : null,
    is_closed: Boolean(extra.isClosed),
    is_24_hours: Boolean(extra.is24Hours),
    special_note: null,
    source_url: extra.sourceUrl || null,
    source_type: extra.sourceType || "OFFICIAL",
    schedule_status: extra.scheduleStatus || "VERIFIED",
    verification_status: extra.verificationStatus || "VERIFIED",
    effective_from: extra.effectiveFrom ?? null,
    effective_until: extra.effectiveUntil ?? null,
  };
}

const week = (open, close, extra) =>
  Array.from({ length: 7 }, (_, dow) => row(dow, open, close, extra));

function at(dayOfWeek, hour, minute, date = "2026-09-28") {
  return {
    timezone: "Asia/Kolkata",
    date,
    dayOfWeek,
    minutes: hour * 60 + minute,
    label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

async function main() {
  const {
    computeSituation,
    getScheduleForEntity,
    getScheduleRows,
    getEntityTimezone,
    zonedNow,
    toLabel,
  } = require("../dist/services/operatingHours");

  /* ---- Coverage ---- */

  await check("hours coverage expanded beyond the Phase 37 baseline of 4", async () => {
    const { rows } = await pool.query(
      `SELECT count(DISTINCT heritage_id)::int AS n FROM heritage_operating_hours`
    );
    assert(rows[0].n >= 7, "expected >= 7 entities covered, got " + rows[0].n);
  });

  await check("coverage mix includes VERIFIED, CONFLICT, DEMO and ESTIMATE", async () => {
    const { rows } = await pool.query(`
      SELECT h.schedule_status, count(DISTINCT h.heritage_id)::int AS n
        FROM heritage_operating_hours h
       GROUP BY 1`);
    const byStatus = Object.fromEntries(rows.map((r) => [r.schedule_status, r.n]));
    assert((byStatus.VERIFIED || 0) >= 3, "expected >= 3 VERIFIED entities, got " + byStatus.VERIFIED);
    assert((byStatus.CONFLICT || 0) >= 2, "expected >= 2 CONFLICT entities, got " + byStatus.CONFLICT);
    assert((byStatus.DEMO || 0) >= 1, "DEMO coverage lost");
    assert((byStatus.ASTROVA_ESTIMATE || 0) >= 1, "ESTIMATE coverage missing");
  });

  await check("every hours row carries a source_url and honest verification", async () => {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM heritage_operating_hours WHERE source_url IS NULL`
    );
    assert.strictEqual(rows[0].n, 0, "hours row without provenance URL");
    const demo = await pool.query(
      `SELECT count(*)::int AS n FROM heritage_operating_hours
        WHERE source_type = 'DEMO' AND schedule_status = 'VERIFIED'`
    );
    assert.strictEqual(demo.rows[0].n, 0, "demo row claims VERIFIED");
  });

  /* ---- Newly verified schedules ---- */

  await check("Victoria Memorial is VERIFIED with a closed Monday", async () => {
    const id = await idFor("victoria-memorial");
    const { rows } = await pool.query(
      `SELECT day_of_week, open_time::text AS open, close_time::text AS close, is_closed,
              schedule_status, verification_status, source_url
         FROM heritage_operating_hours WHERE heritage_id = $1`,
      [id]
    );
    assert.strictEqual(rows.length, 7, "expected a full week");
    const monday = rows.find((r) => r.day_of_week === 1);
    assert.strictEqual(monday.is_closed, true, "Monday must be closed");
    const tuesday = rows.find((r) => r.day_of_week === 2);
    assert.strictEqual(tuesday.open, "10:00:00");
    assert.strictEqual(tuesday.close, "18:00:00");
    for (const r of rows) {
      assert.strictEqual(r.schedule_status, "VERIFIED");
      assert.strictEqual(r.verification_status, "VERIFIED");
      assert(/victoriamemorial-cal\.org/.test(r.source_url), "wrong source " + r.source_url);
    }
    const situation = (await getScheduleForEntity(id, new Date("2026-09-29T06:00:00Z")))
      .situation; // Tuesday 11:30 IST
    assert.strictEqual(situation.status, "OPEN");
    assert.strictEqual(situation.dataOrigin, "VERIFIED");
  });

  await check("Ajanta Caves is VERIFIED 09:00–17:00 and closed Mondays", async () => {
    const id = await idFor("ajanta-caves");
    const { rows } = await pool.query(
      `SELECT day_of_week, open_time::text AS open, close_time::text AS close, is_closed, source_url
         FROM heritage_operating_hours WHERE heritage_id = $1`,
      [id]
    );
    assert.strictEqual(rows.length, 7);
    assert.strictEqual(rows.find((r) => r.day_of_week === 1).is_closed, true, "Monday must be closed");
    for (const r of rows.filter((r) => !r.is_closed)) {
      assert.strictEqual(r.open, "09:00:00");
      assert.strictEqual(r.close, "17:00:00");
      assert(/asi\.nic\.in/.test(r.source_url), "wrong source " + r.source_url);
    }
    // Monday 2026-10-05, 12:00 IST.
    const monday = await getScheduleForEntity(id, new Date("2026-10-05T06:30:00Z"));
    assert.strictEqual(monday.situation.status, "CLOSED_TODAY");
    assert.strictEqual(monday.situation.dataOrigin, "VERIFIED");
  });

  await check("Ellora Caves is an ESTIMATE (sunrise–sunset) and closed Tuesdays", async () => {
    const id = await idFor("ellora-caves");
    const tuesday = await getScheduleForEntity(id, new Date("2026-09-29T06:00:00Z")); // Tue
    assert.strictEqual(tuesday.situation.status, "CLOSED_TODAY");
    assert.strictEqual(tuesday.situation.dataOrigin, "ASTROVA_ESTIMATE");
    const wednesday = await getScheduleForEntity(id, new Date("2026-09-30T06:00:00Z"));
    assert.strictEqual(wednesday.situation.status, "OPEN");
    const note = wednesday.rows[0];
    assert(note.special_note && /estimate/i.test(note.special_note), "estimate note missing");
  });

  /* ---- Conflicts ---- */

  await check("Amber Fort conflict retained: unavailable + conflict flag + evidence", async () => {
    const id = await idFor("amber-fort");
    const { rows } = await pool.query(
      `SELECT schedule_status, source_url, special_note, open_time::text AS open
         FROM heritage_operating_hours WHERE heritage_id = $1`,
      [id]
    );
    assert(rows.length === 7, "expected a full week");
    for (const r of rows) assert.strictEqual(r.schedule_status, "CONFLICT");
    assert(/obms-tourist\.rajasthan\.gov\.in/.test(rows[0].source_url), "portal evidence missing");
    assert(/REVIEWED 2026-09-29, RETAINED/.test(rows[0].special_note), "review not recorded");
    assert(/08:00–17:30/.test(rows[0].special_note), "competing schedule not documented");
    const { situation } = await getScheduleForEntity(id);
    assert.strictEqual(situation.status, "INFORMATION_UNAVAILABLE");
    assert.strictEqual(situation.conflict, true);
    assert.strictEqual(situation.dataOrigin, "CONFLICT");
    assert(/conflict/i.test(situation.label));
  });

  await check("Qutub Minar conflict recorded with both Tier-1 sources", async () => {
    const id = await idFor("qutub-minar");
    const { rows } = await pool.query(
      `SELECT schedule_status, source_url, special_note FROM heritage_operating_hours WHERE heritage_id = $1`,
      [id]
    );
    assert.strictEqual(rows.length, 7);
    for (const r of rows) assert.strictEqual(r.schedule_status, "CONFLICT");
    assert(/asi\.nic\.in/.test(rows[0].source_url), "ASI evidence missing");
    assert(/Incredible India/.test(rows[0].special_note), "competing Tier-1 source not documented");
    const { situation } = await getScheduleForEntity(id);
    assert.strictEqual(situation.conflict, true);
    assert.strictEqual(situation.status, "INFORMATION_UNAVAILABLE");
  });

  await check("hawa-mahal keeps its live DEMO schedule (labelled, never verified)", async () => {
    const id = await idFor("hawa-mahal");
    const { situation } = await getScheduleForEntity(id, new Date("2026-09-29T06:00:00Z"));
    assert.strictEqual(situation.dataOrigin, "DEMO");
    assert.strictEqual(situation.scheduleStatus, "DEMO");
    assert.notStrictEqual(situation.dataOrigin, "VERIFIED");
    assert.strictEqual(situation.source.verificationStatus, "UNVERIFIED");
  });

  /* ---- Missing schedules ---- */

  await check("entity without hours reports INFORMATION UNAVAILABLE, never a guess", async () => {
    const id = await idFor("charminar");
    const { rows, situation } = await getScheduleForEntity(id);
    assert.strictEqual(rows.length, 0, "charminar must not have a schedule");
    assert.strictEqual(situation.status, "INFORMATION_UNAVAILABLE");
    assert.strictEqual(situation.dataOrigin, "NONE");
    assert.strictEqual(situation.today, null);
    assert.strictEqual(situation.nextChange, null);
    assert.doesNotMatch(situation.reason, /\b\d{1,2}:\d{2}\b/, "fabricated time in reason");
  });

  /* ---- Timezone ---- */

  await check("timezone resolves to Asia/Kolkata for Delhi entities", async () => {
    const id = await idFor("red-fort");
    assert.strictEqual(await getEntityTimezone(id), "Asia/Kolkata");
    const z = zonedNow(new Date("2026-09-29T04:00:00Z"), "Asia/Kolkata");
    assert.strictEqual(z.label, "09:30");
    assert.strictEqual(z.dayOfWeek, 2);
  });

  /* ---- Effective dating (Red Fort policy change + annual closure) ---- */

  await check("Red Fort weekly default is VERIFIED seven-day 09:30–16:30", async () => {
    const id = await idFor("red-fort");
    const rows = await getScheduleRows(id, "Asia/Kolkata", new Date("2026-09-29T06:00:00Z"));
    assert.strictEqual(rows.length, 7, "expected 7 effective rows today, got " + rows.length);
    for (const r of rows) {
      assert.strictEqual(r.schedule_status, "VERIFIED");
      assert.strictEqual(r.is_closed, false, "no day may be closed in the current window");
    }
    const { situation } = await getScheduleForEntity(id, new Date("2026-09-29T06:00:00Z")); // Tue 11:30
    assert.strictEqual(situation.status, "OPEN");
    assert.strictEqual(situation.dataOrigin, "VERIFIED");
  });

  await check("Red Fort Monday opening is effective-dated from the ASI order", async () => {
    const id = await idFor("red-fort");
    // Before the order (Monday 2026-02-02, 12:00 IST): closed.
    const before = await getScheduleForEntity(id, new Date("2026-02-02T06:30:00Z"));
    assert.strictEqual(before.situation.status, "CLOSED_TODAY", "historic Monday closure lost");
    // After the order (Monday 2026-03-02, 11:00 IST): open.
    const after = await getScheduleForEntity(id, new Date("2026-03-02T05:30:00Z"));
    assert.strictEqual(after.situation.status, "OPEN", "post-order Monday must be open");
    const { rows } = await pool.query(
      `SELECT effective_from::text AS from_date, effective_until::text AS until_date, is_closed
         FROM heritage_operating_hours WHERE heritage_id = $1 AND day_of_week = 1`,
      [id]
    );
    const historic = rows.find((r) => r.until_date === "2026-02-15");
    const opened = rows.find((r) => r.from_date === "2026-02-16");
    assert(historic && historic.is_closed, "historic closed Monday row missing");
    assert(opened && !opened.is_closed, "dated open Monday row missing");
  });

  await check("annual July–August closure overrides the weekly default (dated rows)", async () => {
    const id = await idFor("red-fort");
    const during = await getScheduleForEntity(id, new Date("2026-07-20T06:00:00Z")); // Monday in window
    assert.strictEqual(during.situation.status, "CLOSED_TODAY", "closure override lost");
    assert.strictEqual(during.situation.today.isClosed, true, "closure must win for every weekday");
    const outside = await getScheduleRows(id, "Asia/Kolkata", new Date("2026-09-29T06:00:00Z"));
    assert(!outside.some((r) => r.is_closed), "closure row leaked outside its window");
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM heritage_operating_hours
        WHERE heritage_id = $1 AND effective_from = '2026-07-15' AND effective_until = '2026-08-15'`,
      [id]
    );
    assert.strictEqual(rows[0].n, 7, "expected 7 dated closure rows");
  });

  await check("dated overrides win deterministically over undated defaults", () => {
    const rows = [
      row(1, "09:30", "16:30"), // undated default
      row(1, null, null, { isClosed: true, effectiveFrom: "2026-07-15", effectiveUntil: "2026-08-15" }),
    ];
    const s = computeSituation(rows, at(1, 10, 0, "2026-07-20"));
    assert.strictEqual(s.status, "CLOSED_TODAY", "specific row must win regardless of order");
    const s2 = computeSituation([...rows].reverse(), at(1, 10, 0, "2026-07-20"));
    assert.strictEqual(s2.status, "CLOSED_TODAY", "order-dependence detected");
  });

  /* ---- Boundaries, next-day, 24h, overnight (synthetic) ---- */

  await check("opening and closing boundaries are exact", () => {
    const w = week("09:00", "17:00");
    assert.strictEqual(computeSituation(w, at(1, 9, 0)).status, "OPEN"); // exactly open
    assert.strictEqual(computeSituation(w, at(1, 8, 59)).status, "OPENING_SOON"); // 1 min before
    assert.strictEqual(computeSituation(w, at(1, 16, 0)).status, "CLOSING_SOON"); // 60 min before
    assert.strictEqual(computeSituation(w, at(1, 16, 59)).status, "CLOSING_SOON");
    const atClose = computeSituation(w, at(1, 17, 0)); // exactly close
    assert.notStrictEqual(atClose.status, "OPEN", "closing minute must not read OPEN");
    assert.notStrictEqual(atClose.status, "CLOSING_SOON");
  });

  await check("next-day opening is announced with the right day", () => {
    const w = week("09:00", "17:00");
    const s = computeSituation(w, at(1, 18, 0)); // after close, Monday
    assert.strictEqual(s.status, "CLOSED");
    assert.strictEqual(s.nextChange.kind, "opens");
    assert.strictEqual(s.nextChange.dayOffset, 1);
    assert.strictEqual(s.nextChange.at, "09:00");
  });

  await check("24-hour sites report OPEN_24_HOURS without a fabricated window", () => {
    const w = week(null, null, { is24Hours: true });
    const s = computeSituation(w, at(3, 3, 30));
    assert.strictEqual(s.status, "OPEN_24_HOURS");
    assert.strictEqual(s.today.open, null);
    assert.strictEqual(s.today.close, null);
  });

  await check("overnight windows cross midnight correctly", () => {
    const w = week("22:00", "02:00");
    assert.strictEqual(computeSituation(w, at(1, 23, 0)).status, "OPEN"); // inside
    // 01:00 is the tail of yesterday's window: open, but within the
    // 60-minute closing-soon horizon of 02:00.
    assert.strictEqual(computeSituation(w, at(1, 1, 0)).status, "CLOSING_SOON");
    assert.strictEqual(computeSituation(w, at(1, 3, 0)).status, "CLOSED"); // between windows
    const late = computeSituation(w, at(1, 21, 30));
    assert.strictEqual(late.status, "OPENING_SOON"); // 30 min before the 22:00 window opens
  });

  await check("closed days report CLOSED_TODAY and the next opening", () => {
    const rows = week("09:00", "17:00");
    rows[1] = row(1, null, null, { isClosed: true }); // Monday closed
    const s = computeSituation(rows, at(1, 10, 0));
    assert.strictEqual(s.status, "CLOSED_TODAY");
    assert.strictEqual(s.nextChange.at, "09:00");
    assert.strictEqual(s.nextChange.dayOffset, 1);
  });

  console.log("");
  console.log("Hours coverage checks: " + passed + "/" + (passed + failed) + " passed");
  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Suite error:", err);
  process.exit(1);
});
