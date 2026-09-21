import { randomUUID } from "crypto";
import { after } from "next/server";
import { addLead, getSettings, purgeExpired } from "@/lib/store";
import { getRoofArea } from "@/lib/roof";
import { earliestStart, estimate, inServiceArea, scoreLead, weeksFor } from "@/lib/pricing";
import { notify } from "@/lib/notify";
import { lookupPostcode, placesEnabled } from "@/lib/places";
import { parseQuote } from "@/lib/validate";
import { bad, isObj, readJson } from "@/lib/http";
import { clientIp, limited } from "@/lib/limits";
import { BUSINESS, CONSENT_VERSION } from "@/lib/config";
import type { Lead } from "@/lib/types";

// Public config for the form (no owner contact details).
export async function GET() {
  const s = await getSettings();
  return Response.json({
    businessName: s.businessName,
    paused: s.paused,
    placesEnabled: placesEnabled(),
    serviceAreaPrefixes: s.serviceAreaPrefixes,
    materials: s.materials.map(({ id, label, blurb, colours }) => ({ id, label, blurb, colours })),
  });
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (limited(`quote:ip:${ip}`, 12, 10 * 60_000)) return bad(`We've had a lot of enquiries from your connection. Please try again later or call us on ${BUSINESS.phone}.`, 429);

  const body = await readJson(req);
  if (!body.ok) return body.res;
  // Honeypot: real customers never see or fill this field. Pretend success so bots learn nothing, store nothing.
  if (isObj(body.data) && body.data.website) return Response.json({ id: "ok", inArea: true, score: "warm", low: 7000, high: 9000, roofAreaM2: 80, earliestStart: new Date().toISOString().slice(0, 10), waitlist: false });

  const s = await getSettings();
  const parsed = parseQuote(body.data, s);
  if (!parsed.ok) return bad(parsed.error, 400, { field: parsed.field });
  const input = parsed.value;

  // One person can't be texted / emailed over and over through this form.
  if (limited(`quote:phone:${input.phone}`, 3, 3_600_000) || limited(`quote:email:${input.email.toLowerCase()}`, 3, 3_600_000))
    return bad(`We already have your enquiry. If it's urgent please call us on ${BUSINESS.phone}.`, 429);

  // Free, keyless check that the postcode really exists; also gives coordinates for manually typed addresses.
  const pc = await lookupPostcode(input.postcode);
  if (pc === null) return bad("We couldn't find that postcode. Please check it and try again.", 400, { field: "postcode" });
  const geo = pc !== "unknown" && typeof input.lat !== "number" ? { lat: pc.lat, lng: pc.lng } : {};

  const inArea = inServiceArea(input.postcode, s);
  // Only new roofs need a measured roof size; everything else is priced from the customer's answers.
  const { area, source } = input.service === "roof" ? await getRoofArea({ ...input, ...geo }) : { area: 0, source: "estimate" as const };
  const est = estimate(input, s, area, source);
  const now = new Date().toISOString();
  const lead: Lead = {
    ...input,
    ...geo,
    id: randomUUID(),
    createdAt: now,
    consentAt: now,
    consentVersion: CONSENT_VERSION,
    roofAreaM2: area,
    roofSource: source,
    low: est?.low ?? 0,
    high: est?.high ?? 0,
    basis: est?.basis ?? "needs a call or inspection",
    ...(est ? {} : { noPrice: true }),
    earliestStart: earliestStart(s, weeksFor(input.service, s)),
    score: scoreLead(input, s), // out of area stays "not-a-fit" even when paused
    ...(s.paused && inArea ? { waitlist: true } : {}),
    status: "new",
  };
  try {
    await addLead(lead);
  } catch (e) {
    console.error("[quote] could not save enquiry:", (e as Error).message);
    return bad(`We couldn't save your enquiry just now. Please call us on ${BUSINESS.phone} and we'll help straight away.`, 503);
  }
  // Runs after the response is sent, but the host waits for it (so alerts aren't lost on serverless hosts).
  after(() => notify(lead, s));
  after(() => purgeExpired().catch(console.error));

  if (!inArea) return Response.json({ id: lead.id, inArea: false, score: lead.score });
  return Response.json({
    id: lead.id,
    inArea: true,
    score: lead.score,
    service: lead.service,
    low: lead.low,
    high: lead.high,
    basis: lead.basis,
    noPrice: !!lead.noPrice,
    earliestStart: lead.earliestStart,
    waitlist: !!lead.waitlist,
  });
}
