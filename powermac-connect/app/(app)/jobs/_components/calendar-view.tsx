import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass, Card, cx } from "@/components/ui/primitives";
import { initials } from "@/lib/format";
import type { ServerClient } from "@/lib/supabase/server";
import { filterQuery, jobQuery, type JobFilters } from "../_lib/filters";
import { addDays, fromLondon, londonDate, londonTime, weekdayIndex } from "../_lib/time";

type Row = {
  id: string;
  reference: string;
  title: string;
  status: string;
  priority: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  job_assignments: {
    id: string;
    status: string;
    employee_id: string | null;
    scheduled_start: string;
    scheduled_end: string;
    employees: { first_name: string; last_name: string; colour: string } | null;
    subcontractors: { company_name: string } | null;
  }[];
};
type Event = { key: string; jobId: string; reference: string; title: string; time: string; sortKey: string; who: { initials: string; colour: string; name: string } | null; colour: string; priority: string };

const SELECT =
  "id, reference, title, status, priority, scheduled_start, scheduled_end, job_assignments(id, status, employee_id, scheduled_start, scheduled_end, employees(first_name, last_name, colour), subcontractors(company_name))";
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthName = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export function parseMonth(v: string | undefined) {
  return v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : londonDate().slice(0, 7);
}
function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function CalendarView({
  supabase,
  tenantId,
  filters,
  openKeys,
  month,
  colourOf,
}: {
  supabase: ServerClient;
  tenantId: string;
  filters: JobFilters;
  openKeys: string[];
  month: string;
  colourOf: Record<string, string>;
}) {
  const first = `${month}-01`;
  const gridStart = addDays(first, -weekdayIndex(first));
  const nextMonthFirst = `${shiftMonth(month, 1)}-01`;
  const weeks = Math.ceil((weekdayIndex(first) + daysBetween(first, nextMonthFirst)) / 7);
  const gridEnd = addDays(gridStart, weeks * 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));

  const { data } = await jobQuery(supabase, tenantId, SELECT, filters, openKeys)
    .lt("scheduled_start", fromLondon(gridEnd)!.toISOString())
    .gt("scheduled_end", fromLondon(gridStart)!.toISOString())
    .order("scheduled_start")
    .limit(2000);
  const rows = (data ?? []) as unknown as Row[];

  const byDay = new Map<string, Event[]>();
  const push = (day: string, e: Event) => {
    if (day < gridStart || day >= gridEnd) return;
    byDay.set(day, [...(byDay.get(day) ?? []), e]);
  };
  for (const r of rows) {
    const live = r.job_assignments.filter((a) => a.status !== "cancelled" && (!filters.assignee || a.employee_id === filters.assignee));
    if (live.length) {
      for (const a of live) {
        const name = a.employees ? `${a.employees.first_name} ${a.employees.last_name}` : (a.subcontractors?.company_name ?? "");
        const startDay = londonDate(a.scheduled_start);
        const endDay = londonDate(new Date(new Date(a.scheduled_end).getTime() - 1));
        for (let d = startDay, i = 0; d <= endDay && i < 14; d = addDays(d, 1), i++) {
          push(d, {
            key: `${a.id}-${d}`,
            jobId: r.id,
            reference: r.reference,
            title: r.title,
            time: d === startDay ? londonTime(a.scheduled_start) : "cont.",
            sortKey: d === startDay ? londonTime(a.scheduled_start) : "00:00",
            who: name ? { initials: initials(name), colour: a.employees?.colour ?? "#8b5cf6", name } : null,
            colour: colourOf[r.status] ?? "#64748b",
            priority: r.priority,
          });
        }
      }
    } else if (r.scheduled_start && !filters.assignee) {
      push(londonDate(r.scheduled_start), {
        key: r.id,
        jobId: r.id,
        reference: r.reference,
        title: r.title,
        time: londonTime(r.scheduled_start),
        sortKey: londonTime(r.scheduled_start),
        who: null,
        colour: colourOf[r.status] ?? "#64748b",
        priority: r.priority,
      });
    }
  }
  for (const list of byDay.values()) list.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const today = londonDate();
  const nav = (m: string) => `/jobs${filterQuery(filters, { view: "calendar", month: m })}`;
  const monthDays = days.filter((d) => d.startsWith(month));
  const total = monthDays.reduce((n, d) => n + (byDay.get(d)?.length ?? 0), 0);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="mr-auto text-[15px] font-semibold text-fg">
          {monthName(month)}
          <span className="ml-2 text-xs font-normal text-subtle">{total} scheduled visit{total === 1 ? "" : "s"}</span>
        </h2>
        <Link href={nav(shiftMonth(month, -1))} scroll={false} className={buttonClass("secondary", "sm")} aria-label="Previous month">
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <Link href={nav(today.slice(0, 7))} scroll={false} className={buttonClass("secondary", "sm")}>
          This month
        </Link>
        <Link href={nav(shiftMonth(month, 1))} scroll={false} className={buttonClass("secondary", "sm")} aria-label="Next month">
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>

      {/* month grid (tablet and desktop) */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 border-b border-line bg-sunken/80 text-xs font-medium tracking-wide text-subtle uppercase">
          {DOW.map((d) => (
            <div key={d} className="px-2 py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const events = byDay.get(d) ?? [];
            const inMonth = d.startsWith(month);
            return (
              <div key={d} className={cx("min-h-32 min-w-0 border-r border-b border-line/70 p-1.5 [&:nth-child(7n)]:border-r-0", !inMonth && "bg-sunken/40")}>
                <div className="mb-1 flex items-center justify-between">
                  <Link
                    href={`/schedule?date=${d}`}
                    className={cx(
                      "flex size-6 items-center justify-center rounded-full text-xs tabular hover:bg-raised",
                      d === today ? "bg-accent font-semibold text-white hover:bg-accent" : inMonth ? "text-fg" : "text-subtle",
                    )}
                    title={`Open the schedule for ${d}`}
                  >
                    {Number(d.slice(8))}
                  </Link>
                  {events.length > 0 && <span className="text-[10.5px] text-subtle tabular">{events.length}</span>}
                </div>
                <ul className="grid gap-1">
                  {events.slice(0, 3).map((e) => (
                    <EventChip key={e.key} e={e} />
                  ))}
                </ul>
                {events.length > 3 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer list-none rounded px-1 text-[11px] font-medium text-accent-hi hover:bg-raised">+{events.length - 3} more</summary>
                    <ul className="mt-1 grid gap-1">
                      {events.slice(3).map((e) => (
                        <EventChip key={e.key} e={e} />
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* agenda (phones) */}
      <div className="divide-y divide-line md:hidden">
        {monthDays.filter((d) => byDay.get(d)?.length).length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">Nothing scheduled this month.</p>}
        {monthDays
          .filter((d) => byDay.get(d)?.length)
          .map((d) => (
            <div key={d} className="px-4 py-3">
              <Link href={`/schedule?date=${d}`} className={cx("mb-2 block text-xs font-semibold tracking-wide uppercase", d === today ? "text-accent-hi" : "text-subtle")}>
                {new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
              </Link>
              <ul className="grid gap-1.5">
                {byDay.get(d)!.map((e) => (
                  <EventChip key={e.key} e={e} roomy />
                ))}
              </ul>
            </div>
          ))}
      </div>
    </Card>
  );
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function EventChip({ e, roomy }: { e: Event; roomy?: boolean }) {
  return (
    <li>
      <Link
        href={`/jobs/${e.jobId}`}
        title={`${e.reference} · ${e.title}${e.who ? ` · ${e.who.name}` : ""}`}
        className={cx("flex items-center gap-1.5 rounded-md border-l-[3px] bg-raised/70 px-1.5 hover:bg-raised", roomy ? "py-1.5 text-[13px]" : "py-0.5 text-[11px]")}
        style={{ borderLeftColor: e.colour }}
      >
        <span className="shrink-0 text-subtle tabular">{e.time}</span>
        <span className="min-w-0 flex-1 truncate text-fg">
          {roomy && <span className="mr-1 font-mono text-[12px] text-accent-hi">{e.reference}</span>}
          {roomy ? e.title : e.reference}
        </span>
        {e.who && (
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold text-white" style={{ backgroundColor: e.who.colour }} aria-label={e.who.name}>
            {e.who.initials}
          </span>
        )}
      </Link>
    </li>
  );
}
