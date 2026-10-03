"use client";

// Data layer for the owner dashboard.
// - Fleet data (vans, crew, jobs ...): every change goes through `mutate`, which updates the screen at once and then
//   saves only the records that changed. Failed saves are queued and retried, so a flaky connection loses nothing.
//   Changes made on another device are picked up every few seconds.
// - Business data (enquiries, quote prices, messages): loaded from /api/admin and refreshed in the background.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/store";
import type { Lead, Settings } from "@/lib/types";
import { applyPending, diff, keyOf, sortDB, type Change } from "./sync";
import { today } from "./format";
import type { FleetDB } from "./types";

export type SyncState = "saved" | "saving" | "error" | "rejected";

export type LeadPhotoView = { path: string; url?: string; hint?: string | null; assessment?: { material: string; condition: string; affectedPercent: number | null; confidence: "low" | "medium" | "high"; caveat: string } | null };
export type LeadView = Omit<Lead, "photos"> & { photos?: LeadPhotoView[] };
export type Biz = { settings: Settings; leads: LeadView[]; outbox: Message[]; funnel: Record<string, number>; storage: "database" | "files" | "temporary" };

type Ctx = {
  db: FleetDB;
  biz: Biz;
  sync: SyncState;
  notice: string;
  clearNotice: () => void;
  /** Today's UK date; changes at midnight even if the page stays open. */
  day: string;
  /** Change the fleet data. `fn` edits a draft copy; its return value is passed back. */
  mutate: <R>(fn: (draft: FleetDB) => R) => R | undefined;
  resetFleet: (mode: "sample" | "empty") => Promise<boolean>;
  reloadBiz: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<string | null>;
  setLeadStatus: (id: string, status: Lead["status"]) => Promise<string | null>;
  deleteLead: (id: string) => Promise<string | null>;
};

const OpsCtx = createContext<Ctx | null>(null);
const FLEET_POLL_MS = 15_000;
const BIZ_POLL_MS = 60_000;
const BATCH = 100;

function toLogin() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- session ended: a full reload shows the sign-in page
  window.location.href = "/admin/login";
}

export function OpsProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<FleetDB | null>(null);
  const [biz, setBiz] = useState<Biz | null>(null);
  const [sync, setSync] = useState<SyncState>("saved");
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");
  const [day, setDay] = useState(today());
  const bizText = useRef("");
  const bizSetAt = useRef(0);
  const dbRef = useRef<FleetDB | null>(null);
  const pending = useRef(new Map<string, Change>());
  const flushing = useRef(false);
  const rev = useRef(0);

  const commit = useCallback((next: FleetDB) => {
    dbRef.current = next;
    setDb(next);
  }, []);

  const loadFleet = useCallback(
    async (force = false) => {
      const res = await fetch(force ? "/api/fleet" : `/api/fleet?rev=${rev.current}`, { cache: "no-store" });
      if (res.status === 401) return toLogin();
      if (!res.ok) throw new Error("load failed");
      const body = (await res.json()) as { unchanged?: boolean; doc?: FleetDB };
      if (body.unchanged || !body.doc) return;
      // a slow poll that was already in flight when we saved must not put an older copy back on screen
      if (!force && body.doc.rev < rev.current) return;
      rev.current = body.doc.rev;
      commit(sortDB(applyPending(body.doc, pending.current.values())));
    },
    [commit],
  );

  const loadBiz = useCallback(async () => {
    const res = await fetch("/api/admin", { cache: "no-store" });
    if (res.status === 401) return toLogin();
    if (!res.ok) throw new Error("load failed");
    const text = await res.text();
    // photo links are re-signed on every request, so compare without them; but refresh them before they expire (they last an hour)
    const sameData = text.replace(/"url":"[^"]*"/g, "") === bizText.current.replace(/"url":"[^"]*"/g, "");
    if (!sameData || Date.now() - bizSetAt.current > 25 * 60_000) {
      bizText.current = text;
      bizSetAt.current = Date.now();
      setBiz(JSON.parse(text) as Biz);
    }
  }, []);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (pending.current.size) {
        const batch = [...pending.current.values()].slice(0, BATCH);
        setSync("saving");
        const rows = batch.filter((c) => c.type === "row").map((c) => ({ collection: c.collection, id: c.id, data: (c as { data: unknown }).data }));
        const deletes = batch.filter((c) => c.type === "del").map((c) => ({ collection: c.collection, id: c.id }));
        const res = await fetch("/api/fleet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows, deletes }) });
        if (res.status === 401) return toLogin();
        if (res.status === 400 || res.status === 413) {
          // the server will never accept this batch: drop it, say why, and show the saved truth again
          const err = ((await res.json().catch(() => ({}))) as { error?: string }).error;
          for (const c of batch) pending.current.delete(keyOf(c));
          setNotice(`Some changes could not be saved${err ? `: ${err}` : "."}`);
          setSync("rejected");
          await loadFleet(true).catch(() => {});
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const saved = (await res.json()) as { rev?: number };
        // if exactly our change was the next revision nobody else wrote in between; otherwise leave it so the next poll fetches theirs
        if (typeof saved.rev === "number" && saved.rev === rev.current + 1) rev.current = saved.rev;
        // only forget what was sent and hasn't been changed again since
        for (const c of batch) if (pending.current.get(keyOf(c)) === c) pending.current.delete(keyOf(c));
      }
      setSync("saved");
    } catch {
      setSync("error"); // kept in the queue; retried on the next poll or when the window regains focus
    } finally {
      flushing.current = false;
    }
  }, [loadFleet]);

  const pollFleet = useCallback(async () => {
    if (!dbRef.current) return;
    await flush();
    if (pending.current.size) return;
    try {
      await loadFleet();
    } catch {}
  }, [flush, loadFleet]);

  useEffect(() => {
    Promise.all([loadFleet(true), loadBiz()]).catch(() => setFailed(true));
    // nothing is polled while the tab is in the background
    const visible = () => document.visibilityState === "visible";
    const a = setInterval(() => visible() && void pollFleet(), FLEET_POLL_MS);
    const b = setInterval(() => {
      if (!visible()) return;
      setDay(today());
      void loadBiz().catch(() => {});
    }, BIZ_POLL_MS);
    const wake = () => {
      if (visible()) {
        setDay(today());
        void pollFleet();
        void loadBiz().catch(() => {});
      }
    };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(a);
      clearInterval(b);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [loadFleet, loadBiz, pollFleet]);

  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (pending.current.size) e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  const mutate = useCallback(
    <R,>(fn: (draft: FleetDB) => R): R | undefined => {
      const prev = dbRef.current;
      if (!prev) return undefined;
      const draft = structuredClone(prev);
      const result = fn(draft);
      commit(sortDB(draft));
      for (const ch of diff(prev, draft)) pending.current.set(keyOf(ch), ch);
      void flush();
      return result;
    },
    [commit, flush],
  );

  const resetFleet = useCallback(
    async (mode: "sample" | "empty") => {
      pending.current.clear();
      setSync("saving");
      try {
        const res = await fetch("/api/fleet/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) });
        if (res.status === 401) {
          toLogin();
          return false;
        }
        if (!res.ok) throw new Error();
        const body = (await res.json()) as { doc: FleetDB };
        rev.current = body.doc.rev;
        commit(sortDB(body.doc));
        setSync("saved");
        return true;
      } catch {
        setSync("error");
        return false;
      }
    },
    [commit],
  );

  const putAdmin = useCallback(
    async (body: object): Promise<string | null> => {
      const res = await fetch("/api/admin", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 401) {
        toLogin();
        return "Signed out";
      }
      if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Please try again.";
      await loadBiz().catch(() => {});
      return null;
    },
    [loadBiz],
  );

  if (failed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-mute">
        <p>We couldn&apos;t load your dashboard. Check the connection and try again.</p>
        <button onClick={() => location.reload()} className="min-h-11 rounded-xl bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark">
          Try again
        </button>
      </div>
    );
  }

  if (!db || !biz) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-sand border-t-brand" />
      </div>
    );
  }

  return (
    <OpsCtx.Provider
      value={{
        db,
        biz,
        sync,
        notice,
        clearNotice: () => setNotice(""),
        day,
        mutate,
        resetFleet,
        reloadBiz: () => loadBiz().catch(() => {}),
        saveSettings: (s) => putAdmin({ settings: s }),
        setLeadStatus: (id, status) => putAdmin({ leadStatus: { id, status } }),
        deleteLead: (id) => putAdmin({ deleteLead: id }),
      }}
    >
      {children}
    </OpsCtx.Provider>
  );
}

export function useOps() {
  const ctx = useContext(OpsCtx);
  if (!ctx) throw new Error("useOps outside OpsProvider");
  return ctx;
}
