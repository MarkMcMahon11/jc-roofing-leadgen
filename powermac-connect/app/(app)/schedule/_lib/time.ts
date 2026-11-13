// Europe/London wall-clock helpers for the planner. Pure functions: safe on the server and
// in the browser (they never depend on the machine's own time zone).
//
// The database stores timestamptz (UTC instants). The planner works in London wall-clock
// time: "Monday 08:00" means 08:00 GMT in winter and 08:00 BST (07:00 UTC) in summer.

export const TZ = "Europe/London";
export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function londonFields(ms: number) {
  const p: Record<string, string> = {};
  for (const part of partsFmt.formatToParts(new Date(ms))) p[part.type] = part.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

/** London's offset from UTC in minutes at an instant (0 in GMT, 60 in BST). */
export function londonOffset(ms: number): number {
  const f = londonFields(ms);
  const asUtc = Date.UTC(f.y, f.m - 1, f.d, f.h, f.mi, f.s);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

/**
 * A London wall-clock time (date + minutes after midnight) as a UTC ISO string.
 * Correct across the clock changes: a non-existent spring-forward time (01:30 on the last
 * Sunday of March) moves forward an hour; an ambiguous autumn time resolves to GMT.
 */
export function londonToUtc(date: string, minutes = 0): string {
  return new Date(londonToMs(date, minutes)).toISOString();
}

export function londonToMs(date: string, minutes = 0): number {
  const [y, m, d] = date.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  const first = naive - londonOffset(naive) * 60_000;
  return naive - londonOffset(first) * 60_000;
}

/** The London date (YYYY-MM-DD) and minutes after London midnight of an instant. */
export function londonParts(v: string | number): { date: string; minutes: number } {
  const ms = typeof v === "number" ? v : Date.parse(v);
  const f = londonFields(ms);
  return { date: `${f.y}-${pad(f.m)}-${pad(f.d)}`, minutes: f.h * 60 + f.mi };
}

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** "08:30" from minutes after midnight. */
export function hhmm(minutes: number) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** "08:30" London time of an instant. */
export function clock(v: string | number) {
  return hhmm(londonParts(v).minutes);
}

/** "08:30" -> 510 */
export function parseHHMM(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/* ---------------------------------------------------------------- plain dates (YYYY-MM-DD) */
export function isISODate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function addDays(date: string, n: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday ... 6 = Sunday */
export function weekdayIndex(date: string) {
  return (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
}

export function dayKey(date: string): DayKey {
  return DAY_KEYS[weekdayIndex(date)];
}

export function mondayOf(date: string) {
  return addDays(date, -weekdayIndex(date));
}

export function todayLondon(now = Date.now()) {
  return londonParts(now).date;
}

/** Start and end (ms) of a London calendar day: 23, 24 or 25 hours long. */
export function dayBounds(date: string) {
  return { start: londonToMs(date, 0), end: londonToMs(addDays(date, 1), 0) };
}

const noon = (date: string) => new Date(date + "T12:00:00Z");
export function fmtDay(date: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return noon(date).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

/** "9 – 15 Nov 2026" */
export function fmtRange(from: string, to: string) {
  const a = noon(from), b = noon(to);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  const left = a.toLocaleDateString("en-GB", { day: "numeric", ...(sameMonth ? {} : { month: "short" }), timeZone: "UTC" });
  const right = b.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${left} – ${right}`;
}

/** "Mon 16 Nov, 08:00–14:00" (or with both dates when it spans days) */
export function fmtSlot(start: string, end: string) {
  const s = londonParts(start), e = londonParts(end);
  if (s.date === e.date || (e.minutes === 0 && addDays(s.date, 1) === e.date)) {
    return `${fmtDay(s.date)}, ${hhmm(s.minutes)}–${e.minutes === 0 && e.date !== s.date ? "24:00" : hhmm(e.minutes)}`;
  }
  return `${fmtDay(s.date)} ${hhmm(s.minutes)} – ${fmtDay(e.date)} ${hhmm(e.minutes)}`;
}

/** Value for <input type="datetime-local"> in London time. */
export function toLocalInput(iso: string) {
  const p = londonParts(iso);
  return `${p.date}T${hhmm(p.minutes)}`;
}

/** Parse a datetime-local value as London wall-clock time. */
export function fromLocalInput(v: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(v);
  if (!m || !isISODate(m[1])) return null;
  const min = parseHHMM(m[2]);
  return min === null ? null : londonToUtc(m[1], min);
}
