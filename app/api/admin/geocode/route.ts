import { bad } from "@/lib/http";
import { clientIp, limited } from "@/lib/limits";
import { UK_POSTCODE } from "@/lib/format";
import { lookupPostcode } from "@/lib/places";
import { ownerSession, unauthorized } from "@/lib/server/auth";

/** GET /api/admin/geocode?postcode=DG1+3QX -> {lat, lng, area}: puts a job on the project map from its postcode (free Postcodes.io). */
export async function GET(req: Request) {
  if (!(await ownerSession())) return unauthorized();
  if (limited(`geocode:${clientIp(req)}`, 60, 60_000)) return bad("Too many lookups. Wait a minute.", 429);
  const pc = new URL(req.url).searchParams.get("postcode")?.trim() ?? "";
  if (!UK_POSTCODE.test(pc)) return bad("That doesn't look like a UK postcode.");
  const r = await lookupPostcode(pc);
  // lookupPostcode: null = Postcodes.io says it doesn't exist, "unknown" = the service itself failed
  if (r === null) return bad("We couldn't find that postcode.", 404);
  if (r === "unknown") return bad("The postcode service isn't responding. Try again in a moment.", 503);
  return Response.json({ lat: r.lat, lng: r.lng, area: r.district });
}
