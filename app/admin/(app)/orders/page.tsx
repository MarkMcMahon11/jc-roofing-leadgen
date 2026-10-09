"use client";

import { Copy, MapPin, Package, Pencil, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardHeader, Empty, Field, FormError, Input, Modal, PageHeader, Segmented, Textarea, type Tone } from "@/components/admin/ui";
import { OrderForm } from "@/components/admin/OrderForm";
import { fmtDateTime, fmtDay } from "@/lib/ops/format";
import { WINDOW_LABEL, type Order, type OrderStatus, type Supplier } from "@/lib/orders/types";

type OrderRow = Omit<Order, "token"> & { link: string };
type Data = { suppliers: Supplier[]; orders: OrderRow[]; awaiting: number; config: { email: boolean; sms: boolean } };

const TONE: Record<OrderStatus, Tone> = { sent: "amber", confirmed: "green", declined: "red", delivered: "slate", cancelled: "slate", failed: "red" };
const LABEL: Record<OrderStatus, string> = { sent: "Waiting for supplier", confirmed: "Confirmed", declined: "Supplier can't supply", delivered: "Delivered", cancelled: "Cancelled", failed: "Not delivered to supplier" };
const OPEN: OrderStatus[] = ["sent", "confirmed", "failed", "declined"];

async function post(body: unknown): Promise<{ ok: boolean; error?: string; supplier?: Supplier }> {
  try {
    const r = await fetch("/api/admin/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, ...j } : { ok: false, error: j.error ?? "That didn't work. Try again." };
  } catch {
    return { ok: false, error: "No connection. Try again." };
  }
}

export default function OrdersPage() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<"orders" | "suppliers">("orders");
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/orders", { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch {
      /* try again on the next poll */
    }
  }, []);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => !document.hidden && void load(), 15_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  async function act(key: string, body: unknown) {
    if (working) return;
    setWorking(key);
    setError("");
    const r = await post(body);
    if (!r.ok) setError(r.error ?? "");
    await load();
    window.dispatchEvent(new Event("orders:changed"));
    setWorking("");
  }

  if (!data) return <div className="py-16 text-center text-sm text-steel">Loading…</div>;
  const orders = data.orders.filter((o) => (filter === "all" ? true : filter === "open" ? OPEN.includes(o.status) : !OPEN.includes(o.status)));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Materials orders"
        sub="Order materials to a customer's site. The supplier gets it by email and text and confirms the delivery with one tap."
        actions={<Button onClick={() => setCreating(true)}><Plus size={16} aria-hidden /> New order</Button>}
      />
      {!data.config.email && !data.config.sms && (
        <div role="note" className="rounded-2xl border border-gold/70 bg-amber-50 p-3 text-sm text-night">
          <b>Orders are in preview.</b> Email and text sending isn&apos;t switched on yet, so suppliers don&apos;t receive anything. You can see exactly what would be sent under Texts and emails. Add the Resend (email) and Twilio (text) settings on Vercel to send for real.
        </div>
      )}
      {error && <FormError>{error}</FormError>}
      <Segmented value={tab} onChange={setTab} options={[{ value: "orders", label: "Orders", count: data.awaiting || undefined }, { value: "suppliers", label: "Suppliers", count: data.suppliers.length || undefined }]} />

      {tab === "orders" && (
        <>
          <Segmented value={filter} onChange={setFilter} options={[{ value: "open", label: "Open" }, { value: "done", label: "Finished" }, { value: "all", label: "All" }]} />
          <Card>
            {orders.length === 0 && <Empty>{data.orders.length === 0 ? "No orders yet. Press New order, or open the Project map, click a site and choose Order materials." : "Nothing here."}</Empty>}
            <ul className="divide-y divide-silver">
              {orders.map((o) => (
                <li key={o.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-night">{o.ref}</span>
                    <Badge tone={TONE[o.status]} dot>{LABEL[o.status]}</Badge>
                    <span className="min-w-0 break-words text-sm text-steel [overflow-wrap:anywhere]">{o.supplierName}</span>
                    <span className="ml-auto text-xs text-steel">{fmtDateTime(o.createdAt)}</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-sm text-night"><MapPin size={15} aria-hidden className="mt-0.5 shrink-0 text-steel" /><span className="min-w-0 break-words [overflow-wrap:anywhere]"><b>{o.site.name}</b> · {o.site.address}</span></div>
                  <div className="text-sm">Deliver by <b>{fmtDay(o.deliverBy)}</b> · {WINDOW_LABEL[o.window]}{o.reply?.date && o.reply.date !== o.deliverBy ? <span className="ml-1 font-semibold text-brand">(supplier says {fmtDay(o.reply.date)})</span> : null}</div>
                  <ul className="rounded-xl bg-silver-soft p-2.5 text-sm">
                    {o.items.map((i, n) => <li key={n} className="flex justify-between gap-3"><span className="min-w-0 break-words [overflow-wrap:anywhere]">{i.description}</span><span className="max-w-[45%] shrink-0 break-words text-right font-semibold tabular-nums [overflow-wrap:anywhere]">{i.qty} {i.unit}</span></li>)}
                  </ul>
                  {o.reply?.note && <p className="break-words text-sm text-night [overflow-wrap:anywhere]">Supplier says: &ldquo;{o.reply.note}&rdquo;</p>}
                  <details className="text-xs text-steel">
                    <summary className="flex min-h-10 cursor-pointer items-center font-semibold">History and supplier link</summary>
                    <ul className="mt-1 space-y-0.5">{o.log.map((l, n) => <li key={n} className="break-words [overflow-wrap:anywhere]">{fmtDateTime(l.at)}: {l.text}</li>)}</ul>
                    <div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded bg-silver-soft px-2 py-1">{o.link}</code><button type="button" className="inline-flex min-h-10 items-center gap-1 font-semibold text-brand" onClick={() => { void navigator.clipboard?.writeText(o.link).then(() => { setCopied(o.id); setTimeout(() => setCopied(""), 1500); }); }}><Copy size={13} aria-hidden /> {copied === o.id ? "Copied" : "Copy"}</button></div>
                  </details>
                  {OPEN.includes(o.status) && (
                    <div className="flex flex-wrap gap-2">
                      {o.status !== "declined" && <Button size="sm" variant="secondary" disabled={!!working} onClick={() => void act(`r${o.id}`, { op: "order_resend", id: o.id })}><RefreshCw size={14} aria-hidden /> Send again</Button>}
                      {o.status !== "confirmed" && <Button size="sm" variant="secondary" disabled={!!working} onClick={() => void act(`c${o.id}`, { op: "order_status", id: o.id, status: "confirmed" })}>They confirmed by phone</Button>}
                      <Button size="sm" disabled={!!working} onClick={() => void act(`d${o.id}`, { op: "order_status", id: o.id, status: "delivered" })}>Mark delivered</Button>
                      <Button size="sm" variant="danger" disabled={!!working} onClick={() => { if (confirm(`Cancel ${o.ref}? ${o.supplierName} will be told.`)) void act(`x${o.id}`, { op: "order_status", id: o.id, status: "cancelled" }); }}>Cancel</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {tab === "suppliers" && (
        <Card>
          <CardHeader title="Suppliers" sub="Merchants and manufacturers you order from" action={<Button size="sm" onClick={() => setEditing("new")}><Plus size={14} aria-hidden /> Add supplier</Button>} />
          {data.suppliers.length === 0 && <Empty>No suppliers yet. Add the merchants you order slates, felt and timber from.</Empty>}
          <ul className="divide-y divide-silver">
            {data.suppliers.map((s) => (
              <li key={s.id} className="flex items-start gap-3 p-4">
                <Package size={18} aria-hidden className="mt-0.5 shrink-0 text-steel" />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="break-words font-semibold text-night [overflow-wrap:anywhere]">{s.name} {!s.active && <Badge tone="slate">Not in use</Badge>}</div>
                  <div className="break-words text-steel [overflow-wrap:anywhere]">{[s.contact, s.email, s.phone, s.account && `Account ${s.account}`].filter(Boolean).join(" · ")}</div>
                  {s.notes && <div className="break-words text-xs text-steel [overflow-wrap:anywhere]">{s.notes}</div>}
                </div>
                <Button size="sm" variant="secondary" onClick={() => setEditing(s)}><Pencil size={14} aria-hidden /> Edit</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {creating && <OrderForm onClose={() => { setCreating(false); void load(); window.dispatchEvent(new Event("orders:changed")); }} />}
      {editing && <SupplierForm supplier={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function SupplierForm({ supplier, onClose, onSaved }: { supplier?: Supplier; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState({ name: supplier?.name ?? "", email: supplier?.email ?? "", phone: supplier?.phone ?? "", contact: supplier?.contact ?? "", account: supplier?.account ?? "", notes: supplier?.notes ?? "", active: supplier?.active ?? true });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await post({ op: "supplier_save", supplier: { ...(supplier ? { id: supplier.id } : {}), ...v } });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "");
    onSaved();
  }
  async function remove() {
    if (!supplier || !confirm(`Remove ${supplier.name}? Past orders stay in the list.`)) return;
    setBusy(true);
    const r = await post({ op: "supplier_delete", id: supplier.id });
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "");
    onSaved();
  }
  return (
    <Modal open onClose={onClose} title={supplier ? `Edit ${supplier.name}` : "Add a supplier"}>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <Field label="Supplier name" className="sm:col-span-2"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={80} required /></Field>
        <Field label="Email for orders"><Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} maxLength={254} /></Field>
        <Field label="Mobile (for texts)"><Input type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} maxLength={30} /></Field>
        <Field label="Who to address it to (optional)"><Input value={v.contact} onChange={(e) => setV({ ...v, contact: e.target.value })} maxLength={80} /></Field>
        <Field label="Our account number (optional)"><Input value={v.account} onChange={(e) => setV({ ...v, account: e.target.value })} maxLength={40} /></Field>
        <Field label="Notes (optional)" className="sm:col-span-2"><Textarea value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} maxLength={300} /></Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm sm:col-span-2"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} className="h-4 w-4 shrink-0 accent-[#b11017]" /> Use this supplier for new orders</label>
        <p className="text-xs text-steel sm:col-span-2">Add at least an email or a mobile. Orders go to both if you give both.</p>
        <div className="sm:col-span-2"><FormError>{error}</FormError></div>
        <div className="flex flex-wrap justify-between gap-2 sm:col-span-2">
          {supplier ? <Button variant="danger" onClick={() => void remove()} disabled={busy}>Remove</Button> : <span />}
          <div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save supplier"}</Button></div>
        </div>
      </form>
    </Modal>
  );
}
