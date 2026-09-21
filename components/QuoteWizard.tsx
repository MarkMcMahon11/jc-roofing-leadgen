"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { InlineWidget } from "react-calendly";
import AddressField, { type Place } from "./AddressField";
import BookingPicker from "./BookingPicker";
import { Field, Ghost, inputCls, Label, Opt, Primary, Seg, StickyBar, Swatches } from "./ui";
import { OPTIONS, SERVICE_IDS, SERVICE_INFO, type ServiceId } from "@/lib/services";
import { BUSINESS, telHref } from "@/lib/config";
import { fmtMonth, fmtSlot } from "@/lib/dates";
import { normalisePhone, UK_POSTCODE, validEmail } from "@/lib/format";

type Mat = { id: string; label: string; blurb: string; colours: string[] };
type Cfg = { businessName: string; paused: boolean; placesEnabled: boolean; materials: Mat[] };
type Result = { id: string; inArea: boolean; score: string; service?: ServiceId; low?: number; high?: number; basis?: string; noPrice?: boolean; earliestStart?: string; waitlist?: boolean };
type D = Record<string, string | number | boolean | undefined>;

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const STEPS = 6;
const TITLES = ["", "Address", "What you need", "Your home", "Job details", "Timing", "Your details", "Your estimate"];
// Anonymous funnel event fired when each step is reached (no personal data).
const EVENTS = ["", "start", "address", "service", "home", "details", "timing", "price"];
const TIME_LEFT = ["", "About 100 seconds left", "About 90 seconds left", "About 70 seconds left", "About 50 seconds left", "About 30 seconds left", "Last step"];
const STORE_KEY = "jc-quote-v2";
const pcClean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

type Saved = { d: D; step: number; result: Result | null; booked: string; manual: boolean; key: string };
// Progress survives refresh and the browser Back button (kept only in this browser tab, never sent anywhere).
function loadSaved(): Saved | null {
  if (typeof window === "undefined") return null;
  try {
    const v = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? "null") as Saved | null;
    if (!v || typeof v.step !== "number" || v.step < 1 || v.step > STEPS + 1) return null;
    if (v.step === STEPS + 1 && !v.result) v.step = STEPS;
    return v;
  } catch {
    return null;
  }
}

export default function QuoteWizard() {
  const [saved] = useState(loadSaved);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [step, setStep] = useState(saved?.step ?? 1);
  const [d, setD] = useState<D>({ consent: false, ...(saved?.d ?? {}) });
  const [result, setResult] = useState<Result | null>(saved?.result ?? null);
  const [booked, setBooked] = useState(saved?.booked ?? "");
  const [manual, setManual] = useState(saved?.manual ?? false);
  const [submittedKey, setSubmittedKey] = useState(saved?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitErr, setSubmitErr] = useState<{ msg: string; field?: string } | null>(null);
  const busyRef = useRef(false);
  const sid = useRef("");
  const topRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);
  const seen = useRef(new Set<string>());

  const place: Place | null = d.placeId ? { placeId: d.placeId as string, address: d.address as string, postcode: d.postcode as string, lat: d.lat as number, lng: d.lng as number } : null;
  const pcOk = UK_POSTCODE.test(pcClean(d.postcode));

  useEffect(() => {
    sid.current = crypto.randomUUID();
    fetch("/api/quote").then((r) => r.json()).then(setCfg).catch(() => {});
    window.history.replaceState({ step }, "");
    const onPop = (e: PopStateEvent) => { setErrors({}); setSubmitErr(null); setStep(typeof e.state?.step === "number" ? e.state.step : 1); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep progress in this tab so a refresh doesn't wipe everything.
  useEffect(() => {
    try {
      const { consent: _c, website: _w, ...rest } = d; // never keep consent or the spam-trap field
      void _c; void _w;
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ d: rest, step, result, booked, manual, key: submittedKey } satisfies Saved));
    } catch { /* private mode: fine */ }
  }, [d, step, result, booked, manual, submittedKey]);

  const track = (name: string) => {
    if (!name || !sid.current || seen.current.has(name)) return;
    seen.current.add(name);
    fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sid: sid.current, step: name }), keepalive: true }).catch(() => {});
  };

  // On every step change: tell screen readers, update the tab title, move focus to the new step's heading, log the funnel step.
  useEffect(() => {
    document.title = `${TITLES[step] ?? "Quote"}${step <= STEPS ? `, step ${step} of ${STEPS}` : ""} – ${BUSINESS.name}`;
    if (!cfg) return;
    track(EVENTS[step]);
    if (firstRender.current) { firstRender.current = false; return; }
    document.querySelector<HTMLElement>("[data-step-heading]")?.focus({ preventScroll: true });
    topRef.current?.scrollIntoView({ block: "start" });
  }, [step, cfg]);

  const set = (k: string, v: string | number | boolean | undefined) => setD((p) => ({ ...p, [k]: v }));
  const go = (n: number) => {
    setErrors({});
    setSubmitErr(null);
    if (n !== step) window.history.pushState({ step: n }, "");
    setStep(n);
  };

  async function submit() {
    if (busyRef.current) return; // a second tap while sending does nothing
    const errs: Record<string, string> = {};
    if (String(d.name ?? "").trim().length < 2) errs.name = "Please enter your name.";
    if (!normalisePhone(d.phone)) errs.phone = "Please enter a UK phone number, for example 07700 900123.";
    if (!validEmail(String(d.email ?? "").trim())) errs.email = "Please enter a valid email address.";
    if (!d.consent) errs.consent = "Please tick the box so we can contact you.";
    setErrors(errs);
    const bad = ["name", "phone", "email", "consent"].find((k) => errs[k]);
    if (bad) { document.getElementById(`f-${bad}`)?.focus(); return; }

    // Nothing changed since the last successful send (e.g. they pressed Back then Next): reuse the result, don't create another lead.
    const { consent: _c, website: _w, ...rest } = d;
    void _c; void _w;
    const key = JSON.stringify(rest);
    if (result && key === submittedKey) { go(STEPS + 1); return; }

    busyRef.current = true;
    setBusy(true);
    setSubmitErr(null);
    try {
      const res = await fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitErr({ msg: j.error ?? "Something went wrong. Please try again.", field: j.field });
        if (["name", "phone", "email"].includes(j.field)) setErrors({ [j.field]: j.error });
        return;
      }
      setResult(j as Result);
      setSubmittedKey(key);
      setBooked("");
      go(STEPS + 1);
    } catch {
      setSubmitErr({ msg: `We couldn't reach our server. Please check your connection and try again, or call us on ${BUSINESS.phone}.` });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function startAgain() {
    try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    setD({ consent: false }); setResult(null); setBooked(""); setManual(false); setSubmittedKey(""); setErrors({}); setSubmitErr(null);
    seen.current = new Set(["start"]);
    window.history.pushState({ step: 1 }, "");
    setStep(1);
  }

  if (!cfg) return <p role="status" className="p-8 text-center text-mute">Loading…</p>;
  const mat = cfg.materials.find((m) => m.id === d.material);
  const calendly = process.env.NEXT_PUBLIC_CALENDLY_URL;
  const svc = d.service as ServiceId | undefined;
  const filled = (k: string) => typeof d[k] === "string" && (d[k] as string).length > 0;
  const detailsReady =
    svc === "roof" ? filled("material") :
    svc === "repair" ? filled("repairIssue") :
    svc === "flat" ? filled("flatSize") :
    svc === "gutters" ? filled("gutterWork") :
    svc === "chimney" ? filled("chimneys") && filled("chimneyScope") :
    svc === "solar" ? filled("solarSize") :
    svc === "other" ? String(d.notes ?? "").trim().length >= 5 : false;
  // A group of single-choice rows for one of the job questions.
  const choices = (k: keyof typeof OPTIONS, labelId: string) => (
    <div role="group" aria-labelledby={labelId} className="space-y-2">
      {(OPTIONS[k] as readonly (readonly [string, string])[]).map(([v, l]) => <Opt radio key={v} label={l} on={d[k] === v} onClick={() => set(k, v)} />)}
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-sand bg-white">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-1.5">
          <Image src="/logo.png" alt={cfg.businessName} width={512} height={198} priority className="h-9 w-auto" />
          <a href={telHref} className="inline-flex min-h-10 items-center rounded-full border border-ink/70 px-3.5 text-[0.8125rem] font-semibold">Call {BUSINESS.phone}</a>
        </div>
      </header>

      <main ref={topRef} className="mx-auto w-full max-w-lg flex-1 px-4 pb-4 pt-4" style={{ scrollMarginTop: 56 }}>
        <p role="status" className="sr-only">{step <= STEPS ? `Step ${step} of ${STEPS}: ${TITLES[step]}` : TITLES[step]}</p>

        {step === 1 && (
          <div className="mb-4">
            <h1 className="text-[1.375rem] font-bold leading-tight tracking-tight">Get your roof price in 2 minutes</h1>
            <p className="mt-1 text-[0.9375rem] leading-snug text-mute">Local, fully certified roofers in Dumfries &amp; Galloway. No phone call needed.</p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.75rem] font-medium text-ink/80">
              <span><span aria-hidden className="text-[#b07a00]">★★★★★</span><span className="sr-only">Rated five stars, </span> 50+ reviews</span><span aria-hidden className="text-sand">|</span><span>Trusted Trader</span><span aria-hidden className="text-sand">|</span><span>250+ customers</span>
            </p>
          </div>
        )}

        {step <= STEPS && (
          <div className="mb-4" aria-hidden>
            <div className="mb-1 flex justify-between text-[0.75rem] text-mute"><span>Step {step} of {STEPS}</span><span>{TIME_LEFT[step]}</span></div>
            <div className="h-1.5 rounded-full bg-sand"><div className="h-1.5 rounded-full bg-brand transition-all duration-300" style={{ width: `${(step / STEPS) * 100}%` }} /></div>
          </div>
        )}

        {cfg.paused && step === 1 && (
          <p className="mb-4 rounded-xl bg-amber-50 p-3 text-[0.875rem] text-amber-900">We&apos;re very busy right now, but you can still get a price and join our waiting list.</p>
        )}

        {/* 1 · Address */}
        {step === 1 && (
          <section>
            <Label first id="q-addr">What&apos;s the address of the property?</Label>
            {cfg.placesEnabled && !manual ? (
              <AddressField
                selected={place}
                onSelect={(p) => setD((x) => ({ ...x, placeId: p.placeId, address: p.address, postcode: p.postcode, lat: p.lat, lng: p.lng }))}
                onClear={() => setD((x) => ({ ...x, placeId: undefined, address: undefined, postcode: undefined, lat: undefined, lng: undefined }))}
                onManual={() => { setD((x) => ({ ...x, placeId: undefined, lat: undefined, lng: undefined })); setManual(true); }}
              />
            ) : (
              <div className="space-y-2.5">
                <Field id="f-address" label="House number and street" autoComplete="street-address" value={(d.address as string) ?? ""} onChange={(e) => set("address", e.target.value)} />
                <Field id="f-postcode" label="Postcode" placeholder="e.g. DG1 3QX" autoComplete="postal-code" className="uppercase" value={(d.postcode as string) ?? ""} onChange={(e) => set("postcode", e.target.value)}
                  error={d.postcode && !pcOk ? "That doesn't look like a UK postcode. Please check it." : undefined} />
                {cfg.placesEnabled && <button type="button" className="min-h-11 text-[0.875rem] text-mute underline" onClick={() => { setD((x) => ({ ...x, address: undefined, postcode: undefined })); setManual(false); }}>Search for my address instead</button>}
              </div>
            )}
            <StickyBar><Primary disabled={!d.address || !d.postcode || !pcOk} onClick={() => go(2)}>Next</Primary></StickyBar>
          </section>
        )}

        {/* 2 · What do you need */}
        {step === 2 && (
          <section>
            <Label first id="q-svc">What do you need?</Label>
            <div role="group" aria-labelledby="q-svc" className="space-y-2">
              {SERVICE_IDS.map((id) => <Opt radio key={id} label={SERVICE_INFO[id].label} sub={SERVICE_INFO[id].blurb} on={d.service === id} onClick={() => set("service", id)} />)}
            </div>
            <StickyBar>
              <Ghost onClick={() => go(1)}>Back</Ghost>
              <Primary disabled={!d.service} onClick={() => go(3)}>Next</Primary>
            </StickyBar>
          </section>
        )}

        {/* 3 · Home */}
        {step === 3 && (
          <section>
            <Label first id="q-prop">What type of property?</Label>
            <div role="group" aria-labelledby="q-prop" className="grid grid-cols-2 gap-2">
              {[["tenement", "Tenement / flat"], ["semi", "Semi or terraced"], ["detached", "Detached house"], ["bungalow", "Bungalow"]].map(([v, l]) => <Opt key={v} label={l} on={d.propertyType === v} onClick={() => set("propertyType", v)} />)}
            </div>
            <Label id="q-age">How old is the home?</Label>
            <div role="group" aria-labelledby="q-age" className="grid grid-cols-2 gap-2">
              {[["pre-1919", "Before 1919"], ["1919-1960", "1919 – 1960"], ["1960-2000", "1960 – 2000"], ["newer", "After 2000"]].map(([v, l]) => <Opt key={v} label={l} on={d.homeAge === v} onClick={() => set("homeAge", v)} />)}
            </div>
            <Label id="q-listed" hint="This can affect the type of work allowed.">Listed or in a conservation area?</Label>
            <Seg labelledBy="q-listed" value={d.listed as string} onChange={(v) => set("listed", v)} options={[["yes", "Yes"], ["no", "No"], ["unsure", "Not sure"]]} />
            <StickyBar>
              <Ghost onClick={() => go(2)}>Back</Ghost>
              <Primary disabled={!d.propertyType || !d.homeAge || !d.listed} onClick={() => go(4)}>Next</Primary>
            </StickyBar>
          </section>
        )}

        {/* 4 · Job details (depends on the job) */}
        {step === 4 && (
          <section>
            {svc === "roof" && (
              <>
                <Label first id="q-mat" hint="Pick the look you'd like. We'll confirm at the inspection.">Which material?</Label>
                <div role="group" aria-labelledby="q-mat" className="space-y-2">
                  {cfg.materials.map((m) => <Opt radio key={m.id} label={m.label} sub={m.blurb} on={d.material === m.id} onClick={() => { set("material", m.id); set("colour", m.colours[0]); }} />)}
                </div>
                {mat && (
                  <>
                    <Label id="q-col">Colour</Label>
                    <Swatches labelledBy="q-col" colours={mat.colours} value={d.colour as string} onChange={(c) => set("colour", c)} />
                  </>
                )}
              </>
            )}
            {svc === "repair" && (<><Label first id="q-rep" hint="Repairs vary a lot, so we'll give you a wide range and confirm after a look.">What&apos;s the problem?</Label>{choices("repairIssue", "q-rep")}</>)}
            {svc === "flat" && (<><Label first id="q-flat" hint="Roughly is fine.">How big is the flat roof?</Label>{choices("flatSize", "q-flat")}</>)}
            {svc === "gutters" && (<><Label first id="q-gut">What do you need?</Label>{choices("gutterWork", "q-gut")}</>)}
            {svc === "chimney" && (
              <>
                <Label first id="q-chim">How many chimneys?</Label>{choices("chimneys", "q-chim")}
                <Label id="q-scope" hint="Chimneys shared with a neighbour usually need their agreement.">How much should come out?</Label>{choices("chimneyScope", "q-scope")}
              </>
            )}
            {svc === "solar" && (<><Label first id="q-sol" hint="We'll confirm the right system after a roof survey.">What size system?</Label>{choices("solarSize", "q-sol")}</>)}
            {svc === "other" && (
              <>
                <Label first id="q-notes" hint="A few words is fine. We'll call to talk it through.">Tell us about the job</Label>
                <label htmlFor="f-notes" className="sr-only">Job details</label>
                <textarea id="f-notes" rows={4} maxLength={300} className={inputCls} value={(d.notes as string) ?? ""} onChange={(e) => set("notes", e.target.value)} />
                <p className="mt-1 text-right text-[0.75rem] text-mute">{String(d.notes ?? "").length}/300</p>
              </>
            )}
            <StickyBar>
              <Ghost onClick={() => go(3)}>Back</Ghost>
              <Primary disabled={!detailsReady} onClick={() => go(5)}>Next</Primary>
            </StickyBar>
          </section>
        )}

        {/* 5 · Timing */}
        {step === 5 && (
          <section>
            <Label first id="q-time">How soon do you need it?</Label>
            <div role="group" aria-labelledby="q-time" className="space-y-2">
              {[["urgent", "Urgent – it's leaking", "We'll flag this so you hear from us quickly"], ["3-months", "Within the next 3 months", ""], ["pricing", "Just getting a price for now", ""]].map(([v, l, s]) => (
                <Opt radio key={v} label={l} sub={s || undefined} on={d.urgency === v} onClick={() => set("urgency", v)} />
              ))}
            </div>
            <StickyBar>
              <Ghost onClick={() => go(4)}>Back</Ghost>
              <Primary disabled={!d.urgency} onClick={() => go(6)}>Next</Primary>
            </StickyBar>
          </section>
        )}

        {/* 6 · Contact */}
        {step === 6 && (
          <section>
            <Label first hint="We'll text and email your price straight away.">Where should we send your price?</Label>
            <div className="space-y-2.5">
              <Field id="f-name" label="Your name" autoComplete="name" value={(d.name as string) ?? ""} onChange={(e) => set("name", e.target.value)} error={errors.name} />
              <Field id="f-phone" label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" value={(d.phone as string) ?? ""} onChange={(e) => set("phone", e.target.value)} error={errors.phone} />
              <Field id="f-email" label="Email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={(d.email as string) ?? ""} onChange={(e) => set("email", e.target.value)} error={errors.email} />
              <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <input type="text" name="website" tabIndex={-1} autoComplete="off" value={(d.website as string) ?? ""} onChange={(e) => set("website", e.target.value)} />
              </div>
            </div>
            <label className="mt-3 flex gap-2.5 text-[0.8125rem] leading-snug text-mute">
              <input id="f-consent" type="checkbox" className="mt-0.5 h-[18px] w-[18px] flex-none accent-[#b11017]" checked={!!d.consent} onChange={(e) => set("consent", e.target.checked)} aria-invalid={!!errors.consent} aria-describedby={errors.consent ? "f-consent-err" : undefined} />
              <span>I agree to {cfg.businessName} contacting me about this enquiry by text, email or phone, and storing my details for that purpose. <Link href="/privacy" target="_blank" className="underline">Privacy notice<span className="sr-only"> (opens in a new tab)</span></Link></span>
            </label>
            {errors.consent && <p id="f-consent-err" className="mt-1 text-[0.8125rem] text-brand">{errors.consent}</p>}
            {submitErr && (
              <div role="alert" className="mt-3 rounded-xl border-[1.5px] border-brand bg-brand-tint px-3.5 py-2.5 text-[0.875rem] text-brand">
                <p>{submitErr.msg}</p>
                {submitErr.field === "postcode" && <button type="button" className="mt-1 min-h-11 font-semibold underline" onClick={() => { setManual(true); go(1); }}>Change address</button>}
              </div>
            )}
            <StickyBar>
              <Ghost onClick={() => go(5)}>Back</Ghost>
              <Primary disabled={busy} onClick={submit}>{busy ? "Measuring your roof…" : "Show my price"}</Primary>
            </StickyBar>
          </section>
        )}

        {/* Result */}
        {step === STEPS + 1 && result && (
          <section className="space-y-3">
            {!result.inArea ? (
              <div className="rounded-xl bg-white p-4 ring-1 ring-line">
                <h2 tabIndex={-1} data-step-heading className="text-[1.0625rem] font-semibold outline-none">Sorry, we only cover Dumfries &amp; Galloway</h2>
                <p className="mt-1 text-[0.875rem] text-mute">We&apos;ve kept your details and will let you know if that changes.</p>
              </div>
            ) : (
              <>
                <h2 tabIndex={-1} data-step-heading className="text-[1.0625rem] font-semibold outline-none">Your estimate</h2>
                {d.urgency === "urgent" && (
                  <a href={telHref} className="block rounded-xl border-[1.5px] border-brand bg-brand-tint px-3.5 py-3 text-[0.875rem] font-semibold text-brand">
                    Active leak? Call us now on {BUSINESS.phone}. We&apos;ve flagged your enquiry as urgent.
                  </a>
                )}
                {result.noPrice ? (
                  <div className="rounded-xl bg-white px-4 py-3.5 ring-1 ring-line">
                    <p className="font-semibold">Thanks, we&apos;ll be in touch</p>
                    <p className="mt-0.5 text-[0.875rem] text-mute">We&apos;ll look at what you need and come back to you with a price. You can also book a free inspection below.</p>
                  </div>
                ) : (
                  <div className="rounded-xl bg-brand px-4 py-3.5 text-white">
                    <p className="text-[0.8125rem] opacity-90">Estimated price · {svc === "roof" && mat ? `${mat.label.toLowerCase()} roof` : SERVICE_INFO[svc ?? "roof"].label.toLowerCase()} · {result.basis}</p>
                    <p className="text-[1.75rem] font-bold leading-tight">{gbp(result.low ?? 0)} – {gbp(result.high ?? 0)}</p>
                    <p className="text-[0.8125rem] opacity-90">Final price confirmed at a free {svc === "solar" ? "survey" : "inspection"}.</p>
                  </div>
                )}
                {result.waitlist ? (
                  <div className="rounded-xl bg-white px-3.5 py-3 ring-1 ring-line">
                    <p className="text-[0.875rem] leading-snug"><b className="font-semibold">You&apos;re on our waiting list</b><br /><span className="text-mute">We&apos;re fully booked at the moment. We&apos;ll be in touch as soon as we have space. We&apos;ve texted and emailed you a copy of this estimate.</span></p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl bg-white px-3.5 py-3 ring-1 ring-line">
                      <p className="text-[0.875rem] leading-snug"><b className="font-semibold">Earliest start: around {fmtMonth(result.earliestStart ?? "")}</b><br /><span className="text-mute">Estimate only. Depends on our work queue and the weather.</span></p>
                    </div>
                    {booked ? (
                      <div role="status" className="rounded-xl border-[1.5px] border-green-700 bg-green-50 px-4 py-4 text-center">
                        <h3 className="text-[1.0625rem] font-bold text-green-800">Inspection booked ✓</h3>
                        <p className="mt-0.5 font-semibold">{fmtSlot(booked)}</p>
                        <p className="text-[0.875rem] text-mute">{d.address as string}</p>
                        <p className="mt-2 text-[0.8125rem] text-mute">We&apos;ve texted and emailed your confirmation. If you can, have your loft hatch and any old roof paperwork to hand.</p>
                      </div>
                    ) : (
                      <>
                        <Label id="q-book">Book your free inspection</Label>
                        {calendly ? (
                          <InlineWidget url={calendly} prefill={{ name: d.name as string, email: d.email as string, customAnswers: { a1: `${d.address}` } }} styles={{ height: "680px" }} />
                        ) : (
                          <BookingPicker leadId={result.id} onBooked={(w) => { setBooked(w); track("booked"); }} />
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
            <p className="pt-1 text-center text-[0.875rem] text-mute">Prefer to talk? <a className="inline-block px-1 py-2.5 font-semibold text-brand underline" href={telHref}>{BUSINESS.phone}</a></p>
            <p className="text-center"><button type="button" className="min-h-11 px-3 text-[0.8125rem] text-mute underline" onClick={startAgain}>Start a new quote</button></p>
          </section>
        )}
      </main>

      <footer className="mx-auto w-full max-w-lg px-4 pb-6">
        <div className="border-t border-sand pt-3 text-center text-[0.75rem] leading-relaxed text-mute">
          {BUSINESS.name} · {BUSINESS.address}<br />
          Your details are only used for this enquiry. <Link href="/privacy" className="inline-block px-1 py-2.5 underline">Privacy</Link>
        </div>
      </footer>
    </>
  );
}
