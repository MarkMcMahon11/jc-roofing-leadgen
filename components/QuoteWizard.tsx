"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import AddressField, { type Place } from "./AddressField";
import Link from "next/link";
import { InlineWidget } from "react-calendly";
import BookingPicker from "./BookingPicker";

type Mat = { id: string; label: string; blurb: string; colours: string[] };
type Cfg = { businessName: string; paused: boolean; placesEnabled: boolean; materials: Mat[] };
type Result = { id: string; inArea: boolean; score: string; low: number; high: number; roofAreaM2: number; earliestStart: string; paused: boolean };

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const STEPS = 5;
const PHONE = "07808 528293";

function Choice({ label, sub, on, onClick }: { label: string; sub?: string; on?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border-2 border-sand bg-white p-4 text-left text-lg transition ${on ? "border-brand bg-brand-tint" : "border-sand bg-white hover:border-ink"}`}
    >
      <span className="font-semibold">{label}</span>
      {sub && <span className="block text-sm text-mute">{sub}</span>}
    </button>
  );
}

export default function QuoteWizard() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [step, setStep] = useState(1);
  const [d, setD] = useState<Record<string, string | number | boolean | undefined>>({ consent: false });
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [manual, setManual] = useState(false);
  const [booked, setBooked] = useState("");
  const sid = useRef("");
  const place: Place | null = d.placeId ? { placeId: d.placeId as string, address: d.address as string, postcode: d.postcode as string, lat: d.lat as number, lng: d.lng as number } : null;
  const pcOk = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(((d.postcode as string) ?? "").trim());

  useEffect(() => {
    sid.current = crypto.randomUUID();
    fetch("/api/quote").then((r) => r.json()).then(setCfg);
  }, []);

  // Anonymous funnel logging: random session id + step name only.
  const seen = useRef(new Set<string>());
  const track = (stepName: string) => {
    if (!sid.current || seen.current.has(stepName)) return;
    seen.current.add(stepName);
    fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid: sid.current, step: stepName }), keepalive: true }).catch(() => {});
  };
  useEffect(() => {
    if (!cfg) return;
    track(["", "start", "home", "roof", "timing", "contact", "price"][step] ?? "price");
    if (step === 2) track("address");
  });

  const set = (k: string, v: string | number | boolean | undefined) => setD((p) => ({ ...p, [k]: v }));
  const next = () => { setErr(""); setStep((s) => s + 1); };
  const pick = (k: string, v: string) => { set(k, v); next(); };

  async function submit() {
    if (!d.name || !d.phone || !d.email) return setErr("Please fill in your name, mobile and email.");
    if (!d.consent) return setErr("Please tick the box so we can contact you.");
    setBusy(true);
    const res = await fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
    setBusy(false);
    if (!res.ok) return setErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong. Please try again.");
    setResult(await res.json());
    setStep(STEPS + 1);
  }

  if (!cfg) return <p className="p-8 text-center text-mute">Loading…</p>;
  const mat = cfg.materials.find((m) => m.id === d.material);
  const calendly = process.env.NEXT_PUBLIC_CALENDLY_URL;

  return (
    <main className="mx-auto max-w-xl pb-8">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-sand bg-white px-4 py-2">
        <Image src="/logo.png" alt={cfg.businessName} width={512} height={198} priority className="h-11 w-auto" />
        <a href={`tel:${PHONE.replace(/\s/g, "")}`} className="rounded-full border-[1.5px] border-ink px-3 py-1.5 text-sm font-semibold">Call {PHONE}</a>
      </header>
      <div className="px-4 pt-5">
      {step === 1 && (
        <div className="mb-4">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">Get your roof price in 2 minutes</h1>
          <p className="mt-1.5 text-mute">Trusted, local and fully certified roofers in Dumfries &amp; Galloway. No phone call needed.</p>
          <ul className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
            <li className="rounded-full border border-sand bg-cream px-2.5 py-1">Trusted Trader</li>
            <li className="rounded-full border border-sand bg-cream px-2.5 py-1"><span className="text-[#b07a00]">★★★★★</span> 50+ reviews</li>
            <li className="rounded-full border border-sand bg-cream px-2.5 py-1">250+ customers</li>
          </ul>
        </div>
      )}
      {step <= STEPS && (
        <>
          <div className="mb-1.5 flex justify-between text-sm text-mute"><span>Step {step} of {STEPS}</span><span>{["", "About 90 seconds left", "About 75 seconds left", "About 45 seconds left", "About 30 seconds left", "Last step"][step]}</span></div>
          <div className="mb-6 h-2 rounded bg-sand"><div className="h-2 rounded bg-brand transition-all" style={{ width: `${(step / STEPS) * 100}%` }} /></div>
        </>
      )}
      {cfg.paused && step === 1 && (
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-amber-800">We&apos;re very busy right now, but you can still get a price and join the waiting list.</p>
      )}

      {step === 1 && (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold">What&apos;s the address of the property?</h2>
          {cfg.placesEnabled && !manual ? (
            <AddressField
              selected={place}
              onSelect={(p) => setD((x) => ({ ...x, placeId: p.placeId, address: p.address, postcode: p.postcode, lat: p.lat, lng: p.lng }))}
              onClear={() => setD((x) => ({ ...x, placeId: undefined, address: undefined, postcode: undefined, lat: undefined, lng: undefined }))}
              onManual={() => { setD((x) => ({ ...x, placeId: undefined, lat: undefined, lng: undefined })); setManual(true); }}
            />
          ) : (
            <>
              <input className="w-full rounded-xl border-2 border-sand bg-white p-4 text-lg focus:border-ink" placeholder="House number and street" autoComplete="street-address" value={(d.address as string) ?? ""} onChange={(e) => set("address", e.target.value)} />
              <input className="w-full rounded-xl border-2 border-sand bg-white p-4 text-lg uppercase focus:border-ink" placeholder="Postcode e.g. DG1 3QX" autoComplete="postal-code" value={(d.postcode as string) ?? ""} onChange={(e) => set("postcode", e.target.value)} />
              {d.postcode && !pcOk && <p className="text-sm text-brand">That doesn&apos;t look like a UK postcode. Please check it.</p>}
              {cfg.placesEnabled && <button type="button" className="text-mute underline" onClick={() => { setD((x) => ({ ...x, address: undefined, postcode: undefined })); setManual(false); }}>Search for my address instead</button>}
            </>
          )}
          <button className="w-full rounded-2xl bg-brand p-4 text-lg font-semibold text-white hover:bg-brand-dark disabled:opacity-40" disabled={!d.address || !d.postcode || !pcOk} onClick={next}>Next</button>
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
          <button className="w-full rounded-2xl bg-brand p-4 text-lg font-semibold text-white hover:bg-brand-dark disabled:opacity-40" disabled={!d.propertyType || !d.homeAge || !d.listed} onClick={next}>Next</button>
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
          <button className="w-full rounded-2xl bg-brand p-4 text-lg font-semibold text-white hover:bg-brand-dark disabled:opacity-40" disabled={!d.jobType || !d.material} onClick={() => { set("currentMaterial", "unknown"); next(); }}>Next</button>
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
          <input className="w-full rounded-xl border-2 border-sand bg-white p-4 text-lg focus:border-ink" placeholder="Your name" autoComplete="name" value={(d.name as string) ?? ""} onChange={(e) => set("name", e.target.value)} />
          <input className="w-full rounded-xl border-2 border-sand bg-white p-4 text-lg focus:border-ink" placeholder="Mobile number" inputMode="tel" autoComplete="tel" value={(d.phone as string) ?? ""} onChange={(e) => set("phone", e.target.value)} />
          <input className="w-full rounded-xl border-2 border-sand bg-white p-4 text-lg focus:border-ink" placeholder="Email" inputMode="email" autoComplete="email" value={(d.email as string) ?? ""} onChange={(e) => set("email", e.target.value)} />
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={(d.website as string) ?? ""} onChange={(e) => set("website", e.target.value)} />
          <label className="flex gap-3 text-sm text-mute"><input type="checkbox" className="mt-1 h-5 w-5 flex-none" checked={!!d.consent} onChange={(e) => set("consent", e.target.checked)} /> <span>I agree to {cfg.businessName} contacting me about this enquiry by text, email or phone and storing my details for that purpose. <Link href="/privacy" target="_blank" className="underline">Privacy notice</Link></span></label>
          {err && <p className="text-red-600">{err}</p>}
          <button className="w-full rounded-2xl bg-brand p-4 text-lg font-semibold text-white hover:bg-brand-dark disabled:opacity-40" disabled={busy} onClick={submit}>{busy ? "Measuring your roof…" : "Show my price"}</button>
        </section>
      )}

      {step === STEPS + 1 && result && (
        <section className="space-y-4">
          {!result.inArea ? (
            <div className="rounded-2xl bg-cream p-5">
              <h2 className="text-xl font-semibold">Sorry, we only cover Dumfries &amp; Galloway</h2>
              <p className="mt-2 text-mute">We&apos;ve kept your details and will let you know if that changes.</p>
            </div>
          ) : (
            <>
              {d.urgency === "urgent" && (
                <a href={`tel:${PHONE.replace(/\s/g, "")}`} className="block rounded-2xl border-2 border-brand bg-brand-tint p-4 font-semibold text-brand">
                  Active leak? Call us now on {PHONE}. We&apos;ve flagged your enquiry as urgent.
                </a>
              )}
              <div className="rounded-2xl bg-brand p-5 text-white">
                <p className="text-sm opacity-80">Estimated price for your {mat?.label.toLowerCase()} roof (about {result.roofAreaM2} m²)</p>
                <p className="text-3xl font-bold">{gbp(result.low)} – {gbp(result.high)}</p>
                <p className="mt-2 text-sm opacity-90">Final price confirmed at a free inspection.</p>
              </div>
              <div className="rounded-2xl border-2 border-sand bg-white p-4">
                <p className="font-semibold">Earliest start: around {new Date(result.earliestStart).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
                <p className="text-sm text-mute">Estimate only – depends on the current work queue and weather.</p>
              </div>
              {booked ? (
                <div className="rounded-2xl border-2 border-green-700 bg-green-50 p-5 text-center">
                  <h2 className="text-xl font-bold text-green-800">Inspection booked ✓</h2>
                  <p className="mt-1 text-lg font-semibold">{new Date(booked).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
                  <p className="mt-1 text-mute">{d.address as string}</p>
                  <p className="mt-2 text-sm text-mute">We&apos;ve texted and emailed your confirmation. If you can, have your loft hatch and any old roof paperwork to hand.</p>
                </div>
              ) : (
                <>
                  <h2 className="text-xl font-semibold">Book your free inspection</h2>
                  {calendly ? (
                    <InlineWidget url={calendly} prefill={{ name: d.name as string, email: d.email as string, customAnswers: { a1: `${d.address}` } }} styles={{ height: "680px" }} />
                  ) : (
                    <BookingPicker leadId={result.id} onBooked={(w) => { setBooked(w); track("booked"); }} />
                  )}
                </>
              )}
            </>
          )}
        </section>
      )}
      {step > 1 && step <= STEPS && <button className="mt-4 text-mute underline" onClick={() => setStep((s) => s - 1)}>Back</button>}
      {step === STEPS + 1 && <p className="mt-4 text-center text-mute">Prefer to talk? <a className="font-semibold text-brand underline" href={`tel:${PHONE.replace(/\s/g, "")}`}>{PHONE}</a></p>}
      <footer className="mt-6 border-t border-sand pt-3 text-center text-xs leading-relaxed text-mute">JC Roofing Dumfries · 28 Auchenkeld Avenue, Heathhall, Dumfries DG1 3QX<br />Your details are only used for this enquiry. <Link href="/privacy" className="underline">Privacy</Link></footer>
      </div>
    </main>
  );
}
