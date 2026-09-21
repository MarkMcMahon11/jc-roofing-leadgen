import type { QuoteInput, Score, Settings } from "./types";

export function priceRange(input: QuoteInput, area: number, s: Settings) {
  const m = s.materials.find((x) => x.id === input.material)!;
  let base = area * m.ratePerM2;
  if (input.jobType === "repair") base = Math.max(base * 0.25, s.minJobValue * 0.5);
  if (input.propertyType === "tenement") base *= 1.15; // scaffold/access
  if (input.homeAge === "pre-1919") base *= 1.1; // timber repairs, lead work
  if (input.listed === "yes") base *= 1.15;
  base = Math.max(base, s.minJobValue);
  const round = (n: number) => Math.round(n / 100) * 100;
  return { low: round(base * 0.9), high: round(base * 1.2) };
}

export function inServiceArea(postcode: string, s: Settings) {
  const outward = postcode.trim().toUpperCase().split(/\s+/)[0] ?? "";
  const letters = outward.match(/^[A-Z]+/)?.[0] ?? "";
  return s.serviceAreaPrefixes.map((p) => p.toUpperCase()).includes(letters);
}

/** Earliest start = today + backlog weeks (or the owner's manual date). Rounded to a week window. */
export function earliestStart(s: Settings, jobDays: number, now = new Date()) {
  let start: Date;
  if (s.earliestStartManual && new Date(s.earliestStartManual) > now) start = new Date(s.earliestStartManual);
  else {
    start = new Date(now);
    start.setDate(start.getDate() + s.weeksBacklog * 7);
  }
  return start.toISOString().slice(0, 10);
}

export function jobDays(area: number, input: QuoteInput, s: Settings) {
  const m = s.materials.find((x) => x.id === input.material)!;
  return Math.max(1, Math.ceil(area / m.m2PerCrewDay));
}

export function scoreLead(input: QuoteInput, area: number, s: Settings): Score {
  if (!inServiceArea(input.postcode, s)) return "not-a-fit";
  if (input.urgency === "pricing" && input.jobType === "unsure") return "warm";
  if (input.urgency === "urgent" || input.urgency === "3-months") return "hot";
  return "warm";
}
