"use client";

import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { saveCompletion } from "../[id]/actions";

export type CompletionValues = {
  actual_start: string;
  actual_end: string;
  completion_notes: string;
  first_time_fix: "" | "yes" | "no";
  signoff_name: string;
  signoff_at: string;
  satisfaction_score: string;
};

export function CompletionForm({ jobId, initial, canWrite }: { jobId: string; initial: CompletionValues; canWrite: boolean }) {
  return (
    <ActionForm action={saveCompletion} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="job_id" value={jobId} />
      <fieldset disabled={!canWrite} className="contents">
        <TextField name="actual_start" label="Actual start" type="datetime-local" defaultValue={initial.actual_start} />
        <TextField name="actual_end" label="Actual finish" type="datetime-local" defaultValue={initial.actual_end} />
        <TextAreaField name="completion_notes" label="Completion notes" rows={4} maxLength={10000} defaultValue={initial.completion_notes} className="md:col-span-2" placeholder="Work carried out, parts used, anything left to do…" />
        <SelectField
          name="first_time_fix"
          label="First-time fix"
          defaultValue={initial.first_time_fix}
          placeholder="Not recorded"
          options={[
            { value: "yes", label: "Yes - fixed on the first visit" },
            { value: "no", label: "No - needed a return visit" },
          ]}
        />
        <SelectField
          name="satisfaction_score"
          label="Customer satisfaction"
          defaultValue={initial.satisfaction_score}
          placeholder="Not recorded"
          options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} - ${["", "Very poor", "Poor", "Fair", "Good", "Excellent"][n]}` }))}
        />
        <TextField name="signoff_name" label="Signed off by" maxLength={160} defaultValue={initial.signoff_name} placeholder="Name of the person accepting the work" />
        <TextField name="signoff_at" label="Signed off at" type="datetime-local" defaultValue={initial.signoff_at} hint="Defaults to now when a name is entered." />
      </fieldset>
      {canWrite && (
        <div className="flex justify-end md:col-span-2">
          <SubmitButton>Save completion details</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
