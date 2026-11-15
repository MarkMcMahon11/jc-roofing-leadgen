"use client";

import { Fragment, useOptimistic, useState, useTransition } from "react";
import { Lock, ShieldAlert, Trash2 } from "lucide-react";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { Badge, Card, CardBody, CardHeader, Notice, cx } from "@/components/ui/primitives";
import { createRole, deleteRole, setPermission } from "./actions";

type Role = { id: string; name: string; description: string; scope: string; isSystem: boolean; members: number; isMine: boolean; permissions: string[] };
type Perm = { key: string; module: string; label: string; description: string; scopes: string[]; sensitive: boolean; mine: boolean };

const SCOPES: Record<string, string> = { internal: "Staff", client: "Client", operative: "Operative", subcontractor: "Subcontractor", occupant: "Tenant" };

export function RolesMatrix({ roles, permissions }: { roles: Role[]; permissions: Perm[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [optimistic, toggle] = useOptimistic(roles, (state, change: { role: string; perm: string; on: boolean }) =>
    state.map((r) => (r.id === change.role ? { ...r, permissions: change.on ? [...r.permissions, change.perm] : r.permissions.filter((p) => p !== change.perm) } : r)),
  );
  const modules = [...new Set(permissions.map((p) => p.module))];

  const onToggle = (role: Role, perm: Perm, on: boolean) => {
    setError(null);
    start(async () => {
      toggle({ role: role.id, perm: perm.key, on });
      const res = await setPermission(role.id, perm.key, on);
      if (!res.ok) setError(res.message ?? "That change was not allowed.");
    });
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader
          title="Permission matrix"
          description="Tick to grant. Changes save immediately and are audited. You cannot edit your own role or grant permissions you do not hold."
          actions={pending ? <span className="text-xs text-accent-hi">Saving…</span> : null}
        />
        {error && <div className="px-5 pt-4"><Notice tone="bad">{error}</Notice></div>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-sunken">
              <tr>
                <th className="sticky left-0 z-10 w-72 border-b border-line bg-sunken px-4 py-3 text-left text-xs font-medium text-subtle uppercase">Permission</th>
                {optimistic.map((r) => (
                  <th key={r.id} className="border-b border-l border-line px-2 py-3 text-center align-bottom">
                    <div className="mx-auto max-w-24 text-xs leading-tight font-medium text-fg">{r.name}</div>
                    <div className="mt-1 text-[10px] text-subtle">{SCOPES[r.scope]} · {r.members}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => (
                <Fragment key={mod}>
                  <tr>
                    <td colSpan={optimistic.length + 1} className="sticky left-0 bg-chrome/60 px-4 pt-4 pb-1.5 text-[11px] font-semibold tracking-wider text-accent-hi uppercase">{mod.replace(/_/g, " ")}</td>
                  </tr>
                  {permissions.filter((p) => p.module === mod).map((p) => (
                    <tr key={p.key} className="border-b border-line/60 hover:bg-raised/40">
                      <td className="sticky left-0 z-[1] bg-surface px-4 py-2">
                        <div className="flex items-center gap-1.5 text-fg">
                          {p.label}
                          {p.sensitive && <ShieldAlert className="size-3.5 text-warn" aria-label="Sensitive" />}
                        </div>
                        <div className="font-mono text-[11px] text-subtle">{p.key}</div>
                      </td>
                      {optimistic.map((r) => {
                        const applicable = p.scopes.includes(r.scope);
                        const checked = r.permissions.includes(p.key);
                        const locked = r.isMine || !p.mine;
                        return (
                          <td key={r.id} className="border-l border-line/60 text-center">
                            {applicable ? (
                              <label className={cx("inline-flex size-8 items-center justify-center rounded-md", !locked && "cursor-pointer hover:bg-raised")} title={r.isMine ? "You cannot edit your own role" : !p.mine ? "You do not hold this permission" : undefined}>
                                <input
                                  type="checkbox"
                                  className="size-4 accent-[#5ee000] disabled:opacity-40"
                                  checked={checked}
                                  disabled={locked || pending}
                                  onChange={(e) => onToggle(r, p, e.target.checked)}
                                  aria-label={`${p.label} for ${r.name}`}
                                />
                              </label>
                            ) : (
                              <span className="text-line-strong" aria-label="Not applicable">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Create a role" description="Start from an existing role, then adjust its permissions in the matrix." />
          <CardBody>
            <ActionForm action={createRole} resetOnSuccess className="grid gap-4">
              <TextField name="name" label="Role name" required placeholder="e.g. Site Supervisor" />
              <TextField name="description" label="Description" />
              <SelectField name="copy_from" label="Start from" required placeholder="Choose…" options={roles.map((r) => ({ value: r.id, label: `${r.name} (${SCOPES[r.scope]})` }))} />
              <div><SubmitButton>Create role</SubmitButton></div>
            </ActionForm>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Roles" />
          <CardBody className="space-y-2">
            {roles.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-sunken px-4 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">{r.name}{r.isSystem && <Lock className="size-3 text-subtle" aria-label="Built-in" />}</div>
                  <div className="truncate text-xs text-subtle">{r.description || SCOPES[r.scope]}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{r.members} {r.members === 1 ? "person" : "people"}</Badge>
                  {!r.isSystem && (
                    <ActionForm action={deleteRole}>
                      <input type="hidden" name="role_id" value={r.id} />
                      <SubmitButton size="sm" variant="danger" pendingLabel="…"><Trash2 className="size-3.5" /><span className="sr-only">Delete {r.name}</span></SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
