import "server-only";
import type { TenantContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { Opt } from "./shared";

/**
 * Internal staff who can be account managers, contract managers or opportunity owners.
 * People with users.manage see every staff membership. Everyone else can only read their own
 * membership (RLS), so the list is completed with people already acting as staff on CRM and
 * contract records (managers and owners are staff by definition) plus anyone in `include`.
 */
export async function getStaffOptions(ctx: TenantContext, include: (string | null | undefined)[] = []): Promise<Opt[]> {
  const supabase = await createClient();
  const names = new Map<string, string>();
  const { data: members } = await supabase
    .from("memberships")
    .select("user_id, profile:profiles!memberships_user_id_fkey(full_name, email), role:roles!inner(scope_type)")
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "active")
    .eq("role.scope_type", "internal");
  for (const m of members ?? []) names.set(m.user_id, m.profile?.full_name || m.profile?.email || "Unnamed");
  names.set(ctx.userId, ctx.fullName);

  const wanted = new Set<string>(include.filter((x): x is string => Boolean(x)));
  if (!ctx.can("users.manage")) {
    const [orgs, cons, opps, acts] = await Promise.all([
      supabase.from("organisations").select("account_manager_id, contract_manager_id").eq("tenant_id", ctx.tenantId).limit(2000),
      supabase.from("contracts").select("contract_manager_id").eq("tenant_id", ctx.tenantId).limit(2000),
      supabase.from("crm_opportunities").select("owner_id").eq("tenant_id", ctx.tenantId).limit(2000),
      supabase.from("crm_activities").select("owner_id").eq("tenant_id", ctx.tenantId).not("owner_id", "is", null).limit(2000),
    ]);
    for (const o of orgs.data ?? []) [o.account_manager_id, o.contract_manager_id].forEach((x) => x && wanted.add(x));
    for (const c of cons.data ?? []) if (c.contract_manager_id) wanted.add(c.contract_manager_id);
    for (const o of opps.data ?? []) if (o.owner_id) wanted.add(o.owner_id);
    for (const a of acts.data ?? []) if (a.owner_id) wanted.add(a.owner_id);
  }
  const missing = [...wanted].filter((id) => !names.has(id));
  if (missing.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", missing);
    for (const p of profiles ?? []) names.set(p.id, p.full_name || p.email);
  }
  return [...names].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

/** Client organisations for pickers (not archived), A-Z. */
export async function getOrgOptions(tenantId: string, opts: { includeInactive?: boolean } = {}): Promise<Opt[]> {
  const supabase = await createClient();
  let q = supabase.from("organisations").select("id, name, status").eq("tenant_id", tenantId).is("archived_at", null);
  if (!opts.includeInactive) q = q.neq("status", "inactive");
  const { data } = await q.order("name").limit(2000);
  return (data ?? []).map((o) => ({ value: o.id, label: o.status === "prospect" ? `${o.name} (prospect)` : o.name }));
}
