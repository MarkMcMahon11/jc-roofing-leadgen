// Privacy & legal: the single source of truth for the pop-up, the /legal page, the owner agreement and the records.
// Plain editable constants. Bump LEGAL_VERSION whenever the wording changes: everyone sees the pop-up again.
// Kept free of imports so it can be used on the server, in the browser and in plain Node tests.

export const LEGAL_VERSION = "2026-10-11";

/** The app operator (supplies and runs this app for JC Roofing). Placeholders in [brackets] are for Mark to fill in. */
export const OPERATOR = {
  name: "Mark McMahon",
  company: "[Company name to be confirmed]",
  email: "[privacy contact email]",
  dpo: "[Data Protection Officer name]",
};

/** The business that uses the app and decides what happens to homeowners' data (the controller). */
export const CLIENT_COMPANY = "JC Roofing Dumfries";

export const LAW = {
  name: "UK GDPR and the Data Protection Act 2018",
  regulator: "Information Commissioner's Office (ICO)",
  regulatorUrl: "https://ico.org.uk",
  complainUrl: "https://ico.org.uk/make-a-complaint/",
};

export const DATA_WE_HOLD = [
  "Homeowners: your name, mobile number, email and the property address.",
  "About the job: what you need, your answers about the roof, and any photos you choose to add.",
  "Your inspection booking, and the messages we send you about this quote.",
  "Your privacy choices: which boxes you ticked, when, and which version of this wording you saw.",
  "JC Roofing's team: the owner's sign-in and their acceptance of the service agreement.",
];

export const WHY = [
  "To give you a guide price, contact you about it and arrange a free inspection (taking steps at your request before a contract).",
  "To keep records of the work and the agreement (legitimate interests and legal obligations, e.g. tax records).",
  "Only if you opt in: an AI read of your roof photos to suggest the job, and occasional offers and seasonal roof-check reminders (consent; you can withdraw it at any time).",
  "To keep the form safe from misuse, we briefly note your internet address (legitimate interests).",
];

export const WHERE_STORED = "Our database and photo storage are in London, UK (Supabase). The website is hosted by Vercel. If you opt in to the AI photo read, the photo is sent to Anthropic in the USA under UK-approved safeguards (the UK International Data Transfer Addendum).";

export const RETENTION = "Enquiries that don't lead to an inspection or a job are deleted after 6 months; other customer records after 24 months from last contact. Photos and messages go with them.";

export const SUBPROCESSORS: { name: string; purpose: string; location: string; status?: "planned" }[] = [
  { name: "Vercel", purpose: "Website hosting", location: "Global edge network (EU/UK and USA)" },
  { name: "Supabase", purpose: "Database and photo storage", location: "London, UK" },
  { name: "Anthropic", purpose: "Optional AI read of roof photos (only if you opt in)", location: "USA" },
  { name: "SMS / WhatsApp provider", purpose: "Alerts to the owner about new enquiries", location: "To be confirmed", status: "planned" },
  { name: "Google Maps (address lookup)", purpose: "Address search and roof measurement, once licensed", location: "USA / global", status: "planned" },
];

export const RIGHTS = [
  "See the information we hold about you and get a copy of it.",
  "Have it corrected if it's wrong, or deleted.",
  "Object to, or ask us to limit, how we use it.",
  "Withdraw any consent at any time (it doesn't affect what was done before).",
  "Complain to the Information Commissioner's Office (ICO) if you're unhappy with how we handle it.",
];

export const NEVER_SOLD = "We never sell your information, and we never use it for anything you haven't agreed to.";

export type Role = "homeowner" | "owner";
export type Consent = { id: string; label: string; required: boolean; roles?: Role[] };

export const CONSENTS: Consent[] = [
  { id: "privacy", label: "I've read the privacy notice.", required: true },
  { id: "contact", label: "Contact me about this quote (call, text or email).", required: true, roles: ["homeowner"] },
  { id: "aiPhotos", label: "Let AI read my roof photos to suggest the job.", required: false, roles: ["homeowner"] },
  { id: "marketing", label: "Occasional offers and seasonal roof-check reminders.", required: false, roles: ["homeowner"] },
];

/** Owner/manager only: accepting the Service Agreement and Data Processing Agreement on behalf of the business. */
export const AGREEMENT_ID = "agreement";
export const agreementLabel = (company = CLIENT_COMPANY, version = LEGAL_VERSION) =>
  `On behalf of ${company}, I accept the Service Agreement and Data Processing Agreement (version ${version}).`;

export const AGREEMENT_POINTS = [
  "JC Roofing is the controller of homeowners' data; the app operator processes it only on JC Roofing's written instructions.",
  "The operator keeps the data confidential, secured (encrypted in transit, private photo storage, signed-in owner area) and in the UK where possible.",
  "Sub-processors are listed on this page; JC Roofing is told before any new one is added and may object.",
  "The operator helps JC Roofing answer homeowners' rights requests and reports any personal data breach without undue delay.",
  "At the end of the service the data is returned or deleted, as JC Roofing chooses.",
  "The app gives guide prices only; JC Roofing confirms every price after a free inspection.",
];

export const TERMS = [
  "Prices shown are guide prices, not a quote. Your final quote follows a free inspection.",
  "Please give accurate details; we'll use them to contact you about this quote.",
  "Any AI read of your photos is a rough suggestion only and is checked by a person at the inspection.",
  "Don't misuse the form (e.g. other people's details or automated requests).",
  "JC Roofing Dumfries provides the roofing work; this app just helps you get a price and book a visit.",
];

export const STORAGE_KEY = "jc-roofing-legal-accepted";
export const DRAFT_NOTE = "Draft wording — final legal text to be confirmed before go-live.";

export type Consents = Record<string, boolean>;
export type Acceptance = { version: string; at: string; consents: Consents };

export const consentsFor = (role: Role) => CONSENTS.filter((c) => !c.roles || c.roles.includes(role));

/** Starting state for the checkboxes: everything unticked (optional consents default OFF). */
export const defaultConsents = (role: Role = "homeowner"): Consents => {
  const out: Consents = {};
  for (const c of consentsFor(role)) out[c.id] = false;
  if (role === "owner") out[AGREEMENT_ID] = false;
  return out;
};

/** All required boxes ticked (for an owner, also the agreement on behalf of the business). */
export function requiredMet(consents: Consents, role: Role = "homeowner"): boolean {
  if (role === "owner" && consents[AGREEMENT_ID] !== true) return false;
  return consentsFor(role).every((c) => !c.required || consents[c.id] === true);
}

/** Keep only known consent ids with true/false values (anything else from the outside is dropped). */
export function cleanConsents(raw: unknown, role: Role = "homeowner"): Consents | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: Consents = {};
  const ids = consentsFor(role).map((c) => c.id);
  if (role === "owner") ids.push(AGREEMENT_ID);
  for (const id of ids) out[id] = r[id] === true;
  return out;
}

/** Parse what was stored in the browser. Returns null if it's missing, damaged or not a real acceptance. */
export function parseAcceptance(raw: unknown, role: Role = "homeowner"): Acceptance | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  if (typeof a.version !== "string" || typeof a.at !== "string") return null;
  const consents = cleanConsents(a.consents, role);
  if (!consents || !requiredMet(consents, role)) return null;
  return { version: a.version, at: a.at, consents };
}

/** Show the pop-up? Yes if nothing valid is stored, or it was for an older version of the wording. */
export function needsAcceptance(stored: unknown, version = LEGAL_VERSION, role: Role = "homeowner"): boolean {
  const a = parseAcceptance(stored, role);
  return !a || a.version !== version;
}

/** Build the record to keep. Throws if a required box is missing, so nothing half-agreed is ever saved. */
export function makeAcceptance(consents: Consents, role: Role = "homeowner", now = new Date()): Acceptance {
  const clean = cleanConsents(consents, role) ?? {};
  if (!requiredMet(clean, role)) throw new Error("Required consents are missing");
  return { version: LEGAL_VERSION, at: now.toISOString(), consents: clean };
}

// ---- server-side records (stored in the "legal" document next to the leads) ----
export type LegalRecord = {
  id: string;
  kind: "acceptance" | "choices";
  userId: string; // anonymous device id for homeowners, "owner" for the signed-in owner
  role: Role;
  company: string;
  name?: string;
  version: string;
  consents: Consents;
  at: string;
  userAgent: string;
};
export type DeletionRequest = { id: string; userId: string; contact: string; note: string; at: string; status: "open" | "done" };
export type LegalDoc = { rev: number; records: LegalRecord[]; requests: DeletionRequest[] };
export const emptyLegalDoc = (): LegalDoc => ({ rev: 0, records: [], requests: [] });

/** The owner's current acceptance of the agreement (latest one for this version), if any. */
export const ownerAcceptance = (doc: LegalDoc, version = LEGAL_VERSION) =>
  doc.records.find((r) => r.role === "owner" && r.version === version && r.consents[AGREEMENT_ID] === true) ?? null;

export const shortUA = (ua: string | null) => (ua ?? "").replace(/\s+/g, " ").slice(0, 120);
