"use client";

import Link from "next/link";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { buttonClass, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { CheckboxChips } from "../../properties/_components/checkbox-chips";
import { createSubcontractor, updateSubcontractor } from "../actions";
import { CIS_STATUS, SUB_STATUS } from "../_lib/shared";

type Opt = { value: string; label: string };
export type SubcontractorValues = {
  id?: string;
  company_name?: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  trades?: string[];
  status?: string;
  address?: string | null;
  postcode?: string | null;
  insurance_expiry?: string | null;
  public_liability_gbp?: number | null;
  cis_status?: string;
  day_rate?: number | null;
  rating?: number | null;
  notes?: string | null;
};

export function SubcontractorForm({ values, trades }: { values: SubcontractorValues; trades: Opt[] }) {
  const editing = Boolean(values.id);
  const tradeOptions = [...trades, ...(values.trades ?? []).filter((t) => !trades.some((o) => o.value === t)).map((t) => ({ value: t, label: t.replace(/_/g, " ") }))];
  return (
    <ActionForm action={editing ? updateSubcontractor : createSubcontractor} className="grid gap-6">
      {(state) => (
        <>
          {values.id && <input type="hidden" name="id" value={values.id} />}
          <Card>
            <CardHeader title="Company" />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <TextField name="company_name" label="Company name" required defaultValue={values.company_name} maxLength={200} className="sm:col-span-2" autoComplete="off" />
              <SelectField name="status" label="Status" required options={Object.entries(SUB_STATUS).map(([value, s]) => ({ value, label: s.label }))} defaultValue={values.status ?? "pending"} hint="Approval needs in-date insurance." />
              <TextField name="contact_name" label="Contact name" defaultValue={values.contact_name ?? ""} maxLength={160} autoComplete="off" />
              <TextField name="email" label="Email" type="email" defaultValue={values.email ?? ""} maxLength={320} autoComplete="off" />
              <TextField name="phone" label="Phone" type="tel" defaultValue={values.phone ?? ""} maxLength={40} autoComplete="off" />
              <TextAreaField name="address" label="Address" rows={2} defaultValue={values.address ?? ""} maxLength={500} className="sm:col-span-2" />
              <TextField name="postcode" label="Postcode" defaultValue={values.postcode ?? ""} maxLength={10} autoComplete="off" />
              <CheckboxChips name="trades" label="Trades" options={tradeOptions} defaultValues={values.trades} className="sm:col-span-2 lg:col-span-3" error={state.fieldErrors?.trades?.[0]} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Compliance and commercial" description="Insurance and CIS are checked before work is assigned." />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <TextField name="insurance_expiry" label="Insurance expiry" type="date" defaultValue={values.insurance_expiry ?? ""} />
              <TextField name="public_liability_gbp" label="Public liability cover (£)" type="number" min={0} step="1" defaultValue={values.public_liability_gbp ?? ""} hint="e.g. 5000000 for £5m" />
              <SelectField name="cis_status" label="CIS status" required options={Object.entries(CIS_STATUS).map(([value, s]) => ({ value, label: s.label }))} defaultValue={values.cis_status ?? "unverified"} />
              <TextField name="day_rate" label="Day rate (£)" type="number" min={0} step="0.01" defaultValue={values.day_rate ?? ""} />
              <TextField name="rating" label="Rating (0-5)" type="number" min={0} max={5} step="0.1" defaultValue={values.rating ?? ""} />
              <TextAreaField name="notes" label="Notes" rows={3} defaultValue={values.notes ?? ""} maxLength={5000} className="sm:col-span-2 lg:col-span-3" />
            </CardBody>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton>{editing ? "Save subcontractor" : "Add subcontractor"}</SubmitButton>
            <Link href={values.id ? `/subcontractors/${values.id}` : "/subcontractors"} className={buttonClass("ghost")}>
              Cancel
            </Link>
          </div>
        </>
      )}
    </ActionForm>
  );
}
