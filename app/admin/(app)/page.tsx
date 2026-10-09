"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, Inbox, TrendingUp, Truck } from "lucide-react";
import { Badge, Card, CardHeader, Plate, Progress, Stat } from "@/components/admin/ui";
import { BarChart, Donut, HBar } from "@/components/admin/charts";
import { ProjectMap } from "@/components/admin/ProjectMap";
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
      days: Array.from({ length: 7 }, (_, i) => {
        const d = addDays(t, i);
        return { d, items: scheduleItems(db, leads, d, d) };
      }),
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
    color: { in_use: "#16a34a", at_yard: "#ffb507", in_garage: "#b11017", off_road: "#8b94a3" }[s],
  }));
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" })) % 24;
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const costDelta = m.costsThis - m.costsLast;
  const pipeMax = Math.max(1, m.pipe.new + m.pipe.contacted, m.pipe.quoted, m.pipe.won, m.pipe.lost);

  return (
    <div className="space-y-6">
      <div className="glass -mx-2 w-fit max-w-full rounded-2xl px-3 py-2">
        <h1 className="text-2xl font-bold tracking-tight text-night">{greeting}</h1>
        <p className="text-sm text-night/75">
          Your business at a glance · {parseDate(day).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      <div className="grid gap-4 @3xl:grid-cols-5">
        <Card className="@3xl:col-span-2">
          <CardHeader
            title={`Today · ${fmtDay(m.t)}`}
            sub={m.days[0].items.length ? `${m.days[0].items.length} on today` : "Nothing booked today"}
            action={<Link href="/admin/jobs" className="inline-flex min-h-10 items-center whitespace-nowrap text-xs font-medium text-steel hover:text-night">Open schedule →</Link>}
          />
          <ul className="divide-y divide-silver">
            {m.days[0].items.map((it) => (
              <ScheduleRow key={it.key} it={it} today={m.t} big />
            ))}
            {m.days[0].items.length === 0 && <li className="px-5 py-8 text-center text-sm text-steel">A clear day. Add a job or inspection from the schedule.</li>}
          </ul>
        </Card>

        <Card className="@3xl:col-span-3">
          <CardHeader title="This week" sub={`${m.visits} inspection${m.visits === 1 ? "" : "s"} · ${m.jobsOn} job${m.jobsOn === 1 ? "" : "s"} over the next 7 days`} action={<Link href="/admin/jobs" className="inline-flex min-h-10 items-center whitespace-nowrap text-xs font-medium text-steel hover:text-night">Full schedule →</Link>} />
          <ol className="divide-y divide-silver">
            {m.days.map(({ d, items }, i) => (
              <li key={d} className={`flex gap-3 px-5 py-2.5 ${i === 0 ? "bg-brand-tint/40" : ""}`}>
                <div className="w-20 shrink-0 pt-0.5">
                  <div className={`text-xs font-bold ${i === 0 ? "text-brand" : "text-night"}`}>{i === 0 ? "Today" : i === 1 ? "Tomorrow" : parseDate(d).toLocaleDateString("en-GB", { weekday: "short" })}</div>
                  <div className="text-[11px] text-steel">{parseDate(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {items.map((it) => (
                    <ScheduleRow key={it.key} it={it} today={d} compact />
                  ))}
                  {items.length === 0 && <div className="pt-0.5 text-xs text-steel">{[0, 6].includes(parseDate(d).getDay()) ? "Weekend" : "Free"}</div>}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <section aria-label="Project map">
        <div className="glass mb-2 flex items-center justify-between gap-3 rounded-2xl px-3 py-2">
          <div className="min-w-0">
            <h2 className="font-semibold text-night">Project map</h2>
            <p className="text-xs text-night/75">Click a site to see the job, or order materials to it</p>
          </div>
          <Link href="/admin/map" className="inline-flex min-h-10 shrink-0 items-center whitespace-nowrap text-xs font-medium text-night/75 hover:text-night">Full map →</Link>
        </div>
        <Suspense fallback={<div className="grid h-[380px] place-items-center text-sm text-steel">Loading map…</div>}>
          <ProjectMap compact />
        </Suspense>
      </section>

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
          label="Running costs this month"
          value={gbp(Math.round(m.costsThis))}
          icon={<TrendingUp size={18} />}
          tone={costDelta > 0 ? "warn" : "good"}
          sub={`Last month ${gbp(Math.round(m.costsLast))}`}
        />
      </div>

      <div className="grid gap-4 @3xl:grid-cols-3">
        <Card className="@3xl:col-span-2">
          <CardHeader title="Enquiries, last 12 weeks" sub="All enquiries and the hot ones, from the quote form" action={<Link href="/admin/leads" className="inline-flex min-h-10 items-center whitespace-nowrap text-xs font-medium text-steel hover:text-night">See leads →</Link>} />
          <div className="p-5">
            <BarChart
              data={m.weekly}
              series={[
                { key: "total", label: "Enquiries", color: "#b8c1cf" },
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
                  <div className="text-[11px] text-steel">vehicles</div>
                </>
              }
            />
            <ul className="flex-1 space-y-2 text-sm">
              {statusParts.map((p) => (
                <li key={p.label} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-steel">
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
            action={<Link href="/admin/documents" className="inline-flex min-h-10 items-center whitespace-nowrap text-xs font-medium text-steel hover:text-night">See all →</Link>}
          />
          <ul className="divide-y divide-silver">
            {m.alerts.slice(0, 8).map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="flex min-h-11 items-center gap-3 px-5 py-2.5 text-sm hover:bg-silver-soft">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${a.severity === "high" ? "bg-brand" : a.severity === "medium" ? "bg-amber-500" : "bg-sky-500"}`} />
                  <span className="sr-only">{a.severity} priority: </span>
                  <span className="flex-1">{a.text}</span>
                  <ArrowRight size={14} aria-hidden className="text-ctrl" />
                </Link>
              </li>
            ))}
            {m.alerts.length === 0 && <li className="px-5 py-8 text-center text-sm text-steel">Nothing needs attention right now.</li>}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Pipeline" sub="Real enquiries, by where they've got to" action={<Link href="/admin/leads" className="inline-flex min-h-10 items-center whitespace-nowrap text-xs font-medium text-steel hover:text-night">Leads →</Link>} />
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
                  <span className="tabular-nums text-steel">{n}</span>
                </div>
                <Progress value={n / pipeMax} tone={tone} />
              </li>
            ))}
            <li className="border-t border-silver pt-3 text-xs text-steel">
              Open quotes worth about <b className="text-night">{gbp(Math.round(m.pipe.openValue))}</b> · won <b className="text-night">{gbp(Math.round(m.pipe.wonValue))}</b>
              <div className="mt-0.5">Values use the middle of each quote range.</div>
            </li>
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 @3xl:grid-cols-3">
        <Card href="/admin/map">
          <CardHeader title="Projects on the map" sub={`${m.pinCount} customer projects with a location`} />
          <ul className="space-y-2.5 p-5 text-sm">
            {(Object.keys(STAGES) as Stage[]).map((s) => (
              <li key={s} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-steel">
                  <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: STAGES[s].color }} />
                  {STAGES[s].label}
                </span>
                <span className="font-semibold tabular-nums">{m.stageCount[s]}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Van running costs" sub="Last 90 days: fuel, servicing, insurance and more" action={<Link href="/admin/costs" className="inline-flex min-h-10 items-center whitespace-nowrap text-xs font-medium text-steel hover:text-night">Costs →</Link>} />
          <div className="p-5">
            <HBar items={m.vanCosts.map(({ v, c }) => ({ label: `${v.reg} · ${v.make} ${v.model}`, value: Math.round(c), color: "#b11017" }))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Van use, next 2 weeks" sub="Working days with a job or inspection booked" />
          <ul className="space-y-3.5 p-5">
            {m.util.map(({ v, u }) => (
              <li key={v.id}>
                <div className="mb-1 flex justify-between text-xs">
                  <Link href={`/admin/vans/${v.id}`} className="inline-flex min-h-10 items-center font-medium hover:underline"><Plate>{v.reg}</Plate> <span className="ml-1 text-steel">{v.make} {v.model}</span></Link>
                  <span className="tabular-nums text-steel">{pct(u)}</span>
                </div>
                <Progress value={u} tone={u < 0.3 ? "amber" : "green"} />
              </li>
            ))}
            {m.util.length === 0 && <li className="text-sm text-steel">Add your vans to see how busy they are.</li>}
          </ul>
        </Card>
      </div>

      <div>
        <Card>
          <CardHeader title="Recent activity" action={<Link href="/admin/activity" className="inline-flex min-h-10 items-center whitespace-nowrap text-xs font-medium text-steel hover:text-night">All →</Link>} />
          <ul className="divide-y divide-silver">
            {db.activity.slice(0, 6).map((a) => (
              <li key={a.id}>
                <Link href={a.href ?? "/admin/activity"} className="block px-5 py-2.5 hover:bg-silver-soft">
                  <div className="text-sm">{a.text}</div>
                  <div className="text-xs text-steel">{fmtDateTime(a.at)}</div>
                </Link>
              </li>
            ))}
            {db.activity.length === 0 && <li className="px-5 py-8 text-center text-sm text-steel">Activity will appear here as you use the dashboard.</li>}
          </ul>
        </Card>
      </div>

      <Card>
        <div className="grid divide-y divide-silver sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Link href="/admin/leads" className="flex items-center gap-4 p-5 hover:bg-silver-soft">
            <div>
              <div className="text-xs uppercase tracking-wide text-steel">Enquiries and quotes still open</div>
              <div className="text-lg font-bold tabular-nums">{gbp(Math.round(m.pipe.openValue))}</div>
            </div>
          </Link>
          <Link href="/admin/jobs" className="flex items-center gap-4 p-5 hover:bg-silver-soft">
            <div>
              <div className="text-xs uppercase tracking-wide text-steel">Jobs booked, to come</div>
              <div className="text-lg font-bold tabular-nums">{gbp(sum(db.jobs.filter((j) => j.kind === "job" && (j.status === "scheduled" || j.status === "in_progress")).map((j) => j.value ?? 0)))}</div>
            </div>
          </Link>
          <Link href="/admin/fines" className="flex items-center gap-4 p-5 hover:bg-silver-soft">
            <AlertTriangle aria-hidden className="text-brand" />
            <div>
              <div className="text-xs uppercase tracking-wide text-steel">Notices to name a driver for</div>
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

function ScheduleRow({ it, today, big, compact }: { it: ReturnType<typeof scheduleItems>[number]; today: string; big?: boolean; compact?: boolean }) {
  const { db } = useOps();
  const job = it.jobId ? db.jobs.find((j) => j.id === it.jobId) : undefined;
  const issues = job ? jobIssues(db, job).length : 0;
  const content = (
    <>
      {it.time && <div className={`shrink-0 font-semibold tabular-nums text-night ${big ? "w-12 text-sm" : "w-11 text-xs"}`}>{it.time}</div>}
      <div className="min-w-0 flex-1">
        <div className={`${compact ? "truncate" : ""} font-medium ${big ? "text-sm" : "text-[13px]"}`}>
          {it.kind === "inspection" && <span className="mr-1.5 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">Visit</span>}
          {it.title}
          {it.kind !== "inspection" && it.endDate && it.endDate > today ? <span className="font-normal text-steel"> · until {fmtShort(it.endDate)}</span> : null}
        </div>
        <div className="truncate text-xs text-steel">
          {it.customer ? `${it.customer} · ` : ""}
          {it.address}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs">
          {it.vanIds.map((id) => <Plate key={id}>{vanReg(db, id)}</Plate>)}
          {it.crewIds.length > 0 && <span className="text-steel">{it.crewIds.map((id) => crewName(db, id).split(" ")[0]).join(", ")}</span>}
          {it.vanIds.length === 0 && <Badge tone="amber">No van yet</Badge>}
          {issues > 0 && <Badge tone="red">{issues} warning{issues === 1 ? "" : "s"}</Badge>}
        </div>
      </div>
    </>
  );
  const cls = `flex items-start gap-3 hover:bg-silver-soft ${big ? "px-5 py-3" : "-mx-2 rounded-lg px-2 py-1"}`;
  return big ? (
    <li>
      <Link href="/admin/jobs" className={cls}>{content}</Link>
    </li>
  ) : (
    <Link href="/admin/jobs" className={cls}>{content}</Link>
  );
}
