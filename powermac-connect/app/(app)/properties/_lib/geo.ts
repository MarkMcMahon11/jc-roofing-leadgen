import "server-only";

/** UK postcode (outward + inward code), spacing optional. */
export const POSTCODE_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2}$/i;

/** "g511aa" -> "G51 1AA" */
export function normalisePostcode(value: string) {
  const s = value.toUpperCase().replace(/\s+/g, "");
  return s.length > 3 ? `${s.slice(0, -3)} ${s.slice(-3)}` : s;
}

export type GeocodeResult = { ok: true; lat: number; lng: number } | { ok: false; reason: "not_found" | "unavailable" };

/**
 * Looks a UK postcode up with the free postcodes.io service (no key needed).
 * Never throws: a slow or failing service must not stop the record being saved.
 */
export async function geocodePostcode(postcode: string): Promise<GeocodeResult> {
  const compact = postcode.replace(/\s+/g, "").toUpperCase();
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(compact)}`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const json = (await res.json()) as { result?: { latitude?: number | null; longitude?: number | null } | null };
    const lat = json.result?.latitude;
    const lng = json.result?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") return { ok: false, reason: "not_found" };
    return { ok: true, lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export function geocodeMessage(r: GeocodeResult) {
  if (r.ok) return null;
  return r.reason === "not_found"
    ? "The postcode was not found by the mapping service, so this record has no map location yet. Check the postcode and save again."
    : "The mapping service could not be reached, so this record has no map location yet. Save it again later to add the location.";
}
