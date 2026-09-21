import { addEvent } from "@/lib/store";

const OK = new Set(["start", "address", "home", "roof", "timing", "contact", "price", "booked"]);

// Anonymous funnel logging: a random session id and the step name only.
export async function POST(req: Request) {
  const { sid, step } = await req.json().catch(() => ({}));
  if (typeof sid === "string" && sid.length < 60 && OK.has(step)) await addEvent(sid, step);
  return Response.json({ ok: true });
}
