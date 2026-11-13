// Europe/London wall-clock helpers shared by server and client code.
// Inputs from <input type="date|time|datetime-local"> are London local time; the database
// stores UTC instants. These helpers convert between the two, DST included.

export const TZ = "Europe/London";

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

export function londonParts(d: Date) {
  const p: Record<string, string> = {};
  for (const x of partsFmt.formatToParts(d)) p[x.type] = x.value;
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}

function offsetMs(d: Date) {
  const p = londonParts(d);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" in London -> UTC instant. */
export function fromLondon(local: string | null | undefined): Date | null {
  if (!local) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(local.trim());
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  let t = guess - offsetMs(new Date(guess));
  t = guess - offsetMs(new Date(t));
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** UTC instant -> "YYYY-MM-DDTHH:mm" (London) for datetime-local inputs. */
export function toLondonInput(v: string | Date | null | undefined): string {
  if (!v) return "";
  const d = typeof v === "string" ? new Date(v) : v;
  if (Number.isNaN(d.getTime())) return "";
  const p = londonParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** UTC instant -> "YYYY-MM-DD" (London). */
export function londonDate(v: string | Date | null | undefined = new Date()): string {
  if (!v) return "";
  return toLondonInput(v).slice(0, 10);
}

/** UTC instant -> "HH:mm" (London). */
export function londonTime(v: string | Date | null | undefined): string {
  if (!v) return "";
  return toLondonInput(v).slice(11, 16);
}

/** Add whole days to a "YYYY-MM-DD" string (calendar arithmetic, no time zone involved). */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Day of week for a "YYYY-MM-DD" string, Monday = 0. */
export function weekdayIndex(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** Start (inclusive) and end (exclusive) of a London calendar day as UTC ISO strings. */
export function londonDayBounds(day: string): { start: string; end: string } {
  return { start: fromLondon(day)!.toISOString(), end: fromLondon(addDays(day, 1))!.toISOString() };
}

/** Human countdown such as "2d 4h", "3h 20m" or "12m". */
export function durationLabel(ms: number): string {
  const mins = Math.round(Math.abs(ms) / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
