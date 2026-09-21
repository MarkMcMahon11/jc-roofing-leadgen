import { createHash, timingSafeEqual } from "crypto";
import { deleteMessagesForLead, getEvents, getLeads, getOutbox, getSettings, saveSettings, storageMode, updateLeads } from "@/lib/store";
import { bad, isObj, readJson } from "@/lib/http";
import { clientIp, isBlocked, limited } from "@/lib/limits";
import { parseSettings } from "@/lib/validate";
import type { Lead } from "@/lib/types";

const STATUSES: Lead["status"][] = ["new", "contacted", "quoted", "won", "lost"];
const sha = (s: string) => createHash("sha256").update(s).digest();

/** "ok" | "no" | "locked". Wrong guesses are counted per IP; after 10 in 10 minutes even the right password is refused. */
function auth(req: Request): "ok" | "no" | "locked" {
  const fail = `admin:fail:${clientIp(req)}`;
  if (isBlocked(fail, 10, 10 * 60_000)) return "locked";
  // Trim both sides: a space or newline pasted along with the password must not lock the owner out.
  const pw = process.env.ADMIN_PASSWORD?.trim();
  const given = (req.headers.get("x-admin-password") ?? "").trim();
  if (pw && timingSafeEqual(sha(given), sha(pw))) return "ok";
  limited(fail, 10, 10 * 60_000);
  return "no";
}
const storageProblem = (e: unknown) => {
  console.error("[admin] storage problem:", (e as Error).message);
  return bad("The database isn't responding. Check the Supabase address and secret key in your hosting settings.", 503);
};
const deny = (a: "no" | "locked") => (a === "locked" ? bad("Too many wrong passwords. Try again in 10 minutes.", 429) : bad("Unauthorized", 401));

export async function GET(req: Request) {
  try {
    return await getAdmin(req);
  } catch (e) {
    return storageProblem(e);
  }
}

async function getAdmin(req: Request) {
  const a = auth(req);
  if (a !== "ok") return deny(a);
  const events = await getEvents();
  const funnel: Record<string, number> = {};
  for (const step of ["start", "address", "service", "home", "details", "timing", "price", "booked"])
    funnel[step] = new Set(events.filter((e) => e.step === step).map((e) => e.sid)).size;
  const [settings, leads, outbox] = await Promise.all([getSettings(), getLeads(), getOutbox()]);
  return Response.json({ settings, leads, outbox: outbox.slice(0, 60), funnel, storage: storageMode() });
}

export async function PUT(req: Request) {
  try {
    return await putAdmin(req);
  } catch (e) {
    return storageProblem(e);
  }
}

async function putAdmin(req: Request) {
  const a = auth(req);
  if (a !== "ok") return deny(a);
  const body = await readJson(req, 30_000);
  if (!body.ok) return body.res;
  const b = body.data;
  if (!isObj(b)) return bad("Invalid request");

  if (b.settings !== undefined) {
    const parsed = parseSettings(b.settings, await getSettings());
    if (!parsed.ok) return bad(parsed.error);
    await saveSettings(parsed.value);
  }
  if (b.leadStatus !== undefined) {
    const ls = b.leadStatus;
    if (!isObj(ls) || typeof ls.id !== "string" || !STATUSES.includes(ls.status as Lead["status"])) return bad("Invalid status");
    await updateLeads((leads) => {
      const l = leads.find((x) => x.id === ls.id);
      if (l) l.status = ls.status as Lead["status"];
    });
  }
  if (b.deleteLead !== undefined) {
    if (typeof b.deleteLead !== "string") return bad("Invalid request");
    const removed = await updateLeads((leads) => {
      const i = leads.findIndex((x) => x.id === b.deleteLead);
      return i >= 0 ? leads.splice(i, 1)[0] : null;
    });
    // Erase the customer's stored messages too (they contain name, phone, email and address).
    if (removed) await deleteMessagesForLead(removed);
  }
  return Response.json({ ok: true });
}
