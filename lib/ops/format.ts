// Dates are "YYYY-MM-DD" calendar days in UK time. Money is GBP.

const DAY = 86_400_000;
export const TZ = "Europe/London";

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

let ukFmt: Intl.DateTimeFormat | null = null;
/** The UK calendar day for an instant, whatever timezone the device or server runs in. */
export function ukDate(at: Date | string = new Date()): string {
  ukFmt ??= new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return ukFmt.format(new Date(at));
}

export const today = () => ukDate();

export function addDays(s: string, n: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY);
}

export function addMonths(s: string, n: number): string {
  const [y, m, day] = s.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1 + n, 1);
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  dt.setDate(Math.min(day, last));
  return toISODate(dt);
}

/** Monday of the week containing `s`. */
export function weekStart(s: string): string {
  const d = parseDate(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISODate(d);
}

export const monthKey = (s: string) => s.slice(0, 7);

/** Round to whole pence without floating-point surprises (1.005 -> 1.01). */
export const pence = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** True for the last `days` days up to and including today (not the future). */
export const inLastDays = (date: string, days: number, t = today()) => date >= addDays(t, -(days - 1)) && date <= t;

export function gbp(n: number, compact = false): string {
  n = pence(n) || 0;
  if (compact && Math.abs(n) >= 10_000) return (n < 0 ? "-£" : "£") + (Math.abs(n) / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1 }) + "k";
  const cents = n % 1 !== 0;
  return n.toLocaleString("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
}

export const num = (n: number) => n.toLocaleString("en-GB");
export const pct = (n: number) => (n * 100).toLocaleString("en-GB", { maximumFractionDigits: 0 }) + "%";

export function fmtDate(s?: string): string {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function fmtShort(s: string): string {
  const [, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mon 6 Oct" (built by hand so every browser and server prints the same thing). */
export function fmtDay(s: string): string {
  const d = parseDate(s);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function fmtMonth(key: string): string {
  return MONTHS[Number(key.slice(5, 7)) - 1] ?? key;
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function relDays(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export function uid(prefix: string): string {
  return prefix + "-" + Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 5);
}

/** Pence-safe sum. */
export const sum = (xs: number[]) => pence(xs.reduce((a, b) => a + b, 0));

/** Inclusive list of days between two dates (capped, so a bad end date can't hang the page). */
export function eachDay(from: string, to: string, cap = 60): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < cap; d = addDays(d, 1)) out.push(d);
  return out;
}
