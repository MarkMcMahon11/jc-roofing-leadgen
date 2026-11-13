import type { Metadata } from "next";
import Link from "next/link";
import { CalendarOff, HardHat, Plus, Truck } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, Mono, PageHeader, Stat, Table, TD, TH, THead, TR, type Tone } from "@/components/ui/primitives";
import { FilterSelect, LinkTabs, Pagination, SearchBox } from "@/components/ui/url-controls";
import { addDaysISO, dateTime, todayISO } from "@/lib/format";
import { londonToISO } from "../properties/_lib/time";
import { Chips, cleanSearch, ExpiryDate, param } from "../properties/_lib/ui";
import { ABSENCE_STATUS, EMPLOYMENT_STATUS, VEHICLE_STATUS } from "./_lib/shared";
import { AbsenceButton, AbsenceDecision, VehicleButton } from "./_components/workforce-forms";

export const metadata: Metadata = { title: "Workforce" };
const PAGE = 50;

export default async function WorkforcePage({ searchParams }: PageProps<"/workforce">) {
  const ctx = await requireInternal("workforce.read");
  const sp = await searchParams;
  const tab = (["employees", "vehicles", "absences"] as const).find((t) => t === param(sp.tab)) ?? "employees";
  const supabase = await createClient();
  const today = todayISO();
  const soon = addDaysISO(today, 30);
  const nowIso = new Date().toISOString();

  // headline numbers (each links to the records behind it)
  const head = { count: "exact" as const, head: true };
  const [lookups, active, expiring, pending, vehiclesDue, absentNow] = await Promise.all([
    getLookups(ctx.tenantId),
    supabase.from("employees").select("id", head).eq("tenant_id", ctx.tenantId).eq("employment_status", "active"),
    supabase.from("qualifications").select("id", head).eq("tenant_id", ctx.tenantId).not("employee_id", "is", null).lte("expires_on", soon),
    supabase.from("employee_absences").select("id", head).eq("tenant_id", ctx.tenantId).eq("status", "requested").gte("ends_at", nowIso),
    supabase.from("vehicles").select("id", head).eq("tenant_id", ctx.tenantId).neq("status", "disposed").or(`mot_due.lte.${soon},insurance_due.lte.${soon},service_due.lte.${soon},tax_due.lte.${soon}`),
    supabase.from("employee_absences").select("employee_id").eq("tenant_id", ctx.tenantId).eq("status", "approved").lte("starts_at", nowIso).gt("ends_at", nowIso),
  ]);
  const absentIds = new Set((absentNow.data ?? []).map((a) => a.employee_id));

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Workforce"
        description="Operatives, their skills and tickets, vehicles and time away."
        actions={
          ctx.can("workforce.write") && tab === "employees" ? (
            <ButtonLink href="/workforce/new" variant="primary">
              <Plus className="size-4" aria-hidden />
              Add employee
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active employees" value={active.count ?? 0} hint={`${absentIds.size} absent today`} href="/workforce?status=active" icon={<HardHat className="size-4" />} />
        <Stat label="Tickets expiring ≤30 days" value={expiring.count ?? 0} tone={expiring.count ? "warn" : "ok"} hint="Includes expired" href="/workforce?quals=expiring" />
        <Stat label="Absence requests" value={pending.count ?? 0} tone={pending.count ? "warn" : "neutral"} hint="Awaiting a decision" href="/workforce?tab=absences" icon={<CalendarOff className="size-4" />} />
        <Stat label="Vehicles due ≤30 days" value={vehiclesDue.count ?? 0} tone={vehiclesDue.count ? "warn" : "ok"} hint="MOT, insurance, service or tax" href="/workforce?tab=vehicles" icon={<Truck className="size-4" />} />
      </div>
      <LinkTabs
        current={tab}
        tabs={[
          { key: "employees", label: "Employees", href: "/workforce" },
          { key: "vehicles", label: "Vehicles", href: "/workforce?tab=vehicles" },
          { key: "absences", label: "Absences", href: "/workforce?tab=absences", count: pending.count || undefined },
        ]}
      />
      <div className="mt-6">
        {tab === "employees" && <EmployeesTab ctx={ctx} sp={sp} lookups={lookups} absentIds={absentIds} today={today} soon={soon} />}
        {tab === "vehicles" && <VehiclesTab ctx={ctx} />}
        {tab === "absences" && <AbsencesTab ctx={ctx} lookups={lookups} />}
      </div>
    </>
  );
}

type Ctx = Awaited<ReturnType<typeof requireInternal>>;
type Lookups = Awaited<ReturnType<typeof getLookups>>;
type SP = Record<string, string | string[] | undefined>;

async function EmployeesTab({ ctx, sp, lookups, absentIds, today, soon }: { ctx: Ctx; sp: SP; lookups: Lookups; absentIds: Set<string>; today: string; soon: string }) {
  const supabase = await createClient();
  const q = cleanSearch(sp.q);
  const trade = param(sp.trade);
  const status = param(sp.status);
  const quals = param(sp.quals);
  const page = Math.max(1, Number(param(sp.page)) || 1);

  let expiringIds: string[] | null = null;
  if (quals === "expiring") {
    const { data } = await supabase.from("qualifications").select("employee_id").eq("tenant_id", ctx.tenantId).not("employee_id", "is", null).lte("expires_on", soon);
    expiringIds = [...new Set((data ?? []).map((r) => r.employee_id!))];
  }

  let query = supabase
    .from("employees")
    .select("id, reference, first_name, last_name, job_title, trade, skills, employment_status, employment_type, is_field_operative, colour, vehicle:vehicles(registration)", { count: "exact" })
    .eq("tenant_id", ctx.tenantId);
  if (q) {
    const [a, ...rest] = q.split(" ");
    const parts = [`first_name.ilike.%${q}%`, `last_name.ilike.%${q}%`, `reference.ilike.%${q}%`, `job_title.ilike.%${q}%`, `work_email.ilike.%${q}%`];
    if (rest.length) parts.push(`and(first_name.ilike.%${a}%,last_name.ilike.%${rest.join(" ")}%)`);
    query = query.or(parts.join(","));
  }
  if (trade) query = query.eq("trade", trade);
  if (status in EMPLOYMENT_STATUS) query = query.eq("employment_status", status);
  else query = query.neq("employment_status", "left");
  if (expiringIds) query = query.in("id", expiringIds.length ? expiringIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data, count } = await query.order("last_name").order("first_name").range((page - 1) * PAGE, page * PAGE - 1);
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);

  const dayStart = londonToISO(today, "00:00");
  const dayEnd = londonToISO(addDaysISO(today, 1), "00:00");
  const canJobs = ctx.can("work_orders.read");
  const [{ data: assigns }, { data: qualRows }] = await Promise.all([
    canJobs && ids.length
      ? supabase.from("job_assignments").select("employee_id").eq("tenant_id", ctx.tenantId).in("employee_id", ids).neq("status", "cancelled").gte("scheduled_start", dayStart).lt("scheduled_start", dayEnd)
      : Promise.resolve({ data: [] as { employee_id: string | null }[] }),
    ids.length
      ? supabase.from("qualifications").select("employee_id, expires_on").eq("tenant_id", ctx.tenantId).in("employee_id", ids).lte("expires_on", soon)
      : Promise.resolve({ data: [] as { employee_id: string | null; expires_on: string | null }[] }),
  ]);
  const todayCount = new Map<string, number>();
  for (const a of assigns ?? []) if (a.employee_id) todayCount.set(a.employee_id, (todayCount.get(a.employee_id) ?? 0) + 1);
  const qualState = new Map<string, { expired: number; soon: number }>();
  for (const r of qualRows ?? []) {
    if (!r.employee_id || !r.expires_on) continue;
    const s = qualState.get(r.employee_id) ?? { expired: 0, soon: 0 };
    if (r.expires_on < today) s.expired++;
    else s.soon++;
    qualState.set(r.employee_id, s);
  }
  const filtersActive = Boolean(q || trade || status || quals);

  return (
    <Card>
      <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3 sm:px-5">
        <SearchBox placeholder="Name, reference, job title…" className="w-full sm:w-72" />
        <FilterSelect param="trade" label="Trade" options={lookups.options("trade")} className="w-full sm:w-auto" />
        <FilterSelect param="status" label="Status" options={Object.entries(EMPLOYMENT_STATUS).map(([value, s]) => ({ value, label: s.label }))} className="w-full sm:w-auto" />
        <FilterSelect param="quals" label="Tickets" options={[{ value: "expiring", label: "Expiring or expired" }]} className="w-full sm:w-auto" />
        {filtersActive && (
          <Link href="/workforce" className="inline-flex h-10 items-center px-2 text-sm text-accent-hi hover:underline">
            Clear filters
          </Link>
        )}
      </div>
      {rows.length ? (
        <>
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Trade</TH>
                <TH>Skills</TH>
                <TH>Status</TH>
                <TH>Vehicle</TH>
                {canJobs && <TH align="right">Today</TH>}
                <TH>Tickets</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((e) => {
                const st = EMPLOYMENT_STATUS[e.employment_status] ?? { label: e.employment_status, tone: "neutral" as Tone };
                const qs = qualState.get(e.id);
                const jobsToday = todayCount.get(e.id) ?? 0;
                return (
                  <TR key={e.id}>
                    <TD className="min-w-[200px]">
                      <div className="flex items-center gap-2.5">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: e.colour }} aria-hidden />
                        <div className="min-w-0">
                          <Link href={`/workforce/${e.id}`} className="font-medium hover:text-accent-hi">
                            {e.first_name} {e.last_name}
                          </Link>
                          <div className="text-xs text-subtle">
                            <Mono className="text-[11.5px] text-subtle">{e.reference}</Mono>
                            {e.job_title && <> · {e.job_title}</>}
                          </div>
                        </div>
                      </div>
                    </TD>
                    <TD className="text-[13px] whitespace-nowrap">{lookups.label("trade", e.trade)}</TD>
                    <TD className="min-w-[200px]">
                      <Chips items={e.skills.map((s) => lookups.label("skill", s))} />
                    </TD>
                    <TD>
                      <span className="flex flex-wrap gap-1">
                        <Badge tone={st.tone} dot>{st.label}</Badge>
                        {absentIds.has(e.id) && <Badge tone="info">Absent today</Badge>}
                        {!e.is_field_operative && <Badge>Office</Badge>}
                      </span>
                    </TD>
                    <TD className="text-[13px] whitespace-nowrap">{e.vehicle?.registration ? <span className="font-mono">{e.vehicle.registration}</span> : <span className="text-subtle">-</span>}</TD>
                    {canJobs && (
                      <TD align="right">
                        {jobsToday ? (
                          <Link href={`/workforce/${e.id}?tab=work`} className="font-medium hover:text-accent-hi">
                            {jobsToday}
                          </Link>
                        ) : (
                          <span className="text-subtle">0</span>
                        )}
                      </TD>
                    )}
                    <TD>
                      {qs ? (
                        <Link href={`/workforce/${e.id}?tab=qualifications`} className="inline-flex flex-wrap gap-1">
                          {qs.expired > 0 && <Badge tone="bad">{qs.expired} expired</Badge>}
                          {qs.soon > 0 && <Badge tone="warn">{qs.soon} expiring</Badge>}
                        </Link>
                      ) : (
                        <Badge tone="ok">In date</Badge>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE} total={count ?? 0} />
        </>
      ) : (
        <EmptyState icon={<HardHat className="size-8" aria-hidden />} title={filtersActive ? "No employees match these filters" : "No employees yet"}>
          {filtersActive ? "Try a different search or clear the filters." : ctx.can("workforce.write") ? "Add your operatives and office staff to schedule work." : undefined}
        </EmptyState>
      )}
    </Card>
  );
}

async function VehiclesTab({ ctx }: { ctx: Ctx }) {
  const supabase = await createClient();
  const [{ data: vehicles }, { data: emps }] = await Promise.all([
    supabase.from("vehicles").select("*").eq("tenant_id", ctx.tenantId).order("status").order("registration"),
    supabase.from("employees").select("id, first_name, last_name, vehicle_id, employment_status").eq("tenant_id", ctx.tenantId).neq("employment_status", "left").order("last_name"),
  ]);
  const holders = new Map<string, { id: string; name: string }[]>();
  for (const e of emps ?? []) {
    if (!e.vehicle_id) continue;
    holders.set(e.vehicle_id, [...(holders.get(e.vehicle_id) ?? []), { id: e.id, name: `${e.first_name} ${e.last_name}` }]);
  }
  const employeeOptions = (emps ?? []).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}${e.vehicle_id ? " (has a vehicle)" : ""}` }));
  const canWrite = ctx.can("workforce.write");
  const rows = vehicles ?? [];

  return (
    <Card>
      <CardHeader title="Vehicles" description="Fleet, who drives what, and renewals due. Dates within 30 days are flagged." actions={canWrite ? <VehicleButton employees={employeeOptions} /> : undefined} />
      {rows.length ? (
        <Table>
          <THead>
            <tr>
              <TH>Registration</TH>
              <TH>Vehicle</TH>
              <TH>Status</TH>
              <TH>Assigned to</TH>
              <TH>MOT</TH>
              <TH>Insurance</TH>
              <TH>Service</TH>
              <TH>Tax</TH>
              {canWrite && <TH align="right"><span className="sr-only">Actions</span></TH>}
            </tr>
          </THead>
          <tbody>
            {rows.map((v) => {
              const st = VEHICLE_STATUS[v.status] ?? { label: v.status, tone: "neutral" as Tone };
              const who = holders.get(v.id) ?? [];
              const live = v.status !== "disposed";
              return (
                <TR key={v.id} className={live ? undefined : "opacity-60"}>
                  <TD className="whitespace-nowrap">
                    <span className="rounded-md border border-[#57400f] bg-[#2a1f0a] px-2 py-0.5 font-mono text-[13px] font-semibold tracking-wide text-[#ffcf7d]">{v.registration}</span>
                  </TD>
                  <TD className="min-w-[160px] text-[13px]">
                    {[v.make, v.model].filter(Boolean).join(" ") || <span className="text-subtle">-</span>}
                    <div className="text-xs text-subtle capitalize">{v.vehicle_type}</div>
                  </TD>
                  <TD><Badge tone={st.tone} dot>{st.label}</Badge></TD>
                  <TD className="min-w-[140px] text-[13px]">
                    {who.length ? (
                      who.map((w) => (
                        <div key={w.id}>
                          <Link href={`/workforce/${w.id}`} className="hover:text-accent-hi">{w.name}</Link>
                        </div>
                      ))
                    ) : (
                      <span className="text-subtle">Pool</span>
                    )}
                  </TD>
                  <TD className="text-[13px]">{live ? <ExpiryDate value={v.mot_due} /> : "-"}</TD>
                  <TD className="text-[13px]">{live ? <ExpiryDate value={v.insurance_due} /> : "-"}</TD>
                  <TD className="text-[13px]">{live ? <ExpiryDate value={v.service_due} /> : "-"}</TD>
                  <TD className="text-[13px]">{live ? <ExpiryDate value={v.tax_due} /> : "-"}</TD>
                  {canWrite && (
                    <TD align="right">
                      <VehicleButton
                        employees={employeeOptions}
                        values={{
                          id: v.id,
                          registration: v.registration,
                          make: v.make,
                          model: v.model,
                          vehicle_type: v.vehicle_type,
                          status: v.status,
                          mot_due: v.mot_due,
                          insurance_due: v.insurance_due,
                          service_due: v.service_due,
                          tax_due: v.tax_due,
                          notes: v.notes,
                          assigned_employee_id: who[0]?.id ?? null,
                        }}
                      />
                    </TD>
                  )}
                </TR>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<Truck className="size-8" aria-hidden />} title="No vehicles yet" />
      )}
    </Card>
  );
}

async function AbsencesTab({ ctx, lookups }: { ctx: Ctx; lookups: Lookups }) {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [{ data }, { data: emps }] = await Promise.all([
    supabase
      .from("employee_absences")
      .select("id, employee_id, type, starts_at, ends_at, status, notes, employee:employees(id, first_name, last_name, colour)")
      .eq("tenant_id", ctx.tenantId)
      .gte("ends_at", nowIso)
      .in("status", ["requested", "approved"])
      .order("starts_at")
      .limit(200),
    supabase.from("employees").select("id, first_name, last_name").eq("tenant_id", ctx.tenantId).neq("employment_status", "left").order("last_name"),
  ]);
  const rows = data ?? [];
  const canWrite = ctx.can("workforce.write");
  const types = lookups.options("absence_type");
  const pending = rows.filter((r) => r.status === "requested");
  const booked = rows.filter((r) => r.status === "approved");

  const table = (list: typeof rows, empty: string) =>
    list.length ? (
      <Table>
        <THead>
          <tr>
            <TH>Employee</TH>
            <TH>Type</TH>
            <TH>From</TH>
            <TH>Until</TH>
            <TH>Status</TH>
            <TH>Notes</TH>
            {canWrite && <TH align="right"><span className="sr-only">Actions</span></TH>}
          </tr>
        </THead>
        <tbody>
          {list.map((a) => {
            const st = ABSENCE_STATUS[a.status] ?? { label: a.status, tone: "neutral" as Tone };
            const current = a.starts_at <= nowIso;
            return (
              <TR key={a.id}>
                <TD className="min-w-[160px]">
                  {a.employee ? (
                    <Link href={`/workforce/${a.employee.id}?tab=availability`} className="inline-flex items-center gap-2 font-medium hover:text-accent-hi">
                      <span className="size-2 rounded-full" style={{ background: a.employee.colour }} aria-hidden />
                      {a.employee.first_name} {a.employee.last_name}
                    </Link>
                  ) : (
                    "-"
                  )}
                </TD>
                <TD className="text-[13px]">{lookups.label("absence_type", a.type)}</TD>
                <TD className="whitespace-nowrap text-[13px] text-muted">{dateTime(a.starts_at)}</TD>
                <TD className="whitespace-nowrap text-[13px] text-muted">{dateTime(a.ends_at)}</TD>
                <TD>
                  <span className="flex flex-wrap gap-1">
                    <Badge tone={st.tone} dot>{st.label}</Badge>
                    {current && a.status === "approved" && <Badge tone="info">Now</Badge>}
                  </span>
                </TD>
                <TD className="max-w-xs text-[13px] text-muted"><span className="line-clamp-2">{a.notes ?? "-"}</span></TD>
                {canWrite && (
                  <TD align="right">
                    <AbsenceDecision id={a.id} status={a.status} upcoming={!current} />
                  </TD>
                )}
              </TR>
            );
          })}
        </tbody>
      </Table>
    ) : (
      <p className="px-5 py-4 text-sm text-subtle">{empty}</p>
    );

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader
          title="Requests awaiting a decision"
          description="Approving blocks the person from being scheduled during the absence."
          actions={canWrite ? <AbsenceButton employees={(emps ?? []).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` }))} types={types} /> : undefined}
        />
        {table(pending, "No requests waiting.")}
      </Card>
      <Card>
        <CardHeader title="Current and upcoming absences" description="Approved time away from today onwards." />
        {table(booked, "Nobody is booked off.")}
      </Card>
    </div>
  );
}
