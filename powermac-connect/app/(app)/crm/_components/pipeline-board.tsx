"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarDays, FileSignature, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { ActionForm, SubmitButton, TextAreaField } from "@/components/ui/form";
import { Badge, Button, cx, Select } from "@/components/ui/primitives";
import { date, initials, money } from "@/lib/format";
import { deleteOpportunity, moveOpportunity } from "../actions";
import { STAGES, gbpShort, type Opt } from "../_lib/shared";
import { OpportunityForm, type OppValues } from "./opportunity-form";

export type Opp = {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  stage: string;
  value: number;
  probability: number;
  expected_close_date: string | null;
  organisation_id: string;
  org_name: string;
  contact_id: string | null;
  contact_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  source: string | null;
  lost_reason: string | null;
  closed_at: string | null;
  contract_id: string | null;
};

type Props = {
  opps: Opp[];
  orgs: Opt[];
  staff: Opt[];
  sources: Opt[];
  me: string;
  today: string;
  canWrite: boolean;
  canDelete: boolean;
  canCreateContract: boolean;
};

export function NewOpportunityButton({ orgs, staff, sources, me }: Pick<Props, "orgs" | "staff" | "sources" | "me">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        New opportunity
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New opportunity" description="Track a tender, framework or work package from first contact to award." size="lg">
        {open && <OpportunityForm values={{}} orgs={orgs} staff={staff} sources={sources} me={me} onDone={() => setOpen(false)} />}
      </Modal>
    </>
  );
}

export function PipelineBoard(props: Props) {
  const { opps, canWrite } = props;
  const [editing, setEditing] = useState<Opp | null>(null);
  const [losing, setLosing] = useState<Opp | null>(null);
  return (
    <>
      <div className="-mx-4 overflow-x-auto px-4 pb-3 md:-mx-8 md:px-8" role="region" aria-label="Pipeline board" tabIndex={0}>
        <div className="flex min-w-max gap-3">
          {STAGES.map((stage) => {
            const items = opps.filter((o) => o.stage === stage.key);
            const total = items.reduce((a, o) => a + Number(o.value), 0);
            const weighted = items.reduce((a, o) => a + (Number(o.value) * o.probability) / 100, 0);
            const closed = stage.key === "won" || stage.key === "lost";
            return (
              <section key={stage.key} className="flex w-[280px] shrink-0 flex-col rounded-[14px] border border-line bg-chrome/70" aria-label={`${stage.label}: ${items.length}`}>
                <header className="border-b border-line px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
                      <Badge tone={stage.tone} dot>
                        {stage.label}
                      </Badge>
                      <span className="text-xs font-normal text-subtle tabular">{items.length}</span>
                    </h2>
                    {closed && <span className="text-[11px] text-subtle">last 12 months</span>}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-subtle">Total</dt>
                      <dd className="font-medium text-fg tabular">{gbpShort(total)}</dd>
                    </div>
                    <div>
                      <dt className="text-subtle">Weighted</dt>
                      <dd className="font-medium text-fg tabular">{gbpShort(weighted)}</dd>
                    </div>
                  </dl>
                </header>
                <ul className="flex flex-1 flex-col gap-2 p-2.5">
                  {items.map((o) => (
                    <OppCard key={o.id} o={o} {...props} onEdit={() => setEditing(o)} onLose={() => setLosing(o)} />
                  ))}
                  {!items.length && <li className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-subtle">Nothing here</li>}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      {canWrite && (
        <>
          <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit opportunity" description={editing?.reference} size="lg">
            {editing && (
              <OpportunityForm
                values={editing as OppValues}
                orgs={props.orgs.some((o) => o.value === editing.organisation_id) ? props.orgs : [...props.orgs, { value: editing.organisation_id, label: editing.org_name }]}
                staff={props.staff}
                sources={props.sources}
                me={props.me}
                onDone={() => setEditing(null)}
              />
            )}
          </Modal>
          <Modal open={losing !== null} onClose={() => setLosing(null)} title="Mark as lost" description={losing?.title}>
            {losing && (
              <ActionForm action={moveOpportunity} onSuccess={() => setLosing(null)} className="grid gap-4">
                <input type="hidden" name="id" value={losing.id} />
                <input type="hidden" name="stage" value="lost" />
                <TextAreaField name="lost_reason" label="Why was it lost?" required maxLength={1000} rows={3} placeholder="e.g. Price - came second on cost, first on quality" />
                <div className="flex gap-2">
                  <SubmitButton variant="danger">Mark as lost</SubmitButton>
                  <Button type="button" variant="ghost" onClick={() => setLosing(null)}>
                    Cancel
                  </Button>
                </div>
              </ActionForm>
            )}
          </Modal>
        </>
      )}
    </>
  );
}

function OppCard({ o, canWrite, canDelete, canCreateContract, today, onEdit, onLose }: Props & { o: Opp; onEdit: () => void; onLose: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const open = o.stage !== "won" && o.stage !== "lost";
  const late = open && o.expected_close_date && o.expected_close_date < today;
  const move = (stage: string) => {
    if (stage === o.stage) return;
    if (stage === "lost") return onLose();
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set("id", o.id);
      fd.set("stage", stage);
      const r = await moveOpportunity({ ok: false }, fd);
      if (!r.ok) setError(r.message ?? "Could not move it.");
    });
  };
  return (
    <li className={cx("rounded-xl border bg-surface px-3 py-2.5 shadow-[var(--shadow-card)] transition-opacity", late ? "border-[#57400f]" : "border-line", pending && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13.5px] leading-snug font-medium text-fg">{o.title}</p>
        {o.owner_name && (
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-raised text-[10px] font-semibold text-muted" title={`Owner: ${o.owner_name}`}>
            {initials(o.owner_name)}
          </span>
        )}
      </div>
      <Link href={`/crm/${o.organisation_id}`} className="mt-0.5 block truncate text-xs text-accent-hi hover:underline">
        {o.org_name}
      </Link>
      {o.contact_name && <p className="truncate text-xs text-subtle">{o.contact_name}</p>}
      <div className="mt-2 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-sm font-semibold text-fg tabular">{money(o.value, { whole: true })}</span>
        <span className="text-subtle tabular" title="Weighted value = value × probability">
          {o.probability}% · {gbpShort((Number(o.value) * o.probability) / 100)}
        </span>
      </div>
      {(o.expected_close_date || o.closed_at) && (
        <p className={cx("mt-1 flex items-center gap-1 text-[11.5px]", late ? "text-[#ffc56b]" : "text-subtle")}>
          <CalendarDays className="size-3" aria-hidden />
          {open ? `${late ? "Overdue: " : ""}close ${date(o.expected_close_date)}` : `${o.stage === "won" ? "Won" : "Lost"} ${date(o.closed_at)}`}
        </p>
      )}
      {o.stage === "lost" && o.lost_reason && <p className="mt-1 line-clamp-2 text-[11.5px] text-muted">{o.lost_reason}</p>}
      {o.stage === "won" &&
        (o.contract_id ? (
          <Link href={`/contracts/${o.contract_id}`} className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-accent-hi hover:underline">
            <FileSignature className="size-3" aria-hidden />
            View contract
          </Link>
        ) : canCreateContract ? (
          <Link href={`/contracts/new?org=${o.organisation_id}&opportunity=${o.id}`} className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] text-accent-hi hover:underline">
            <FileSignature className="size-3" aria-hidden />
            Create contract
          </Link>
        ) : null)}
      {canWrite && (
        <div className="mt-2.5 flex items-center gap-1.5 border-t border-line/70 pt-2.5">
          <Select aria-label={`Move ${o.title} to stage`} value={o.stage} onChange={(e) => move(e.target.value)} disabled={pending} className="h-8 flex-1 text-[12.5px]">
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>
          {pending && <Loader2 className="size-3.5 animate-spin text-subtle" aria-label="Saving" />}
          <button type="button" onClick={onEdit} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-raised hover:text-fg" aria-label={`Edit ${o.title}`}>
            <Pencil className="size-3.5" />
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(`Delete "${o.title}" from the pipeline? This cannot be undone.`)) return;
                start(async () => {
                  const r = await deleteOpportunity(o.id);
                  if (!r.ok) setError(r.message ?? "Could not delete it.");
                });
              }}
              className="grid size-8 place-items-center rounded-lg text-muted hover:bg-bad-lo hover:text-[#ff8a87]"
              aria-label={`Delete ${o.title}`}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-[#ff9b98]">
          {error}
        </p>
      )}
    </li>
  );
}
