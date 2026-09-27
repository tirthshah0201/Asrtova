import { query } from "../database";
import { isValidSlug, isUUID } from "../utils/slug";
import {
  OPEN_METEO_WEATHER,
  fetchJson,
  isRecord,
  sourceEntry,
} from "./providers";

const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

interface LocationRow {
  id: string;
  name: string;
  state: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
}

interface HeritageRow {
  [key: string]: unknown;
  id: string;
  name: string;
  slug: string;
  location_id: string | null;
  location_name: string | null;
  state: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
}

interface CachedResponse {
  response: VisitorIntelligenceResponse;
  expiresAt: number;
}

export interface SituationData {
  /** Allowed states. Astrova only leaves "information_unavailable" until a
   * verified live-status source exists for the site. */
  status:
    | "open"
    | "closed"
    | "temporarily_restricted"
    | "maintenance"
    | "information_unavailable";
  label: string;
  reason: string;
  source: { name: string; url: string } | null;
  checkedAt: string;
}

export interface VisitorIntelligenceResponse {
  heritage: {
    id: string;
    name: string;
    slug: string;
    location: LocationRow | null;
  };
  availability: "available" | "location_unavailable";
  situation: SituationData;
  weather: WeatherData | null;
  airQuality: AirQualityData | null;
  recommendation: Recommendation | null;
  sources: Array<{ name: string; type: string; url: string }>;
  meta: {
    generatedAt: string;
    weatherFetchedAt: string | null;
    airQualityFetchedAt: string | null;
    stale: boolean;
    errors: string[];
  };
}

/** Feature B: never fabricate open/closed/busy/safe states. */
function buildSituation(): SituationData {
  return {
    status: "information_unavailable",
    label: "Current status unavailable",
    reason:
      "Astrova has no verified live source for opening status, closures or crowd levels at this site, so no status is shown.",
    source: null,
    checkedAt: new Date().toISOString(),
  };
}

interface WeatherData {
  current: Record<string, unknown>;
  hourly: Array<Record<string, unknown>>;
  daily: Array<Record<string, unknown>>;
  /** Provider UTC offset for the requested coordinates (seconds). */
  utcOffsetSeconds: number | null;
}

interface AirQualityData {
  current: Record<string, unknown>;
  /** Hourly US AQI keyed by provider wall-clock time ("YYYY-MM-DDTHH:MM"). */
  hourlyAqi: Record<string, number>;
}

interface Recommendation {
  bestWindow: string;
  score: number;
  confidence: "high" | "moderate" | "low";
  reasons: string[];
}

const cache = new Map<string, CachedResponse>();

function isValidCoordinate(value: number | string | null): value is number | string {
  // Number(null) and Number("") are 0 — treat those as MISSING, not as coordinates.
  if (value === null || value === undefined || value === "") return false;
  const numeric = Number(value);
  return Number.isFinite(numeric);
}

function hasRealCoordinates(latitude: number | string | null, longitude: number | string | null): boolean {
  if (!isValidCoordinate(latitude) || !isValidCoordinate(longitude)) return false;
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function scoreTemperature(value: number): number {
  // Max 18 points.
  if (value >= 18 && value <= 30) return 18;
  if (value >= 14 && value <= 34) return 13;
  if (value >= 10 && value <= 38) return 7;
  return 3;
}

/** Score one forecast hour 0–90.
 *
 * Inputs (each with neutral partial credit when the provider omits it, so a
 * missing value never fabricates a penalty *or* a bonus):
 * temperature 18 · apparent temperature 7 · humidity 8 · rain probability 12 ·
 * precipitation 5 · UV 12 · wind 8 · air quality 10 · daylight 10 = 90 max.
 *
 * `aqiByTime` maps provider wall-clock time → US AQI (from the air-quality
 * provider's hourly series) so air quality can influence *which hour* is
 * recommended, not just the current-conditions card.
 */
function scoreHour(
  index: number,
  hourly: Record<string, unknown>,
  aqiByTime: Record<string, number> | null
): { score: number; reason: string } {
  const temperature = Number(hourly.temperature);
  const apparentTemperature = Number(hourly.apparentTemperature);
  const relativeHumidity = Number(hourly.relativeHumidity);
  const precipitationProbability = Number(hourly.precipitationProbability);
  const precipitation = Number(hourly.precipitation);
  const uvIndex = Number(hourly.uvIndex);
  const windSpeed = Number(hourly.windSpeed);
  const aqi =
    aqiByTime && typeof hourly.time === "string"
      ? aqiByTime[hourly.time]
      : undefined;
  let score = 0;
  const reasons: string[] = [];

  // Temperature (18)
  if (Number.isFinite(temperature)) {
    score += scoreTemperature(temperature);
    if (temperature <= 30) reasons.push("comfortable temperature");
  } else {
    score += 9;
  }

  // Apparent / feels-like temperature (7)
  if (Number.isFinite(apparentTemperature)) {
    score +=
      apparentTemperature >= 18 && apparentTemperature <= 30
        ? 7
        : apparentTemperature >= 14 && apparentTemperature <= 34
          ? 5
          : apparentTemperature >= 10 && apparentTemperature <= 38
            ? 3
            : 1;
    if (apparentTemperature >= 18 && apparentTemperature <= 30 && !reasons.includes("comfortable temperature")) {
      reasons.push("comfortable feels-like temperature");
    }
  } else {
    score += 4;
  }

  // Relative humidity (8)
  if (Number.isFinite(relativeHumidity)) {
    score +=
      relativeHumidity >= 30 && relativeHumidity <= 60
        ? 8
        : relativeHumidity >= 20 && relativeHumidity <= 70
          ? 6
          : 3;
    if (relativeHumidity >= 30 && relativeHumidity <= 60) reasons.push("comfortable humidity");
  } else {
    score += 4;
  }

  // Rain probability (12)
  if (Number.isFinite(precipitationProbability)) {
    score += precipitationProbability <= 20 ? 12 : precipitationProbability <= 45 ? 8 : 2;
    if (precipitationProbability <= 20) reasons.push("low rain probability");
  } else {
    score += 7;
  }

  // Precipitation amount (5)
  if (Number.isFinite(precipitation)) {
    score += precipitation <= 0 ? 5 : precipitation <= 1 ? 4 : precipitation <= 5 ? 2 : 0;
    if (precipitation <= 0) reasons.push("no rainfall expected");
  } else {
    score += 3;
  }

  // UV index (12)
  if (Number.isFinite(uvIndex)) {
    score += uvIndex <= 5 ? 12 : uvIndex <= 8 ? 8 : 3;
    if (uvIndex <= 5) reasons.push("lower UV exposure");
  } else {
    score += 7;
  }

  // Wind (8)
  if (Number.isFinite(windSpeed)) {
    score += windSpeed <= 20 ? 8 : windSpeed <= 35 ? 5 : 2;
    if (windSpeed <= 20) reasons.push("light wind");
  } else {
    score += 5;
  }

  // Air quality — US AQI for this hour (10). Neutral credit when the
  // air-quality provider has no hourly value for the hour.
  if (typeof aqi === "number" && Number.isFinite(aqi)) {
    score += aqi <= 50 ? 10 : aqi <= 100 ? 7 : aqi <= 150 ? 4 : 1;
    if (aqi <= 50) reasons.push("good air quality");
  } else {
    score += 5;
  }

  // Daylight (10)
  score += Number.isFinite(Number(hourly.isDay)) && Number(hourly.isDay) === 1 ? 10 : 4;

  // Keep every reason: buildRecommendation trims the final list, and the
  // user should see which of the nine inputs actually drove the pick.
  return { score: clamp(Math.round(score), 0, 90), reason: reasons.join(", ") || `hour ${index}` };
}

interface Candidate {
  hour: Record<string, unknown>;
  index: number;
  instant: number | null;
}

/** Parse a provider timestamp into a true UTC instant.
 * Naive wall-clock strings ("YYYY-MM-DDTHH:MM") are location-local, so the
 * provider UTC offset is subtracted to get the real instant. */
function toInstant(value: unknown, utcOffsetSeconds: number | null): number | null {
  if (typeof value !== "string" || value.length < 16) return null;
  const hasZone = value.endsWith("Z") || /[+-]\d\d:\d\d$/.test(value);
  const parsed = Date.parse(hasZone ? value : `${value}Z`);
  if (!Number.isFinite(parsed)) return null;
  return hasZone ? parsed : parsed - (utcOffsetSeconds ?? 0) * 1000;
}

/** Format a provider wall-clock timestamp as a 12-hour label without timezone conversion. */
function formatWallClock(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 16) return null;
  const hour = Number(value.slice(11, 13));
  const minute = value.slice(14, 16);
  if (!Number.isFinite(hour)) return null;
  const period = hour < 12 ? "am" : "pm";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

/** Shift a wall-clock string by whole hours (returns a wall-clock string). */
function shiftWallClock(value: string, hours: number): string | null {
  const parsed = Date.parse(`${value.slice(0, 16)}Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed + hours * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function buildRecommendation(
  hourly: Array<Record<string, unknown>>,
  utcOffsetSeconds: number | null = null,
  aqiByTime: Record<string, number> | null = null
): Recommendation | null {
  if (hourly.length === 0) return null;

  const nowMs = Date.now();
  const HORIZON_MS = 48 * 60 * 60 * 1000; // planning horizon: next 2 days
  const annotate = (hour: Record<string, unknown>, index: number): Candidate => ({
    hour,
    index,
    instant: toInstant(hour.time, utcOffsetSeconds),
  });

  const all = hourly.map(annotate);
  // Preference ladder: future + daylight → future (any) → all hours.
  const future = all.filter((c) => c.instant !== null && c.instant >= nowMs && c.instant <= nowMs + HORIZON_MS);
  const futureDaylight = future.filter((c) => Number(c.hour.isDay) === 1);
  const pool =
    futureDaylight.length > 0
      ? futureDaylight
      : future.length > 0
        ? future
        : all;

  const scored = pool
    .map((candidate) => ({ ...candidate, ...scoreHour(candidate.index, candidate.hour, aqiByTime) }))
    .sort((left, right) => right.score - left.score);
  const best = scored[0];

  const startLabel = formatWallClock(best.hour.time);
  const endWall = typeof best.hour.time === "string" ? shiftWallClock(best.hour.time, 3) : null;
  const endLabel = endWall ? formatWallClock(endWall) : null;
  // Disambiguate which calendar day the window belongs to (provider wall clock).
  let dayLabel: string | null = null;
  if (typeof best.hour.time === "string" && best.hour.time.length >= 10) {
    const chosenDate = best.hour.time.slice(0, 10);
    const wallToday = new Date(Date.now() + (utcOffsetSeconds ?? 0) * 1000)
      .toISOString()
      .slice(0, 10);
    if (chosenDate === wallToday) {
      dayLabel = "Today";
    } else if (chosenDate === new Date(Date.parse(`${wallToday}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)) {
      dayLabel = "Tomorrow";
    } else {
      const weekday = new Date(Date.parse(`${chosenDate}T00:00:00Z`)).toLocaleDateString("en-IN", {
        weekday: "short",
        timeZone: "UTC",
      });
      dayLabel = weekday;
    }
  }
  const bestWindow =
    startLabel && endLabel
      ? `${dayLabel ? `${dayLabel}, ` : ""}${startLabel} - ${endLabel}`
      : startLabel
        ? `${dayLabel ? `${dayLabel}, ` : ""}${startLabel} (3 hours)`
        : "the clearest available forecast window";

  const isPastFallback = pool !== all ? false : best.instant !== null && best.instant < nowMs;
  const confidence: Recommendation["confidence"] = isPastFallback
    ? "low"
    : pool.length >= 12
      ? "high"
      : pool.length >= 4
        ? "moderate"
        : "low";

  const reasons = best.reason.split(", ").filter(Boolean);
  if (Number(best.hour.isDay) === 1 && !reasons.includes("daylight hours")) {
    reasons.push("daylight hours");
  }

  return {
    bestWindow,
    score: best.score,
    confidence,
    reasons: reasons.slice(0, 6),
  };
}

function normalizeWeather(rawPayload: unknown): WeatherData {
  // Malformed provider body (null / scalar / array) must degrade like any
  // other provider failure instead of throwing through to a 502.
  if (!isRecord(rawPayload)) throw new Error("malformed weather payload from provider");
  const payload = rawPayload;
  const current = isRecord(payload.current) ? payload.current : {};
  const hourlyPayload = (payload.hourly || {}) as Record<string, unknown[]>;
  const dailyPayload = (payload.daily || {}) as Record<string, unknown[]>;
  const toHourlyRows = (source: Record<string, unknown[]>) => {
    const times = Array.isArray(source.time) ? source.time : [];
    return times.map((time, index) => ({
      time,
      temperature: source.temperature_2m?.[index],
      apparentTemperature: source.apparent_temperature?.[index],
      relativeHumidity: source.relative_humidity_2m?.[index],
      precipitation: source.precipitation?.[index],
      precipitationProbability: source.precipitation_probability?.[index],
      weatherCode: source.weather_code?.[index],
      windSpeed: source.wind_speed_10m?.[index],
      windDirection: source.wind_direction_10m?.[index],
      cloudCover: source.cloud_cover?.[index],
      uvIndex: source.uv_index?.[index],
      isDay: source.is_day?.[index],
      sunrise: source.sunrise?.[index],
      sunset: source.sunset?.[index],
    }));
  };
  const dailyTimes = Array.isArray(dailyPayload.time) ? dailyPayload.time : [];
  const daily = dailyTimes.map((time, index) => ({
    time,
    temperatureMax: dailyPayload.temperature_2m_max?.[index],
    temperatureMin: dailyPayload.temperature_2m_min?.[index],
    precipitation: dailyPayload.precipitation_sum?.[index],
    precipitationProbability: dailyPayload.precipitation_probability_max?.[index],
    weatherCode: dailyPayload.weather_code?.[index],
    sunrise: dailyPayload.sunrise?.[index],
    sunset: dailyPayload.sunset?.[index],
  }));
  return {
    current: {
      time: current.time,
      temperature: current.temperature_2m,
      apparentTemperature: current.apparent_temperature,
      relativeHumidity: current.relative_humidity_2m,
      precipitation: current.precipitation,
      weatherCode: current.weather_code,
      windSpeed: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
      cloudCover: current.cloud_cover,
      uvIndex: current.uv_index,
      sunrise: Array.isArray(dailyPayload.sunrise) ? dailyPayload.sunrise[0] : undefined,
      sunset: Array.isArray(dailyPayload.sunset) ? dailyPayload.sunset[0] : undefined,
    },
    hourly: toHourlyRows(hourlyPayload),
    daily,
    utcOffsetSeconds: Number.isFinite(Number(payload.utc_offset_seconds))
      ? Number(payload.utc_offset_seconds)
      : null,
  };
}

function aqiCategory(value: number): string {
  // Standard US AQI bands (https://www.airnow.gov/aqi/aqi-basics/)
  if (value <= 50) return "Good";
  if (value <= 100) return "Moderate";
  if (value <= 150) return "Unhealthy for Sensitive Groups";
  if (value <= 200) return "Unhealthy";
  if (value <= 300) return "Very Unhealthy";
  return "Hazardous";
}

function normalizeAirQuality(rawPayload: unknown): AirQualityData {
  // Malformed body must degrade like any other provider failure.
  if (!isRecord(rawPayload)) throw new Error("malformed air-quality payload from provider");
  const payload = rawPayload;
  const current = isRecord(payload.current) ? payload.current : {};
  const usAqi = Number(current.us_aqi);
  // Hourly US AQI (wall-clock time → value) feeds best-time scoring.
  const hourlySource = isRecord(payload.hourly) ? payload.hourly : {};
  const hourlyTimes = Array.isArray(hourlySource.time) ? hourlySource.time : [];
  const hourlyValues = Array.isArray(hourlySource.us_aqi) ? hourlySource.us_aqi : [];
  const hourlyAqi: Record<string, number> = {};
  hourlyTimes.forEach((time, index) => {
    const value = Number(hourlyValues[index]);
    if (typeof time === "string" && Number.isFinite(value)) hourlyAqi[time] = value;
  });
  return {
    hourlyAqi,
    current: {
      time: current.time,
      index: current.us_aqi ?? current.european_aqi,
      category: Number.isFinite(usAqi) ? aqiCategory(usAqi) : undefined,
      pm25: current.pm2_5,
      pm10: current.pm10,
      ozone: current.ozone,
      nitrogenDioxide: current.nitrogen_dioxide,
      carbonMonoxide: current.carbon_monoxide,
      dust: current.dust,
    },
  };
}

function buildUrls(latitude: number, longitude: number): { weather: string; airQuality: string } {
  const weatherParams = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover,uv_index",
    hourly: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,cloud_cover,uv_index,is_day",
    daily: "sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code",
    forecast_days: "7",
    timezone: "auto",
  });
  const airParams = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,ozone,dust,us_aqi,european_aqi",
    hourly: "us_aqi",
    forecast_days: "7",
    timezone: "auto",
  });
  return { weather: `${WEATHER_URL}?${weatherParams}`, airQuality: `${AIR_QUALITY_URL}?${airParams}` };
}

async function loadResponse(row: HeritageRow, staleResponse?: VisitorIntelligenceResponse): Promise<VisitorIntelligenceResponse> {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  const urls = buildUrls(latitude, longitude);
  const errors: string[] = [];
  const fetchedAt = new Date().toISOString();
  const [weatherResult, airQualityResult] = await Promise.allSettled([
    fetchJson<Record<string, unknown>>(urls.weather),
    fetchJson<Record<string, unknown>>(urls.airQuality),
  ]);
  const weather = weatherResult.status === "fulfilled" ? normalizeWeather(weatherResult.value) : staleResponse?.weather || null;
  const airQuality = airQualityResult.status === "fulfilled" ? normalizeAirQuality(airQualityResult.value) : staleResponse?.airQuality || null;
  if (weatherResult.status === "rejected") {
    errors.push("Weather data is temporarily unavailable.");
    console.error("[Visitor Intelligence] weather provider failed:", String((weatherResult as PromiseRejectedResult).reason));
  }
  if (airQualityResult.status === "rejected") {
    errors.push("Air-quality data is temporarily unavailable.");
    console.error("[Visitor Intelligence] air-quality provider failed:", String((airQualityResult as PromiseRejectedResult).reason));
  }
  const stale = errors.length > 0 && Boolean(staleResponse);
  const response: VisitorIntelligenceResponse = {
    heritage: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      location: row.location_id && hasRealCoordinates(row.latitude, row.longitude)
        ? { id: row.location_id, name: row.location_name || "", state: row.state, latitude: row.latitude, longitude: row.longitude }
        : null,
    },
    availability: "available",
    situation: buildSituation(),
    weather,
    airQuality,
    recommendation: weather
      ? buildRecommendation(
          weather.hourly,
          weather.utcOffsetSeconds ?? null,
          airQuality && Object.keys(airQuality.hourlyAqi).length > 0
            ? airQuality.hourlyAqi
            : null
        )
      : staleResponse?.recommendation || null,
    sources: [sourceEntry(OPEN_METEO_WEATHER, "weather and air quality")],
    meta: { generatedAt: fetchedAt, weatherFetchedAt: weatherResult.status === "fulfilled" ? fetchedAt : null, airQualityFetchedAt: airQualityResult.status === "fulfilled" ? fetchedAt : null, stale, errors },
  };
  return response;
}

export async function getVisitorIntelligence(identifier: string): Promise<VisitorIntelligenceResponse | null> {
  if (!isUUID(identifier) && !isValidSlug(identifier)) return null;
  const lookup = isUUID(identifier) ? "he.id = $1" : "he.slug = $1";
  const { rows } = await query<HeritageRow>(
    `SELECT he.id, he.name, he.slug, he.location_id,
      l.name AS location_name, l.state, l.latitude, l.longitude
     FROM heritage_entities he
     LEFT JOIN locations l ON he.location_id = l.id
     WHERE ${lookup}`,
    [identifier]
  );
  const row = rows[0];
  if (!row) return null;

  const base = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    location: row.location_id ? { id: row.location_id, name: row.location_name || "", state: row.state, latitude: row.latitude, longitude: row.longitude } : null,
  };
  if (!hasRealCoordinates(row.latitude, row.longitude)) {
    return {
      heritage: base,
      availability: "location_unavailable",
      situation: buildSituation(),
      weather: null,
      airQuality: null,
      recommendation: null,
      sources: [sourceEntry(OPEN_METEO_WEATHER, "weather and air quality")],
      meta: { generatedAt: new Date().toISOString(), weatherFetchedAt: null, airQualityFetchedAt: null, stale: false, errors: ["Location coordinates are unavailable for this heritage entity."] },
    };
  }

  const cacheKey = `${row.id}:${row.latitude}:${row.longitude}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    // Preserve an honest staleness flag: a cached entry written after a
    // failed refresh stays stale, and data older than the TTL is stale even
    // though a re-cache extended the entry's lifetime.
    const fetchedAt = Date.parse(
      cached.response.meta.weatherFetchedAt || cached.response.meta.generatedAt
    );
    const agedOut = Number.isFinite(fetchedAt) && Date.now() - fetchedAt > CACHE_TTL_MS;
    return {
      ...cached.response,
      meta: { ...cached.response.meta, stale: cached.response.meta.stale || agedOut },
    };
  }
  const response = await loadResponse(row, cached?.response);
  cache.delete(cacheKey);
  // Never cache a weather-less result — a transient provider failure would
  // otherwise poison the cache for a full TTL. Stale (previous) weather is OK.
  if (response.weather) {
    cache.set(cacheKey, { response, expiresAt: Date.now() + CACHE_TTL_MS });
    while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
  }
  return response;
}

export function clearVisitorIntelligenceCache(): void {
  cache.clear();
}
