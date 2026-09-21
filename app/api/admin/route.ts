import { getEvents, getLeads, getOutbox, getSettings, saveSettings, updateLeads } from "@/lib/store";

function authed(req: Request) {
  const pw = process.env.ADMIN_PASSWORD;
  return !!pw && req.headers.get("x-admin-password") === pw;
}

export async function GET(req: Request) {
  if (!authed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const events = await getEvents();
  const funnel: Record<string, number> = {};
  for (const step of ["start", "address", "home", "roof", "timing", "contact", "price", "booked"])
    funnel[step] = new Set(events.filter((e) => e.step === step).map((e) => e.sid)).size;
  return Response.json({ settings: await getSettings(), leads: await getLeads(), outbox: (await getOutbox()).slice(0, 30), funnel });
}

export async function PUT(req: Request) {
  if (!authed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.settings) await saveSettings(body.settings);
  if (body.leadStatus)
    await updateLeads((leads) => {
      const l = leads.find((x) => x.id === body.leadStatus.id);
      if (l) l.status = body.leadStatus.status;
    });
  if (body.deleteLead) await updateLeads((leads) => { const i = leads.findIndex((x) => x.id === body.deleteLead); if (i >= 0) leads.splice(i, 1); });
  return Response.json({ ok: true });
}
