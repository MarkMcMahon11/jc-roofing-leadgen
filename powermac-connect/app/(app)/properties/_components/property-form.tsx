"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionForm, ConfirmButton, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { buttonClass, Card, CardBody, CardHeader, Label, Select } from "@/components/ui/primitives";
import { createProperty, deleteProperty, updateProperty } from "../actions";
import { CheckboxChips } from "./checkbox-chips";

type Opt = { value: string; label: string };
export type PropertyFormValues = {
  id?: string;
  organisation_id?: string;
  address_line1?: string;
  address_line2?: string | null;
  town?: string;
  postcode?: string;
  uprn?: string | null;
  client_reference?: string | null;
  property_type?: string;
  tenure?: string;
  status?: string;
  bedrooms?: number | null;
  build_year?: number | null;
  access_notes?: string | null;
  restrictions?: string | null;
  key_safe_info?: string | null;
  notes?: string | null;
  hazards?: string[];
  contract_ids?: string[];
  has_location?: boolean;
};

const TENURES: Opt[] = [
  { value: "social_rent", label: "Social rent" },
  { value: "mid_market", label: "Mid-market rent" },
  { value: "private_rent", label: "Private rent" },
  { value: "owner_occupied", label: "Owner occupied" },
  { value: "commercial", label: "Commercial" },
  { value: "education", label: "Education" },
  { value: "public_building", label: "Public building" },
  { value: "other", label: "Other" },
];
const STATUSES: Opt[] = [
  { value: "occupied", label: "Occupied" },
  { value: "void", label: "Void" },
  { value: "under_works", label: "Under works" },
  { value: "inactive", label: "Inactive" },
];

export function PropertyForm({
  values,
  organisations,
  contracts,
  propertyTypes,
  hazards,
  canLinkContracts,
  canSeeContracts,
  canDelete,
}: {
  values: PropertyFormValues;
  organisations: Opt[];
  contracts: { id: string; label: string; organisation_id: string; status: string }[];
  propertyTypes: Opt[];
  hazards: Opt[];
  canLinkContracts: boolean;
  canSeeContracts: boolean;
  canDelete: boolean;
}) {
  const editing = Boolean(values.id);
  const [org, setOrg] = useState(values.organisation_id ?? "");
  const orgContracts = contracts.filter((c) => c.organisation_id === org);

  return (
    <div className="grid gap-6">
      <ActionForm action={editing ? updateProperty : createProperty} className="grid gap-6">
        {(state) => (
          <>
            {values.id && <input type="hidden" name="id" value={values.id} />}
            <Card>
              <CardHeader title="Client and address" description="The postcode is looked up on the map automatically when you save." />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="pf-org" required>Client organisation</Label>
                  <Select id="pf-org" name="organisation_id" required value={org} onChange={(e) => setOrg(e.target.value)} aria-invalid={Boolean(state.fieldErrors?.organisation_id)}>
                    <option value="">Choose the client…</option>
                    {organisations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                  {state.fieldErrors?.organisation_id && <p className="mt-1.5 text-xs text-[#ff9b98]">{state.fieldErrors.organisation_id[0]}</p>}
                  {organisations.length === 0 && <p className="mt-1.5 text-xs text-subtle">No client organisations are available to you. Clients are added in Clients &amp; CRM.</p>}
                </div>
                <TextField name="address_line1" label="Address line 1" required defaultValue={values.address_line1} maxLength={200} autoComplete="off" />
                <TextField name="address_line2" label="Address line 2" defaultValue={values.address_line2 ?? ""} maxLength={200} hint="Flat number, building name" autoComplete="off" />
                <TextField name="town" label="Town" required defaultValue={values.town} maxLength={100} autoComplete="off" />
                <TextField
                  name="postcode"
                  label="Postcode"
                  required
                  defaultValue={values.postcode}
                  maxLength={10}
                  autoComplete="off"
                  hint={editing && !values.has_location ? "No map location yet: saving retries the lookup." : "Used to place the property on the map."}
                />
                <TextField name="uprn" label="UPRN" defaultValue={values.uprn ?? ""} inputMode="numeric" maxLength={12} hint="Unique Property Reference Number (up to 12 digits)" />
                <TextField name="client_reference" label="Client's reference" defaultValue={values.client_reference ?? ""} maxLength={60} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Property details" />
              <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <SelectField name="property_type" label="Property type" required options={propertyTypes} defaultValue={values.property_type ?? propertyTypes[0]?.value} />
                <SelectField name="tenure" label="Tenure" required options={TENURES} defaultValue={values.tenure ?? "social_rent"} />
                <SelectField name="status" label="Status" required options={STATUSES} defaultValue={values.status ?? "occupied"} />
                <TextField name="bedrooms" label="Bedrooms" type="number" min={0} max={50} step={1} defaultValue={values.bedrooms ?? ""} />
                <TextField name="build_year" label="Build year" type="number" min={1500} max={2100} step={1} defaultValue={values.build_year ?? ""} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Access and safety" description="Shown to the people sent to the property." />
              <CardBody className="grid gap-4 sm:grid-cols-2">
                <CheckboxChips name="hazards" label="Hazards" options={hazards} defaultValues={values.hazards} tone="warn" className="sm:col-span-2" error={state.fieldErrors?.hazards?.[0]} />
                <TextAreaField name="access_notes" label="Access requirements" defaultValue={values.access_notes ?? ""} maxLength={2000} rows={3} hint="e.g. call 30 minutes before arrival, access via rear lane" />
                <TextAreaField name="restrictions" label="Restrictions" defaultValue={values.restrictions ?? ""} maxLength={2000} rows={3} hint="e.g. conservation area, listed building, working hours" />
                <TextField name="key_safe_info" label="Key safe information" defaultValue={values.key_safe_info ?? ""} maxLength={200} autoComplete="off" hint="Confidential: shown only to staff who can view properties." />
                <TextAreaField name="notes" label="Notes" defaultValue={values.notes ?? ""} maxLength={10000} rows={3} className="sm:col-span-2" />
              </CardBody>
            </Card>

            {canSeeContracts && (
              <Card>
                <CardHeader title="Contracts" description="Which of the client's contracts cover this property." />
                <CardBody>
                  {!org ? (
                    <p className="text-sm text-subtle">Choose the client first.</p>
                  ) : orgContracts.length === 0 ? (
                    <p className="text-sm text-subtle">This client has no contracts yet.</p>
                  ) : canLinkContracts ? (
                    <CheckboxChips
                      key={org}
                      name="contract_ids"
                      label="Linked contracts"
                      options={orgContracts.map((c) => ({ value: c.id, label: `${c.label}${c.status !== "active" ? ` (${c.status.replace(/_/g, " ")})` : ""}` }))}
                      defaultValues={org === values.organisation_id ? values.contract_ids : []}
                    />
                  ) : (
                    <>
                      <ul className="space-y-1 text-sm">
                        {orgContracts.filter((c) => values.contract_ids?.includes(c.id)).map((c) => <li key={c.id}>{c.label}</li>)}
                        {!orgContracts.some((c) => values.contract_ids?.includes(c.id)) && <li className="text-subtle">Not linked to a contract.</li>}
                      </ul>
                      <p className="mt-2 text-xs text-subtle">Linking contracts needs contract edit access.</p>
                    </>
                  )}
                </CardBody>
              </Card>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton>{editing ? "Save property" : "Add property"}</SubmitButton>
              <Link href={values.id ? `/properties/${values.id}` : "/properties"} className={buttonClass("ghost")}>
                Cancel
              </Link>
            </div>
          </>
        )}
      </ActionForm>

      {editing && canDelete && (
        <Card>
          <CardHeader title="Delete property" description="Only possible when no jobs have been raised against it. Otherwise set its status to Inactive." />
          <CardBody>
            <ActionForm action={deleteProperty}>
              <input type="hidden" name="id" value={values.id} />
              <ConfirmButton message="Delete this property and its occupants, inspections and certificates? This cannot be undone." size="md">
                Delete property
              </ConfirmButton>
            </ActionForm>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
