// Europe/London wall-clock <-> UTC conversions for date/time inputs (works on server and client).
const TZ = "Europe/London";

const partsFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function londonParts(ts: number) {
  const parts = partsFmt.formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute") };
}

/** Minutes London is ahead of UTC at the given instant (0 in winter, 60 in summer). */
function offsetMinutes(ts: number) {
  const p = londonParts(ts);
  return Math.round((Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(ts / 60000) * 60000) / 60000);
}

/** "2026-11-13" + "08:30" (London) -> ISO UTC string. */
export function londonToISO(date: string, time = "00:00") {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hh || 0, mm || 0);
  const first = guess - offsetMinutes(guess) * 60000;
  // re-check at the corrected instant (handles the hours around a clock change)
  return new Date(guess - offsetMinutes(first) * 60000).toISOString();
}

/** ISO -> "YYYY-MM-DDTHH:MM" in London, for <input type="datetime-local">. */
export function isoToLondonInput(iso: string | null | undefined) {
  if (!iso) return "";
  const p = londonParts(new Date(iso).getTime());
  const z = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${z(p.m)}-${z(p.d)}T${z(p.h)}:${z(p.min)}`;
}

/** "YYYY-MM-DDTHH:MM" (London wall clock) -> ISO UTC. */
export function londonInputToISO(value: string) {
  const [date, time] = value.split("T");
  return londonToISO(date!, time ?? "00:00");
}

/** ISO -> "YYYY-MM-DD" in London. */
export function isoToLondonDate(iso: string | null | undefined) {
  return isoToLondonInput(iso).slice(0, 10);
}

/** ISO -> "HH:MM" in London. */
export function isoToLondonTime(iso: string | null | undefined) {
  return isoToLondonInput(iso).slice(11, 16);
}
