import { bad } from "@/lib/http";
import { crossSite, ownerSession, sameOrigin, unauthorized } from "@/lib/server/auth";
import { metaOf, saveBackground } from "@/lib/server/background";

export async function GET() {
  if (!(await ownerSession())) return unauthorized();
  return Response.json(await metaOf());
}

/** PUT { mode?, strength?, image? (data URL, already shrunk by the browser) } */
export async function PUT(req: Request) {
  if (!sameOrigin(req)) return crossSite();
  if (!(await ownerSession())) return unauthorized();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return bad("Bad request.");
  const r = await saveBackground(body);
  return r.ok ? Response.json(await metaOf()) : bad(r.error);
}
