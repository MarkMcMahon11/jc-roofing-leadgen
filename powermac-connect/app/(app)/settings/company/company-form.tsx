"use client";

import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { updateCompany } from "./actions";

export function CompanyForm({ tenant }: { tenant: Record<string, string> }) {
  return (
    <Card>
      <CardHeader title="Company details" description="Shown on quotations, invoices and documents." />
      <CardBody>
        <ActionForm action={updateCompany} className="grid gap-4 sm:grid-cols-2">
          <TextField name="name" label="Trading name" defaultValue={tenant.name} required />
          <TextField name="legal_name" label="Legal name" defaultValue={tenant.legal_name} />
          <TextField name="company_number" label="Company number" defaultValue={tenant.company_number} />
          <TextField name="vat_number" label="VAT number" defaultValue={tenant.vat_number} />
          <TextField name="reference_prefix" label="Reference prefix" defaultValue={tenant.reference_prefix} required hint="Used in references such as PM-WO-00042. Existing references keep their prefix." />
          <TextField name="default_vat_rate" label="Default VAT rate (%)" type="number" step="0.01" min="0" max="100" defaultValue={tenant.default_vat_rate} required />
          <TextField name="timezone" label="Time zone" defaultValue={tenant.timezone} required />
          <div className="sm:col-span-2"><SubmitButton>Save company details</SubmitButton></div>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
