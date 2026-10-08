"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarPlus, Hammer, Play, CheckCircle2, Search } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, PageHeader, Plate, Segmented, Stat, Table, Td, Th } from "@/components/admin/ui";
import { JobForm } from "@/components/admin/JobForm";
import { addDays, eachDay, fmtDay, fmtShort, gbp, parseDate, sum, today } from "@/lib/ops/format";
import { jobKind, jobStatus } from "@/lib/ops/labels";
import { crewName, jobIssues, scheduleItems, vanReg, type ScheduleItem } from "@/lib/ops/selectors";
import { setJobStatus } from "@/lib/ops/actions";
import { useOps, type LeadView } from "@/lib/ops/store";
import type { Job, JobKind } from "@/lib/ops/types";

type Tab = "schedule" | "planner" | "all";
type FormState = { job?: Job; lead?: LeadView; kind?: JobKind; prefill?: { date?: string; vanId?: string } } | null;

export default function JobsPage() {
  const { db, biz, mutate } = useOps();
  const [tab, setTab] = useState<Tab>("schedule");
  const [form, setForm] = useState<FormState>(null);
  const [filter, setFilter] = useState<"upcoming" | "in_progress" | "done" | "all">("upcoming");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(60);
  const t = today();

  const items = useMemo(() => scheduleItems(db, biz.leads, t, addDays(t, 13)), [db, biz.leads, t]);
  const overdue = db.jobs.filter((j) => (j.status === "scheduled" || j.status === "in_progress") && (j.endDate ?? j.date) < t);
  // a job that started earlier and is still running is listed under today
  const dayOf = (i: ScheduleItem) => (i.date < t ? t : i.date);
  const days = [...new Set(items.map(dayOf))];
  const todayItems = items.filter((i) => i.date <= t).length;
  const inProgress = db.jobs.filter((j) => j.kind === "job" && j.status === "in_progress").length;
  const booked = sum(db.jobs.filter((j) => j.kind === "job" && (j.status === "scheduled" || j.status === "in_progress")).map((j) => j.value ?? 0));

  function edit(it: ScheduleItem) {
    if (it.jobId) setForm({ job: db.jobs.find((j) => j.id === it.jobId) });
    else if (it.leadId) setForm({ lead: biz.leads.find((l) => l.id === it.leadId), kind: "inspection" });
  }

  const allJobs = db.jobs
    .filter((j) => (filter === "all" ? true : filter === "upcoming" ? j.status === "scheduled" : j.status === filter))
    .filter((j) => !q || `${j.title} ${j.customer ?? ""} ${j.address}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (filter === "done" || filter === "all" ? (a.date < b.date ? 1 : -1) : a.date < b.date ? -1 : 1));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs and schedule"
        sub="Inspections and roofing jobs, with the vans and crew sent"
        actions={
          <>
            <Button variant="secondary" onClick={() => setForm({ kind: "inspection" })}><CalendarPlus size={16} /> New inspection</Button>
            <Button onClick={() => setForm({ kind: "job" })}><Hammer size={16} /> New job</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Stat label="Today" value={todayItems} sub="visits and jobs" />
        <Stat label="Next 14 days" value={items.length} sub={`${items.filter((i) => i.kind === "inspection").length} inspections · ${items.filter((i) => i.kind === "job").length} jobs`} />
        <Stat label="Jobs in progress" value={inProgress} tone={inProgress ? "warn" : undefined} />
        <Stat label="Booked work" value={gbp(booked)} sub="Scheduled and in progress" tone="good" />
      </div>

      {overdue.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader title="Needs updating" sub="These dates have passed but they aren't marked done" />
          <ul className="divide-y divide-silver">
            {overdue.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0 flex-1"><b>{j.title}</b> <span className="text-steel">· {j.customer ?? j.address} · {fmtDay(j.endDate ?? j.date)}</span></span>
                <Button size="sm" onClick={() => mutate((d) => setJobStatus(d, j.id, "done"))}><CheckCircle2 size={14} /> Mark done</Button>
                <Button size="sm" variant="secondary" onClick={() => setForm({ job: j })}>Edit</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Segmented
        value={tab}
        onChange={setTab}
        options={[{ value: "schedule", label: "Schedule" }, { value: "planner", label: "Van planner" }, { value: "all", label: "All jobs", count: db.jobs.length }]}
      />

      {tab === "schedule" && (
        <div className="space-y-4">
          {days.length === 0 && <Card><Empty>Nothing booked in the next 14 days. Add an inspection or a job to get started.</Empty></Card>}
          {days.map((day) => (
            <Card key={day}>
              <CardHeader title={day === t ? `Today, ${fmtDay(day)}` : fmtDay(day)} sub={`${items.filter((i) => dayOf(i) === day).length} booked`} />
              <ul className="divide-y divide-silver">
                {items.filter((i) => dayOf(i) === day).map((it) => {
                  const job = it.jobId ? db.jobs.find((j) => j.id === it.jobId) : undefined;
                  const issues = job ? jobIssues(db, job) : [];
                  return (
                    <li key={it.key} className="px-5 py-3">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="w-14 shrink-0 text-sm font-semibold tabular-nums">{it.time ?? <span className="text-xs font-normal text-steel">all day</span>}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{it.title}</span>
                            <Badge tone={it.kind === "inspection" ? "amber" : "blue"}>{jobKind[it.kind]}</Badge>
                            {job && <Badge tone={jobStatus[job.status].tone}>{jobStatus[job.status].label}</Badge>}
                            {it.endDate && <span className="text-xs text-steel">{it.date < t ? `since ${fmtShort(it.date)} · ` : ""}until {fmtShort(it.endDate)}</span>}
                          </div>
                          <div className="text-sm text-steel">{it.customer ? `${it.customer} · ` : ""}{it.address}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                            {it.vanIds.map((id) => <Plate key={id}>{vanReg(db, id)}</Plate>)}
                            {it.crewIds.length > 0 && <span className="text-steel">{it.crewIds.map((id) => crewName(db, id)).join(", ")}</span>}
                            {it.vanIds.length === 0 && it.crewIds.length === 0 && <span className="text-steel">No van or crew assigned</span>}
                            {it.value ? <span className="font-semibold">{gbp(it.value)}</span> : null}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {job && job.kind === "job" && job.status === "scheduled" && it.date <= t && (
                            <Button size="sm" onClick={() => mutate((d) => setJobStatus(d, job.id, "in_progress"))}><Play size={14} /> Start</Button>
                          )}
                          {job && job.status === "in_progress" && <Button size="sm" onClick={() => mutate((d) => setJobStatus(d, job.id, "done"))}><CheckCircle2 size={14} /> Finish</Button>}
                          {job && job.kind === "inspection" && job.status === "scheduled" && it.date <= t && (
                            <Button size="sm" variant="secondary" onClick={() => mutate((d) => setJobStatus(d, job.id, "done"))}><CheckCircle2 size={14} /> Done</Button>
                          )}
                          <Button size="sm" variant="secondary" onClick={() => edit(it)}>{job ? "Edit" : "Assign van and crew"}</Button>
                        </div>
                      </div>
                      {issues.length > 0 && (
                        <ul className="mt-2 space-y-0.5 rounded-xl bg-brand-tint px-3 py-2 text-xs text-brand">
                          {issues.map((x) => <li key={x} className="flex gap-1.5"><AlertTriangle size={13} aria-hidden className="mt-0.5 shrink-0" /> {x}</li>)}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {tab === "planner" && <Planner onOpen={setForm} />}

      {tab === "all" && (
        <>
          <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-center @3xl:justify-between">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "upcoming", label: "Upcoming", count: db.jobs.filter((j) => j.status === "scheduled").length },
                { value: "in_progress", label: "In progress", count: db.jobs.filter((j) => j.status === "in_progress").length },
                { value: "done", label: "Done", count: db.jobs.filter((j) => j.status === "done").length },
                { value: "all", label: "All" },
              ]}
            />
            <div className="relative @3xl:w-64">
              <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-steel" />
              <input aria-label="Search jobs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, customer or address" className="min-h-11 w-full rounded-xl border-[1.5px] border-ctrl bg-surface py-2 pl-9 pr-3 text-base outline-none focus:border-night" />
            </div>
          </div>
          <Card>
            <Table minWidth={760}>
              <thead>
                <tr><Th>When</Th><Th>Job</Th><Th>Vans</Th><Th>Crew</Th><Th right>Price</Th><Th>Status</Th></tr>
              </thead>
              <tbody>
                {allJobs.slice(0, limit).map((j) => (
                  <tr key={j.id} onClick={() => setForm({ job: j })} className="cursor-pointer hover:bg-silver-soft">
                    <Td className="whitespace-nowrap text-xs">{fmtDay(j.date)}{j.endDate ? ` → ${fmtShort(j.endDate)}` : ""}{j.time ? ` ${j.time}` : ""}</Td>
                    <Td>
                      <button type="button" onClick={() => setForm({ job: j })} className="min-h-10 text-left">
                        <span className="block font-medium">{j.title}</span>
                        <span className="block max-w-[18rem] truncate text-xs text-steel">{jobKind[j.kind]} · {j.customer ? `${j.customer} · ` : ""}{j.address}</span>
                      </button>
                    </Td>
                    <Td><div className="flex flex-wrap gap-1">{j.vanIds.map((id) => <Plate key={id}>{vanReg(db, id)}</Plate>)}</div></Td>
                    <Td className="text-xs">{j.crewIds.map((id) => crewName(db, id).split(" ")[0]).join(", ")}</Td>
                    <Td right>{j.value ? gbp(j.value) : <span className="text-steel">—</span>}</Td>
                    <Td><Badge tone={jobStatus[j.status].tone}>{jobStatus[j.status].label}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {allJobs.length === 0 && <Empty>No jobs here.</Empty>}
            {allJobs.length > limit && <div className="p-4 text-center"><Button variant="secondary" onClick={() => setLimit(limit + 60)}>Show more ({allJobs.length - limit} left)</Button></div>}
          </Card>
        </>
      )}

      {form && <JobForm key={form.job?.id ?? form.lead?.id ?? form.kind ?? "new"} open job={form.job} lead={form.lead} kind={form.kind ?? form.job?.kind} prefill={form.prefill} onClose={() => setForm(null)} />}
    </div>
  );
}

/** Vans down the side, the next two weeks across: who is where, and which vans are free. */
function Planner({ onOpen }: { onOpen: (f: FormState) => void }) {
  const { db } = useOps();
  const t = today();
  const days = eachDay(t, addDays(t, 13));
  const vans = db.vehicles;

  return (
    <Card>
      <CardHeader title="Van planner" sub="Next 14 days. Tap an empty day to book that van, or a booking to edit it." />
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-silver px-5 py-2 text-xs text-steel">
        {[["bg-sky-100 border-l-4 border-sky-600", "Job"], ["bg-orange-100 border-l-4 border-orange-600", "Job in progress"], ["bg-amber-50 border-l-4 border-dashed border-amber-500", "Inspection"], ["bg-emerald-50 border-l-4 border-emerald-600", "Done"], ["bg-red-100 ring-1 ring-inset ring-red-300", "Garage"], ["bg-stone-200", "Off the road"]].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5"><span aria-hidden className={`h-4 w-5 rounded-sm ${c}`} />{l}</span>
        ))}
        <span className="flex items-center gap-1.5"><span aria-hidden className="font-bold text-brand">⚠</span>Has a warning</span>
      </div>
      <div className="scroll-x">
        <table className="w-full border-collapse text-xs" style={{ minWidth: 900, tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 w-24 border-b border-silver bg-surface px-2 py-2 text-left font-semibold text-steel sm:w-36 sm:px-3">Van</th>
              {days.map((d) => {
                const wk = [0, 6].includes(parseDate(d).getDay());
                return (
                  <th key={d} scope="col" className={`border-b border-silver px-1 py-2 text-center font-semibold ${wk ? "bg-silver-soft/70 text-steel" : "text-night"} ${d === t ? "text-brand" : ""}`}>
                    <div>{parseDate(d).toLocaleDateString("en-GB", { weekday: "short" })}</div>
                    <div className="font-normal">{fmtShort(d)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {vans.map((v) => (
              <tr key={v.id}>
                <th scope="row" className="sticky left-0 z-10 border-b border-silver bg-surface px-2 py-2 text-left font-normal sm:px-3">
                  <Plate>{v.reg}</Plate>
                  <div className="mt-0.5 hidden truncate text-steel sm:block">{v.make} {v.model}</div>
                </th>
                {days.map((d) => {
                  const wk = [0, 6].includes(parseDate(d).getDay());
                  const here = db.jobs.filter((j) => j.status !== "cancelled" && j.vanIds.includes(v.id) && j.date <= d && (j.endDate ?? j.date) >= d);
                  const garage = db.maintenance.some((m) => m.vehicleId === v.id && m.status !== "done" && (m.status === "in_progress" ? d === t : m.openedAt === d));
                  const off = v.status === "off_road";
                  const job = here[0];
                  return (
                    <td key={d} className={`h-14 border-b border-l border-silver p-0.5 align-top ${wk ? "bg-silver-soft/70" : ""}`}>
                      {garage ? (
                        <div className="h-full min-h-[3rem] rounded bg-red-100 px-1 py-0.5 text-[11px] font-semibold text-red-900 ring-1 ring-inset ring-red-300" title="In the garage">Garage</div>
                      ) : job ? (
                        <button
                          type="button"
                          onClick={() => onOpen({ job })}
                          title={`${job.title}${job.customer ? `, ${job.customer}` : ""}${here.length > 1 ? ` (+${here.length - 1} more)` : ""}`}
                          className={`h-full min-h-[3rem] w-full overflow-hidden rounded px-1 py-0.5 text-left text-[11px] font-medium leading-tight ${job.kind === "inspection" ? "border-l-4 border-dashed border-amber-500 bg-amber-50 text-amber-900" : job.status === "done" ? "border-l-4 border-emerald-600 bg-emerald-50 text-emerald-900" : job.status === "in_progress" ? "border-l-4 border-orange-600 bg-orange-100 text-orange-900" : "border-l-4 border-sky-600 bg-sky-100 text-sky-900"}`}
                        >
                          {jobIssues(db, job).length > 0 && <span className="mr-0.5 font-bold text-brand" title="Has a warning">⚠</span>}{job.time ? `${job.time} ` : ""}{job.customer ?? job.title}
                          {here.length > 1 && <span className="block text-[10px] opacity-80">+{here.length - 1} more</span>}
                        </button>
                      ) : off ? (
                        <div className="h-full min-h-[3rem] rounded bg-stone-200" title="Off the road" />
                      ) : (
                        <button type="button" onClick={() => onOpen({ kind: "job", prefill: { date: d, vanId: v.id } })} aria-label={`Book ${v.reg} on ${fmtDay(d)}`} className="h-full min-h-[3rem] w-full rounded text-ctrl hover:bg-silver-soft hover:text-night">+</button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {vans.length === 0 && <Empty>Add your vans to see the planner.</Empty>}
    </Card>
  );
}
