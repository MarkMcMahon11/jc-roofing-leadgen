import { bad, isObj, readJson } from "@/lib/http";
import { crossSite, ownerSession, sameOrigin, unauthorized } from "@/lib/server/auth";
import { getFleetRev } from "@/lib/store";
import { applyBatch, loadFleet, validateBatch } from "@/lib/server/fleet";

export const dynamic = "force-dynamic";

const storageProblem = (e: unknown) => {
  console.error("[fleet] storage problem:", (e as Error).message);
  return bad("The database isn't responding. Check the Supabase address and secret key in your hosting settings.", 503);
};

/** GET /api/fleet -> the whole dashboard document. GET /api/fleet?rev=N -> {unchanged:true} if nothing changed since revision N. */
export async function GET(req: Request) {
  if (!(await ownerSession())) return unauthorized();
  try {
    const asked = new URL(req.url).searchParams.get("rev");
    if (asked !== null && asked !== "") {
      // the common case (a poll): ask the database for the revision number only, not the whole document
      const now = await getFleetRev();
      if (now !== null && now === Number(asked)) return Response.json({ unchanged: true, rev: now });
    }
    return Response.json({ doc: await loadFleet() });
  } catch (e) {
    return storageProblem(e);
  }
}

/** POST /api/fleet { rows: [{collection, id, data}], deletes: [{collection, id}] } -> save changed records. */
export async function POST(req: Request) {
  if (!(await ownerSession())) return unauthorized();
  if (!sameOrigin(req)) return crossSite();
  const body = await readJson(req, 400_000);
  if (!body.ok) return body.res;
  if (!isObj(body.data)) return bad("Invalid request");
  const checked = validateBatch(body.data);
  if (!checked.ok) return bad(checked.error);
  try {
    const result = await applyBatch(checked.rows, checked.deletes);
    if (!result.ok) return bad(result.error, result.status);
    return Response.json({ ok: true, rev: result.rev });
  } catch (e) {
    return storageProblem(e);
  }
}
