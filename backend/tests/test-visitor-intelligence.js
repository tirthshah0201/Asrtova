/*
 * Visitor intelligence unit checks.
 * Run after `npm run build` (backend) with:
 *   node backend/tests/test-visitor-intelligence.js
 */

const assert = require("assert");
const { buildRecommendation } = require("../dist/services/visitorIntelligence");

function hour(time, overrides = {}) {
  return {
    time,
    temperature: 24,
    precipitationProbability: 10,
    uvIndex: 3,
    windSpeed: 12,
    isDay: 1,
    ...overrides,
  };
}

/** Naive wall-clock string (UTC-labeled) N hours from now. */
function hoursFromNow(h) {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString().slice(0, 16);
}

/* 1. Comfortable forecast scores positively and explains itself. */
const recommendation = buildRecommendation([
  hour("2026-09-10T07:00:00+05:30"),
  hour("2026-09-10T13:00:00+05:30", { temperature: 39, precipitationProbability: 80, uvIndex: 10, windSpeed: 42 }),
]);
assert(recommendation, "valid forecast should produce a recommendation");
assert.strictEqual(recommendation.score > 50, true, "comfortable forecast should score positively");
assert(recommendation.reasons.length > 0, "recommendation should explain its choice");

/* 2. Empty forecast -> unavailable. */
assert.strictEqual(buildRecommendation([]), null, "empty forecast should be unavailable");

/* 3. Partial (missing) fields still produce a recommendation. */
const partial = buildRecommendation([hour(hoursFromNow(2), {
  precipitationProbability: undefined,
  uvIndex: undefined,
  windSpeed: undefined,
})]);
assert(partial, "partial forecast should still produce a recommendation");

/* 4. Daylight preference: among equally future hours, a night hour must NOT win. */
const night = hour(hoursFromNow(3), { isDay: 0 });
const day = hour(hoursFromNow(4), { isDay: 1 });
const daylightPick = buildRecommendation([night, day], 0);
assert(daylightPick, "daylight preference should produce a recommendation");
const pickedHour = String(day.time).slice(11, 16);
const pickedLabel = daylightPick.bestWindow;
const expectedStartHour = Number(pickedHour.slice(0, 2));
const expected12 = expectedStartHour % 12 === 0 ? 12 : expectedStartHour % 12;
assert(
  pickedLabel.includes(`${expected12}:${pickedHour.slice(3)}`),
  `best window should be the daylight hour (${pickedLabel})`
);
assert(
  Number(daylightPick.score) >= Number(buildRecommendation([night, day], 0).score),
  "daylight score should be deterministic"
);

/* 5. Future preference: with utc offset 0, past hours must lose to future hours. */
const past = hour(hoursFromNow(-6));
const future = hour(hoursFromNow(6));
const futurePick = buildRecommendation([past, future], 0);
assert(futurePick, "future preference should produce a recommendation");
const futureHourLabel = (() => {
  const t = String(future.time).slice(11, 16);
  const h = Number(t.slice(0, 2));
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${t.slice(3)}`;
})();
assert(
  futurePick.bestWindow.includes(futureHourLabel),
  `past hour must not win when future data exists (${futurePick.bestWindow})`
);

/* 6. Past-only data still yields a low-confidence fallback. */
const pastOnly = buildRecommendation([hour(hoursFromNow(-3)), hour(hoursFromNow(-2))], 0);
assert(pastOnly, "past-only forecast should still fall back");
assert.strictEqual(pastOnly.confidence, "low", "past-only fallback should be low confidence");

/* 7. Offset sign regression: naive wall-clock strings + IST offset (19800s).
 * "Wall now" = true now + offset. An hour 3h behind wall-now must lose to
 * one 3h ahead — this fails if the offset is added instead of subtracted. */
const IST = 19800;
function wallHoursFromNow(h) {
  return new Date(Date.now() + IST * 1000 + h * 60 * 60 * 1000).toISOString().slice(0, 16);
}
const istPast = hour(wallHoursFromNow(-3));
const istFutureHours = [3, 4, 5, 6, 7, 8].map((h) => hour(wallHoursFromNow(h)));
const istPick = buildRecommendation([istPast, ...istFutureHours], IST);
assert(istPick, "IST-offset forecast should produce a recommendation");
const futureLabel = (() => {
  const t = String(istFutureHours[0].time).slice(11, 16);
  const h = Number(t.slice(0, 2));
  return `${h % 12 === 0 ? 12 : h % 12}:${t.slice(3)}`;
})();
assert(
  istPick.bestWindow.includes(futureLabel),
  `offset sign must place future hours ahead of now (${istPick.bestWindow} vs ${futureLabel})`
);
assert.strictEqual(
  istPick.confidence,
  "moderate",
  "6 future hours should classify as moderate confidence"
);

console.log("Visitor intelligence checks: 7/7 passed");
