import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Bell, CircleAlert, Info } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getStatuses } from "@/lib/data/lookups";
import { addDaysISO, count, date, daysUntil, money, pct, relative, time, todayISO } from "@/lib/format";
import { Badge, ButtonLink, Card, CardBody, CardHeader, ColourBadge, EmptyState, Mono, PageHeader, Stat, cx } from "@/components/ui/primitives";
import { BarList, GroupedBarChart, LineChart, Meter } from "@/components/ui/charts";
import { DashboardMap } from "./dashboard-map";
import { LiveRefresh } from "./live-refresh";

export const metadata: Metadata = { title: "Command centre" };

type Summary = Record<string, number> & { status_counts: Record<string, number>; priority_open: Record<string, number> };

export default async function DashboardPage() {
  const ctx = await requireInternal("dashboard.view");
  const t = ctx.tenantId;
  const fin = ctx.can("finance.read");
  const supabase = await createClient();
  const today = todayISO();

  const [summaryRes, alertsRes, statuses, feedRes, mapRes, todayRes, renewalsRes, perfRes, throughputRes, financeRes] = await Promise.all([
    supabase.rpc("dashboard_summary", { p_tenant: t }),
    supabase.rpc("management_alerts", { p_tenant: t }),
    getStatuses(t),
    supabase
      .from("job_updates")
      .select("id, type, body, from_status, to_status, created_at, author:profiles!job_updates_author_id_fkey(full_name), work_order:work_orders(id, reference, title)")
      .eq("tenant_id", t)
      .order("created_at", { ascending: false })
      .limit(14),
    supabase
      .from("work_orders")
      .select("id, reference, title, status, priority, target_completion_at, property:properties(address_line1, postcode, latitude, longitude)")
      .eq("tenant_id", t)
      .not("status", "in", "(completed,invoiced,closed,cancelled)")
      .limit(400),
    supabase
      .from("job_assignments")
      .select("id, scheduled_start, scheduled_end, status, employee:employees(id, first_name, last_name, colour, trade), subcontractor:subcontractors(company_name), work_order:work_orders(id, reference, title, priority)")
      .eq("tenant_id", t)
      .neq("status", "cancelled")
      .gte("scheduled_start", `${today}T00:00:00Z`)
      .lt("scheduled_start", `${today}T23:59:59Z`)
      .order("scheduled_start"),
    supabase
      .from("contracts")
      .select("id, reference, title, end_date, renewal_date, value, organisation:organisations(name)")
      .eq("tenant_id", t)
      .eq("status", "active")
      .not("end_date", "is", null)
      .lte("end_date", addDaysISO(today, 180))
      .order("end_date"),
    supabase
      .from("v_contract_performance")
      .select("contract_id, jobs_open, jobs_overdue, on_time_pct, first_time_fix_pct, avg_satisfaction, cost_last_12m, annual_budget, revenue, margin")
      .eq("tenant_id", t),
    supabase.rpc("job_throughput", { p_tenant: t, p_weeks: 12 }),
    fin ? supabase.rpc("finance_monthly", { p_tenant: t, p_months: 6 }) : Promise.resolve({ data: null }),
  ]);
  const { data: activeContracts } = await supabase
    .from("contracts")
    .select("id, title, reference, organisation:organisations(name)")
    .eq("tenant_id", t)
    .eq("status", "active");
  const contractById = new Map((activeContracts ?? []).map((c) => [c.id, c]));

  const s = (summaryRes.data ?? {}) as Summary;
  const alerts = alertsRes.data ?? [];
  const n = (k: string) => Number(s[k] ?? 0);
  const activePerf = (perfRes.data ?? [])
    .filter((p) => p.contract_id && contractById.has(p.contract_id))
    .map((p) => ({ ...p, contract: contractById.get(p.contract_id!)! }))
    .sort((a, b) => Number(b.jobs_open) - Number(a.jobs_open));
  const statusBars = statuses.list
    .filter((st) => st.counts_as_open && (s.status_counts?.[st.key] ?? 0) > 0)
    .map((st) => ({ label: st.label, value: s.status_counts[st.key] ?? 0, marker: st.colour, href: `/jobs?view=list&status=${st.key}` }));
  const points = (mapRes.data ?? [])
    .filter((w) => w.property?.latitude != null)
    .map((w) => ({
      id: w.id,
      lat: Number(w.property!.latitude),
      lng: Number(w.property!.longitude),
      colour: w.priority === "emergency" ? "#f0524f" : statuses.get(w.status).colour,
      size: w.priority === "emergency" ? 9 : 6,
      title: `${w.reference} · ${w.title}`,
      subtitle: `${w.property!.address_line1}, ${w.property!.postcode}`,
      meta: `${statuses.get(w.status).label}${w.target_completion_at ? ` · due ${date(w.target_completion_at)}` : ""}`,
      href: `/jobs/${w.id}`,
    }));
  const crew = new Map<string, { name: string; colour: string; trade: string; href: string; jobs: { id: string; ref: string; title: string; start: string; end: string; status: string; priority: string }[] }>();
  for (const a of todayRes.data ?? []) {
    const key = a.employee?.id ?? `sub-${a.subcontractor?.company_name}`;
    if (!crew.has(key))
      crew.set(key, {
        name: a.employee ? `${a.employee.first_name} ${a.employee.last_name}` : (a.subcontractor?.company_name ?? "Subcontractor"),
        colour: a.employee?.colour ?? "#8090ab",
        trade: a.employee?.trade ?? "subcontractor",
        href: a.employee ? `/workforce/${a.employee.id}` : "/subcontractors",
        jobs: [],
      });
    if (a.work_order) crew.get(key)!.jobs.push({ id: a.work_order.id, ref: a.work_order.reference, title: a.work_order.title, start: a.scheduled_start, end: a.scheduled_end, status: a.status, priority: a.work_order.priority });
  }
  const weeks = (throughputRes.data ?? []).map((w) => ({ label: new Date(w.week + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short" }), created: Number(w.created), completed: Number(w.completed) }));
  const months = (financeRes.data ?? []).map((m) => ({
    label: new Date(m.month + "T12:00:00Z").toLocaleDateString("en-GB", { month: "short" }),
    revenue: Number(m.revenue),
    cost: Number(m.labour) + Number(m.materials) + Number(m.subcontractor) + Number(m.vehicle) + Number(m.overhead) + Number(m.other),
  }));
  const marginMonth = n("revenue_month") - n("total_cost_month");
  const critical = alerts.filter((a) => a.severity === "critical").length;

  return (
    <>
      <PageHeader
        eyebrow={`Command centre · ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" })}`}
        title={`Good ${greeting()}, ${ctx.fullName.split(" ")[0]}`}
        description={`${count(n("active_jobs"))} live jobs across ${count(n("active_contracts"))} contracts${critical ? ` · ${critical} critical alert${critical === 1 ? "" : "s"}` : ""}.`}
        actions={
          <>
            <LiveRefresh />
            {ctx.can("work_orders.write") && <ButtonLink href="/jobs/new" variant="primary">New job</ButtonLink>}
          </>
        }
      />

      {/* Operations */}
      <section aria-label="Operations" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Active contracts" value={count(n("active_contracts"))} href="/contracts?status=active" tone="accent" hint={`${money(n("active_contract_value"), { compact: true })} contract value`} />
        <Stat label="Properties" value={count(n("properties"))} href="/properties" hint={`${n("void_properties")} void`} />
        <Stat label="Active jobs" value={count(n("active_jobs"))} href="/jobs?view=board" tone="accent" hint={`${n("emergencies_open")} emergency open`} />
        <Stat label="New requests" value={count(n("new_requests"))} href="/jobs?view=list&status=new" tone="info" hint="New and under review" />
        <Stat label="Awaiting approval" value={count(n("awaiting_approval"))} href="/jobs?view=list&status=awaiting_approval" tone="warn" />
        <Stat label="Scheduled today" value={count(n("scheduled_today"))} href={`/schedule?view=day&date=${today}`} hint={`${n("operatives_booked_today")} operatives booked`} />
        <Stat label="In progress" value={count(n("in_progress"))} href="/jobs?view=list&status=in_progress" tone="info" hint={`${n("blocked")} waiting on materials`} />
        <Stat label="Overdue" value={count(n("overdue"))} href="/jobs?view=list&due=overdue" tone={n("overdue") > 0 ? "bad" : "ok"} hint="Past target completion" />
        <Stat label="Completed (30 days)" value={count(n("completed_30d"))} href="/jobs?view=list&status=completed" tone="ok" hint={`${n("completed_awaiting_invoice")} awaiting invoice`} />
        <Stat label="Workforce today" value={`${Math.max(0, n("operatives_active") - n("operatives_absent_today") - n("operatives_booked_today"))} free`} href={`/schedule?date=${today}`} hint={`${n("operatives_booked_today")} booked · ${n("operatives_absent_today")} absent of ${n("operatives_active")}`} />
      </section>

      {/* Finance */}
      {fin && (
        <section id="finance" aria-label="Finance" className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Revenue this month" value={money(n("revenue_month"), { compact: true, whole: true })} tone="ok" hint={`${money(n("revenue_ytd"), { compact: true })} financial year to date`} />
          <Stat label="Outstanding invoices" value={money(n("outstanding"), { compact: true, whole: true })} tone={n("overdue_invoices") ? "warn" : "neutral"} hint={`${n("overdue_invoices")} overdue · ${money(n("overdue_amount"), { compact: true })}`} />
          <Stat label="Labour cost (month)" value={money(n("labour_cost_month"), { compact: true, whole: true })} hint="Approved timesheets" />
          <Stat label="Materials (month)" value={money(n("materials_cost_month"), { compact: true, whole: true })} hint={`Subcontractors ${money(n("subcontractor_cost_month"), { compact: true })}`} />
          <Stat label="Gross margin (month)" value={money(marginMonth, { compact: true, whole: true })} tone={marginMonth >= 0 ? "ok" : "bad"} hint={`Costs ${money(n("total_cost_month"), { compact: true })} · ${n("completed_awaiting_invoice")} jobs to invoice`} />
        </section>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <Card>
          <CardHeader title="Live job map" description="Open jobs by status. Emergencies are larger and red. Click a pin to open the job." actions={<ButtonLink href="/jobs?view=map" size="sm" variant="ghost">Full map <ArrowRight className="size-3.5" /></ButtonLink>} />
          <CardBody>
            <DashboardMap points={points} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Management alerts" description="Renewals, expiring certifications, approvals, budgets and performance." actions={<Badge tone={critical ? "bad" : "neutral"}>{alerts.length}</Badge>} />
          <ul className="max-h-[470px] divide-y divide-line overflow-y-auto">
            {alerts.length === 0 && <li><EmptyState title="Nothing needs attention" /></li>}
            {alerts.map((a, i) => (
              <li key={i}>
                <Link href={a.link ?? "#"} className="flex gap-3 px-5 py-3 hover:bg-raised/50">
                  {a.severity === "critical" ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-label="Critical" /> : a.severity === "warning" ? <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" aria-label="Warning" /> : <Info className="mt-0.5 size-4 shrink-0 text-info" aria-label="Information" />}
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-fg">{a.title}</span>
                    <span className="block truncate text-xs text-muted">{a.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Open jobs by status" description="Click a status to see its jobs." />
          <CardBody>
            {statusBars.length ? <BarList items={statusBars} format="count" /> : <EmptyState title="No open jobs" />}
            <div className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-4 text-center">
              {(["emergency", "urgent", "routine", "planned"] as const).map((p) => (
                <Link key={p} href={`/jobs?view=list&priority=${p}`} className="rounded-lg py-1.5 hover:bg-raised">
                  <div className="text-lg font-semibold tabular">{s.priority_open?.[p] ?? 0}</div>
                  <div className="text-[11px] text-subtle capitalize">{p}</div>
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Job throughput" description="Jobs reported and completed per week, last 12 weeks." />
          <CardBody>
            <LineChart
              title="Jobs reported and completed per week"
              categories={weeks.map((w) => w.label)}
              series={[
                { key: "created", label: "Reported", values: weeks.map((w) => w.created) },
                { key: "completed", label: "Completed", values: weeks.map((w) => w.completed) },
              ]}
              format="count"
            />
          </CardBody>
        </Card>
      </div>

      {fin && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader title="Financial performance" description="Invoiced revenue (net of VAT) against all recorded costs, by month." />
            <CardBody>
              <GroupedBarChart
                title="Revenue and costs by month"
                categories={months.map((m) => m.label)}
                series={[
                  { key: "revenue", label: "Revenue", values: months.map((m) => m.revenue) },
                  { key: "cost", label: "Costs", values: months.map((m) => m.cost) },
                ]}
                format="money-whole"
                axisFormat="money-compact"
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Cost mix this month" description="Where this month's money has gone." />
            <CardBody>
              <BarList
                format="money-whole"
                items={(financeRes.data ?? []).slice(-1).flatMap((m) => [
                  { label: "Materials", value: Number(m.materials) },
                  { label: "Labour", value: Number(m.labour) },
                  { label: "Overheads", value: Number(m.overhead) },
                  { label: "Vehicles", value: Number(m.vehicle) },
                  { label: "Subcontractors", value: Number(m.subcontractor) },
                  { label: "Plant & other", value: Number(m.other) },
                ]).filter((x) => x.value > 0).sort((a, b) => b.value - a.value)}
              />
            </CardBody>
          </Card>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Contract performance" description="Active contracts: workload, delivery against KPIs and spend." actions={<ButtonLink href="/contracts" size="sm" variant="ghost">All contracts <ArrowRight className="size-3.5" /></ButtonLink>} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-sunken/80 text-left text-xs text-subtle uppercase">
                <tr>
                  <th className="min-w-[240px] px-5 py-2.5 font-medium">Contract</th>
                  <th className="px-3 py-2.5 text-right font-medium">Open</th>
                  <th className="px-3 py-2.5 text-right font-medium">Overdue</th>
                  <th className="px-3 py-2.5 text-right font-medium">On time</th>
                  <th className="px-3 py-2.5 text-right font-medium">1st fix</th>
                  <th className="px-3 py-2.5 text-right font-medium">Rating</th>
                  {fin && <th className="w-36 px-5 py-2.5 font-medium">Budget used (12m)</th>}
                </tr>
              </thead>
              <tbody>
                {activePerf.map((p) => {
                  const used = p.annual_budget ? (Number(p.cost_last_12m) / Number(p.annual_budget)) * 100 : null;
                  return (
                    <tr key={p.contract_id} className="border-t border-line/70 hover:bg-raised/40">
                      <td className="px-5 py-3">
                        <Link href={`/contracts/${p.contract_id}`} className="font-medium hover:text-accent-hi">{p.contract?.title}</Link>
                        <div className="text-xs text-subtle">{p.contract?.organisation?.name} · <Mono className="text-[11px]">{p.contract?.reference}</Mono></div>
                      </td>
                      <td className="px-3 py-3 text-right tabular">{p.jobs_open}</td>
                      <td className={cx("px-3 py-3 text-right tabular", Number(p.jobs_overdue) > 0 && "text-[#ff8a87]")}>{p.jobs_overdue}</td>
                      <td className="px-3 py-3 text-right tabular">{pct(p.on_time_pct === null ? null : Number(p.on_time_pct))}</td>
                      <td className="px-3 py-3 text-right tabular">{pct(p.first_time_fix_pct === null ? null : Number(p.first_time_fix_pct))}</td>
                      <td className="px-3 py-3 text-right tabular">{p.avg_satisfaction ? `${Number(p.avg_satisfaction).toFixed(1)}/5` : "-"}</td>
                      {fin && (
                        <td className="px-5 py-3">
                          {used === null ? <span className="text-xs text-subtle">No budget set</span> : <Meter value={Number(p.cost_last_12m)} max={Number(p.annual_budget)} label={money(p.cost_last_12m, { compact: true, whole: true })} tone={used > 100 ? "bad" : used > 90 ? "warn" : "accent"} />}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Upcoming contract renewals" description="Active contracts ending in the next 6 months." />
          <ul className="divide-y divide-line">
            {(renewalsRes.data ?? []).length === 0 && <li><EmptyState title="No contracts ending soon" /></li>}
            {(renewalsRes.data ?? []).map((c) => {
              const d = daysUntil(c.end_date) ?? 0;
              return (
                <li key={c.id}>
                  <Link href={`/contracts/${c.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-raised/50">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{c.title}</span>
                      <span className="block truncate text-xs text-muted">{c.organisation?.name} · ends {date(c.end_date)}</span>
                    </span>
                    <Badge tone={d <= 30 ? "bad" : d <= 90 ? "warn" : "neutral"}>{d} days</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Workforce today" description="Who is where. Drag and drop changes in the schedule." actions={<ButtonLink href={`/schedule?view=day&date=${today}`} size="sm" variant="ghost">Open schedule <ArrowRight className="size-3.5" /></ButtonLink>} />
          {crew.size === 0 ? (
            <EmptyState title="Nothing scheduled today" />
          ) : (
            <ul className="divide-y divide-line">
              {[...crew.values()].map((c) => (
                <li key={c.name} className="grid gap-2 px-5 py-3 sm:grid-cols-[180px_1fr]">
                  <Link href={c.href} className="flex items-center gap-2.5 hover:text-accent-hi">
                    <span className="size-2.5 rounded-full" style={{ background: c.colour }} aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{c.name}</span>
                      <span className="block text-[11px] text-subtle capitalize">{c.trade.replace(/_/g, " ")}</span>
                    </span>
                  </Link>
                  <div className="flex flex-wrap gap-1.5">
                    {c.jobs.map((j) => (
                      <Link key={j.id + j.start} href={`/jobs/${j.id}`} className={cx("rounded-lg border px-2 py-1 text-xs hover:border-line-strong", j.priority === "emergency" ? "border-[#5a1f1d] bg-bad-lo/60" : "border-line bg-sunken")}>
                        <span className="text-subtle tabular">{time(j.start)}–{time(j.end)}</span> <span className="font-mono text-accent-hi">{j.ref.split("-").pop()}</span> <span className="text-muted">{j.title.length > 28 ? j.title.slice(0, 28) + "…" : j.title}</span>
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Live activity" description="Latest updates from the office and the field." actions={<Bell className="size-4 text-subtle" aria-hidden />} />
          <ul className="max-h-[440px] divide-y divide-line overflow-y-auto">
            {(feedRes.data ?? []).map((u) => (
              <li key={u.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2 text-xs text-subtle">
                  <span>{u.author?.full_name ?? "System"}</span>
                  <span>{relative(u.created_at)}</span>
                </div>
                <div className="mt-1 text-[13px] text-fg">
                  {u.work_order && <Link href={`/jobs/${u.work_order.id}`} className="mr-1.5 font-mono text-[12px] text-accent-hi hover:underline">{u.work_order.reference}</Link>}
                  {u.type === "status_change" && u.to_status ? (
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      moved {u.from_status && <ColourBadge colour={statuses.get(u.from_status).colour}>{statuses.get(u.from_status).label}</ColourBadge>} → <ColourBadge colour={statuses.get(u.to_status).colour}>{statuses.get(u.to_status).label}</ColourBadge>
                    </span>
                  ) : (
                    <span className="text-muted">{u.body ?? u.type.replace(/_/g, " ")}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/London" }));
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
