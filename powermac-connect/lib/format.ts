// Formatting for UK users: GBP, en-GB dates, Europe/London time.
const TZ = "Europe/London";

const gbp = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
const gbp0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", notation: "compact", maximumFractionDigits: 1 });
const num = new Intl.NumberFormat("en-GB");

export function money(v: number | string | null | undefined, opts: { whole?: boolean; compact?: boolean } = {}) {
  if (v === null || v === undefined || v === "") return "-";
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  if (opts.compact && Math.abs(n) >= 10_000) return compact.format(n);
  return (opts.whole ? gbp0 : gbp).format(n);
}

export function count(v: number | null | undefined) {
  return v === null || v === undefined ? "-" : num.format(v);
}

export function pct(v: number | null | undefined, digits = 0) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  return `${v.toFixed(digits)}%`;
}

export function date(v: string | Date | null | undefined) {
  if (!v) return "-";
  const d = typeof v === "string" ? new Date(v.length === 10 ? v + "T12:00:00Z" : v) : v;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
}

export function dateTime(v: string | Date | null | undefined) {
  if (!v) return "-";
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function time(v: string | Date | null | undefined) {
  if (!v) return "-";
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function relative(v: string | Date | null | undefined, now = new Date()) {
  if (!v) return "-";
  const d = typeof v === "string" ? new Date(v) : v;
  const diff = (d.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return date(d);
}

/** Days from today (Europe/London) to a date; negative = in the past. */
export function daysUntil(v: string | null | undefined, now = new Date()) {
  if (!v) return null;
  const today = new Date(now.toLocaleDateString("en-CA", { timeZone: TZ }) + "T00:00:00Z");
  const target = new Date((v.length === 10 ? v : new Date(v).toLocaleDateString("en-CA", { timeZone: TZ })) + "T00:00:00Z");
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Today's date in London as YYYY-MM-DD. */
export function todayISO(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

export function label(key: string | null | undefined) {
  if (!key) return "-";
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** YYYY-MM-DD plus n days. */
export function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
