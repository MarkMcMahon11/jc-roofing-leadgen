"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Pencil, Phone } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, Plate, Stat } from "@/components/admin/ui";
import { CrewForm } from "@/components/admin/CrewForm";
import { addDays, daysBetween, fmtDate, fmtDay, gbp, relDays, today } from "@/lib/ops/format";
import { fineStatus, jobStatus } from "@/lib/ops/labels";
import { vanReg } from "@/lib/ops/selectors";
import { useOps } from "@/lib/ops/store";

export default function CrewMemberPage() {
  const { id } = useParams<{ id: string }>();
  const { db } = useOps();
  const [edit, setEdit] = useState(false);
  const c = db.crew.find((x) => x.id === id);
  if (!c) return <Empty>That person wasn&apos;t found. <Link href="/admin/crew" className="underline">Back to Team</Link></Empty>;

  const vans = db.vehicles.filter((v) => v.assignedCrewId === c.id);
  const jobs = db.jobs.filter((j) => j.crewIds.includes(c.id) && j.status !== "cancelled").sort((a, b) => (a.date < b.date ? 1 : -1));
  const recent = jobs.filter((j) => j.date >= addDays(today(), -90) && j.date <= today());
  const fines = db.fines.filter((f) => f.crewId === c.id);

  const docs: [string, string | undefined][] = [
    ...(c.drives ? ([["Driving licence check", c.licenceExpiry]] as [string, string | undefined][]) : []),
    [`CSCS card${c.cscsCard ? ` (${c.cscsCard})` : ""}`, c.cscsExpiry],
    ["Working at height training", c.heightExpiry],
    ["First aid certificate", c.firstAidExpiry],
  ];

  return (
    <div className="space-y-6">
      <Link href="/admin/crew" className="inline-flex min-h-10 items-center gap-1 text-sm text-steel hover:text-night"><ArrowLeft size={16} /> Team</Link>
      <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-end @3xl:justify-between">
        <div className="flex items-center gap-4">
          <div aria-hidden className="grid h-14 w-14 place-items-center rounded-full bg-brand text-lg font-bold text-white">{c.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-steel">
              <Badge tone={c.status === "active" ? "green" : "slate"} dot>{c.status === "active" ? "Current" : "Left"}</Badge>
              <span>{c.role}</span>·<span>since {fmtDate(c.startDate)}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.phone && <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-[1.5px] border-ctrl bg-white px-4 py-2 text-sm font-semibold hover:bg-silver-soft"><Phone size={16} /> {c.phone}</a>}
          <Button variant="secondary" onClick={() => setEdit(true)}><Pencil size={16} /> Edit details</Button>
        </div>
      </div>

      {c.notes && <div className="rounded-xl border border-gold/70 bg-amber-50 px-4 py-3 text-sm">{c.notes}</div>}

      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Stat label="Jobs and visits, 90 days" value={recent.length} />
        <Stat label="Usual van" value={vans.length ? vans.map((v) => v.reg).join(", ") : "—"} sub={vans[0] ? `${vans[0].make} ${vans[0].model}` : undefined} />
        <Stat label="Licence points" value={c.drives ? (c.licencePoints ?? 0) : "—"} tone={(c.licencePoints ?? 0) >= 6 ? "warn" : undefined} sub={c.drives ? "From the DVLA licence check" : "Doesn't drive"} />
        <Stat label="Notices" value={fines.length} sub={fines.length ? gbp(fines.reduce((s, f) => s + f.amount, 0)) : "None"} />
      </div>

      <div className="grid gap-4 @3xl:grid-cols-2">
        <Card>
          <CardHeader title="Cards, training and checks" />
          <ul className="divide-y divide-silver">
            {docs.map(([label, date]) => {
              const days = date ? daysBetween(today(), date) : null;
              return (
                <li key={label} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <span>{label}</span>
                  {date && days !== null ? <Badge tone={days < 0 ? "red" : days <= 30 ? "amber" : "green"}>{fmtDate(date)} · {relDays(days)}</Badge> : <Badge>Not recorded</Badge>}
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Jobs and visits" sub={`${jobs.length} on record`} />
          <ul className="max-h-80 divide-y divide-silver overflow-y-auto">
            {jobs.slice(0, 12).map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <div className="min-w-0"><div className="truncate font-medium">{j.title}</div><div className="text-xs text-steel">{fmtDay(j.date)} · {j.customer ?? j.address} {j.vanIds.map((v) => vanReg(db, v)).join(" ")}</div></div>
                <Badge tone={jobStatus[j.status].tone}>{jobStatus[j.status].label}</Badge>
              </li>
            ))}
            {jobs.length === 0 && <Empty>Not on any job yet.</Empty>}
          </ul>
        </Card>
      </div>

      {fines.length > 0 && (
        <Card>
          <CardHeader title="Fines and notices" />
          <ul className="divide-y divide-silver">
            {fines.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <div className="min-w-0"><div className="truncate font-medium">{f.description}</div><div className="text-xs text-steel">{fmtDate(f.date)} · {vanReg(db, f.vehicleId)} · {f.location}</div></div>
                <div className="text-right"><div className="font-medium tabular-nums">{gbp(f.amount)}</div><Badge tone={fineStatus[f.status].tone}>{fineStatus[f.status].label}</Badge></div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {vans.length > 0 && <p className="text-sm text-steel">Drives: {vans.map((v) => <Link key={v.id} href={`/admin/vans/${v.id}`}><Plate>{v.reg}</Plate> </Link>)}</p>}

      {edit && <CrewForm member={c} onClose={() => setEdit(false)} />}
    </div>
  );
}
