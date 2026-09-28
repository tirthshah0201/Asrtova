/* ============================================================
   Astrova — Heritage operating hours + current situation (Phase 37)

   Pure, timezone-aware schedule logic plus the database access layer.

   Honesty rules enforced here (Phase 37 Parts C, D and X):
     * No schedule rows            -> INFORMATION UNAVAILABLE
     * schedule_status = CONFLICT  -> INFORMATION UNAVAILABLE + conflict flag
                                      (labelled "Hours in conflict — requires review")
     * Demo rows are always labelled DEMO — never presented as verified
     * An opening time is NEVER inferred from missing data
   ============================================================ */

import { query } from "../database";

/* ---- Types ---- */

/** 0 = Sunday … 6 = Saturday (PostgreSQL EXTRACT(DOW) semantics). */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export type SituationStatus =
  | "OPEN"
  | "CLOSED"
  | "CLOSING_SOON"
  | "OPENING_SOON"
  | "OPEN_24_HOURS"
  | "CLOSED_TODAY"
  | "INFORMATION_UNAVAILABLE";

/** Origin vocabulary used across the platform (Phase 36/37). */
export type DataOrigin = "VERIFIED" | "DEMO" | "CONFLICT" | "ASTROVA_ESTIMATE" | "NONE";

/** How the schedule as a whole is classified. */
export type ScheduleStatus = "VERIFIED" | "DEMO" | "CONFLICT" | "ASTROVA_ESTIMATE";

export interface HourRow {
  [key: string]: unknown;
  id: string;
  day_of_week: DayOfWeek;
  /** "HH:MM:SS" or null */
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
  is_24_hours: boolean;
  special_note: string | null;
  source_url: string | null;
  source_type: string;
  schedule_status: ScheduleStatus;
  verification_status: "UNVERIFIED" | "REVIEWED" | "VERIFIED";
}

export interface ZonedNow {
  timezone: string;
  /** YYYY-MM-DD in the target timezone */
  date: string;
  dayOfWeek: DayOfWeek;
  /** minutes since local midnight */
  minutes: number;
  /** HH:MM local */
  label: string;
}

export interface DaySchedule {
  dayOfWeek: DayOfWeek;
  dayName: string;
  open: string | null;
  close: string | null;
  isClosed: boolean;
  is24Hours: boolean;
}

export interface NextChange {
  kind: "opens" | "closes";
  dayOffset: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** HH:MM local time */
  at: string;
  /** HH:MM on the following day when it crosses midnight */
  onDate: string;
  inMinutes: number;
}

export interface Situation {
  status: SituationStatus;
  label: string;
  reason: string;
  timezone: string;
  localTime: string;
  localDate: string;
  today: DaySchedule | null;
  nextChange: NextChange | null;
  dataOrigin: DataOrigin;
  conflict: boolean;
  reviewLabel: string | null;
  source: { type: string; url: string | null; verificationStatus: string } | null;
  scheduleStatus: ScheduleStatus | "NONE";
}

/* ---- Time helpers ---- */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export function toMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function toLabel(minutes: number): string {
  const normalized = ((Math.floor(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** True when a schedule window runs past midnight (close < open). */
export function crossesMidnight(open: number, close: number): boolean {
  return close < open;
}

/**
 * Current wall-clock parts for a timezone, without depending on the
 * server's own timezone (Phase 37 Part D).
 */
export function zonedNow(now: Date, timeZone: string = DEFAULT_TIMEZONE): ZonedNow {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
  } catch {
    tz = DEFAULT_TIMEZONE; // unknown/unsupported zone -> platform default
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, DayOfWeek> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  // hourCycle h23 normally yields 00-23; guard against "24" anyway.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  const day = Number(get("day"));
  const month = Number(get("month"));
  const year = Number(get("year"));

  return {
    timezone: tz,
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    dayOfWeek: weekdayMap[get("weekday")] ?? 0,
    minutes: hour * 60 + minute,
    label: toLabel(hour * 60 + minute),
  };
}

/** Add N days to a YYYY-MM-DD string (timezone-independent string math). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}

/* ---- Validation (used by admin writes + tests) ---- */

export interface ScheduleInput {
  dayOfWeek: number;
  openTime?: string | null;
  closeTime?: string | null;
  isClosed?: boolean;
  is24Hours?: boolean;
}

export function validateSchedule(input: ScheduleInput): string | null {
  const day = input.dayOfWeek;
  if (!Number.isInteger(day) || day < 0 || day > 6) return "dayOfWeek must be 0–6 (0 = Sunday)";
  const isClosed = Boolean(input.isClosed);
  const is24 = Boolean(input.is24Hours);
  if (isClosed && is24) return "a day cannot be both closed and 24 hours";
  const open = input.openTime ?? null;
  const close = input.closeTime ?? null;

  if (isClosed) {
    if (open || close) return "a closed day must not carry opening times";
    return null;
  }
  if (is24) {
    if (open || close) return "a 24-hour day must not carry opening times";
    return null;
  }
  if (!open) return "openTime is required unless the day is closed or 24 hours";
  const openMin = toMinutes(open);
  const closeMin = close ? toMinutes(close) : null;
  if (openMin === null) return "openTime must be HH:MM or HH:MM:SS";
  if (close !== null && closeMin === null) return "closeTime must be HH:MM or HH:MM:SS";
  if (closeMin !== null && openMin === closeMin) {
    return "openTime and closeTime must differ (use is24Hours for round-the-clock)";
  }
  return null;
}

/* ---- Situation calculation (pure) ---- */

const CLOSING_SOON_MINUTES = 60;
const OPENING_SOON_MINUTES = 60;

function originFor(rows: HourRow[]): { origin: DataOrigin; conflict: boolean } {
  if (rows.length === 0) return { origin: "NONE", conflict: false };
  const conflict = rows.some((r) => r.schedule_status === "CONFLICT");
  if (conflict) return { origin: "CONFLICT", conflict: true };
  if (rows.every((r) => r.schedule_status === "VERIFIED" && r.verification_status === "VERIFIED")) {
    return { origin: "VERIFIED", conflict: false };
  }
  if (rows.some((r) => r.schedule_status === "DEMO")) return { origin: "DEMO", conflict: false };
  if (rows.some((r) => r.schedule_status === "ASTROVA_ESTIMATE")) {
    return { origin: "ASTROVA_ESTIMATE", conflict: false };
  }
  return { origin: "DEMO", conflict: false };
}

function unavailable(reason: string, rows: HourRow[], z: ZonedNow): Situation {
  const { origin, conflict } = originFor(rows);
  const first = rows[0] ?? null;
  return {
    status: "INFORMATION_UNAVAILABLE",
    label: conflict ? "Hours in conflict — requires review" : "Current status unavailable",
    reason,
    timezone: z.timezone,
    localTime: z.label,
    localDate: z.date,
    today: null,
    nextChange: null,
    dataOrigin: origin,
    conflict,
    reviewLabel: conflict ? "CONFLICT — REQUIRES REVIEW" : null,
    source: first
      ? { type: first.source_type, url: first.source_url, verificationStatus: first.verification_status }
      : null,
    scheduleStatus: first ? first.schedule_status : "NONE",
  };
}

function todaySchedule(row: HourRow | undefined, z: ZonedNow): DaySchedule | null {
  if (!row) return null;
  return {
    dayOfWeek: row.day_of_week,
    dayName: DAY_NAMES[row.day_of_week],
    open: row.is_closed || row.is_24_hours ? null : toLabel(toMinutes(row.open_time) ?? 0),
    close: row.is_closed || row.is_24_hours ? null : toLabel(toMinutes(row.close_time) ?? 0),
    isClosed: row.is_closed,
    is24Hours: row.is_24_hours,
  };
}

function findNextOpening(
  rowsByDay: Map<number, HourRow>,
  z: ZonedNow
): { at: string; dayOffset: number; onDate: string; inMinutes: number } | null {
  for (let offset = 0; offset <= 7; offset += 1) {
    const dow = (z.dayOfWeek + offset) % 7;
    const row = rowsByDay.get(dow);
    if (!row || row.is_closed) continue;
    if (row.is_24_hours) {
      const inMinutes = offset * 1440 - z.minutes;
      if (inMinutes <= 0) continue;
      return { at: "00:00", dayOffset: offset, onDate: addDays(z.date, offset), inMinutes };
    }
    const openMin = toMinutes(row.open_time);
    if (openMin === null) continue;
    const inMinutes = offset * 1440 + openMin - z.minutes;
    if (inMinutes <= 0) continue; // already opened (or window still running)
    return {
      at: toLabel(openMin),
      dayOffset: offset,
      onDate: addDays(z.date, offset),
      inMinutes,
    };
  }
  return null;
}

/**
 * Compute the current situation from schedule rows + local wall clock.
 * `rows` must already be filtered to the entity and effective date.
 */
export function computeSituation(rows: HourRow[], z: ZonedNow): Situation {
  const { origin, conflict } = originFor(rows);
  const source = rows[0]
    ? { type: rows[0].source_type, url: rows[0].source_url, verificationStatus: rows[0].verification_status }
    : null;
  const scheduleStatus = rows[0]?.schedule_status ?? "NONE";

  const base = {
    timezone: z.timezone,
    localTime: z.label,
    localDate: z.date,
    dataOrigin: origin,
    conflict,
    reviewLabel: conflict ? "CONFLICT — REQUIRES REVIEW" : null,
    source,
    scheduleStatus,
  };

  if (rows.length === 0) {
    return {
      ...base,
      status: "INFORMATION_UNAVAILABLE",
      label: "Current status unavailable",
      reason:
        "No operating-hours schedule exists for this heritage site, so Astrova does not claim an open or closed status.",
      today: null,
      nextChange: null,
    };
  }

  if (conflict) {
    return {
      ...base,
      status: "INFORMATION_UNAVAILABLE",
      label: "Hours in conflict — requires review",
      reason:
        "Sources disagree about this site's opening hours, so no open or closed status is shown until a reviewer resolves the conflict.",
      today: null,
      nextChange: null,
    };
  }

  const rowsByDay = new Map<number, HourRow>();
  for (const r of rows) rowsByDay.set(r.day_of_week, r);

  const todayRow = rowsByDay.get(z.dayOfWeek);
  const today = todaySchedule(todayRow, z);

  if (!todayRow) {
    const next = findNextOpening(rowsByDay, z);
    return {
      ...base,
      status: "INFORMATION_UNAVAILABLE",
      label: "Current status unavailable",
      reason: "No schedule entry exists for today, so no open or closed status is shown.",
      today: null,
      nextChange: next
        ? {
            kind: "opens",
            dayOffset: next.dayOffset as NextChange["dayOffset"],
            at: next.at,
            onDate: next.onDate,
            inMinutes: next.inMinutes,
          }
        : null,
    };
  }

  if (todayRow.is_closed) {
    const next = findNextOpening(rowsByDay, z);
    return {
      ...base,
      status: "CLOSED_TODAY",
      label: "Closed today",
      reason: next
        ? `Closed ${DAY_NAMES[z.dayOfWeek]}. Opens ${
            next.dayOffset === 0
              ? "later today"
              : `on ${DAY_NAMES[(z.dayOfWeek + next.dayOffset) % 7]}`
          } at ${next.at}.`
        : `Closed ${DAY_NAMES[z.dayOfWeek]}. No further opening time is scheduled.`,
      today,
      nextChange: next
        ? {
            kind: "opens",
            dayOffset: next.dayOffset as NextChange["dayOffset"],
            at: next.at,
            onDate: next.onDate,
            inMinutes: next.inMinutes,
          }
        : null,
    };
  }

  if (todayRow.is_24_hours) {
    return {
      ...base,
      status: "OPEN_24_HOURS",
      label: "Open 24 hours",
      reason: "This site is listed as accessible around the clock today.",
      today,
      nextChange: null,
    };
  }

  const openMin = toMinutes(todayRow.open_time);
  const closeMin = toMinutes(todayRow.close_time);
  if (openMin === null || closeMin === null) {
    return unavailable(
      "The stored schedule is incomplete, so no status is derived from it.",
      rows,
      z
    );
  }

  const now = z.minutes;
  const overnight = crossesMidnight(openMin, closeMin);

  /** Is the window that started most recently still running? */
  const openNow = overnight
    ? now >= openMin || now < closeMin
    : now >= openMin && now < closeMin;

  if (openNow) {
    // Closing time (may land tomorrow for overnight windows).
    let closesAt: number = closeMin;
    let dayOffset: 0 | 1 = 0;
    if (overnight && now >= openMin) {
      closesAt = closeMin + 1440;
      dayOffset = 1;
    } else if (overnight && now < closeMin) {
      closesAt = closeMin;
      dayOffset = 0;
    }
    const inMinutes = closesAt - now;
    const closingSoon = inMinutes <= CLOSING_SOON_MINUTES;
    return {
      ...base,
      status: closingSoon ? "CLOSING_SOON" : "OPEN",
      label: closingSoon ? "Closing soon" : "Open",
      reason: closingSoon
        ? `Closes in approximately ${formatDuration(inMinutes)}.`
        : `Closes in approximately ${formatDuration(inMinutes)} (today ${toLabel(openMin)}–${toLabel(closeMin)}).`,
      today,
      nextChange: {
        kind: "closes",
        dayOffset: dayOffset === 1 ? 1 : 0,
        at: toLabel(closeMin),
        onDate: addDays(z.date, dayOffset),
        inMinutes,
      },
    };
  }

  // Not open right now.
  if (!overnight && now < openMin) {
    const inMinutes = openMin - now;
    const openingSoon = inMinutes <= OPENING_SOON_MINUTES;
    return {
      ...base,
      status: openingSoon ? "OPENING_SOON" : "CLOSED",
      label: openingSoon ? "Opening soon" : "Closed",
      reason: openingSoon
        ? `Opens in approximately ${formatDuration(inMinutes)} (today at ${toLabel(openMin)}).`
        : `Opens today at ${toLabel(openMin)}.`,
      today,
      nextChange: {
        kind: "opens",
        dayOffset: 0,
        at: toLabel(openMin),
        onDate: z.date,
        inMinutes,
      },
    };
  }

  // Overnight window that has not started yet today, or the window has ended.
  const next = findNextOpening(rowsByDay, z);
  if (overnight && now >= closeMin && now < openMin) {
    // Between close (yesterday's tail) and today's opening.
    const inMinutes = openMin - now;
    const openingSoon = inMinutes <= OPENING_SOON_MINUTES;
    return {
      ...base,
      status: openingSoon ? "OPENING_SOON" : "CLOSED",
      label: openingSoon ? "Opening soon" : "Closed",
      reason: openingSoon
        ? `Opens in approximately ${formatDuration(inMinutes)} (today at ${toLabel(openMin)}).`
        : `Opens today at ${toLabel(openMin)}.`,
      today,
      nextChange: {
        kind: "opens",
        dayOffset: 0,
        at: toLabel(openMin),
        onDate: z.date,
        inMinutes,
      },
    };
  }

  return {
    ...base,
    status: "CLOSED",
    label: "Closed",
    reason: next
      ? next.dayOffset <= 0
        ? `Opens today at ${next.at}.`
        : `Opens ${next.dayOffset === 1 ? "tomorrow" : DAY_NAMES[(z.dayOfWeek + next.dayOffset) % 7]} at ${next.at}.`
      : "Closed. No further opening time is scheduled.",
    today,
    nextChange: next
      ? {
          kind: "opens",
          dayOffset: next.dayOffset as NextChange["dayOffset"],
          at: next.at,
          onDate: next.onDate,
          inMinutes: next.inMinutes,
        }
      : null,
  };
}

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Human label for a provenance source_type (shared by all Phase 37 surfaces). */
const SOURCE_LABELS: Record<string, string> = {
  DEMO: "Astrova demo dataset",
  ASTROVA_DERIVED: "Astrova derived",
  OPEN_DATASET: "Open dataset",
  OFFICIAL: "Official source",
  GOVERNMENT: "Government source",
  UNESCO: "UNESCO",
  ASI: "Archaeological Survey of India",
  TOURISM: "State tourism board",
  ACADEMIC: "Academic source",
  MUSEUM: "Museum",
  ARCHIVE: "Archive",
  NEWS: "News source",
  CULTURAL_INSTITUTION: "Cultural institution",
  OTHER: "Other source",
};

export function sourceTypeLabel(type: string | null | undefined): string {
  if (!type) return "Unspecified source";
  return SOURCE_LABELS[type] || type;
}

/* ---- Database access ---- */

export async function getEntityTimezone(entityId: string): Promise<string> {
  const { rows } = await query<{ timezone: string | null }>(
    `SELECT l.timezone AS timezone
       FROM heritage_entities he
       LEFT JOIN locations l ON he.location_id = l.id
      WHERE he.id = $1`,
    [entityId]
  );
  return rows[0]?.timezone || DEFAULT_TIMEZONE;
}

/**
 * Schedule rows for one entity, respecting effective dating for the
 * entity's local calendar date.
 */
export async function getScheduleRows(
  entityId: string,
  timeZone: string,
  now: Date = new Date()
): Promise<HourRow[]> {
  const z = zonedNow(now, timeZone);
  const { rows } = await query<HourRow>(
    `SELECT id, day_of_week, open_time::text AS open_time, close_time::text AS close_time,
            is_closed, is_24_hours, special_note, source_url, source_type,
            schedule_status, verification_status
       FROM heritage_operating_hours
      WHERE heritage_id = $1
        AND (effective_from IS NULL OR effective_from <= $2::date)
        AND (effective_until IS NULL OR effective_until >= $2::date)
      ORDER BY day_of_week`,
    [entityId, z.date]
  );
  return rows;
}

export async function getScheduleForEntity(
  entityId: string,
  now: Date = new Date()
): Promise<{ timezone: string; rows: HourRow[]; situation: Situation }> {
  const timezone = await getEntityTimezone(entityId);
  const rows = await getScheduleRows(entityId, timezone, now);
  const situation = computeSituation(rows, zonedNow(now, timezone));
  return { timezone, rows, situation };
}

export async function entityExists(entityId: string): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM heritage_entities WHERE id = $1`,
    [entityId]
  );
  return rows.length > 0;
}
