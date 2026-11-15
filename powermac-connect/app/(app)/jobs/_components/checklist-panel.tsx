"use client";

import { useOptimistic, useState, useTransition } from "react";
import { CheckCircle2, Trash2 } from "lucide-react";
import { ActionForm, SelectField, SubmitButton } from "@/components/ui/form";
import { Badge, buttonClass, Card, CardHeader, cx, EmptyState, Notice } from "@/components/ui/primitives";
import { attachChecklist, removeChecklist, toggleChecklistItem } from "../[id]/actions";

export type ChecklistItem = { label: string; required: boolean; done: boolean; done_at: string | null; done_by: string | null };
export type Checklist = { id: string; name: string; items: ChecklistItem[]; completed_at: string | null; completed_by: string | null };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export function ChecklistPanel({ jobId, checklists, templates, canWrite }: { jobId: string; checklists: Checklist[]; templates: { value: string; label: string }[]; canWrite: boolean }) {
  return (
    <div className="grid gap-4">
      {checklists.length === 0 && (
        <Card>
          <EmptyState title="No checklist on this job">Attach a checklist so the operative and office can tick off each step. Required items must be done before the checklist completes.</EmptyState>
        </Card>
      )}
      {checklists.map((c) => (
        <ChecklistCard key={c.id} c={c} canWrite={canWrite} />
      ))}
      {canWrite && (
        <Card>
          <CardHeader title="Attach a checklist" description="Templates are managed by administrators." />
          <ActionForm action={attachChecklist} resetOnSuccess className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="job_id" value={jobId} />
            <SelectField name="template_id" label="Checklist template" required options={templates} placeholder={templates.length ? "Choose a template…" : "No templates set up"} />
            <SubmitButton pendingLabel="Attaching…">Attach</SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}

function ChecklistCard({ c, canWrite }: { c: Checklist; canWrite: boolean }) {
  const [items, setOptimistic] = useOptimistic(c.items, (state: ChecklistItem[], u: { i: number; done: boolean }) => state.map((it, n) => (n === u.i ? { ...it, done: u.done } : it)));
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const required = items.filter((i) => i.required);
  const doneRequired = required.filter((i) => i.done).length;
  const doneAll = items.filter((i) => i.done).length;

  const toggle = (i: number, done: boolean) => {
    setError(null);
    setMsg(null);
    start(async () => {
      setOptimistic({ i, done });
      const res = await toggleChecklistItem(c.id, i, done);
      if (!res.ok) setError(res.message ?? "Could not save.");
      else if (res.message) setMsg(res.message);
    });
  };

  return (
    <Card data-checklist={c.name}>
      <CardHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {c.name}
            {c.completed_at ? (
              <Badge tone="ok">
                <CheckCircle2 className="size-3" aria-hidden /> Complete
              </Badge>
            ) : (
              <Badge tone="warn">In progress</Badge>
            )}
          </span>
        }
        description={
          c.completed_at
            ? `Completed ${when(c.completed_at)}${c.completed_by ? ` by ${c.completed_by}` : ""}`
            : `${doneRequired} of ${required.length} required items done · ${doneAll}/${items.length} overall`
        }
        actions={
          canWrite && !c.completed_at && doneAll === 0 ? (
            <button
              type="button"
              className={buttonClass("ghost", "sm", "px-2")}
              aria-label={`Remove ${c.name}`}
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Remove ${c.name} from this job?`)) return;
                start(async () => {
                  const res = await removeChecklist(c.id);
                  if (!res.ok) setError(res.message ?? "Could not remove.");
                });
              }}
            >
              <Trash2 className="size-4" />
            </button>
          ) : null
        }
      />
      <div className="h-1 bg-sunken" aria-hidden>
        <div className="h-full bg-ok transition-[width]" style={{ width: `${items.length ? (doneAll / items.length) * 100 : 0}%` }} />
      </div>
      <ul className="divide-y divide-line">
        {items.map((it, i) => (
          <li key={i}>
            <label className={cx("flex items-start gap-3 px-5 py-3", canWrite ? "cursor-pointer hover:bg-raised/40" : "")}>
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[#22c7b8]" checked={it.done} disabled={!canWrite || pending} onChange={(e) => toggle(i, e.target.checked)} />
              <span className="min-w-0 flex-1">
                <span className={cx("text-sm", it.done ? "text-muted line-through decoration-subtle" : "text-fg")}>{it.label}</span>
                {it.required && !it.done && <span className="ml-2 text-[11px] font-medium text-[#ffc56b]">Required</span>}
                {it.done && it.done_by && it.done_at && (
                  <span className="block text-[11.5px] text-subtle">
                    {it.done_by} · {when(it.done_at)}
                  </span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {(error || msg) && <div className="px-5 pb-4">{error ? <Notice tone="bad">{error}</Notice> : <Notice tone="ok">{msg}</Notice>}</div>}
    </Card>
  );
}
