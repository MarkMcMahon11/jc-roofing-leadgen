"use client";

import { LogOut, Pencil, UserPlus } from "lucide-react";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { moveOutOccupant, saveOccupant } from "../actions";
import { CheckboxChips } from "./checkbox-chips";
import { ModalButton } from "./modal-button";
import { VULNERABILITY } from "../_lib/ui";

export type OccupantValues = {
  id?: string;
  full_name?: string;
  phone?: string | null;
  email?: string | null;
  preferred_contact?: string;
  move_in_date?: string | null;
  access_needs?: string | null;
  vulnerability_flags?: string[];
  consent_to_contact?: boolean;
};


const CONTACT = [
  { value: "phone", label: "Phone call" },
  { value: "sms", label: "Text message" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "letter", label: "Letter" },
  { value: "via_client", label: "Via the client (landlord)" },
];

function OccupantForm({ propertyId, values, onDone }: { propertyId: string; values: OccupantValues; onDone: () => void }) {
  return (
    <ActionForm action={saveOccupant} onSuccess={onDone} className="grid gap-4 sm:grid-cols-2">
      {(state) => (
        <>
          <input type="hidden" name="property_id" value={propertyId} />
          {values.id && <input type="hidden" name="id" value={values.id} />}
          <TextField name="full_name" label="Full name" required defaultValue={values.full_name} maxLength={160} autoComplete="off" className="sm:col-span-2" />
          <TextField name="phone" label="Phone" type="tel" defaultValue={values.phone ?? ""} maxLength={40} autoComplete="off" />
          <TextField name="email" label="Email" type="email" defaultValue={values.email ?? ""} maxLength={320} autoComplete="off" />
          <SelectField name="preferred_contact" label="Preferred contact" options={CONTACT} defaultValue={values.preferred_contact ?? "phone"} required />
          <TextField name="move_in_date" label="Moved in" type="date" defaultValue={values.move_in_date ?? ""} />
          <TextAreaField name="access_needs" label="Access needs" rows={2} maxLength={1000} defaultValue={values.access_needs ?? ""} className="sm:col-span-2" hint="Only what operatives need to visit safely and respectfully." />
          <CheckboxChips
            name="vulnerability_flags"
            label="Support needs (confidential)"
            options={VULNERABILITY}
            defaultValues={values.vulnerability_flags}
            className="sm:col-span-2"
            error={state.fieldErrors?.vulnerability_flags?.[0]}
          />
          <div className="sm:col-span-2">
            <CheckboxField name="consent_to_contact" label="Consents to be contacted directly about repairs" defaultChecked={values.consent_to_contact ?? true} />
          </div>
          <div className="sm:col-span-2">
            <SubmitButton>{values.id ? "Save occupant" : "Add occupant"}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function AddOccupantButton({ propertyId }: { propertyId: string }) {
  return (
    <ModalButton label="Add occupant" icon={<UserPlus className="size-4" aria-hidden />} variant="primary" title="Add occupant" description="Personal data: record only what is needed to arrange access and keep people safe.">
      {(close) => <OccupantForm propertyId={propertyId} values={{}} onDone={close} />}
    </ModalButton>
  );
}

export function EditOccupantButton({ propertyId, values }: { propertyId: string; values: OccupantValues }) {
  return (
    <ModalButton label="Edit" icon={<Pencil className="size-3.5" aria-hidden />} title={`Edit ${values.full_name}`}>
      {(close) => <OccupantForm propertyId={propertyId} values={values} onDone={close} />}
    </ModalButton>
  );
}

export function MoveOutButton({ propertyId, occupantId, name, today }: { propertyId: string; occupantId: string; name: string; today: string }) {
  return (
    <ModalButton label="Move out" icon={<LogOut className="size-3.5" aria-hidden />} title={`Record move-out: ${name}`} modalSize="md" description="They will be listed as a former occupant. Their details are anonymised automatically under your retention policy.">
      {(close) => (
        <ActionForm action={moveOutOccupant} onSuccess={close} className="grid gap-4">
          <input type="hidden" name="id" value={occupantId} />
          <input type="hidden" name="property_id" value={propertyId} />
          <TextField name="move_out_date" label="Move-out date" type="date" required defaultValue={today} />
          <div>
            <SubmitButton>Record move-out</SubmitButton>
          </div>
        </ActionForm>
      )}
    </ModalButton>
  );
}
