export type Material = "natural-slate" | "welsh-slate" | "fibre-cement-slate" | "clay-tile" | "concrete-tile";

export interface MaterialOption {
  id: Material;
  label: string;
  blurb: string;
  colours: string[];
  ratePerM2: number; // GBP per m2, fitted
  m2PerCrewDay: number;
}

export interface Settings {
  businessName: string;
  paused: boolean;
  minJobValue: number;
  serviceAreaPrefixes: string[]; // postcode outward prefixes e.g. "G", "EH", "FK"
  earliestStartManual: string; // ISO date, fallback when no calendar
  weeksBacklog: number; // used if no calendar: weeks until crew free
  materials: MaterialOption[];
  ownerPhone: string;
  ownerEmail: string;
}

export interface QuoteInput {
  address: string;
  postcode: string;
  homeAge: "pre-1919" | "1919-1960" | "1960-2000" | "newer";
  propertyType: "tenement" | "semi" | "detached" | "bungalow";
  listed: "yes" | "no" | "unsure";
  jobType: "full" | "repair" | "unsure";
  currentMaterial: string;
  material: Material;
  colour: string;
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
  roofAreaM2: number;
  roofSource: "solar-api" | "estimate";
  low: number;
  high: number;
  earliestStart: string;
  score: Score;
  status: "new" | "contacted" | "quoted" | "won" | "lost";
  inspectionBooked?: string;
}
