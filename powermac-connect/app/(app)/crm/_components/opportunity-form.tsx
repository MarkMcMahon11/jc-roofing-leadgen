"use client";

import { useEffect, useState, useTransition } from "react";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { Button } from "@/components/ui/primitives";
import { contactOptions, saveOpportunity } from "../actions";
import { STAGES, type Opt } from "../_lib/shared";

export type OppValues = {
  id?: string;
  organisation_id?: string;
  contact_id?: string | null;
  title?: string;
  description?: string | null;
  value?: number;
  probability?: number;
  expected_close_date?: string | null;
  owner_id?: string | null;
  source?: string | null;
  stage?: string;
};

/** Loads a client's contacts whenever the chosen client changes. */
export function useContactOptions(orgId: string) {
  const [state, setState] = useState<{ org: string; options: Opt[] }>({ org: "", options: [] });
  const [loading, start] = useTransition();
  useEffect(() => {
    if (!orgId) return;
    let live = true;
    start(async () => {
      const options = await contactOptions(orgId);
      if (live) setState({ org: orgId, options });
    });
    return () => {
      live = false;
    };
  }, [orgId]);
  return { options: orgId && state.org === orgId ? state.options : [], loading: loading || (Boolean(orgId) && state.org !== orgId) };
}

export function OpportunityForm({ values, orgs, staff, sources, me, onDone }: { values: OppValues; orgs: Opt[]; staff: Opt[]; sources: Opt[]; me: string; onDone: () => void }) {
  const v = values;
  const [org, setOrg] = useState(v.organisation_id ?? "");
  const contacts = useContactOptions(org);
  return (
    <ActionForm action={saveOpportunity} onSuccess={onDone} className="grid gap-4 sm:grid-cols-2">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <TextField name="title" label="Opportunity" required defaultValue={v.title ?? ""} maxLength={200} className="sm:col-span-2" placeholder="e.g. Gas servicing framework 2027-2030" />
      <SelectField name="organisation_id" label="Client" required options={orgs} placeholder="Choose a client…" value={org} onChange={(e) => setOrg(e.target.value)} />
      <SelectField
        key={org}
        name="contact_id"
        label="Contact"
        options={contacts.options}
        placeholder={!org ? "Choose a client first" : contacts.loading ? "Loading contacts…" : contacts.options.length ? "No specific contact" : "No contacts at this client"}
        defaultValue={org === v.organisation_id ? (v.contact_id ?? "") : ""}
        disabled={!org || contacts.loading}
      />
      <TextField name="value" label="Value (£)" type="number" inputMode="decimal" min={0} step="0.01" required defaultValue={v.value ?? ""} hint="Total contract value if won." />
      <TextField name="probability" label="Probability (%)" type="number" inputMode="numeric" min={0} max={100} step={1} required defaultValue={v.probability ?? 10} />
      <TextField name="expected_close_date" label="Expected close" type="date" defaultValue={v.expected_close_date ?? ""} />
      <SelectField name="owner_id" label="Owner" options={staff} defaultValue={v.owner_id ?? me} />
      <SelectField name="source" label="Source" options={sources} placeholder="Not recorded" defaultValue={v.source ?? ""} />
      {!v.id && (
        <SelectField
          name="stage"
          label="Stage"
          options={STAGES.filter((s) => s.key !== "won" && s.key !== "lost").map((s) => ({ value: s.key, label: s.label }))}
          defaultValue={v.stage ?? "lead"}
        />
      )}
      <TextAreaField name="description" label="Notes" defaultValue={v.description ?? ""} maxLength={10000} className="sm:col-span-2" rows={3} />
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton>{v.id ? "Save opportunity" : "Add to pipeline"}</SubmitButton>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </ActionForm>
  );
}
