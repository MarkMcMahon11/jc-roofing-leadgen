export type Suggestion = { placeId: string; main: string; secondary: string };
export type PlaceDetails = { placeId: string; address: string; postcode: string; lat: number; lng: number; partial?: boolean };
export type Provider = "google" | "free" | "mock";

// Zero-cost by default: Google is used only when a key is present. Nothing here blocks launch.
export const provider = (): Provider => (process.env.PLACES_MOCK === "1" ? "mock" : process.env.GOOGLE_MAPS_API_KEY ? "google" : "free");
export const attribution = () => (provider() === "google" ? "Powered by Google" : provider() === "free" ? "© OpenStreetMap contributors" : "Demo data");

const KEY = () => process.env.GOOGLE_MAPS_API_KEY;
const MOCK = () => provider() === "mock";
export const placesEnabled = () => true;

// Bias (not restrict) results to Dumfries & Galloway so out-of-area customers can still be found
// and then get the polite "we don't cover you" message instead of a dead end.
export const FREE_TTL = 10 * 60_000;
const DUMFRIES = { latitude: 55.07, longitude: -3.61 };

const MOCK_PLACES: (PlaceDetails & { main: string; secondary: string })[] = [
  ["English Street", 12, "Dumfries", "DG1 2BX", 55.0701, -3.6098],
  ["English Street", 21, "Dumfries", "DG1 2DE", 55.0698, -3.6087],
  ["Auchenkeld Avenue", 28, "Heathhall, Dumfries", "DG1 3QX", 55.0918, -3.5806],
  ["Castle Douglas Road", 4, "Dumfries", "DG2 7NP", 55.0654, -3.6432],
  ["St Cuthbert Street", 9, "Kirkcudbright", "DG6 4DJ", 54.8378, -4.0499],
  ["Byres Road", 12, "Glasgow", "G12 8AA", 55.8742, -4.2921],
].map(([street, n, town, postcode, lat, lng], i) => ({
  placeId: `mock-${i}`,
  main: `${n} ${street}`,
  secondary: `${town} ${postcode}, UK`,
  address: `${n} ${street}, ${town} ${postcode}, UK`,
  postcode: postcode as string,
  lat: lat as number,
  lng: lng as number,
}));

export async function autocomplete(input: string, sessionToken: string): Promise<Suggestion[]> {
  if (MOCK()) {
    const q = input.toLowerCase().replace(/\s+/g, "");
    return MOCK_PLACES.filter((p) => (p.main + p.secondary).toLowerCase().replace(/\s+/g, "").includes(q))
      .slice(0, 5)
      .map(({ placeId, main, secondary }) => ({ placeId, main, secondary }));
  }
  if (provider() === "free") return photonSearch(input);
  const call = (withTypes: boolean) =>
    fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY()! },
      body: JSON.stringify({
        input,
        sessionToken,
        includedRegionCodes: ["gb"],
        languageCode: "en-GB",
        locationBias: { circle: { center: DUMFRIES, radius: 50000 } },
        ...(withTypes ? { includedPrimaryTypes: ["street_address", "premise", "subpremise"] } : {}),
      }),
    });
  let res = await call(true);
  if (!res.ok) res = await call(false); // never leave the customer stuck if the type filter is rejected
  if (!res.ok) throw new Error(`Places autocomplete ${res.status}`);
  const json = await res.json();
  return (json.suggestions ?? [])
    .filter((s: { placePrediction?: unknown }) => s.placePrediction)
    .map((s: { placePrediction: { placeId: string; text?: { text: string }; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }) => ({
      placeId: s.placePrediction.placeId,
      main: s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text?.text ?? "",
      secondary: s.placePrediction.structuredFormat?.secondaryText?.text ?? "",
    }));
}

export async function placeDetails(placeId: string, sessionToken: string): Promise<PlaceDetails | null> {
  if (provider() === "free") return freeDetails(placeId);
  if (MOCK()) {
    const p = MOCK_PLACES.find((x) => x.placeId === placeId);
    return p ? { placeId: p.placeId, address: p.address, postcode: p.postcode, lat: p.lat, lng: p.lng } : null;
  }
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en-GB`,
    { headers: { "X-Goog-Api-Key": KEY()!, "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents" } }
  );
  if (!res.ok) return null;
  const p = await res.json();
  const comp = (p.addressComponents ?? []).find((c: { types?: string[] }) => c.types?.includes("postal_code"));
  return {
    placeId,
    address: p.formattedAddress ?? "",
    postcode: comp?.longText ?? comp?.longName ?? "",
    lat: p.location?.latitude,
    lng: p.location?.longitude,
  };
}

export { UK_POSTCODE, formatPostcode } from "./format";

// ---------- Free provider: Photon (OpenStreetMap) + Postcodes.io (open data) ----------
type Packed = { a: string; pc: string; lat: number; lng: number; partial: boolean };
const pack = (p: Packed) => Buffer.from(JSON.stringify(p)).toString("base64url");
const unpack = (id: string): Packed | null => {
  try {
    const p = JSON.parse(Buffer.from(id, "base64url").toString());
    const ok = p && typeof p === "object" && typeof p.a === "string" && p.a.length > 0 && p.a.length <= 200 && typeof p.pc === "string" && p.pc.length <= 12 &&
      typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
      p.lat > 49 && p.lat < 61 && p.lng > -9 && p.lng < 2.5 && typeof p.partial === "boolean";
    return ok ? (p as Packed) : null;
  } catch {
    return null;
  }
};

const cache = new Map<string, { t: number; v: Suggestion[] }>();
let globalHits: number[] = [];
/** Public Photon throttles heavy use, so cap our total outbound rate and cache repeat searches. */
function upstreamBudgetLeft(max = 50, windowMs = 60_000) {
  const now = Date.now();
  globalHits = globalHits.filter((t) => now - t < windowMs);
  if (globalHits.length >= max) return false;
  globalHits.push(now);
  return true;
}

async function photonSearch(input: string): Promise<Suggestion[]> {
  const key = input.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < FREE_TTL) return hit.v;
  if (!upstreamBudgetLeft()) throw new Error("free provider budget exhausted");
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(input)}&limit=10&lang=en&lat=${DUMFRIES.latitude}&lon=${DUMFRIES.longitude}`;
  const res = await fetch(url, { headers: { "User-Agent": "jc-roofing-quote-app" }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const json = await res.json();
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const f of json.features ?? []) {
    const pr = f.properties ?? {};
    if (pr.countrycode !== "GB" || !["house", "street"].includes(pr.type)) continue;
    const street = pr.street ?? pr.name;
    if (!street) continue;
    const town = pr.city ?? pr.locality ?? pr.county ?? "";
    const line = pr.housenumber ? `${pr.housenumber} ${street}` : street;
    const partial = !pr.housenumber;
    const label = `${line}|${town}|${pr.postcode ?? ""}`;
    if (seen.has(label)) continue;
    seen.add(label);
    const address = `${line}${town ? `, ${town}` : ""}${pr.postcode && !partial ? ` ${pr.postcode}` : ""}`;
    out.push({
      placeId: pack({ a: address, pc: partial ? "" : (pr.postcode ?? ""), lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], partial }),
      main: line,
      secondary: [town, pr.postcode].filter(Boolean).join(" ") || "United Kingdom",
    });
    if (out.length === 5) break;
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, { t: Date.now(), v: out });
  return out;
}

const pcCache = new Map<string, { t: number; v: { lat: number; lng: number; district: string } | null }>();
const PC_TTL = 24 * 60 * 60_000;

/** Postcodes.io lookup, cached for a day so repeat postcodes never re-hit the free service. */
export async function lookupPostcode(pc: string): Promise<{ lat: number; lng: number; district: string } | null | "unknown"> {
  const key = pc.replace(/\s+/g, "").toUpperCase();
  const hit = pcCache.get(key);
  if (hit && Date.now() - hit.t < PC_TTL) return hit.v;
  try {
    const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(5000) });
    if (r.status === 404) { pcCache.set(key, { t: Date.now(), v: null }); return null; } // definitely not a real postcode
    if (!r.ok) return "unknown"; // service problem: don't block the customer
    const { result } = await r.json();
    const v = { lat: result.latitude, lng: result.longitude, district: result.admin_district };
    if (pcCache.size > 2000) pcCache.clear();
    pcCache.set(key, { t: Date.now(), v });
    return v;
  } catch {
    return "unknown";
  }
}

async function freeDetails(id: string): Promise<PlaceDetails | null> {
  const p = unpack(id);
  if (!p || typeof p.lat !== "number" || typeof p.lng !== "number") return null;
  let pc = p.pc;
  if (!pc) {
    try {
      const r = await fetch(`https://api.postcodes.io/postcodes?lon=${p.lng}&lat=${p.lat}&limit=1`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) pc = (await r.json()).result?.[0]?.postcode ?? "";
    } catch { /* customer can type the postcode */ }
  }
  return { placeId: id, address: p.a, postcode: pc, lat: p.lat, lng: p.lng, partial: p.partial };
}
