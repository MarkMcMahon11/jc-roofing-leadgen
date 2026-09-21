import { placeDetails } from "@/lib/places";
import { clientIp, limited } from "@/lib/limits";

export async function GET(req: Request) {
  if (limited(`places:ip:${clientIp(req)}`, 90, 60_000)) return Response.json({ error: "rate" }, { status: 429 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "";
  const token = (searchParams.get("token") ?? "").slice(0, 80);
  if (!id || id.length > 600) return Response.json({ error: "bad request" }, { status: 400 });
  const place = await placeDetails(id, token).catch(() => null);
  if (!place || !place.address) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(place);
}
