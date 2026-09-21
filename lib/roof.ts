import type { QuoteInput } from "./types";

// Typical pitched roof surface area (m2) when aerial data is unavailable.
const FALLBACK_M2: Record<QuoteInput["propertyType"], number> = {
  tenement: 90,
  semi: 85,
  detached: 130,
  bungalow: 140,
};

/** Roof area from Google Solar API when a key is set, else a property-type estimate. */
export async function getRoofArea(
  input: Pick<QuoteInput, "propertyType" | "address" | "postcode" | "lat" | "lng">
): Promise<{ area: number; source: "solar-api" | "estimate" }> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (key) {
    try {
      let loc = typeof input.lat === "number" && typeof input.lng === "number" ? { lat: input.lat, lng: input.lng } : undefined;
      if (!loc) {
        const geo = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
            `${input.address}, ${input.postcode}, UK`
          )}&key=${key}`
        ).then((r) => r.json());
        loc = geo.results?.[0]?.geometry?.location;
      }
      if (loc) {
        const solar = await fetch(
          `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${loc.lat}&location.longitude=${loc.lng}&requiredQuality=LOW&key=${key}`
        ).then((r) => (r.ok ? r.json() : null));
        const area = solar?.solarPotential?.wholeRoofStats?.areaMeters2;
        if (typeof area === "number" && area > 20 && area < 600) {
          return { area: Math.round(area), source: "solar-api" };
        }
      }
    } catch {
      /* fall through to estimate */
    }
  }
  return { area: FALLBACK_M2[input.propertyType], source: "estimate" };
}
