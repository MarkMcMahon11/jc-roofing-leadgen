import { promises as fs } from "fs";
import path from "path";
import os from "os";
import type { Lead, Settings } from "./types";
import defaultSettings from "../data/settings.json";
import { RETAIN_ALL_DAYS, RETAIN_UNBOOKED_DAYS } from "./config";

/**
 * Storage, three ways (same functions either way):
 *  - "database":  Supabase (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set). Shared by every server copy. Use this for real.
 *  - "files":     JSON files in /data (local development).
 *  - "temporary": JSON files in the OS temp folder, used on hosts with a read-only disk (Vercel) when no database is
 *                 configured. Per-server and wiped often: demo only.
 * Each "document" (settings, leads, outbox, events) is one JSON value. Writes are read-modify-write; in the database every
 * write is checked ("has anyone changed this since I read it?") and retried, so several servers can't overwrite each other.
 */
export const DEMO_STORAGE = !!process.env.VERCEL;
// DATA_DIR lets tests (or a host) point file storage at an isolated folder.
const dir = process.env.DATA_DIR ? process.env.DATA_DIR : DEMO_STORAGE ? path.join(os.tmpdir(), "jc-roofing-data") : path.join(process.cwd(), "data");
const file = (n: string) => path.join(dir, `${n}.json`);

const sbUrl = () => process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
const sbKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const dbEnabled = () => !!(sbUrl() && sbKey());
export type StorageMode = "database" | "files" | "temporary";
export const storageMode = (): StorageMode => (dbEnabled() ? "database" : DEMO_STORAGE && !process.env.DATA_DIR ? "temporary" : "files");

// ---------- file backend ----------
async function fileRead<T>(name: string, fallback: T, valid: (v: unknown) => boolean): Promise<T> {
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
  // A damaged or wrong-shaped file is NEVER silently treated as empty (the next write would erase everything):
  // move it aside for recovery and carry on.
  const aside = `${file(name)}.corrupt-${Date.now()}`;
  console.error(`[store] ${name} is damaged; moved to ${aside}`);
  await fs.rename(file(name), aside).catch(() => {});
  return fallback;
}
async function fileWrite(name: string, data: unknown) {
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file(name)}.${process.pid}.tmp`; // atomic: never leave a half-written file behind
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file(name));
}

// ---------- database backend (Supabase REST, table "kv": key, value, version) ----------
async function sb(pathAndQuery: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  const key = sbKey()!;
  const headers: Record<string, string> = { apikey: key, "Content-Type": "application/json", ...(init.headers ?? {}) };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`; // legacy JWT-style keys; newer secret keys use apikey only
  return fetch(`${sbUrl()}/rest/v1/${pathAndQuery}`, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(8000) });
}
async function dbRead<T>(name: string, fallback: T, valid: (v: unknown) => boolean): Promise<{ value: T; version: number }> {
  const r = await sb(`kv?key=eq.${encodeURIComponent(name)}&select=value,version`);
  if (!r.ok) throw new Error(`Database read failed (${r.status})`);
  const rows = (await r.json()) as { value: unknown; version: number }[];
  if (!rows.length) return { value: fallback, version: 0 };
  // Fail closed: never overwrite something we can't understand.
  if (!valid(rows[0].value)) throw new Error(`Database value "${name}" has an unexpected shape`);
  return { value: rows[0].value as T, version: rows[0].version };
}
/** Compare-and-swap write. Returns false if someone else changed the row since we read it. */
async function dbWrite(name: string, value: unknown, version: number): Promise<boolean> {
  if (version === 0) {
    const r = await sb("kv", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ key: name, value, version: 1 }) });
    if (r.status === 409) return false; // another server created it first
    if (!r.ok) throw new Error(`Database insert failed (${r.status})`);
    return true;
  }
  const r = await sb(`kv?key=eq.${encodeURIComponent(name)}&version=eq.${version}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ value, version: version + 1, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`Database update failed (${r.status})`);
  return ((await r.json()) as unknown[]).length > 0;
}

// ---------- shared plumbing ----------
// Serialise cycles per document inside one server so a burst of requests doesn't fight itself.
const locks = new Map<string, Promise<unknown>>();
function locked<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const run = (locks.get(name) ?? Promise.resolve()).then(fn, fn);
  locks.set(name, run.catch(() => {}));
  return run;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readDoc<T>(name: string, fallback: T, valid: (v: unknown) => boolean = () => true): Promise<T> {
  return dbEnabled() ? (await dbRead(name, fallback, valid)).value : fileRead(name, fallback, valid);
}
/** Read, let `fn` change the value in place, save. `fn` may run more than once (database retries): keep it free of side effects. */
function mutateDoc<T, R>(name: string, fallback: () => T, valid: (v: unknown) => boolean, fn: (value: T) => R | Promise<R>): Promise<R> {
  return locked(name, async () => {
    if (!dbEnabled()) {
      const v = await fileRead(name, fallback(), valid);
      const r = await fn(v);
      await fileWrite(name, v);
      return r;
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      const { value, version } = await dbRead(name, fallback(), valid);
      const r = await fn(value);
      if (await dbWrite(name, value, version)) return r;
      await sleep(15 + Math.random() * 45 * (attempt + 1)); // another server won: back off a little, re-read, redo
    }
    throw new Error("The database is busy. Please try again.");
  });
}

const isArr = Array.isArray;
const isSettings = (v: unknown) => {
  const s = v as Settings;
  return !!s && typeof s === "object" && isArr(s.materials) && s.materials.length > 0 && isArr(s.serviceAreaPrefixes) &&
    typeof s.weeksBacklog === "number" && typeof s.minJobValue === "number" && typeof s.paused === "boolean";
};

// ---------- settings ----------
const defaults = () => structuredClone(defaultSettings) as unknown as Settings;
// Older saved settings may predate newer options: fill any gaps from the bundled defaults.
const withDefaults = (s: Settings): Settings => ({ ...defaults(), ...s, prices: { ...defaults().prices, ...(s.prices ?? {}) } });
// Falls back to the settings bundled with the build, so a fresh server always has working rates.
export const getSettings = async () => {
  try {
    return withDefaults(await readDoc<Settings>("settings", defaults(), isSettings));
  } catch (e) {
    // If the database can't be reached the form must still load; saving an enquiry will fail cleanly with its own message.
    console.error("[store] could not read settings, using defaults:", (e as Error).message);
    return defaults();
  }
};
export const saveSettings = (s: Settings) =>
  mutateDoc<Settings, void>("settings", defaults, isSettings, (v) => {
    for (const k of Object.keys(v)) delete (v as unknown as Record<string, unknown>)[k];
    Object.assign(v, s);
  });

// ---------- leads ----------
export const getLeads = () => readDoc<Lead[]>("leads", [], isArr);
export const addLead = (lead: Lead) => mutateDoc<Lead[], void>("leads", () => [], isArr, (leads) => { leads.unshift(lead); });
/** Atomically read, change and save the leads list. Return value of `fn` is passed back. */
export const updateLeads = <R>(fn: (leads: Lead[]) => R | Promise<R>) => mutateDoc<Lead[], R>("leads", () => [], isArr, fn);

// ---------- messages ----------
// Outbox: what was (or would be) texted / emailed. "preview" = not really sent (no provider keys yet).
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
export const getOutbox = () => readDoc<Message[]>("outbox", [], isArr);
export const addMessage = (m: Omit<Message, "id" | "at">) =>
  mutateDoc<Message[], void>("outbox", () => [], isArr, (box) => {
    box.unshift({ ...m, id: crypto.randomUUID(), at: new Date().toISOString() });
    if (box.length > 200) box.length = 200;
  });
export const deleteMessagesForLead = (lead: Pick<Lead, "id" | "phone" | "email">) =>
  mutateDoc<Message[], void>("outbox", () => [], isArr, (box) => {
    const keep = box.filter((m) => m.leadId !== lead.id && m.to !== lead.phone && m.to !== lead.email);
    box.length = 0;
    box.push(...keep);
  });

// ---------- anonymous funnel events (no personal data) ----------
export type Ev = { at: string; sid: string; step: string };
export const getEvents = () => readDoc<Ev[]>("events", [], isArr);
export const addEvent = (sid: string, step: string) =>
  mutateDoc<Ev[], void>("events", () => [], isArr, (ev) => {
    ev.push({ at: new Date().toISOString(), sid, step });
    const cap = dbEnabled() ? 2000 : 5000; // each write rewrites the whole list, so keep it modest in the database
    if (ev.length > cap) ev.splice(0, ev.length - cap);
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
  const gone = await updateLeads((leads) => {
    const removed: Lead[] = [];
    for (let i = leads.length - 1; i >= 0; i--) {
      const l = leads[i];
      const age = (Date.now() - new Date(l.createdAt).getTime()) / DAY;
      if (age > RETAIN_ALL_DAYS || (age > RETAIN_UNBOOKED_DAYS && !l.inspectionBooked && l.status !== "won")) removed.push(...leads.splice(i, 1));
    }
    return removed;
  });
  for (const l of gone) await deleteMessagesForLead(l);
  return gone.length;
}
