"use client";
import { useEffect, useState } from "react";
import { InlineWidget } from "react-calendly";

type Mat = { id: string; label: string; blurb: string; colours: string[] };
type Cfg = { businessName: string; paused: boolean; materials: Mat[] };
type Result = { inArea: boolean; score: string; low: number; high: number; roofAreaM2: number; earliestStart: string; paused: boolean };

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const STEPS = 5;

function Choice({ label, sub, on, onClick }: { label: string; sub?: string; on?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border-2 p-4 text-left text-lg transition ${on ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-400"}`}
    >
      <span className="font-semibold">{label}</span>
      {sub && <span className="block text-sm text-slate-500">{sub}</span>}
    </button>
  );
}

export default function QuoteWizard() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [step, setStep] = useState(1);
  const [d, setD] = useState<Record<string, string | boolean>>({ consent: false });
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/quote").then((r) => r.json()).then(setCfg);
  }, []);

  const set = (k: string, v: string | boolean) => setD((p) => ({ ...p, [k]: v }));
  const next = () => { setErr(""); setStep((s) => s + 1); };
  const pick = (k: string, v: string) => { set(k, v); next(); };

  async function submit() {
    if (!d.name || !d.phone || !d.email) return setErr("Please fill in your name, mobile and email.");
    if (!d.consent) return setErr("Please tick the box so we can contact you.");
    setBusy(true);
    const res = await fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
    setBusy(false);
    if (!res.ok) return setErr("Something went wrong. Please try again.");
    setResult(await res.json());
    setStep(STEPS + 1);
  }

  if (!cfg) return <p className="p-8 text-center text-slate-500">Loading…</p>;
  const mat = cfg.materials.find((m) => m.id === d.material);
  const calendly = process.env.NEXT_PUBLIC_CALENDLY_URL;

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="text-2xl font-bold">{cfg.businessName}</h1>
      <p className="mb-4 text-slate-600">Free roof price in 2 minutes. No phone call needed.</p>
      {step <= STEPS && (
        <div className="mb-6 h-2 rounded bg-slate-200"><div className="h-2 rounded bg-blue-600 transition-all" style={{ width: `${(step / STEPS) * 100}%` }} /></div>
      )}
      {cfg.paused && step === 1 && (
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-amber-800">We&apos;re very busy right now, but you can still get a price and join the waiting list.</p>
      )}

      {step === 1 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What&apos;s the address of the property?</h2>
          <input className="w-full rounded-xl border-2 p-4 text-lg" placeholder="House number and street" autoComplete="street-address" value={(d.address as string) ?? ""} onChange={(e) => set("address", e.target.value)} />
          <input className="w-full rounded-xl border-2 p-4 text-lg uppercase" placeholder="Postcode" autoComplete="postal-code" value={(d.postcode as string) ?? ""} onChange={(e) => set("postcode", e.target.value)} />
          <button className="w-full rounded-2xl bg-blue-600 p-4 text-lg font-semibold text-white disabled:opacity-40" disabled={!d.address || !d.postcode} onClick={next}>Next</button>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What type of property?</h2>
          {[["tenement", "Tenement / flat"], ["semi", "Semi-detached or terraced"], ["detached", "Detached house"], ["bungalow", "Bungalow"]].map(([v, l]) => <Choice key={v} label={l} on={d.propertyType === v} onClick={() => set("propertyType", v)} />)}
          <h2 className="pt-2 text-xl font-semibold">How old is the home?</h2>
          {[["pre-1919", "Before 1919"], ["1919-1960", "1919 – 1960"], ["1960-2000", "1960 – 2000"], ["newer", "After 2000"]].map(([v, l]) => <Choice key={v} label={l} on={d.homeAge === v} onClick={() => set("homeAge", v)} />)}
          <h2 className="pt-2 text-xl font-semibold">Is it listed or in a conservation area?</h2>
          <div className="grid grid-cols-3 gap-2">
            {[["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]].map(([v, l]) => <Choice key={v} label={l} on={d.listed === v} onClick={() => set("listed", v)} />)}
          </div>
          <button className="w-full rounded-2xl bg-blue-600 p-4 text-lg font-semibold text-white disabled:opacity-40" disabled={!d.propertyType || !d.homeAge || !d.listed} onClick={next}>Next</button>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What do you need done?</h2>
          {[["full", "Full new roof"], ["repair", "A repair"], ["unsure", "Not sure yet"]].map(([v, l]) => <Choice key={v} label={l} on={d.jobType === v} onClick={() => set("jobType", v)} />)}
          <h2 className="pt-2 text-xl font-semibold">Which material would you like?</h2>
          {cfg.materials.map((m) => <Choice key={m.id} label={m.label} sub={m.blurb} on={d.material === m.id} onClick={() => { set("material", m.id); set("colour", m.colours[0]); }} />)}
          {mat && (
            <>
              <h2 className="pt-2 text-xl font-semibold">Colour</h2>
              <div className="grid grid-cols-2 gap-2">
                {mat.colours.map((c) => <Choice key={c} label={c} on={d.colour === c} onClick={() => set("colour", c)} />)}
              </div>
            </>
          )}
          <button className="w-full rounded-2xl bg-blue-600 p-4 text-lg font-semibold text-white disabled:opacity-40" disabled={!d.jobType || !d.material} onClick={() => { set("currentMaterial", "unknown"); next(); }}>Next</button>
        </section>
      )}

      {step === 4 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">How soon do you need it?</h2>
          <Choice label="Urgent – it's leaking" onClick={() => pick("urgency", "urgent")} />
          <Choice label="Within the next 3 months" onClick={() => pick("urgency", "3-months")} />
          <Choice label="Just getting a price for now" onClick={() => pick("urgency", "pricing")} />
        </section>
      )}

      {step === 5 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Where should we send your price?</h2>
          <input className="w-full rounded-xl border-2 p-4 text-lg" placeholder="Your name" autoComplete="name" onChange={(e) => set("name", e.target.value)} />
          <input className="w-full rounded-xl border-2 p-4 text-lg" placeholder="Mobile number" inputMode="tel" autoComplete="tel" onChange={(e) => set("phone", e.target.value)} />
          <input className="w-full rounded-xl border-2 p-4 text-lg" placeholder="Email" inputMode="email" autoComplete="email" onChange={(e) => set("email", e.target.value)} />
          <label className="flex gap-3 text-sm text-slate-600"><input type="checkbox" className="mt-1 h-5 w-5" onChange={(e) => set("consent", e.target.checked)} /> I agree to {cfg.businessName} contacting me about this enquiry by text, email or phone and storing my details for that purpose.</label>
          {err && <p className="text-red-600">{err}</p>}
          <button className="w-full rounded-2xl bg-blue-600 p-4 text-lg font-semibold text-white disabled:opacity-40" disabled={busy} onClick={submit}>{busy ? "Measuring your roof…" : "Show my price"}</button>
        </section>
      )}

      {step === STEPS + 1 && result && (
        <section className="space-y-4">
          {!result.inArea ? (
            <div className="rounded-2xl bg-slate-100 p-5">
              <h2 className="text-xl font-semibold">Sorry, we don&apos;t cover your area yet</h2>
              <p className="mt-2 text-slate-600">We&apos;ve kept your details and will let you know if that changes.</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-blue-600 p-5 text-white">
                <p className="text-sm opacity-80">Estimated price for your {mat?.label.toLowerCase()} roof (about {result.roofAreaM2} m²)</p>
                <p className="text-3xl font-bold">{gbp(result.low)} – {gbp(result.high)}</p>
                <p className="mt-2 text-sm opacity-90">Final price confirmed at a free inspection.</p>
              </div>
              <div className="rounded-2xl border-2 p-4">
                <p className="font-semibold">Earliest start: around {new Date(result.earliestStart).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
                <p className="text-sm text-slate-500">Estimate only – depends on the current work queue and weather.</p>
              </div>
              <h2 className="text-xl font-semibold">Book your free inspection</h2>
              {calendly ? (
                <InlineWidget url={calendly} prefill={{ name: d.name as string, email: d.email as string, customAnswers: { a1: `${d.address}, ${d.postcode}` } }} styles={{ height: "680px" }} />
              ) : (
                <p className="rounded-xl bg-amber-50 p-3 text-amber-800">Booking calendar not connected yet. We&apos;ll text you shortly to arrange a time.</p>
              )}
            </>
          )}
        </section>
      )}
      {step > 1 && step <= STEPS && <button className="mt-4 text-slate-500 underline" onClick={() => setStep((s) => s - 1)}>Back</button>}
    </main>
  );
}
