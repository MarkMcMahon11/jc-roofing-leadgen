"use client";

import { useState } from "react";
import { Button, Card, CardHeader, Field, Input, PageHeader } from "@/components/admin/ui";
import { PRICE_LABELS, PRICE_UNITS } from "@/lib/services";
import { useOps } from "@/lib/ops/store";
import type { Settings } from "@/lib/types";

const numCls = "w-24 rounded-xl border-[1.5px] border-ctrl bg-white px-2.5 py-2 text-base outline-none focus:border-night sm:w-28";
const toNum = (v: string) => (v === "" ? NaN : +v);
const show = (n: number) => (Number.isNaN(n) ? "" : n);

export default function PricingPage() {
  const { biz, saveSettings } = useOps();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const s = draft ?? biz.settings;
  const upd = (patch: Partial<Settings>) => {
    setMsg("");
    setDraft({ ...s, ...patch });
  };

  async function save() {
    const nums = [s.weeksBacklog, s.quickJobWeeks, s.minJobValue, ...s.materials.map((m) => m.ratePerM2), ...Object.values(s.prices)];
    if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n) || (n <= 0 && n !== s.weeksBacklog && n !== s.quickJobWeeks))) return setMsg("Not saved: please fill in every price and number.");
    setBusy(true);
    const err = await saveSettings(s);
    setBusy(false);
    if (err) return setMsg(`Not saved: ${err}`);
    setDraft(null);
    setMsg("Saved ✓");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Quote prices and settings" sub="These drive the instant price range customers see on your quote form" actions={<Button onClick={save} disabled={busy || !draft}>{busy ? "Saving…" : "Save changes"}</Button>} />
      {msg && <p role="status" className={`text-sm font-semibold ${msg.startsWith("Saved") ? "text-emerald-800" : "text-brand"}`}>{msg}</p>}

      <div className="grid gap-4 @3xl:grid-cols-2">
        <Card>
          <CardHeader title="Taking work" />
          <div className="space-y-4 p-5">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#b11017]" checked={s.paused} onChange={(e) => upd({ paused: e.target.checked })} />
              <span><b>Pause:</b> we&apos;re not taking new work. New enquiries join a waiting list.</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Weeks until the crew is free (big jobs)"><Input type="number" min={0} value={show(s.weeksBacklog)} onChange={(e) => upd({ weeksBacklog: toNum(e.target.value) })} /></Field>
              <Field label="Weeks until free for small jobs"><Input type="number" min={0} value={show(s.quickJobWeeks)} onChange={(e) => upd({ quickJobWeeks: toNum(e.target.value) })} /></Field>
              <Field label="Or a fixed earliest start date"><Input type="date" value={s.earliestStartManual} onChange={(e) => upd({ earliestStartManual: e.target.value })} /></Field>
              <Field label="Minimum job value (£)"><Input type="number" min={100} value={show(s.minJobValue)} onChange={(e) => upd({ minJobValue: toNum(e.target.value) })} /></Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Contact and area" />
          <div className="space-y-4 p-5">
            <Field label="Your mobile (lead texts)"><Input inputMode="tel" value={s.ownerPhone} onChange={(e) => upd({ ownerPhone: e.target.value })} /></Field>
            <Field label="Your email" hint="Lead alerts go here. You can also sign in to this dashboard with it."><Input type="email" value={s.ownerEmail} onChange={(e) => upd({ ownerEmail: e.target.value })} /></Field>
            <Field label="Areas we cover" hint="Postcode letters, separated by commas, e.g. DG, CA"><Input value={s.serviceAreaPrefixes.join(", ")} onChange={(e) => upd({ serviceAreaPrefixes: e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) })} /></Field>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 @3xl:grid-cols-2">
        <Card>
          <CardHeader title="New roofs" sub="Price fitted, per m²" />
          <div className="space-y-3 p-5">
            {s.materials.map((m, i) => (
              <label key={m.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                {m.label}
                <span className="flex shrink-0 items-center gap-1 text-steel">
                  <span aria-hidden>£</span>
                  <input type="number" min={1} className={numCls} value={show(m.ratePerM2)} onChange={(e) => upd({ materials: s.materials.map((x, j) => (j === i ? { ...x, ratePerM2: toNum(e.target.value) } : x)) })} />
                  <span aria-hidden>/m²</span>
                </span>
              </label>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Other jobs" sub="Repairs, flat roofs, gutters, chimneys, solar" />
          <div className="space-y-3 p-5">
            {(Object.keys(s.prices) as (keyof Settings["prices"])[]).map((k) => (
              <label key={k} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
                {PRICE_LABELS[k] ?? k}
                <span className="flex shrink-0 items-center gap-1 text-steel">
                  <span aria-hidden>£</span>
                  <input type="number" min={1} className={numCls} value={show(s.prices[k])} onChange={(e) => upd({ prices: { ...s.prices, [k]: toNum(e.target.value) } })} />
                  {PRICE_UNITS[k] && <span aria-hidden>{PRICE_UNITS[k]}</span>}
                </span>
              </label>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
