"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AlertTriangle, CalendarDays, HardHat, Handshake, Loader2 } from "lucide-react";
import { Badge, buttonClass, cx, EmptyState, Input, Label, Notice } from "@/components/ui/primitives";
import { cancelAssignment, rescheduleAssignment, type AssignResult } from "../[id]/actions";
import { ASSIGNMENT_STATUS, MAX_DAY_HOURS } from "../_lib/constants";

export type AssignmentRow = {
  id: string;
  kind: "employee" | "subcontractor";
  who: string;
  href: string;
  colour: string;
  role: string;
  status: string;
  start: string;
  end: string;
  day: string; // London YYYY-MM-DD
  time: string; // London HH:mm
  hours: number;
  notes: string | null;
  warning: string | null;
};

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const OPEN = ["scheduled", "accepted", "no_access"];

export function AssignmentsList({ rows, canAssign }: { rows: AssignmentRow[]; canAssign: boolean }) {
  const live = rows.filter((r) => r.status !== "cancelled");
  const cancelled = rows.filter((r) => r.status === "cancelled");
  if (!rows.length) return <EmptyState title="Nobody is assigned yet">{canAssign ? "Use the assign panel below to book an operative or subcontractor." : "An operations user can assign this job."}</EmptyState>;
  return (
    <div>
      <ul className="divide-y divide-line">
        {live.map((r) => (
          <Row key={r.id} r={r} canAssign={canAssign} />
        ))}
      </ul>
      {cancelled.length > 0 && (
        <details className="border-t border-line px-5 py-3 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted select-none hover:text-fg">{cancelled.length} cancelled visit{cancelled.length === 1 ? "" : "s"}</summary>
          <ul className="mt-2 grid gap-1 text-muted">
            {cancelled.map((r) => (
              <li key={r.id} className="line-through decoration-subtle">
                {r.who} · {fmt(r.start)} - {time(r.end)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Row({ r, canAssign }: { r: AssignmentRow; canAssign: boolean }) {
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState(r.day);
  const [t, setT] = useState(r.time);
  const [hours, setHours] = useState(String(r.hours));
  const [error, setError] = useState<string | null>(null);
  const [clash, setClash] = useState<AssignResult | null>(null);
  const [pending, start] = useTransition();
  const s = ASSIGNMENT_STATUS[r.status] ?? { label: r.status, tone: "neutral" as const };
  const Icon = r.kind === "employee" ? HardHat : Handshake;

  const save = (confirm = false) => {
    setError(null);
    start(async () => {
      const res = await rescheduleAssignment({ id: r.id, day, time: t, duration: Number(hours), confirm });
      if (res.ok) {
        setEditing(false);
        setClash(null);
      } else if (res.needsConfirm) setClash(res);
      else setError(res.message ?? "Could not reschedule.");
    });
  };
  const cancel = () => {
    if (!window.confirm(`Cancel ${r.who}'s visit on ${fmt(r.start)}?`)) return;
    setError(null);
    start(async () => {
      const res = await cancelAssignment(r.id);
      if (!res.ok) setError(res.message ?? "Could not cancel.");
    });
  };

  return (
    <li className="px-5 py-3.5" data-assignment={r.who}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <span className="flex size-8 items-center justify-center rounded-full text-white" style={{ backgroundColor: r.colour }} aria-hidden>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={r.href} className="font-medium text-fg hover:text-accent-hi">
              {r.who}
            </Link>
            <span className="text-xs text-subtle capitalize">{r.role}</span>
            <Badge tone={s.tone}>{s.label}</Badge>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted tabular">
            <span>
              {fmt(r.start)} - {time(r.end)}
            </span>
            <Link href={`/schedule?date=${r.day}`} className="inline-flex items-center gap-1 text-xs text-accent-hi hover:underline">
              <CalendarDays className="size-3.5" aria-hidden /> Schedule
            </Link>
          </div>
          {r.notes && <p className="mt-0.5 text-xs text-subtle">{r.notes}</p>}
          {r.warning && (
            <p className="mt-1 flex items-center gap-1 text-xs text-[#ffc56b]">
              <AlertTriangle className="size-3.5" aria-hidden /> {r.warning}
            </p>
          )}
        </div>
        {canAssign && OPEN.includes(r.status) && !editing && (
          <div className="col-span-2 flex gap-2 pl-11 sm:col-span-1 sm:pl-0">
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setEditing(true)} disabled={pending}>
              Reschedule
            </button>
            <button type="button" className={buttonClass("ghost", "sm", "text-[#ff8a87] hover:text-[#ff8a87]")} onClick={cancel} disabled={pending}>
              {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
              Cancel visit
            </button>
          </div>
        )}
      </div>
      {editing && (
        <div className="mt-3 grid gap-3 rounded-xl border border-line bg-sunken/60 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor={`d-${r.id}`}>Date</Label>
            <Input id={`d-${r.id}`} type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`t-${r.id}`}>Start</Label>
            <Input id={`t-${r.id}`} type="time" step={900} value={t} onChange={(e) => setT(e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`h-${r.id}`}>Hours</Label>
            <Input id={`h-${r.id}`} type="number" min={0.25} max={MAX_DAY_HOURS} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button type="button" className={buttonClass("primary", "md")} onClick={() => save(false)} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save
            </button>
            <button type="button" className={buttonClass("ghost", "md")} onClick={() => { setEditing(false); setClash(null); setError(null); }}>
              Close
            </button>
          </div>
        </div>
      )}
      {clash && (
        <div className={cx("mt-3 rounded-xl border border-[#5a1f1d] bg-bad-lo/60 p-3 text-sm text-[#ffd0ce]")} role="alert">
          <p className="font-semibold text-[#ffb3b1]">{clash.message}</p>
          <ul className="mt-1">
            {clash.conflicts?.map((c, i) => (
              <li key={i}>
                {c.kind === "absence" ? "Absence" : "Booked"}: {c.label} · {fmt(c.starts_at)} - {time(c.ends_at)}
              </li>
            ))}
          </ul>
          <button type="button" className={buttonClass("danger", "sm", "mt-2")} onClick={() => save(true)} disabled={pending}>
            Move anyway
          </button>
        </div>
      )}
      {error && (
        <div className="mt-2">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
    </li>
  );
}
