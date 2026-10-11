import { after } from "next/server";
import { getLegalDoc, mutateLegalDoc } from "@/lib/store";
import { bad, isObj, readJson } from "@/lib/http";
import { clientIp, limited } from "@/lib/limits";
import { clean } from "@/lib/validate";
import { emailOwnerPrivacyRequest } from "@/lib/notify";
import { BUSINESS } from "@/lib/config";
import { CLIENT_COMPANY, cleanConsents, LEGAL_VERSION, requiredMet, shortUA, type LegalRecord } from "@/lib/legal";

// Homeowners' privacy records. No sign-in on the quote form, so each browser has a random device id (kept in its own storage).
const DEVICE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Download my data": what the server holds for this device (its privacy records and any deletion request). */
export async function GET(req: Request) {
  if (limited(`legal:get:${clientIp(req)}`, 30, 10 * 60_000)) return bad("Too many requests. Please try again later.", 429);
  const device = new URL(req.url).searchParams.get("device") ?? "";
  if (!DEVICE.test(device)) return bad("Invalid request");
  try {
    const doc = await getLegalDoc();
    return Response.json({
      records: doc.records.filter((r) => r.userId === device),
      requests: doc.requests.filter((r) => r.userId === device),
    });
  } catch {
    return bad("We couldn't reach our records just now. Please try again later.", 503);
  }
}

export async function POST(req: Request) {
  if (limited(`legal:post:${clientIp(req)}`, 20, 10 * 60_000)) return bad("Too many requests. Please try again later.", 429);
  const body = await readJson(req, 4_000);
  if (!body.ok) return body.res;
  const b = body.data;
  if (!isObj(b) || typeof b.deviceId !== "string" || !DEVICE.test(b.deviceId)) return bad("Invalid request");
  const deviceId = b.deviceId;
  const at = new Date().toISOString();

  if (b.action === "accept" || b.action === "choices") {
    const consents = cleanConsents(b.consents);
    if (!consents || !requiredMet(consents)) return bad("Please tick the required boxes.");
    const rec: LegalRecord = {
      id: crypto.randomUUID(),
      kind: b.action === "accept" ? "acceptance" : "choices",
      userId: deviceId,
      role: "homeowner",
      company: CLIENT_COMPANY,
      version: LEGAL_VERSION,
      consents,
      at,
      userAgent: shortUA(req.headers.get("user-agent")),
    };
    try {
      await mutateLegalDoc((doc) => { doc.records.unshift(rec); });
    } catch {
      return bad("Not saved on our server yet; it's saved in this browser and we'll try again.", 503);
    }
    return Response.json({ ok: true });
  }

  if (b.action === "delete-request") {
    if (limited(`legal:delete:${clientIp(req)}`, 3, 3_600_000)) return bad(`We already have your request. You can also call us on ${BUSINESS.phone}.`, 429);
    const contact = clean(b.contact, 120) ?? "";
    const note = clean(b.note, 500) ?? "";
    if (contact.length < 5) return bad("Please give the phone number or email you used, so we can find your enquiry.");
    const id = crypto.randomUUID();
    try {
      await mutateLegalDoc((doc) => { doc.requests.unshift({ id, userId: deviceId, contact, note, at, status: "open" }); });
    } catch {
      return bad(`We couldn't save your request just now. Please email ${BUSINESS.email} or call ${BUSINESS.phone}.`, 503);
    }
    after(() => emailOwnerPrivacyRequest("Privacy: a homeowner asked to delete their data", `A homeowner asked us to delete their data.\n\nContact they gave: ${contact}\nNote: ${note || "(none)"}\nWhen: ${at}\n\nUK GDPR: reply within one month. Find the enquiry under Leads and quotes and use "Delete enquiry", then mark the request done under Legal & privacy.`).catch(console.error));
    return Response.json({ ok: true, id });
  }

  return bad("Invalid request");
}
