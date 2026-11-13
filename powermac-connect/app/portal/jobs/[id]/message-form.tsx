"use client";

import { ActionForm, SubmitButton, TextAreaField } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { addMessage } from "../../actions";

export function MessageForm({ jobId }: { jobId: string }) {
  return (
    <Card>
      <CardHeader title="Message PowerMac" description="About this job. Replies appear in the progress log." />
      <CardBody>
        <ActionForm action={addMessage} resetOnSuccess className="space-y-3">
          <input type="hidden" name="job_id" value={jobId} />
          <TextAreaField name="body" label="Message" rows={3} required />
          <SubmitButton>Send message</SubmitButton>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
