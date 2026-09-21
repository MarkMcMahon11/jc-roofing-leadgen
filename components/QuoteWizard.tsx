"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { InlineWidget } from "react-calendly";
import AddressField, { type Place } from "./AddressField";
import BookingPicker from "./BookingPicker";
import { Ghost, inputCls, Label, Opt, Primary, Seg, StickyBar, Swatches } from "./ui";

type Mat = { id: string; label: string; blurb: string; colours: string[] };
type Cfg = { businessName: string; paused: boolean; placesEnabled: boolean; materials: Mat[] };
type Result = { id: string; inArea: boolean; score: string; low: number; high: number; roofAreaM2: number; earliestStart: string; paused: boolean };

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const STEPS = 5;
const PHONE = "07808 528293";
const tel = `tel:${PHONE.replace(/\s/g, "")}`;
const TIME_LEFT = ["", "About 90 seconds left", "About 75 seconds left", "About 45 seconds left", "About 30 seconds left", "Last step"];
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;

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
  const topRef = useRef<HTMLDivElement>(null);

  const place: Place | null = d.placeId ? { placeId: d.placeId as string, address: d.address as string, postcode: d.postcode as string, lat: d.lat as number, lng: d.lng as number } : null;
  const pcOk = POSTCODE.test(((d.postcode as string) ?? "").trim());

  useEffect(() => {
    sid.current = crypto.randomUUID();
    fetch("/api/quote").then((r) => r.json()).then(setCfg);
  }, []);

  // Anonymous funnel logging: random session id + step name only.
  const seen = useRef(new Set<string>());
  const track = (name: string) => {
    if (!sid.current || seen.current.has(name)) return;
    seen.current.add(name);
    fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid: sid.current, step: name }), keepalive: true }).catch(() => {});
  };
  useEffect(() => {
    if (!cfg) return;
    track(["", "start", "home", "roof", "timing", "contact", "price"][step] ?? "price");
    if (step === 2) track("address");
  });
  // New step: bring the top of the form into view instead of leaving the user mid-page.
  useEffect(() => { if (step > 1) topRef.current?.scrollIntoView({ block: "start" }); }, [step]);

  const set = (k: string, v: string | number | boolean | undefined) => setD((p) => ({ ...p, [k]: v }));
  const go = (n: number) => { setErr(""); setStep(n); };

  async function submit() {
    if (!d.name || !d.phone || !d.email) return setErr("Please fill in your name, mobile and email.");
    if (!d.consent) return setErr("Please tick the box so we can contact you.");
    setBusy(true);
    const res = await fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
    setBusy(false);
    if (!res.ok) return setErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong. Please try again.");
    setResult(await res.json());
    go(STEPS + 1);
  }

  if (!cfg) return <p className="p-8 text-center text-mute">Loading…</p>;
  const mat = cfg.materials.find((m) => m.id === d.material);
  const calendly = process.env.NEXT_PUBLIC_CALENDLY_URL;

  return (
    <main className="mx-auto w-full max-w-lg pb-6">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-sand bg-white px-4 py-1.5">
        <Image src="/logo.png" alt={cfg.businessName} width={512} height={198} priority className="h-9 w-auto" />
        <a href={tel} className="rounded-full border border-ink/70 px-3 py-1.5 text-[13px] font-semibold">Call {PHONE}</a>
      </header>

      <div className="px-4 pt-4" ref={topRef} style={{ scrollMarginTop: 56 }}>
        {step === 1 && (
          <div className="mb-4">
            <h1 className="text-[22px] font-bold leading-tight tracking-tight">Get your roof price in 2 minutes</h1>
            <p className="mt-1 text-[15px] leading-snug text-mute">Local, fully certified roofers in Dumfries &amp; Galloway. No phone call needed.</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] font-medium text-ink/80">
              <span><span className="text-[#b07a00]">★★★★★</span> 50+ reviews</span><span aria-hidden className="text-sand">|</span><span>Trusted Trader</span><span aria-hidden className="text-sand">|</span><span>250+ customers</span>
            </p>
          </div>
        )}

        {step <= STEPS && (
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-[12px] text-mute"><span>Step {step} of {STEPS}</span><span>{TIME_LEFT[step]}</span></div>
            <div className="h-1.5 rounded-full bg-sand"><div className="h-1.5 rounded-full bg-brand transition-all duration-300" style={{ width: `${(step / STEPS) * 100}%` }} /></div>
          </div>
        )}

        {cfg.paused && step === 1 && (
          <p className="mb-4 rounded-xl bg-amber-50 p-3 text-[14px] text-amber-900">We&apos;re very busy right now, but you can still get a price and join the waiting list.</p>
        )}

        {/* 1 · Address */}
        {step === 1 && (
          <section>
            <Label>What&apos;s the address of the property?</Label>
            {cfg.placesEnabled && !manual ? (
              <AddressField
                selected={place}
                onSelect={(p) => setD((x) => ({ ...x, placeId: p.placeId, address: p.address, postcode: p.postcode, lat: p.lat, lng: p.lng }))}
                onClear={() => setD((x) => ({ ...x, placeId: undefined, address: undefined, postcode: undefined, lat: undefined, lng: undefined }))}
                onManual={() => { setD((x) => ({ ...x, placeId: undefined, lat: undefined, lng: undefined })); setManual(true); }}
              />
            ) : (
              <div className="space-y-2">
                <input className={inputCls} placeholder="House number and street" autoComplete="street-address" value={(d.address as string) ?? ""} onChange={(e) => set("address", e.target.value)} />
                <input className={`${inputCls} uppercase`} placeholder="Postcode, e.g. DG1 3QX" autoComplete="postal-code" value={(d.postcode as string) ?? ""} onChange={(e) => set("postcode", e.target.value)} />
                {d.postcode && !pcOk && <p className="text-[13px] text-brand">That doesn&apos;t look like a UK postcode. Please check it.</p>}
                {cfg.placesEnabled && <button type="button" className="text-[14px] text-mute underline" onClick={() => { setD((x) => ({ ...x, address: undefined, postcode: undefined })); setManual(false); }}>Search for my address instead</button>}
              </div>
            )}
            <StickyBar><Primary disabled={!d.address || !d.postcode || !pcOk} onClick={() => go(2)}>Next</Primary></StickyBar>
          </section>
        )}

        {/* 2 · Home */}
        {step === 2 && (
          <section>
            <Label>What type of property?</Label>
            <div className="grid grid-cols-2 gap-2">
              {[["tenement", "Tenement / flat"], ["semi", "Semi or terraced"], ["detached", "Detached house"], ["bungalow", "Bungalow"]].map(([v, l]) => <Opt key={v} label={l} on={d.propertyType === v} onClick={() => set("propertyType", v)} />)}
            </div>
            <Label>How old is the home?</Label>
            <div className="grid grid-cols-2 gap-2">
              {[["pre-1919", "Before 1919"], ["1919-1960", "1919 – 1960"], ["1960-2000", "1960 – 2000"], ["newer", "After 2000"]].map(([v, l]) => <Opt key={v} label={l} on={d.homeAge === v} onClick={() => set("homeAge", v)} />)}
            </div>
            <Label hint="This can affect the type of work allowed.">Listed or in a conservation area?</Label>
            <Seg value={d.listed as string} onChange={(v) => set("listed", v)} options={[["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]]} />
            <StickyBar>
              <Ghost onClick={() => go(1)}>Back</Ghost>
              <Primary disabled={!d.propertyType || !d.homeAge || !d.listed} onClick={() => go(3)}>Next</Primary>
            </StickyBar>
          </section>
        )}

        {/* 3 · Roof */}
        {step === 3 && (
          <section>
            <Label>What do you need done?</Label>
            <Seg value={d.jobType as string} onChange={(v) => set("jobType", v)} options={[["full", "New roof"], ["repair", "A repair"], ["unsure", "Not sure"]]} />
            <Label hint="Pick the look you'd like. We'll confirm at the inspection.">Which material?</Label>
            <div className="space-y-2">
              {cfg.materials.map((m) => <Opt radio key={m.id} label={m.label} sub={m.blurb} on={d.material === m.id} onClick={() => { set("material", m.id); set("colour", m.colours[0]); }} />)}
            </div>
            {mat && (
              <>
                <Label>Colour</Label>
                <Swatches colours={mat.colours} value={d.colour as string} onChange={(c) => set("colour", c)} />
              </>
            )}
            <StickyBar>
              <Ghost onClick={() => go(2)}>Back</Ghost>
              <Primary disabled={!d.jobType || !d.material} onClick={() => { set("currentMaterial", "unknown"); go(4); }}>Next</Primary>
            </StickyBar>
          </section>
        )}

        {/* 4 · Timing */}
        {step === 4 && (
          <section>
            <Label>How soon do you need it?</Label>
            <div className="space-y-2">
              {[["urgent", "Urgent – it's leaking", "We'll flag this so you hear from us quickly"], ["3-months", "Within the next 3 months", ""], ["pricing", "Just getting a price for now", ""]].map(([v, l, s]) => (
                <Opt radio key={v} label={l} sub={s || undefined} on={d.urgency === v} onClick={() => { set("urgency", v); setTimeout(() => go(5), 180); }} />
              ))}
            </div>
            <StickyBar><Ghost onClick={() => go(3)}>Back</Ghost></StickyBar>
          </section>
        )}

        {/* 5 · Contact */}
        {step === 5 && (
          <section>
            <Label hint="We'll text and email your price straight away.">Where should we send your price?</Label>
            <div className="space-y-2">
              <input className={inputCls} placeholder="Your name" autoComplete="name" value={(d.name as string) ?? ""} onChange={(e) => set("name", e.target.value)} />
              <input className={inputCls} placeholder="Mobile number" inputMode="tel" autoComplete="tel" value={(d.phone as string) ?? ""} onChange={(e) => set("phone", e.target.value)} />
              <input className={inputCls} placeholder="Email" inputMode="email" autoComplete="email" value={(d.email as string) ?? ""} onChange={(e) => set("email", e.target.value)} />
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={(d.website as string) ?? ""} onChange={(e) => set("website", e.target.value)} />
            </div>
            <label className="mt-3 flex gap-2.5 text-[13px] leading-snug text-mute">
              <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] flex-none accent-[#b11017]" checked={!!d.consent} onChange={(e) => set("consent", e.target.checked)} />
              <span>I agree to {cfg.businessName} contacting me about this enquiry by text, email or phone, and storing my details for that purpose. <Link href="/privacy" target="_blank" className="underline">Privacy notice</Link></span>
            </label>
            {err && <p role="alert" className="mt-2 text-[14px] text-brand">{err}</p>}
            <StickyBar>
              <Ghost onClick={() => go(4)}>Back</Ghost>
              <Primary disabled={busy} onClick={submit}>{busy ? "Measuring your roof…" : "Show my price"}</Primary>
            </StickyBar>
          </section>
        )}

        {/* Result */}
        {step === STEPS + 1 && result && (
          <section className="space-y-3">
            {!result.inArea ? (
              <div className="rounded-xl bg-white p-4 ring-1 ring-sand">
                <h2 className="text-[17px] font-semibold">Sorry, we only cover Dumfries &amp; Galloway</h2>
                <p className="mt-1 text-[14px] text-mute">We&apos;ve kept your details and will let you know if that changes.</p>
              </div>
            ) : (
              <>
                {d.urgency === "urgent" && (
                  <a href={tel} className="block rounded-xl border-[1.5px] border-brand bg-brand-tint px-3.5 py-3 text-[14px] font-semibold text-brand">
                    Active leak? Call us now on {PHONE}. We&apos;ve flagged your enquiry as urgent.
                  </a>
                )}
                <div className="rounded-xl bg-brand px-4 py-3.5 text-white">
                  <p className="text-[13px] opacity-85">Estimated price · {mat?.label.toLowerCase()} roof · about {result.roofAreaM2} m²</p>
                  <p className="text-[28px] font-bold leading-tight">{gbp(result.low)} – {gbp(result.high)}</p>
                  <p className="text-[13px] opacity-85">Final price confirmed at a free inspection.</p>
                </div>
                <div className="rounded-xl bg-white px-3.5 py-3 ring-1 ring-sand">
                  <p className="text-[14px] leading-snug"><b className="font-semibold">Earliest start: around {new Date(result.earliestStart).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</b><br /><span className="text-mute">Estimate only. Depends on our work queue and the weather.</span></p>
                </div>
                {booked ? (
                  <div className="rounded-xl border-[1.5px] border-green-700 bg-green-50 px-4 py-4 text-center">
                    <h2 className="text-[17px] font-bold text-green-800">Inspection booked ✓</h2>
                    <p className="mt-0.5 font-semibold">{new Date(booked).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</p>
                    <p className="text-[14px] text-mute">{d.address as string}</p>
                    <p className="mt-2 text-[13px] text-mute">We&apos;ve texted and emailed your confirmation. If you can, have your loft hatch and any old roof paperwork to hand.</p>
                  </div>
                ) : (
                  <>
                    <Label>Book your free inspection</Label>
                    {calendly ? (
                      <InlineWidget url={calendly} prefill={{ name: d.name as string, email: d.email as string, customAnswers: { a1: `${d.address}` } }} styles={{ height: "680px" }} />
                    ) : (
                      <BookingPicker leadId={result.id} onBooked={(w) => { setBooked(w); track("booked"); }} />
                    )}
                  </>
                )}
              </>
            )}
            <p className="pt-1 text-center text-[14px] text-mute">Prefer to talk? <a className="font-semibold text-brand underline" href={tel}>{PHONE}</a></p>
          </section>
        )}

        <footer className="mt-6 border-t border-sand pt-3 text-center text-[11px] leading-relaxed text-mute">
          JC Roofing Dumfries · 28 Auchenkeld Avenue, Heathhall, Dumfries DG1 3QX<br />
          Your details are only used for this enquiry. <Link href="/privacy" className="underline">Privacy</Link>
        </footer>
      </div>
    </main>
  );
}
