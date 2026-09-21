import { updateLeads } from "@/lib/store";

// Calendly webhook: invitee.created -> mark the lead's inspection time.
export async function POST(req: Request) {
  const body = await req.json();
  if (body.event !== "invitee.created") return Response.json({ ok: true });
  const email = body.payload?.email as string | undefined;
  const when = body.payload?.scheduled_event?.start_time as string | undefined;
  await updateLeads((leads) => {
    const lead = leads.find((l) => l.email.toLowerCase() === email?.toLowerCase());
    if (lead) lead.inspectionBooked = when;
  });
  return Response.json({ ok: true });
}
