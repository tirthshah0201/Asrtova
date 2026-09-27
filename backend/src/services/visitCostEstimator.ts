/* ========================================
   Astrova — Visit Cost Estimator (Feature D)
   ========================================

   Transparent, model-based visit cost estimation.

   PROVENANCE RULES:
   - Every number produced here is an ESTIMATE derived from Astrova's
     documented rate card (model assumptions), NOT a verified price.
   - Astrova does not record verified official entry fees for heritage
     sites, so the response never claims an official fee; it returns
     `officialFee: null` with an explicit note.
   - Every breakdown line carries `provenance: "astrova_model"` and a
     human-readable `basis` so the UI can label it as an estimate.
   ======================================== */

export type TransportType = "none" | "walk" | "public" | "private" | "taxi";
export type FoodLevel = "none" | "budget" | "mid" | "premium";
export type StayLevel = "none" | "budget" | "mid" | "premium";
export type MiscLevel = "low" | "medium" | "high";

export interface CostInput {
  visitors: number;        // 1..50
  durationHours: number;   // 1..24
  transport: TransportType;
  food: FoodLevel;
  stay: StayLevel;
  guide: boolean;
  parking: boolean;
  misc: MiscLevel;
}

export interface CostLine {
  category: string;
  min: number;
  typical: number;
  max: number;
  basis: string;
  provenance: "astrova_model";
}

export interface CostEstimate {
  currency: "INR";
  visitors: number;
  durationHours: number;
  days: number;            // billing days used by the model (food/stay/transport)
  nights: number;          // nights used by the stay model
  lines: CostLine[];
  total: { min: number; typical: number; max: number };
  officialFee: null;
  notes: string[];
}

/* ---- Rate card (INR). All values are model assumptions. ---- */

interface Band { min: number; typical: number; max: number }

const TRANSPORT_PER_PERSON_PER_DAY: Record<Exclude<TransportType, "none">, Band> = {
  walk:   { min: 0,    typical: 0,    max: 100 },
  public: { min: 100,  typical: 250,  max: 500 },
  private:{ min: 700,  typical: 1400, max: 3000 },
  taxi:   { min: 900,  typical: 1800, max: 4000 },
};
// private/taxi are per-vehicle in reality; modelled per-group below.
const TRANSPORT_PER_GROUP_PER_DAY: Record<"private" | "taxi", Band> = {
  private: { min: 1200, typical: 2200, max: 4500 },
  taxi:    { min: 1600, typical: 3000, max: 6000 },
};

const FOOD_PER_PERSON_PER_DAY: Record<Exclude<FoodLevel, "none">, Band> = {
  budget:  { min: 300,  typical: 500,  max: 800 },
  mid:     { min: 700,  typical: 1200, max: 2000 },
  premium: { min: 2000, typical: 3500, max: 7000 },
};

const STAY_PER_ROOM_PER_NIGHT: Record<Exclude<StayLevel, "none">, Band> = {
  budget:  { min: 800,   typical: 1500, max: 3000 },
  mid:     { min: 2000,  typical: 3500, max: 6000 },
  premium: { min: 5000,  typical: 9000, max: 20000 },
};

const GUIDE_PER_VISIT: Band = { min: 500,  typical: 1500, max: 4000 };
const PARKING_PER_VEHICLE: Band = { min: 20, typical: 60, max: 250 };
const MISC_PER_PERSON: Record<MiscLevel, Band> = {
  low:    { min: 50,   typical: 150, max: 400 },
  medium: { min: 150,  typical: 400, max: 1000 },
  high:   { min: 400,  typical: 1000, max: 2500 },
};

function line(category: string, band: Band, basis: string, multiplier = 1): CostLine {
  return {
    category,
    min: Math.round(band.min * multiplier),
    typical: Math.round(band.typical * multiplier),
    max: Math.round(band.max * multiplier),
    basis,
    provenance: "astrova_model",
  };
}

function clamp(value: number, minimum: number, maximum: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

const TRANSPORTS: TransportType[] = ["none", "walk", "public", "private", "taxi"];
const FOODS: FoodLevel[] = ["none", "budget", "mid", "premium"];
const STAYS: StayLevel[] = ["none", "budget", "mid", "premium"];
const MISC_LEVELS: MiscLevel[] = ["low", "medium", "high"];

/** Normalise raw (e.g. query-string) input into a safe CostInput. */
export function normalizeCostInput(raw: Record<string, unknown>): CostInput {
  const pick = <T extends string>(value: unknown, allowed: T[], fallback: T): T =>
    typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : fallback;
  return {
    visitors: clamp(Number(raw.visitors), 1, 50, 2),
    durationHours: clamp(Number(raw.durationHours), 1, 24, 4),
    transport: pick(raw.transport, TRANSPORTS, "public"),
    food: pick(raw.food, FOODS, "mid"),
    stay: pick(raw.stay, STAYS, "none"),
    guide: raw.guide === true || raw.guide === "true" || raw.guide === "1",
    parking: raw.parking === true || raw.parking === "true" || raw.parking === "1",
    misc: pick(raw.misc, MISC_LEVELS, "medium"),
  };
}

export function estimateVisitCost(input: CostInput): CostEstimate {
  const visitors = clamp(input.visitors, 1, 50, 2);
  const durationHours = clamp(input.durationHours, 1, 24, 4);
  // Billing model: a part-day visit counts as a full day for food/transport;
  // stays overnight whenever the visit runs 6 hours or more.
  const days = Math.max(1, Math.ceil(durationHours / 8));
  const nights = durationHours >= 6 ? days : 0;
  const rooms = Math.max(1, Math.ceil(visitors / 2));

  const lines: CostLine[] = [];

  // Transport
  if (input.transport === "none" || input.transport === "walk") {
    lines.push(line("Transport", TRANSPORT_PER_PERSON_PER_DAY.walk, "Walking / already at the site — model assumes no transport cost", visitors * days));
  } else if (input.transport === "public") {
    lines.push(line("Transport", TRANSPORT_PER_PERSON_PER_DAY.public, "Public transport (bus/metro/local) per person per day — model estimate", visitors * days));
  } else {
    const band = TRANSPORT_PER_GROUP_PER_DAY[input.transport];
    lines.push(line("Transport", band, `${input.transport === "taxi" ? "Taxi/cab" : "Private vehicle"} per group per day (incl. waiting) — model estimate`, days));
  }

  // Food
  if (input.food === "none") {
    lines.push({ category: "Food", min: 0, typical: 0, max: 0, basis: "No food included in this estimate", provenance: "astrova_model" });
  } else {
    lines.push(line("Food", FOOD_PER_PERSON_PER_DAY[input.food], `${input.food} food per person per day — model estimate`, visitors * days));
  }

  // Stay
  if (input.stay === "none" || nights === 0) {
    lines.push({ category: "Stay", min: 0, typical: 0, max: 0, basis: nights === 0 ? "Day visit — no overnight stay in this estimate" : "No accommodation included", provenance: "astrova_model" });
  } else {
    lines.push(line("Stay", STAY_PER_ROOM_PER_NIGHT[input.stay], `${input.stay} accommodation per room per night × ${rooms} room(s) — model estimate`, rooms * nights));
  }

  // Guide
  if (input.guide) {
    lines.push(line("Guide", GUIDE_PER_VISIT, "Local/fort guide per visit (group) — model estimate", 1));
  }

  // Parking
  if (input.parking) {
    lines.push(line("Parking", PARKING_PER_VEHICLE, "Parking per vehicle per visit — model estimate", 1));
  }

  // Miscellaneous
  lines.push(line("Miscellaneous", MISC_PER_PERSON[input.misc], `${input.misc} incidental expenses per person — model estimate`, visitors));

  const total = lines.reduce(
    (acc, current) => ({
      min: acc.min + current.min,
      typical: acc.typical + current.typical,
      max: acc.max + current.max,
    }),
    { min: 0, typical: 0, max: 0 }
  );

  return {
    currency: "INR",
    visitors,
    durationHours,
    days,
    nights,
    lines,
    total,
    officialFee: null,
    notes: [
      "All values are Astrova model estimates from a documented rate card — they are NOT verified prices.",
      "Astrova does not record an official entry fee for this site; check the site's official sources before travelling.",
      "Actual costs vary by season, city, availability and provider.",
    ],
  };
}
