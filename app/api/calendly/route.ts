import { after } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getSettings, updateLeads } from "@/lib/store";
import { notifyBooking } from "@/lib/notify";
import { bad, isObj } from "@/lib/http";
import { toLondonNaive } from "@/lib/dates";
import type { Lead } from "@/lib/types";

/**
 * Calendly webhook (paid Calendly plans only). Disabled unless CALENDLY_WEBHOOK_SIGNING_KEY is set, and every request
 * must carry a valid Calendly-Webhook-Signature, otherwise anyone could rewrite a customer's inspection time.
 */
export async function POST(req: Request) {
  const key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!key) return bad("Calendly booking is not enabled", 503);

  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > 100_000) return bad("Invalid request");
  const sig = req.headers.get("calendly-webhook-signature") ?? "";
  const t = /(?:^|,)t=(\d+)/.exec(sig)?.[1];
  const v1 = /(?:^|,)v1=([0-9a-f]+)/.exec(sig)?.[1];
  if (!t || !v1 || Math.abs(Date.now() / 1000 - Number(t)) > 180) return bad("Unauthorised", 401);
  const expected = createHmac("sha256", key).update(`${t}.${raw}`).digest();
  const given = Buffer.from(v1, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return bad("Unauthorised", 401);

  let body: unknown;
  try { body = JSON.parse(raw); } catch { return bad("Invalid JSON"); }
  if (!isObj(body) || body.event !== "invitee.created" || !isObj(body.payload)) return Response.json({ ok: true });
  const email = body.payload.email;
  const start = isObj(body.payload.scheduled_event) ? body.payload.scheduled_event.start_time : undefined;
  const when = typeof start === "string" ? toLondonNaive(start) : null;
  if (typeof email !== "string" || !when) return bad("Invalid payload");

  // Newest active enquiry for that email (the list is newest-first).
  const lead = await updateLeads((leads): Lead | null => {
    const l = leads.find((x) => x.email.toLowerCase() === email.toLowerCase() && x.score !== "not-a-fit");
    if (!l) return null;
    l.inspectionBooked = when;
    return l;
  });
  if (lead) {
    const s = await getSettings();
    after(() => notifyBooking(lead, s, when));
  }
  return Response.json({ ok: true });
}
