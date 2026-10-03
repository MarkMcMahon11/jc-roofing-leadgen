"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Badge, Button, Card, PageHeader, Plate, Segmented, Table, Td, Th } from "@/components/admin/ui";
import { VanForm } from "@/components/admin/VanForm";
import { daysBetween, fmtDate, gbp, num, pct, relDays, today } from "@/lib/ops/format";
import { vehicleStatus } from "@/lib/ops/labels";
import { vanUtilisation, vehicleCosts } from "@/lib/ops/selectors";
import { useOps } from "@/lib/ops/store";
import type { Vehicle, VehicleStatus } from "@/lib/ops/types";

type Filter = "all" | VehicleStatus;

function nextDeadline(v: Vehicle) {
  const list: [string, string][] = [["MOT", v.docs.mot], ["Tax", v.docs.roadTax], ["Insurance", v.docs.insurance]];
  if (v.status === "off_road") list.splice(0, 2);
  return list.sort((a, b) => (a[1] < b[1] ? -1 : 1))[0];
}

export default function VansPage() {
  const { db } = useOps();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => db.vehicles.map((v) => ({ v, driver: db.crew.find((c) => c.id === v.assignedCrewId), cost: vehicleCosts(db, v, 90).total, util: vanUtilisation(db, v.id) })), [db]);
  const shown = rows.filter(({ v, driver }) => (filter === "all" || v.status === filter) && (!q || `${v.reg} ${v.make} ${v.model} ${driver?.name ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const count = (s: Filter) => (s === "all" ? db.vehicles.length : db.vehicles.filter((v) => v.status === s).length);

  return (
    <div>
      <PageHeader
        title="Vans"
        sub={`${db.vehicles.length} vehicle${db.vehicles.length === 1 ? "" : "s"}: ${db.vehicles.filter((v) => v.status === "in_use").length} on the road, ${db.vehicles.filter((v) => v.status === "in_garage").length} in the garage`}
        actions={<Button onClick={() => setAdding(true)}><Plus size={16} /> Add van</Button>}
      />

      <div className="mb-4 flex flex-col gap-3 @3xl:flex-row @3xl:items-center @3xl:justify-between">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[{ value: "all", label: "All", count: count("all") }, ...(["in_use", "at_yard", "in_garage", "off_road"] as const).map((s) => ({ value: s, label: vehicleStatus[s].label, count: count(s) }))]}
        />
        <div className="relative @3xl:w-72">
          <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input aria-label="Search vans" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Plate, model or driver" className="min-h-11 w-full rounded-xl border-[1.5px] border-line bg-white py-2 pl-9 pr-3 text-base outline-none focus:border-ink" />
        </div>
      </div>

      <Card>
        <Table minWidth={860}>
          <thead>
            <tr>
              <Th>Van</Th><Th>Status</Th><Th>Usual driver</Th><Th right>Mileage / service</Th><Th>Next deadline</Th><Th right>Booked, 2 weeks</Th><Th right>Costs, 90 days</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ v, driver, cost, util }) => {
              const left = v.nextServiceMiles - v.mileage;
              const [dl, date] = nextDeadline(v);
              const days = daysBetween(today(), date);
              return (
                <tr key={v.id} onClick={() => router.push(`/admin/vans/${v.id}`)} className="cursor-pointer hover:bg-cream">
                  <Td>
                    <Link href={`/admin/vans/${v.id}`} onClick={(e) => e.stopPropagation()} className="flex min-h-10 items-center gap-3">
                      <Plate>{v.reg}</Plate>
                      <span>
                        <span className="block font-medium">{v.make} {v.model}</span>
                        <span className="block text-xs text-mute">{v.year} · {v.colour} · {v.fuel} · {v.kind}</span>
                      </span>
                    </Link>
                  </Td>
                  <Td><Badge tone={vehicleStatus[v.status].tone} dot>{vehicleStatus[v.status].label}</Badge></Td>
                  <Td>{driver ? driver.name : <span className="text-mute">—</span>}</Td>
                  <Td right>
                    <div>{num(v.mileage)} mi</div>
                    <div className={`text-xs ${left < 0 ? "font-semibold text-brand" : left < 1000 ? "text-amber-700" : "text-mute"}`}>{left < 0 ? `service overdue ${num(-left)} mi` : `${num(left)} mi to service`}</div>
                  </Td>
                  <Td>
                    <Badge tone={days < 0 ? "red" : days <= 15 ? "amber" : "green"}>{dl} {fmtDate(date)}</Badge>
                    <div className="mt-0.5 text-xs text-mute">{relDays(days)}</div>
                  </Td>
                  <Td right>{v.status === "off_road" ? <span className="text-mute">—</span> : pct(util)}</Td>
                  <Td right className="font-semibold">{gbp(cost)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {shown.length === 0 && <div className="px-5 py-10 text-center text-sm text-mute">{db.vehicles.length === 0 ? "No vans yet. Press “Add van” to enter the first one." : "No vans match."}</div>}
      </Card>

      {adding && <VanForm onClose={() => setAdding(false)} />}
    </div>
  );
}
