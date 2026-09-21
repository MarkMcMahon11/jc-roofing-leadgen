import { promises as fs } from "fs";
import path from "path";
import type { Lead, Settings } from "./types";

// Preview storage: JSON files in /data. Swap for a managed Postgres before deploying to a serverless host.
const dir = path.join(process.cwd(), "data");
const file = (n: string) => path.join(dir, n);

async function read<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file(name), "utf8"));
  } catch {
    return fallback; // missing on a fresh clone: leads/outbox/events are git-ignored
  }
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

export const getSettings = () => read<Settings>("settings.json", undefined as unknown as Settings);
export const saveSettings = (s: Settings) => write("settings.json", s);
export const getLeads = () => read<Lead[]>("leads.json", []);
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

// Preview outbox: what would be texted / emailed, shown on the owner page until real senders are licensed.
export type Message = { id: string; at: string; channel: "sms" | "email"; to: string; audience: "owner" | "customer"; subject?: string; body: string; sent: boolean };
export const getOutbox = () => read<Message[]>("outbox.json", []);
export const addMessage = (m: Omit<Message, "id" | "at">) =>
  locked("outbox.json", async () => {
    const box = await getOutbox();
    box.unshift({ ...m, id: crypto.randomUUID(), at: new Date().toISOString() });
    await write("outbox.json", box.slice(0, 200));
  });

// Anonymous funnel events (no personal data).
export type Ev = { at: string; sid: string; step: string };
export const getEvents = () => read<Ev[]>("events.json", []);
export const addEvent = (sid: string, step: string) =>
  locked("events.json", async () => {
    const ev = await getEvents();
    ev.push({ at: new Date().toISOString(), sid, step });
    await write("events.json", ev.slice(-5000));
  });
