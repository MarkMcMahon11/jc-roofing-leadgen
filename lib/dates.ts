// Dates for people in the UK. Bookings are stored as naive London local time, "YYYY-MM-DDTHH:MM:SS".
const LONDON = "Europe/London";

/** "2026-09-23T10:30:00" -> "Wednesday 23 September at 10:30" (no timezone maths: the string is already London time). */
export function fmtSlot(when: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(when);
  if (!m) return when;
  const day = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return `${day} at ${m[4]}:${m[5]}`;
}

/** "2026-11-16" -> "November 2026" */
export function fmtMonth(isoDate: string) {
  const d = new Date(isoDate);
  return Number.isNaN(d.getTime()) ? isoDate : d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Any absolute time (Date or ISO string with zone) -> naive London local "YYYY-MM-DDTHH:MM:SS". */
export function toLondonNaive(input: Date | string): string | null {
  const d = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Current London wall-clock time (plus optional offset) as "YYYY-MM-DDTHH:MM". */
export function londonNow(offsetMinutes = 0) {
  return toLondonNaive(new Date(Date.now() + offsetMinutes * 60_000))!.slice(0, 16);
}

/** Strict real-calendar-date check for "YYYY-MM-DD" (rejects 2026-13-01, 2026-02-30, arrays, etc.). */
export function isRealDay(day: unknown): day is string {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}
export const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
