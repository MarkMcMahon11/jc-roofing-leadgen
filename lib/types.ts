import type { ServiceId } from "./services";

export type Material = "natural-slate" | "welsh-slate" | "fibre-cement-slate" | "clay-tile" | "concrete-tile";

export interface MaterialOption {
  id: Material;
  label: string;
  blurb: string;
  colours: string[];
  ratePerM2: number; // GBP per m2, fitted
  m2PerCrewDay: number;
}

export interface ServicePrices {
  repairMin: number;
  flatRatePerM2: number;
  flatMin: number;
  gutterCleanFrom: number;
  gutterReplacePerM: number;
  fasciaPerM: number;
  chimneyEach: number;
  chimneyFullExtra: number;
  chimneyAccess: number;
  solarPerKw: number;
}

export interface Settings {
  businessName: string;
  paused: boolean;
  minJobValue: number;
  serviceAreaPrefixes: string[]; // postcode outward prefixes e.g. "G", "EH", "FK"
  earliestStartManual: string; // ISO date, fallback when no calendar
  weeksBacklog: number; // used if no calendar: weeks until crew free (big jobs)
  quickJobWeeks: number; // weeks until crew free for small jobs (repairs, gutters, chimneys)
  prices: ServicePrices; // prices for everything except new pitched roofs
  materials: MaterialOption[];
  ownerPhone: string;
  ownerEmail: string;
}

export interface QuoteInput {
  address: string;
  postcode: string;
  placeId?: string; // set when the customer picked a Google-verified address
  lat?: number;
  lng?: number;
  homeAge: "pre-1919" | "1919-1960" | "1960-2000" | "newer";
  propertyType: "tenement" | "semi" | "detached" | "bungalow";
  listed: "yes" | "no" | "unsure";
  service: ServiceId;
  jobType: "full" | "repair" | "unsure"; // set by the server from the service
  currentMaterial: string;
  material?: Material; // new roofs only
  colour?: string;
  repairIssue?: string;
  flatSize?: string;
  gutterWork?: string;
  chimneys?: string;
  chimneyScope?: string;
  solarSize?: string;
  notes?: string; // "something else" jobs
  urgency: "urgent" | "3-months" | "pricing";
  name: string;
  phone: string;
  email: string;
  consent: boolean;
}

export type Score = "hot" | "warm" | "not-a-fit";

export interface Lead extends QuoteInput {
  id: string;
  createdAt: string;
  roofAreaM2: number; // new roofs only, otherwise 0
  basis: string; // what the estimate assumes, e.g. "about 90 m² (estimated)"
  noPrice?: boolean; // "something else": needs a call or inspection
  roofSource: "solar-api" | "estimate";
  low: number;
  high: number;
  earliestStart: string;
  score: Score;
  status: "new" | "contacted" | "quoted" | "won" | "lost";
  inspectionBooked?: string;
  waitlist?: boolean; // taken while intake was paused
  consentAt: string; // when the customer ticked the consent box
  consentVersion: string; // which consent wording they saw
}
