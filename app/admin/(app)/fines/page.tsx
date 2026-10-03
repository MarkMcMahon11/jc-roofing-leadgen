"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge, Button, Card, Empty, Field, FormError, Input, Modal, PageHeader, Plate, Segmented, Select, Stat, Table, Td, Th } from "@/components/admin/ui";
import { addFine, setFineStatus } from "@/lib/ops/actions";
import { addDays, daysBetween, fmtDate, gbp, pence, relDays, sum, today } from "@/lib/ops/format";
import { fineStatus, fineType } from "@/lib/ops/labels";
import { useOps } from "@/lib/ops/store";
import type { FleetDB, Fine, FineType } from "@/lib/ops/types";

type Filter = "all" | "open" | Fine["status"];

/** Who had the van that day: the crew sent out with it on a job, otherwise its usual driver. */
function suggestDriver(db: FleetDB, vanId: string, date: string): string {
  const job = db.jobs.find((j) => j.status !== "cancelled" && j.vanIds.includes(vanId) && j.date <= date && (j.endDate ?? j.date) >= date);
  const drivers = (job?.crewIds ?? []).map((id) => db.crew.find((c) => c.id === id)).filter((c) => c?.drives);
  return drivers[0]?.id ?? db.vehicles.find((v) => v.id === vanId)?.assignedCrewId ?? "";
}

export default function FinesPage() {
  const { db, mutate } = useOps();
  const [filter, setFilter] = useState<Filter>("open");
  const [adding, setAdding] = useState(false);

  const open = db.fines.filter((f) => f.status === "to_name" || f.status === "named" || f.status === "appealed");
  const toName = db.fines.filter((f) => f.status === "to_name").sort((a, b) => (a.nameBy < b.nameBy ? -1 : 1));
  const shown = db.fines.filter((f) => (filter === "all" ? true : filter === "open" ? open.includes(f) : f.status === filter)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const year = db.fines.filter((f) => f.date >= addDays(today(), -365));
  const set = (f: Fine, s: Fine["status"]) => mutate((d) => setFineStatus(d, f.id, s));

  return (
    <div className="space-y-6">
      <PageHeader title="Fines and notices" sub="Parking, speeding and bus-lane notices sent to the company as the vehicle's keeper" actions={<Button onClick={() => setAdding(true)}><Plus size={16} /> Record a notice</Button>} />
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Stat label="Name the driver" value={toName.length} tone={toName.length ? "bad" : undefined} sub={toName[0] ? `Soonest: ${relDays(daysBetween(today(), toName[0].nameBy))}` : "Nothing waiting"} />
        <Stat label="Still open" value={open.length} sub="Not yet paid" />
        <Stat label="Last 12 months" value={gbp(sum(year.map((f) => f.amount)))} sub={`${year.length} notice${year.length === 1 ? "" : "s"}`} />
        <Stat label="Points handed out" value={sum(year.map((f) => f.points))} sub="Last 12 months" />
      </div>

      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: "open", label: "Open", count: open.length },
          { value: "to_name", label: "Name the driver", count: db.fines.filter((f) => f.status === "to_name").length },
          { value: "named", label: "Driver named", count: db.fines.filter((f) => f.status === "named").length },
          { value: "recharged", label: "Taken from driver", count: db.fines.filter((f) => f.status === "recharged").length },
          { value: "paid", label: "Paid", count: db.fines.filter((f) => f.status === "paid").length },
          { value: "all", label: "All", count: db.fines.length },
        ]}
      />

      <Card>
        <Table minWidth={980}>
          <thead>
            <tr><Th>Notice</Th><Th>Van and driver</Th><Th>What happened</Th><Th right>Amount</Th><Th>Deadlines</Th><Th>Status</Th><Th>Action</Th></tr>
          </thead>
          <tbody>
            {shown.map((f) => {
              const v = db.vehicles.find((x) => x.id === f.vehicleId);
              const c = db.crew.find((x) => x.id === f.crewId);
              const nameDays = daysBetween(today(), f.nameBy);
              const discDays = f.discountBy ? daysBetween(today(), f.discountBy) : null;
              const live = f.status === "to_name" || f.status === "named";
              return (
                <tr key={f.id}>
                  <Td>
                    <div className="font-mono text-xs font-semibold">{f.ref}</div>
                    <div className="text-xs text-steel">{fineType[f.type]} · {fmtDate(f.date)}{f.time ? ` ${f.time}` : ""}</div>
                  </Td>
                  <Td>
                    {v ? <Link href={`/admin/vans/${v.id}`} className="inline-flex min-h-10 items-center hover:underline"><Plate>{v.reg}</Plate></Link> : "—"}
                    <div className="mt-0.5 text-xs">{c ? <Link href={`/admin/crew/${c.id}`} className="inline-flex min-h-10 items-center hover:underline">{c.name}</Link> : <span className="text-steel">driver not set</span>}</div>
                  </Td>
                  <Td><div className="max-w-[16rem]">{f.description}</div><div className="text-xs text-steel">{f.location}{f.points ? ` · ${f.points} points` : ""}</div></Td>
                  <Td right>{gbp(f.amount)}</Td>
                  <Td className="text-xs">
                    {f.status === "to_name" && <div className={nameDays <= 7 ? "font-semibold text-brand" : ""}>Name driver by {fmtDate(f.nameBy)} ({relDays(nameDays)})</div>}
                    {live && discDays !== null && discDays >= 0 && <div className="text-amber-800">Reduced amount until {fmtDate(f.discountBy)}</div>}
                    {!live && <span className="text-steel">—</span>}
                  </Td>
                  <Td><Badge tone={fineStatus[f.status].tone}>{fineStatus[f.status].label}</Badge></Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {f.status === "to_name" && <Button size="sm" onClick={() => set(f, "named")}>Driver named</Button>}
                      {(f.status === "to_name" || f.status === "named") && <Button size="sm" variant="secondary" onClick={() => set(f, "paid")}>Company paid</Button>}
                      {(f.status === "to_name" || f.status === "named") && f.crewId && <Button size="sm" variant="secondary" onClick={() => set(f, "recharged")}>Taken from driver</Button>}
                      {live && <Button size="sm" variant="ghost" onClick={() => set(f, "appealed")}>Appealing</Button>}
                      {f.status === "appealed" && <Button size="sm" variant="secondary" onClick={() => set(f, "paid")}>Lost: paid</Button>}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {shown.length === 0 && <Empty>{db.fines.length === 0 ? "No notices recorded. Add one when a letter arrives." : "Nothing here."}</Empty>}
      </Card>
      <p className="text-xs text-steel">
        Rules of thumb: a parking or speeding notice sent to the company usually has to be answered within 28 days by naming who was driving, and a reduced amount is often offered for paying within 14 days. Always follow the dates on the notice itself.
      </p>
      {adding && <FineForm onClose={() => setAdding(false)} />}
    </div>
  );
}

function FineForm({ onClose }: { onClose: () => void }) {
  const { db, mutate } = useOps();
  const [vanId, setVanId] = useState("");
  const [date, setDate] = useState(today());
  const [crewId, setCrewId] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");

  const suggested = vanId ? suggestDriver(db, vanId, date) : "";
  const driver = touched ? crewId : suggested;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    if (!vanId) return setError("Choose the van.");
    if (!s("ref")) return setError("Enter the notice reference from the letter.");
    const amount = Number(s("amount"));
    if (!Number.isFinite(amount) || amount < 0) return setError("Enter the amount on the notice.");
    mutate((d) =>
      addFine(d, {
        vehicleId: vanId,
        date,
        ref: s("ref"),
        type: s("type") as FineType,
        description: s("description") || fineType[s("type") as FineType],
        location: s("location"),
        points: Number(s("points")) || 0,
        amount: pence(amount),
        ...(driver ? { crewId: driver } : {}),
        ...(s("time") ? { time: s("time") } : {}),
      }),
    );
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Record a notice" wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Van">
          <Select value={vanId} onChange={(e) => setVanId(e.target.value)} required>
            <option value="" disabled>Choose a van…</option>
            {db.vehicles.map((v) => <option key={v.id} value={v.id}>{v.reg} · {v.make} {v.model}</option>)}
          </Select>
        </Field>
        <Field label="Date of the offence"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required max={today()} /></Field>
        <Field label="Driver" hint={suggested && !touched ? "Suggested from the jobs and usual driver for that day." : undefined}>
          <Select value={driver} onChange={(e) => { setCrewId(e.target.value); setTouched(true); }}>
            <option value="">Not known</option>
            {db.crew.filter((c) => c.drives).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Time (optional)"><Input name="time" type="time" /></Field>
        <Field label="Notice reference"><Input name="ref" required maxLength={40} placeholder="From the letter" /></Field>
        <Field label="Type">
          <Select name="type" defaultValue="parking">{(Object.keys(fineType) as FineType[]).map((k) => <option key={k} value={k}>{fineType[k]}</option>)}</Select>
        </Field>
        <Field label="What happened" className="sm:col-span-2"><Input name="description" maxLength={200} placeholder="Parked on double yellow lines" /></Field>
        <Field label="Where"><Input name="location" maxLength={120} placeholder="Church Crescent, Dumfries" /></Field>
        <Field label="Amount (£)"><Input name="amount" type="number" min={0} step="any" required /></Field>
        <Field label="Penalty points (speeding)"><Input name="points" type="number" min={0} max={12} defaultValue={0} /></Field>
        <FormError>{error}</FormError>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Record notice</Button>
        </div>
      </form>
    </Modal>
  );
}
