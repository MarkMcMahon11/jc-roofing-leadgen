import type { QuoteInput, Settings } from "./types";
import { formatPostcode, normalisePhone, UK_POSTCODE, validEmail } from "./format";
import { isObj } from "./http";
import { OPTIONS, SERVICE_IDS, type ServiceId } from "./services";

export const ENUMS = {
  homeAge: ["pre-1919", "1919-1960", "1960-2000", "newer"],
  propertyType: ["tenement", "semi", "detached", "bungalow"],
  listed: ["yes", "no", "unsure"],
  urgency: ["urgent", "3-months", "pricing"],
} as const;

// Control characters (incl. newlines and line/paragraph separators), built from character codes.
const c = String.fromCharCode;
const CONTROL = new RegExp(`[${c(0)}-${c(31)}${c(127)}${c(0x2028)}${c(0x2029)}]`, "g");

// Strip control characters so nothing can smuggle extra lines into emails or texts; squash whitespace; cap length.
export const clean = (v: unknown, max: number): string | null =>
  typeof v === "string" ? v.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max + 1) : null;

export { normalisePhone, validEmail };

type Fail = { ok: false; error: string; field: string };
type Ok = { ok: true; value: QuoteInput };

/** Validate untrusted quote input and build the lead from an explicit whitelist (no mass assignment). */
export function parseQuote(raw: unknown, s: Settings): Ok | Fail {
  const f = (field: string, error: string): Fail => ({ ok: false, field, error });
  if (!isObj(raw)) return f("body", "Invalid request");
  const oneOf = <T extends readonly string[]>(k: string, list: T): T[number] | null =>
    typeof raw[k] === "string" && (list as readonly string[]).includes(raw[k] as string) ? (raw[k] as T[number]) : null;

  const name = clean(raw.name, 80);
  if (!name || name.length < 2 || name.length > 80) return f("name", "Please enter your name.");
  const phone = normalisePhone(raw.phone);
  if (!phone) return f("phone", "Please enter a UK phone number, for example 07700 900123.");
  const email = clean(raw.email, 254);
  if (!email || !validEmail(email)) return f("email", "Please enter a valid email address.");
  if (raw.consent !== true) return f("consent", "Please tick the box so we can contact you.");

  const address = clean(raw.address, 200);
  if (!address || address.length < 3 || address.length > 200) return f("address", "Please enter the property address.");
  const pcRaw = clean(raw.postcode, 12);
  if (!pcRaw || !UK_POSTCODE.test(pcRaw)) return f("postcode", "Please enter a valid UK postcode.");
  const postcode = formatPostcode(pcRaw);

  const homeAge = oneOf("homeAge", ENUMS.homeAge);
  if (!homeAge) return f("homeAge", "Please choose how old the home is.");
  const propertyType = oneOf("propertyType", ENUMS.propertyType);
  if (!propertyType) return f("propertyType", "Please choose the property type.");
  const listed = oneOf("listed", ENUMS.listed);
  if (!listed) return f("listed", "Please say whether the property is listed.");
  const urgency = oneOf("urgency", ENUMS.urgency);
  if (!urgency) return f("urgency", "Please tell us how soon you need it.");

  // Which job, and only the details that job needs (everything else is ignored).
  const service: ServiceId = raw.service === undefined ? "roof" : ((SERVICE_IDS as readonly string[]).includes(raw.service as string) ? (raw.service as ServiceId) : ("" as ServiceId));
  if (!service) return f("service", "Please choose what you need.");
  const pick = (k: string, list: readonly (readonly [string, string])[], msg: string): string | Fail => {
    const v = raw[k];
    return typeof v === "string" && list.some(([x]) => x === v) ? v : f(k, msg);
  };
  const detail: Partial<QuoteInput> = {};
  const need = (k: keyof typeof OPTIONS, msg: string): Fail | null => {
    const v = pick(k, OPTIONS[k], msg);
    if (typeof v !== "string") return v;
    (detail as Record<string, string>)[k] = v;
    return null;
  };
  let err: Fail | null = null;
  if (service === "roof") {
    const mat = s.materials.find((m) => m.id === raw.material);
    if (!mat) return f("material", "Please choose a roof material.");
    detail.material = mat.id;
    detail.colour = typeof raw.colour === "string" && mat.colours.includes(raw.colour) ? raw.colour : mat.colours[0];
  } else if (service === "repair") err = need("repairIssue", "Please tell us what the problem is.");
  else if (service === "flat") err = need("flatSize", "Please choose the size of the flat roof.");
  else if (service === "gutters") err = need("gutterWork", "Please choose the gutter work you need.");
  else if (service === "chimney") err = need("chimneys", "Please choose how many chimneys.") ?? need("chimneyScope", "Please choose how much to remove.");
  else if (service === "solar") err = need("solarSize", "Please choose a system size.");
  else {
    const notes = clean(raw.notes, 300);
    if (!notes || notes.length < 5 || notes.length > 300) return f("notes", "Please tell us a little about the job (at least a few words).");
    detail.notes = notes;
  }
  if (err) return err;

  // Coordinates only if both are real numbers inside the UK; otherwise ignore them (the server looks up the postcode instead).
  const lat = raw.lat, lng = raw.lng;
  const geoOk = typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && lat > 49 && lat < 61 && lng > -9 && lng < 2.5;
  const placeId = geoOk && typeof raw.placeId === "string" && raw.placeId.length <= 600 ? raw.placeId : undefined;

  return {
    ok: true,
    value: {
      name, phone, email, consent: true, address, postcode, homeAge, propertyType, listed, urgency,
      service, jobType: service === "repair" ? "repair" : "full", currentMaterial: "unknown", ...detail,
      ...(geoOk ? { lat: lat as number, lng: lng as number } : {}),
      ...(placeId ? { placeId } : {}),
    },
  };
}

/** Validate an owner settings save. Returns clean settings merged onto the existing ones, or an error message. */
export function parseSettings(raw: unknown, current: Settings): { ok: true; value: Settings } | { ok: false; error: string } {
  const e = (error: string) => ({ ok: false as const, error });
  if (!isObj(raw)) return e("Settings must be an object");
  const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);

  const paused = typeof raw.paused === "boolean" ? raw.paused : current.paused;
  const weeksBacklog = raw.weeksBacklog === undefined ? current.weeksBacklog : num(raw.weeksBacklog, 0, 104);
  if (weeksBacklog === null) return e("Weeks until crew is free must be between 0 and 104");
  const minJobValue = raw.minJobValue === undefined ? current.minJobValue : num(raw.minJobValue, 100, 100000);
  if (minJobValue === null) return e("Minimum job value must be between £100 and £100,000");

  let serviceAreaPrefixes = current.serviceAreaPrefixes;
  if (raw.serviceAreaPrefixes !== undefined) {
    if (!Array.isArray(raw.serviceAreaPrefixes) || raw.serviceAreaPrefixes.length === 0 || raw.serviceAreaPrefixes.length > 40)
      return e("Add at least one postcode area, e.g. DG");
    serviceAreaPrefixes = [];
    for (const p of raw.serviceAreaPrefixes) {
      const t = typeof p === "string" ? p.trim().toUpperCase() : "";
      if (!/^[A-Z]{1,2}$/.test(t)) return e(`"${String(p).slice(0, 10)}" is not a postcode area. Use letters only, like DG or G`);
      if (!serviceAreaPrefixes.includes(t)) serviceAreaPrefixes.push(t);
    }
  }

  const quickJobWeeks = raw.quickJobWeeks === undefined ? current.quickJobWeeks : num(raw.quickJobWeeks, 0, 104);
  if (quickJobWeeks === null) return e("Weeks until crew is free for small jobs must be between 0 and 104");
  let prices = current.prices;
  if (raw.prices !== undefined) {
    if (!isObj(raw.prices)) return e("Prices are invalid");
    prices = { ...current.prices };
    for (const k of Object.keys(current.prices) as (keyof Settings["prices"])[]) {
      if (raw.prices[k] === undefined) continue;
      const v = num(raw.prices[k], 1, 100000);
      if (v === null) return e("Every price must be between £1 and £100,000");
      prices[k] = v;
    }
  }

  let earliestStartManual = current.earliestStartManual;
  if (raw.earliestStartManual !== undefined) {
    if (typeof raw.earliestStartManual !== "string" || (raw.earliestStartManual !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(raw.earliestStartManual)))
      return e("Earliest start must be a date");
    earliestStartManual = raw.earliestStartManual;
  }

  const contact = (k: "ownerPhone" | "ownerEmail") => (raw[k] === undefined ? current[k] : (clean(raw[k], 120) ?? ""));
  const ownerPhone = contact("ownerPhone");
  const ownerEmail = contact("ownerEmail");
  if (ownerEmail && !validEmail(ownerEmail)) return e("Your email doesn't look right");
  if (ownerPhone && !normalisePhone(ownerPhone)) return e("Your mobile doesn't look right");

  let materials = current.materials;
  if (raw.materials !== undefined) {
    if (!Array.isArray(raw.materials)) return e("Materials list is invalid");
    const out = [];
    for (const cur of current.materials) {
      const m = (raw.materials as unknown[]).find((x) => isObj(x) && x.id === cur.id) as Record<string, unknown> | undefined;
      if (!m) return e("Materials list is invalid");
      const rate = m.ratePerM2 === undefined ? cur.ratePerM2 : num(m.ratePerM2, 1, 5000);
      if (rate === null) return e(`Price for ${cur.label} must be between £1 and £5,000 per m²`);
      out.push({ ...cur, ratePerM2: rate }); // only the price is editable from the owner page
    }
    materials = out;
  }
  return { ok: true, value: { ...current, paused, weeksBacklog, quickJobWeeks, prices, minJobValue, serviceAreaPrefixes, earliestStartManual, ownerPhone, ownerEmail, materials } };
}
