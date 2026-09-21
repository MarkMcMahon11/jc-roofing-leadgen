"use client";
import { useState } from "react";
import type { Lead, Settings } from "@/lib/types";
import type { Message } from "@/lib/store";

export default function Admin() {
  const [pw, setPw] = useState("");
  const [data, setData] = useState<{ settings: Settings; leads: Lead[]; outbox: Message[]; funnel: Record<string, number> } | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch("/api/admin", { headers: { "x-admin-password": pw } });
    if (!r.ok) return setMsg("Wrong password");
    setMsg("");
    setData(await r.json());
  }
  async function put(body: object) {
    await fetch("/api/admin", { method: "PUT", headers: { "x-admin-password": pw, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await load();
  }

  if (!data)
    return (
      <main className="mx-auto max-w-sm p-6 space-y-3">
        <img src="/logo.png" alt="JC Roofing" className="h-12 w-auto" /><h1 className="text-xl font-bold">Owner login</h1>
        <input type="password" className="w-full rounded-xl border-2 p-3" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="w-full rounded-xl bg-brand p-3 text-white" onClick={load}>Open</button>
        {msg && <p className="text-red-600">{msg}</p>}
      </main>
    );

  const s = data.settings;
  const upd = (patch: Partial<Settings>) => setData({ ...data, settings: { ...s, ...patch } });
  const num = "w-24 rounded-lg border p-2";

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <div className="flex items-center gap-3"><img src="/logo.png" alt="JC Roofing" className="h-11 w-auto" /><h1 className="text-xl font-bold">Owner page</h1></div>
      <section className="space-y-3 rounded-2xl border p-4">
        <h2 className="text-lg font-semibold">Settings</h2>
        <label className="flex items-center gap-2"><input type="checkbox" checked={s.paused} onChange={(e) => upd({ paused: e.target.checked })} /> Pause: we&apos;re not taking new work</label>
        <label className="block">Weeks until crew is free <input type="number" className={num} value={s.weeksBacklog} onChange={(e) => upd({ weeksBacklog: +e.target.value })} /></label>
        <label className="block">Minimum job value (£) <input type="number" className={num} value={s.minJobValue} onChange={(e) => upd({ minJobValue: +e.target.value })} /></label>
        <label className="block">Your mobile (lead texts) <input className="w-full rounded-lg border p-2" value={s.ownerPhone} onChange={(e) => upd({ ownerPhone: e.target.value })} /></label>
        <label className="block">Your email <input className="w-full rounded-lg border p-2" value={s.ownerEmail} onChange={(e) => upd({ ownerEmail: e.target.value })} /></label>
        <label className="block">Areas we cover (postcode letters, comma separated) <input className="w-full rounded-lg border p-2" value={s.serviceAreaPrefixes.join(", ")} onChange={(e) => upd({ serviceAreaPrefixes: e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) })} /></label>
        <h3 className="font-medium">Price per m² (fitted)</h3>
        {s.materials.map((m, i) => (
          <label key={m.id} className="flex items-center justify-between">{m.label}
            <input type="number" className={num} value={m.ratePerM2} onChange={(e) => upd({ materials: s.materials.map((x, j) => (j === i ? { ...x, ratePerM2: +e.target.value } : x)) })} />
          </label>
        ))}
        <button className="rounded-xl bg-brand px-4 py-2 text-white" onClick={() => put({ settings: s })}>Save</button>
      </section>
      <section className="rounded-2xl border border-sand bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold">How the form is performing</h2>
        <p className="mb-2 text-sm text-mute">People who reached each step (anonymous).</p>
        {[["start", "Opened the form"], ["home", "Confirmed address"], ["roof", "Described home"], ["timing", "Chose roof"], ["contact", "Gave timing"], ["price", "Saw their price"], ["booked", "Booked inspection"]].map(([k, l]) => {
          const n = data.funnel[k] ?? 0, top = Math.max(data.funnel.start ?? 0, 1);
          return (
            <div key={k} className="mb-1.5 text-sm">
              <div className="flex justify-between"><span>{l}</span><b>{n}</b></div>
              <div className="h-2 rounded bg-cream"><div className="h-2 rounded bg-brand" style={{ width: `${Math.min(100, (n / top) * 100)}%` }} /></div>
            </div>
          );
        })}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Leads ({data.leads.length})</h2>
        {data.leads.length === 0 && <p className="text-mute">No leads yet. Fill in the form on the home page to create one.</p>}
        {data.leads.map((l) => (
          <div key={l.id} className="rounded-2xl border p-4">
            <div className="flex justify-between"><b>{l.name}</b><span className={l.score === "hot" ? "text-red-600" : l.score === "warm" ? "text-amber-600" : "text-mute"}>{l.score}</span></div>
            <p className="text-sm">{l.address.replace(/, (UK|United Kingdom)$/, "")}{l.address.includes(l.postcode) ? "" : `, ${l.postcode}`} · {data.settings.materials.find((m) => m.id === l.material)?.label ?? l.material} · {l.roofAreaM2}m² ({l.roofSource === "solar-api" ? "measured" : "estimate"})</p>
            <p className="text-sm">£{l.low.toLocaleString()}–£{l.high.toLocaleString()} · {l.urgency} · <a className="underline" href={`tel:${l.phone}`}>{l.phone}</a></p>
            {l.inspectionBooked && <p className="text-sm text-green-700">Inspection: {new Date(l.inspectionBooked).toLocaleString("en-GB")}</p>}
            <p className="text-xs text-mute">Consent given · {new Date(l.createdAt).toLocaleString("en-GB")} · {l.placeId ? "address checked" : "address typed by customer, please check"}</p>
            <button className="mr-3 mt-2 text-sm text-mute underline" onClick={() => { if (confirm(`Delete ${l.name}'s enquiry permanently?`)) put({ deleteLead: l.id }); }}>Delete</button>
            <select className="mt-2 rounded-lg border p-1" value={l.status} onChange={(e) => put({ leadStatus: { id: l.id, status: e.target.value } })}>
              {["new", "contacted", "quoted", "won", "lost"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
        ))}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Messages (preview)</h2>
        <p className="text-sm text-mute">In preview nothing is really sent. This is exactly what your customers and you would receive once texts and email are switched on.</p>
        {data.outbox.length === 0 && <p className="text-mute">Nothing yet.</p>}
        {data.outbox.map((m) => (
          <div key={m.id} className={`rounded-2xl p-3 text-sm ${m.audience === "owner" ? "bg-brand-tint" : "bg-cream"}`}>
            <div className="flex justify-between text-xs text-mute"><span>{m.audience === "owner" ? "To you" : "To customer"} · {m.channel.toUpperCase()} · {m.to}</span><span>{new Date(m.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span></div>
            {m.subject && <p className="font-semibold">{m.subject}</p>}
            <p className="whitespace-pre-line">{m.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
