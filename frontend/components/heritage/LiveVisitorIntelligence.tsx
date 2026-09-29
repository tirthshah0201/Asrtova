"use client";

import {
  Cloud,
  Droplets,
  Info,
  RefreshCw,
  ShieldAlert,
  Sun,
  Sunrise,
  Sunset,
  Wind,
} from "lucide-react";
import { useApi } from "@/hooks/useApi";
import { VisitCostEstimator } from "./VisitCostEstimator";
import { NearbyExplorer } from "./NearbyExplorer";

/* ========================================
   Astrova — Visitor Intelligence (Phases A–G)
   A) Live conditions + air quality (Open-Meteo)
   B) Heritage situation (honest unavailable state)
   C) Best time to visit (Astrova recommendation)
   D) Cost estimator      → ./VisitCostEstimator
   E–G) Nearby            → ./NearbyExplorer
   ======================================== */

interface VisitorIntelligenceProps {
  heritageId: string;
  hasCoordinates: boolean;
}

interface Situation {
  status: string;
  label: string;
  reason: string;
  source: { name: string; url: string } | null;
  checkedAt: string;
  /* Phase 37 Part C/D — schedule-aware fields (optional for older payloads) */
  timezone?: string;
  localTime?: string;
  today?: {
    dayName?: string;
    open: string | null;
    close: string | null;
    isClosed: boolean;
    is24Hours: boolean;
  } | null;
  nextChange?: {
    kind: "opens" | "closes";
    dayOffset: number;
    at: string;
    onDate?: string;
    inMinutes: number;
  } | null;
  dataOrigin?: string;
  conflict?: boolean;
  scheduleStatus?: string;
}

interface VisitorData {
  availability: "available" | "location_unavailable";
  situation: Situation;
  weather: {
    current: Record<string, unknown>;
    hourly: Array<Record<string, unknown>>;
    daily: Array<Record<string, unknown>>;
    utcOffsetSeconds: number | null;
  } | null;
  airQuality: { current: Record<string, unknown> } | null;
  recommendation: {
    bestWindow: string;
    score: number;
    confidence: "high" | "moderate" | "low";
    reasons: string[];
  } | null;
  sources: Array<{ name: string; type: string; url: string }>;
  meta: { generatedAt: string; stale: boolean; errors: string[] };
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: unknown, suffix = ""): string | null {
  const parsed = numberValue(value);
  return parsed == null ? null : `${Math.round(parsed * 10) / 10}${suffix}`;
}

function weatherLabel(code: unknown): string {
  const value = numberValue(code);
  if (value == null) return "Current conditions";
  if (value === 0) return "Clear sky";
  if (value <= 3) return "Partly cloudy";
  if (value <= 48) return "Foggy";
  if (value <= 67) return "Rain showers";
  if (value <= 77) return "Snow showers";
  if (value <= 82) return "Rain showers";
  return "Thunderstorms";
}

/** Format a provider wall-clock string ("2026-09-27T05:47") as "5:47 am". */
function formatClock(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 16) return null;
  const hour = Number(value.slice(11, 13));
  const minute = value.slice(14, 16);
  if (!Number.isFinite(hour)) return null;
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${hour < 12 ? "am" : "pm"}`;
}

function formatDay(value: unknown): string {
  if (typeof value !== "string") return "Day";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Day" : date.toLocaleDateString("en-IN", { weekday: "short" });
}

/** Wind direction in degrees → 16-point compass label (e.g. 271 → "W"). */
function windDirectionLabel(degrees: number | null): string {
  if (degrees == null || !Number.isFinite(degrees)) return "";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return dirs[index];
}

function formatUpdated(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "recently"
    : date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function LiveVisitorIntelligence({ heritageId, hasCoordinates }: VisitorIntelligenceProps) {
  const endpoint = heritageId ? `/heritage/${heritageId}/visitor-intelligence` : "";
  const { data, loading, error, refetch } = useApi<VisitorData>(endpoint);
  const conditionsAvailable = data?.availability === "available" && Boolean(data?.weather);

  return (
    <section className="mb-16" aria-labelledby="live-visitor-conditions">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-terracotta">Visitor intelligence</p>
            <h2 id="live-visitor-conditions" className="font-display text-2xl sm:text-3xl text-charcoal">Plan your visit</h2>
          </div>
          {data?.meta && (
            <p className="text-xs text-muted">
              Updated {formatUpdated(data.meta.generatedAt)}
              {data.meta.stale ? " · cached" : ""}
            </p>
          )}
        </div>

        {loading && !data && (
          <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label="Loading visitor intelligence">
            <div className="h-48 animate-pulse rounded-2xl bg-cream/50" />
            <div className="h-48 animate-pulse rounded-2xl bg-cream/50" />
          </div>
        )}

        {error && !loading && (
          <div role="alert" className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-terracotta/15 bg-terracotta/5 p-6">
            <div>
              <h3 className="font-semibold text-charcoal">Live conditions are temporarily unavailable.</h3>
              <p className="mt-1 text-sm text-muted">Heritage information remains available.</p>
            </div>
            <button
              type="button"
              onClick={refetch}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-terracotta/20 px-3 py-2 text-sm font-medium text-terracotta hover:bg-terracotta/10"
              aria-label="Retry live visitor conditions"
            >
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
          </div>
        )}

        {/* ---- B: Heritage situation (never fabricated) ---- */}
        {data?.situation && (
          <div className="mb-4 rounded-2xl border border-cream bg-cream/30 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-heritage-gold/10">
                <ShieldAlert className="h-5 w-5 text-heritage-gold" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Current situation
                  {data.situation.localTime && (
                    <span className="ml-2 normal-case tracking-normal">
                      · {data.situation.localTime}
                      {data.situation.timezone ? ` (${data.situation.timezone})` : ""}
                    </span>
                  )}
                </p>
                <p className="mt-1 flex items-center gap-2 font-display text-lg text-charcoal">
                  <span
                    aria-hidden="true"
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      data.situation.status === "OPEN" || data.situation.status === "OPEN_24_HOURS"
                        ? "bg-emerald-500"
                        : data.situation.conflict
                        ? "bg-amber-500"
                        : data.situation.status === "CLOSING_SOON" || data.situation.status === "OPENING_SOON"
                        ? "bg-amber-500"
                        : data.situation.status === "CLOSED" || data.situation.status === "CLOSED_TODAY"
                        ? "bg-stone-400"
                        : "bg-stone-300"
                    }`}
                  />
                  {data.situation.label}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{data.situation.reason}</p>

                {/* Today's schedule + next change (Part T structure) */}
                {data.situation.today && !data.situation.today.isClosed && (
                  <p className="mt-2 text-sm text-charcoal">
                    <span className="text-muted">Today:{" "}</span>
                    {data.situation.today.is24Hours
                      ? "Open 24 hours"
                      : `${data.situation.today.open ?? "—"} – ${data.situation.today.close ?? "—"}`}
                    {data.situation.nextChange && data.situation.nextChange.inMinutes > 0 && (
                      <span className="text-muted">
                        {" · "}
                        {data.situation.nextChange.kind === "closes" ? "Closes" : "Opens"} in about{" "}
                        {data.situation.nextChange.inMinutes >= 60
                          ? `${Math.floor(data.situation.nextChange.inMinutes / 60)}h ${data.situation.nextChange.inMinutes % 60}m`
                          : `${data.situation.nextChange.inMinutes}m`}
                      </span>
                    )}
                  </p>
                )}
                {data.situation.today?.isClosed && (
                  <p className="mt-2 text-sm text-muted">
                    Today: closed
                    {data.situation.nextChange && (
                      <>
                        {" · Opens "}
                        {data.situation.nextChange.dayOffset === 0
                          ? "today"
                          : data.situation.nextChange.dayOffset === 1
                          ? "tomorrow"
                          : `in ${data.situation.nextChange.dayOffset} days`}
                        {" at "}
                        {data.situation.nextChange.at}
                      </>
                    )}
                  </p>
                )}

                {/* Honest origin label (Part X, Phase 38 Part R) */}
                <p className="mt-2 text-xs text-muted">
                  {data.situation.conflict
                    ? "Hours in conflict — published sources disagree. Please verify before visiting."
                    : data.situation.status === "INFORMATION_UNAVAILABLE"
                    ? "INFORMATION UNAVAILABLE — no trusted operating-hours record is available for this site."
                    : data.situation.dataOrigin === "VERIFIED"
                    ? `Verified${data.situation.source ? ` · ${data.situation.source.name}` : ""}`
                    : data.situation.dataOrigin === "DEMO"
                    ? "Demo hours — not verified. Check official sources before travelling."
                    : data.situation.dataOrigin === "ASTROVA_ESTIMATE"
                    ? "Astrova estimate — approximate times, not an official schedule."
                    : "Schedule from a recorded source — check official sources before travelling."}
                  {data.situation.source && (
                    <> Last checked {formatUpdated(data.situation.checkedAt)}.</>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ---- A: unavailable states (coordinates vs provider failure) ---- */}
        {data && data.availability === "location_unavailable" && !error && (
          <div role="status" className="mb-4 rounded-2xl border border-cream bg-cream/30 p-6 text-sm text-muted">
            Live conditions are unavailable because this heritage entity does not have verified
            geographic coordinates. Heritage information remains available.
          </div>
        )}

        {data && data.availability === "available" && !conditionsAvailable && !error && (
          <div role="alert" className="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-terracotta/15 bg-terracotta/5 p-6">
            <div>
              <h3 className="font-semibold text-charcoal">Live conditions are temporarily unavailable.</h3>
              <p className="mt-1 text-sm text-muted">
                {data.meta.errors[0] || "The weather provider did not respond. Try again in a moment."}
              </p>
            </div>
            <button
              type="button"
              onClick={refetch}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-terracotta/20 px-3 py-2 text-sm font-medium text-terracotta hover:bg-terracotta/10"
              aria-label="Retry live conditions"
            >
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
          </div>
        )}

        {data && conditionsAvailable && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-terracotta/10 bg-gradient-to-br from-terracotta/5 to-heritage-gold/5 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted">Current conditions</p>
                    <p className="mt-2 font-display text-4xl text-charcoal">{formatNumber(data.weather?.current.temperature, "°C") || "--"}</p>
                    <p className="text-sm text-charcoal/70">Feels like {formatNumber(data.weather?.current.apparentTemperature, "°C") || "--"}</p>
                    <p className="mt-2 text-sm font-medium text-terracotta">{weatherLabel(data.weather?.current.weatherCode)}</p>
                  </div>
                  <Cloud className="h-8 w-8 text-terracotta/70" aria-hidden="true" />
                </div>                  <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted">Humidity</span><p className="font-semibold text-charcoal">{formatNumber(data.weather?.current.relativeHumidity, "%") || "--"}</p></div>
                    <div>
                      <span className="text-muted">Wind</span>
                      <p className="font-semibold text-charcoal">
                        {formatNumber(data.weather?.current.windSpeed, " km/h") || "--"}
                        {numberValue(data.weather?.current.windDirection) != null && (
                          <span className="ml-1 font-normal text-muted">{windDirectionLabel(numberValue(data.weather?.current.windDirection))}</span>
                        )}
                      </p>
                    </div>
                    <div><span className="text-muted">Rain</span><p className="font-semibold text-charcoal">{formatNumber(data.weather?.current.precipitation, " mm") || "--"}</p></div>
                  <div><span className="text-muted">Cloud cover</span><p className="font-semibold text-charcoal">{formatNumber(data.weather?.current.cloudCover, "%") || "--"}</p></div>
                  <div><span className="text-muted">UV index</span><p className="font-semibold text-charcoal">{formatNumber(data.weather?.current.uvIndex) || "--"}</p></div>
                  <div>
                    <span className="text-muted">Rain chance today</span>
                    <p className="font-semibold text-charcoal">{formatNumber(data.weather?.daily?.[0]?.precipitationProbability, "%") || "--"}</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-terracotta/10 pt-3 text-xs text-muted">
                  <span className="flex items-center gap-1.5">
                    <Sunrise className="h-3.5 w-3.5" aria-hidden="true" />
                    Sunrise {formatClock(data.weather?.daily?.[0]?.sunrise) || "--"}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Sunset className="h-3.5 w-3.5" aria-hidden="true" />
                    Sunset {formatClock(data.weather?.daily?.[0]?.sunset) || "--"}
                  </span>
                  <span className="rounded-full bg-terracotta/10 px-2 py-0.5 font-medium text-terracotta">Current · Open-Meteo</span>
                </div>
              </div>

              <div className="rounded-2xl border border-cream bg-cream/20 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted">Air quality</p>
                    <p className="mt-2 font-display text-2xl text-charcoal">
                      {typeof data.airQuality?.current.category === "string" ? data.airQuality.current.category : "Unavailable"}
                    </p>
                    <p className="text-sm text-muted">Provider reading for this location</p>
                  </div>
                  <Wind className="h-8 w-8 text-heritage-gold/80" aria-hidden="true" />
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted">AQI</span><p className="font-semibold text-charcoal">{formatNumber(data.airQuality?.current.index) || "--"}</p></div>
                  <div><span className="text-muted">PM2.5</span><p className="font-semibold text-charcoal">{formatNumber(data.airQuality?.current.pm25, " µg/m³") || "--"}</p></div>
                  <div><span className="text-muted">PM10</span><p className="font-semibold text-charcoal">{formatNumber(data.airQuality?.current.pm10, " µg/m³") || "--"}</p></div>
                  <div><span className="text-muted">Ozone</span><p className="font-semibold text-charcoal">{formatNumber(data.airQuality?.current.ozone, " µg/m³") || "--"}</p></div>
                  <div><span className="text-muted">Nitrogen dioxide</span><p className="font-semibold text-charcoal">{formatNumber(data.airQuality?.current.nitrogenDioxide, " µg/m³") || "--"}</p></div>
                  <div><span className="text-muted">Carbon monoxide</span><p className="font-semibold text-charcoal">{formatNumber(data.airQuality?.current.carbonMonoxide, " µg/m³") || "--"}</p></div>
                </div>
                <p className="mt-5 border-t border-cream pt-3 text-xs text-muted">
                  <span className="rounded-full bg-heritage-gold/10 px-2 py-0.5 font-medium text-heritage-gold">Current · Open-Meteo</span>
                </p>
              </div>
            </div>

            {/* ---- C: Best time (Astrova recommendation) ---- */}
            {data.recommendation && (
              <div className="mt-4 rounded-2xl bg-charcoal p-6 text-white">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-white/60">Astrova recommendation</p>
                    <h3 className="mt-2 font-display text-2xl">Best time to visit</h3>
                    <p className="mt-1 text-lg text-heritage-gold">{data.recommendation.bestWindow}</p>
                    <p className="mt-2 text-sm text-white/70">
                      {data.recommendation.reasons.join(" · ") || "Most comfortable available forecast window"}
                    </p>
                  </div>
                  <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-full border border-heritage-gold/50 text-center">
                    <span className="font-display text-2xl text-heritage-gold">{data.recommendation.score}</span>
                    <span className="text-[10px] uppercase tracking-wider text-white/60">{data.recommendation.confidence}</span>
                  </div>
                </div>
                <p className="mt-4 text-xs text-white/50">
                  Scored out of 90 from forecast temperature, feels-like temperature, humidity, rain
                  probability, rainfall, UV, wind, air quality and daylight —
                  future daylight hours only. It is not an official heritage authority recommendation.
                </p>
              </div>
            )}

            {/* ---- 7-day forecast ---- */}
            {Boolean(data.weather?.daily?.length) && (
              <div className="mt-4 rounded-2xl border border-cream bg-white/50 p-6">
                <div className="mb-4 flex items-center gap-2">
                  <Sun className="h-5 w-5 text-heritage-gold" aria-hidden="true" />
                  <h3 className="font-display text-xl text-charcoal">7-day forecast</h3>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                  {data.weather?.daily.slice(0, 7).map((day, index) => (
                    <div key={String(day.time) || index} className="rounded-xl bg-cream/40 p-3 text-center">
                      <p className="text-xs font-medium text-muted">{formatDay(day.time)}</p>
                      <p className="mt-2 font-semibold text-charcoal">{formatNumber(day.temperatureMax, "°") || "--"}</p>
                      <p className="text-xs text-muted">Low {formatNumber(day.temperatureMin, "°") || "--"}</p>
                      <p className="mt-1 text-xs text-terracotta">{formatNumber(day.precipitationProbability, "%") || "--"} rain</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(data.meta.errors.length > 0 || data.meta.stale) && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                <Droplets className="h-3.5 w-3.5" aria-hidden="true" /> Some readings may be delayed or unavailable.
              </div>
            )}
            <p className="mt-4 text-xs text-muted flex items-start gap-1.5">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Weather and air quality by{" "}
                <a className="text-terracotta hover:underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>.
                {" "}Retrieved {formatUpdated(data.meta.generatedAt)}.
              </span>
            </p>
          </>
        )}

        {/* ---- D: Cost estimator ---- */}
        <VisitCostEstimator heritageId={heritageId} />

        {/* ---- E–G: Nearby ---- */}
        <NearbyExplorer heritageId={heritageId} hasCoordinates={hasCoordinates} />
      </div>
    </section>
  );
}
