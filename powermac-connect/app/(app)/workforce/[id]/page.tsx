import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, CalendarDays, ChevronLeft, ClipboardList, Lock, Pencil, ShieldAlert } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups, getStatuses } from "@/lib/data/lookups";
import { Badge, ButtonLink, Card, CardBody, CardHeader, ColourBadge, DefinitionList, EmptyState, Mono, Notice, PageHeader, priorityTone, Stat, Table, TD, TH, THead, TR, type Tone } from "@/components/ui/primitives";
import { LinkTabs } from "@/components/ui/url-controls";
import { addDaysISO, date, dateTime, label, money, pct, time, todayISO } from "@/lib/format";
import { Chips, ExpiryDate, expiryState, param, Prose } from "../../properties/_lib/ui";
import { isoDaysAgo } from "../../properties/_lib/time";
import { ABSENCE_STATUS, DAY_LABEL, DAYS, EMPLOYMENT_STATUS, EMPLOYMENT_TYPES, hoursToTime, readWorkingHours, VEHICLE_STATUS } from "../_lib/shared";
import { AbsenceButton, AbsenceDecision, DeleteQualificationButton, PersonalDataButton, QualificationButton } from "../_components/workforce-forms";

export const metadata: Metadata = { title: "Employee" };

const GEO: Record<string, string> = {
  not_found: "The base postcode was not found by the mapping service, so travel distances cannot be estimated yet. Check the postcode.",
  unavailable: "The mapping service could not be reached, so the base location was not set. Save the profile again later.",
};

export default async function EmployeePage({ params, searchParams }: PageProps<"/workforce/[id]">) {
  const ctx = await requireInternal("workforce.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const e = await fetchEmployee(ctx.tenantId, id);
  if (!e) notFound();

  const lookups = await getLookups(ctx.tenantId);
  const today = todayISO();
  const head = { count: "exact" as const, head: true };
  const [qualCount, absCount] = await Promise.all([
    supabase.from("qualifications").select("id", head).eq("tenant_id", ctx.tenantId).eq("employee_id", id),
    supabase.from("employee_absences").select("id", head).eq("tenant_id", ctx.tenantId).eq("employee_id", id).in("status", ["requested", "approved"]).gte("ends_at", new Date().toISOString()),
  ]);

  const tabKeys = ["overview", "qualifications", "availability", "work"] as const;
  type TabKey = (typeof tabKeys)[number];
  const tab: TabKey = tabKeys.find((t) => t === param(sp.tab)) ?? "overview";
  const href = (t: TabKey) => (t === "overview" ? `/workforce/${id}` : `/workforce/${id}?tab=${t}`);
  const st = EMPLOYMENT_STATUS[e.employment_status] ?? { label: e.employment_status, tone: "neutral" as Tone };
  const saved = param(sp.saved);
  const geo = param(sp.geo);

  return (
    <>
      <Link href="/workforce" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden />
        Workforce
      </Link>
      <PageHeader
        eyebrow="Employee"
        title={
          <span className="inline-flex items-center gap-3">
            <span className="size-3.5 shrink-0 rounded-full ring-4 ring-white/5" style={{ background: e.colour }} aria-hidden />
            {e.first_name} {e.last_name}
          </span>
        }
        description={[e.job_title, lookups.label("trade", e.trade)].filter(Boolean).join(" · ")}
        actions={
          ctx.can("workforce.write") ? (
            <ButtonLink href={`/workforce/${id}/edit`}>
              <Pencil className="size-4" aria-hidden />
              Edit
            </ButtonLink>
          ) : undefined
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Mono>{e.reference}</Mono>
          <Badge tone={st.tone} dot>{st.label}</Badge>
          <Badge>{EMPLOYMENT_TYPES.find((t) => t.value === e.employment_type)?.label ?? label(e.employment_type)}</Badge>
          {e.is_field_operative ? <Badge tone="accent">Field operative</Badge> : <Badge>Office based</Badge>}
        </div>
      </PageHeader>

      {(saved || (geo && GEO[geo])) && (
        <div className="mb-6 grid gap-3">
          {saved && <Notice tone="ok">{saved === "created" ? "Employee added." : "Profile saved."}</Notice>}
          {geo && GEO[geo] && <Notice tone="warn" title="No base location">{GEO[geo]}</Notice>}
        </div>
      )}

      <LinkTabs
        current={tab}
        tabs={[
          { key: "overview", label: "Profile", href: href("overview") },
          { key: "qualifications", label: "Qualifications", href: href("qualifications"), count: qualCount.count ?? undefined },
          { key: "availability", label: "Availability", href: href("availability"), count: absCount.count || undefined },
          { key: "work", label: "Assigned work", href: href("work") },
        ]}
      />
      <div className="mt-6">
        {tab === "overview" && <OverviewTab ctx={ctx} e={e} lookups={lookups} today={today} />}
        {tab === "qualifications" && <QualificationsTab ctx={ctx} employeeId={id} />}
        {tab === "availability" && <AvailabilityTab ctx={ctx} employeeId={id} workingHours={e.working_hours} maxDaily={Number(e.max_daily_hours)} lookups={lookups} />}
        {tab === "work" && <WorkTab ctx={ctx} employeeId={id} />}
      </div>
    </>
  );
}

type Ctx = Awaited<ReturnType<typeof requireInternal>>;
type Lookups = Awaited<ReturnType<typeof getLookups>>;

/* ================================================================== profile */
async function fetchEmployee(tenantId: string, id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("employees").select("*, vehicle:vehicles(id, registration, make, model, status)").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  return data;
}
type Employee = NonNullable<Awaited<ReturnType<typeof fetchEmployee>>>;

async function OverviewTab({ ctx, e, lookups, today }: { ctx: Ctx; e: Employee; lookups: Lookups; today: string}) {
  const supabase = await createClient();
  const since = addDaysISO(today, -90);
  const sinceIso = new Date(since + "T00:00:00Z").toISOString();
  const canJobs = ctx.can("work_orders.read");
  const canPii = ctx.can("workforce.pii");

  const [{ data: done }, { data: sheets }, { data: priv }] = await Promise.all([
    canJobs
      ? supabase
          .from("job_assignments")
          .select("work_order_id, work_order:work_orders!inner(id, completed_at, target_completion_at, first_time_fix, satisfaction_score)")
          .eq("tenant_id", ctx.tenantId)
          .eq("employee_id", e.id)
          .neq("status", "cancelled")
          .gte("work_order.completed_at", sinceIso)
      : Promise.resolve({ data: [] as { work_order_id: string; work_order: { id: string; completed_at: string | null; target_completion_at: string | null; first_time_fix: boolean | null; satisfaction_score: number | null } }[] }),
    // hours only: labour cost is derived from private pay data and never shown here
    supabase.from("timesheets").select("hours, status").eq("tenant_id", ctx.tenantId).eq("employee_id", e.id).gte("work_date", since).neq("status", "rejected"),
    canPii ? supabase.from("employee_private").select("*").eq("tenant_id", ctx.tenantId).eq("employee_id", e.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const jobs = new Map<string, { completed_at: string | null; target_completion_at: string | null; first_time_fix: boolean | null; satisfaction_score: number | null }>();
  for (const a of done ?? []) if (a.work_order) jobs.set(a.work_order_id, a.work_order);
  const list = [...jobs.values()];
  const ftfKnown = list.filter((j) => j.first_time_fix !== null);
  const sat = list.filter((j) => j.satisfaction_score !== null).map((j) => Number(j.satisfaction_score));
  const withTarget = list.filter((j) => j.target_completion_at && j.completed_at);
  const onTime = withTarget.filter((j) => j.completed_at! <= j.target_completion_at!);
  const hours = (sheets ?? []).reduce((s, t) => s + Number(t.hours), 0);
  const wh = readWorkingHours(e.working_hours);
  const vst = e.vehicle ? VEHICLE_STATUS[e.vehicle.status] : null;

  return (
    <div className="grid gap-6">
      <section aria-labelledby="perf-h">
        <h2 id="perf-h" className="mb-3 text-xs font-semibold tracking-[0.12em] text-subtle uppercase">Performance · last 90 days</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Stat label="Jobs completed" value={canJobs ? list.length : "-"} href={canJobs ? `/workforce/${e.id}?tab=work` : undefined} hint={canJobs ? undefined : "Needs job access"} />
          <Stat label="Hours logged" value={hours.toLocaleString("en-GB", { maximumFractionDigits: 1 })} hint="From timesheets" />
          <Stat label="First-time fix" value={ftfKnown.length ? pct((100 * ftfKnown.filter((j) => j.first_time_fix).length) / ftfKnown.length) : "-"} hint={ftfKnown.length ? `${ftfKnown.length} jobs recorded` : "No data yet"} tone={ftfKnown.length ? "accent" : "neutral"} />
          <Stat label="Avg satisfaction" value={sat.length ? `${(sat.reduce((a, b) => a + b, 0) / sat.length).toFixed(1)}/5` : "-"} hint={sat.length ? `${sat.length} ratings` : "No ratings yet"} tone={sat.length ? "ok" : "neutral"} />
          <Stat label="On time" value={withTarget.length ? pct((100 * onTime.length) / withTarget.length) : "-"} hint={withTarget.length ? `${onTime.length} of ${withTarget.length} by target date` : "No data yet"} tone={withTarget.length ? (onTime.length / withTarget.length >= 0.9 ? "ok" : "warn") : "neutral"} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DefinitionList
              items={[
                { label: "Reference", value: <Mono>{e.reference}</Mono> },
                { label: "Trade", value: lookups.label("trade", e.trade) },
                { label: "Job title", value: e.job_title },
                { label: "Skills and tickets", value: <Chips items={e.skills.map((s) => lookups.label("skill", s))} max={20} empty="None recorded" /> },
                { label: "Work email", value: e.work_email ? <a href={`mailto:${e.work_email}`} className="hover:text-accent-hi">{e.work_email}</a> : null },
                { label: "Work phone", value: e.work_phone ? <a href={`tel:${e.work_phone.replace(/\s+/g, "")}`} className="hover:text-accent-hi">{e.work_phone}</a> : null },
                { label: "Started", value: date(e.start_date) },
                { label: "Left / ends", value: e.end_date ? date(e.end_date) : null },
                { label: "Charge rate (sell)", value: e.charge_rate !== null ? `${money(e.charge_rate)} / hour` : null },
                {
                  label: "Base",
                  value: e.base_postcode ? (
                    <span>
                      {e.base_postcode}
                      {e.base_latitude === null && <Badge tone="warn" className="ml-2">Not located</Badge>}
                    </span>
                  ) : null,
                },
                {
                  label: "Vehicle",
                  value: e.vehicle ? (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span className="font-mono">{e.vehicle.registration}</span>
                      <span className="text-muted">{[e.vehicle.make, e.vehicle.model].filter(Boolean).join(" ")}</span>
                      {vst && e.vehicle.status !== "active" && <Badge tone={vst.tone}>{vst.label}</Badge>}
                    </span>
                  ) : null,
                },
                { label: "Max hours per day", value: `${Number(e.max_daily_hours)} h` },
              ]}
            />
          </CardBody>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader title="Working pattern" />
            <CardBody>
              <ul className="grid gap-1.5 text-sm">
                {DAYS.map((d) => (
                  <li key={d} className="flex items-center justify-between gap-3">
                    <span className="text-muted">{DAY_LABEL[d]}</span>
                    {wh[d] ? <span className="tabular">{hoursToTime(wh[d]![0])} – {hoursToTime(wh[d]![1])}</span> : <span className="text-subtle">Not working</span>}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          {canPii ? (
            <Card className="border-[#57400f]">
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    <ShieldAlert className="size-4 text-warn" aria-hidden />
                    Restricted personal data
                  </span>
                }
                description="Visible to you because you hold workforce personal-data access. Do not copy it elsewhere."
                actions={
                  <PersonalDataButton
                    employeeId={e.id}
                    exists={Boolean(priv)}
                    values={
                      priv
                        ? {
                            date_of_birth: priv.date_of_birth,
                            ni_number: priv.ni_number,
                            home_address: priv.home_address,
                            personal_phone: priv.personal_phone,
                            emergency_contact_name: priv.emergency_contact_name,
                            emergency_contact_phone: priv.emergency_contact_phone,
                            hourly_cost: priv.hourly_cost === null ? null : Number(priv.hourly_cost),
                            notes: priv.notes,
                          }
                        : {}
                    }
                  />
                }
              />
              <CardBody>
                {priv ? (
                  <DefinitionList
                    items={[
                      { label: "Date of birth", value: priv.date_of_birth ? date(priv.date_of_birth) : null },
                      { label: "NI number", value: priv.ni_number ? <span className="font-mono">{priv.ni_number}</span> : null },
                      { label: "Home address", value: priv.home_address ? <span className="whitespace-pre-line">{priv.home_address}</span> : null },
                      { label: "Personal phone", value: priv.personal_phone },
                      { label: "Emergency contact", value: [priv.emergency_contact_name, priv.emergency_contact_phone].filter(Boolean).join(" · ") || null },
                      { label: "Hourly cost (pay)", value: priv.hourly_cost !== null ? `${money(priv.hourly_cost)} / hour` : null },
                      ...(priv.notes ? [{ label: "Notes", value: <Prose text={priv.notes} /> }] : []),
                    ]}
                  />
                ) : (
                  <p className="text-sm text-subtle">No personal data recorded.</p>
                )}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody className="flex items-start gap-3">
                <Lock className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden />
                <div>
                  <p className="text-sm font-medium">Personal data restricted</p>
                  <p className="mt-0.5 text-sm text-muted">Date of birth, NI number, home address, emergency contact and pay are only visible to people with workforce personal-data access.</p>
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== qualifications */
async function QualificationsTab({ ctx, employeeId }: { ctx: Ctx; employeeId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("qualifications")
    .select("id, name, issuer, certificate_number, issued_on, expires_on")
    .eq("tenant_id", ctx.tenantId)
    .eq("employee_id", employeeId)
    .order("expires_on", { ascending: true, nullsFirst: false });
  const rows = data ?? [];
  const canWrite = ctx.can("workforce.write");
  const problems = rows.filter((q) => ["bad", "warn"].includes(expiryState(q.expires_on).tone));
  return (
    <div className="grid gap-4">
      {problems.length > 0 && (
        <Notice tone={problems.some((q) => expiryState(q.expires_on).tone === "bad") ? "bad" : "warn"} title="Renewal needed">
          {problems.map((q) => `${q.name}: ${expiryState(q.expires_on).label.toLowerCase()}`).join(" · ")}
        </Notice>
      )}
      <Card>
        <CardHeader title="Qualifications and certifications" description="Cards, tickets and registrations. Expiring items are flagged 30 days ahead." actions={canWrite ? <QualificationButton owner={{ employee_id: employeeId }} /> : undefined} />
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Qualification</TH>
                <TH>Number</TH>
                <TH>Issued</TH>
                <TH>Expires</TH>
                {canWrite && <TH align="right"><span className="sr-only">Actions</span></TH>}
              </tr>
            </THead>
            <tbody>
              {rows.map((q) => (
                <TR key={q.id}>
                  <TD className="min-w-[200px]">
                    <div className="font-medium">{q.name}</div>
                    {q.issuer && <div className="text-xs text-subtle">{q.issuer}</div>}
                  </TD>
                  <TD className="font-mono text-[13px] text-muted">{q.certificate_number ?? "-"}</TD>
                  <TD className="whitespace-nowrap text-[13px] text-muted">{date(q.issued_on)}</TD>
                  <TD className="text-[13px]"><ExpiryDate value={q.expires_on} quietWhenValid={false} emptyLabel="Does not expire" /></TD>
                  {canWrite && (
                    <TD align="right">
                      <span className="inline-flex gap-2">
                        <QualificationButton owner={{ employee_id: employeeId }} values={q} />
                        <DeleteQualificationButton id={q.id} name={q.name} />
                      </span>
                    </TD>
                  )}
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<Award className="size-7" aria-hidden />} title="No qualifications recorded" />
        )}
      </Card>
    </div>
  );
}

/* ================================================================== availability */
async function AvailabilityTab({ ctx, employeeId, workingHours, maxDaily, lookups }: { ctx: Ctx; employeeId: string; workingHours: unknown; maxDaily: number; lookups: Lookups }) {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const since = isoDaysAgo(90);
  const { data } = await supabase
    .from("employee_absences")
    .select("id, type, starts_at, ends_at, status, notes")
    .eq("tenant_id", ctx.tenantId)
    .eq("employee_id", employeeId)
    .gte("ends_at", since)
    .order("starts_at", { ascending: false });
  const rows = data ?? [];
  const canWrite = ctx.can("workforce.write");
  const upcoming = rows.filter((a) => a.ends_at >= nowIso).reverse();
  const past = rows.filter((a) => a.ends_at < nowIso);
  const wh = readWorkingHours(workingHours);
  const weekly = Object.values(wh).reduce((s, v) => s + (v ? v[1] - v[0] : 0), 0);

  const table = (list: typeof rows, isUpcoming: boolean) => (
    <Table>
      <THead>
        <tr>
          <TH>Type</TH>
          <TH>From</TH>
          <TH>Until</TH>
          <TH>Status</TH>
          <TH>Notes</TH>
          {canWrite && isUpcoming && <TH align="right"><span className="sr-only">Actions</span></TH>}
        </tr>
      </THead>
      <tbody>
        {list.map((a) => {
          const s = ABSENCE_STATUS[a.status] ?? { label: a.status, tone: "neutral" as Tone };
          return (
            <TR key={a.id}>
              <TD>{lookups.label("absence_type", a.type)}</TD>
              <TD className="whitespace-nowrap text-[13px] text-muted">{dateTime(a.starts_at)}</TD>
              <TD className="whitespace-nowrap text-[13px] text-muted">{dateTime(a.ends_at)}</TD>
              <TD><Badge tone={s.tone} dot>{s.label}</Badge></TD>
              <TD className="max-w-xs text-[13px] text-muted"><span className="line-clamp-2">{a.notes ?? "-"}</span></TD>
              {canWrite && isUpcoming && (
                <TD align="right">
                  <AbsenceDecision id={a.id} status={a.status} upcoming={a.starts_at > nowIso} />
                </TD>
              )}
            </TR>
          );
        })}
      </tbody>
    </Table>
  );

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader
          title="Current and upcoming absences"
          description={`Normally works ${weekly.toLocaleString("en-GB", { maximumFractionDigits: 1 })} hours a week · up to ${maxDaily} hours a day`}
          actions={canWrite ? <AbsenceButton employeeId={employeeId} types={lookups.options("absence_type")} /> : undefined}
        />
        {upcoming.length ? table(upcoming, true) : <EmptyState icon={<CalendarDays className="size-7" aria-hidden />} title="Available: no absences booked" />}
      </Card>
      <Card>
        <CardHeader title="Recent absences" description="Last 90 days" />
        {past.length ? table(past, false) : <p className="px-5 py-4 text-sm text-subtle">None in the last 90 days.</p>}
      </Card>
    </div>
  );
}

/* ================================================================== assigned work */
async function WorkTab({ ctx, employeeId }: { ctx: Ctx; employeeId: string }) {
  if (!ctx.can("work_orders.read"))
    return (
      <Card>
        <EmptyState icon={<Lock className="size-7" aria-hidden />} title="Assigned work is not available to you">Viewing jobs needs work order access.</EmptyState>
      </Card>
    );
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const recentFrom = isoDaysAgo(30);
  const statuses = await getStatuses(ctx.tenantId);
  const select = "id, role, status, scheduled_start, scheduled_end, work_order:work_orders(id, reference, title, status, priority, property:properties(address_line1, town, postcode))" as const;
  const [{ data: upcoming }, { data: recent }] = await Promise.all([
    supabase.from("job_assignments").select(select).eq("tenant_id", ctx.tenantId).eq("employee_id", employeeId).gte("scheduled_end", nowIso).neq("status", "cancelled").order("scheduled_start").limit(100),
    supabase.from("job_assignments").select(select).eq("tenant_id", ctx.tenantId).eq("employee_id", employeeId).lt("scheduled_end", nowIso).gte("scheduled_start", recentFrom).order("scheduled_start", { ascending: false }).limit(100),
  ]);
  const ASSIGN_TONE: Record<string, Tone> = { scheduled: "info", accepted: "accent", travelling: "accent", on_site: "ok", paused: "warn", completed: "ok", cancelled: "neutral", no_access: "bad" };

  const table = (list: NonNullable<typeof upcoming>) => (
    <Table>
      <THead>
        <tr>
          <TH>When</TH>
          <TH>Job</TH>
          <TH>Property</TH>
          <TH>Priority</TH>
          <TH>Job status</TH>
          <TH>Visit</TH>
        </tr>
      </THead>
      <tbody>
        {list.map((a) => {
          const w = a.work_order;
          const s = w ? statuses.get(w.status) : null;
          return (
            <TR key={a.id}>
              <TD className="whitespace-nowrap text-[13px]">
                <div>{date(a.scheduled_start)}</div>
                <div className="text-xs text-subtle tabular">{time(a.scheduled_start)} – {time(a.scheduled_end)}</div>
              </TD>
              <TD className="min-w-[220px]">
                {w ? (
                  <Link href={`/jobs/${w.id}`} className="hover:text-accent-hi">
                    <Mono>{w.reference}</Mono>
                    <div className="font-medium">{w.title}</div>
                  </Link>
                ) : (
                  "-"
                )}
                {a.role !== "lead" && <Badge className="mt-1">{label(a.role)}</Badge>}
              </TD>
              <TD className="min-w-[160px] text-[13px] text-muted">{w?.property ? `${w.property.address_line1}, ${w.property.postcode}` : "-"}</TD>
              <TD>{w ? <Badge tone={priorityTone[w.priority] ?? "neutral"}>{label(w.priority)}</Badge> : "-"}</TD>
              <TD>{s ? <ColourBadge colour={s.colour}>{s.label}</ColourBadge> : "-"}</TD>
              <TD><Badge tone={ASSIGN_TONE[a.status] ?? "neutral"}>{label(a.status)}</Badge></TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader
          title="Upcoming"
          description="Scheduled visits from now on."
          actions={ctx.can("schedule.read") ? <ButtonLink href="/schedule" size="sm">Open schedule</ButtonLink> : undefined}
        />
        {upcoming?.length ? table(upcoming) : <EmptyState icon={<ClipboardList className="size-7" aria-hidden />} title="Nothing scheduled" />}
      </Card>
      <Card>
        <CardHeader title="Recent" description="Last 30 days" />
        {recent?.length ? table(recent) : <p className="px-5 py-4 text-sm text-subtle">No visits in the last 30 days.</p>}
      </Card>
    </div>
  );
}
