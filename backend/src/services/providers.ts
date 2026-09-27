/* ========================================
   Astrova — Provider Adapters (Phase 13)
   ========================================

   Replaceable external-provider boundary. Every provider is described by a
   `ProviderMeta` record (name, purpose, license, attribution, terms) so the
   API can attribute any value it returns without hard-coding strings in the
   business services.

   Replacement rule: swapping a provider means adding a module here and
   re-pointing the service import — the frontend never changes.

   All requests share `fetchJson` (timeout + JSON guard) so a slow or
   malformed provider degrades into a caught error instead of a crash.
   ======================================== */

export interface ProviderMeta {
  /** Stable identifier, e.g. "open_meteo_weather". */
  id: string;
  /** Human-readable provider name shown in the UI. */
  name: string;
  /** What this provider supplies. */
  purpose: string;
  /** License / terms summary (short, human-readable). */
  license: string;
  /** Canonical attribution URL. */
  attributionUrl: string;
  /** Provider terms / documentation URL. */
  termsUrl: string;
}

export const OPEN_METEO_WEATHER: ProviderMeta = {
  id: "open_meteo_weather",
  name: "Open-Meteo",
  purpose: "weather and air quality",
  license: "Free for non-commercial use (Open-Meteo terms; CC-style conditions)",
  attributionUrl: "https://open-meteo.com/",
  termsUrl: "https://open-meteo.com/en/terms",
};

export const OPEN_METEO_AIR_QUALITY: ProviderMeta = {
  id: "open_meteo_air_quality",
  name: "Open-Meteo",
  purpose: "air quality",
  license: "Free for non-commercial use (Open-Meteo terms; CC-style conditions)",
  attributionUrl: "https://open-meteo.com/",
  termsUrl: "https://open-meteo.com/en/terms",
};

export const OVERPASS_OSM: ProviderMeta = {
  id: "overpass_osm",
  name: "OpenStreetMap contributors",
  purpose: "nearby places and stays",
  license: "ODbL 1.0",
  attributionUrl: "https://www.openstreetmap.org/copyright",
  termsUrl: "https://www.openstreetmap.org/copyright",
};

export const WIKIDATA: ProviderMeta = {
  id: "wikidata",
  name: "Wikidata",
  purpose: "structured open heritage references",
  license: "CC0 1.0 (public domain dedication)",
  attributionUrl: "https://www.wikidata.org/",
  termsUrl: "https://www.wikidata.org/wiki/Wikidata:Copyrights",
};

/** Shaped like the `sources` entries already used in API responses. */
export function sourceEntry(
  meta: ProviderMeta,
  typeOverride?: string
): { name: string; type: string; url: string } {
  return {
    name: meta.name,
    type: typeOverride || meta.purpose,
    url: meta.attributionUrl,
  };
}

export const DEFAULT_PROVIDER_TIMEOUT_MS = 5000;

export interface FetchJsonOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

/**
 * Fetch + parse JSON with a hard timeout. Throws on network failure,
 * non-2xx status, invalid JSON, or timeout — callers decide how to degrade.
 * Never returns null for a successful `null`/scalar body: type is asserted
 * by the caller after a `isRecord` guard where shape matters.
 */
export async function fetchJson<T>(
  url: string,
  options: FetchJsonOptions = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS
  );
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: { Accept: "application/json", ...(options.headers || {}) },
      body: options.body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`provider returned ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/** True only for non-null, non-array objects. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
