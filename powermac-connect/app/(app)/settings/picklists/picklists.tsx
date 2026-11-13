"use client";

import { useTransition } from "react";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { Card, CardBody, CardHeader, Badge } from "@/components/ui/primitives";
import { LinkTabs } from "@/components/ui/url-controls";
import { addValue, toggleValue } from "./actions";

const LISTS: Record<string, string> = {
  trade: "Trades", work_category: "Work categories", property_type: "Property types", organisation_category: "Client categories",
  contract_type: "Contract types", document_category: "Document categories", skill: "Skills & tickets", absence_type: "Absence types", lead_source: "Lead sources",
};

export function Picklists({ current, values }: { current: string; values: { id: string; list: string; key: string; label: string; is_active: boolean }[] }) {
  const [pending, start] = useTransition();
  const rows = values.filter((v) => v.list === current);
  return (
    <Card>
      <CardHeader title="Picklists" description="The options people choose from across the system. Values in use can be hidden but not deleted, so history stays intact." />
      <div className="px-5"><LinkTabs current={current} tabs={Object.entries(LISTS).map(([k, l]) => ({ key: k, label: l, href: `/settings/picklists?list=${k}`, count: values.filter((v) => v.list === k && v.is_active).length }))} /></div>
      <CardBody>
        <ActionForm action={addValue} resetOnSuccess className="mb-5 flex flex-wrap items-end gap-3">
          <input type="hidden" name="list" value={current} />
          <TextField name="label" label={`Add to ${LISTS[current] ?? current}`} className="w-72" required />
          <SubmitButton variant="secondary">Add</SubmitButton>
        </ActionForm>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-sunken px-3 py-2">
              <div className="min-w-0">
                <div className={v.is_active ? "text-sm" : "text-sm text-subtle line-through"}>{v.label}</div>
                <div className="font-mono text-[11px] text-subtle">{v.key}</div>
              </div>
              <button disabled={pending} onClick={() => start(async () => { await toggleValue(v.id, !v.is_active); })} className="text-xs text-accent-hi hover:underline disabled:opacity-50">
                {v.is_active ? "Hide" : "Restore"}
              </button>
            </li>
          ))}
        </ul>
        {!rows.length && <Badge>No values yet</Badge>}
      </CardBody>
    </Card>
  );
}
