"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRightLeft, CalendarX2, ExternalLink, Layers, TriangleAlert, UserMinus } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Badge, ColourBadge, DefinitionList, Mono, Notice, Select, buttonClass, priorityTone } from "@/components/ui/primitives";
import { label } from "@/lib/format";
import { fmtSlot, fromLocalInput, toLocalInput } from "../_lib/time";
import { ASSIGNMENT_STATUSES, type Booking, type Clash, type Operative, type Proposal, type StatusInfo, type Sub } from "../_lib/types";
import { ASSIGNMENT_LABEL } from "./blocks";

type Props = {
  booking: Booking | null;
  operatives: Operative[];
  subs: Sub[];
  /** subcontractors that can be booked (select menu) */
  subOptions: Sub[];
  statuses: Record<string, StatusInfo>;
  clash?: string[];
  canEdit: boolean;
  linkPeople: boolean;
  linkSubs: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (p: Proposal, opts: { check: boolean }) => void;
  onUnassign: (id: string) => void;
  onMove: (id: string) => void;
};

export function BookingDialog(props: Props) {
  const b = props.booking;
  return (
    <Modal open={Boolean(b)} onClose={props.onClose} title={b ? `${b.job.reference} booking` : "Booking"} description={b ? b.job.title : undefined} size="lg">
      {b && <Body key={b.id} {...props} booking={b} />}
    </Modal>
  );
}

function Body({ booking: b, operatives, subs, subOptions, statuses, clash, canEdit, linkPeople, linkSubs, busy, onClose, onSave, onUnassign, onMove }: Props & { booking: Booking }) {
  const resourceValue = b.employeeId ? `e:${b.employeeId}` : `s:${b.subcontractorId}`;
  const [start, setStart] = useState(toLocalInput(b.start));
  const [end, setEnd] = useState(toLocalInput(b.end));
  const [resource, setResource] = useState(resourceValue);
  const [status, setStatus] = useState(b.status);
  const [confirmUnassign, setConfirmUnassign] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const op = b.employeeId ? operatives.find((o) => o.id === b.employeeId) : null;
  const sub = b.subcontractorId ? subs.find((s) => s.id === b.subcontractorId) : null;
  const who = op?.name ?? sub?.name ?? "Unknown";
  const whoHref = op && linkPeople ? `/workforce/${op.id}` : sub && linkSubs ? `/subcontractors/${sub.id}` : null;
  const st = statuses[b.job.status];
  const statusOptions = ASSIGNMENT_STATUSES.some((s) => s.value === b.status) ? ASSIGNMENT_STATUSES : [...ASSIGNMENT_STATUSES, { value: b.status, label: label(b.status) }];

  const save = () => {
    setError(null);
    const s = fromLocalInput(start), e = fromLocalInput(end);
    if (!s || !e) return setError("Enter a valid start and end.");
    if (Date.parse(e) <= Date.parse(s)) return setError("The end must be after the start.");
    const [kind, id] = resource.split(":");
    const retimed = start !== toLocalInput(b.start) || end !== toLocalInput(b.end);
    const moved = retimed || resource !== resourceValue;
    if (!moved && status === b.status) return onClose();
    onSave(
      {
        kind: "move",
        bookingId: b.id,
        employeeId: kind === "e" ? id : null,
        subcontractorId: kind === "s" ? id : null,
        start: retimed ? s : b.start,
        end: retimed ? e : b.end,
        status: status !== b.status ? status : undefined,
      },
      { check: moved },
    );
  };

  return (
    <div className="grid gap-5" data-testid="booking-dialog">
      <div className="flex flex-wrap items-center gap-2">
        <Mono>{b.job.reference}</Mono>
        {st && <ColourBadge colour={st.colour}>Job: {st.label}</ColourBadge>}
        <Badge tone={priorityTone[b.job.priority] ?? "neutral"}>{label(b.job.priority)}</Badge>
        <Badge tone="neutral">Visit: {ASSIGNMENT_LABEL[b.status] ?? label(b.status)}</Badge>
        <Link href={`/jobs/${b.job.id}`} className={buttonClass("subtle", "sm", "ml-auto")}>
          Open job <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      </div>

      {clash?.length ? (
        <Notice tone="bad" title="This booking clashes">
          <ul className="list-disc pl-4">
            {clash.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <DefinitionList
        items={[
          { label: "Booked with", value: whoHref ? <Link href={whoHref} className="text-accent-hi hover:underline">{who}</Link> : who },
          { label: "When", value: fmtSlot(b.start, b.end) },
          { label: "Postcode", value: b.job.postcode ?? "-" },
          { label: "Estimated", value: b.job.estimatedHours !== null ? `${b.job.estimatedHours.toFixed(1)} hours` : "-" },
        ]}
      />

      {canEdit ? (
        <div className="grid gap-4 border-t border-line pt-5">
          {error && <Notice tone="bad">{error}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="bk-start" className="mb-1.5 block text-[13px] font-medium text-muted">Start</label>
              <input id="bk-start" type="datetime-local" step={900} value={start} onChange={(e) => setStart(e.target.value)} className="h-10 w-full rounded-[10px] border border-line-strong bg-sunken px-3 text-sm text-fg [color-scheme:dark] focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none" />
            </div>
            <div>
              <label htmlFor="bk-end" className="mb-1.5 block text-[13px] font-medium text-muted">End</label>
              <input id="bk-end" type="datetime-local" step={900} value={end} onChange={(e) => setEnd(e.target.value)} className="h-10 w-full rounded-[10px] border border-line-strong bg-sunken px-3 text-sm text-fg [color-scheme:dark] focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none" />
            </div>
            <div>
              <label htmlFor="bk-who" className="mb-1.5 block text-[13px] font-medium text-muted">Operative</label>
              <Select id="bk-who" value={resource} onChange={(e) => setResource(e.target.value)}>
                <optgroup label="Operatives">
                  {operatives.map((o) => (
                    <option key={o.id} value={`e:${o.id}`}>
                      {o.name}
                      {` · ${o.tradeLabel}`}
                    </option>
                  ))}
                </optgroup>
                {subOptions.length > 0 && (
                  <optgroup label="Subcontractors">
                    {subOptions.map((s) => (
                      <option key={s.id} value={`s:${s.id}`}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {!operatives.some((o) => `e:${o.id}` === resourceValue) && !subOptions.some((s) => `s:${s.id}` === resourceValue) && <option value={resourceValue}>{who}</option>}
              </Select>
            </div>
            <div>
              <label htmlFor="bk-status" className="mb-1.5 block text-[13px] font-medium text-muted">Visit status</label>
              <Select id="bk-status" value={status} onChange={(e) => setStatus(e.target.value)}>
                {statusOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <p className="text-xs text-subtle">Times are UK time. Changing the time or operative checks for clashes before saving.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={save} disabled={busy} className={buttonClass("primary", "md")}>
              Save changes
            </button>
            <button type="button" onClick={() => onMove(b.id)} disabled={busy} className={buttonClass("secondary", "md")} title="Then click a cell or time slot on the planner">
              <ArrowRightLeft className="size-4" aria-hidden />
              Move on planner
            </button>
            <div className="ml-auto flex items-center gap-2">
              {confirmUnassign ? (
                <>
                  <span className="text-xs text-muted">Cancel this booking?</span>
                  <button type="button" onClick={() => setConfirmUnassign(false)} className={buttonClass("ghost", "sm")}>
                    Keep
                  </button>
                  <button type="button" onClick={() => onUnassign(b.id)} disabled={busy} className={buttonClass("danger", "sm")}>
                    Yes, unassign
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmUnassign(true)} disabled={busy} className={buttonClass("danger", "md")}>
                  <UserMinus className="size-4" aria-hidden />
                  Unassign
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="border-t border-line pt-4 text-xs text-subtle">Read only: changing bookings needs the Schedule (write) and Assign work orders permissions.</p>
      )}
    </div>
  );
}

/** Shown before committing any booking that clashes (from assignment_conflicts()). */
export function ClashDialog({ open, title, clashes, onCancel, onConfirm }: { open: boolean; title: string; clashes: Clash[]; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} title="This booking clashes" description={title}>
      <div data-testid="clash-dialog">
        <p className="mb-3 text-sm text-muted">The operative is already committed during this time:</p>
        <ul className="space-y-2">
          {clashes.map((c, i) => (
            <li key={i} className="flex items-start gap-3 rounded-xl border border-[#5a1f1d] bg-bad-lo/50 px-3 py-2.5">
              {c.kind === "absence" ? <CalendarX2 className="mt-0.5 size-4 shrink-0 text-[#ff8a87]" aria-hidden /> : <Layers className="mt-0.5 size-4 shrink-0 text-[#ff8a87]" aria-hidden />}
              <div className="min-w-0">
                <div className="text-sm font-medium text-fg">{c.kind === "absence" ? `Absence: ${c.label}` : c.label}</div>
                <div className="text-xs text-muted">{fmtSlot(c.start, c.end)}</div>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-start gap-2 text-xs text-subtle">
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-warn" aria-hidden />
          Booking anyway leaves the clash flagged on the planner until it is resolved.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={buttonClass("secondary", "md")} autoFocus>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className={buttonClass("danger", "md")}>
            Book anyway
          </button>
        </div>
      </div>
    </Modal>
  );
}
