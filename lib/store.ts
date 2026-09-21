import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { Lead, Settings } from "./types";
import defaultSettings from "../data/settings.json";
import { RETAIN_ALL_DAYS, RETAIN_UNBOOKED_DAYS } from "./config";

// Preview storage: JSON files. Locally in /data. On Vercel the project folder is read-only, so use the
// temp folder instead: fine for a demo, but it is per-server and gets wiped, so it is NOT real storage.
// Replace with a managed Postgres before going live (see docs/PRD.md section 9).
export const DEMO_STORAGE = !!process.env.VERCEL;
// DATA_DIR lets tests (or a host) point storage at an isolated folder.
const dir = process.env.DATA_DIR ? process.env.DATA_DIR : DEMO_STORAGE ? path.join(os.tmpdir(), "jc-roofing-data") : path.join(process.cwd(), "data");
const file = (n: string) => path.join(dir, n);

/**
 * Read a JSON file. Missing file -> fallback. A damaged or wrong-shaped file is NEVER silently treated as empty
 * (the next write would erase everything): it is moved aside as "<name>.corrupt-<time>" for recovery, and we carry on.
 */
async function read<T>(name: string, fallback: T, valid: (v: unknown) => boolean = () => true): Promise<T> {
  let text: string;
  try {
    text = await fs.readFile(file(name), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
  try {
    const v = JSON.parse(text);
    if (valid(v)) return v as T;
  } catch {
    /* fall through to quarantine */
  }
  const aside = `${file(name)}.corrupt-${Date.now()}`;
  console.error(`[store] ${name} is damaged; moved to ${aside}`);
  await fs.rename(file(name), aside).catch(() => {});
  return fallback;
}

// Atomic write: never leave a half-written file behind.
async function write(name: string, data: unknown) {
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file(name)}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file(name));
}

// Serialise read-modify-write cycles per file so simultaneous requests can't overwrite each other.
const locks = new Map<string, Promise<unknown>>();
function locked<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const run = (locks.get(name) ?? Promise.resolve()).then(fn, fn);
  locks.set(name, run.catch(() => {}));
  return run;
}

const isSettings = (v: unknown) => {
  const s = v as Settings;
  return !!s && typeof s === "object" && Array.isArray(s.materials) && s.materials.length > 0 && Array.isArray(s.serviceAreaPrefixes) &&
    typeof s.weeksBacklog === "number" && typeof s.minJobValue === "number" && typeof s.paused === "boolean";
};
// Falls back to the settings bundled with the build, so a fresh (or damaged-settings) server always has working rates.
export const getSettings = () => read<Settings>("settings.json", defaultSettings as unknown as Settings, isSettings);
export const saveSettings = (s: Settings) => locked("settings.json", () => write("settings.json", s));

export const getLeads = () => read<Lead[]>("leads.json", [], Array.isArray);
export const saveLeads = (l: Lead[]) => write("leads.json", l);
export const addLead = (lead: Lead) =>
  locked("leads.json", async () => {
    const leads = await getLeads();
    leads.unshift(lead);
    await saveLeads(leads);
  });
/** Atomically read, change and save the leads list. Return value of `fn` is passed back. */
export const updateLeads = <T>(fn: (leads: Lead[]) => T | Promise<T>) =>
  locked("leads.json", async () => {
    const leads = await getLeads();
    const result = await fn(leads);
    await saveLeads(leads);
    return result;
  });

// Preview outbox: what would be texted / emailed. "preview" = not really sent (no provider keys yet).
export type Message = {
  id: string;
  at: string;
  channel: "sms" | "email";
  to: string;
  audience: "owner" | "customer";
  subject?: string;
  body: string;
  status: "preview" | "sent" | "failed";
  error?: string;
  leadId?: string; // lets us erase a customer's messages together with their lead
};
export const getOutbox = () => read<Message[]>("outbox.json", [], Array.isArray);
export const addMessage = (m: Omit<Message, "id" | "at">) =>
  locked("outbox.json", async () => {
    const box = await getOutbox();
    box.unshift({ ...m, id: crypto.randomUUID(), at: new Date().toISOString() });
    await write("outbox.json", box.slice(0, 200));
  });
export const deleteMessagesForLead = (lead: Pick<Lead, "id" | "phone" | "email">) =>
  locked("outbox.json", async () => {
    const box = await getOutbox();
    await write("outbox.json", box.filter((m) => m.leadId !== lead.id && m.to !== lead.phone && m.to !== lead.email));
  });

// Anonymous funnel events (no personal data).
export type Ev = { at: string; sid: string; step: string };
export const getEvents = () => read<Ev[]>("events.json", [], Array.isArray);
export const addEvent = (sid: string, step: string) =>
  locked("events.json", async () => {
    const ev = await getEvents();
    ev.push({ at: new Date().toISOString(), sid, step });
    await write("events.json", ev.slice(-5000));
  });

/**
 * Enforce the retention promised on /privacy: unbooked enquiries go after ~6 months, everything else after ~24 months,
 * together with their stored messages. Runs at most once an hour per server.
 */
let lastPurge = 0;
export async function purgeExpired() {
  if (Date.now() - lastPurge < 3_600_000) return 0;
  lastPurge = Date.now();
  const DAY = 86_400_000;
  const gone: Lead[] = [];
  await updateLeads((leads) => {
    for (let i = leads.length - 1; i >= 0; i--) {
      const l = leads[i];
      const age = (Date.now() - new Date(l.createdAt).getTime()) / DAY;
      if (age > RETAIN_ALL_DAYS || (age > RETAIN_UNBOOKED_DAYS && !l.inspectionBooked && l.status !== "won")) gone.push(...leads.splice(i, 1));
    }
  });
  for (const l of gone) await deleteMessagesForLead(l);
  return gone.length;
}
