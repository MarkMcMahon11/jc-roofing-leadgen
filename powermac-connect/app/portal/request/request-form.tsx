"use client";

import { useMemo, useState } from "react";
import { ActionForm, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { Card, CardBody, Input } from "@/components/ui/primitives";
import { submitRequest } from "../actions";

export function RequestForm({ properties, defaultProperty }: { properties: { value: string; label: string }[]; defaultProperty?: string }) {
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? properties.filter((p) => p.label.toLowerCase().includes(f)).slice(0, 200) : properties.slice(0, 500);
  }, [filter, properties]);
  return (
    <Card className="max-w-3xl">
      <CardBody>
        <ActionForm action={submitRequest} className="grid gap-4">
          <div>
            <Input placeholder="Filter properties by street or postcode" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter properties" className="mb-2" />
            <SelectField name="property_id" label="Property" required placeholder="Choose the property…" options={shown} defaultValue={defaultProperty} />
          </div>
          <TextField name="title" label="What is the problem?" required placeholder="e.g. Kitchen tap leaking, front door will not lock" maxLength={200} />
          <TextAreaField name="description" label="More detail" placeholder="Where exactly, when it started, access arrangements, anything we should know" rows={4} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField name="priority" label="How urgent?" defaultValue="routine" options={[
              { value: "emergency", label: "Emergency - danger or serious damage" },
              { value: "urgent", label: "Urgent - within a few days" },
              { value: "routine", label: "Routine" },
              { value: "planned", label: "Planned / non-urgent works" },
            ]} />
            <TextField name="client_reference" label="Your reference (optional)" maxLength={60} />
          </div>
          <div><SubmitButton size="lg" pendingLabel="Submitting…">Submit request</SubmitButton></div>
        </ActionForm>
      </CardBody>
    </Card>
  );
}
