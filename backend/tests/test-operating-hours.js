/*
 * Phase 37 — operating-hours / current-situation unit checks.
 *
 * Pure logic only (no network, no DB): timezone resolution, boundary
 * cases, day transitions, 24-hour sites, missing and conflicting
 * schedules, and input validation.
 *
 * Run after `npm run build` (backend):
 *   node backend/tests/test-operating-hours.js
 */

const assert = require("assert");
const {
  DAY_NAMES,
  DEFAULT_TIMEZONE,
  toMinutes,
  toLabel,
  crossesMidnight,
  zonedNow,
  addDays,
  validateSchedule,
  computeSituation,
  formatDuration,
} = require("../dist/services/operatingHours");

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`FAIL ${name}: ${err.message}`);
  }
}

/** Build a ZonedNow without depending on the wall clock. */
function at(dayOfWeek, hour, minute, date = "2026-09-28", timezone = "Asia/Kolkata") {
  return {
    timezone,
    date,
    dayOfWeek,
    minutes: hour * 60 + minute,
    label: toLabel(hour * 60 + minute),
  };
}

/** Build an HourRow for a given day. */
function row(dow, open, close, extra = {}) {
  return {
    id: `row-${dow}`,
    day_of_week: dow,
    open_time: open ? `${open}:00` : null,
    close_time: close ? `${close}:00` : null,
    is_closed: Boolean(extra.isClosed),
    is_24_hours: Boolean(extra.is24Hours),
    special_note: extra.note || null,
    source_url: extra.sourceUrl || null,
    source_type: extra.sourceType || "DEMO",
    schedule_status: extra.scheduleStatus || "DEMO",
    verification_status: extra.verificationStatus || "UNVERIFIED",
  };
}

const week = (open, close, extra) =>
  Array.from({ length: 7 }, (_, dow) => row(dow, open, close, extra));

/* ---------------------------------------------------------------
 * Time helpers
 * ------------------------------------------------------------- */
check("toMinutes parses HH:MM and HH:MM:SS and rejects junk", () => {
  assert.strictEqual(toMinutes("08:00"), 480);
  assert.strictEqual(toMinutes("08:00:00"), 480);
  assert.strictEqual(toMinutes("23:59"), 1439);
  assert.strictEqual(toMinutes("24:00"), null);
  assert.strictEqual(toMinutes("8:60"), null);
  assert.strictEqual(toMinutes(null), null);
  assert.strictEqual(toMinutes("bogus"), null);
});

check("toLabel formats and wraps at midnight", () => {
  assert.strictEqual(toLabel(480), "08:00");
  assert.strictEqual(toLabel(0), "00:00");
  assert.strictEqual(toLabel(1439), "23:59");
  assert.strictEqual(toLabel(1440 + 5), "00:05");
});

check("crossesMidnight only when close < open", () => {
  assert.strictEqual(crossesMidnight(480, 1080), false);
  assert.strictEqual(crossesMidnight(1320, 120), true);
  assert.strictEqual(crossesMidnight(480, 480), false);
});

check("addDays crosses month and year boundaries", () => {
  assert.strictEqual(addDays("2026-09-30", 1), "2026-10-01");
  assert.strictEqual(addDays("2026-12-31", 1), "2027-01-01");
  assert.strictEqual(addDays("2026-03-01", -1), "2026-02-28");
});

/* ---------------------------------------------------------------
 * Part D — timezone handling (server timezone must not leak in)
 * ------------------------------------------------------------- */
check("zonedNow uses Asia/Kolkata, not the server timezone", () => {
  const instant = new Date("2026-09-28T04:30:00Z"); // 10:00 IST Monday
  const ist = zonedNow(instant, "Asia/Kolkata");
  assert.strictEqual(ist.label, "10:00");
  assert.strictEqual(ist.dayOfWeek, 1, "expected Monday");
  assert.strictEqual(ist.date, "2026-09-28");
  assert.strictEqual(ist.timezone, "Asia/Kolkata");
});

check("same instant resolves differently in another timezone", () => {
  const instant = new Date("2026-09-28T04:30:00Z");
  const ny = zonedNow(instant, "America/New_York");
  assert.strictEqual(ny.label, "00:30", "EDT is UTC-4");
  assert.strictEqual(ny.dayOfWeek, 1);
  assert.strictEqual(ny.date, "2026-09-28");
});

check("zonedNow falls back to Asia/Kolkata for unknown timezones", () => {
  const instant = new Date("2026-09-28T04:30:00Z");
  const fallback = zonedNow(instant, "Not/AZone");
  assert.strictEqual(fallback.timezone, "Asia/Kolkata");
  assert.strictEqual(fallback.label, "10:00");
  assert.strictEqual(DEFAULT_TIMEZONE, "Asia/Kolkata");
});

check("zonedNow handles midnight without emitting hour 24", () => {
  const instant = new Date("2026-09-27T18:30:00Z"); // 00:00 IST Mon 28
  const z = zonedNow(instant, "Asia/Kolkata");
  assert.strictEqual(z.label, "00:00");
  assert.strictEqual(z.minutes, 0);
});

check("zonedNow day boundary: late Sunday UTC is already Monday in IST", () => {
  const instant = new Date("2026-09-27T19:00:00Z"); // 00:30 IST Monday
  const z = zonedNow(instant, "Asia/Kolkata");
  assert.strictEqual(z.date, "2026-09-28");
  assert.strictEqual(z.dayOfWeek, 1);
  assert.strictEqual(z.label, "00:30");
});

/* ---------------------------------------------------------------
 * Part C — states
 * ------------------------------------------------------------- */
check("Monday open → OPEN with a closing countdown", () => {
  const s = computeSituation(week("08:00", "18:00"), at(1, 10, 0));
  assert.strictEqual(s.status, "OPEN");
  assert.strictEqual(s.label, "Open");
  assert.match(s.reason, /Closes in approximately 8h/);
  assert.strictEqual(s.today.open, "08:00");
  assert.strictEqual(s.today.close, "18:00");
  assert.strictEqual(s.nextChange.kind, "closes");
  assert.strictEqual(s.nextChange.at, "18:00");
  assert.strictEqual(s.nextChange.inMinutes, 480);
});

check("spec example: 16:30 with 08:00–18:00 → OPEN, ~1h 30m to close", () => {
  const s = computeSituation(week("08:00", "18:00"), at(1, 16, 30));
  assert.strictEqual(s.status, "OPEN");
  assert.strictEqual(s.nextChange.inMinutes, 90);
  assert.strictEqual(formatDuration(s.nextChange.inMinutes), "1h 30m");
});

check("spec example: 19:30 with 08:00–18:00 → CLOSED, opens tomorrow 08:00", () => {
  const s = computeSituation(week("08:00", "18:00"), at(1, 19, 30));
  assert.strictEqual(s.status, "CLOSED");
  assert.strictEqual(s.nextChange.dayOffset, 1);
  assert.strictEqual(s.nextChange.at, "08:00");
  assert.match(s.reason, /tomorrow at 08:00/);
});

check("opening boundary: exactly at open time → OPEN", () => {
  const s = computeSituation(week("08:00", "18:00"), at(1, 8, 0));
  assert.strictEqual(s.status, "OPEN");
  assert.strictEqual(s.nextChange.inMinutes, 600);
});

check("well before opening → CLOSED (opens today at 08:00)", () => {
  const s = computeSituation(week("08:00", "18:00"), at(1, 6, 0));
  assert.strictEqual(s.status, "CLOSED");
  assert.strictEqual(s.nextChange.inMinutes, 120);
  assert.match(s.reason, /Opens today at 08:00/);
});

check("one minute before opening → OPENING_SOON", () => {
  const s = computeSituation(week("08:00", "18:00"), at(1, 7, 59));
  assert.strictEqual(s.status, "OPENING_SOON");
  assert.strictEqual(s.nextChange.inMinutes, 1);
});

check("within 60 minutes of opening → OPENING_SOON", () => {
  const s = computeSituation(week("08:00", "18:00"), at(1, 7, 30));
  assert.strictEqual(s.status, "OPENING_SOON");
  assert.strictEqual(s.nextChange.inMinutes, 30);
});

check("closing boundary: one minute before close → CLOSING_SOON", () => {
  const s = computeSituation(week("08:00", "18:00"), at(1, 17, 59));
  assert.strictEqual(s.status, "CLOSING_SOON");
  assert.strictEqual(s.nextChange.inMinutes, 1);
  assert.match(s.reason, /Closes in approximately 1m/);
});

check("exactly at closing time → CLOSED (window is end-exclusive)", () => {
  const s = computeSituation(week("08:00", "18:00"), at(1, 18, 0));
  assert.strictEqual(s.status, "CLOSED");
  assert.strictEqual(s.nextChange.dayOffset, 1);
});

check("closing soon threshold: 60 min counts, 61 min does not", () => {
  const at60 = computeSituation(week("08:00", "18:00"), at(1, 17, 0));
  const at61 = computeSituation(week("08:00", "18:00"), at(1, 16, 59));
  assert.strictEqual(at60.status, "CLOSING_SOON");
  assert.strictEqual(at61.status, "OPEN");
});

check("Monday closed day → CLOSED_TODAY with next opening", () => {
  const rows = Array.from({ length: 7 }, (_, dow) =>
    dow === 1 ? row(1, null, null, { isClosed: true }) : row(dow, "08:00", "18:00")
  );
  const s = computeSituation(rows, at(1, 10, 0));
  assert.strictEqual(s.status, "CLOSED_TODAY");
  assert.strictEqual(s.today.isClosed, true);
  assert.strictEqual(s.nextChange.dayOffset, 1);
  assert.match(s.reason, /Monday/);
  assert.match(s.reason, /Opens on Tuesday at 08:00/);
});

check("Sunday → Monday transition finds the next opening across the week", () => {
  const rows = Array.from({ length: 7 }, (_, dow) =>
    dow === 0 ? row(0, null, null, { isClosed: true }) : row(dow, "08:00", "18:00")
  );
  const s = computeSituation(rows, at(0, 20, 0, "2026-09-27"));
  assert.strictEqual(s.status, "CLOSED_TODAY");
  assert.strictEqual(s.nextChange.dayOffset, 1);
  assert.strictEqual(s.nextChange.onDate, "2026-09-28");
  assert.match(s.reason, /Closed Sunday/);
  assert.match(s.reason, /on Monday at 08:00/);
});

check("24-hour heritage → OPEN_24_HOURS", () => {
  const s = computeSituation(week(null, null, { is24Hours: true }), at(3, 3, 30));
  assert.strictEqual(s.status, "OPEN_24_HOURS");
  assert.strictEqual(s.today.is24Hours, true);
  assert.strictEqual(s.nextChange, null);
});

check("overnight window (22:00–02:00) stays OPEN after midnight", () => {
  const rows = week("22:00", "02:00");
  const beforeMidnight = computeSituation(rows, at(1, 23, 0));
  const justAfterMidnight = computeSituation(rows, at(2, 0, 30));
  assert.strictEqual(beforeMidnight.status, "OPEN");
  assert.strictEqual(justAfterMidnight.status, "OPEN");
  assert.strictEqual(justAfterMidnight.nextChange.kind, "closes");
  assert.strictEqual(justAfterMidnight.nextChange.at, "02:00");
  assert.strictEqual(justAfterMidnight.nextChange.inMinutes, 90);
});

check("overnight window reports CLOSING_SOON in its final hour", () => {
  const s = computeSituation(week("22:00", "02:00"), at(2, 1, 0));
  assert.strictEqual(s.status, "CLOSING_SOON");
  assert.strictEqual(s.nextChange.kind, "closes");
  assert.strictEqual(s.nextChange.at, "02:00");
  assert.strictEqual(s.nextChange.inMinutes, 60);
});

check("overnight window is CLOSED between 02:00 and 22:00", () => {
  const s = computeSituation(week("22:00", "02:00"), at(2, 12, 0));
  assert.strictEqual(s.status, "CLOSED");
  assert.strictEqual(s.nextChange.at, "22:00");
  assert.strictEqual(s.nextChange.inMinutes, 600);
});

check("missing schedule → INFORMATION UNAVAILABLE, never a guessed time", () => {
  const s = computeSituation([], at(1, 10, 0));
  assert.strictEqual(s.status, "INFORMATION_UNAVAILABLE");
  assert.strictEqual(s.label, "Current status unavailable");
  assert.strictEqual(s.today, null);
  assert.strictEqual(s.nextChange, null);
  assert.strictEqual(s.dataOrigin, "NONE");
  assert.doesNotMatch(s.reason, /\b\d{1,2}:\d{2}\b/, "must not mention a fabricated time");
});

check("no row for today (schedule exists for other days) → INFORMATION UNAVAILABLE", () => {
  const rows = [row(2, "08:00", "18:00"), row(3, "08:00", "18:00")];
  const s = computeSituation(rows, at(1, 10, 0));
  assert.strictEqual(s.status, "INFORMATION_UNAVAILABLE");
  assert.match(s.reason, /No schedule entry exists for today/);
});

check("conflicting schedule → INFORMATION UNAVAILABLE + conflict flag", () => {
  const rows = week("07:00", "20:00", { scheduleStatus: "CONFLICT" });
  const s = computeSituation(rows, at(1, 10, 0));
  assert.strictEqual(s.status, "INFORMATION_UNAVAILABLE");
  assert.strictEqual(s.conflict, true);
  assert.strictEqual(s.label, "Hours in conflict — requires review");
  assert.strictEqual(s.reviewLabel, "CONFLICT — REQUIRES REVIEW");
  assert.strictEqual(s.dataOrigin, "CONFLICT");
});

check("demo rows are labelled DEMO, never VERIFIED", () => {
  const s = computeSituation(week("09:00", "18:30"), at(1, 10, 0));
  assert.strictEqual(s.dataOrigin, "DEMO");
  assert.strictEqual(s.scheduleStatus, "DEMO");
  assert.strictEqual(s.source.verificationStatus, "UNVERIFIED");
  assert.notStrictEqual(s.dataOrigin, "VERIFIED");
});

check("fully verified schedule → VERIFIED origin", () => {
  const rows = week("09:00", "18:30", {
    scheduleStatus: "VERIFIED",
    verificationStatus: "VERIFIED",
    sourceType: "ASI",
  });
  const s = computeSituation(rows, at(1, 10, 0));
  assert.strictEqual(s.dataOrigin, "VERIFIED");
  assert.strictEqual(s.source.type, "ASI");
});

check("incomplete stored window does not produce an open/closed claim", () => {
  const rows = [row(1, "08:00", null)];
  const s = computeSituation(rows, at(1, 10, 0));
  assert.strictEqual(s.status, "INFORMATION_UNAVAILABLE");
});

/* ---------------------------------------------------------------
 * Input validation
 * ------------------------------------------------------------- */
check("validateSchedule accepts a normal day", () => {
  assert.strictEqual(validateSchedule({ dayOfWeek: 1, openTime: "08:00", closeTime: "18:00" }), null);
  assert.strictEqual(validateSchedule({ dayOfWeek: 0, isClosed: true }), null);
  assert.strictEqual(validateSchedule({ dayOfWeek: 6, is24Hours: true }), null);
});

check("validateSchedule rejects invalid schedules", () => {
  assert.match(validateSchedule({ dayOfWeek: 7, openTime: "08:00", closeTime: "18:00" }), /0–6/);
  assert.match(validateSchedule({ dayOfWeek: -1, openTime: "08:00", closeTime: "18:00" }), /0–6/);
  assert.match(validateSchedule({ dayOfWeek: 1 }), /required/);
  assert.match(
    validateSchedule({ dayOfWeek: 1, openTime: "08:00", closeTime: "08:00" }),
    /must differ/
  );
  assert.match(
    validateSchedule({ dayOfWeek: 1, openTime: "8pm", closeTime: "18:00" }),
    /HH:MM/
  );
  assert.match(
    validateSchedule({ dayOfWeek: 1, isClosed: true, openTime: "08:00" }),
    /must not carry/
  );
  assert.match(
    validateSchedule({ dayOfWeek: 1, isClosed: true, is24Hours: true }),
    /both closed and 24 hours/
  );
  assert.match(
    validateSchedule({ dayOfWeek: 1, is24Hours: true, openTime: "08:00" }),
    /must not carry/
  );
});

check("day names line up with PostgreSQL EXTRACT(DOW)", () => {
  assert.strictEqual(DAY_NAMES[0], "Sunday");
  assert.strictEqual(DAY_NAMES[1], "Monday");
  assert.strictEqual(DAY_NAMES[6], "Saturday");
});

/* --------------------------------------------------------------- */
console.log(`\nOperating hours checks: ${passed}/${passed + failures.length} passed`);
if (failures.length) {
  console.log(`Failures: ${failures.join(", ")}`);
  process.exit(1);
}
