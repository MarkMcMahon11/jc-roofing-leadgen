import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups, getStatuses } from "@/lib/data/lookups";
import { Badge, ButtonLink, Notice, PageHeader, Stat, cx } from "@/components/ui/primitives";
import { FilterSelect } from "@/components/ui/url-controls";
import { Meter } from "@/components/ui/charts";
import { addDays, dayBounds, fmtDay, fmtRange, isISODate, londonToUtc, mondayOf, todayLondon } from "./_lib/time";
import { bookedHours, capacityHours, findClashes, hoursLabel, overlaps } from "./_lib/board";
import { PRIORITY_RANK, type Absence, type Booking, type Operative, type QueueJob, type StatusInfo, type Sub, type WorkingHours } from "./_lib/types";
import { Planner } from "./_components/planner";
import { DateJump, WeekendToggle } from "./_components/toolbar-controls";

export const metadata: Metadata = { title: "Schedule" };

const QUEUE_CATEGORIES = ["intake", "pre_works", "ready"];
const QUEUE_LIMIT = 150;

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const ctx = await requireInternal("schedule.read");
  const t = ctx.tenantId;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const today = todayLondon();
  const date = isISODate(str("date")) ? str("date")! : today;
  const view: "week" | "day" = str("view") === "day" ? "day" : "week";
  const weekend = str("weekend") === "1";
  const trade = str("trade") || undefined;
  const q = (str("q") ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 60);
  const qtrade = str("qtrade") || undefined;
  const priority = ["emergency", "urgent", "routine", "planned"].includes(str("priority") ?? "") ? str("priority") : undefined;

  const canEdit = ctx.can("schedule.write") && ctx.can("work_orders.assign");
  const seesWorkforce = ctx.can("workforce.read");
  const weekStart = mondayOf(date);
  const weekDays = Array.from({ length: weekend ? 7 : 5 }, (_, i) => addDays(weekStart, i));
  const days = view === "day" ? [date] : weekDays;
  const rangeStart = londonToUtc(weekStart, 0);
  const rangeEnd = londonToUtc(addDays(weekStart, 7), 0);

  const supabase = await createClient();
  const [statuses, lookups] = await Promise.all([getStatuses(t), getLookups(t)]);
  const queueKeys = statuses.list.filter((s) => QUEUE_CATEGORIES.includes(s.category)).map((s) => s.key);

  let employeesQ = supabase
    .from("employees")
    .select("id, reference, first_name, last_name, trade, colour, working_hours, max_daily_hours, employment_status")
    .eq("tenant_id", t)
    .eq("is_field_operative", true)
    .in("employment_status", ["active", "on_leave"])
    .order("first_name")
    .order("last_name");
  if (trade) employeesQ = employeesQ.eq("trade", trade);

  let queueQ = supabase
    .from("work_orders")
    .select("id, reference, title, priority, status, trade, estimated_hours, target_completion_at, property:properties(postcode, town), job_assignments(id)", { count: "exact" })
    .eq("tenant_id", t)
    .in("status", queueKeys.length ? queueKeys : ["-"])
    .not("job_assignments.status", "in", "(cancelled,no_access)")
    .is("job_assignments", null)
    .order("target_completion_at", { ascending: true, nullsFirst: false })
    .limit(QUEUE_LIMIT);
  if (qtrade) queueQ = queueQ.eq("trade", qtrade);
  if (priority) queueQ = queueQ.eq("priority", priority);
  if (q) queueQ = queueQ.or(`reference.ilike.%${q}%,title.ilike.%${q}%`);

  const todayRange = dayBounds(today);
  const [employeesRes, bookingsRes, absencesRes, queueRes, urgentRes, transitionsRes, todayAbsRes] = await Promise.all([
    employeesQ,
    supabase
      .from("job_assignments")
      .select(
        "id, work_order_id, employee_id, subcontractor_id, role, scheduled_start, scheduled_end, status, work_order:work_orders(id, reference, title, priority, status, trade, estimated_hours, property:properties(postcode)), subcontractor:subcontractors(id, reference, company_name, trades)",
      )
      .eq("tenant_id", t)
      .neq("status", "cancelled")
      .lt("scheduled_start", rangeEnd)
      .gt("scheduled_end", rangeStart)
      .order("scheduled_start")
      .limit(3000),
    supabase
      .from("employee_absences")
      .select("id, employee_id, type, status, starts_at, ends_at")
      .eq("tenant_id", t)
      .in("status", ["approved", "requested"])
      .lt("starts_at", rangeEnd)
      .gt("ends_at", rangeStart),
    queueQ,
    supabase
      .from("work_orders")
      .select("id, job_assignments(id)", { count: "exact", head: true })
      .eq("tenant_id", t)
      .in("status", queueKeys.length ? queueKeys : ["-"])
      .in("priority", ["emergency", "urgent"])
      .not("job_assignments.status", "in", "(cancelled,no_access)")
      .is("job_assignments", null),
    supabase.from("job_status_transitions").select("from_key, required_permission").eq("tenant_id", t).eq("to_key", "scheduled"),
    supabase
      .from("employee_absences")
      .select("employee_id")
      .eq("tenant_id", t)
      .eq("status", "approved")
      .lt("starts_at", new Date(todayRange.end).toISOString())
      .gt("ends_at", new Date(todayRange.start).toISOString()),
  ]);
  const loadError = [employeesRes, bookingsRes, absencesRes, queueRes].find((r) => r.error)?.error;

  /* ---------------------------------------------------------------- shape the data */
  const tradeLabel = (k: string) => lookups.label("trade", k);
  const statusMap: Record<string, StatusInfo> = Object.fromEntries(statuses.list.map((s) => [s.key, { label: s.label, colour: s.colour, category: s.category }]));
  const toScheduled = new Map((transitionsRes.data ?? []).map((r) => [r.from_key, r.required_permission]));
  const movesToScheduled = (status: string) => toScheduled.has(status) && (!toScheduled.get(status) || ctx.can(toScheduled.get(status)!));

  const bookings: Booking[] = (bookingsRes.data ?? [])
    .filter((b) => b.work_order)
    .map((b) => ({
      id: b.id,
      workOrderId: b.work_order_id,
      employeeId: b.employee_id,
      subcontractorId: b.subcontractor_id,
      role: b.role,
      start: b.scheduled_start,
      end: b.scheduled_end,
      status: b.status,
      job: {
        id: b.work_order!.id,
        reference: b.work_order!.reference,
        title: b.work_order!.title,
        priority: b.work_order!.priority,
        status: b.work_order!.status,
        trade: b.work_order!.trade,
        postcode: b.work_order!.property?.postcode ?? null,
        estimatedHours: b.work_order!.estimated_hours === null ? null : Number(b.work_order!.estimated_hours),
      },
    }));

  let operatives: Operative[] = (employeesRes.data ?? []).map((e) => ({
    id: e.id,
    name: `${e.first_name} ${e.last_name}`,
    reference: e.reference,
    trade: e.trade,
    tradeLabel: tradeLabel(e.trade),
    colour: e.colour,
    employmentStatus: e.employment_status,
    hours: (e.working_hours ?? {}) as WorkingHours,
    maxDaily: Number(e.max_daily_hours),
  }));
  if (!seesWorkforce) {
    // RLS hides the workforce from this role: show bookings per operative without personal details
    const ids = [...new Set(bookings.map((b) => b.employeeId).filter(Boolean) as string[])];
    operatives = ids.map((id, i) => ({ id, name: `Operative ${i + 1}`, reference: "", trade: "", tradeLabel: "Details restricted", colour: "#5b6b8c", employmentStatus: "active", hours: null, maxDaily: 0, restricted: true }));
  }
  const opIds = new Set(operatives.map((o) => o.id));

  const subMap = new Map<string, Sub>();
  for (const b of bookingsRes.data ?? []) {
    const s = b.subcontractor;
    if (!b.subcontractor_id || subMap.has(b.subcontractor_id)) continue;
    subMap.set(b.subcontractor_id, { id: b.subcontractor_id, name: s?.company_name ?? "Subcontractor", reference: s?.reference ?? "", trades: s?.trades ?? [] });
  }
  const subs = [...subMap.values()].filter((s) => !trade || s.trades.includes(trade)).sort((a, b) => a.name.localeCompare(b.name));

  const absences: Absence[] = (absencesRes.data ?? []).map((a) => ({
    id: a.id,
    employeeId: a.employee_id,
    type: a.type,
    label: lookups.label("absence_type", a.type),
    status: a.status,
    start: a.starts_at,
    end: a.ends_at,
  }));

  const queue: QueueJob[] = (queueRes.data ?? [])
    .map((w) => ({
      id: w.id,
      reference: w.reference,
      title: w.title,
      priority: w.priority,
      status: w.status,
      trade: w.trade,
      tradeLabel: tradeLabel(w.trade),
      postcode: w.property?.postcode ?? null,
      town: w.property?.town ?? null,
      targetCompletion: w.target_completion_at,
      estimatedHours: w.estimated_hours === null ? null : Number(w.estimated_hours),
      movesToScheduled: movesToScheduled(w.status),
    }))
    .sort(
      (a, b) =>
        Number(b.status === "approved") - Number(a.status === "approved") ||
        (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
        (a.targetCompletion ?? "9999").localeCompare(b.targetCompletion ?? "9999"),
    );

  /* ---------------------------------------------------------------- header summary */
  const activeOps = operatives.filter((o) => o.employmentStatus === "active" && !o.restricted);
  const absentToday = new Set((todayAbsRes.data ?? []).map((a) => a.employee_id));
  const availableToday = activeOps.filter((o) => !absentToday.has(o.id)).length;
  const opBookings = bookings.filter((b) => b.employeeId && opIds.has(b.employeeId));
  let weekBooked = 0, weekCapacity = 0;
  for (const o of operatives) {
    if (o.restricted) continue;
    const mine = opBookings.filter((b) => b.employeeId === o.id);
    for (const d of weekDays) {
      weekBooked += bookedHours(mine, d);
      weekCapacity += capacityHours(o, d, absences);
    }
  }
  const weekBounds = { start: Date.parse(londonToUtc(weekDays[0], 0)), end: Date.parse(londonToUtc(addDays(weekDays[weekDays.length - 1], 1), 0)) };
  const clashes = findClashes(opBookings, absences);
  const clashCount = opBookings.filter((b) => clashes.has(b.id) && overlaps(Date.parse(b.start), Date.parse(b.end), weekBounds.start, weekBounds.end)).length;
  const loadPct = weekCapacity > 0 ? (weekBooked / weekCapacity) * 100 : 0;
  const absentCount = activeOps.filter((o) => absentToday.has(o.id)).length;

  /* ---------------------------------------------------------------- toolbar links */
  const base = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) base.set(k, v);
  const href = (changes: Record<string, string | null>) => {
    const n = new URLSearchParams(base);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) n.delete(k);
      else n.set(k, v);
    }
    return `/schedule${n.size ? `?${n}` : ""}`;
  };
  const step = view === "day" ? 1 : 7;
  const focusDay = view === "day" ? date : weekDays.includes(today) ? today : weekDays.includes(date) ? date : weekDays[0];
  const title = view === "day" ? fmtDay(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : fmtRange(weekDays[0], weekDays[weekDays.length - 1]);

  return (
    <>
      <PageHeader
        eyebrow="Operations · Workforce scheduling"
        title="Schedule"
        description={
          canEdit
            ? "Drag jobs from the queue onto an operative's day, or select a job and click a cell. Clashes are checked before anything is booked."
            : "You can view the schedule. Booking work needs the Schedule (write) and Assign work orders permissions."
        }
        actions={
          !canEdit ? (
            <Badge tone="neutral" className="gap-1">
              <Eye className="size-3.5" aria-hidden />
              Read only
            </Badge>
          ) : null
        }
      />

      {loadError && (
        <div className="mb-4">
          <Notice tone="bad" title="Some schedule data could not be loaded">
            Refresh the page to try again. If it keeps happening, contact your administrator.
          </Notice>
        </div>
      )}
      {!seesWorkforce && (
        <div className="mb-4">
          <Notice tone="warn" title="Operative details are hidden for your role">
            Your role can see bookings but not the workforce register, so operatives appear without names, working hours or absences. Ask an administrator for the Workforce (read) permission.
          </Notice>
        </div>
      )}

      <section aria-label="Schedule summary" className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label={`Operatives available today${trade ? ` · ${tradeLabel(trade)}` : ""}`}
          value={seesWorkforce ? `${availableToday} / ${activeOps.length}` : "-"}
          hint={seesWorkforce ? (absentCount ? `${absentCount} absent today` : "Nobody absent today") : "Needs Workforce (read)"}
          tone={availableToday < activeOps.length ? "warn" : "ok"}
          href={ctx.can("workforce.read") ? "/workforce" : undefined}
        />
        <Stat
          label={view === "day" ? "Booked vs capacity this week" : "Booked vs capacity"}
          value={
            <span>
              {hoursLabel(weekBooked)}
              <span className="text-base font-normal text-subtle"> / {hoursLabel(weekCapacity)}</span>
            </span>
          }
          hint={<Meter value={weekBooked} max={Math.max(weekCapacity, 0.01)} tone={loadPct > 100 ? "bad" : loadPct > 85 ? "warn" : "accent"} label={`${Math.round(loadPct)}% of working hours booked`} />}
          tone={loadPct > 100 ? "bad" : loadPct > 85 ? "warn" : "accent"}
        />
        <Stat label="Clashing bookings this week" value={clashCount} hint={clashCount ? "Overlaps or work during absence" : "No double bookings"} tone={clashCount ? "bad" : "ok"} />
        <Stat
          label="Unscheduled urgent & emergency"
          value={urgentRes.count ?? 0}
          hint={`${queueRes.count ?? queue.length} jobs waiting in total`}
          tone={(urgentRes.count ?? 0) > 0 ? "bad" : "ok"}
          href={(urgentRes.count ?? 0) > 0 ? href({ priority: "emergency" }) : undefined}
        />
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <ButtonLink href={href({ date: addDays(date, -step) })} size="sm" variant="secondary" className="px-2" aria-label={view === "day" ? "Previous day" : "Previous week"} scroll={false}>
            <ChevronLeft className="size-4" />
          </ButtonLink>
          <ButtonLink href={href({ date: null })} size="sm" variant="secondary" scroll={false}>
            Today
          </ButtonLink>
          <ButtonLink href={href({ date: addDays(date, step) })} size="sm" variant="secondary" className="px-2" aria-label={view === "day" ? "Next day" : "Next week"} scroll={false}>
            <ChevronRight className="size-4" />
          </ButtonLink>
        </div>
        <h2 className="flex min-w-0 items-center gap-2 px-1 text-[15px] font-semibold text-fg">
          <CalendarDays className="size-4 shrink-0 text-accent-hi" aria-hidden />
          <span className="truncate">{title}</span>
        </h2>
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <DateJump value={date} />
          <nav className="hidden h-8 items-center rounded-lg border border-line-strong bg-sunken p-0.5 md:flex" aria-label="View">
            {(["week", "day"] as const).map((v) => (
              <Link
                key={v}
                href={href({ view: v === "week" ? null : "day" })}
                scroll={false}
                aria-current={view === v ? "page" : undefined}
                className={cx("flex h-full items-center rounded-md px-3 text-[13px] font-medium transition-colors", view === v ? "bg-accent-lo text-fg" : "text-muted hover:text-fg")}
              >
                {v === "week" ? "Week" : "Day"}
              </Link>
            ))}
          </nav>
          {view === "week" && <WeekendToggle on={weekend} />}
          <div className="w-full min-w-0 sm:w-48">
            <FilterSelect param="trade" label="Operatives" options={lookups.options("trade")} className="h-8! w-full! min-w-0! rounded-lg text-[13px]" />
          </div>
        </div>
      </div>

      <Planner
        key={`${view}-${weekStart}`}
        config={{ view, date, days, weekStart, today, nowIso: new Date().toISOString(), canEdit, seesWorkforce, focusDay }}
        operatives={operatives}
        subs={subs}
        bookings={bookings}
        absences={absences}
        queue={queue}
        queueTotal={queueRes.count ?? queue.length}
        statuses={statusMap}
        tradeOptions={lookups.options("trade")}
        dayLinks={Object.fromEntries(weekDays.map((d) => [d, href({ view: "day", date: d })]))}
        mobileDayLinks={{ prev: href({ date: addDays(date, -1) }), next: href({ date: addDays(date, 1) }) }}
      />
      <p className="mt-3 text-xs text-subtle">
        Times are UK time (Europe/London).
      </p>
    </>
  );
}
