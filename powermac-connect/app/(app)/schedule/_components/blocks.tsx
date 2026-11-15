"use client";

import Link from "next/link";
import type { CSSProperties, DragEvent } from "react";
import { Building2, Loader2, TriangleAlert } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import { initials } from "@/lib/format";
import { absenceName, absenceWhen, hoursLabel } from "../_lib/board";
import { addDays, londonParts, hhmm } from "../_lib/time";
import { ASSIGNMENT_STATUSES, PRIORITY_COLOUR, type Absence, type Booking, type Operative, type StatusInfo, type Sub } from "../_lib/types";

/** What can be dragged or picked: a queued job or an existing booking. */
export type Item = { type: "job"; id: string } | { type: "booking"; id: string };
/** Where it lands. minutes = exact London start time (day view); omitted = first free slot (week view). */
export type Target = { employeeId: string | null; subcontractorId: string | null; date: string; minutes?: number };

/** Callbacks the grids and agenda share. */
export type GridApi = {
  canEdit: boolean;
  drag: Item | null;
  pick: Item | null;
  /** length in minutes of the dragged/picked item (drop preview) */
  itemMinutes: number;
  startDrag: (item: Item, e: DragEvent) => void;
  endDrag: () => void;
  place: (target: Target) => void;
  openBooking: (id: string) => void;
  dayHref: (date: string) => string | undefined;
};

export const ASSIGNMENT_LABEL: Record<string, string> = Object.fromEntries(ASSIGNMENT_STATUSES.map((s) => [s.value, s.label]));

export const hatch = (requested: boolean): CSSProperties => ({
  backgroundImage: requested
    ? "repeating-linear-gradient(135deg, rgb(242 169 59 / 0.10) 0 6px, transparent 6px 12px)"
    : "repeating-linear-gradient(135deg, rgb(128 144 171 / 0.13) 0 6px, transparent 6px 12px)",
});

/** "08:00–09:45", with arrows when the booking runs over from/into another day. */
export function timeText(b: Pick<Booking, "start" | "end">, date: string) {
  const s = londonParts(b.start), e = londonParts(b.end);
  const left = s.date < date ? "←" : hhmm(s.minutes);
  const right = e.date > date ? (e.date === addDays(date, 1) && e.minutes === 0 ? "24:00" : "→") : hhmm(e.minutes);
  return `${left}–${right}`;
}

export function BookingBlock({
  b,
  date,
  colour,
  status,
  clash,
  api,
  variant = "week",
  style,
  className,
}: {
  b: Booking;
  date: string;
  colour: string;
  status?: StatusInfo;
  clash?: string[];
  api: GridApi;
  variant?: "week" | "day" | "agenda";
  style?: CSSProperties;
  className?: string;
}) {
  const draggable = api.canEdit && !b.pending && variant !== "agenda";
  const dragging = api.drag?.type === "booking" && api.drag.id === b.id;
  const picked = api.pick?.type === "booking" && api.pick.id === b.id;
  const when = timeText(b, date);
  const asg = b.status !== "scheduled" ? ASSIGNMENT_LABEL[b.status] ?? b.status : null;
  const done = b.status === "completed" || b.status === "no_access";
  const tip = [
    `${b.job.reference} · ${b.job.title}`,
    `${when}${b.job.postcode ? ` · ${b.job.postcode}` : ""}`,
    `Job: ${status?.label ?? b.job.status}${asg ? ` · Visit: ${asg}` : ""}`,
    ...(clash?.length ? ["", "Clash:", ...clash.map((c) => `• ${c}`)] : []),
  ].join("\n");
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={draggable ? (e) => api.startDrag({ type: "booking", id: b.id }, e) : undefined}
      onDragEnd={draggable ? api.endDrag : undefined}
      onClick={(e) => {
        e.stopPropagation();
        api.openBooking(b.id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          api.openBooking(b.id);
        }
      }}
      title={tip}
      aria-label={`${b.job.reference}, ${b.job.title}, ${when}${clash?.length ? ", clash" : ""}. Open booking`}
      data-booking={b.id}
      data-ref={b.job.reference}
      className={cx(
        "group/block min-w-0 overflow-hidden rounded-md border text-left transition-[opacity,box-shadow] outline-none select-none focus-visible:ring-2 focus-visible:ring-accent-hi",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        variant === "day" ? "absolute z-[2]" : "relative",
        variant === "week" && "px-2 py-1 text-[11.5px] leading-[1.3]",
        variant === "day" && "flex items-center gap-1.5 px-2 text-[11.5px] leading-tight",
        variant === "agenda" && "px-3 py-2 text-[13px]",
        clash?.length ? "border-bad ring-1 ring-bad/70" : "border-transparent",
        (dragging || b.pending) && "opacity-55",
        picked && "ring-2 ring-accent-hi",
        done && "opacity-70",
        className,
      )}
      style={{ backgroundColor: colour + "24", boxShadow: `inset 3px 0 0 ${PRIORITY_COLOUR[b.job.priority] ?? "#86918a"}`, ...style }}
    >
      {variant === "day" ? (
        <>
          <span className="shrink-0 font-medium text-fg tabular">{when.split("–")[0]}</span>
          <span className="shrink-0 font-mono text-[11px] text-accent-hi">{b.job.reference}</span>
          <span className="truncate text-muted">{b.job.title}</span>
          {clash?.length ? <TriangleAlert className="ml-auto size-3.5 shrink-0 text-bad" aria-hidden /> : null}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-1">
            <span className={cx("font-medium whitespace-nowrap tabular", variant === "agenda" ? "text-fg" : "text-fg/90")}>{when}</span>
            <span className="flex shrink-0 items-center gap-1">
              {b.pending && <Loader2 className="size-3 animate-spin text-accent-hi" aria-label="Saving" />}
              <span className="size-2 rounded-full" style={{ backgroundColor: status?.colour ?? "#64748b" }} title={`Job status: ${status?.label ?? b.job.status}`} />
            </span>
          </div>
          <div className="flex min-w-0 items-baseline justify-between gap-1">
            <span className="shrink-0 font-mono text-[11px] tracking-tight text-accent-hi">{b.job.reference}</span>
            {asg && <span className="min-w-0 truncate text-[10px] text-subtle">{asg}</span>}
          </div>
          <div className={cx("truncate", variant === "agenda" ? "text-fg" : "text-muted")}>{b.job.title}</div>
          {variant === "agenda" && b.job.postcode && <div className="mt-0.5 text-xs text-subtle">{b.job.postcode}</div>}
        </>
      )}
    </div>
  );
}

export function AbsenceTag({ a, compact }: { a: Absence; compact?: boolean }) {
  const requested = a.status === "requested";
  return (
    <span
      className={cx(
        "inline-flex max-w-full items-center gap-1 truncate rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium",
        requested ? "border-dashed border-[#8a6420] bg-warn-lo/80 text-[#ffc56b]" : "border-line-strong bg-raised/90 text-muted",
      )}
      title={`${absenceName(a)}: ${absenceWhen(a)}${requested ? " - not yet approved" : ""}`}
    >
      {absenceName(a)}
      {!compact && <span className="truncate font-normal text-subtle">{partial(a)}</span>}
    </span>
  );
}
function partial(a: Absence) {
  const s = londonParts(a.start), e = londonParts(a.end);
  if (s.date === e.date && !(s.minutes === 0 && e.minutes >= 1439)) return `${hhmm(s.minutes)}–${hhmm(e.minutes)}`;
  return "";
}

export function loadTone(booked: number, cap: number, maxDaily: number) {
  if (booked > maxDaily + 0.01 || (cap > 0 && booked > cap + 0.01) || (cap === 0 && booked > 0)) return "bad" as const;
  if (cap > 0 && booked / cap >= 0.85) return "warn" as const;
  return "ok" as const;
}
const toneColour = { ok: "#22c7b8", warn: "#f2a93b", bad: "#f0524f" };

/** Per-cell load: hours booked against that day's bookable hours. */
export function LoadBar({ booked, cap, maxDaily, working, absent }: { booked: number; cap: number; maxDaily: number; working: boolean; absent?: boolean }) {
  if (!working && booked === 0) return <div className="mt-auto pt-1 text-[10.5px] text-subtle">Day off</div>;
  if (absent && booked === 0) return <div className="mt-auto pt-1 text-[10.5px] text-subtle">Unavailable</div>;
  const tone = loadTone(booked, cap, maxDaily);
  const pct = cap > 0 ? Math.min(100, (booked / cap) * 100) : booked > 0 ? 100 : 0;
  const label = `${hoursLabel(booked)} of ${hoursLabel(cap)} booked${booked > maxDaily + 0.01 ? ` (over the ${hoursLabel(maxDaily)} daily maximum)` : ""}`;
  return (
    <div className="mt-auto pt-1" title={label}>
      <div className="flex items-center justify-between text-[10.5px] text-subtle tabular">
        <span>
          <span className={cx(tone === "bad" ? "text-[#ff8a87]" : tone === "warn" ? "text-[#ffc56b]" : "text-muted")}>{hoursLabel(booked)}</span> / {hoursLabel(cap)}
        </span>
        {tone === "bad" && <span className="font-medium text-[#ff8a87]">Over</span>}
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-sunken" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={cap} aria-valuenow={booked}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: toneColour[tone] }} />
      </div>
    </div>
  );
}

export function OperativeLabel({ op, weekHours, linkable }: { op: Operative; weekHours?: number; linkable: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-1 ring-white/10"
        style={{ background: `linear-gradient(135deg, ${op.colour}, ${op.colour}99)` }}
        aria-hidden
      >
        {initials(op.name)}
      </span>
      <div className="min-w-0">
        {linkable ? (
          <Link href={`/workforce/${op.id}`} className="block truncate text-[13px] font-medium text-fg hover:text-accent-hi hover:underline">
            {op.name}
          </Link>
        ) : (
          <span className="block truncate text-[13px] font-medium text-fg">{op.name}</span>
        )}
        <span className="flex items-center gap-1.5 truncate text-[11.5px] text-subtle">
          <span className="truncate">{op.tradeLabel}</span>
          {op.employmentStatus === "on_leave" && <span className="rounded bg-warn-lo px-1 text-[10px] text-[#ffc56b]">On leave</span>}
          {weekHours !== undefined && <span className="tabular">· {hoursLabel(weekHours)}</span>}
        </span>
      </div>
    </div>
  );
}

export function SubLabel({ sub, linkable }: { sub: Sub; linkable: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-raised text-subtle" aria-hidden>
        <Building2 className="size-4" />
      </span>
      <div className="min-w-0">
        {linkable ? (
          <Link href={`/subcontractors/${sub.id}`} className="block truncate text-[13px] font-medium text-fg hover:text-accent-hi hover:underline">
            {sub.name}
          </Link>
        ) : (
          <span className="block truncate text-[13px] font-medium text-fg">{sub.name}</span>
        )}
        <span className="block truncate text-[11.5px] text-subtle">Subcontractor{sub.reference ? ` · ${sub.reference}` : ""}</span>
      </div>
    </div>
  );
}
