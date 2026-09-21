import { placeDetails, rateLimited } from "@/lib/places";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (rateLimited(ip)) return Response.json({ error: "rate" }, { status: 429 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") ?? "";
  const token = searchParams.get("token") ?? "";
  if (!id || id.length > 300) return Response.json({ error: "bad request" }, { status: 400 });
  const place = await placeDetails(id, token).catch(() => null);
  if (!place || !place.address) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(place);
}
