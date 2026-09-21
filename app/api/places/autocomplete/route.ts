import { attribution, autocomplete, rateLimited } from "@/lib/places";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (rateLimited(ip)) return Response.json({ suggestions: [], error: "rate" }, { status: 429 });
  const { input, sessionToken } = await req.json();
  if (typeof input !== "string" || input.trim().length < 3 || input.length > 120 || typeof sessionToken !== "string")
    return Response.json({ suggestions: [] });
  try {
    return Response.json({ suggestions: await autocomplete(input.trim(), sessionToken), attribution: attribution() });
  } catch (e) {
    console.error(e);
    return Response.json({ suggestions: [], error: "upstream" }, { status: 502 });
  }
}
