"use client";

import { Award, CalendarPlus, Check, Lock, Pencil, Trash2, Truck, X } from "lucide-react";
import { ActionForm, ConfirmButton, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { ModalButton } from "../../properties/_components/modal-button";
import { decideAbsence, deleteQualification, saveAbsence, savePersonalData, saveQualification, saveVehicle } from "../actions";
import { VEHICLE_STATUS, VEHICLE_TYPES } from "../_lib/shared";

type Opt = { value: string; label: string };

/* ------------------------------------------------------------------ vehicles */
export type VehicleValues = {
  id?: string;
  registration?: string;
  make?: string | null;
  model?: string | null;
  vehicle_type?: string;
  status?: string;
  mot_due?: string | null;
  insurance_due?: string | null;
  service_due?: string | null;
  tax_due?: string | null;
  notes?: string | null;
  assigned_employee_id?: string | null;
};

export function VehicleButton({ values, employees }: { values?: VehicleValues; employees: Opt[] }) {
  const v = values ?? {};
  return (
    <ModalButton
      label={v.id ? "Edit" : "Add vehicle"}
      icon={v.id ? <Pencil className="size-3.5" aria-hidden /> : <Truck className="size-4" aria-hidden />}
      variant={v.id ? "secondary" : "primary"}
      title={v.id ? `Edit ${v.registration}` : "Add vehicle"}
      description="Due dates are flagged 30 days ahead."
    >
      {(close) => (
        <ActionForm action={saveVehicle} onSuccess={close} className="grid gap-4 sm:grid-cols-2">
          {v.id && <input type="hidden" name="id" value={v.id} />}
          <TextField name="registration" label="Registration" required defaultValue={v.registration} maxLength={10} autoComplete="off" />
          <SelectField name="vehicle_type" label="Type" required options={VEHICLE_TYPES} defaultValue={v.vehicle_type ?? "van"} />
          <TextField name="make" label="Make" defaultValue={v.make ?? ""} maxLength={60} />
          <TextField name="model" label="Model" defaultValue={v.model ?? ""} maxLength={60} />
          <SelectField name="status" label="Status" required options={Object.entries(VEHICLE_STATUS).map(([value, s]) => ({ value, label: s.label }))} defaultValue={v.status ?? "active"} />
          <SelectField name="assigned_employee_id" label="Assigned to" options={employees} placeholder="Pool vehicle (unassigned)" defaultValue={v.assigned_employee_id ?? ""} />
          <TextField name="mot_due" label="MOT due" type="date" defaultValue={v.mot_due ?? ""} />
          <TextField name="insurance_due" label="Insurance renewal" type="date" defaultValue={v.insurance_due ?? ""} />
          <TextField name="service_due" label="Service due" type="date" defaultValue={v.service_due ?? ""} />
          <TextField name="tax_due" label="Road tax due" type="date" defaultValue={v.tax_due ?? ""} />
          <TextAreaField name="notes" label="Notes" rows={2} maxLength={5000} defaultValue={v.notes ?? ""} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <SubmitButton>{v.id ? "Save vehicle" : "Add vehicle"}</SubmitButton>
          </div>
        </ActionForm>
      )}
    </ModalButton>
  );
}

/* ------------------------------------------------------------------ absences */
export function AbsenceButton({ employees, employeeId, types, label = "Add absence" }: { employees?: Opt[]; employeeId?: string; types: Opt[]; label?: string }) {
  return (
    <ModalButton label={label} icon={<CalendarPlus className="size-4" aria-hidden />} variant="primary" title="Add absence" description="Holiday, sickness, training or other time away. Approved absences block scheduling.">
      {(close) => (
        <ActionForm action={saveAbsence} onSuccess={close} className="grid gap-4 sm:grid-cols-2">
          {employeeId ? <input type="hidden" name="employee_id" value={employeeId} /> : <SelectField name="employee_id" label="Employee" required options={employees ?? []} placeholder="Choose…" className="sm:col-span-2" />}
          <SelectField name="type" label="Type" required options={types} defaultValue={types[0]?.value} />
          <SelectField
            name="status"
            label="Status"
            required
            options={[
              { value: "approved", label: "Approved" },
              { value: "requested", label: "Requested (needs approval)" },
            ]}
            defaultValue="approved"
          />
          <TextField name="from_date" label="First day" type="date" required />
          <TextField name="from_time" label="From (optional)" type="time" step={900} hint="Leave blank for the whole day." />
          <TextField name="to_date" label="Last day" type="date" required />
          <TextField name="to_time" label="Until (optional)" type="time" step={900} hint="Leave blank for the whole day." />
          <TextAreaField name="notes" label="Notes" rows={2} maxLength={1000} className="sm:col-span-2" hint="Avoid medical details: record only what is needed." />
          <div className="sm:col-span-2">
            <SubmitButton>Save absence</SubmitButton>
          </div>
        </ActionForm>
      )}
    </ModalButton>
  );
}

export function AbsenceDecision({ id, status, upcoming }: { id: string; status: string; upcoming: boolean }) {
  if (status === "requested")
    return (
      <ActionForm action={decideAbsence} className="inline-flex flex-wrap justify-end gap-2">
        <input type="hidden" name="id" value={id} />
        <ConfirmButton name="decision" value="approve" variant="primary" message="Approve this absence? The person will not be scheduled during it.">
          <Check className="size-3.5" aria-hidden />
          Approve
        </ConfirmButton>
        <ConfirmButton name="decision" value="reject" variant="secondary" message="Reject this absence request?">
          <X className="size-3.5" aria-hidden />
          Reject
        </ConfirmButton>
      </ActionForm>
    );
  if (status === "approved" && upcoming)
    return (
      <ActionForm action={decideAbsence} className="inline-flex justify-end">
        <input type="hidden" name="id" value={id} />
        <ConfirmButton name="decision" value="cancel" variant="secondary" message="Cancel this absence? The person becomes available again.">
          Cancel
        </ConfirmButton>
      </ActionForm>
    );
  return null;
}

/* ------------------------------------------------------------------ qualifications */
export type QualificationValues = { id?: string; name?: string; issuer?: string | null; certificate_number?: string | null; issued_on?: string | null; expires_on?: string | null };

export function QualificationButton({ owner, values }: { owner: { employee_id: string } | { subcontractor_id: string }; values?: QualificationValues }) {
  const v = values ?? {};
  const [field, ownerId] = "employee_id" in owner ? ["employee_id", owner.employee_id] : ["subcontractor_id", owner.subcontractor_id];
  return (
    <ModalButton
      label={v.id ? "Edit" : field === "employee_id" ? "Add qualification" : "Add accreditation"}
      icon={v.id ? <Pencil className="size-3.5" aria-hidden /> : <Award className="size-4" aria-hidden />}
      variant={v.id ? "secondary" : "primary"}
      title={v.id ? `Edit ${v.name}` : field === "employee_id" ? "Add qualification" : "Add accreditation"}
      description="Expiry dates are flagged 30 days ahead on the command centre."
    >
      {(close) => (
        <ActionForm action={saveQualification} onSuccess={close} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name={field} value={ownerId} />
          {v.id && <input type="hidden" name="id" value={v.id} />}
          <TextField name="name" label="Qualification / accreditation" required defaultValue={v.name} maxLength={160} className="sm:col-span-2" hint="e.g. CSCS Skilled Worker card, Gas Safe registration, CHAS, SafeContractor" />
          <TextField name="issuer" label="Issued by" defaultValue={v.issuer ?? ""} maxLength={160} />
          <TextField name="certificate_number" label="Certificate / card number" defaultValue={v.certificate_number ?? ""} maxLength={80} />
          <TextField name="issued_on" label="Issued on" type="date" defaultValue={v.issued_on ?? ""} />
          <TextField name="expires_on" label="Expires on" type="date" defaultValue={v.expires_on ?? ""} hint="Leave blank if it does not expire." />
          <div className="sm:col-span-2">
            <SubmitButton>{v.id ? "Save" : "Add"}</SubmitButton>
          </div>
        </ActionForm>
      )}
    </ModalButton>
  );
}

export function DeleteQualificationButton({ id, name }: { id: string; name: string }) {
  return (
    <ActionForm action={deleteQualification} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <ConfirmButton message={`Remove "${name}"?`}>
        <Trash2 className="size-3.5" aria-hidden />
        <span className="sr-only">Remove {name}</span>
      </ConfirmButton>
    </ActionForm>
  );
}

/* ------------------------------------------------------------------ personal data */
export type PersonalValues = {
  date_of_birth?: string | null;
  ni_number?: string | null;
  home_address?: string | null;
  personal_phone?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  hourly_cost?: number | null;
  notes?: string | null;
};

export function PersonalDataButton({ employeeId, values, exists }: { employeeId: string; values: PersonalValues; exists: boolean }) {
  return (
    <ModalButton
      label={exists ? "Edit personal data" : "Add personal data"}
      icon={<Lock className="size-3.5" aria-hidden />}
      title="Restricted personal data"
      description="Visible only to people with workforce personal-data access. Changes are audited without recording the values."
    >
      {(close) => (
        <ActionForm action={savePersonalData} onSuccess={close} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="employee_id" value={employeeId} />
          <TextField name="date_of_birth" label="Date of birth" type="date" defaultValue={values.date_of_birth ?? ""} />
          <TextField name="ni_number" label="National Insurance number" defaultValue={values.ni_number ?? ""} maxLength={13} autoComplete="off" hint="Two letters, six digits, one letter A-D, e.g. AB123456C" />
          <TextAreaField name="home_address" label="Home address" rows={2} maxLength={500} defaultValue={values.home_address ?? ""} className="sm:col-span-2" />
          <TextField name="personal_phone" label="Personal phone" type="tel" maxLength={40} defaultValue={values.personal_phone ?? ""} autoComplete="off" />
          <TextField name="hourly_cost" label="Hourly cost (£, pay rate)" type="number" min={0} step="0.01" defaultValue={values.hourly_cost ?? ""} hint="Used to cost timesheets. Never shown outside this card." />
          <TextField name="emergency_contact_name" label="Emergency contact" maxLength={160} defaultValue={values.emergency_contact_name ?? ""} autoComplete="off" />
          <TextField name="emergency_contact_phone" label="Emergency contact phone" type="tel" maxLength={40} defaultValue={values.emergency_contact_phone ?? ""} autoComplete="off" />
          <TextAreaField name="notes" label="Notes" rows={2} maxLength={5000} defaultValue={values.notes ?? ""} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <SubmitButton>Save personal data</SubmitButton>
          </div>
        </ActionForm>
      )}
    </ModalButton>
  );
}
