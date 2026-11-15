"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition, type DragEvent } from "react";
import { CheckCircle2, Loader2, MousePointerClick, X } from "lucide-react";
import { Card, buttonClass, cx } from "@/components/ui/primitives";
import type { ActionResult } from "@/lib/actions";
import { bookJob, checkClashes, unassignBooking, updateBooking } from "../actions";
import { bookingsOn, findClashes, firstFreeSlot, isLive, workWindow } from "../_lib/board";
import { fmtSlot, londonParts, londonToMs } from "../_lib/time";
import { PRIORITY_COLOUR, type Absence, type Booking, type Clash, type Operative, type PlannerConfig, type Proposal, type QueueJob, type StatusInfo, type Sub } from "../_lib/types";
import { MobileAgenda } from "./agenda";
import { hatch, type GridApi, type Item, type Target } from "./blocks";
import { BookingDialog, ClashDialog } from "./booking-dialog";
import { DAY_END, DayGrid } from "./day-grid";
import { QueuePanel } from "./queue";
import { Recommendations, SlotFields, defaultMinutes, slotTimes, type Slot } from "./recommendations";
import { WeekGrid } from "./week-grid";

type Board = { bookings: Booking[]; queue: QueueJob[] };
type Change =
  | { type: "add"; booking: Booking }
  | { type: "move"; id: string; employeeId: string | null; subcontractorId: string | null; start: string; end: string; status?: string }
  | { type: "remove"; id: string };

function reduce(state: Board, c: Change): Board {
  switch (c.type) {
    case "add":
      return { bookings: [...state.bookings, c.booking], queue: state.queue.filter((j) => j.id !== c.booking.workOrderId) };
    case "move":
      return {
        ...state,
        bookings: state.bookings.map((b) =>
          b.id === c.id ? { ...b, employeeId: c.employeeId, subcontractorId: c.subcontractorId, start: c.start, end: c.end, status: c.status ?? b.status, pending: true } : b,
        ),
      };
    case "remove":
      return { ...state, bookings: state.bookings.filter((b) => b.id !== c.id) };
  }
}

const iso = (ms: number) => new Date(ms).toISOString();
const NETWORK = "The change could not be saved. Check your connection and try again.";

type Props = {
  config: PlannerConfig;
  operatives: Operative[];
  subs: Sub[];
  subOptions: Sub[];
  bookings: Booking[];
  absences: Absence[];
  queue: QueueJob[];
  queueTotal: number;
  statuses: Record<string, StatusInfo>;
  tradeOptions: { value: string; label: string }[];
  dayLinks: Record<string, string>;
  mobileDayLinks: { prev: string; next: string };
};

export function Planner({ config, operatives, subs, subOptions, bookings, absences, queue, queueTotal, statuses, tradeOptions, dayLinks, mobileDayLinks }: Props) {
  const { canEdit } = config;
  const [board, change] = useOptimistic<Board, Change>({ bookings, queue }, reduce);
  const [saving, startSaving] = useTransition();
  const [checking, setChecking] = useState(false);
  const [drag, setDrag] = useState<Item | null>(null);
  const dragRef = useRef<Item | null>(null);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot>({ date: config.focusDay, start: 8 * 60, minutes: 120 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ p: Proposal; clashes: Clash[]; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const opById = useMemo(() => new Map(operatives.map((o) => [o.id, o])), [operatives]);
  const subById = useMemo(() => new Map(subs.map((s) => [s.id, s])), [subs]);
  const bookingById = useMemo(() => new Map(board.bookings.map((b) => [b.id, b])), [board.bookings]);
  const jobById = useMemo(() => new Map(board.queue.map((j) => [j.id, j])), [board.queue]);
  const clashes = useMemo(() => findClashes(board.bookings, absences), [board.bookings, absences]);
  const tradeLabels = useMemo(() => new Map(tradeOptions.map((t) => [t.value, t.label])), [tradeOptions]);
  const tradeLabel = (k: string) => tradeLabels.get(k) ?? k.replace(/_/g, " ");

  const selJob = selectedJob ? (jobById.get(selectedJob) ?? null) : null;
  const movingBooking = moving ? (bookingById.get(moving) ?? null) : null;
  const pick: Item | null = !canEdit ? null : movingBooking ? { type: "booking", id: movingBooking.id } : selJob ? { type: "job", id: selJob.id } : null;
  const active = drag ?? pick;
  const itemMinutes = !active
    ? 0
    : active.type === "job"
      ? Math.max(30, Math.round(((jobById.get(active.id)?.estimatedHours ?? 2) * 60) / 15) * 15)
      : (() => {
          const b = bookingById.get(active.id);
          return b ? (Date.parse(b.end) - Date.parse(b.start)) / 60_000 : 60;
        })();

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || openId || confirm) return;
      setSelectedJob(null);
      setMoving(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId, confirm]);

  const nameOf = (r: { employeeId: string | null; subcontractorId: string | null }) =>
    r.employeeId ? (opById.get(r.employeeId)?.name ?? "the operative") : (subById.get(r.subcontractorId ?? "")?.name ?? "the subcontractor");

  const describe = (p: Proposal) => {
    const ref = p.kind === "create" ? jobById.get(p.jobId)?.reference : bookingById.get(p.bookingId)?.job.reference;
    return `${p.kind === "create" ? "Book" : "Move"} ${ref ?? "job"} with ${nameOf(p)}, ${fmtSlot(p.start, p.end)}`;
  };

  /** Drop / click target -> concrete booking proposal. */
  const resolve = (item: Item, target: Target): Proposal | null => {
    const match = (b: Booking) => (target.employeeId ? b.employeeId === target.employeeId : b.subcontractorId === target.subcontractorId);
    const op = target.employeeId ? (opById.get(target.employeeId) ?? null) : null;
    const who = { employeeId: target.employeeId, subcontractorId: target.subcontractorId };
    if (item.type === "job") {
      const job = jobById.get(item.id);
      if (!job) return null;
      if (target.minutes === undefined) {
        const dayBookings = bookingsOn(board.bookings, target.date, match);
        return { kind: "create", jobId: job.id, ...who, ...firstFreeSlot(dayBookings, target.date, op, job.estimatedHours) };
      }
      const win = (op && workWindow(op, target.date)) ?? { start: 8 * 60, end: 17 * 60 };
      const desired = Math.max(30, Math.round(((job.estimatedHours ?? 2) * 60) / 15) * 15);
      const len = Math.max(30, Math.min(desired, (win.end > target.minutes ? win.end : DAY_END) - target.minutes));
      const s = londonToMs(target.date, target.minutes);
      return { kind: "create", jobId: job.id, ...who, start: iso(s), end: iso(s + len * 60_000) };
    }
    const b = bookingById.get(item.id);
    if (!b || b.pending) return null;
    const s = londonToMs(target.date, target.minutes ?? londonParts(b.start).minutes);
    if (s === Date.parse(b.start) && b.employeeId === target.employeeId && b.subcontractorId === target.subcontractorId) return null;
    return { kind: "move", bookingId: b.id, ...who, start: iso(s), end: iso(s + Date.parse(b.end) - Date.parse(b.start)) };
  };

  const commit = (p: Proposal) => {
    setConfirm(null);
    setOpenId(null);
    setMoving(null);
    if (p.kind === "create") setSelectedJob(null);
    const job = p.kind === "create" ? jobById.get(p.jobId) : undefined;
    startSaving(async () => {
      let res: ActionResult;
      try {
        if (p.kind === "create") {
          if (job) {
            change({
              type: "add",
              booking: {
                id: `pending-${p.jobId}`,
                workOrderId: p.jobId,
                employeeId: p.employeeId,
                subcontractorId: p.subcontractorId,
                role: "lead",
                start: p.start,
                end: p.end,
                status: "scheduled",
                pending: true,
                job: { id: job.id, reference: job.reference, title: job.title, priority: job.priority, status: job.status, trade: job.trade, postcode: job.postcode, estimatedHours: job.estimatedHours },
              },
            });
          }
          res = await bookJob({ workOrderId: p.jobId, employeeId: p.employeeId, subcontractorId: p.subcontractorId, start: p.start, end: p.end });
        } else {
          change({ type: "move", id: p.bookingId, employeeId: p.employeeId, subcontractorId: p.subcontractorId, start: p.start, end: p.end, status: p.status });
          res = await updateBooking({ id: p.bookingId, employeeId: p.employeeId, subcontractorId: p.subcontractorId, start: p.start, end: p.end, status: p.status });
        }
      } catch {
        res = { ok: false, message: NETWORK };
      }
      if (res.ok) setNotice(res.message ?? "Saved.");
      else setError(res.message ?? "That change was refused.");
    });
  };

  /** Clash check (assignment_conflicts) first; a clash needs explicit confirmation. */
  const run = async (p: Proposal, opts: { check: boolean } = { check: true }) => {
    setError(null);
    const status = p.kind === "move" ? (p.status ?? bookingById.get(p.bookingId)?.status ?? "scheduled") : "scheduled";
    if (opts.check && p.employeeId && isLive(status)) {
      setChecking(true);
      let res: Awaited<ReturnType<typeof checkClashes>>;
      try {
        res = await checkClashes({ employeeId: p.employeeId, start: p.start, end: p.end, excludeId: p.kind === "move" ? p.bookingId : null });
      } catch {
        res = { ok: false, message: "Clashes could not be checked. Check your connection and try again." };
      }
      setChecking(false);
      if (!res.ok) return setError(res.message ?? "Clashes could not be checked.");
      if (res.clashes?.length) return setConfirm({ p, clashes: res.clashes, title: describe(p) });
    }
    commit(p);
  };

  const place = (target: Target) => {
    const item = dragRef.current ?? pick;
    dragRef.current = null;
    setDrag(null);
    if (!item || !canEdit || saving || checking) return;
    const p = resolve(item, target);
    if (p) void run(p);
    else if (item.type === "booking") setMoving(null);
  };

  const unassign = (id: string) => {
    setOpenId(null);
    setError(null);
    startSaving(async () => {
      change({ type: "remove", id });
      let res: ActionResult;
      try {
        res = await unassignBooking(id);
      } catch {
        res = { ok: false, message: NETWORK };
      }
      if (res.ok) setNotice(res.message ?? "Unassigned.");
      else setError(res.message ?? "The booking could not be cancelled.");
    });
  };

  const selectJob = (id: string | null) => {
    setMoving(null);
    setSelectedJob(id);
    const j = id ? jobById.get(id) : null;
    if (j) setSlot({ date: config.focusDay, start: 8 * 60, minutes: defaultMinutes(j.estimatedHours) });
  };

  const api: GridApi = {
    canEdit,
    drag,
    pick,
    itemMinutes,
    startDrag: (item: Item, e: DragEvent) => {
      e.dataTransfer.setData("text/plain", item.id);
      e.dataTransfer.effectAllowed = "move";
      dragRef.current = item;
      setDrag(item);
      setError(null);
    },
    endDrag: () => {
      dragRef.current = null;
      setDrag(null);
    },
    place,
    openBooking: (id: string) => {
      if (!pick && !id.startsWith("pending-")) setOpenId(id);
    },
    dayHref: (d: string) => dayLinks[d],
  };

  const busy = saving || checking;
  const openBooking = openId ? (bookingById.get(openId) ?? null) : null;
  const pickLabel = movingBooking ? movingBooking.job.reference : selJob?.reference;

  return (
    <div className="grid gap-4">
      {/* phones: day agenda + select-menu booking */}
      <div className="md:hidden">
        <MobileAgenda
          date={config.date}
          today={config.today}
          operatives={operatives}
          subs={subs}
          subOptions={subOptions}
          bookings={board.bookings}
          absences={absences}
          clashes={clashes}
          statuses={statuses}
          queue={board.queue}
          api={{ ...api, pick: null }}
          busy={busy}
          links={mobileDayLinks}
          linkPeople={config.linkPeople}
          linkSubs={config.linkSubs}
          tradeLabel={tradeLabel}
          onBook={(jobId, who, s) => void run({ kind: "create", jobId, ...who, ...slotTimes(s) })}
        />
      </div>

      {/* tablets and desktops: queue + visual planner */}
      <div className="hidden gap-5 md:grid lg:grid-cols-[288px_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-28 lg:self-start">
          <QueuePanel
            queue={board.queue}
            total={Math.max(queueTotal - (queue.length - board.queue.length), board.queue.length)}
            statuses={statuses}
            tradeOptions={tradeOptions}
            api={api}
            selectedId={selJob?.id ?? null}
            onSelect={selectJob}
            renderSelected={(job) => (
              <div className="grid gap-3">
                {canEdit && (
                  <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-accent-hi">
                    <MousePointerClick className="mt-px size-3.5 shrink-0" aria-hidden />
                    Click a day on the planner to place it, or pick a slot and book a recommendation.
                  </p>
                )}
                {!job.movesToScheduled && <p className="text-[11.5px] leading-snug text-subtle">Booking keeps its status ({statuses[job.status]?.label ?? job.status}): the workflow does not move it to Scheduled from here.</p>}
                <SlotFields slot={slot} onChange={setSlot} idPrefix="d-slot" />
                <Recommendations
                  job={job}
                  slot={slot}
                  canEdit={canEdit}
                  tradeLabel={tradeLabel}
                  busy={busy}
                  onBook={(employeeId) => void run({ kind: "create", jobId: job.id, employeeId, subcontractorId: null, ...slotTimes(slot) })}
                />
              </div>
            )}
          />
        </aside>

        <Card className="min-w-0 overflow-hidden" aria-label={config.view === "week" ? "Week planner" : "Day planner"}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-semibold text-fg">{config.view === "week" ? "Week planner" : "Day planner"}</h2>
            <Legend />
            <div className="ml-auto flex items-center gap-2 text-xs" aria-live="polite">
              {checking && (
                <span className="flex items-center gap-1.5 text-accent-hi">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Checking for clashes…
                </span>
              )}
              {saving && !checking && (
                <span className="flex items-center gap-1.5 text-accent-hi">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  Saving…
                </span>
              )}
            </div>
          </div>
          {pick && pickLabel && (
            <div className="flex flex-wrap items-center gap-2 border-b border-[#2f5a12] bg-accent-lo/60 px-4 py-2 text-[13px] text-[#c8f7a8]" role="status">
              <MousePointerClick className="size-4 shrink-0 text-accent-hi" aria-hidden />
              <span>
                Placing <span className="font-mono text-accent-hi">{pickLabel}</span>: click {config.view === "week" ? "an operative's day" : "a time slot"} to {movingBooking ? "move it" : "book it"}. Press Esc to cancel.
              </span>
              <button type="button" onClick={() => (movingBooking ? setMoving(null) : selectJob(null))} className={buttonClass("ghost", "sm", "ml-auto")}>
                Cancel
              </button>
            </div>
          )}
          {config.view === "week" ? (
            <WeekGrid
              days={config.days}
              today={config.today}
              operatives={operatives}
              subs={subs}
              bookings={board.bookings}
              absences={absences}
              clashes={clashes}
              statuses={statuses}
              api={api}
              linkPeople={config.linkPeople}
              linkSubs={config.linkSubs}
            />
          ) : (
            <DayGrid
              date={config.date}
              today={config.today}
              nowIso={config.nowIso}
              operatives={operatives}
              subs={subs}
              bookings={board.bookings}
              absences={absences}
              clashes={clashes}
              statuses={statuses}
              api={api}
              linkPeople={config.linkPeople}
              linkSubs={config.linkSubs}
            />
          )}
        </Card>
      </div>

      <BookingDialog
        booking={openBooking}
        operatives={operatives}
        subs={subs}
        subOptions={subOptions}
        statuses={statuses}
        clash={openBooking ? clashes.get(openBooking.id) : undefined}
        canEdit={canEdit}
        linkPeople={config.linkPeople}
        linkSubs={config.linkSubs}
        busy={busy}
        onClose={() => setOpenId(null)}
        onSave={(p, opts) => void run(p, opts)}
        onUnassign={unassign}
        onMove={(id) => {
          setOpenId(null);
          setSelectedJob(null);
          setMoving(id);
        }}
      />
      <ClashDialog open={Boolean(confirm)} title={confirm?.title ?? ""} clashes={confirm?.clashes ?? []} onCancel={() => setConfirm(null)} onConfirm={() => confirm && commit(confirm.p)} />

      {(error || notice) && (
        <div className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:max-w-md">
          {error && (
            <div role="alert" data-testid="planner-error" className="pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-[#5a1f1d] bg-[#2a0f0e] px-4 py-3 text-sm text-[#ffb3b1] shadow-[var(--shadow-pop)]">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Not saved</span>
                {error}
              </span>
              <button type="button" onClick={() => setError(null)} className="rounded p-1 text-[#ff8a87] hover:bg-bad-lo" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" data-testid="planner-notice" className="pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-[#145049] bg-[#06201d] px-4 py-3 text-sm text-[#a6efe7] shadow-[var(--shadow-pop)]">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">{notice}</span>
              <button type="button" onClick={() => setNotice(null)} className="rounded p-1 hover:bg-ok-lo" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <ul className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle xl:flex" aria-label="Legend">
      {(["emergency", "urgent", "routine", "planned"] as const).map((p) => (
        <li key={p} className="flex items-center gap-1">
          <span className="h-3 w-[3px] rounded-full" style={{ backgroundColor: PRIORITY_COLOUR[p] }} aria-hidden />
          {p[0].toUpperCase() + p.slice(1)}
        </li>
      ))}
      <li className="flex items-center gap-1">
        <span className="size-3 rounded-sm border border-line-strong" style={hatch(false)} aria-hidden />
        Absence
      </li>
      <li className="flex items-center gap-1">
        <span className="size-3 rounded-sm border border-dashed border-[#8a6420]" style={hatch(true)} aria-hidden />
        Requested
      </li>
      <li className="flex items-center gap-1">
        <span className={cx("size-3 rounded-sm border-2 border-bad")} aria-hidden />
        Clash
      </li>
    </ul>
  );
}
