"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, PageHeader, Plate, Stat, Table, Td, Th } from "@/components/admin/ui";
import { HBar } from "@/components/admin/charts";
import { MaintenanceForm } from "@/components/admin/MaintenanceForm";
import { useNextStep } from "@/components/admin/Guide";
import { closeMaintenance, startMaintenance } from "@/lib/ops/actions";
import { daysBetween, fmtDate, gbp, inLastDays, num, relDays, sum, today } from "@/lib/ops/format";
import { maintStatus, maintType } from "@/lib/ops/labels";
import { SERVICE_MILES_WARN } from "@/lib/ops/selectors";
import { useOps } from "@/lib/ops/store";
import type { MaintType } from "@/lib/ops/types";

export default function MaintenancePage() {
  const { db, mutate } = useOps();
  const nextStep = useNextStep();
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);

  const open = db.maintenance.filter((m) => m.status !== "done").sort((a, b) => (a.status === b.status ? (a.openedAt < b.openedAt ? -1 : 1) : a.status === "in_progress" ? -1 : 1));
  const done = db.maintenance.filter((m) => m.status === "done").sort((a, b) => ((a.closedAt ?? "") < (b.closedAt ?? "") ? 1 : -1));
  const recent = done.filter((m) => inLastDays(m.closedAt ?? m.openedAt, 90));
  const spent90 = sum(recent.map((m) => m.cost));
  const downtime = recent.reduce((s, m) => s + Math.max(0, daysBetween(m.openedAt, m.closedAt ?? m.openedAt)), 0);
  const byType = (Object.keys(maintType) as MaintType[]).map((k) => ({ k, v: sum(recent.filter((m) => m.type === k).map((m) => m.cost)) })).filter((x) => x.v).sort((a, b) => b.v - a.v);
  const due = db.vehicles
    .filter((v) => v.status !== "off_road" && (v.nextServiceMiles - v.mileage < SERVICE_MILES_WARN || (v.nextServiceDate && daysBetween(today(), v.nextServiceDate) <= 30)))
    .sort((a, b) => a.nextServiceMiles - a.mileage - (b.nextServiceMiles - b.mileage));
  const byVan = db.vehicles.map((v) => ({ v, cost: sum(recent.filter((m) => m.vehicleId === v.id).map((m) => m.cost)) })).sort((a, b) => b.cost - a.cost);
  const order = db.maintenance.find((m) => m.id === closing);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Servicing and repairs"
        sub="Garage bookings, services by mileage and date, and what it all costs"
        actions={<Button onClick={() => setAdding(true)}><Plus size={16} /> Book a service or repair</Button>}
      />
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Stat label="In the garage now" value={db.vehicles.filter((v) => v.status === "in_garage").length} tone="warn" sub="Vans not earning" />
        <Stat label="Spent, 90 days" value={gbp(spent90)} sub={`${recent.length} job${recent.length === 1 ? "" : "s"}`} />
        <Stat label="Days off the road (90 days)" value={downtime} sub="All vans together" />
        <Stat label="Service due or overdue" value={due.length} tone={due.some((v) => v.nextServiceMiles < v.mileage) ? "bad" : undefined} sub="Under 1,000 miles or 30 days" />
      </div>

      <Card>
        <CardHeader title="Booked and in the garage" sub={`${open.length} order${open.length === 1 ? "" : "s"}`} />
        {open.length === 0 ? (
          <Empty>Nothing booked in.</Empty>
        ) : (
          <ul className="divide-y divide-silver">
            {open.map((m) => {
              const v = db.vehicles.find((x) => x.id === m.vehicleId);
              const days = daysBetween(m.openedAt, today());
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Badge tone={maintStatus[m.status].tone}>{maintStatus[m.status].label}</Badge>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{m.description}</div>
                    <div className="text-xs text-steel">
                      {v && <Link href={`/admin/vans/${v.id}`} className="inline-flex min-h-10 items-center hover:underline"><Plate>{v.reg}</Plate></Link>} {v?.make} {v?.model} · {m.garage || "garage not set"} · {maintType[m.type]} ·{" "}
                      {m.status === "scheduled" ? `${fmtDate(m.openedAt)} (${relDays(-days)})` : `${days} day${days === 1 ? "" : "s"} in the garage`}
                    </div>
                  </div>
                  <div className="text-sm font-medium tabular-nums">{gbp(m.cost)}<span className="ml-1 text-xs font-normal text-steel">est.</span></div>
                  {m.status === "scheduled" ? (
                    <Button size="sm" variant="secondary" onClick={() => mutate((d) => startMaintenance(d, m.id))}>Van is in</Button>
                  ) : (
                    <Button size="sm" onClick={() => setClosing(m.id)}>Finish and release</Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 @3xl:grid-cols-3">
        <Card>
          <CardHeader title="Service due" sub="By mileage or date" />
          <ul className="divide-y divide-silver">
            {due.map((v) => {
              const left = v.nextServiceMiles - v.mileage;
              const dd = v.nextServiceDate ? daysBetween(today(), v.nextServiceDate) : null;
              return (
                <li key={v.id}>
                  <Link href={`/admin/vans/${v.id}`} className="flex min-h-11 items-center justify-between gap-2 px-5 py-2.5 text-sm hover:bg-silver-soft">
                    <span><Plate>{v.reg}</Plate> <span className="text-steel">{v.model}</span></span>
                    <span className="text-right">
                      <Badge tone={left < 0 || (dd !== null && dd < 0) ? "red" : "amber"}>{left < 0 ? `${num(-left)} mi overdue` : `${num(left)} mi left`}</Badge>
                      {dd !== null && dd <= 30 && <div className="mt-0.5 text-xs text-steel">{relDays(dd)}</div>}
                    </span>
                  </Link>
                </li>
              );
            })}
            {due.length === 0 && <Empty>All services are up to date.</Empty>}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Cost by type, 90 days" />
          <div className="p-5"><HBar items={byType.map((x) => ({ label: maintType[x.k], value: Math.round(x.v), color: "#b11017" }))} /></div>
        </Card>
        <Card>
          <CardHeader title="Costliest vans, 90 days" />
          <div className="p-5"><HBar items={byVan.map((x) => ({ label: `${x.v.reg} · ${x.v.make} ${x.v.model}`, value: Math.round(x.cost), color: "#2a3345" }))} /></div>
        </Card>
      </div>

      <Card>
        <CardHeader title="History" sub="Last 40 finished jobs" />
        <Table minWidth={680}>
          <thead><tr><Th>Finished</Th><Th>Van</Th><Th>Work</Th><Th>Garage</Th><Th right>Days off</Th><Th right>Cost</Th></tr></thead>
          <tbody>
            {done.slice(0, 40).map((m) => {
              const v = db.vehicles.find((x) => x.id === m.vehicleId);
              return (
                <tr key={m.id}>
                  <Td className="whitespace-nowrap">{fmtDate(m.closedAt)}</Td>
                  <Td>{v ? <Link href={`/admin/vans/${v.id}`} className="inline-flex min-h-10 items-center hover:underline"><Plate>{v.reg}</Plate></Link> : "—"}</Td>
                  <Td>{m.description} <span className="text-xs text-steel">· {maintType[m.type]}</span></Td>
                  <Td>{m.garage}</Td>
                  <Td right>{Math.max(0, daysBetween(m.openedAt, m.closedAt ?? m.openedAt))}</Td>
                  <Td right>{gbp(m.cost)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {done.length === 0 && <Empty>Finished jobs will be listed here.</Empty>}
      </Card>

      {adding && <MaintenanceForm onClose={() => setAdding(false)} />}
      <Modal open={!!order} onClose={() => setClosing(null)} title="Finish and release the van">
        {order && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const cost = Number(new FormData(e.currentTarget).get("cost"));
              if (!Number.isFinite(cost) || cost < 0) return;
              mutate((d) => closeMaintenance(d, order.id, cost));
              nextStep({ title: "Back from the garage", body: `It's at the yard and ready for jobs.${order.type === "service" ? " Its next service is set 12,000 miles ahead." : ""}${order.type === "mot" ? " Its MOT date has moved on a year." : ""} The cost is in your Costs.`, href: "/admin/costs", action: "See costs" });
              setClosing(null);
            }}
            className="space-y-4"
          >
            <p className="text-sm text-steel">{order.description}</p>
            <Field label="Final cost (£)" hint="It becomes a cost against this van. A service moves the next service on; an MOT moves the MOT date on a year."><Input name="cost" type="number" min={0} step="any" defaultValue={order.cost} required /></Field>
            <div className="flex justify-end"><Button type="submit">Finish</Button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
