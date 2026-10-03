"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Gauge, MapPin, Pencil, Radio, Wrench } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Stat, Table, Td, Th } from "@/components/admin/ui";
import { HBar } from "@/components/admin/charts";
import { MaintenanceForm } from "@/components/admin/MaintenanceForm";
import { VanForm } from "@/components/admin/VanForm";
import { setVanStatus, updateVan } from "@/lib/ops/actions";
import { daysBetween, fmtDate, fmtDay, fmtDateTime, gbp, num, pct, relDays, sum, today } from "@/lib/ops/format";
import { expenseCat, fineStatus, jobStatus, maintStatus, maintType, vehicleStatus } from "@/lib/ops/labels";
import { vanUtilisation, vehicleCosts } from "@/lib/ops/selectors";
import { useOps } from "@/lib/ops/store";
import type { ExpenseCategory } from "@/lib/ops/types";

export default function VanPage() {
  const { id } = useParams<{ id: string }>();
  const { db, mutate } = useOps();
  const [edit, setEdit] = useState(false);
  const [book, setBook] = useState(false);
  const [km, setKm] = useState(false);

  const v = db.vehicles.find((x) => x.id === id);
  if (!v) return <Empty>That van wasn&apos;t found. <Link href="/admin/vans" className="underline">Back to Vans</Link></Empty>;

  const driver = db.crew.find((c) => c.id === v.assignedCrewId);
  const maint = db.maintenance.filter((m) => m.vehicleId === v.id).sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
  const fines = db.fines.filter((f) => f.vehicleId === v.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const jobs = db.jobs.filter((j) => j.vanIds.includes(v.id) && j.status !== "cancelled").sort((a, b) => (a.date < b.date ? 1 : -1));
  const c90 = vehicleCosts(db, v, 90);
  const byCat = (Object.keys(expenseCat) as ExpenseCategory[]).map((k) => ({ label: expenseCat[k], value: sum(c90.rows.filter((e) => e.category === k).map((e) => e.amount)) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
  const left = v.nextServiceMiles - v.mileage;
  const util = vanUtilisation(db, v.id);

  const docs: [string, string, string | undefined][] = [
    ["MOT", "", v.status === "off_road" ? undefined : v.docs.mot],
    ["Vehicle tax", "", v.status === "off_road" ? undefined : v.docs.roadTax],
    ["Insurance", "", v.docs.insurance],
    ["Breakdown cover", "", v.docs.breakdown],
    ["Service due (date)", "", v.nextServiceDate],
  ];

  return (
    <div className="space-y-6">
      <Link href="/admin/vans" className="inline-flex min-h-10 items-center gap-1 text-sm text-mute hover:text-ink"><ArrowLeft size={16} /> Vans</Link>

      <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-end @3xl:justify-between">
        <div className="flex items-center gap-4">
          <div className="rounded-xl bg-gold px-3 py-2 font-mono text-lg font-bold text-ink">{v.reg}</div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{v.make} {v.model} <span className="font-normal text-mute">{v.year}</span></h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-mute">
              <Badge tone={vehicleStatus[v.status].tone} dot>{vehicleStatus[v.status].label}</Badge>
              <span>{v.kind}</span>·<span>{v.colour}</span>·<span>{v.fuel}</span>{v.payloadKg ? <>·<span>{num(v.payloadKg)} kg payload</span></> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setBook(true)}><Wrench size={16} /> Book service or repair</Button>
          <Button variant="secondary" onClick={() => setKm(true)}><Gauge size={16} /> Update mileage</Button>
          <Button variant="secondary" onClick={() => setEdit(true)}><Pencil size={16} /> Edit details</Button>
          {v.status === "off_road" ? (
            <Button variant="secondary" onClick={() => mutate((d) => setVanStatus(d, v.id, "at_yard"))}>Back on the road</Button>
          ) : (
            <Button variant="secondary" onClick={() => confirm(`Take ${v.reg} off the road (SORN)? It won't be offered for jobs and its MOT and tax reminders stop.`) && mutate((d) => setVanStatus(d, v.id, "off_road"))}>Take off the road</Button>
          )}
        </div>
      </div>

      {v.notes && <div className="rounded-xl border border-gold/70 bg-amber-50 px-4 py-3 text-sm">{v.notes}</div>}

      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Stat label="Mileage" value={`${num(v.mileage)} mi`} tone={left < 0 ? "bad" : left < 1000 ? "warn" : undefined} sub={left < 0 ? `Service overdue ${num(-left)} mi` : `Service in ${num(left)} mi`} />
        <Stat label="Costs, 90 days" value={gbp(c90.total)} sub={`${gbp(c90.fuel)} of it fuel`} />
        <Stat label="Booked, next 2 weeks" value={v.status === "off_road" ? "—" : pct(util)} sub="Working days with a job or visit" />
        <Stat label="Worth about" value={gbp(v.value)} sub={`Bought for ${gbp(v.purchasePrice)}`} />
      </div>

      <div className="grid gap-4 @3xl:grid-cols-3">
        <Card>
          <CardHeader title="Deadlines" action={<button type="button" onClick={() => setEdit(true)} className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-mute hover:text-ink"><Pencil size={12} /> Update</button>} />
          <ul className="divide-y divide-cream">
            {docs.map(([label, , date]) => {
              if (!date) return null;
              const days = daysBetween(today(), date);
              return (
                <li key={label} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <span>{label}</span>
                  <Badge tone={days < 0 ? "red" : days <= 15 ? "amber" : "green"}>{fmtDate(date)} · {relDays(days)}</Badge>
                </li>
              );
            })}
            <li className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
              <span>Service (miles)</span>
              <Badge tone={left < 0 ? "red" : left < 1000 ? "amber" : "green"}>{num(v.nextServiceMiles)} mi</Badge>
            </li>
          </ul>
          <div className="space-y-1 border-t border-cream px-5 py-3 text-xs text-mute">
            {v.vin && <div>VIN <span className="font-mono">{v.vin}</span></div>}
            <a href="https://www.gov.uk/check-vehicle-tax" target="_blank" rel="noreferrer" className="underline">Check tax and MOT on GOV.UK</a>
          </div>
        </Card>

        <Card>
          <CardHeader title="Fitted equipment and driver" />
          <div className="space-y-3 p-5 text-sm">
            <div className="flex flex-wrap gap-1.5">
              {v.equipment.length ? v.equipment.map((x) => <Badge key={x}>{x}</Badge>) : <span className="text-mute">Nothing listed.</span>}
            </div>
            <div>Usual driver: {driver ? <Link href={`/admin/crew/${driver.id}`} className="font-medium underline">{driver.name}</Link> : <span className="text-mute">none</span>}</div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Location" sub="Sample position until a tracker is connected" />
          <div className="space-y-3 p-5 text-sm">
            <div className="flex items-center gap-2"><Radio size={16} aria-hidden className={v.tracker.online ? "text-emerald-600" : "text-line"} /> {v.tracker.online ? "Online" : "No signal"} <span className="text-mute">· {fmtDateTime(v.tracker.lastSeen)}</span></div>
            <div className="flex items-center gap-2"><MapPin size={16} aria-hidden className="text-mute" /> {v.tracker.area}</div>
            <Link href={`/admin/map?van=${v.id}`} className="flex min-h-11 items-center justify-center rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark">See on the map</Link>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 @3xl:grid-cols-2">
        <Card>
          <CardHeader title="Jobs and visits" sub={`${jobs.length} on record`} />
          <ul className="max-h-80 divide-y divide-cream overflow-y-auto">
            {jobs.slice(0, 12).map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <div className="min-w-0"><div className="truncate font-medium">{j.title}</div><div className="text-xs text-mute">{fmtDay(j.date)}{j.time ? ` ${j.time}` : ""} · {j.customer ?? j.address}</div></div>
                <Badge tone={jobStatus[j.status].tone}>{jobStatus[j.status].label}</Badge>
              </li>
            ))}
            {jobs.length === 0 && <Empty>Not on any job yet.</Empty>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Where the money goes" sub="Last 90 days" />
          <div className="p-5"><HBar items={byCat.map((x) => ({ label: x.label, value: Math.round(x.value), color: "#b11017" }))} /></div>
        </Card>
      </div>

      <div className="grid gap-4 @3xl:grid-cols-2">
        <Card>
          <CardHeader title="Servicing and repairs" sub={`${maint.length} orders · ${gbp(sum(maint.filter((m) => m.status === "done").map((m) => m.cost)))} spent`} />
          <ul className="max-h-80 divide-y divide-cream overflow-y-auto">
            {maint.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <div className="min-w-0"><div className="truncate font-medium">{m.description}</div><div className="text-xs text-mute">{fmtDate(m.openedAt)} · {maintType[m.type]}{m.garage ? ` · ${m.garage}` : ""}</div></div>
                <div className="text-right"><div className="font-medium tabular-nums">{gbp(m.cost)}</div><Badge tone={maintStatus[m.status].tone}>{maintStatus[m.status].label}</Badge></div>
              </li>
            ))}
            {maint.length === 0 && <Empty>No records.</Empty>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Fines and notices" sub={`${fines.length} on record`} />
          <ul className="max-h-80 divide-y divide-cream overflow-y-auto">
            {fines.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <div className="min-w-0"><div className="truncate font-medium">{f.description}</div><div className="text-xs text-mute">{fmtDate(f.date)} · {f.location} · {db.crew.find((c) => c.id === f.crewId)?.name.split(" ")[0] ?? "driver unknown"}</div></div>
                <div className="text-right"><div className="font-medium tabular-nums">{gbp(f.amount)}</div><Badge tone={fineStatus[f.status].tone}>{fineStatus[f.status].label}</Badge></div>
              </li>
            ))}
            {fines.length === 0 && <Empty>No fines. Well done.</Empty>}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent costs" action={<Link href="/admin/costs" className="inline-flex min-h-10 items-center whitespace-nowrap text-xs font-medium text-mute hover:text-ink">All costs →</Link>} />
        <Table minWidth={520}>
          <thead><tr><Th>Date</Th><Th>What</Th><Th>Category</Th><Th right>Amount</Th></tr></thead>
          <tbody>
            {db.expenses.filter((e) => e.vehicleId === v.id).slice(0, 8).map((e) => (
              <tr key={e.id}><Td className="whitespace-nowrap">{fmtDate(e.date)}</Td><Td>{e.description}</Td><Td>{expenseCat[e.category]}</Td><Td right>{gbp(e.amount)}</Td></tr>
            ))}
          </tbody>
        </Table>
        {db.expenses.every((e) => e.vehicleId !== v.id) && <Empty>No costs recorded for this van yet.</Empty>}
      </Card>

      {edit && <VanForm van={v} onClose={() => setEdit(false)} />}
      {book && <MaintenanceForm vehicleId={v.id} onClose={() => setBook(false)} />}
      <Modal open={km} onClose={() => setKm(false)} title="Update mileage">
        {km && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const miles = Number(new FormData(e.currentTarget).get("miles"));
              if (!Number.isFinite(miles) || miles < v.mileage) return;
              mutate((d) => updateVan(d, v.id, { mileage: Math.round(miles), tracker: { ...v.tracker, lastSeen: new Date().toISOString() } }, "mileage updated"));
              setKm(false);
            }}
            className="space-y-4"
          >
            <Field label="Mileage now" hint={`It was ${num(v.mileage)}. Service is due at ${num(v.nextServiceMiles)}.`}><Input name="miles" type="number" min={v.mileage} defaultValue={v.mileage} required /></Field>
            <div className="flex justify-end"><Button type="submit">Save</Button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
