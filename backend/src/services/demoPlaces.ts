/* ============================================================
   Astrova — Controlled DEMO nearby dataset (Phase 37 Part E/F)

   Read-only access to `demo_places`. These rows are a development /
   demonstration fallback used ONLY when OpenStreetMap returns nothing
   (or is unavailable). They are stored as source_type = 'DEMO' and
   verification_status can never be 'VERIFIED' (enforced by the schema).

   Nothing here claims price, availability, rating, reviews or booking —
   those columns do not exist on purpose.
   ============================================================ */

import { query } from "../database";

export interface DemoPlaceRow {
  [key: string]: unknown;
  id: string;
  heritage_id: string;
  name: string;
  category:
    | "HOTEL"
    | "RESTAURANT"
    | "CAFE"
    | "PARKING"
    | "MUSEUM"
    | "ATTRACTION"
    | "TRANSPORT"
    | "ATM"
    | "PHARMACY"
    | "HOSPITAL"
    | "SHOPPING";
  latitude: number | string;
  longitude: number | string;
  address: string | null;
  phone: string | null;
  website: string | null;
  source_type: "DEMO";
  source_url: string | null;
  verification_status: "UNVERIFIED" | "REVIEWED";
}

export const DEMO_PLACE_CATEGORIES = [
  "HOTEL",
  "RESTAURANT",
  "CAFE",
  "PARKING",
  "MUSEUM",
  "ATTRACTION",
  "TRANSPORT",
  "ATM",
  "PHARMACY",
  "HOSPITAL",
  "SHOPPING",
] as const;

/** All demo places recorded for one heritage entity, nearest first is
 *  computed by the caller (distance depends on the reference point). */
export async function getDemoPlaces(heritageId: string): Promise<DemoPlaceRow[]> {
  const { rows } = await query<DemoPlaceRow>(
    `SELECT id, heritage_id, name, category, latitude, longitude,
            address, phone, website, source_type, source_url, verification_status
       FROM demo_places
      WHERE heritage_id = $1
      ORDER BY category, name`,
    [heritageId]
  );
  return rows;
}

/** Counters for the admin / status surfaces. */
export async function demoPlacesStats(): Promise<{
  total: number;
  categories: number;
  entities: number;
  verified: number;
}> {
  const { rows } = await query<{ total: string; categories: string; entities: string; verified: string }>(
    `SELECT count(*) AS total,
            count(DISTINCT category) AS categories,
            count(DISTINCT heritage_id) AS entities,
            count(*) FILTER (WHERE verification_status = 'VERIFIED') AS verified
       FROM demo_places`
  );
  const row = rows[0];
  return {
    total: Number(row?.total || 0),
    categories: Number(row?.categories || 0),
    entities: Number(row?.entities || 0),
    verified: Number(row?.verified || 0),
  };
}
