"use client";
import { useState } from "react";
import Image from "next/image";
import type { Lead, Settings } from "@/lib/types";
import type { Message } from "@/lib/store";
import { fmtSlot } from "@/lib/dates";

type Data = { settings: Settings; leads: Lead[]; outbox: Message[]; funnel: Record<string, number> };
const STATUSES = ["new", "contacted", "quoted", "won", "lost"];
const FUNNEL: [string, string][] = [["start", "Opened the form"], ["address", "Confirmed address"], ["home", "Described their home"], ["roof", "Chose a roof"], ["timing", "Gave timing"], ["price", "Saw their price"], ["booked", "Booked inspection"]];
const input = "rounded-lg border-[1.5px] border-line bg-white px-2.5 py-2 text-base focus:border-ink";

export default function Admin() {
  const [pw, setPw] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [saved, setSaved] = useState("");

  async function load(e?: React.FormEvent) {
    e?.preventDefault();
    const r = await fetch("/api/admin", { headers: { "x-admin-password": pw } });
    if (!r.ok) return setMsg(r.status === 429 ? "Too many wrong passwords. Please wait 10 minutes." : "Wrong password");
    setMsg("");
    setData(await r.json());
  }
  async function put(body: object): Promise<boolean> {
    const r = await fetch("/api/admin", { method: "PUT", headers: { "x-admin-password": pw, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) {
      setSaved(`Not saved: ${(await r.json().catch(() => ({}))).error ?? "please try again"}`);
      return false;
    }
    await load();
    return true;
  }
  async function save(s: Settings) {
    setSaved("");
    const nums = [s.weeksBacklog, s.minJobValue, ...s.materials.map((m) => m.ratePerM2)];
    if (nums.some((n) => typeof n !== "number" || !Number.isFinite(n) || n <= 0 && n !== s.weeksBacklog)) return setSaved("Not saved: please fill in every price and number.");
    if (await put({ settings: s })) setSaved("Saved ✓");
  }
  function exportLead(l: Lead) {
    const mine = data?.outbox.filter((m) => m.leadId === l.id) ?? [];
    const url = URL.createObjectURL(new Blob([JSON.stringify({ lead: l, messages: mine }, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `enquiry-${l.name.replace(/\W+/g, "-")}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!data)
    return (
      <main className="mx-auto max-w-sm space-y-3 p-6">
        <Image src="/logo.png" alt="JC Roofing" width={512} height={198} className="h-12 w-auto" />
        <h1 className="text-xl font-bold">Owner login</h1>
        <form onSubmit={load} className="space-y-3">
          <label htmlFor="pw" className="block text-[0.8125rem] font-semibold">Password</label>
          <input id="pw" type="password" autoComplete="current-password" className={`${input} w-full`} value={pw} onChange={(e) => setPw(e.target.value)} />
          <button type="submit" className="min-h-11 w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white hover:bg-brand-dark">Open</button>
        </form>
        {msg && <p role="alert" className="text-brand">{msg}</p>}
      </main>
    );

  const s = data.settings;
  const upd = (patch: Partial<Settings>) => { setSaved(""); setData({ ...data, settings: { ...s, ...patch } }); };
  const num = `${input} w-28`;
  const top = Math.max(data.funnel.start ?? 0, 1);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex items-center gap-3"><Image src="/logo.png" alt="JC Roofing" width={512} height={198} className="h-11 w-auto" /><h1 className="text-xl font-bold">Owner page</h1></div>

      <section className="space-y-3 rounded-2xl border border-line bg-white p-4" aria-labelledby="h-settings">
        <h2 id="h-settings" className="text-lg font-semibold">Settings</h2>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-[#b11017]" checked={s.paused} onChange={(e) => upd({ paused: e.target.checked })} /> Pause: we&apos;re not taking new work (new enquiries join a waiting list)</label>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <label className="block text-[0.8125rem] font-semibold">Weeks until crew is free<br /><input type="number" min={0} className={num} value={Number.isNaN(s.weeksBacklog) ? "" : s.weeksBacklog} onChange={(e) => upd({ weeksBacklog: e.target.value === "" ? NaN : +e.target.value })} /></label>
          <label className="block text-[0.8125rem] font-semibold">Or a fixed earliest start date<br /><input type="date" className={`${input} w-44`} value={s.earliestStartManual} onChange={(e) => upd({ earliestStartManual: e.target.value })} /></label>
          <label className="block text-[0.8125rem] font-semibold">Minimum job value (£)<br /><input type="number" min={100} className={num} value={Number.isNaN(s.minJobValue) ? "" : s.minJobValue} onChange={(e) => upd({ minJobValue: e.target.value === "" ? NaN : +e.target.value })} /></label>
        </div>
        <label className="block text-[0.8125rem] font-semibold">Your mobile (lead texts)<input className={`${input} mt-1 w-full`} inputMode="tel" value={s.ownerPhone} onChange={(e) => upd({ ownerPhone: e.target.value })} /></label>
        <label className="block text-[0.8125rem] font-semibold">Your email<input className={`${input} mt-1 w-full`} type="email" value={s.ownerEmail} onChange={(e) => upd({ ownerEmail: e.target.value })} /></label>
        <label className="block text-[0.8125rem] font-semibold">Areas we cover (postcode letters, comma separated, e.g. DG, CA)<input className={`${input} mt-1 w-full`} value={s.serviceAreaPrefixes.join(", ")} onChange={(e) => upd({ serviceAreaPrefixes: e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) })} /></label>
        <h3 className="font-semibold">Price per m² (fitted)</h3>
        {s.materials.map((m, i) => (
          <label key={m.id} className="flex items-center justify-between gap-3">{m.label}
            <input type="number" min={1} className={num} value={Number.isNaN(m.ratePerM2) ? "" : m.ratePerM2} onChange={(e) => upd({ materials: s.materials.map((x, j) => (j === i ? { ...x, ratePerM2: e.target.value === "" ? NaN : +e.target.value } : x)) })} />
          </label>
        ))}
        <div className="flex items-center gap-3">
          <button className="min-h-11 rounded-xl bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-dark" onClick={() => save(s)}>Save</button>
          <p role="status" className={saved.startsWith("Saved") ? "font-semibold text-green-800" : "text-brand"}>{saved}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-4" aria-labelledby="h-funnel">
        <h2 id="h-funnel" className="mb-1 text-lg font-semibold">How the form is performing</h2>
        <p className="mb-2 text-sm text-mute">People who reached each step (anonymous).</p>
        <ul className="space-y-1.5">
          {FUNNEL.map(([k, l]) => {
            const n = data.funnel[k] ?? 0;
            return (
              <li key={k} className="text-sm">
                <div className="flex justify-between"><span>{l}</span><b>{n}</b></div>
                <div className="h-2 rounded bg-cream" aria-hidden><div className="h-2 rounded bg-brand" style={{ width: `${Math.min(100, (n / top) * 100)}%` }} /></div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="h-leads">
        <h2 id="h-leads" className="text-lg font-semibold">Leads ({data.leads.length})</h2>
        {data.leads.length === 0 && <p className="text-mute">No leads yet. Fill in the form on the home page to create one.</p>}
        <ul className="space-y-3">
          {data.leads.map((l) => (
            <li key={l.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex justify-between"><b>{l.name}</b><span className={l.score === "hot" ? "font-semibold text-brand" : "text-mute"}>{l.score}{l.waitlist ? " · waiting list" : ""}</span></div>
              <p className="text-sm">{l.address.replace(/, (UK|United Kingdom)$/, "")}{l.address.includes(l.postcode) ? "" : `, ${l.postcode}`} · {s.materials.find((m) => m.id === l.material)?.label ?? l.material} · {l.roofAreaM2}m² ({l.roofSource === "solar-api" ? "measured" : "estimate"})</p>
              <p className="text-sm">£{l.low.toLocaleString()}–£{l.high.toLocaleString()} · {l.urgency} · <a className="underline" href={`tel:${l.phone}`}>{l.phone}</a> · {l.email}</p>
              {l.inspectionBooked && <p className="text-sm font-semibold text-green-800">Inspection: {fmtSlot(l.inspectionBooked)}</p>}
              <p className="text-xs text-mute">Consent given {new Date(l.consentAt ?? l.createdAt).toLocaleString("en-GB")} (wording {l.consentVersion ?? "v1"}) · {l.placeId ? "address checked" : "address typed by customer, please check"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="text-sm">Status <select className={`${input} py-1`} value={l.status} onChange={(e) => put({ leadStatus: { id: l.id, status: e.target.value } })}>{STATUSES.map((x) => <option key={x}>{x}</option>)}</select></label>
                <button className="min-h-9 px-1 text-sm text-mute underline" onClick={() => exportLead(l)}>Export data</button>
                <button className="min-h-9 px-1 text-sm text-mute underline" onClick={() => { if (confirm(`Delete ${l.name}'s enquiry and their messages permanently?`)) put({ deleteLead: l.id }); }}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2" aria-labelledby="h-msgs">
        <h2 id="h-msgs" className="text-lg font-semibold">Messages</h2>
        <p className="text-sm text-mute">&quot;Preview&quot; means nothing was really sent yet (no text or email service is switched on). This is exactly what would be sent.</p>
        {data.outbox.length === 0 && <p className="text-mute">Nothing yet.</p>}
        <ul className="space-y-2">
          {data.outbox.map((m) => (
            <li key={m.id} className={`rounded-2xl p-3 text-sm ${m.audience === "owner" ? "bg-brand-tint" : "bg-white ring-1 ring-line"}`}>
              <div className="flex justify-between gap-2 text-xs text-mute"><span>{m.audience === "owner" ? "To you" : "To customer"} · {m.channel.toUpperCase()} · {m.to}</span><span>{new Date(m.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span></div>
              <p className={`text-xs font-semibold ${m.status === "failed" ? "text-brand" : m.status === "sent" ? "text-green-800" : "text-mute"}`}>{m.status === "preview" ? "Preview (not sent)" : m.status === "sent" ? "Sent" : `FAILED: ${m.error ?? "unknown error"}`}</p>
              {m.subject && <p className="font-semibold">{m.subject}</p>}
              <p className="whitespace-pre-line">{m.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
