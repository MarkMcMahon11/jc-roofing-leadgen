// Pure planner calculations (clashes, load, free slots, lanes). Shared by server and client.
import { addDays, dayBounds, dayKey, fmtDay, fmtSlot, hhmm, londonParts, londonToMs } from "./time";
import type { Absence, Booking, Operative } from "./types";

/** Assignment states that no longer occupy the operative (same rule as assignment_conflicts()). */
const NOT_LIVE = new Set(["cancelled", "completed", "no_access"]);
export const isLive = (status: string) => !NOT_LIVE.has(status);

const t = (iso: string) => Date.parse(iso);
export const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;
const HOUR = 3_600_000;

/** "Wed 11 Nov – Wed 18 Nov" for whole days, otherwise "Mon 16 Nov, 08:00–17:00". */
export function absenceWhen(a: Pick<Absence, "start" | "end">) {
  const s = londonParts(a.start), e = londonParts(a.end);
  const wholeDays = s.minutes === 0 && (e.minutes === 0 || e.minutes >= 23 * 60 + 59);
  if (!wholeDays) return fmtSlot(a.start, a.end);
  const last = e.minutes === 0 ? addDays(e.date, -1) : e.date;
  return last === s.date ? fmtDay(s.date) : `${fmtDay(s.date)} – ${fmtDay(last)}`;
}

export function absenceName(a: Pick<Absence, "label" | "status">) {
  return a.status === "requested" ? `${a.label} (requested)` : a.label;
}

function bookingWhen(b: Booking) {
  const s = londonParts(b.start), e = londonParts(b.end);
  return s.date === e.date ? `${hhmm(s.minutes)}–${hhmm(e.minutes)}` : fmtSlot(b.start, b.end);
}

/**
 * Bookings that clash: overlapping live bookings of the same operative, or a live booking
 * during an approved or requested absence. Returns booking id -> explanations.
 */
export function findClashes(bookings: Booking[], absences: Absence[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (id: string, msg: string) => {
    const list = out.get(id) ?? [];
    if (!list.includes(msg)) list.push(msg);
    out.set(id, list);
  };
  const byEmp = new Map<string, Booking[]>();
  for (const b of bookings) {
    if (!b.employeeId || !isLive(b.status)) continue;
    (byEmp.get(b.employeeId) ?? byEmp.set(b.employeeId, []).get(b.employeeId)!).push(b);
  }
  for (const [emp, list] of byEmp) {
    list.sort((a, b) => t(a.start) - t(b.start));
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (t(b.start) >= t(a.end)) break;
        add(a.id, `Overlaps ${b.job.reference} (${bookingWhen(b)})`);
        add(b.id, `Overlaps ${a.job.reference} (${bookingWhen(a)})`);
      }
    }
    for (const x of absences) {
      if (x.employeeId !== emp) continue;
      for (const b of list) {
        if (overlaps(t(b.start), t(b.end), t(x.start), t(x.end))) add(b.id, `During ${absenceName(x).toLowerCase()}: ${absenceWhen(x)}`);
      }
    }
  }
  return out;
}

/** Bookings of one resource that touch a London day (cancelled ones excluded). */
export function bookingsOn(bookings: Booking[], date: string, match: (b: Booking) => boolean) {
  const { start, end } = dayBounds(date);
  return bookings
    .filter((b) => b.status !== "cancelled" && match(b) && overlaps(t(b.start), t(b.end), start, end))
    .sort((a, b) => t(a.start) - t(b.start) || a.job.reference.localeCompare(b.job.reference));
}

/** Hours booked within a London day (bookings clipped to the day). */
export function bookedHours(bookings: Booking[], date: string) {
  const { start, end } = dayBounds(date);
  let ms = 0;
  for (const b of bookings) {
    if (b.status === "cancelled") continue;
    ms += Math.max(0, Math.min(end, t(b.end)) - Math.max(start, t(b.start)));
  }
  return ms / HOUR;
}

/** Working window for a day in minutes after midnight, or null on a non-working day. */
export function workWindow(op: Operative, date: string): { start: number; end: number } | null {
  const w = op.hours?.[dayKey(date)];
  if (!w || !Array.isArray(w) || w.length < 2) return null;
  const s = Number(w[0]) * 60, e = Number(w[1]) * 60;
  return Number.isFinite(s) && Number.isFinite(e) && e > s ? { start: s, end: e } : null;
}

export function absencesOn(absences: Absence[], employeeId: string, date: string) {
  const { start, end } = dayBounds(date);
  return absences.filter((a) => a.employeeId === employeeId && overlaps(t(a.start), t(a.end), start, end));
}

/** Bookable hours that day: working window capped at max_daily_hours, less approved absence. */
export function capacityHours(op: Operative, date: string, absences: Absence[]) {
  const w = workWindow(op, date);
  if (!w) return 0;
  const ws = londonToMs(date, w.start), we = londonToMs(date, w.end);
  let off = 0;
  for (const a of absencesOn(absences, op.id, date)) {
    if (a.status !== "approved") continue;
    off += Math.max(0, Math.min(we, t(a.end)) - Math.max(ws, t(a.start)));
  }
  return Math.max(0, Math.min((w.end - w.start) / 60, op.maxDaily) - off / HOUR);
}

const roundUp = (min: number, step = 15) => Math.ceil(min / step) * step;

/**
 * Where a dropped job goes in the week view: the first gap from the start of the working day
 * (08:00 when none is set) that fits the job, with the duration = estimated hours capped to
 * what is left of the working day. Falls back to straight after the last booking.
 */
export function firstFreeSlot(dayBookings: Booking[], date: string, op: Operative | null, estimatedHours: number | null) {
  // non-working day or unknown hours: plan against a standard 08:00-17:00 day
  const win = (op && workWindow(op, date)) ?? { start: 8 * 60, end: 17 * 60 };
  const workStart = win.start;
  const workEnd = Math.max(win.end, workStart + 30);
  const desired = Math.max(30, Math.round(((estimatedHours ?? 2) * 60) / 15) * 15);
  const intervals = dayBookings
    .filter((b) => isLive(b.status))
    .map((b) => {
      const s = londonParts(b.start), e = londonParts(b.end);
      return [s.date < date ? 0 : s.minutes, e.date > date ? 1440 : e.minutes] as const;
    })
    .sort((a, b) => a[0] - b[0]);
  const candidates = [...new Set([workStart, ...intervals.map(([, e]) => roundUp(e)).filter((e) => e >= workStart)])].sort((a, b) => a - b);
  for (const c of candidates) {
    if (c >= workEnd) break;
    if (intervals.some(([s, e]) => s <= c && e > c)) continue;
    const next = Math.min(workEnd, ...intervals.filter(([s]) => s > c).map(([s]) => s));
    const want = Math.min(desired, workEnd - c);
    if (want >= 30 && next - c >= want) return slot(date, c, want);
  }
  const after = roundUp(Math.max(workStart, ...intervals.map(([, e]) => e)));
  const start = Math.min(after, 23 * 60);
  const len = Math.max(30, Math.min(desired, workEnd > start ? workEnd - start : 60, 24 * 60 - start));
  return slot(date, start, len);
}

function slot(date: string, startMin: number, minutes: number) {
  const s = londonToMs(date, startMin);
  return { start: new Date(s).toISOString(), end: new Date(s + minutes * 60_000).toISOString() };
}

/** Greedy lanes for overlapping bookings in the day view. */
export function assignLanes(list: Booking[]) {
  const ends: number[] = [];
  const lane = new Map<string, number>();
  for (const b of [...list].sort((a, b) => t(a.start) - t(b.start))) {
    let i = ends.findIndex((e) => e <= t(b.start));
    if (i === -1) i = ends.push(0) - 1;
    ends[i] = t(b.end);
    lane.set(b.id, i);
  }
  return { lane, count: Math.max(1, ends.length) };
}

export const hoursLabel = (h: number) => `${Number.isInteger(Math.round(h * 10) / 10) ? Math.round(h) : (Math.round(h * 10) / 10).toFixed(1)}h`;
