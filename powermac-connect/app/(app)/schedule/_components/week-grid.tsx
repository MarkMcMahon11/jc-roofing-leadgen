"use client";

import Link from "next/link";
import { useState, type DragEvent, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import { absencesOn, bookedHours, bookingsOn, capacityHours, workWindow } from "../_lib/board";
import { fmtDay, weekdayIndex } from "../_lib/time";
import type { Absence, Booking, Operative, StatusInfo, Sub } from "../_lib/types";
import { AbsenceTag, BookingBlock, LoadBar, OperativeLabel, SubLabel, hatch, type GridApi, type Target } from "./blocks";

type Props = {
  days: string[];
  today: string;
  operatives: Operative[];
  subs: Sub[];
  bookings: Booking[];
  absences: Absence[];
  clashes: Map<string, string[]>;
  statuses: Record<string, StatusInfo>;
  api: GridApi;
  linkPeople: boolean;
  linkSubs: boolean;
};

const LABEL_W = 176;
const DAY_MIN_W = 122;

export function WeekGrid({ days, today, operatives, subs, bookings, absences, clashes, statuses, api, linkPeople, linkSubs }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const cols = `${LABEL_W}px repeat(${days.length}, minmax(${DAY_MIN_W}px, 1fr))`;

  const cell = (key: string, target: Target, children: ReactNode, extra: { className?: string; style?: React.CSSProperties; title?: string; label: string }) => {
    const over = hover === key;
    const onDragOver = (e: DragEvent) => {
      if (!api.drag || !api.canEdit) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (hover !== key) setHover(key);
    };
    return (
      <div
        key={key}
        role="gridcell"
        aria-label={extra.label}
        data-cell={key}
        title={extra.title}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover((h) => (h === key ? null : h));
        }}
        onDrop={(e) => {
          e.preventDefault();
          setHover(null);
          api.place(target);
        }}
        className={cx(
          "relative flex min-h-[118px] min-w-0 flex-col gap-1 border-b border-l border-line/70 p-1.5 transition-colors",
          over && "bg-accent-lo/50 outline-2 -outline-offset-2 outline-accent outline-dashed",
          extra.className,
        )}
        style={extra.style}
      >
        {children}
        {api.pick && api.canEdit && (
          <button
            type="button"
            onClick={() => api.place(target)}
            className="group/place absolute inset-1 z-[2] rounded-lg border border-dashed border-accent/35 text-[11px] font-medium text-accent-hi transition-colors hover:border-accent hover:bg-accent-lo/60 focus-visible:border-accent focus-visible:bg-accent-lo/60"
            aria-label={`Place here: ${extra.label}`}
          >
            <span className="opacity-0 group-hover/place:opacity-100 group-focus-visible/place:opacity-100">Place here</span>
          </button>
        )}
      </div>
    );
  };

  const opRow = (op: Operative) => {
    const mine = bookings.filter((b) => b.employeeId === op.id);
    const weekHours = days.reduce((s, d) => s + bookedHours(mine, d), 0);
    return (
      <div key={op.id} role="row" className="contents">
        <div role="rowheader" className="sticky left-0 z-10 flex items-start border-b border-line/70 bg-surface px-3 pt-3 pb-2">
          <OperativeLabel op={op} weekHours={weekHours} linkable={linkPeople} />
        </div>
        {days.map((d) => {
          const list = bookingsOn(mine, d, () => true);
          const abs = absencesOn(absences, op.id, d);
          const reasons = [...new Set(list.flatMap((b) => clashes.get(b.id) ?? []))];
          const win = workWindow(op, d);
          const cap = capacityHours(op, d, absences);
          const booked = bookedHours(list, d);
          const requestedOnly = abs.length > 0 && abs.every((a) => a.status === "requested");
          const key = `e:${op.id}:${d}`;
          return cell(
            key,
            { employeeId: op.id, subcontractorId: null, date: d },
            <>
              {(abs.length > 0 || reasons.length > 0) && (
                <div className="flex flex-wrap items-center gap-1">
                  {abs.map((a) => (
                    <AbsenceTag key={a.id} a={a} />
                  ))}
                  {reasons.length > 0 && <ClashChip reasons={reasons} />}
                </div>
              )}
              {list.map((b) => (
                <BookingBlock key={b.id} b={b} date={d} colour={op.colour} status={statuses[b.job.status]} clash={clashes.get(b.id)} api={api} />
              ))}
              <LoadBar booked={booked} cap={cap} maxDaily={op.maxDaily} working={Boolean(win)} absent={abs.some((a) => a.status === "approved") && cap === 0} />
            </>,
            {
              label: `${op.name}, ${fmtDay(d)}: ${list.length} booking${list.length === 1 ? "" : "s"}${abs.length ? `, ${abs.map((a) => a.label).join(", ")}` : ""}${reasons.length ? ", clash" : ""}`,
              title: reasons.length ? `Clash:\n${reasons.map((r) => `• ${r}`).join("\n")}` : undefined,
              className: cx(
                d === today && "bg-accent-lo/[0.12]",
                !win && "bg-sunken/70",
                reasons.length > 0 && "outline-2 -outline-offset-2 outline-bad",
                requestedOnly && "shadow-[inset_0_0_0_1px_rgb(138_100_32/0.8)]",
              ),
              style: abs.length ? hatch(requestedOnly) : undefined,
            },
          );
        })}
      </div>
    );
  };

  const subRow = (s: Sub) => {
    const mine = bookings.filter((b) => b.subcontractorId === s.id);
    return (
      <div key={s.id} role="row" className="contents">
        <div role="rowheader" className="sticky left-0 z-10 flex items-start border-b border-line/70 bg-surface px-3 pt-3 pb-2">
          <SubLabel sub={s} linkable={linkSubs} />
        </div>
        {days.map((d) => {
          const list = bookingsOn(mine, d, () => true);
          return cell(
            `s:${s.id}:${d}`,
            { employeeId: null, subcontractorId: s.id, date: d },
            <>
              {list.map((b) => (
                <BookingBlock key={b.id} b={b} date={d} colour="#86918a" status={statuses[b.job.status]} api={api} />
              ))}
            </>,
            { label: `${s.name}, ${fmtDay(d)}: ${list.length} booking${list.length === 1 ? "" : "s"}`, className: cx("min-h-[84px]", d === today && "bg-accent-lo/[0.12]") },
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-h-[calc(100dvh-210px)] min-h-[420px] overflow-auto overscroll-contain" data-testid="week-grid">
      <div role="grid" aria-label="Week planner" className="grid w-full" style={{ gridTemplateColumns: cols, minWidth: LABEL_W + days.length * DAY_MIN_W }}>
        <div role="row" className="contents">
          <div role="columnheader" className="sticky top-0 left-0 z-30 flex items-end border-b border-line bg-sunken px-3 py-2 text-[11px] font-medium tracking-wide text-subtle uppercase">
            Operative
          </div>
          {days.map((d) => {
            const isToday = d === today;
            const weekendDay = weekdayIndex(d) >= 5;
            const href = api.dayHref(d);
            const body = (
              <>
                <span className="flex items-center justify-between gap-1">
                  <span className={cx("text-[11px] font-medium tracking-wide uppercase", isToday ? "text-accent-hi" : "text-subtle")}>{fmtDay(d, { weekday: "short" })}</span>
                  {isToday && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-[#061003]">Today</span>}
                </span>
                <span className={cx("block text-[15px] font-semibold tabular", isToday ? "text-fg" : weekendDay ? "text-muted" : "text-fg")}>{fmtDay(d, { day: "numeric", month: "short" })}</span>
              </>
            );
            return (
              <div key={d} role="columnheader" className={cx("sticky top-0 z-20 border-b border-l border-line bg-sunken", isToday && "bg-[#11240a]")}>
                {href ? (
                  <Link href={href} scroll={false} className="block px-3 py-2 hover:bg-raised" title={`Open ${fmtDay(d)} in the day view`}>
                    {body}
                  </Link>
                ) : (
                  <div className="px-3 py-2">{body}</div>
                )}
              </div>
            );
          })}
        </div>

        <GroupRow label="Operatives" count={operatives.length} />
        {operatives.length === 0 && <EmptyRow>No field operatives match this filter.</EmptyRow>}
        {operatives.map(opRow)}

        {subs.length > 0 && (
          <>
            <GroupRow label="Subcontractors with bookings" count={subs.length} />
            {subs.map(subRow)}
          </>
        )}
      </div>
    </div>
  );
}

function GroupRow({ label, count }: { label: string; count: number }) {
  return (
    <div role="row" className="contents">
      <div role="rowheader" className="col-span-full border-b border-line bg-chrome/80 px-3 pt-3 pb-1.5">
        <span className="sticky left-3 text-[11px] font-semibold tracking-[0.12em] text-accent-hi uppercase">
          {label} <span className="font-normal text-subtle">· {count}</span>
        </span>
      </div>
    </div>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div role="row" className="contents">
      <div role="gridcell" className="col-span-full px-4 py-8 text-center text-sm text-muted">
        {children}
      </div>
    </div>
  );
}

export function ClashChip({ reasons }: { reasons: string[] }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-[#7a2522] bg-bad-lo px-1.5 py-0.5 text-[10.5px] font-semibold text-[#ff8a87]"
      title={`Clash:\n${reasons.map((r) => `• ${r}`).join("\n")}`}
      data-clash
    >
      <TriangleAlert className="size-3" aria-hidden />
      Clash
      <span className="sr-only">: {reasons.join("; ")}</span>
    </span>
  );
}
