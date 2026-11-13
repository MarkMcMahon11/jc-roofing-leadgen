"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeft, ChevronRight, PlusCircle } from "lucide-react";
import { Card, Select, buttonClass, cx } from "@/components/ui/primitives";
import { date as fmtDate, label } from "@/lib/format";
import { absencesOn, bookedHours, bookingsOn, capacityHours, workWindow } from "../_lib/board";
import { fmtDay } from "../_lib/time";
import type { Absence, Booking, Operative, QueueJob, StatusInfo, Sub } from "../_lib/types";
import { AbsenceTag, BookingBlock, LoadBar, OperativeLabel, SubLabel, type GridApi } from "./blocks";
import { Recommendations, SlotFields, defaultMinutes, type Slot } from "./recommendations";
import { ClashChip } from "./week-grid";

type Props = {
  date: string;
  today: string;
  operatives: Operative[];
  subs: Sub[];
  bookings: Booking[];
  absences: Absence[];
  clashes: Map<string, string[]>;
  statuses: Record<string, StatusInfo>;
  queue: QueueJob[];
  api: GridApi;
  busy: boolean;
  links: { prev: string; next: string };
  linkPeople: boolean;
  linkSubs: boolean;
  tradeLabel: (k: string) => string;
  onBook: (jobId: string, resource: { employeeId: string | null; subcontractorId: string | null }, slot: Slot) => void;
};

/** Phones: one day as a list per operative, booking through select menus (no drag and drop). */
export function MobileAgenda(props: Props) {
  const { date, today, operatives, subs, bookings, absences, clashes, statuses, api, links, linkPeople, linkSubs } = props;
  return (
    <div className="grid gap-4" data-testid="mobile-agenda">
      {api.canEdit && <AssignCard {...props} />}

      <div className="flex items-center justify-between gap-2">
        <Link href={links.prev} scroll={false} className={buttonClass("secondary", "sm", "px-2")} aria-label="Previous day">
          <ChevronLeft className="size-4" />
        </Link>
        <h2 className="text-center text-[15px] font-semibold text-fg">
          {fmtDay(date, { weekday: "long", day: "numeric", month: "long" })}
          {date === today && <span className="ml-2 rounded-full bg-accent px-1.5 py-px align-middle text-[10px] font-semibold text-white">Today</span>}
        </h2>
        <Link href={links.next} scroll={false} className={buttonClass("secondary", "sm", "px-2")} aria-label="Next day">
          <ChevronRight className="size-4" />
        </Link>
      </div>

      <ul className="grid gap-2.5">
        {operatives.map((op) => {
          const list = bookingsOn(bookings, date, (b) => b.employeeId === op.id);
          const abs = absencesOn(absences, op.id, date);
          const reasons = [...new Set(list.flatMap((b) => clashes.get(b.id) ?? []))];
          return (
            <li key={op.id}>
              <Card className={cx("p-3", reasons.length > 0 && "border-bad/70")}>
                <div className="flex items-start justify-between gap-3">
                  <OperativeLabel op={op} linkable={linkPeople} />
                  {reasons.length > 0 && <ClashChip reasons={reasons} />}
                </div>
                {abs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {abs.map((a) => (
                      <AbsenceTag key={a.id} a={a} />
                    ))}
                  </div>
                )}
                <div className="mt-2 grid gap-1.5">
                  {list.length === 0 ? (
                    <p className="text-xs text-subtle">{workWindow(op, date) || op.restricted ? "Nothing booked" : "Day off"}</p>
                  ) : (
                    list.map((b) => <BookingBlock key={b.id} b={b} date={date} colour={op.colour} status={statuses[b.job.status]} clash={clashes.get(b.id)} api={api} variant="agenda" />)
                  )}
                </div>
                {!op.restricted && (
                  <div className="mt-2">
                    <LoadBar booked={bookedHours(list, date)} cap={capacityHours(op, date, absences)} maxDaily={op.maxDaily} working={Boolean(workWindow(op, date))} />
                  </div>
                )}
              </Card>
            </li>
          );
        })}
        {subs.map((s) => {
          const list = bookingsOn(bookings, date, (b) => b.subcontractorId === s.id);
          if (!list.length) return null;
          return (
            <li key={s.id}>
              <Card className="p-3">
                <SubLabel sub={s} linkable={linkSubs} />
                <div className="mt-2 grid gap-1.5">
                  {list.map((b) => (
                    <BookingBlock key={b.id} b={b} date={date} colour="#8090ab" status={statuses[b.job.status]} api={api} variant="agenda" />
                  ))}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AssignCard({ date, operatives, subs, queue, busy, tradeLabel, onBook, api }: Props) {
  const [jobId, setJobId] = useState("");
  const [resource, setResource] = useState("");
  const [slot, setSlot] = useState<Slot>({ date, start: 8 * 60, minutes: 120 });
  const job = queue.find((j) => j.id === jobId) ?? null;
  const book = (r: string) => {
    if (!job || !r) return;
    const [kind, id] = r.split(":");
    onBook(job.id, { employeeId: kind === "e" ? id : null, subcontractorId: kind === "s" ? id : null }, slot);
  };
  return (
    <Card className="p-4" aria-label="Assign a job">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
        <PlusCircle className="size-4 text-accent-hi" aria-hidden />
        Assign a job
      </h2>
      <div className="mt-3 grid gap-3">
        <div>
          <label htmlFor="m-job" className="mb-1 block text-[11.5px] font-medium text-subtle">
            Unscheduled job
          </label>
          <Select
            id="m-job"
            value={jobId}
            onChange={(e) => {
              setJobId(e.target.value);
              const j = queue.find((x) => x.id === e.target.value);
              if (j) setSlot((s) => ({ ...s, minutes: defaultMinutes(j.estimatedHours) }));
            }}
          >
            <option value="">Choose a job ({queue.length} waiting)…</option>
            {queue.map((j) => (
              <option key={j.id} value={j.id}>
                {j.reference} · {label(j.priority)} · {j.title}
              </option>
            ))}
          </Select>
          {job && (
            <p className="mt-1.5 text-xs text-muted">
              {job.tradeLabel}
              {job.postcode ? ` · ${job.postcode}` : ""}
              {job.estimatedHours !== null ? ` · ${job.estimatedHours.toFixed(1)} h est.` : ""}
              {job.targetCompletion ? ` · due ${fmtDate(job.targetCompletion)}` : ""}
            </p>
          )}
        </div>
        <SlotFields slot={slot} onChange={setSlot} idPrefix="m-slot" />
        <div>
          <label htmlFor="m-who" className="mb-1 block text-[11.5px] font-medium text-subtle">
            Operative
          </label>
          <Select id="m-who" value={resource} onChange={(e) => setResource(e.target.value)}>
            <option value="">Choose who…</option>
            <optgroup label="Operatives">
              {operatives.map((o) => (
                <option key={o.id} value={`e:${o.id}`}>
                  {o.name}
                  {!o.restricted ? ` · ${o.tradeLabel}` : ""}
                </option>
              ))}
            </optgroup>
            {subs.length > 0 && (
              <optgroup label="Subcontractors">
                {subs.map((s) => (
                  <option key={s.id} value={`s:${s.id}`}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </div>
        <button type="button" disabled={!job || !resource || busy || !api.canEdit} onClick={() => book(resource)} className={buttonClass("primary", "md", "w-full")}>
          Check clashes &amp; book
        </button>
        {job && (
          <div className="border-t border-line pt-3">
            <Recommendations job={job} slot={slot} canEdit={api.canEdit} tradeLabel={tradeLabel} busy={busy} onBook={(emp) => book(`e:${emp}`)} />
          </div>
        )}
      </div>
    </Card>
  );
}

