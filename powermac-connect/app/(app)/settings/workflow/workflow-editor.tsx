"use client";

import { useState, useTransition } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Card, CardHeader, ColourBadge, Notice, Input, cx } from "@/components/ui/primitives";
import type { JobStatus } from "@/lib/data/lookups";
import { setTransition, updateStatus } from "./actions";

type T = { from_key: string; to_key: string; required_permission: string | null };
const PERMS = [
  { value: "", label: "Anyone who can edit jobs" },
  { value: "work_orders.approve", label: "Needs job approval" },
  { value: "work_orders.assign", label: "Needs job assignment" },
  { value: "finance.write", label: "Needs finance" },
];

export function WorkflowEditor({ statuses, transitions }: { statuses: JobStatus[]; transitions: T[] }) {
  const [rules, setRules] = useState(transitions);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const find = (f: string, t: string) => rules.find((r) => r.from_key === f && r.to_key === t);
  const change = (f: string, t: string, allowed: boolean, perm: string | null) => {
    setError(null);
    const prev = rules;
    setRules(allowed ? [...rules.filter((r) => !(r.from_key === f && r.to_key === t)), { from_key: f, to_key: t, required_permission: perm }] : rules.filter((r) => !(r.from_key === f && r.to_key === t)));
    start(async () => {
      const res = await setTransition(f, t, allowed, perm);
      if (!res.ok) { setRules(prev); setError(res.message ?? "Could not save."); }
    });
  };
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader title="Statuses" description="Rename statuses, set the wording clients see and the colour used on boards." />
        <div className="divide-y divide-line">
          {statuses.map((s) => (
            <ActionForm key={s.key} action={updateStatus} className="grid items-center gap-3 px-5 py-3 md:grid-cols-[180px_1fr_1fr_120px_auto]">
              <input type="hidden" name="key" value={s.key} />
              <div className="flex items-center gap-2"><ColourBadge colour={s.colour}>{s.label}</ColourBadge></div>
              <Input name="label" defaultValue={s.label} aria-label={`Label for ${s.key}`} className="h-9" />
              <Input name="client_label" defaultValue={s.client_label ?? ""} placeholder="Client wording" aria-label={`Client wording for ${s.key}`} className="h-9" />
              <input type="color" name="colour" defaultValue={s.colour} aria-label={`Colour for ${s.key}`} className="h-9 w-full cursor-pointer rounded-lg border border-line-strong bg-sunken p-1" />
              <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
            </ActionForm>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Allowed moves" description="Which status a job may move to next, and who may make the move. Enforced by the database for every user and integration." actions={pending ? <span className="text-xs text-accent-hi">Saving…</span> : null} />
        {error && <div className="px-5 pt-4"><Notice tone="bad">{error}</Notice></div>}
        <div className="divide-y divide-line">
          {statuses.map((from) => (
            <div key={from.key} className="grid gap-3 px-5 py-4 md:grid-cols-[200px_1fr]">
              <div><ColourBadge colour={from.colour}>{from.label}</ColourBadge></div>
              <div className="flex flex-wrap gap-2">
                {statuses.filter((t) => t.key !== from.key).map((to) => {
                  const rule = find(from.key, to.key);
                  return (
                    <div key={to.key} className={cx("flex items-center gap-1.5 rounded-lg border px-2 py-1", rule ? "border-[#1d3d78] bg-accent-lo/50" : "border-line bg-sunken")}>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                        <input type="checkbox" className="accent-[#2f7dff]" checked={Boolean(rule)} onChange={(e) => change(from.key, to.key, e.target.checked, rule?.required_permission ?? null)} disabled={pending} />
                        <span className={rule ? "text-fg" : "text-subtle"}>{to.label}</span>
                      </label>
                      {rule && (
                        <select
                          aria-label={`Who may move ${from.label} to ${to.label}`}
                          value={rule.required_permission ?? ""}
                          onChange={(e) => change(from.key, to.key, true, e.target.value || null)}
                          className="rounded border-0 bg-transparent py-0 pr-1 text-[11px] text-accent-hi focus:ring-1"
                        >
                          {PERMS.map((p) => <option key={p.value} value={p.value} className="bg-raised">{p.label}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
