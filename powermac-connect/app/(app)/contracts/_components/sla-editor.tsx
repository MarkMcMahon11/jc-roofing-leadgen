"use client";

import { Check } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Badge, Input, priorityTone } from "@/components/ui/primitives";
import { ActionButton } from "../../crm/_components/action-button";
import { removeSla, saveSla } from "../actions";
import { PRIORITIES, hours } from "../_lib/constants";

export type Sla = { priority: string; response_hours: number | null; attend_hours: number | null; complete_hours: number | null; description: string | null };

const COLS = "lg:grid-cols-[140px_repeat(3,minmax(0,1fr))_minmax(0,1.6fr)_150px]";

export function SlaEditor({ contractId, slas, canWrite }: { contractId: string; slas: Sla[]; canWrite: boolean }) {
  return (
    <div>
      <div className={`hidden gap-3 border-b border-line bg-sunken/80 px-5 py-2.5 text-xs font-medium tracking-wide text-subtle uppercase lg:grid ${COLS}`}>
        <span>Priority</span>
        <span>Respond within</span>
        <span>Attend within</span>
        <span>Complete within</span>
        <span>Applies to</span>
        <span className="sr-only">Actions</span>
      </div>
      {PRIORITIES.map((p) => {
        const sla = slas.find((s) => s.priority === p.key);
        return canWrite ? <SlaRow key={p.key} contractId={contractId} priority={p.key} label={p.label} sla={sla} /> : <SlaReadRow key={p.key} label={p.label} priority={p.key} sla={sla} />;
      })}
    </div>
  );
}

function SlaReadRow({ label, priority, sla }: { label: string; priority: string; sla?: Sla }) {
  return (
    <div className={`grid grid-cols-2 gap-3 border-b border-line/70 px-5 py-3.5 text-sm last:border-0 lg:items-center ${COLS}`}>
      <div className="col-span-2 lg:col-span-1"><Badge tone={priorityTone[priority]}>{label}</Badge></div>
      {sla ? (
        <>
          <Value label="Respond within" v={hours(sla.response_hours)} />
          <Value label="Attend within" v={hours(sla.attend_hours)} />
          <Value label="Complete within" v={hours(sla.complete_hours)} />
          <div className="col-span-2 text-[13px] text-muted lg:col-span-2">{sla.description ?? "-"}</div>
        </>
      ) : (
        <p className="col-span-2 text-[13px] text-subtle lg:col-span-5">No SLA set for {label.toLowerCase()} jobs.</p>
      )}
    </div>
  );
}

function Value({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-subtle lg:hidden">{label}</div>
      <div className="tabular">{v}</div>
    </div>
  );
}

function SlaRow({ contractId, priority, label, sla }: { contractId: string; priority: string; label: string; sla?: Sla }) {
  return (
    <ActionForm action={saveSla} className="border-b border-line/70 px-5 py-3.5 last:border-0">
      {(state) => (
        <div className={`grid grid-cols-3 gap-3 lg:items-start ${COLS}`}>
          <input type="hidden" name="contract_id" value={contractId} />
          <input type="hidden" name="priority" value={priority} />
          <div className="col-span-3 flex items-center gap-2 lg:col-span-1 lg:pt-2">
            <Badge tone={priorityTone[priority]}>{label}</Badge>
            {!sla && <span className="text-xs text-subtle">Not set</span>}
          </div>
          {(["response_hours", "attend_hours", "complete_hours"] as const).map((f, i) => {
            const err = state.fieldErrors?.[f]?.[0];
            const id = `${priority}-${f}`;
            return (
              <div key={f} className="min-w-0">
                <label htmlFor={id} className="mb-1 block text-xs text-subtle lg:sr-only">
                  {["Respond", "Attend", "Complete"][i]} within (hours)
                </label>
                <div className="relative">
                  <Input id={id} name={f} type="number" inputMode="decimal" min={0.25} step="0.25" defaultValue={sla?.[f] ?? ""} aria-invalid={Boolean(err)} className="h-9 pr-8 tabular" placeholder="-" />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-subtle">h</span>
                </div>
                {err ? <p className="mt-1 text-xs text-[#ff9b98]">{err}</p> : sla?.[f] && Number(sla[f]) >= 48 ? <p className="mt-1 text-[11px] text-subtle">= {hours(sla[f])}</p> : null}
              </div>
            );
          })}
          <div className="col-span-3 min-w-0 lg:col-span-1">
            <label htmlFor={`${priority}-description`} className="mb-1 block text-xs text-subtle lg:sr-only">
              Applies to
            </label>
            <Input id={`${priority}-description`} name="description" defaultValue={sla?.description ?? ""} maxLength={500} className="h-9" placeholder="What counts as this priority" />
          </div>
          <div className="col-span-3 flex items-center gap-2 lg:col-span-1 lg:justify-end">
            <SubmitButton size="sm" variant="secondary" pendingLabel="Saving…">
              {sla ? "Save" : "Add"}
            </SubmitButton>
            {state.ok && <Check className="size-4 text-ok" aria-label="Saved" />}
            {sla && (
              <ActionButton link className="text-muted hover:text-[#ff8a87]" confirm={`Remove the ${label.toLowerCase()} SLA?`} action={() => removeSla(contractId, priority)}>
                Remove
              </ActionButton>
            )}
          </div>
        </div>
      )}
    </ActionForm>
  );
}
