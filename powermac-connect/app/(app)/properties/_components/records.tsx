"use client";

import { ClipboardCheck, FileBadge, Pencil, Trash2 } from "lucide-react";
import { ActionForm, ConfirmButton, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { deleteCertificate, saveCertificate, saveInspection } from "../actions";
import { ModalButton } from "./modal-button";
import { CERTIFICATE_TYPES, INSPECTION_TYPES } from "../_lib/ui";

type Opt = { value: string; label: string };

const RESULTS: Opt[] = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "advisory", label: "Advisory" },
  { value: "not_applicable", label: "Not applicable" },
];

export type InspectionValues = {
  id?: string;
  type?: string;
  inspector_id?: string | null;
  scheduled_for?: string; // datetime-local (London)
  completed_at?: string;
  result?: string | null;
  score?: number | null;
  findings?: string | null;
};

function InspectionForm({ propertyId, values, inspectors, onDone }: { propertyId: string; values: InspectionValues; inspectors: Opt[]; onDone: () => void }) {
  return (
    <ActionForm action={saveInspection} onSuccess={onDone} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="property_id" value={propertyId} />
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <SelectField name="type" label="Type" required options={INSPECTION_TYPES} defaultValue={values.type ?? "survey"} />
      <SelectField name="inspector_id" label="Inspector" options={inspectors} placeholder="Not assigned" defaultValue={values.inspector_id ?? ""} hint={inspectors.length ? undefined : "Employee list not available to you."} />
      <TextField name="scheduled_for" label="Scheduled for" type="datetime-local" defaultValue={values.scheduled_for ?? ""} />
      <TextField name="completed_at" label="Completed at" type="datetime-local" defaultValue={values.completed_at ?? ""} hint="Leave empty while it is still to be done." />
      <SelectField name="result" label="Result" options={RESULTS} placeholder="No result yet" defaultValue={values.result ?? ""} />
      <TextField name="score" label="Score (0-100)" type="number" min={0} max={100} step="0.01" defaultValue={values.score ?? ""} />
      <TextAreaField name="findings" label="Findings" rows={4} maxLength={20000} defaultValue={values.findings ?? ""} className="sm:col-span-2" />
      <div className="sm:col-span-2">
        <SubmitButton>{values.id ? "Save inspection" : "Record inspection"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AddInspectionButton({ propertyId, inspectors }: { propertyId: string; inspectors: Opt[] }) {
  return (
    <ModalButton label="Add inspection" icon={<ClipboardCheck className="size-4" aria-hidden />} variant="primary" title="Add inspection" description="Schedule an inspection, or record one that has been carried out.">
      {(close) => <InspectionForm propertyId={propertyId} values={{}} inspectors={inspectors} onDone={close} />}
    </ModalButton>
  );
}

export function EditInspectionButton({ propertyId, values, inspectors, label = "Edit" }: { propertyId: string; values: InspectionValues; inspectors: Opt[]; label?: string }) {
  return (
    <ModalButton label={label} icon={<Pencil className="size-3.5" aria-hidden />} title="Update inspection">
      {(close) => <InspectionForm propertyId={propertyId} values={values} inspectors={inspectors} onDone={close} />}
    </ModalButton>
  );
}


export type CertificateValues = { id?: string; type?: string; issued_on?: string; expires_on?: string | null; issued_by?: string | null; result?: string | null; document_id?: string | null };

function CertificateForm({ propertyId, values, documents, onDone }: { propertyId: string; values: CertificateValues; documents: Opt[]; onDone: () => void }) {
  return (
    <ActionForm action={saveCertificate} onSuccess={onDone} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="property_id" value={propertyId} />
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <SelectField name="type" label="Certificate" required options={CERTIFICATE_TYPES} defaultValue={values.type ?? "gas_safety"} />
      <TextField name="issued_by" label="Issued by" maxLength={160} defaultValue={values.issued_by ?? ""} hint="Engineer or company" />
      <TextField name="issued_on" label="Issued on" type="date" required defaultValue={values.issued_on ?? ""} />
      <TextField name="expires_on" label="Expires on" type="date" defaultValue={values.expires_on ?? ""} />
      <SelectField
        name="result"
        label="Outcome"
        options={[
          { value: "satisfactory", label: "Satisfactory" },
          { value: "unsatisfactory", label: "Unsatisfactory" },
          { value: "advisory", label: "Advisory / improvements recommended" },
        ]}
        placeholder="Not recorded"
        defaultValue={values.result ?? ""}
      />
      <SelectField
        name="document_id"
        label="Certificate document"
        options={documents}
        placeholder={documents.length ? "None attached" : "Upload it under Documents first"}
        defaultValue={values.document_id ?? ""}
      />
      <div className="sm:col-span-2">
        <SubmitButton>{values.id ? "Save certificate" : "Record certificate"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AddCertificateButton({ propertyId, documents }: { propertyId: string; documents: Opt[] }) {
  return (
    <ModalButton label="Add certificate" icon={<FileBadge className="size-4" aria-hidden />} variant="primary" title="Add certificate" description="Compliance certificates are tracked for expiry and flagged 30 days ahead.">
      {(close) => <CertificateForm propertyId={propertyId} values={{}} documents={documents} onDone={close} />}
    </ModalButton>
  );
}

export function EditCertificateButton({ propertyId, values, documents }: { propertyId: string; values: CertificateValues; documents: Opt[] }) {
  return (
    <ModalButton label="Edit" icon={<Pencil className="size-3.5" aria-hidden />} title="Edit certificate">
      {(close) => <CertificateForm propertyId={propertyId} values={values} documents={documents} onDone={close} />}
    </ModalButton>
  );
}

export function DeleteCertificateButton({ propertyId, id }: { propertyId: string; id: string }) {
  return (
    <ActionForm action={deleteCertificate} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="property_id" value={propertyId} />
      <ConfirmButton message="Remove this certificate record? Any attached document is kept.">
        <Trash2 className="size-3.5" aria-hidden />
        <span className="sr-only">Remove certificate</span>
      </ConfirmButton>
    </ActionForm>
  );
}
