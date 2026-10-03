import { deleteLeadArtifacts, getEvents, getLeads, getOutbox, getSettings, saveSettings, storageMode, updateLeads } from "@/lib/store";
import { bad, isObj, readJson } from "@/lib/http";
import { crossSite, ownerSession, sameOrigin, unauthorized } from "@/lib/server/auth";
import { parseSettings } from "@/lib/validate";
import { photosEnabled, signPhotoUrls } from "@/lib/photos";
import { positionHint } from "@/lib/vision";
import type { Lead } from "@/lib/types";

const STATUSES: Lead["status"][] = ["new", "contacted", "quoted", "won", "lost"];
const storageProblem = (e: unknown) => {
  console.error("[admin] storage problem:", (e as Error).message);
  return bad("The database isn't responding. Check the Supabase address and secret key in your hosting settings.", 503);
};

export async function GET() {
  try {
    return await getAdmin();
  } catch (e) {
    return storageProblem(e);
  }
}

async function getAdmin() {
  if (!(await ownerSession())) return unauthorized();
  const events = await getEvents();
  const funnel: Record<string, number> = {};
  for (const step of ["start", "address", "service", "home", "details", "timing", "price", "booked"])
    funnel[step] = new Set(events.filter((e) => e.step === step).map((e) => e.sid)).size;
  const [settings, leads, outbox] = await Promise.all([getSettings(), getLeads(), getOutbox()]);

  // Owner-side viewing: attach a short-lived signed URL (and a plain-English "where this falls" hint) to each photo.
  // The bucket is private, so a bare storage path is useless without one - nothing here needs the secret key client-side.
  const allPaths = leads.flatMap((l) => l.photos?.map((p) => p.path) ?? []);
  const urls: Record<string, string> = photosEnabled() && allPaths.length ? await signPhotoUrls(allPaths).catch(() => ({})) : {};
  const leadsWithPhotos = leads.map((l) => ({
    ...l,
    photos: l.photos?.map((p) => ({ ...p, url: urls[p.path], hint: positionHint(p.assessment?.affectedPercent ?? null) })),
  }));

  return Response.json({ settings, leads: leadsWithPhotos, outbox: outbox.slice(0, 60), funnel, storage: storageMode() });
}

export async function PUT(req: Request) {
  try {
    return await putAdmin(req);
  } catch (e) {
    return storageProblem(e);
  }
}

async function putAdmin(req: Request) {
  if (!(await ownerSession())) return unauthorized();
  if (!sameOrigin(req)) return crossSite();
  const body = await readJson(req, 30_000);
  if (!body.ok) return body.res;
  const b = body.data;
  if (!isObj(b)) return bad("Invalid request");

  if (b.settings !== undefined) {
    if (isObj(b.settings) && b.settings.paused !== undefined && typeof b.settings.paused !== "boolean") return bad("Pause must be on or off");
    const parsed = parseSettings(b.settings, await getSettings());
    if (!parsed.ok) return bad(parsed.error);
    await saveSettings(parsed.value);
  }
  if (b.leadStatus !== undefined) {
    const ls = b.leadStatus;
    if (!isObj(ls) || typeof ls.id !== "string" || !STATUSES.includes(ls.status as Lead["status"])) return bad("Invalid status");
    const found = await updateLeads((leads) => {
      const l = leads.find((x) => x.id === ls.id);
      if (l) l.status = ls.status as Lead["status"];
      return !!l;
    });
    if (!found) return bad("That enquiry no longer exists", 404);
  }
  if (b.deleteLead !== undefined) {
    if (typeof b.deleteLead !== "string") return bad("Invalid request");
    const removed = await updateLeads((leads) => {
      const i = leads.findIndex((x) => x.id === b.deleteLead);
      return i >= 0 ? leads.splice(i, 1)[0] : null;
    });
    if (!removed) return bad("That enquiry is already gone", 404);
    // Erase the customer's stored messages and photos too (they contain name, phone, email, address and images).
    await deleteLeadArtifacts(removed);
  }
  return Response.json({ ok: true });
}
