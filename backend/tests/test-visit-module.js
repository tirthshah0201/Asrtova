/*
 * Visit intelligence module unit checks (Features D, E, F, G).
 * Run after `npm run build` (backend) with:
 *   node backend/tests/test-visit-module.js
 */

const assert = require("assert");
const { estimateVisitCost, normalizeCostInput } = require("../dist/services/visitCostEstimator");
const { haversineKm, normalizeOverpassElements } = require("../dist/services/nearby");

/* ---- Feature D: cost estimator ---- */

const input = normalizeCostInput({
  visitors: "3",
  durationHours: "5",
  transport: "public",
  food: "mid",
  stay: "none",
  guide: "true",
  parking: "true",
  misc: "medium",
});
assert.strictEqual(input.visitors, 3, "visitors parsed from query string");
assert.strictEqual(input.guide, true, "guide flag parsed");
assert.strictEqual(input.stay, "none", "stay level parsed");

const estimate = estimateVisitCost(input);
assert.strictEqual(estimate.currency, "INR", "currency is INR");
assert(estimate.total.min <= estimate.total.typical, "min <= typical");
assert(estimate.total.typical <= estimate.total.max, "typical <= max");
assert.strictEqual(estimate.officialFee, null, "never claims an official fee");
assert(estimate.notes.some((n) => n.includes("estimate")), "labels values as estimates");
for (const lineItem of estimate.lines) {
  assert.strictEqual(lineItem.provenance, "astrova_model", "every line carries provenance");
  assert(lineItem.min <= lineItem.typical && lineItem.typical <= lineItem.max, `line ordering: ${lineItem.category}`);
}
assert(estimate.lines.some((l) => l.category === "Stay" && l.typical === 0), "stay=none stays at zero");

/* Out-of-range and junk inputs are clamped, not trusted. */
const junk = normalizeCostInput({ visitors: "9999", durationHours: "-5", transport: "rocket", food: 42, stay: "castle", misc: "lots" });
assert.strictEqual(junk.visitors, 50, "visitors clamped to 50");
assert.strictEqual(junk.durationHours, 1, "duration clamped to 1");
assert.strictEqual(junk.transport, "public", "unknown transport falls back");
assert.strictEqual(junk.food, "mid", "unknown food falls back");
assert.strictEqual(junk.stay, "none", "unknown stay falls back");
const junkEstimate = estimateVisitCost(junk);
assert(Number.isFinite(junkEstimate.total.typical), "junk input still yields a finite total");

/* Overnight stay model: >=6h visit produces nights. */
const overnight = estimateVisitCost(normalizeCostInput({ visitors: 2, durationHours: 10, transport: "none", food: "none", stay: "budget", misc: "low" }));
assert(overnight.nights >= 1, "long visit books a night");
assert(overnight.lines.find((l) => l.category === "Stay").typical > 0, "stay cost included when overnighting");

/* ---- Feature E: haversine ---- */

const jaipurDelhi = haversineKm(26.9124, 75.7873, 28.6139, 77.209);
assert(Math.abs(jaipurDelhi - 236) < 15, `Jaipur–Delhi ≈ 236km (got ${jaipurDelhi.toFixed(1)})`);
assert.strictEqual(Math.round(haversineKm(23.0225, 72.5714, 23.0225, 72.5714)), 0, "same point is 0km");

/* ---- Features F/G: Overpass normalization ---- */

const { places, stays } = normalizeOverpassElements(
  [
    { lat: 26.913, lon: 75.788, tags: { tourism: "museum", name: "City Palace Museum" } },
    { lat: 26.914, lon: 75.789, tags: { amenity: "restaurant", name: "Laxmi Mishthan Bhandar" } },
    { lat: 26.915, lon: 75.790, tags: { tourism: "hotel", name: "Hotel Pearl Palace", website: "https://example.com", phone: "+911412345678", stars: "4" } },
    { lat: 26.916, lon: 75.791, tags: { amenity: "restaurant" } },        // no name → dropped
    { tags: { tourism: "museum", name: "Missing coords" } },              // no coords → dropped
    { lat: 26.913, lon: 75.788, tags: { tourism: "museum", name: "City Palace Museum" } }, // duplicate
    { lat: 26.920, lon: 75.795, tags: { railway: "station", name: "Jaipur Junction" } },
    { lat: 26.921, lon: 75.796, tags: { leisure: "park", name: "Ram Niwas Garden" } },
    { lat: 26.922, lon: 75.797, tags: { amenity: "parking", name: "Parking Lot A" } },
  ],
  26.9124,
  75.7873
);

assert.strictEqual(places.length, 5, `unnamed + duplicate + coordless dropped (got ${places.length})`);
assert(stays.length === 1, "stay extracted separately");
assert.strictEqual(stays[0].website, "https://example.com", "website preserved when present");
assert.strictEqual(stays[0].phone, "+911412345678", "phone preserved when present");
assert.strictEqual(stays[0].stars, 4, "stars parsed when present");
assert(!("price" in stays[0]) && !("rating" in stays[0]), "no fabricated price/rating fields");
const categories = new Set(places.map((p) => p.category));
assert(categories.has("transport") && categories.has("park") && categories.has("parking"), "transport/park/parking classified");
assert(places.every((p) => typeof p.distanceKm === "number" && p.distanceKm >= 0), "all distances computed");
assert.strictEqual(places[0].name, "City Palace Museum", "places sorted by distance");

console.log("Visit module checks: 16/16 passed");
