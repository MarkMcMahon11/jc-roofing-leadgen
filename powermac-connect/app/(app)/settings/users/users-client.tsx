"use client";

import { useState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Badge, Button, Card, CardBody, CardHeader, TD, Select } from "@/components/ui/primitives";
import { changeRole, inviteUser, memberAction, type InviteResult } from "./actions";

type Opt = { value: string; label: string };

export function InvitePanel({ roles, links }: { roles: { id: string; name: string; scope: string }[]; links: Record<string, Opt[]> }) {
  const [roleId, setRoleId] = useState("");
  const scope = roles.find((r) => r.id === roleId)?.scope ?? "internal";
  const linkLabel: Record<string, string> = { client: "Client organisation", operative: "Employee record", subcontractor: "Subcontractor", internal: "Employee record (optional)" };
  return (
    <Card>
      <CardHeader title="Invite someone" description="They receive a one-time link to set their password. Access starts when they accept." />
      <CardBody>
        <ActionForm<InviteResult> action={inviteUser} className="grid gap-4 md:grid-cols-2">
          {(state) => (<>
          {state.message && state.link && (
            <div className="-mt-2 flex items-center gap-2 md:col-span-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-sunken px-2 py-1.5 font-mono text-xs text-fg">{state.link}</code>
              <Button type="button" size="sm" onClick={() => navigator.clipboard.writeText(state.link!)}><Copy className="size-3.5" />Copy link</Button>
            </div>
          )}
          <Field label="Full name" error={state.fieldErrors?.full_name?.[0]}><input name="full_name" required className={inputCls} autoComplete="off" /></Field>
          <Field label="Email" error={state.fieldErrors?.email?.[0]}><input name="email" type="email" required className={inputCls} autoComplete="off" /></Field>
          <Field label="Role" error={state.fieldErrors?.role_id?.[0]}>
            <Select name="role_id" required value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">Choose a role…</option>
              {["internal", "client", "operative", "subcontractor"].map((s) => (
                <optgroup key={s} label={{ internal: "Staff", client: "Client portal", operative: "Field operatives", subcontractor: "Subcontractors" }[s]}>
                  {roles.filter((r) => r.scope === s).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </optgroup>
              ))}
            </Select>
          </Field>
          {roleId && (
            <Field label={linkLabel[scope] ?? "Linked record"} error={state.fieldErrors?.link_id?.[0]}>
              <Select name="link_id" required={scope !== "internal"} defaultValue="">
                <option value="">{scope === "internal" ? "Not an operative" : "Choose…"}</option>
                {(links[scope] ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          )}
          <div className="md:col-span-2"><InviteButton /></div>
          </>)}
        </ActionForm>
      </CardBody>
    </Card>
  );
}

const inputCls = "h-10 w-full rounded-[10px] border border-line-strong bg-sunken px-3 text-sm text-fg focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none";
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-muted">{label}</span>
      {children}
      {error && <span className="mt-1.5 block text-xs text-[#ff9b98]">{error}</span>}
    </label>
  );
}
function InviteButton() {
  return <SubmitButton pendingLabel="Inviting…"><UserPlus className="size-4" />Send invitation</SubmitButton>;
}

export function MemberRow({ member, roles }: { member: { id: string; isSelf: boolean; roleId: string; roleName: string; status: string; when: string }; roles: Opt[] }) {
  const tone = member.status === "active" ? "ok" : member.status === "invited" ? "info" : "warn";
  return (
    <>
      <TD>
        {member.isSelf ? (
          <span className="text-sm">{member.roleName}</span>
        ) : (
          <ActionForm action={changeRole} className="flex items-center gap-2">
            <input type="hidden" name="membership_id" value={member.id} />
            <Select name="role_id" defaultValue={member.roleId} className="h-8 w-48 text-[13px]" aria-label="Role">
              {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
            <SubmitButton size="sm" variant="secondary" pendingLabel="…">Save</SubmitButton>
          </ActionForm>
        )}
      </TD>
      <TD>
        <Badge tone={tone} dot>{member.status}</Badge>
        <div className="mt-1 text-[11px] text-subtle">{member.when}</div>
      </TD>
      <TD align="right">
        {!member.isSelf && (
          <ActionForm action={memberAction} className="inline-flex flex-wrap items-center justify-end gap-2">
            <input type="hidden" name="membership_id" value={member.id} />
            {member.status === "suspended" ? (
              <button name="op" value="reactivate" className="text-xs text-accent-hi hover:underline">Restore</button>
            ) : (
              <button name="op" value="suspend" className="text-xs text-muted hover:text-fg">Suspend</button>
            )}
            <button name="op" value="remove" className="text-xs text-[#ff8a87] hover:underline" onClick={(e) => { if (!confirm("Remove this person's access to the company?")) e.preventDefault(); }}>Remove</button>
          </ActionForm>
        )}
      </TD>
    </>
  );
}
