"use client";

import { BedDouble, Bus, Camera, Compass, Droplet, Info, Landmark, MapPin, RefreshCw, Trees, UtensilsCrossed, Car } from "lucide-react";
import Link from "next/link";
import { useApi } from "@/hooks/useApi";

/* ========================================
   Astrova — Nearby Explorer (Features E, F, G)
   E) Nearby heritage  → Astrova's own database
   F) Nearby places    → OpenStreetMap / Overpass
   G) Stay nearby      → OpenStreetMap / Overpass
   No ratings, prices or availability are ever shown.
   ======================================== */

interface NearbyHeritageItem {
  id: string;
  name: string;
  slug: string;
  category: string;
  locationName: string | null;
  state: string | null;
  distanceKm: number;
}

type PlaceCategory = "culture" | "food" | "park" | "parking" | "transport" | "attraction" | "facility";

interface NearbyPlaceItem {
  name: string;
  category: PlaceCategory;
  kind: string;
  distanceKm: number;
  lat: number;
  lon: number;
}

interface NearbyStayItem {
  name: string;
  kind: string;
  distanceKm: number;
  lat: number;
  lon: number;
  website?: string;
  phone?: string;
  stars?: number;
  address?: string;
}

interface NearbyData {
  heritage: NearbyHeritageItem[];
  places: NearbyPlaceItem[];
  stays: NearbyStayItem[];
  sources: Array<{ name: string; type: string; url: string }>;
  meta: {
    generatedAt: string;
    radiusM: number;
    cached: boolean;
    stale: boolean;
    errors: string[];
  };
}

interface NearbyResponse {
  availability: "available" | "location_unavailable";
  nearby: NearbyData | null;
}

const CATEGORY_META: Record<PlaceCategory, { label: string; Icon: typeof Landmark }> = {
  culture: { label: "Museums & culture", Icon: Landmark },
  attraction: { label: "Attractions", Icon: Camera },
  food: { label: "Food", Icon: UtensilsCrossed },
  park: { label: "Parks", Icon: Trees },
  parking: { label: "Parking", Icon: Car },
  transport: { label: "Transport", Icon: Bus },
  facility: { label: "Public facilities", Icon: Droplet },
};

function distanceLabel(km: number): string {
  if (km === 0) return "same mapped location";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km} km`;
}

export function NearbyExplorer({
  heritageId,
  hasCoordinates,
}: {
  heritageId: string;
  hasCoordinates: boolean;
}) {
  const endpoint = hasCoordinates && heritageId ? `/heritage/${heritageId}/nearby` : "";
  const { data, loading, error, refetch } = useApi<NearbyResponse>(endpoint, {
    immediate: Boolean(endpoint),
  });

  const nearby = data?.nearby ?? null;

  return (
    <section aria-labelledby="nearby-heading" className="mt-4">
      <div className="rounded-2xl border border-cream bg-white/60 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Compass className="h-3.5 w-3.5" aria-hidden="true" /> Around this place
            </p>
            <h3 id="nearby-heading" className="mt-1 font-display text-xl text-charcoal">
              Explore nearby
            </h3>
          </div>
          {nearby && (
            <p className="text-xs text-muted">
              Within {Math.round(nearby.meta.radiusM / 1000)} km
              {nearby.meta.cached ? " · cached" : ""}
            </p>
          )}
        </div>

        {!hasCoordinates && (
          <p className="rounded-xl bg-cream/40 p-4 text-sm text-muted">
            Nearby exploration needs verified coordinates, which this heritage entry does not have yet.
            Heritage information remains available.
          </p>
        )}

        {hasCoordinates && loading && !nearby && (
          <div className="grid gap-4 lg:grid-cols-2" role="status" aria-label="Loading nearby information">
            <div className="h-40 animate-pulse rounded-xl bg-cream/50" />
            <div className="h-40 animate-pulse rounded-xl bg-cream/50" />
          </div>
        )}

        {hasCoordinates && error && !loading && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-terracotta/15 bg-terracotta/5 p-4">
            <p className="text-sm text-muted">Nearby information is temporarily unavailable.</p>
            <button
              type="button"
              onClick={refetch}
              className="inline-flex items-center gap-1.5 rounded-lg border border-terracotta/20 px-3 py-1.5 text-sm text-terracotta hover:bg-terracotta/10"
              aria-label="Retry nearby information"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        )}

        {nearby && !error && (
          /* grid-cols-1 => minmax(0,1fr): keeps long OSM place names from
             inflating the implicit auto track and overflowing on mobile */
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* ---- E: Nearby heritage (Astrova's own data) ---- */}
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-charcoal">
                <Landmark className="h-4 w-4 text-terracotta" aria-hidden="true" />
                Nearby heritage
              </h4>
              {nearby.heritage.length === 0 ? (
                <p className="text-sm text-muted">No other mapped heritage sites nearby yet.</p>
              ) : (
                <ul className="space-y-2">
                  {nearby.heritage.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`/heritage/${item.slug || item.id}`}
                        className="group flex items-center justify-between gap-3 rounded-xl border border-transparent bg-cream/40 px-4 py-3 hover:border-terracotta/15 hover:bg-cream/70 transition-all"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-charcoal group-hover:text-terracotta transition-colors">
                            {item.name}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {item.category}
                            {item.locationName ? ` · ${item.locationName}` : ""}
                            {item.state ? `, ${item.state}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold text-terracotta">
                          {distanceLabel(item.distanceKm)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-muted">
                Distances between sites sharing one mapped location read as “same mapped location” —
                Astrova stores coordinates at location level.
              </p>
            </div>

            {/* ---- F: Nearby places (OpenStreetMap) ---- */}
            <div>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-charcoal">
                <MapPin className="h-4 w-4 text-terracotta" aria-hidden="true" />
                Nearby places
              </h4>
              {nearby.meta.errors.length > 0 && nearby.places.length === 0 ? (
                <p className="rounded-xl bg-cream/40 p-4 text-sm text-muted">
                  Nearby places are temporarily unavailable. Nearby heritage remains available.
                </p>
              ) : nearby.places.length === 0 ? (
                <p className="text-sm text-muted">No named places found in OpenStreetMap around this site.</p>
              ) : (
                <div className="space-y-4">
                  {(Object.keys(CATEGORY_META) as PlaceCategory[])
                    .map((category) => ({
                      category,
                      items: nearby.places.filter((place) => place.category === category),
                    }))
                    .filter((group) => group.items.length > 0)
                    .map((group) => {
                      const { label, Icon } = CATEGORY_META[group.category];
                      return (
                        <div key={group.category}>
                          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
                          </p>
                          <ul className="space-y-1.5">
                            {group.items.slice(0, 6).map((place) => (
                              <li
                                key={`${place.name}-${place.lat}-${place.lon}`}
                                className="flex items-center justify-between gap-3 rounded-lg bg-cream/40 px-3 py-2"
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm text-charcoal">{place.name}</span>
                                  <span className="block text-[11px] text-muted capitalize">{place.kind.replace(/_/g, " ")}</span>
                                </span>
                                <span className="shrink-0 text-xs text-terracotta">{distanceLabel(place.distanceKm)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* ---- G: Stay nearby (OpenStreetMap) ---- */}
            <div className="lg:col-span-2">
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-charcoal">
                <BedDouble className="h-4 w-4 text-terracotta" aria-hidden="true" />
                Stay nearby
              </h4>
              {nearby.meta.errors.length > 0 && nearby.stays.length === 0 ? (
                <p className="rounded-xl bg-cream/40 p-4 text-sm text-muted">
                  Accommodation data is temporarily unavailable.
                </p>
              ) : nearby.stays.length === 0 ? (
                <p className="text-sm text-muted">No named accommodation found in OpenStreetMap around this site.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {nearby.stays.map((stay) => (
                    <li
                      key={`${stay.name}-${stay.lat}-${stay.lon}`}
                      className="rounded-xl border border-cream bg-cream/30 p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-charcoal">{stay.name}</p>
                        <span className="shrink-0 text-xs text-terracotta">{distanceLabel(stay.distanceKm)}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] capitalize text-muted">{stay.kind.replace(/_/g, " ")}</p>
                      {stay.address && (
                        <p className="mt-0.5 text-[11px] text-muted">{stay.address}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        {stay.website && (
                          <a
                            href={stay.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-terracotta hover:underline"
                          >
                            Website
                          </a>
                        )}
                        {stay.phone && (
                          <a href={`tel:${stay.phone}`} className="text-terracotta hover:underline">
                            {stay.phone}
                          </a>
                        )}
                        {typeof stay.stars === "number" && (
                          <span className="text-muted">{stay.stars}★ as mapped</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted">
                <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                Accommodation details come from OpenStreetMap. Astrova does not show room prices,
                live availability or ratings — check with the property directly.
              </p>
            </div>

            <p className="lg:col-span-2 text-[11px] text-muted">
              Nearby places ©{" "}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noopener noreferrer"
                className="text-terracotta hover:underline"
              >
                OpenStreetMap contributors
              </a>{" "}
              (ODbL). Nearby heritage from the Astrova database.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
