import { getLeads, getSettings, updateLeads } from "@/lib/store";
import type { Lead } from "@/lib/types";
import { notifyBooking } from "@/lib/notify";

import { SLOTS } from "@/lib/booking";
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Slots already taken (no personal data) so the picker can grey them out.
export async function GET() {
  const taken = (await getLeads()).map((l) => l.inspectionBooked).filter(Boolean);
  return Response.json({ taken });
}

export async function POST(req: Request) {
  const { leadId, day, time } = await req.json();
  if (!DAY.test(day ?? "") || !SLOTS.includes(time)) return Response.json({ error: "Invalid time" }, { status: 400 });
  const d = new Date(`${day}T12:00:00`);
  const wk = d.getDay();
  if (wk === 0 || wk === 6 || d < new Date(Date.now() - 864e5)) return Response.json({ error: "Please choose a weekday in the future" }, { status: 400 });
  const when = `${day}T${time}:00`;
  const out = await updateLeads((leads): { lead: Lead } | { error: string; status: number } => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.score === "not-a-fit") return { error: "Not found", status: 404 };
    if (leads.some((l) => l.id !== lead.id && l.inspectionBooked === when))
      return { error: "Sorry, that time was just taken. Please pick another.", status: 409 };
    lead.inspectionBooked = when;
    return { lead };
  });
  if ("error" in out) return Response.json({ error: out.error }, { status: out.status });
  notifyBooking(out.lead, await getSettings(), when).catch(console.error);
  return Response.json({ ok: true, when });
}
