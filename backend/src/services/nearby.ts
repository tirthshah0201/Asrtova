/* ========================================
   Astrova — Nearby Service (Features E, F, G)
   ========================================

   E) Nearby heritage  : computed from Astrova's own locations table
                         (primary source — no external service).
   F) Nearby places    : OpenStreetMap / Overpass API (open data).
   G) Stay nearby      : same Overpass result, hotels & similar only.

   PROVENANCE RULES:
   - Never fabricate ratings, prices, availability or opening status.
   - Records without a name are dropped.
   - Missing fields are simply absent in the response.
   - Provider failures surface as an explicit `unavailable` state.
   ======================================== */

import { query } from "../database";
import { getDemoPlaces, type DemoPlaceRow } from "./demoPlaces";
import { isValidSlug, isUUID } from "../utils/slug";

const DEFAULT_OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
/** Test/ops override: OVERPASS_URLS=https://a/interpreter,https://b/interpreter */
export const OVERPASS_ENDPOINTS: string[] = (() => {
  const fromEnv = (process.env.OVERPASS_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_OVERPASS_ENDPOINTS;
})();
// Overpass queues queries under load; 10s+ is normal, so allow 15s.
const REQUEST_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — Overpass is heavy; be a good citizen
const MAX_CACHE_ENTRIES = 100;
const SEARCH_RADIUS_M = 3000;
const MAX_PLACES = 30;
const MAX_STAYS = 20;
const MAX_HERITAGE = 8;

export interface NearbyHeritageItem {
  id: string;
  name: string;
  slug: string;
  category: string;
  locationName: string | null;
  state: string | null;
  distanceKm: number;
}

export interface NearbyPlaceItem {
  name: string;
  category: "culture" | "food" | "park" | "parking" | "transport" | "attraction" | "facility";
  kind: string;          // raw OSM tag value, e.g. "museum"
  distanceKm: number;
  lat: number;
  lon: number;
  /** Collection origin so demo rows can never pass as live OSM data. */
  dataOrigin?: "OPENSTREETMAP" | "ASTROVA_DEMO";
  /** Present only for demo rows (traceability back to the OSM node). */
  sourceUrl?: string;
  address?: string;
  phone?: string;
  verificationStatus?: "UNVERIFIED" | "REVIEWED";
}

export interface NearbyStayItem {
  name: string;
  kind: string;          // hotel | guest_house | hostel | apartment | motel
  distanceKm: number;
  lat: number;
  lon: number;
  website?: string;
  phone?: string;
  stars?: number;
  /** OSM addr:* metadata when present — never fabricated. */
  address?: string;
  dataOrigin?: "OPENSTREETMAP" | "ASTROVA_DEMO";
  sourceUrl?: string;
  verificationStatus?: "UNVERIFIED" | "REVIEWED";
}

export interface NearbyResponse {
  heritage: NearbyHeritageItem[];
  places: NearbyPlaceItem[];
  stays: NearbyStayItem[];
  sources: Array<{ name: string; type: string; url: string }>;
  meta: {
    generatedAt: string;
    radiusM: number;
    heritageFrom: "astrova_locations";
    /** Where places/stays came from — never silently mixed. */
    placesProvider: "openstreetmap_overpass" | "astrova_demo_dataset" | "none";
    staysProvider: "openstreetmap_overpass" | "astrova_demo_dataset" | "none";
    /** Part F origin label: OPENSTREETMAP > ASTROVA_DEMO > UNAVAILABLE. */
    dataOrigin: "OPENSTREETMAP" | "ASTROVA_DEMO" | "UNAVAILABLE";
    /** True when places/stays come from the local 6-hour cache. */
    cached: boolean;
    /** True only when the provider failed and a previous reading is shown. */
    stale: boolean;
    errors: string[];
  };
}

interface HeritageRow {
  [key: string]: unknown;
  id: string;
  name: string;
  slug: string;
  category: string;
  location_name: string | null;
  state: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
}

interface OverpassElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface CachedEntry {
  response: NearbyResponse;
  expiresAt: number;
}

const cache = new Map<string, CachedEntry>();

/** Great-circle distance in kilometres. Exported for tests. */
export function haversineKm(
  lat1: number, lon1: number, lat2: number, lon2: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/* ---- E: Astrova's own heritage, by coordinates ---- */

export async function getNearbyHeritage(
  latitude: number,
  longitude: number,
  excludeId: string
): Promise<NearbyHeritageItem[]> {
  const { rows } = await query<HeritageRow>(
    `SELECT he.id, he.name, he.slug, he.category,
            l.name AS location_name, l.state, l.latitude, l.longitude
     FROM heritage_entities he
     JOIN locations l ON he.location_id = l.id
     WHERE he.id <> $1
       AND l.latitude IS NOT NULL AND l.longitude IS NOT NULL`,
    [excludeId]
  );
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      category: row.category,
      locationName: row.location_name,
      state: row.state,
      distanceKm:
        Math.round(
          haversineKm(latitude, longitude, Number(row.latitude), Number(row.longitude)) * 10
        ) / 10,
    }))
    .filter((item) => item.distanceKm > 0 || item.id !== excludeId)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_HERITAGE);
}

/* ---- F + G: OpenStreetMap / Overpass ---- */

const PLACE_FILTERS = `
  node(around:${SEARCH_RADIUS_M},LAT,LON)["tourism"~"museum|gallery|attraction|artwork|viewpoint|theme_park|zoo|aquarium"];
  way(around:${SEARCH_RADIUS_M},LAT,LON)["tourism"~"museum|gallery|attraction|artwork|viewpoint"];
  node(around:${SEARCH_RADIUS_M},LAT,LON)["amenity"~"restaurant|cafe|fast_food|bar|pub"];
  node(around:${SEARCH_RADIUS_M},LAT,LON)["amenity"="parking"];
  way(around:${SEARCH_RADIUS_M},LAT,LON)["amenity"="parking"];
  node(around:${SEARCH_RADIUS_M},LAT,LON)["leisure"~"park|garden"];
  way(around:${SEARCH_RADIUS_M},LAT,LON)["leisure"~"park|garden"];
  node(around:${SEARCH_RADIUS_M},LAT,LON)["amenity"~"bus_station|drinking_water|toilets|pharmacy|hospital|clinic|post_office|bank|atm|shelter"];
  node(around:${SEARCH_RADIUS_M},LAT,LON)["railway"~"station|halt"];
  node(around:${SEARCH_RADIUS_M},LAT,LON)["historic"~"memorial|monument|castle|temple|archaeological_site"];
  way(around:${SEARCH_RADIUS_M},LAT,LON)["historic"~"memorial|monument|castle|archaeological_site"];
`;

const STAY_FILTERS = `
  node(around:${SEARCH_RADIUS_M},LAT,LON)["tourism"~"hotel|guest_house|hostel|apartment|motel"];
  way(around:${SEARCH_RADIUS_M},LAT,LON)["tourism"~"hotel|guest_house|hostel|apartment|motel"];
`;

function buildOverpassQuery(latitude: number, longitude: number): string {
  const fill = (filters: string) =>
    filters
      .replace(/LAT/g, String(latitude))
      .replace(/LON/g, String(longitude));
  return `[out:json][timeout:${REQUEST_TIMEOUT_MS / 1000}];
(
${fill(PLACE_FILTERS)}
${fill(STAY_FILTERS)}
);
out center tags ${MAX_PLACES + MAX_STAYS + 40};`;
}

async function fetchOverpassFrom(endpoint: string, latitude: number, longitude: number): Promise<OverpassElement[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Astrova-Heritage-Platform/1.0 (heritage visit intelligence)",
        Accept: "application/json",
      },
      body: `data=${encodeURIComponent(buildOverpassQuery(latitude, longitude))}`,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`overpass returned ${response.status}`);
    const payload = (await response.json()) as { elements?: OverpassElement[] };
    return Array.isArray(payload.elements) ? payload.elements : [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Try each Overpass endpoint in order; first success wins. */
async function fetchOverpass(latitude: number, longitude: number): Promise<OverpassElement[]> {
  let lastError: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      return await fetchOverpassFrom(endpoint, latitude, longitude);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("overpass unavailable");
}

function elementCoords(element: OverpassElement): { lat: number; lon: number } | null {
  if (typeof element.lat === "number" && typeof element.lon === "number") {
    return { lat: element.lat, lon: element.lon };
  }
  if (element.center && typeof element.center.lat === "number" && typeof element.center.lon === "number") {
    return element.center;
  }
  return null;
}

function classifyPlace(tags: Record<string, string>): NearbyPlaceItem["category"] | null {
  if (tags.tourism) return "attraction";
  if (tags.historic) return "attraction";
  if (tags.amenity === "restaurant" || tags.amenity === "cafe" || tags.amenity === "fast_food" || tags.amenity === "bar" || tags.amenity === "pub") return "food";
  if (tags.amenity === "parking") return "parking";
  if (tags.leisure) return "park";
  // Public facilities: things a visitor may actually need.
  if (["drinking_water", "toilets", "pharmacy", "hospital", "clinic", "post_office", "bank", "atm", "shelter"].includes(tags.amenity || "")) return "facility";
  if (tags.amenity === "bus_station" || tags.railway) return "transport";
  if (tags.tourism === "museum" || tags.tourism === "gallery") return "culture";
  return null;
}

function isStay(tags: Record<string, string>): boolean {
  return Boolean(tags.tourism && ["hotel", "guest_house", "hostel", "apartment", "motel"].includes(tags.tourism));
}

/** Normalise + deduplicate Overpass elements. Exported for tests. */
export function normalizeOverpassElements(
  elements: OverpassElement[],
  latitude: number,
  longitude: number
): { places: NearbyPlaceItem[]; stays: NearbyStayItem[] } {
  const seenPlaces = new Set<string>();
  const seenStays = new Set<string>();
  const places: NearbyPlaceItem[] = [];
  const stays: NearbyStayItem[] = [];

  for (const element of elements) {
    const tags = element.tags;
    if (!tags) continue;
    const coords = elementCoords(element);
    if (!coords) continue;
    const name = (tags.name || tags["name:en"] || "").trim();
    if (!name) continue; // never fabricate a name
    const distanceKm =
      Math.round(haversineKm(latitude, longitude, coords.lat, coords.lon) * 10) / 10;

    if (isStay(tags)) {
      const key = `${name.toLowerCase()}|${coords.lat.toFixed(3)}|${coords.lon.toFixed(3)}`;
      if (seenStays.has(key)) continue;
      seenStays.add(key);
      const stay: NearbyStayItem = {
        name,
        kind: tags.tourism,
        distanceKm,
        lat: coords.lat,
        lon: coords.lon,
      };
      if (tags.website) stay.website = tags.website;
      if (tags.phone || tags["contact:phone"]) stay.phone = tags.phone || tags["contact:phone"];
      const stars = Number(tags.stars);
      if (Number.isFinite(stars) && stars > 0 && stars <= 5) stay.stars = stars;
      const addressParts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:locality"] || tags["addr:suburb"]]
        .filter((part): part is string => Boolean(part && part.trim()));
      if (addressParts.length > 0) stay.address = addressParts.join(" ");
      else if (tags["addr:city"]) stay.address = tags["addr:city"];
      stays.push(stay);
      continue;
    }

    const category = classifyPlace(tags);
    if (!category) continue;
    const key = `${name.toLowerCase()}|${coords.lat.toFixed(3)}|${coords.lon.toFixed(3)}`;
    if (seenPlaces.has(key)) continue;
    seenPlaces.add(key);
    places.push({
      name,
      category,
      kind: tags.tourism || tags.historic || tags.amenity || tags.leisure || tags.railway || "place",
      distanceKm,
      lat: coords.lat,
      lon: coords.lon,
    });
  }

  places.sort((a, b) => a.distanceKm - b.distanceKm);
  stays.sort((a, b) => a.distanceKm - b.distanceKm);
  return { places: places.slice(0, MAX_PLACES), stays: stays.slice(0, MAX_STAYS) };
}

/* ---- Orchestration ---- */

export async function getNearby(
  latitude: number,
  longitude: number,
  heritageId: string
): Promise<NearbyResponse> {
  const cacheKey = `${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
  const cached = cache.get(cacheKey);
  const now = Date.now();

  const heritage = await getNearbyHeritage(latitude, longitude, heritageId);
  const base: Omit<NearbyResponse, "places" | "stays"> = {
    heritage,
    sources: [
      { name: "Astrova heritage database", type: "nearby heritage", url: "/about" },
      { name: "OpenStreetMap contributors", type: "nearby places and stays (ODbL)", url: "https://www.openstreetmap.org/copyright" },
    ],
    meta: {
      generatedAt: new Date().toISOString(),
      radiusM: SEARCH_RADIUS_M,
      heritageFrom: "astrova_locations",
      placesProvider: "openstreetmap_overpass",
      staysProvider: "openstreetmap_overpass",
      dataOrigin: "OPENSTREETMAP",
      cached: false,
      stale: false,
      errors: [],
    },
  };

  if (cached && cached.expiresAt > now) {
    return {
      ...cached.response,
      heritage,
      meta: {
        ...cached.response.meta,
        generatedAt: new Date().toISOString(),
        cached: true,
        stale: false,
      },
    };
  }

  try {
    const elements = await fetchOverpass(latitude, longitude);
    const { places, stays } = normalizeOverpassElements(elements, latitude, longitude);

    if (places.length === 0 && stays.length === 0) {
      // Part F: OSM (preferred) found nothing -> controlled DEMO dataset.
      const demo = await demoFallback(heritageId, latitude, longitude, base);
      if (demo) return demo;
      return {
        ...base,
        places: [],
        stays: [],
        meta: {
          ...base.meta,
          placesProvider: "none",
          staysProvider: "none",
          dataOrigin: "UNAVAILABLE",
          errors: [
            "OpenStreetMap returned no nearby results and no Astrova demo records exist for this site. INFORMATION UNAVAILABLE.",
          ],
        },
      };
    }

    for (const p of places) p.dataOrigin = "OPENSTREETMAP";
    for (const s of stays) s.dataOrigin = "OPENSTREETMAP";

    const response: NearbyResponse = { ...base, places, stays };
    cache.delete(cacheKey);
    cache.set(cacheKey, { response, expiresAt: now + CACHE_TTL_MS });
    while (cache.size > MAX_CACHE_ENTRIES) {
      cache.delete(cache.keys().next().value as string);
    }
    return response;
  } catch {
    // Provider failure: keep heritage (own data) but report places/stays as unavailable.
    const stale = cached?.response;
    if (stale) {
      return {
        ...base,
        places: stale.places,
        stays: stale.stays,
        sources: stale.sources,
        meta: {
          ...base.meta,
          ...stale.meta,
          generatedAt: new Date().toISOString(),
          cached: false,
          stale: true,
          errors: [
            "Nearby places data may be delayed — showing the last successful reading.",
          ],
        },
      };
    }
    const demo = await demoFallback(heritageId, latitude, longitude, base);
    if (demo) return demo;
    return {
      ...base,
      places: [],
      stays: [],
      meta: {
        ...base.meta,
        placesProvider: "none",
        staysProvider: "none",
        dataOrigin: "UNAVAILABLE",
        errors: ["Nearby places are temporarily unavailable. Nearby heritage remains available."],
      },
    };
  }
}

/* ---- Controlled DEMO fallback (Part F) ---- */

/** Demo category -> the place vocabulary Astrova's UI already uses. */
const DEMO_MAP: Record<
  DemoPlaceRow["category"],
  { category: NearbyPlaceItem["category"]; kind: string; stays?: boolean }
> = {
  HOTEL: { category: "facility", kind: "hotel", stays: true },
  RESTAURANT: { category: "food", kind: "restaurant" },
  CAFE: { category: "food", kind: "cafe" },
  PARKING: { category: "parking", kind: "parking" },
  MUSEUM: { category: "culture", kind: "museum" },
  ATTRACTION: { category: "attraction", kind: "attraction" },
  TRANSPORT: { category: "transport", kind: "bus_stop" },
  ATM: { category: "facility", kind: "atm" },
  PHARMACY: { category: "facility", kind: "pharmacy" },
  HOSPITAL: { category: "facility", kind: "hospital" },
  SHOPPING: { category: "facility", kind: "supermarket" },
};

interface DemoBundle {
  places: NearbyPlaceItem[];
  stays: NearbyStayItem[];
}

async function loadDemoBundle(
  heritageId: string,
  latitude: number,
  longitude: number
): Promise<DemoBundle> {
  const rows = await getDemoPlaces(heritageId);
  const places: NearbyPlaceItem[] = [];
  const stays: NearbyStayItem[] = [];

  for (const row of rows) {
    const lat = Number(row.latitude);
    const lon = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) continue;

    const map = DEMO_MAP[row.category];
    if (!map) continue;
    const distanceKm = Number(haversineKm(latitude, longitude, lat, lon).toFixed(2));
    const shared = {
      name: row.name,
      distanceKm,
      lat,
      lon,
      dataOrigin: "ASTROVA_DEMO" as const,
      sourceUrl: row.source_url || undefined,
      verificationStatus: row.verification_status,
      ...(row.address ? { address: row.address } : {}),
      ...(row.phone ? { phone: row.phone } : {}),
    };

    if (map.stays) {
      stays.push({ ...shared, kind: map.kind, ...(row.website ? { website: row.website } : {}) });
    } else {
      places.push({ ...shared, category: map.category, kind: map.kind });
    }
  }

  places.sort((a, b) => a.distanceKm - b.distanceKm);
  stays.sort((a, b) => a.distanceKm - b.distanceKm);
  return { places: places.slice(0, MAX_PLACES), stays: stays.slice(0, MAX_STAYS) };
}

/** Build the demo response, or return null when there are no demo rows. */
async function demoFallback(
  heritageId: string,
  latitude: number,
  longitude: number,
  base: Omit<NearbyResponse, "places" | "stays">
): Promise<NearbyResponse | null> {
  let bundle: DemoBundle;
  try {
    bundle = await loadDemoBundle(heritageId, latitude, longitude);
  } catch {
    return null;
  }
  if (bundle.places.length === 0 && bundle.stays.length === 0) return null;

  const sources = base.sources
    .filter((s) => !s.type.includes("nearby places and stays"))
    .concat({
      name: "Astrova demo dataset",
      type: "nearby places and stays (DEMO — not verified)",
      url: "/about",
    });

  return {
    ...base,
    places: bundle.places,
    stays: bundle.stays,
    sources,
    meta: {
      ...base.meta,
      placesProvider: "astrova_demo_dataset",
      staysProvider: "astrova_demo_dataset",
      dataOrigin: "ASTROVA_DEMO",
      cached: false,
      stale: false,
      errors: [
        "OpenStreetMap returned no nearby results — showing the Astrova demo dataset (DEMO, not verified).",
      ],
    },
  };
}


export function isValidEntityId(identifier: string): boolean {
  return isUUID(identifier) || isValidSlug(identifier);
}

export interface NearbyEntityResult {
  found: boolean;
  availability: "available" | "location_unavailable";
  entity: {
    id: string;
    name: string;
    slug: string;
    locationName: string | null;
    state: string | null;
    latitude: number | string | null;
    longitude: number | string | null;
  } | null;
  data: NearbyResponse | null;
}

/** Resolve an entity (UUID or slug) and build its nearby payload.
 * Coordinates missing → availability "location_unavailable", data null. */
export async function getNearbyForEntity(identifier: string): Promise<NearbyEntityResult> {
  if (!isValidEntityId(identifier)) {
    return { found: false, availability: "location_unavailable", entity: null, data: null };
  }
  const lookup = isUUID(identifier) ? "he.id = $1" : "he.slug = $1";
  const { rows } = await query<{
    id: string; name: string; slug: string; location_id: string | null;
    location_name: string | null; state: string | null;
    latitude: number | string | null; longitude: number | string | null;
  }>(
    `SELECT he.id, he.name, he.slug, he.location_id,
            l.name AS location_name, l.state, l.latitude, l.longitude
     FROM heritage_entities he
     LEFT JOIN locations l ON he.location_id = l.id
     WHERE ${lookup}`,
    [identifier]
  );
  const row = rows[0];
  if (!row) {
    return { found: false, availability: "location_unavailable", entity: null, data: null };
  }
  const entity = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    locationName: row.location_name,
    state: row.state,
    latitude: row.latitude,
    longitude: row.longitude,
  };
  const lat = Number(row.latitude);
  const lon = Number(row.longitude);
  const hasCoords =
    row.latitude !== null && row.longitude !== null &&
    Number.isFinite(lat) && Number.isFinite(lon) &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0);
  if (!hasCoords) {
    return { found: true, availability: "location_unavailable", entity, data: null };
  }
  const data = await getNearby(lat, lon, row.id);
  return { found: true, availability: "available", entity, data };
}

export function clearNearbyCache(): void {
  cache.clear();
}
