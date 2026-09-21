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
    <div className="min-w-0 rounded-xl bg-white p-3 ring-1 ring-sand">
      <div role="radiogroup" aria-label="Choose a day" className="-mx-1 mb-3 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1">
        {days.map((d) => (
          <button key={iso(d)} type="button" role="radio" aria-checked={day === iso(d)} onClick={() => { setDay(iso(d)); setTime(""); }}
            className={`w-[58px] flex-none snap-start rounded-xl border-[1.5px] py-1.5 text-center text-[13px] leading-tight ${day === iso(d) ? "border-brand bg-brand-tint" : "border-sand"}`}>
            {d.toLocaleDateString("en-GB", { weekday: "short" })}<br /><b className="text-[17px]">{d.getDate()}</b>
            <span className="block text-[11px] text-mute">{d.toLocaleDateString("en-GB", { month: "short" })}</span>
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Choose a time" className="grid grid-cols-3 gap-1.5">
        {SLOTS.map((t) => {
          const gone = taken.includes(`${day}T${t}:00`);
          return (
            <button key={t} type="button" role="radio" aria-checked={time === t} disabled={gone} onClick={() => setTime(t)}
              className={`rounded-xl border-[1.5px] py-2 text-center text-[15px] font-semibold ${gone ? "border-sand text-sand line-through" : time === t ? "border-brand bg-brand text-white" : "border-sand text-ink hover:border-brand"}`}>
              {t}
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-1.5 min-h-4 text-[13px] text-brand">{err}</p>
      {time && (
        <button type="button" disabled={busy} onClick={confirm} className="w-full rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-brand-dark disabled:opacity-40">
          {busy ? "Booking…" : `Confirm ${new Date(`${day}T12:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at ${time}`}
        </button>
      )}
      <p className="mt-2 text-[12px] text-mute">Free, no obligation. About 30 minutes on site.</p>
    </div>
  );
}
