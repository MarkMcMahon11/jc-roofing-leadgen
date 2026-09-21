import { attribution, autocomplete } from "@/lib/places";
import { isObj, readJson } from "@/lib/http";
import { clientIp, limited } from "@/lib/limits";

export async function POST(req: Request) {
  if (limited(`places:ip:${clientIp(req)}`, 90, 60_000)) return Response.json({ suggestions: [], error: "rate" }, { status: 429 });
  const body = await readJson(req, 2_000);
  if (!body.ok || !isObj(body.data)) return Response.json({ suggestions: [] });
  const { input, sessionToken } = body.data;
  if (typeof input !== "string" || input.trim().length < 3 || input.length > 120 || typeof sessionToken !== "string" || sessionToken.length > 80)
    return Response.json({ suggestions: [] });
  try {
    return Response.json({ suggestions: await autocomplete(input.trim(), sessionToken), attribution: attribution() });
  } catch (e) {
    console.error("[places] autocomplete failed:", (e as Error).message);
    return Response.json({ suggestions: [], error: "upstream" }, { status: 502 });
  }
}
