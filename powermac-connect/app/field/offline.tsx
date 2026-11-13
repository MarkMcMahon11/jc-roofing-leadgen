"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { CloudOff, RefreshCw, CheckCircle2 } from "lucide-react";
import { runFieldCall, type FieldCall } from "./actions";

const KEY = "pmc_field_outbox";
const EVENT = "pmc-outbox-change";

function read(): FieldCall[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as FieldCall[]; } catch { return []; }
}
function write(items: FieldCall[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage full or blocked */ }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const pendingCount = () => read().length;
const isOnline = () => navigator.onLine;

export const newRef = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

let flushing = false;
async function flush() {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    for (;;) {
      const [next] = read();
      if (!next) break;
      try {
        await runFieldCall(next); // applied, duplicate, or rejected by validation: either way it leaves the queue
      } catch {
        break; // still offline / server unreachable: keep it and try again later
      }
      write(read().filter((c) => c.ref !== next.ref));
    }
  } finally {
    flushing = false;
  }
}

/** Send a field update now, or queue it when there is no connection. */
export function useFieldSend() {
  return useCallback(async (call: FieldCall): Promise<{ ok: boolean; queued?: boolean; message?: string }> => {
    if (!navigator.onLine) {
      write([...read(), call]);
      return { ok: true, queued: true };
    }
    try {
      const r = await runFieldCall(call);
      return r;
    } catch {
      write([...read(), call]);
      return { ok: true, queued: true };
    }
  }, []);
}

export function OfflineBar() {
  const pending = useSyncExternalStore(subscribe, pendingCount, () => 0);
  const online = useSyncExternalStore(subscribe, isOnline, () => true);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const go = async () => {
      const before = read().length;
      await flush();
      if (before > 0 && read().length === 0) { setSynced(true); setTimeout(() => setSynced(false), 4000); }
    };
    go();
    window.addEventListener("online", go);
    const id = setInterval(go, 30_000);
    return () => { window.removeEventListener("online", go); clearInterval(id); };
  }, []);

  if (online && pending === 0 && !synced) return null;
  return (
    <div role="status" className={`flex items-center gap-2 px-4 py-2 text-[13px] ${online ? "bg-accent-lo text-[#b5d1ff]" : "bg-warn-lo text-[#ffd79a]"}`}>
      {!online ? <CloudOff className="size-4" aria-hidden /> : synced ? <CheckCircle2 className="size-4 text-ok" aria-hidden /> : <RefreshCw className="size-4 animate-spin" aria-hidden />}
      {!online
        ? `Offline. ${pending ? `${pending} update${pending === 1 ? "" : "s"} saved on this phone - ` : ""}will send when you have signal.`
        : synced ? "All updates sent." : `Sending ${pending} saved update${pending === 1 ? "" : "s"}…`}
    </div>
  );
}
