"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, Inbox, TrendingUp, Truck } from "lucide-react";
import { Badge, Card, CardHeader, Plate, Progress, Stat } from "@/components/admin/ui";
import { BarChart, Donut, HBar } from "@/components/admin/charts";
import { addDays, fmtDateTime, fmtDay, fmtShort, gbp, monthKey, parseDate, pct, sum, ukDate } from "@/lib/ops/format";
import { crewName, buildAlerts, jobIssues, pipeline, projectPins, scheduleItems, STAGES, vanReg, vanUtilisation, vehicleCosts, weeklyLeads, type Stage } from "@/lib/ops/selectors";
import { vehicleStatus } from "@/lib/ops/labels";
import { useOps } from "@/lib/ops/store";

export default function Dashboard() {
  const { db, biz, day } = useOps();

  const m = useMemo(() => {
    const t = day;
    const leads = biz.leads;
    const real = leads.filter((l) => l.score !== "not-a-fit");
    const week = scheduleItems(db, leads, t, addDays(t, 6));
    const mk = monthKey(t);
    const lastMk = monthKey(addDays(t.slice(0, 7) + "-01", -1));
    const costsThis = sum(db.expenses.filter((e) => e.date.startsWith(mk)).map((e) => e.amount));
    const costsLast = sum(db.expenses.filter((e) => e.date.startsWith(lastMk)).map((e) => e.amount));
    const matLabel = (id?: string) => biz.settings.materials.find((x) => x.id === id)?.label;
    const pins = projectPins(db, leads, matLabel);
    const stageCount = Object.fromEntries((Object.keys(STAGES) as Stage[]).map((s) => [s, pins.filter((p) => p.stage === s).length])) as Record<Stage, number>;
    return {
      t,
      newLeads: real.filter((l) => l.status === "new"),
      weekLeads: real.filter((l) => ukDate(l.createdAt) >= addDays(t, -6)).length,
      week,
      visits: week.filter((x) => x.kind === "inspection").length,
      jobsOn: week.filter((x) => x.kind === "job").length,
      costsThis,
      costsLast,
      alerts: buildAlerts(db, leads),
      pipe: pipeline(leads),
      weekly: weeklyLeads(leads, 12),
      stageCount,
      pinCount: pins.length,
      vanCosts: db.vehicles.map((v) => ({ v, c: vehicleCosts(db, v, 90).total })).sort((a, b) => b.c - a.c),
      util: db.vehicles.filter((v) => v.status !== "off_road").map((v) => ({ v, u: vanUtilisation(db, v.id) })),
    };
  }, [db, biz, day]);

  const working = db.vehicles.filter((v) => v.status === "in_use").length;
  const idle = db.vehicles.filter((v) => v.status === "at_yard").length;
  const garage = db.vehicles.filter((v) => v.status === "in_garage").length;
  const statusParts = (["in_use", "at_yard", "in_garage", "off_road"] as const).map((s) => ({
    label: vehicleStatus[s].label,
    value: db.vehicles.filter((v) => v.status === s).length,
    color: { in_use: "#16a34a", at_yard: "#ffb507", in_garage: "#b11017", off_road: "#8a877a" }[s],
  }));
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" })) % 24;
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const costDelta = m.costsThis - m.costsLast;
  const pipeMax = Math.max(1, m.pipe.new + m.pipe.contacted, m.pipe.quoted, m.pipe.won, m.pipe.lost);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{greeting}</h1>
        <p className="text-sm text-mute">
          Your business at a glance · {parseDate(day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4 @3xl:gap-4">
        <Stat
          href="/admin/leads"
          label="New leads"
          value={m.newLeads.length}
          icon={<Inbox size={18} />}
          tone={m.newLeads.some((l) => l.score === "hot") ? "bad" : undefined}
          sub={`${m.newLeads.filter((l) => l.score === "hot").length} hot · ${m.weekLeads} in the last 7 days`}
        />
        <Stat href="/admin/jobs" label="Next 7 days" value={`${m.visits + m.jobsOn}`} icon={<CalendarDays size={18} />} sub={`${m.visits} inspection${m.visits === 1 ? "" : "s"} · ${m.jobsOn} job${m.jobsOn === 1 ? "" : "s"} on`} />
        <Stat
          href="/admin/vans"
          label="Vans working"
          value={`${working}/${db.vehicles.length}`}
          icon={<Truck size={18} />}
          tone={garage ? "warn" : undefined}
          sub={`${idle} at the yard${garage ? ` · ${garage} in the garage` : ""}`}
        />
        <Stat
          href="/admin/costs"
          label="Van costs this month"
          value={gbp(Math.round(m.costsThis))}
          icon={<TrendingUp size={18} />}
          tone={costDelta > 0 ? "warn" : "good"}
          sub={`Last month ${gbp(Math.round(m.costsLast))}`}
        />
      </div>

      <div className="grid gap-4 @3xl:grid-cols-3">
        <Card className="@3xl:col-span-2">
          <CardHeader title="Enquiries, last 12 weeks" sub="All enquiries and the hot ones, from the quote form" action={<Link href="/admin/leads" className="inline-flex min-h-10 items-center whitespace-nowrap text-xs font-medium text-mute hover:text-ink">See leads →</Link>} />
          <div className="p-5">
            <BarChart
              data={m.weekly}
              series={[
                { key: "total", label: "Enquiries", color: "#d6d4c7" },
                { key: "hot", label: "Hot leads", color: "#b11017" },
              ]}
              xLabel={(r) => fmtShort(String(r.week))}
            />
          </div>
        </Card>

        <Card href="/admin/vans">
          <CardHeader title="Van status" sub="Click to see every van" />
          <div className="flex items-center gap-5 p-5">
            <Donut
              parts={statusParts}
              center={
                <>
                  <div className="text-2xl font-bold tabular-nums">{db.vehicles.length}</div>
                  <div className="text-[11px] text-mute">vehicles</div>
                </>
              }
            />
            <ul className="flex-1 space-y-2 text-sm">
              {statusParts.map((p) => (
                <li key={p.label} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-mute">
                    <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                    {p.label}
                  </span>
                  <span className="font-semibold tabular-nums">{p.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 @3xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Needs your attention"
            sub={`${m.alerts.filter((a) => a.severity === "high").length} urgent · ${m.alerts.length} in total`}
            action={<Link href="/admin/documents" className="inline-flex min-h-10 items-center whitespace-nowrap text-xs font-medium text-mute hover:text-ink">See all →</Link>}
          />
          <ul className="divide-y divide-cream">
            {m.alerts.slice(0, 8).map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="flex min-h-11 items-center gap-3 px-5 py-2.5 text-sm hover:bg-cream">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${a.severity === "high" ? "bg-brand" : a.severity === "medium" ? "bg-amber-500" : "bg-sky-500"}`} />
                  <span className="sr-only">{a.severity} priority: </span>
                  <span className="flex-1">{a.text}</span>
                  <ArrowRight size={14} aria-hidden className="text-line" />
                </Link>
              </li>
            ))}
            {m.alerts.length === 0 && <li className="px-5 py-8 text-center text-sm text-mute">Nothing needs attention right now.</li>}
          </ul>
        </Card>

        <Card>
          <CardHeader title="This week's schedule" sub="Inspections and jobs, next 7 days" action={<Link href="/admin/jobs" className="inline-flex min-h-10 items-center whitespace-nowrap text-xs font-medium text-mute hover:text-ink">Open schedule →</Link>} />
          <ul className="divide-y divide-cream">
            {m.week.slice(0, 8).map((it) => {
              const job = it.jobId ? db.jobs.find((j) => j.id === it.jobId) : undefined;
              const issues = job ? jobIssues(db, job).length : 0;
              return (
                <li key={it.key}>
                  <Link href="/admin/jobs" className="flex items-start gap-3 px-5 py-2.5 text-sm hover:bg-cream">
                    <div className="w-16 shrink-0 text-xs font-semibold text-mute">
                      {it.date <= m.t ? "Today" : fmtDay(it.date)}
                      {it.time && <div className="font-normal">{it.time}</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {it.title}
                        {it.kind === "inspection" ? "" : it.endDate ? ` · until ${fmtShort(it.endDate)}` : ""}
                      </div>
                      <div className="truncate text-xs text-mute">
                        {it.customer ? `${it.customer} · ` : ""}
                        {it.address}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-1 text-xs">
                        {it.vanIds.map((id) => <Plate key={id}>{vanReg(db, id)}</Plate>)}
                        {it.crewIds.length > 0 && <span className="text-mute">{it.crewIds.map((id) => crewName(db, id).split(" ")[0]).join(", ")}</span>}
                        {it.vanIds.length === 0 && <Badge tone="amber">No van yet</Badge>}
                        {issues > 0 && <Badge tone="red">{issues} warning{issues === 1 ? "" : "s"}</Badge>}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
            {m.week.length === 0 && <li className="px-5 py-8 text-center text-sm text-mute">Nothing scheduled in the next 7 days.</li>}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 @3xl:grid-cols-3">
        <Card>
          <CardHeader title="Pipeline" sub="Real enquiries, by where they've got to" action={<Link href="/admin/leads" className="inline-flex min-h-10 items-center whitespace-nowrap text-xs font-medium text-mute hover:text-ink">Leads →</Link>} />
          <ul className="space-y-3.5 p-5">
            {([
              ["New or contacted", m.pipe.new + m.pipe.contacted, "brand"],
              ["Quoted", m.pipe.quoted, "amber"],
              ["Won", m.pipe.won, "green"],
              ["Lost", m.pipe.lost, "slate"],
            ] as const).map(([label, n, tone]) => (
              <li key={label}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium">{label}</span>
                  <span className="tabular-nums text-mute">{n}</span>
                </div>
                <Progress value={n / pipeMax} tone={tone} />
              </li>
            ))}
            <li className="border-t border-cream pt-3 text-xs text-mute">
              Open quotes worth about <b className="text-ink">{gbp(Math.round(m.pipe.openValue))}</b> · won <b className="text-ink">{gbp(Math.round(m.pipe.wonValue))}</b>
              <div className="mt-0.5">Values use the middle of each quote range.</div>
            </li>
          </ul>
        </Card>

        <Card href="/admin/map">
          <CardHeader title="Projects on the map" sub={`${m.pinCount} customer projects with a location`} />
          <ul className="space-y-2.5 p-5 text-sm">
            {(Object.keys(STAGES) as Stage[]).map((s) => (
              <li key={s} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-mute">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: STAGES[s].color }} />
                  {STAGES[s].label}
                </span>
                <span className="font-semibold tabular-nums">{m.stageCount[s]}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Van running costs" sub="Last 90 days: fuel, servicing, insurance and more" action={<Link href="/admin/costs" className="inline-flex min-h-10 items-center whitespace-nowrap text-xs font-medium text-mute hover:text-ink">Costs →</Link>} />
          <div className="p-5">
            <HBar items={m.vanCosts.map(({ v, c }) => ({ label: `${v.reg} · ${v.make} ${v.model}`, value: Math.round(c), color: "#b11017" }))} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 @3xl:grid-cols-2">
        <Card>
          <CardHeader title="Van use, next 2 weeks" sub="Working days with a job or inspection booked" />
          <ul className="space-y-3.5 p-5">
            {m.util.map(({ v, u }) => (
              <li key={v.id}>
                <div className="mb-1 flex justify-between text-xs">
                  <Link href={`/admin/vans/${v.id}`} className="font-medium hover:underline"><Plate>{v.reg}</Plate> <span className="ml-1 text-mute">{v.make} {v.model}</span></Link>
                  <span className="tabular-nums text-mute">{pct(u)}</span>
                </div>
                <Progress value={u} tone={u < 0.3 ? "amber" : "green"} />
              </li>
            ))}
            {m.util.length === 0 && <li className="text-sm text-mute">Add your vans to see how busy they are.</li>}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Recent activity" action={<Link href="/admin/activity" className="inline-flex min-h-10 items-center whitespace-nowrap text-xs font-medium text-mute hover:text-ink">All →</Link>} />
          <ul className="divide-y divide-cream">
            {db.activity.slice(0, 6).map((a) => (
              <li key={a.id}>
                <Link href={a.href ?? "/admin/activity"} className="block px-5 py-2.5 hover:bg-cream">
                  <div className="text-sm">{a.text}</div>
                  <div className="text-xs text-mute">{fmtDateTime(a.at)}</div>
                </Link>
              </li>
            ))}
            {db.activity.length === 0 && <li className="px-5 py-8 text-center text-sm text-mute">Activity will appear here as you use the dashboard.</li>}
          </ul>
        </Card>
      </div>

      <Card>
        <div className="grid divide-y divide-cream sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Link href="/admin/leads" className="flex items-center gap-4 p-5 hover:bg-cream">
            <div>
              <div className="text-xs uppercase tracking-wide text-mute">Enquiries and quotes still open</div>
              <div className="text-lg font-bold tabular-nums">{gbp(Math.round(m.pipe.openValue))}</div>
            </div>
          </Link>
          <Link href="/admin/jobs" className="flex items-center gap-4 p-5 hover:bg-cream">
            <div>
              <div className="text-xs uppercase tracking-wide text-mute">Jobs booked, to come</div>
              <div className="text-lg font-bold tabular-nums">{gbp(sum(db.jobs.filter((j) => j.kind === "job" && (j.status === "scheduled" || j.status === "in_progress")).map((j) => j.value ?? 0)))}</div>
            </div>
          </Link>
          <Link href="/admin/fines" className="flex items-center gap-4 p-5 hover:bg-cream">
            <AlertTriangle aria-hidden className="text-brand" />
            <div>
              <div className="text-xs uppercase tracking-wide text-mute">Notices to name a driver for</div>
              <div className="text-lg font-bold tabular-nums">
                {db.fines.filter((f) => f.status === "to_name").length} <Badge tone="red">28-day deadline</Badge>
              </div>
            </div>
          </Link>
        </div>
      </Card>
    </div>
  );
}
