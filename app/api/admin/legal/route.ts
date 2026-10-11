import { getLegalDoc, mutateLegalDoc } from "@/lib/store";
import { bad, isObj, readJson } from "@/lib/http";
import { crossSite, ownerSession, sameOrigin, unauthorized } from "@/lib/server/auth";
import { clean } from "@/lib/validate";
import { CLIENT_COMPANY, cleanConsents, LEGAL_VERSION, ownerAcceptance, requiredMet, shortUA, type LegalRecord } from "@/lib/legal";

const down = (e: unknown) => {
  console.error("[legal] storage problem:", (e as Error).message);
  return bad("The database isn't responding. Your acceptance is kept in this browser and will be sent again.", 503);
};

/** Owner only: the agreement status, every privacy record and deletion request. */
export async function GET() {
  const session = await ownerSession();
  if (!session) return unauthorized();
  try {
    const doc = await getLegalDoc();
    return Response.json({ ownerName: session.name, version: LEGAL_VERSION, agreement: ownerAcceptance(doc), records: doc.records.slice(0, 500), requests: doc.requests });
  } catch (e) {
    return down(e);
  }
}

export async function POST(req: Request) {
  const session = await ownerSession();
  if (!session) return unauthorized();
  if (!sameOrigin(req)) return crossSite();
  const body = await readJson(req, 4_000);
  if (!body.ok) return body.res;
  const b = body.data;
  if (!isObj(b)) return bad("Invalid request");

  try {
    if (b.action === "accept-agreement") {
      const consents = cleanConsents(b.consents, "owner");
      if (!consents || !requiredMet(consents, "owner")) return bad("Please tick both boxes to accept.");
      const rec: LegalRecord = {
        id: crypto.randomUUID(),
        kind: "acceptance",
        userId: "owner",
        role: "owner",
        company: CLIENT_COMPANY,
        name: clean(b.name, 80) || session.name,
        version: LEGAL_VERSION,
        consents,
        at: new Date().toISOString(),
        userAgent: shortUA(req.headers.get("user-agent")),
      };
      await mutateLegalDoc((doc) => { doc.records.unshift(rec); });
      return Response.json({ ok: true, record: rec });
    }
    if (b.action === "request-done") {
      if (typeof b.id !== "string") return bad("Invalid request");
      const found = await mutateLegalDoc((doc) => {
        const r = doc.requests.find((x) => x.id === b.id);
        if (r) r.status = "done";
        return !!r;
      });
      return found ? Response.json({ ok: true }) : bad("That request no longer exists", 404);
    }
  } catch (e) {
    return down(e);
  }
  return bad("Invalid request");
}
