"use client";

import { useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { cx } from "@/components/ui/primitives";
import { absencesOn, absenceName, assignLanes, bookedHours, bookingsOn, capacityHours, workWindow } from "../_lib/board";
import { hhmm, londonParts } from "../_lib/time";
import type { Absence, Booking, Operative, StatusInfo, Sub } from "../_lib/types";
import { BookingBlock, LoadBar, OperativeLabel, SubLabel, hatch, type GridApi, type Target } from "./blocks";
import { ClashChip } from "./week-grid";

export const DAY_START = 7 * 60;
export const DAY_END = 19 * 60;
const SPAN = DAY_END - DAY_START;
const SLOTS = SPAN / 30;
const LABEL_W = 176;
const SLOT_MIN_W = 26;
const LANE_H = 40;

const pct = (min: number) => ((Math.min(DAY_END, Math.max(DAY_START, min)) - DAY_START) / SPAN) * 100;

/** Minutes after midnight on `date`, clipped to that day. */
function onDay(iso: string, date: string, edge: "start" | "end") {
  const p = londonParts(iso);
  if (p.date < date) return 0;
  if (p.date > date) return 1440;
  return edge === "end" && p.minutes === 0 ? 0 : p.minutes;
}

const gridLines: CSSProperties = {
  backgroundImage: "linear-gradient(to right, rgb(44 58 88 / 0.75) 1px, transparent 1px), linear-gradient(to right, rgb(31 42 66 / 0.55) 1px, transparent 1px)",
  backgroundSize: `calc(100% / ${SLOTS / 2}) 100%, calc(100% / ${SLOTS}) 100%`,
};

type Props = {
  date: string;
  today: string;
  nowIso: string;
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

export function DayGrid({ date, today, nowIso, operatives, subs, bookings, absences, clashes, statuses, api, linkPeople, linkSubs }: Props) {
  const [hover, setHover] = useState<{ key: string; slot: number } | null>(null);
  const now = londonParts(nowIso);
  const nowMin = date === today && now.date === today && now.minutes >= DAY_START && now.minutes <= DAY_END ? now.minutes : null;

  const slotAt = (e: DragEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(SLOTS - 1, Math.floor(((e.clientX - r.left) / r.width) * SLOTS)));
  };

  const timeline = (key: string, name: string, base: Omit<Target, "minutes">, list: Booking[], colour: string, extras: { op?: Operative; abs?: Absence[] }) => {
    const { lane, count } = assignLanes(list);
    const height = Math.max(64, count * LANE_H + 16);
    const win = extras.op ? workWindow(extras.op, date) : undefined;
    const preview = hover?.key === key && api.drag ? hover.slot : null;
    return (
      <div
        role="gridcell"
        aria-label={`${name}: ${list.length} booking${list.length === 1 ? "" : "s"}`}
        data-timeline={key}
        className={cx("relative border-b border-l border-line/70", preview !== null && "bg-accent-lo/20")}
        style={{ ...gridLines, height }}
        onDragOver={(e) => {
          if (!api.drag || !api.canEdit) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const s = slotAt(e);
          if (hover?.key !== key || hover.slot !== s) setHover({ key, slot: s });
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover((h) => (h?.key === key ? null : h));
        }}
        onDrop={(e) => {
          e.preventDefault();
          const s = slotAt(e);
          setHover(null);
          api.place({ ...base, minutes: DAY_START + s * 30 });
        }}
      >
        {/* outside working hours */}
        {win === null && <div className="pointer-events-none absolute inset-0 bg-sunken/70" aria-hidden />}
        {win && win.start > DAY_START && <div className="pointer-events-none absolute inset-y-0 left-0 bg-sunken/70" style={{ width: `${pct(win.start)}%` }} aria-hidden />}
        {win && win.end < DAY_END && <div className="pointer-events-none absolute inset-y-0 right-0 bg-sunken/70" style={{ width: `${100 - pct(win.end)}%` }} aria-hidden />}

        {(extras.abs ?? []).map((a) => {
          const s = onDay(a.start, date, "start"), e = onDay(a.end, date, "end") || 1440;
          const left = pct(s), width = pct(e) - left;
          if (width <= 0) return null;
          return (
            <div
              key={a.id}
              className={cx("pointer-events-none absolute inset-y-1 flex items-start rounded-md border px-2 pt-1 text-[11px] font-medium", a.status === "requested" ? "border-dashed border-[#8a6420] text-[#ffc56b]" : "border-line-strong text-muted")}
              style={{ left: `${left}%`, width: `${width}%`, ...hatch(a.status === "requested") }}
              title={absenceName(a)}
            >
              <span className="truncate">{absenceName(a)}</span>
            </div>
          );
        })}

        {nowMin !== null && (
          <div className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-accent-hi shadow-[0_0_8px_rgb(102_163_255/0.9)]" style={{ left: `${pct(nowMin)}%` }} aria-hidden>
            <span className="absolute -top-0.5 -left-[3px] size-[7px] rounded-full bg-accent-hi" />
          </div>
        )}

        {list.map((b) => {
          const s = onDay(b.start, date, "start"), e = onDay(b.end, date, "end") || 1440;
          let left = pct(s), width = pct(e) - left;
          if (width <= 0) {
            width = 3;
            left = e <= DAY_START ? 0 : 97;
          }
          return (
            <BookingBlock
              key={b.id}
              b={b}
              date={date}
              colour={colour}
              status={statuses[b.job.status]}
              clash={clashes.get(b.id)}
              api={api}
              variant="day"
              style={{ left: `calc(${left}% + 1px)`, width: `calc(${width}% - 2px)`, top: 8 + (lane.get(b.id) ?? 0) * LANE_H, height: LANE_H - 6 }}
            />
          );
        })}

        {preview !== null && (
          <div
            className="pointer-events-none absolute inset-y-1.5 z-[3] rounded-md border-2 border-dashed border-accent bg-accent-lo/50 px-1.5 text-[11px] font-medium text-accent-hi"
            style={{ left: `${pct(DAY_START + preview * 30)}%`, width: `${Math.max(2, pct(DAY_START + preview * 30 + api.itemMinutes) - pct(DAY_START + preview * 30))}%` }}
            aria-hidden
          >
            {hhmm(DAY_START + preview * 30)}
          </div>
        )}

        {api.pick && api.canEdit && (
          <div className="absolute inset-0 z-[4] flex">
            {Array.from({ length: SLOTS }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => api.place({ ...base, minutes: DAY_START + i * 30 })}
                className="h-full flex-1 border-r border-dashed border-accent/20 hover:bg-accent-lo/60 focus-visible:bg-accent-lo/60"
                aria-label={`Place at ${hhmm(DAY_START + i * 30)} with ${name}`}
                title={hhmm(DAY_START + i * 30)}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const header = (
    <div role="row" className="contents">
      <div role="columnheader" className="sticky top-0 left-0 z-30 flex items-end border-b border-line bg-sunken px-3 py-2 text-[11px] font-medium tracking-wide text-subtle uppercase">
        Operative
      </div>
      <div role="columnheader" className="sticky top-0 z-20 h-9 border-b border-l border-line bg-sunken" aria-label="Time of day">
        {Array.from({ length: SLOTS / 2 }, (_, i) => (
          <span key={i} className="absolute top-2.5 pl-1.5 text-[11px] font-medium text-subtle tabular" style={{ left: `${(i / (SLOTS / 2)) * 100}%` }}>
            {hhmm(DAY_START + i * 60)}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="max-h-[calc(100dvh-210px)] min-h-[420px] overflow-auto overscroll-contain" data-testid="day-grid">
      <div role="grid" aria-label="Day planner" className="grid w-full" style={{ gridTemplateColumns: `${LABEL_W}px minmax(${SLOTS * SLOT_MIN_W}px, 1fr)`, minWidth: LABEL_W + SLOTS * SLOT_MIN_W }}>
        {header}
        <Group label="Operatives" count={operatives.length} />
        {operatives.length === 0 && <Empty>No field operatives match this filter.</Empty>}
        {operatives.map((op) => {
          const list = bookingsOn(bookings, date, (b) => b.employeeId === op.id);
          const abs = absencesOn(absences, op.id, date);
          const reasons = [...new Set(list.flatMap((b) => clashes.get(b.id) ?? []))];
          return (
            <div key={op.id} role="row" className="contents">
              <div role="rowheader" className={cx("sticky left-0 z-10 flex flex-col justify-center gap-1 border-b border-line/70 bg-surface px-3 py-2", reasons.length > 0 && "shadow-[inset_3px_0_0_#f0524f]")}>
                <OperativeLabel op={op} linkable={linkPeople} />
                <div className="grid gap-1 pl-[42px]">
                  {reasons.length > 0 && (
                    <div>
                      <ClashChip reasons={reasons} />
                    </div>
                  )}
                  <div className="min-w-0">
                      <LoadBar booked={bookedHours(list, date)} cap={capacityHours(op, date, absences)} maxDaily={op.maxDaily} working={Boolean(workWindow(op, date))} absent={abs.some((a) => a.status === "approved") && capacityHours(op, date, absences) === 0} />
                    </div>
                </div>
              </div>
              {timeline(`e:${op.id}`, op.name, { employeeId: op.id, subcontractorId: null, date }, list, op.colour, { op, abs })}
            </div>
          );
        })}
        {subs.length > 0 && <Group label="Subcontractors with bookings" count={subs.length} />}
        {subs.map((s) => (
          <div key={s.id} role="row" className="contents">
            <div role="rowheader" className="sticky left-0 z-10 flex items-center border-b border-line/70 bg-surface px-3 py-2">
              <SubLabel sub={s} linkable={linkSubs} />
            </div>
            {timeline(`s:${s.id}`, s.name, { employeeId: null, subcontractorId: s.id, date }, bookingsOn(bookings, date, (b) => b.subcontractorId === s.id), "#8090ab", {})}
          </div>
        ))}
      </div>
    </div>
  );
}

function Group({ label, count }: { label: string; count: number }) {
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

function Empty({ children }: { children: ReactNode }) {
  return (
    <div role="row" className="contents">
      <div role="gridcell" className="col-span-full px-4 py-8 text-center text-sm text-muted">
        {children}
      </div>
    </div>
  );
}
