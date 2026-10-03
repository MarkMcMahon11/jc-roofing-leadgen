"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, Empty, Field, FormError, Input, Modal, PageHeader, Plate, Select, Stat, Table, Td, Th } from "@/components/admin/ui";
import { BarChart, HBar } from "@/components/admin/charts";
import { addExpense, deleteExpense } from "@/lib/ops/actions";
import { addDays, fmtDate, fmtMonth, gbp, inLastDays, monthKey, pence, sum, today } from "@/lib/ops/format";
import { expenseCat, payMethod } from "@/lib/ops/labels";
import { monthlyCosts, vehicleCosts } from "@/lib/ops/selectors";
import { useOps } from "@/lib/ops/store";
import type { ExpenseCategory, PayMethod } from "@/lib/ops/types";

export default function CostsPage() {
  const { db, mutate } = useOps();
  const [adding, setAdding] = useState(false);
  const [vanF, setVanF] = useState("");
  const [catF, setCatF] = useState("");
  const [limit, setLimit] = useState(40);

  const t = today();
  const m = useMemo(() => {
    const mk = monthKey(t);
    const last = monthKey(addDays(mk + "-01", -1));
    const in90 = db.expenses.filter((e) => inLastDays(e.date, 90, t));
    return {
      this: sum(db.expenses.filter((e) => e.date.startsWith(mk)).map((e) => e.amount)),
      last: sum(db.expenses.filter((e) => e.date.startsWith(last)).map((e) => e.amount)),
      in90,
      total90: sum(in90.map((e) => e.amount)),
      fuel90: sum(in90.filter((e) => e.category === "fuel").map((e) => e.amount)),
      months: monthlyCosts(db, 6),
      byCat: (Object.keys(expenseCat) as ExpenseCategory[]).map((k) => ({ k, v: sum(in90.filter((e) => e.category === k).map((e) => e.amount)) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v),
    };
  }, [db, t]);

  const rows = db.expenses.filter((e) => (!vanF || e.vehicleId === vanF) && (!catF || e.category === catF));
  const onRoadVans = db.vehicles.filter((v) => v.status !== "off_road").length;
  const vanTotal90 = sum(m.in90.filter((e) => e.vehicleId).map((e) => e.amount));
  const general90 = sum(m.in90.filter((e) => !e.vehicleId).map((e) => e.amount));
  const perVan = onRoadVans ? vanTotal90 / onRoadVans / 3 : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Costs" sub="What the vans cost to run: fuel, servicing, insurance, tax and more" actions={<Button onClick={() => setAdding(true)}><Plus size={16} /> Add a cost</Button>} />
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Stat label="This month" value={gbp(Math.round(m.this))} sub={`Last month ${gbp(Math.round(m.last))}`} tone={m.this > m.last ? "warn" : "good"} />
        <Stat label="Last 90 days" value={gbp(Math.round(m.total90))} sub={`${m.in90.length} entries`} />
        <Stat label="Per van, per month" value={gbp(Math.round(perVan))} sub="Van costs only, averaged over 90 days" />
        <Stat label="Fuel share" value={m.total90 ? `${Math.round((m.fuel90 / m.total90) * 100)}%` : "—"} sub={`${gbp(Math.round(m.fuel90))} on fuel`} />
      </div>

      <div className="grid gap-4 @3xl:grid-cols-3">
        <Card className="@3xl:col-span-2">
          <CardHeader title="Costs against jobs booked, last 6 months" sub="Jobs are counted in the month they start, at their agreed price" />
          <div className="p-5">
            <BarChart data={m.months} series={[{ key: "costs", label: "Van costs", color: "#b11017" }, { key: "won", label: "Jobs booked", color: "#d6d4c7" }]} xLabel={(r) => fmtMonth(String(r.month))} format={(n) => gbp(n, true)} />
          </div>
        </Card>
        <Card>
          <CardHeader title="By category, 90 days" />
          <div className="p-5"><HBar items={m.byCat.map((x) => ({ label: expenseCat[x.k], value: Math.round(x.v), color: "#b11017" }))} /></div>
        </Card>
      </div>

      <Card>
        <CardHeader title="By van, 90 days" />
        <Table minWidth={620}>
          <thead><tr><Th>Van</Th><Th right>Fuel</Th><Th right>Everything else</Th><Th right>Total</Th></tr></thead>
          <tbody>
            {db.vehicles.map((v) => {
              const c = vehicleCosts(db, v, 90);
              return (
                <tr key={v.id}>
                  <Td><Link href={`/admin/vans/${v.id}`} className="flex min-h-10 items-center gap-2 hover:underline"><Plate>{v.reg}</Plate> <span className="text-mute">{v.make} {v.model}</span></Link></Td>
                  <Td right>{gbp(c.fuel)}</Td>
                  <Td right>{gbp(c.total - c.fuel)}</Td>
                  <Td right className="font-semibold">{gbp(c.total)}</Td>
                </tr>
              );
            })}
            {general90 > 0 && (
              <tr><Td className="text-mute">General (not one van)</Td><Td right>—</Td><Td right>{gbp(general90)}</Td><Td right className="font-semibold">{gbp(general90)}</Td></tr>
            )}
          </tbody>
        </Table>
        {db.vehicles.length === 0 && <Empty>Add your vans first.</Empty>}
      </Card>

      <Card>
        <CardHeader title="All costs" sub={`${rows.length} entr${rows.length === 1 ? "y" : "ies"}`} />
        <div className="grid gap-3 border-b border-cream p-4 sm:grid-cols-2">
          <Select aria-label="Filter by van" value={vanF} onChange={(e) => { setVanF(e.target.value); setLimit(40); }} className="!mt-0">
            <option value="">All vans</option>
            {db.vehicles.map((v) => <option key={v.id} value={v.id}>{v.reg}</option>)}
          </Select>
          <Select aria-label="Filter by category" value={catF} onChange={(e) => { setCatF(e.target.value); setLimit(40); }} className="!mt-0">
            <option value="">All categories</option>
            {(Object.keys(expenseCat) as ExpenseCategory[]).map((k) => <option key={k} value={k}>{expenseCat[k]}</option>)}
          </Select>
        </div>
        <Table minWidth={720}>
          <thead><tr><Th>Date</Th><Th>What</Th><Th>Van</Th><Th>Category</Th><Th>Paid with</Th><Th right>Amount</Th><Th><span className="sr-only">Delete</span></Th></tr></thead>
          <tbody>
            {rows.slice(0, limit).map((e) => (
              <tr key={e.id}>
                <Td className="whitespace-nowrap">{fmtDate(e.date)}</Td>
                <Td>{e.description}</Td>
                <Td>{e.vehicleId ? <Plate>{db.vehicles.find((v) => v.id === e.vehicleId)?.reg ?? "—"}</Plate> : <span className="text-mute">General</span>}</Td>
                <Td>{expenseCat[e.category]}</Td>
                <Td>{e.method ? payMethod[e.method] : "—"}</Td>
                <Td right>{gbp(e.amount)}</Td>
                <Td><button type="button" aria-label={`Delete ${e.description}`} onClick={() => confirm(`Delete this cost (${e.description}, ${gbp(e.amount)})?`) && mutate((d) => deleteExpense(d, e.id))} className="grid h-10 w-10 place-items-center rounded-lg text-mute hover:bg-cream hover:text-brand"><Trash2 size={15} /></button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {rows.length === 0 && <Empty>No costs yet.</Empty>}
        {rows.length > limit && <div className="p-4 text-center"><Button variant="secondary" onClick={() => setLimit(limit + 60)}>Show more</Button></div>}
      </Card>

      {adding && <ExpenseForm onClose={() => setAdding(false)} />}
    </div>
  );
}

function ExpenseForm({ onClose }: { onClose: () => void }) {
  const { db, mutate } = useOps();
  const [error, setError] = useState("");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const amount = Number(s("amount"));
    if (!s("description")) return setError("Say what it was for.");
    if (!Number.isFinite(amount) || amount <= 0) return setError("Enter the amount.");
    mutate((d) => addExpense(d, { date: s("date") || today(), category: s("category") as ExpenseCategory, amount: pence(amount), description: s("description"), ...(s("vehicleId") ? { vehicleId: s("vehicleId") } : {}), ...(s("method") ? { method: s("method") as PayMethod } : {}) }));
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Add a cost">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Date"><Input name="date" type="date" defaultValue={today()} max={today()} required /></Field>
        <Field label="Amount (£)"><Input name="amount" type="number" min={0} step={0.01} required /></Field>
        <Field label="What was it for?" className="sm:col-span-2"><Input name="description" required maxLength={200} placeholder="Diesel, tyres, parking…" /></Field>
        <Field label="Category">
          <Select name="category" defaultValue="fuel">{(Object.keys(expenseCat) as ExpenseCategory[]).map((k) => <option key={k} value={k}>{expenseCat[k]}</option>)}</Select>
        </Field>
        <Field label="Van">
          <Select name="vehicleId" defaultValue="">
            <option value="">General (not one van)</option>
            {db.vehicles.map((v) => <option key={v.id} value={v.id}>{v.reg}</option>)}
          </Select>
        </Field>
        <Field label="Paid with">
          <Select name="method" defaultValue="card">{(Object.keys(payMethod) as PayMethod[]).map((k) => <option key={k} value={k}>{payMethod[k]}</option>)}</Select>
        </Field>
        <FormError>{error}</FormError>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Add cost</Button>
        </div>
      </form>
    </Modal>
  );
}
