"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Badge, Card, CardHeader, Empty, PageHeader, Segmented, Stat, Table, Td, Th } from "@/components/admin/ui";
import { daysBetween, fmtDate, relDays, today } from "@/lib/ops/format";
import { allDocuments, buildAlerts, type Alert } from "@/lib/ops/selectors";
import { useOps } from "@/lib/ops/store";

export default function DocumentsPage() {
  const { db, biz } = useOps();
  const [group, setGroup] = useState<"all" | Alert["group"]>("all");
  const alerts = useMemo(() => buildAlerts(db, biz.leads), [db, biz.leads]);
  const shown = alerts.filter((a) => group === "all" || a.group === group);
  const n = (g: Alert["group"]) => alerts.filter((a) => a.group === g).length;
  const t = today();
  const calendar = useMemo(() => allDocuments(db).filter((r) => daysBetween(t, r.date) <= 90), [db, t]);

  return (
    <div className="space-y-6">
      <PageHeader title="Documents and deadlines" sub="Everything that runs out or needs action, in one place" />
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Stat label="Urgent" value={alerts.filter((a) => a.severity === "high").length} tone={alerts.some((a) => a.severity === "high") ? "bad" : undefined} sub="Expired, or within 7 days" />
        <Stat label="Van paperwork" value={n("vans")} sub="MOT, tax, insurance" />
        <Stat label="Team" value={n("crew")} sub="Licences, cards, training" />
        <Stat label="Running out in 90 days" value={calendar.length} />
      </div>

      <div className="grid gap-4 @3xl:grid-cols-5">
        <Card className="@3xl:col-span-3">
          <CardHeader title="To do" sub={`${shown.length} item${shown.length === 1 ? "" : "s"}`} />
          <div className="px-5 pt-4">
            <Segmented
              value={group}
              onChange={setGroup}
              options={[
                { value: "all", label: "Everything", count: alerts.length },
                { value: "vans", label: "Vans", count: n("vans") },
                { value: "service", label: "Servicing", count: n("service") },
                { value: "crew", label: "Team", count: n("crew") },
                { value: "fines", label: "Notices", count: n("fines") },
                { value: "leads", label: "Leads", count: n("leads") },
                { value: "jobs", label: "Jobs", count: n("jobs") },
              ]}
            />
          </div>
          <ul className="divide-y divide-cream">
            {shown.map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="flex min-h-11 items-center gap-3 px-5 py-2.5 text-sm hover:bg-cream">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${a.severity === "high" ? "bg-brand" : a.severity === "medium" ? "bg-amber-500" : "bg-sky-500"}`} />
                  <span className="sr-only">{a.severity} priority: </span>
                  <span className="flex-1">{a.text}</span>
                  <ArrowRight size={14} aria-hidden className="text-line" />
                </Link>
              </li>
            ))}
          </ul>
          {shown.length === 0 && <Empty>All clear.</Empty>}
        </Card>

        <Card className="@3xl:col-span-2">
          <CardHeader title="Calendar: next 90 days" sub="Includes anything already out of date" />
          <Table minWidth={420}>
            <thead><tr><Th>Date</Th><Th>What</Th><Th>For</Th></tr></thead>
            <tbody>
              {calendar.map((r) => {
                const days = daysBetween(t, r.date);
                return (
                  <tr key={r.key}>
                    <Td><Badge tone={days < 0 ? "red" : days <= 15 ? "amber" : "slate"}>{fmtDate(r.date)}</Badge><div className="mt-0.5 text-xs text-mute">{relDays(days)}</div></Td>
                    <Td>{r.label}</Td>
                    <Td><Link href={r.href} className="font-semibold hover:underline">{r.who}</Link></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {calendar.length === 0 && <Empty>Nothing runs out in the next 90 days.</Empty>}
        </Card>
      </div>
    </div>
  );
}
