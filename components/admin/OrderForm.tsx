"use client";

import Link from "next/link";
import { Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button, Field, FormError, Input, Modal, Select, Textarea } from "./ui";
import { addDays, fmtDay, today } from "@/lib/ops/format";
import { HQ } from "@/lib/ops/geo";
import { useOps } from "@/lib/ops/store";
import { WINDOW_LABEL, type DeliveryWindow, type Order, type Supplier } from "@/lib/orders/types";

export type OrderSiteInput = { name: string; address: string; postcode?: string; lat?: number; lng?: number; jobId?: string; leadId?: string; date?: string };
type Row = { description: string; qty: string; unit: string };
type Sent = Omit<Order, "token"> & { link: string };

const PRESETS = [
  "Natural slate (Welsh)", "Natural slate (Spanish)", "Fibre cement slate", "Concrete interlocking tiles", "Clay plain tiles", "Ridge tiles", "Hip tiles", "Roofing felt / breathable membrane", "Treated timber battens 38x25", "Counter battens 50x25",
  "Lead flashing code 4", "Lead flashing code 5", "Soakers", "Roofing nails (copper)", "Slate hooks", "Ridge vent", "Fascia board (uPVC)", "Soffit board (uPVC)", "Guttering 112mm half round", "Downpipe 68mm", "GRP flat roof kit", "EPDM membrane", "Roof insulation board",
];
const UNITS = ["pcs", "bundles", "packs", "rolls", "pallets", "lengths", "m", "sheets", "bags", "tonnes", "litres"];

/** Order materials to a site: pick a supplier, list what's needed and when. The supplier gets it by email/text and confirms with one tap. */
export function OrderForm({ site, onClose }: { site?: OrderSiteInput; onClose: () => void }) {
  const { biz } = useOps();
  const listId = useId();
  const t = today();
  const dayBefore = site?.date && site.date > addDays(t, 1) ? addDays(site.date, -1) : addDays(t, 1);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [name, setName] = useState(site?.name ?? "");
  const [address, setAddress] = useState(site?.address ?? "");
  const [postcode, setPostcode] = useState(site?.postcode ?? "");
  const [rows, setRows] = useState<Row[]>([{ description: "", qty: "", unit: "pcs" }]);
  const [deliverBy, setDeliverBy] = useState(dayBefore);
  const [win, setWin] = useState<DeliveryWindow>("morning");
  const [contactName, setContactName] = useState("Jamie");
  const [contactPhone, setContactPhone] = useState(biz.settings.ownerPhone ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [clientId] = useState(() => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
  const [adding, setAdding] = useState(false);
  const [ns, setNs] = useState({ name: "", email: "", phone: "" });
  const [supErr, setSupErr] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/admin/orders?suppliers=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live || !j) return;
        const list = (j.suppliers as Supplier[]).filter((s) => s.active);
        setSuppliers(list);
        setSupplierId((cur) => cur || (list.length === 1 ? list[0].id : ""));
        if (!list.length) setAdding(true);
      })
      .catch(() => live && setSuppliers([]));
    return () => { live = false; };
  }, []);

  const post = async (body: unknown) => {
    const r = await fetch("/api/admin/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "That didn't work. Try again.");
    return j;
  };

  async function addSupplier() {
    setSupErr("");
    setBusy(true);
    try {
      const j = await post({ op: "supplier_save", supplier: { name: ns.name, email: ns.email, phone: ns.phone, active: true } });
      setSuppliers((cur) => [...(cur ?? []), j.supplier]);
      setSupplierId(j.supplier.id);
      setAdding(false);
      setNs({ name: "", email: "", phone: "" });
    } catch (e) {
      setSupErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!supplierId) return setError("Choose a supplier.");
    const items = rows.filter((r) => r.description.trim() || r.qty);
    if (!items.length) return setError("Add at least one material.");
    for (const r of items) {
      if (!r.description.trim()) return setError("Describe each material.");
      if (!(Number(r.qty) > 0)) return setError(`Enter a quantity for "${r.description.trim()}".`);
    }
    const sup = suppliers?.find((s) => s.id === supplierId);
    if (!confirm(`Send this order to ${sup?.name ?? "the supplier"}?\n\n${items.length} item${items.length === 1 ? "" : "s"} to ${name.trim() || "the site"} for ${fmtDay(deliverBy)}.\nThey'll get it by ${[sup?.email && "email", sup?.phone && "text"].filter(Boolean).join(" and ")}.`)) return;
    setBusy(true);
    try {
      const j = await post({
        op: "order_create",
        order: {
          clientId,
          supplierId,
          site: { name: name.trim(), address: address.trim(), ...(postcode.trim() ? { postcode: postcode.trim() } : {}), ...(typeof site?.lat === "number" && typeof site?.lng === "number" ? { lat: site.lat, lng: site.lng } : {}), ...(site?.jobId ? { jobId: site.jobId } : {}), ...(site?.leadId ? { leadId: site.leadId } : {}) },
          items: items.map((r) => ({ description: r.description.trim(), qty: Number(r.qty), unit: r.unit.trim() || "pcs" })),
          deliverBy,
          window: win,
          ...(contactName.trim() ? { contactName: contactName.trim() } : {}),
          ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      });
      setSent(j.order as Sent);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const setRow = (i: number, patch: Partial<Row>) => setRows((cur) => cur.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  if (sent) {
    const failed = sent.status === "failed";
    return (
      <Modal open onClose={onClose} title={failed ? "Order saved, not delivered" : "Order sent"}>
        <div className="space-y-3 text-sm">
          <p className={`rounded-xl p-3 ${failed ? "border border-brand bg-brand-tint text-brand" : "bg-emerald-50 text-emerald-900"}`} role="status">
            <b>{sent.ref}</b> {failed ? `couldn't be delivered to ${sent.supplierName}. Check their email or mobile, then press Send again on the Materials orders page.` : `has gone to ${sent.supplierName} for ${fmtDay(sent.deliverBy)}.`}
          </p>
          <ul className="space-y-1">
            {sent.sends.map((s, i) => (
              <li key={i} className="flex items-center gap-2"><Check size={14} aria-hidden className={s.result === "failed" ? "text-brand" : "text-emerald-700"} /> {s.channel === "email" ? "Email" : "Text"} to {s.to}: {s.result === "sent" ? "sent" : s.result === "preview" ? "previewed only (not switched on yet, see Texts and emails)" : "failed"}</li>
            ))}
          </ul>
          <p className="text-steel">They can confirm the date or say they can&apos;t supply with one tap. You&apos;ll be told when they answer, and it shows on the site&apos;s pin and the Materials orders page.</p>
          <div className="flex justify-end gap-2">
            <Link href="/admin/orders" className="flex min-h-11 items-center rounded-xl border-[1.5px] border-ctrl px-4 py-2 font-semibold hover:bg-silver-soft">Materials orders</Link>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Order materials to site" wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Site name (the supplier sees this)"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="e.g. Carruthers re-roof" /></Field>
          <Field label="Postcode"><Input value={postcode} onChange={(e) => setPostcode(e.target.value)} maxLength={10} placeholder="DG1 3QX" autoComplete="off" /></Field>
          <Field label="Delivery address" className="sm:col-span-2">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} required minLength={5} />
          </Field>
          {!site && <button type="button" className="text-left text-xs font-semibold text-brand underline sm:col-span-2" onClick={() => { setName("JC Roofing yard"); setAddress(HQ.label); }}>Deliver to our yard instead</button>}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm font-semibold text-night">Supplier</span>
            {!adding && <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-10 items-center text-xs font-semibold text-brand underline">New supplier</button>}
          </div>
          {suppliers === null ? <div className="text-sm text-steel">Loading…</div> : (
            suppliers.length > 0 && <Select aria-label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
              <option value="">Choose a supplier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.email ? "" : " (text only)"}</option>)}
            </Select>
          )}
          {adding && (
            <div className="mt-2 grid gap-2 rounded-xl border border-edge bg-silver-soft p-3 sm:grid-cols-3">
              <Input aria-label="Supplier name" placeholder="Supplier name" value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} maxLength={80} />
              <Input aria-label="Supplier email" type="email" placeholder="Email for orders" value={ns.email} onChange={(e) => setNs({ ...ns, email: e.target.value })} maxLength={254} />
              <Input aria-label="Supplier mobile" type="tel" placeholder="Mobile (for texts)" value={ns.phone} onChange={(e) => setNs({ ...ns, phone: e.target.value })} maxLength={30} />
              <div className="flex gap-2 sm:col-span-3">
                <Button type="button" size="sm" onClick={() => void addSupplier()} disabled={busy || !ns.name.trim() || (!ns.email.trim() && !ns.phone.trim())}>Save supplier</Button>
                {suppliers && suppliers.length > 0 && <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>}
              </div>
              {supErr && <p role="alert" className="text-sm text-brand sm:col-span-3">{supErr}</p>}
            </div>
          )}
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-night">Materials</legend>
          <datalist id={listId}>{PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 sm:grid-cols-[1fr_5.5rem_6.5rem_auto]">
                <Input className="col-span-3 min-w-0 sm:col-span-1" aria-label={`Material ${i + 1}`} list={listId} placeholder="What (start typing for ideas)" value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} maxLength={120} />
                <Input className="min-w-0" aria-label={`Quantity ${i + 1}`} type="number" inputMode="decimal" min={0} step="any" placeholder="Qty" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} />
                <Input className="min-w-0" aria-label={`Unit ${i + 1}`} list={`${listId}-u`} value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} maxLength={20} />
                <button type="button" aria-label={`Remove material ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((cur) => cur.filter((_, n) => n !== i))} className="grid h-10 w-10 place-items-center rounded-lg text-steel hover:bg-silver-soft disabled:opacity-40"><Trash2 size={16} aria-hidden /></button>
              </div>
            ))}
            <datalist id={`${listId}-u`}>{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          </div>
          {rows.length < 20 && <button type="button" onClick={() => setRows((cur) => [...cur, { description: "", qty: "", unit: "pcs" }])} className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-brand"><Plus size={14} aria-hidden /> Add another material</button>}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Deliver by"><Input type="date" value={deliverBy} min={t} onChange={(e) => setDeliverBy(e.target.value)} required /></Field>
          <Field label="Time of day"><Select value={win} onChange={(e) => setWin(e.target.value as DeliveryWindow)}>{(Object.keys(WINDOW_LABEL) as DeliveryWindow[]).map((k) => <option key={k} value={k}>{WINDOW_LABEL[k]}</option>)}</Select></Field>
          <Field label="On-site contact" hint="Who the driver can ring. Not the customer unless you choose."><Input value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={60} /></Field>
          <Field label="Their number"><Input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={30} /></Field>
          <Field label="Notes for the supplier (optional)" className="sm:col-span-2"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. Narrow lane, leave on the driveway, crane lorry needed" /></Field>
        </div>

        <FormError>{error}</FormError>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || suppliers === null}>{busy ? "Sending…" : "Send to supplier"}</Button>
        </div>
      </form>
    </Modal>
  );
}
