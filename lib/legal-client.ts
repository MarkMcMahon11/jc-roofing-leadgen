"use client";
// Browser side of the privacy pop-up: the acceptance lives in localStorage first (so the app is never blocked),
// and is sent to the server too. A failed send is remembered and retried on the next visit.
import { useSyncExternalStore } from "react";
import { makeAcceptance, needsAcceptance, parseAcceptance, STORAGE_KEY, type Acceptance, type Consents } from "./legal";

const DEVICE_KEY = "jc-roofing-device";
const PENDING_KEY = "jc-roofing-legal-pending";
const listeners = new Set<() => void>();

const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeSet = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode or storage blocked: the pop-up simply shows again next time */
  }
};

/** A random id for this browser (no personal data); links its privacy records on the server. */
export function deviceId(): string {
  let id = safeGet(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    safeSet(DEVICE_KEY, id);
  }
  return id;
}

export const readAcceptance = (): Acceptance | null => parseAcceptance(safeGet(STORAGE_KEY));

// useSyncExternalStore needs a stable snapshot: the raw stored string is stable until it changes.
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  const onStorage = () => fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
};
/** "unknown" while rendering on the server (no localStorage there), then whether the pop-up must show. */
export function useLegalStatus(): "unknown" | "needed" | "accepted" {
  const raw = useSyncExternalStore(subscribe, () => safeGet(STORAGE_KEY) ?? "", () => null);
  if (raw === null) return "unknown";
  return needsAcceptance(raw) ? "needed" : "accepted";
}

async function send(action: "accept" | "choices", a: Acceptance): Promise<boolean> {
  try {
    const r = await fetch("/api/legal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, deviceId: deviceId(), version: a.version, consents: a.consents }),
      keepalive: true,
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Save the choices locally straight away, then record them on the server (retried later if that fails). */
export function saveAcceptance(consents: Consents, action: "accept" | "choices" = "accept"): Acceptance {
  const a = makeAcceptance(consents);
  safeSet(STORAGE_KEY, JSON.stringify(a));
  listeners.forEach((fn) => fn());
  safeSet(PENDING_KEY, action);
  void send(action, a).then((ok) => ok && safeSet(PENDING_KEY, null));
  return a;
}

/** On each visit: if an earlier server save failed, try it again. */
export function retryPending() {
  const action = safeGet(PENDING_KEY);
  const a = readAcceptance();
  if (!action || !a) return;
  void send(action === "choices" ? "choices" : "accept", a).then((ok) => ok && safeSet(PENDING_KEY, null));
}

/** What this browser holds, for "Download my data". */
export function localData() {
  let quote: unknown = null;
  try {
    quote = JSON.parse(sessionStorage.getItem("jc-quote-v2") ?? "null");
  } catch {
    /* ignore */
  }
  return { deviceId: safeGet(DEVICE_KEY), privacyChoices: readAcceptance(), quoteInProgressInThisTab: quote };
}

// ---- owner / manager: the Service Agreement + DPA accepted on behalf of the business ----
export const OWNER_KEY = "jc-roofing-owner-agreement";
type OwnerLocal = { version: string; at: string; name: string; pending: boolean };
const readOwner = (): OwnerLocal | null => {
  try {
    const v = JSON.parse(safeGet(OWNER_KEY) ?? "null") as OwnerLocal | null;
    return v && typeof v.version === "string" && typeof v.at === "string" ? v : null;
  } catch {
    return null;
  }
};
/** The owner's acceptance kept in this browser: null on the server render, "" if none. */
export const useOwnerLocal = () => useSyncExternalStore(subscribe, () => safeGet(OWNER_KEY) ?? "", () => null);
export const ownerLocal = readOwner;

async function sendOwner(consents: Consents, name: string): Promise<boolean> {
  try {
    const r = await fetch("/api/admin/legal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept-agreement", consents, name }) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Record the owner's acceptance: in this browser at once (never blocks the dashboard), then on the server. Resolves true once the server has it. */
export async function saveOwnerAcceptance(consents: Consents, name: string, version: string): Promise<boolean> {
  safeSet(OWNER_KEY, JSON.stringify({ version, at: new Date().toISOString(), name, pending: true } satisfies OwnerLocal));
  listeners.forEach((fn) => fn());
  const ok = await sendOwner(consents, name);
  if (ok) {
    const cur = readOwner();
    if (cur) safeSet(OWNER_KEY, JSON.stringify({ ...cur, pending: false }));
  }
  return ok;
}

/** Retry an owner acceptance whose server save failed earlier. */
export async function retryOwnerPending(consents: Consents): Promise<boolean> {
  const cur = readOwner();
  if (!cur?.pending) return false;
  const ok = await sendOwner(consents, cur.name);
  if (ok) safeSet(OWNER_KEY, JSON.stringify({ ...cur, pending: false }));
  return ok;
}
