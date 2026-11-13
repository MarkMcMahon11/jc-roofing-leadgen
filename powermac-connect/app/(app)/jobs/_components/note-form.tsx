"use client";

import { ActionForm, SelectField, SubmitButton, TextAreaField } from "@/components/ui/form";
import { addNote } from "../[id]/actions";

export function NoteForm({ jobId }: { jobId: string }) {
  return (
    <ActionForm action={addNote} resetOnSuccess className="grid gap-3">
      <input type="hidden" name="job_id" value={jobId} />
      <TextAreaField name="body" label="Add a note" required rows={3} maxLength={10000} placeholder="What happened, what's next, what the client said…" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SelectField
          name="visibility"
          label="Who can see it"
          className="min-w-56"
          defaultValue="internal"
          options={[
            { value: "internal", label: "Internal - staff only" },
            { value: "client", label: "Client - shown in their portal" },
          ]}
        />
        <SubmitButton pendingLabel="Adding…">Add note</SubmitButton>
      </div>
    </ActionForm>
  );
}
