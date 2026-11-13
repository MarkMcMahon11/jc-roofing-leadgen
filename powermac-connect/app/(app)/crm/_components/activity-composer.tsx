"use client";

import { useCallback, useState } from "react";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { addActivity } from "../actions";
import { ACTIVITY_TYPES, type Opt } from "../_lib/shared";

export function ActivityComposer({ orgId, contacts, staff, me, opportunities = [] }: { orgId: string; contacts: Opt[]; staff: Opt[]; me: string; opportunities?: Opt[] }) {
  const [type, setType] = useState("note");
  const needsDue = type === "follow_up" || type === "task";
  // stable: ActionForm calls onSuccess whenever it re-renders after a successful save
  const reset = useCallback(() => setType("note"), []);
  return (
    <Card>
      <CardHeader title="Log activity" description="Record a call, meeting or note, or set a follow-up reminder." />
      <CardBody>
        <ActionForm action={addActivity} resetOnSuccess onSuccess={reset} className="grid gap-4 sm:grid-cols-6">
          <input type="hidden" name="organisation_id" value={orgId} />
          <SelectField name="type" label="Type" required options={[...ACTIVITY_TYPES]} value={type} onChange={(e) => setType(e.target.value)} className="sm:col-span-2" />
          <TextField name="subject" label="Subject" required maxLength={200} className="sm:col-span-4" placeholder={needsDue ? "e.g. Chase signed variation" : "e.g. Quarterly review meeting"} />
          <TextAreaField name="body" label="Details" maxLength={10000} className="sm:col-span-6" rows={3} />
          <SelectField name="contact_id" label="With" options={contacts} placeholder="No specific contact" className="sm:col-span-2" />
          <TextField
            name="due_at"
            label={needsDue ? "Due" : "Remind me (optional)"}
            type="datetime-local"
            required={needsDue}
            className="sm:col-span-2"
            hint={needsDue ? "Appears in follow-ups until done." : "Adds it to follow-ups."}
          />
          <SelectField name="owner_id" label="Owner" options={staff} defaultValue={me} className="sm:col-span-2" />
          {opportunities.length > 0 && <SelectField name="opportunity_id" label="Opportunity" options={opportunities} placeholder="None" className="sm:col-span-3" />}
          <div className="flex items-end sm:col-span-6">
            <SubmitButton>Save activity</SubmitButton>
          </div>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
