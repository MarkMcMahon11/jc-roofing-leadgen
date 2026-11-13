"use client";

import { useState } from "react";
import { Mail, Phone, Smartphone, Star, UserPlus, Users } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { ActionForm, CheckboxField, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState } from "@/components/ui/primitives";
import { contactAction, saveContact } from "../actions";
import { PREFERRED_CHANNELS } from "../_lib/shared";
import { ActionButton } from "./action-button";

export type ContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  is_primary: boolean;
  is_billing: boolean;
  preferred_channel: string;
  notes: string | null;
  archived_at: string | null;
};

export function ContactsPanel({ orgId, contacts, canWrite }: { orgId: string; contacts: ContactRow[]; canWrite: boolean }) {
  const [editing, setEditing] = useState<ContactRow | "new" | null>(null);
  const current = contacts.filter((c) => !c.archived_at);
  const archived = contacts.filter((c) => c.archived_at);
  return (
    <Card>
      <CardHeader
        title="Contacts"
        description="People at this client. The primary contact receives day-to-day correspondence."
        actions={
          canWrite && (
            <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
              <UserPlus className="size-4" aria-hidden />
              Add contact
            </Button>
          )
        }
      />
      <CardBody>
        {current.length ? (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {current.map((c) => (
              <ContactCard key={c.id} c={c} canWrite={canWrite} onEdit={() => setEditing(c)} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Users className="size-8" />} title="No contacts yet">
            Add the people you deal with: housing officers, surveyors, accounts payable.
          </EmptyState>
        )}
        {archived.length > 0 && (
          <details className="mt-5 rounded-xl border border-line bg-sunken/60 px-4 py-3">
            <summary className="cursor-pointer text-sm text-muted select-none hover:text-fg">Archived contacts ({archived.length})</summary>
            <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {archived.map((c) => (
                <ContactCard key={c.id} c={c} canWrite={canWrite} onEdit={() => setEditing(c)} />
              ))}
            </ul>
          </details>
        )}
      </CardBody>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add contact" : "Edit contact"} size="lg">
        {editing !== null && <ContactForm orgId={orgId} contact={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </Card>
  );
}

function ContactCard({ c, canWrite, onEdit }: { c: ContactRow; canWrite: boolean; onEdit: () => void }) {
  const channel = PREFERRED_CHANNELS.find((p) => p.value === c.preferred_channel)?.label ?? c.preferred_channel;
  return (
    <li className={`flex flex-col rounded-xl border px-4 py-3.5 ${c.is_primary ? "border-[#1d3d78] bg-accent-lo/30" : "border-line bg-sunken/60"} ${c.archived_at ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{`${c.first_name} ${c.last_name}`.trim()}</p>
          {c.job_title && <p className="truncate text-xs text-muted">{c.job_title}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {c.is_primary && (
            <Badge tone="accent">
              <Star className="size-3" aria-hidden />
              Primary
            </Badge>
          )}
          {c.is_billing && <Badge tone="info">Billing</Badge>}
          {c.archived_at && <Badge>Archived</Badge>}
        </div>
      </div>
      <dl className="mt-3 space-y-1.5 text-[13px]">
        {c.email && (
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="size-3.5 shrink-0 text-subtle" aria-label="Email" />
            <a href={`mailto:${c.email}`} className="truncate text-accent-hi hover:underline">{c.email}</a>
          </div>
        )}
        {c.phone && (
          <div className="flex items-center gap-2">
            <Phone className="size-3.5 shrink-0 text-subtle" aria-label="Phone" />
            <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="hover:text-accent-hi">{c.phone}</a>
          </div>
        )}
        {c.mobile && (
          <div className="flex items-center gap-2">
            <Smartphone className="size-3.5 shrink-0 text-subtle" aria-label="Mobile" />
            <a href={`tel:${c.mobile.replace(/\s/g, "")}`} className="hover:text-accent-hi">{c.mobile}</a>
          </div>
        )}
        <div className="text-xs text-subtle">Prefers {channel.toLowerCase()}</div>
      </dl>
      {c.notes && <p className="mt-2 line-clamp-3 text-xs whitespace-pre-line text-muted">{c.notes}</p>}
      {canWrite && (
        <div className="mt-auto pt-3">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1 border-t border-line/70 pt-2.5">
          <button type="button" onClick={onEdit} className="text-xs font-medium text-accent-hi hover:underline">
            Edit
          </button>
          {!c.archived_at && !c.is_primary && (
            <ActionButton link action={() => contactAction(c.id, "primary")}>
              Make primary
            </ActionButton>
          )}
          {c.archived_at ? (
            <ActionButton link action={() => contactAction(c.id, "restore")}>
              Restore
            </ActionButton>
          ) : (
            <ActionButton link className="text-muted hover:text-fg" confirm={`Archive ${c.first_name}? They will be hidden from pickers but kept in history.`} action={() => contactAction(c.id, "archive")}>
              Archive
            </ActionButton>
          )}
        </div>
        </div>
      )}
    </li>
  );
}

function ContactForm({ orgId, contact, onDone }: { orgId: string; contact: ContactRow | null; onDone: () => void }) {
  const c = contact;
  return (
    <ActionForm action={saveContact} onSuccess={onDone} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="organisation_id" value={orgId} />
      {c && <input type="hidden" name="id" value={c.id} />}
      <TextField name="first_name" label="First name" required defaultValue={c?.first_name ?? ""} maxLength={80} autoComplete="off" />
      <TextField name="last_name" label="Last name" defaultValue={c?.last_name ?? ""} maxLength={80} autoComplete="off" />
      <TextField name="job_title" label="Job title" defaultValue={c?.job_title ?? ""} maxLength={120} className="sm:col-span-2" />
      <TextField name="email" label="Email" type="email" defaultValue={c?.email ?? ""} maxLength={320} autoComplete="off" />
      <SelectField name="preferred_channel" label="Preferred contact" options={PREFERRED_CHANNELS} defaultValue={c?.preferred_channel ?? "email"} />
      <TextField name="phone" label="Phone" type="tel" defaultValue={c?.phone ?? ""} maxLength={40} />
      <TextField name="mobile" label="Mobile" type="tel" defaultValue={c?.mobile ?? ""} maxLength={40} />
      <TextAreaField name="notes" label="Notes" defaultValue={c?.notes ?? ""} maxLength={5000} className="sm:col-span-2" />
      <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
        <CheckboxField name="is_primary" label="Primary contact" defaultChecked={c?.is_primary ?? false} hint="Replaces the current primary contact." />
        <CheckboxField name="is_billing" label="Billing contact" defaultChecked={c?.is_billing ?? false} hint="Receives invoices and statements." />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton>{c ? "Save contact" : "Add contact"}</SubmitButton>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </ActionForm>
  );
}
