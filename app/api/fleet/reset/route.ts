import { bad, isObj, readJson } from "@/lib/http";
import { crossSite, ownerSession, sameOrigin, unauthorized } from "@/lib/server/auth";
import { resetFleet } from "@/lib/server/fleet";

/** POST /api/fleet/reset { mode: "sample" | "empty" }: restore the sample data, or clear it to start with the real vans. */
export async function POST(req: Request) {
  if (!(await ownerSession())) return unauthorized();
  if (!sameOrigin(req)) return crossSite();
  const body = await readJson(req, 1_000);
  if (!body.ok) return body.res;
  if (!isObj(body.data) || (body.data.mode !== "sample" && body.data.mode !== "empty")) return bad("Invalid request");
  try {
    return Response.json({ doc: await resetFleet(body.data.mode) });
  } catch (e) {
    console.error("[fleet] reset failed:", (e as Error).message);
    return bad("The database isn't responding.", 503);
  }
}
