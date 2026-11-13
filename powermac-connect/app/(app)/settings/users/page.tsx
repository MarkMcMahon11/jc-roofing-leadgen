import type { Metadata } from "next";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { relative } from "@/lib/format";
import { InvitePanel, MemberRow } from "./users-client";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const ctx = await requireInternal("users.manage");
  const supabase = await createClient();
  const [{ data: members }, { data: roles }, { data: orgs }, { data: emps }, { data: subs }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, status, invited_at, accepted_at, user_id, organisation_id, employee_id, subcontractor_id, profile:profiles!memberships_user_id_fkey(full_name, email, last_seen_at), role:roles(id, name, scope_type), organisation:organisations(name), employee:employees!memberships_tenant_id_employee_id_fkey(first_name, last_name), subcontractor:subcontractors(company_name)")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at"),
    supabase.from("roles").select("id, name, scope_type").eq("tenant_id", ctx.tenantId).order("name"),
    supabase.from("organisations").select("id, name").eq("tenant_id", ctx.tenantId).neq("status", "prospect").order("name"),
    supabase.from("employees").select("id, first_name, last_name").eq("tenant_id", ctx.tenantId).neq("employment_status", "left").order("last_name"),
    supabase.from("subcontractors").select("id, company_name").eq("tenant_id", ctx.tenantId).neq("status", "archived").order("company_name"),
  ]);

  const scopeLabel: Record<string, string> = { internal: "Staff", client: "Client portal", operative: "Field app", subcontractor: "Subcontractor", occupant: "Tenant portal" };
  const rows = (members ?? []).map((m) => ({
    id: m.id,
    isSelf: m.user_id === ctx.userId,
    name: m.profile?.full_name || m.profile?.email || "Unknown",
    email: m.profile?.email ?? "",
    roleId: m.role?.id ?? "",
    roleName: m.role?.name ?? "",
    scope: m.role?.scope_type ?? "internal",
    linked: m.organisation?.name ?? (m.employee ? `${m.employee.first_name} ${m.employee.last_name}` : null) ?? m.subcontractor?.company_name ?? null,
    status: m.status,
    when: m.status === "invited" ? `Invited ${relative(m.invited_at)}` : m.accepted_at ? `Joined ${relative(m.accepted_at)}` : "",
  }));

  return (
    <div className="grid gap-6">
      <InvitePanel
        roles={(roles ?? []).map((r) => ({ id: r.id, name: r.name, scope: r.scope_type }))}
        links={{
          client: (orgs ?? []).map((o) => ({ value: o.id, label: o.name })),
          operative: (emps ?? []).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` })),
          internal: (emps ?? []).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` })),
          subcontractor: (subs ?? []).map((s) => ({ value: s.id, label: s.company_name })),
        }}
      />
      <Card>
        <CardHeader title="People with access" description={`${rows.filter((r) => r.status === "active").length} active · ${rows.filter((r) => r.status === "invited").length} invited`} />
        <Table>
          <THead>
            <tr>
              <TH>Person</TH>
              <TH>Access</TH>
              <TH>Role</TH>
              <TH>Status</TH>
              <TH align="right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <div className="font-medium">{r.name}{r.isSelf && <span className="ml-2 text-xs text-subtle">(you)</span>}</div>
                  <div className="text-xs text-subtle">{r.email}</div>
                </TD>
                <TD>
                  <div className="text-sm">{scopeLabel[r.scope]}</div>
                  {r.linked && <div className="text-xs text-subtle">{r.linked}</div>}
                </TD>
                <MemberRow member={r} roles={(roles ?? []).filter((x) => x.scope_type === r.scope).map((x) => ({ value: x.id, label: x.name }))} />
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
      <p className="text-xs text-subtle">
        You can only give people roles whose permissions you hold yourself, and you cannot change your own access. Every change is recorded in the audit log.
      </p>
    </div>
  );
}
