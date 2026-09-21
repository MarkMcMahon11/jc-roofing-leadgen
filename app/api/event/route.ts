import { addEvent } from "@/lib/store";
import { isObj, readJson } from "@/lib/http";
import { clientIp, limited } from "@/lib/limits";

// Funnel steps: what the visitor has just finished/reached. No personal data is ever sent here.
const OK = new Set(["start", "address", "home", "roof", "timing", "price", "booked"]);

export async function POST(req: Request) {
  if (limited(`event:ip:${clientIp(req)}`, 200, 60_000)) return Response.json({ ok: true });
  const body = await readJson(req, 2_000);
  if (body.ok && isObj(body.data)) {
    const { sid, step } = body.data;
    if (typeof sid === "string" && sid.length < 60 && typeof step === "string" && OK.has(step)) await addEvent(sid, step);
  }
  return Response.json({ ok: true });
}
