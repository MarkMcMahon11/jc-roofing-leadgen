import { after } from "next/server";
import { getLeads, getSettings, updateLeads } from "@/lib/store";
import { notifyBooking } from "@/lib/notify";
import { SLOTS } from "@/lib/booking";
import { bad, isObj, readJson } from "@/lib/http";
import { clientIp, limited } from "@/lib/limits";
import { isRealDay, londonNow, weekdayOf } from "@/lib/dates";
import type { Lead } from "@/lib/types";

const MIN_NOTICE_MIN = 120; // slots must start at least 2 hours from now (London time)
const HORIZON_DAYS = 90;

// Slots already taken (no personal data) so the picker can grey them out.
export async function GET() {
  const taken = (await getLeads()).map((l) => l.inspectionBooked).filter((v): v is string => typeof v === "string");
  return Response.json({ taken });
}

export async function POST(req: Request) {
  if (limited(`book:ip:${clientIp(req)}`, 20, 10 * 60_000)) return bad("Too many attempts. Please try again in a few minutes.", 429);
  const body = await readJson(req);
  if (!body.ok) return body.res;
  const b = body.data;
  if (!isObj(b) || typeof b.leadId !== "string" || b.leadId.length > 80) return bad("Invalid request");
  const { leadId, day, time } = b;
  if (!isRealDay(day) || typeof time !== "string" || !SLOTS.includes(time)) return bad("Invalid time");
  const wk = weekdayOf(day);
  if (wk === 0 || wk === 6) return bad("Please choose a weekday");
  if (`${day}T${time}` < londonNow(MIN_NOTICE_MIN)) return bad("That time has passed or is too soon. Please pick a later slot.");
  if (day > londonNow(HORIZON_DAYS * 24 * 60).slice(0, 10)) return bad("We can only book about three months ahead.");

  const when = `${day}T${time}:00`;
  const out = await updateLeads((leads): { lead: Lead; changed: boolean } | { error: string; status: number } => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.score === "not-a-fit") return { error: "Not found", status: 404 };
    if (lead.waitlist) return { error: "We're fully booked at the moment. You're on our waiting list and we'll be in touch.", status: 409 };
    if (leads.some((l) => l.id !== lead.id && l.inspectionBooked === when)) return { error: "Sorry, that time was just taken. Please pick another.", status: 409 };
    const changed = lead.inspectionBooked !== when;
    lead.inspectionBooked = when;
    return { lead, changed };
  });
  if ("error" in out) return bad(out.error, out.status);
  if (out.changed) {
    const s = await getSettings();
    after(() => notifyBooking(out.lead, s, when));
  }
  return Response.json({ ok: true, when });
}
