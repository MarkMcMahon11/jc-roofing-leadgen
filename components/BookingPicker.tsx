"use client";
import { useEffect, useMemo, useState } from "react";
import { SLOTS } from "@/lib/booking";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function BookingPicker({ leadId, onBooked }: { leadId: string; onBooked: (when: string) => void }) {
  const days = useMemo(() => {
    const out: Date[] = [];
    const d = new Date();
    d.setDate(d.getDate() + 2);
    while (out.length < 8) {
      if (d.getDay() !== 0 && d.getDay() !== 6) out.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, []);
  const [day, setDay] = useState(iso(days[0]));
  const [time, setTime] = useState("");
  const [taken, setTaken] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/book").then((r) => r.json()).then((j) => setTaken(j.taken ?? [])).catch(() => {});
  }, []);

  async function confirm() {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leadId, day, time }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) {
      setErr(j.error ?? "Something went wrong. Please try again.");
      if (r.status === 409) setTaken((t) => [...t, `${day}T${time}:00`]);
      setTime("");
      return;
    }
    onBooked(j.when);
  }

  return (
    <div className="rounded-2xl border-2 border-sand bg-white p-3">
      <div role="radiogroup" aria-label="Choose a day" className="mb-3 grid grid-cols-4 gap-1.5">
        {days.map((d) => (
          <button key={iso(d)} type="button" role="radio" aria-checked={day === iso(d)} onClick={() => { setDay(iso(d)); setTime(""); }}
            className={`rounded-xl border-2 py-2 text-center text-sm ${day === iso(d) ? "border-brand bg-brand-tint" : "border-sand"}`}>
            {d.toLocaleDateString("en-GB", { weekday: "short" })}<br /><b className="text-base">{d.getDate()}</b>
            <span className="block text-[11px] text-mute">{d.toLocaleDateString("en-GB", { month: "short" })}</span>
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Choose a time" className="grid grid-cols-3 gap-1.5">
        {SLOTS.map((t) => {
          const gone = taken.includes(`${day}T${t}:00`);
          return (
            <button key={t} type="button" role="radio" aria-checked={time === t} disabled={gone} onClick={() => setTime(t)}
              className={`rounded-xl border-2 py-2.5 text-center font-semibold ${gone ? "border-sand text-sand line-through" : time === t ? "border-brand bg-brand text-white" : "border-brand text-brand"}`}>
              {t}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-brand">{err}</p>
      {time && (
        <button type="button" disabled={busy} onClick={confirm} className="w-full rounded-2xl bg-brand p-3.5 text-lg font-semibold text-white hover:bg-brand-dark disabled:opacity-40">
          {busy ? "Booking…" : `Confirm ${new Date(`${day}T12:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at ${time}`}
        </button>
      )}
      <p className="mt-2 text-xs text-mute">Free, no obligation. About 30 minutes on site.</p>
    </div>
  );
}
