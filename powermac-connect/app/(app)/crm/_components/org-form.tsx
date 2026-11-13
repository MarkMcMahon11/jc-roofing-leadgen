"use client";

import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { ButtonLink, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { saveOrganisation } from "../actions";
import { ORG_STATUSES, type Opt } from "../_lib/shared";

export type OrgFormValues = {
  id?: string;
  name?: string;
  category?: string;
  status?: string;
  company_number?: string | null;
  vat_number?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  town?: string | null;
  postcode?: string | null;
  account_manager_id?: string | null;
  contract_manager_id?: string | null;
  payment_terms_days?: number | null;
  credit_limit?: number | null;
  tags?: string[] | null;
  notes?: string | null;
};

export function OrgForm({ values, categories, staff, cancelHref }: { values: OrgFormValues; categories: Opt[]; staff: Opt[]; cancelHref: string }) {
  const v = values;
  const s = (x: string | number | null | undefined) => (x === null || x === undefined ? "" : String(x));
  return (
    <ActionForm action={saveOrganisation} className="grid gap-6">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <Card>
        <CardHeader title="Organisation" description="The contractual client - the company you hold contracts with." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <TextField name="name" label="Client name" required defaultValue={s(v.name)} maxLength={200} className="sm:col-span-2" autoComplete="organization" />
          <SelectField name="category" label="Category" required options={categories} placeholder="Choose…" defaultValue={v.category ?? ""} />
          <SelectField name="status" label="Status" required options={ORG_STATUSES} defaultValue={v.status ?? "prospect"} hint="Prospects become active once you hold a contract or do work for them." />
          <TextField name="company_number" label="Company number" defaultValue={s(v.company_number)} maxLength={20} hint="Companies House number, if registered." />
          <TextField name="vat_number" label="VAT number" defaultValue={s(v.vat_number)} maxLength={20} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Contact details & address" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <TextField name="email" label="General email" type="email" defaultValue={s(v.email)} maxLength={320} />
          <TextField name="phone" label="Main phone" type="tel" defaultValue={s(v.phone)} maxLength={40} />
          <TextField name="website" label="Website" defaultValue={s(v.website)} maxLength={200} placeholder="www.example.co.uk" className="sm:col-span-2" />
          <TextField name="address_line1" label="Address line 1" defaultValue={s(v.address_line1)} maxLength={200} autoComplete="address-line1" />
          <TextField name="address_line2" label="Address line 2" defaultValue={s(v.address_line2)} maxLength={200} autoComplete="address-line2" />
          <TextField name="town" label="Town / city" defaultValue={s(v.town)} maxLength={100} autoComplete="address-level2" />
          <TextField name="postcode" label="Postcode" defaultValue={s(v.postcode)} maxLength={10} autoComplete="postal-code" className="sm:max-w-48" />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Account management & terms" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <SelectField name="account_manager_id" label="Account manager" options={staff} placeholder="Not assigned" defaultValue={v.account_manager_id ?? ""} />
          <SelectField name="contract_manager_id" label="Contract manager" options={staff} placeholder="Not assigned" defaultValue={v.contract_manager_id ?? ""} />
          <TextField name="payment_terms_days" label="Payment terms (days)" type="number" inputMode="numeric" min={0} max={365} step={1} defaultValue={s(v.payment_terms_days ?? 30)} required />
          <TextField name="credit_limit" label="Credit limit (£)" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={s(v.credit_limit)} />
          <TextField name="tags" label="Tags" defaultValue={(v.tags ?? []).join(", ")} placeholder="e.g. framework, Scottish Housing Regulator" hint="Separate tags with commas." className="sm:col-span-2" />
          <TextAreaField name="notes" label="Notes" defaultValue={s(v.notes)} maxLength={10000} className="sm:col-span-2" />
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton>{v.id ? "Save changes" : "Create client"}</SubmitButton>
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </ActionForm>
  );
}
