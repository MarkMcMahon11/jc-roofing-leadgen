"use client";

import { useState } from "react";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { ButtonLink, Card, CardBody, CardHeader, Notice } from "@/components/ui/primitives";
import { useContactOptions } from "../../crm/_components/opportunity-form";
import type { Opt } from "../../crm/_lib/shared";
import { saveContract } from "../actions";
import { CONTRACT_STATUSES, PRICING_BASIS } from "../_lib/constants";

export type ContractFormValues = {
  id?: string;
  opportunity_id?: string;
  organisation_id?: string;
  title?: string;
  client_reference?: string | null;
  contract_type?: string;
  scope_of_work?: string | null;
  status?: string;
  value?: number | null;
  annual_budget?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  renewal_date?: string | null;
  notice_period_days?: number | null;
  payment_terms_days?: number | null;
  retention_percent?: number | null;
  pricing_basis?: string;
  contract_manager_id?: string | null;
  client_contact_id?: string | null;
  auto_renew?: boolean;
  notes?: string | null;
};

const s = (x: string | number | null | undefined) => (x === null || x === undefined ? "" : String(x));

export function ContractForm({ values, orgs, staff, types, cancelHref }: { values: ContractFormValues; orgs: Opt[]; staff: Opt[]; types: Opt[]; cancelHref: string }) {
  const v = values;
  const [org, setOrg] = useState(v.organisation_id ?? "");
  const contacts = useContactOptions(org);
  return (
    <ActionForm action={saveContract} className="grid gap-6">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      {v.opportunity_id && <input type="hidden" name="opportunity_id" value={v.opportunity_id} />}
      {!v.id && <Notice tone="info">Standard SLAs (emergency, urgent, routine, planned) and three KPIs are added automatically. Adjust them on the contract once it is created.</Notice>}

      <Card>
        <CardHeader title="Contract" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <SelectField name="organisation_id" label="Client" required options={orgs} placeholder="Choose a client…" value={org} onChange={(e) => setOrg(e.target.value)} />
          <SelectField
            key={org}
            name="client_contact_id"
            label="Client contact"
            options={contacts.options}
            placeholder={!org ? "Choose a client first" : contacts.loading ? "Loading contacts…" : contacts.options.length ? "No named contact" : "No contacts at this client"}
            defaultValue={org === v.organisation_id ? (v.client_contact_id ?? "") : ""}
            disabled={!org || contacts.loading}
          />
          <TextField name="title" label="Title" required defaultValue={s(v.title)} maxLength={200} className="sm:col-span-2" placeholder="e.g. Responsive Repairs & Maintenance 2026-2029" />
          <SelectField name="contract_type" label="Contract type" required options={types} placeholder="Choose…" defaultValue={v.contract_type ?? ""} />
          <TextField name="client_reference" label="Client's reference" defaultValue={s(v.client_reference)} maxLength={60} hint="Their contract or framework number." />
          <SelectField name="status" label="Status" required options={CONTRACT_STATUSES} defaultValue={v.status ?? "draft"} />
          <SelectField name="contract_manager_id" label="Contract manager" options={staff} placeholder="Not assigned" defaultValue={v.contract_manager_id ?? ""} />
          <TextAreaField name="scope_of_work" label="Scope of work" defaultValue={s(v.scope_of_work)} maxLength={20000} rows={5} className="sm:col-span-2" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Value & commercial terms" />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField name="value" label="Contract value (£)" type="number" inputMode="decimal" min={0} step="0.01" required defaultValue={s(v.value)} hint="Total over the full term, excluding VAT." />
          <TextField name="annual_budget" label="Annual budget (£)" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={s(v.annual_budget)} hint="Spend is tracked against this." />
          <SelectField name="pricing_basis" label="Pricing basis" required options={PRICING_BASIS} defaultValue={v.pricing_basis ?? "schedule_of_rates"} />
          <TextField name="payment_terms_days" label="Payment terms (days)" type="number" inputMode="numeric" min={0} max={365} step={1} required defaultValue={s(v.payment_terms_days ?? 30)} />
          <TextField name="retention_percent" label="Retention (%)" type="number" inputMode="decimal" min={0} max={100} step="0.01" defaultValue={s(v.retention_percent ?? 0)} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Term & renewal" />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <TextField name="start_date" label="Start date" type="date" defaultValue={s(v.start_date)} />
          <TextField name="end_date" label="End date" type="date" defaultValue={s(v.end_date)} />
          <TextField name="renewal_date" label="Renewal decision date" type="date" defaultValue={s(v.renewal_date)} hint="When the extension or re-tender decision is due." />
          <TextField name="notice_period_days" label="Notice period (days)" type="number" inputMode="numeric" min={0} max={730} step={1} defaultValue={s(v.notice_period_days)} />
          <div className="flex items-end pb-2 sm:col-span-2">
            <CheckboxField name="auto_renew" label="Renews automatically" defaultChecked={v.auto_renew ?? false} hint="Unless notice is given before the end date." />
          </div>
          <TextAreaField name="notes" label="Notes" defaultValue={s(v.notes)} maxLength={10000} rows={3} className="sm:col-span-2 lg:col-span-3" />
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton>{v.id ? "Save changes" : "Create contract"}</SubmitButton>
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </ActionForm>
  );
}
