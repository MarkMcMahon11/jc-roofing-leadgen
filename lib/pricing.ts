import type { QuoteInput, Score, Settings } from "./types";
import type { ServiceId } from "./services";

const niceRound = (n: number) => (n < 1000 ? Math.round(n / 10) * 10 : Math.round(n / 100) * 100);

// Rough quantities when we can't measure: typical gutter run (metres) and cleaning cost factor by property type.
const GUTTER_M: Record<QuoteInput["propertyType"], number> = { tenement: 18, semi: 22, detached: 38, bungalow: 32 };
const CLEAN_FACTOR: Record<QuoteInput["propertyType"], number> = { tenement: 0.9, semi: 1, detached: 1.4, bungalow: 1.2 };
const FLAT_M2: Record<string, number> = { small: 10, medium: 25, large: 45, unsure: 25 };
const REPAIR_RANGE: Record<string, [number, number]> = { slates: [1, 3], leak: [1.4, 4], ridge: [1.6, 5], unsure: [1.2, 4.5] }; // multiples of the smallest repair
const KW: Record<string, number> = { "3": 3, "4": 4, "6": 6, unsure: 4 };

export type Estimate = { low: number; high: number; basis: string };

/** Price range for any service. `roofArea` is only used for new roofs. Returns null when a job needs a look first. */
export function estimate(input: QuoteInput, s: Settings, roofArea: number, source: "solar-api" | "estimate" = "estimate"): Estimate | null {
  const p = s.prices;
  const tenement = input.propertyType === "tenement";
  const listed = input.listed === "yes" ? 1.15 : 1;
  const range = (base: number, lo = 0.9, hi = 1.2) => ({ low: niceRound(base * lo), high: niceRound(base * hi) });

  switch (input.service) {
    case "roof": {
      const m = s.materials.find((x) => x.id === input.material)!;
      let base = roofArea * m.ratePerM2;
      if (tenement) base *= 1.15; // scaffold/access
      if (input.homeAge === "pre-1919") base *= 1.1; // timber repairs, lead work
      base = Math.max(base * listed, s.minJobValue);
      return { ...range(base), basis: `about ${roofArea} m² (${source === "solar-api" ? "measured" : "estimated"})` };
    }
    case "repair": {
      const [a, b] = REPAIR_RANGE[input.repairIssue ?? "unsure"] ?? REPAIR_RANGE.unsure;
      const f = (tenement ? 1.15 : 1) * listed;
      return { low: niceRound(p.repairMin * a * f), high: niceRound(p.repairMin * b * f), basis: "repairs vary, so this is a wide range" };
    }
    case "flat": {
      const m2 = FLAT_M2[input.flatSize ?? "unsure"] ?? 25;
      const base = Math.max(m2 * p.flatRatePerM2 * (tenement ? 1.15 : 1), p.flatMin);
      return { ...range(base), basis: `about ${m2} m² of GRP flat roof` };
    }
    case "gutters": {
      const type = input.propertyType;
      if (input.gutterWork === "clean") return { ...range(p.gutterCleanFrom * CLEAN_FACTOR[type], 0.9, 1.3), basis: "gutter cleaning" };
      const metres = GUTTER_M[type];
      const perM = p.gutterReplacePerM + (input.gutterWork === "replace-fascia" ? p.fasciaPerM : 0);
      return { ...range(metres * perM * (tenement ? 1.3 : 1) * listed), basis: `about ${metres} m of ${input.gutterWork === "replace-fascia" ? "gutter and fascia" : "gutter"}` };
    }
    case "chimney": {
      const n = Number(input.chimneys) || 1;
      const each = p.chimneyEach + (input.chimneyScope === "full" ? p.chimneyFullExtra : 0);
      const base = (n * each + p.chimneyAccess) * (input.homeAge === "pre-1919" ? 1.1 : 1) * listed * (tenement ? 1.1 : 1);
      return { ...range(base, 0.9, 1.25), basis: `${n === 3 ? "3 or more" : n} chimney${n === 1 ? "" : "s"}` };
    }
    case "solar": {
      const kw = KW[input.solarSize ?? "unsure"] ?? 4;
      return { ...range(kw * p.solarPerKw, 0.85, 1.25), basis: `about ${kw} kW (around ${Math.round(kw * 2.5)} panels)` };
    }
    default:
      return null; // "something else"
  }
}

export function inServiceArea(postcode: string, s: Settings) {
  const outward = postcode.trim().toUpperCase().split(/\s+/)[0] ?? "";
  const letters = outward.match(/^[A-Z]+/)?.[0] ?? "";
  return s.serviceAreaPrefixes.map((p) => p.toUpperCase()).includes(letters);
}

/** Small jobs use the shorter waiting time; new roofs, flat roofs and solar use the main backlog. */
export const weeksFor = (service: ServiceId, s: Settings) => (["repair", "gutters", "chimney"].includes(service) ? s.quickJobWeeks : s.weeksBacklog);

/** Earliest start = today + weeks (or the owner's fixed date, if it is still in the future). */
export function earliestStart(s: Settings, weeks: number, now = new Date()) {
  let start: Date;
  if (s.earliestStartManual && new Date(s.earliestStartManual) > now) start = new Date(s.earliestStartManual);
  else {
    start = new Date(now);
    start.setDate(start.getDate() + weeks * 7);
  }
  return start.toISOString().slice(0, 10);
}

export function scoreLead(input: QuoteInput, s: Settings): Score {
  if (!inServiceArea(input.postcode, s)) return "not-a-fit";
  if (input.urgency === "urgent" || input.urgency === "3-months") return "hot";
  return "warm";
}
