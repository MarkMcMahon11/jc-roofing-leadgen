"use client";

import { useState } from "react";
import { fmtDay } from "@/lib/ops/format";

type Current = { action: "confirm" | "decline"; date?: string; note?: string };

export function SupplierReply({ token, deliverBy, current }: { token: string; deliverBy: string; current?: Current }) {
  const [date, setDate] = useState(current?.date ?? deliverBy);
  const [note, setNote] = useState(current?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"confirm" | "decline" | null>(null);
  const [error, setError] = useState("");
  const min = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());

  async function send(action: "confirm" | "decline") {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/supplier/order", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, action, date: action === "confirm" ? date : undefined, note: note.trim() || undefined }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "That didn't go through. Please try again or phone us.");
      setDone(action);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
        {done === "confirm" ? "Thank you. We've been told you'll deliver on that date." : "Thanks for letting us know. We'll order it elsewhere."} You can change your answer by opening this link again.
      </p>
    );

  return (
    <div className="space-y-3">
      {current && <p className="rounded-xl bg-cream p-3 text-sm">{current.action === "confirm" ? `You confirmed delivery for ${current.date ? fmtDay(current.date) : "the requested date"}.` : "You said you can't supply this."} You can change it below.</p>}
      <label className="block text-sm font-semibold">
        Delivery date
        <input type="date" value={date} min={min} onChange={(e) => setDate(e.target.value)} className="mt-1 block w-full rounded-xl border-[1.5px] border-line bg-white px-3 py-2.5 text-base" />
      </label>
      <label className="block text-sm font-semibold">
        Note (optional)
        <textarea value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Slates are on a 3 day lead time, driver will phone on the morning" className="mt-1 block min-h-20 w-full rounded-xl border-[1.5px] border-line bg-white px-3 py-2.5 text-base" />
      </label>
      {error && <p role="alert" className="rounded-xl border border-brand bg-brand-tint p-3 text-sm text-brand">{error}</p>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={busy || !date} onClick={() => void send("confirm")} className="min-h-12 flex-1 rounded-xl bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark disabled:opacity-60">{busy ? "Sending…" : "Confirm delivery"}</button>
        <button type="button" disabled={busy} onClick={() => void send("decline")} className="min-h-12 flex-1 rounded-xl border-[1.5px] border-line bg-white px-4 py-2 font-semibold hover:bg-cream disabled:opacity-60">We can&apos;t supply this</button>
      </div>
    </div>
  );
}
