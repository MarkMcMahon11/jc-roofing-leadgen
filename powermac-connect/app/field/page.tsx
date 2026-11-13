import Link from "next/link";
import { AlertTriangle, ChevronRight, MapPin } from "lucide-react";
import { requireTenant } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { addDaysISO, time, todayISO } from "@/lib/format";
import { cx } from "@/components/ui/primitives";

const ASSIGNMENT: Record<string, string> = { scheduled: "Booked", accepted: "Accepted", travelling: "On the way", on_site: "On site", paused: "Paused", completed: "Done", no_access: "No access" };

export default async function FieldHome({ searchParams }: PageProps<"/field">) {
  const ctx = await requireTenant();
  const sp = await searchParams;
  const today = todayISO();
  const day = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("field_my_jobs", { p_tenant: ctx.tenantId, p_from: day, p_to: day });
  const { data: week } = await supabase.rpc("field_my_jobs", { p_tenant: ctx.tenantId, p_from: addDaysISO(day, 1), p_to: addDaysISO(day, 7) });
  const jobs = data ?? [];
  const label = day === today ? "Today" : day === addDaysISO(today, 1) ? "Tomorrow" : new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });
  const done = jobs.filter((j) => j.assignment_status === "completed").length;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <Link href={`/field?date=${addDaysISO(day, -1)}`} className="rounded-xl border border-line px-4 py-3 text-sm text-muted active:bg-raised" aria-label="Previous day">‹</Link>
        <div className="text-center">
          <h1 className="text-xl font-semibold">{label}</h1>
          <p className="text-xs text-subtle">{jobs.length} job{jobs.length === 1 ? "" : "s"} · {done} done</p>
        </div>
        <Link href={`/field?date=${addDaysISO(day, 1)}`} className="rounded-xl border border-line px-4 py-3 text-sm text-muted active:bg-raised" aria-label="Next day">›</Link>
      </div>
      {error && <p className="rounded-xl border border-[#5a1f1d] bg-bad-lo p-4 text-sm text-[#ffb3b1]">Your jobs could not be loaded. Pull to refresh or try again shortly.</p>}
      {jobs.length === 0 && !error && <p className="rounded-2xl border border-line bg-surface p-8 text-center text-muted">No jobs booked for {label.toLowerCase()}.</p>}
      <ul className="space-y-3">
        {jobs.map((j) => (
          <li key={j.assignment_id}>
            <Link href={`/field/${j.assignment_id}`} className={cx("block rounded-2xl border bg-surface p-4 active:bg-raised", j.priority === "emergency" ? "border-[#5a1f1d]" : "border-line", j.assignment_status === "completed" && "opacity-60")}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-accent-hi tabular">{time(j.scheduled_start)} – {time(j.scheduled_end)}</span>
                <span className={cx("rounded-full px-2 py-0.5 font-medium", j.assignment_status === "on_site" ? "bg-accent text-white" : "bg-raised text-muted")}>{ASSIGNMENT[j.assignment_status] ?? j.assignment_status}</span>
              </div>
              <div className="mt-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base leading-snug font-semibold">{j.title}</div>
                  <div className="mt-1 flex items-center gap-1 text-sm text-muted"><MapPin className="size-3.5 shrink-0" aria-hidden /><span className="truncate">{j.address}, {j.postcode}</span></div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded bg-raised px-1.5 py-0.5 font-mono text-subtle">{j.reference}</span>
                    {j.priority !== "routine" && <span className={cx("rounded px-1.5 py-0.5 font-medium capitalize", j.priority === "emergency" ? "bg-bad-lo text-[#ff8a87]" : j.priority === "urgent" ? "bg-warn-lo text-[#ffc56b]" : "bg-raised text-muted")}>{j.priority}</span>}
                    {(j.hazards ?? []).length > 0 && <span className="flex items-center gap-1 rounded bg-warn-lo px-1.5 py-0.5 text-[#ffc56b]"><AlertTriangle className="size-3" aria-hidden />{(j.hazards ?? []).join(", ").replace(/_/g, " ")}</span>}
                  </div>
                </div>
                <ChevronRight className="mt-1 size-5 shrink-0 text-subtle" aria-hidden />
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {(week ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-muted">Coming up</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {(week ?? []).slice(0, 8).map((j) => (
              <li key={j.assignment_id}>
                <Link href={`/field/${j.assignment_id}`} className="flex items-center gap-3 px-4 py-3 text-sm active:bg-raised">
                  <span className="w-20 shrink-0 text-xs text-subtle">{new Date(j.scheduled_start).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "Europe/London" })} {time(j.scheduled_start)}</span>
                  <span className="min-w-0 flex-1 truncate">{j.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
