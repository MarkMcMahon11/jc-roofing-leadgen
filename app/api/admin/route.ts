import { getLeads, getSettings, saveLeads, saveSettings } from "@/lib/store";

function authed(req: Request) {
  const pw = process.env.ADMIN_PASSWORD;
  return !!pw && req.headers.get("x-admin-password") === pw;
}

export async function GET(req: Request) {
  if (!authed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ settings: await getSettings(), leads: await getLeads() });
}

export async function PUT(req: Request) {
  if (!authed(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.settings) await saveSettings(body.settings);
  if (body.leadStatus) {
    const leads = await getLeads();
    const l = leads.find((x) => x.id === body.leadStatus.id);
    if (l) l.status = body.leadStatus.status;
    await saveLeads(leads);
  }
  return Response.json({ ok: true });
}
