"use client";

import { ActionForm, CheckboxField, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { Card, CardBody, CardHeader, Select, Input } from "@/components/ui/primitives";
import { createTenant, updateSubscription } from "./actions";

export function CreateTenantForm() {
  return (
    <Card>
      <CardHeader title="Add a company" description="Provisions roles, the 13-stage job workflow, picklists, retention rules and automation templates." />
      <CardBody>
        <ActionForm action={createTenant} resetOnSuccess className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <TextField name="name" label="Company name" required />
          <TextField name="slug" label="Short name (URL)" required placeholder="acme-building" />
          <SelectField name="plan" label="Plan" options={[{ value: "trial", label: "Trial (30 days)" }, { value: "professional", label: "Professional" }, { value: "enterprise", label: "Enterprise" }]} />
          <TextField name="prefix" label="Reference prefix" required defaultValue="PM" />
          <div className="lg:col-span-4"><CheckboxField name="is_demo" label="Demo environment (shows the DEMO banner)" /></div>
          <div><SubmitButton>Create company</SubmitButton></div>
        </ActionForm>
      </CardBody>
    </Card>
  );
}

export function SubscriptionForm({ tenant }: { tenant: { id: string; plan: string; status: string; seats: number } }) {
  return (
    <ActionForm action={updateSubscription} className="flex items-center gap-1.5">
      <input type="hidden" name="tenant" value={tenant.id} />
      <Select name="plan" defaultValue={tenant.plan} className="h-8 w-32 text-xs" aria-label="Plan">
        <option value="trial">Trial</option><option value="professional">Professional</option><option value="enterprise">Enterprise</option>
      </Select>
      <Select name="status" defaultValue={tenant.status} className="h-8 w-28 text-xs" aria-label="Status">
        {["trial", "active", "past_due", "suspended", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      <Input name="seats" type="number" min={1} defaultValue={tenant.seats} className="h-8 w-16 text-xs" aria-label="Seats" />
      <SubmitButton size="sm" variant="secondary" pendingLabel="…">Save</SubmitButton>
    </ActionForm>
  );
}
