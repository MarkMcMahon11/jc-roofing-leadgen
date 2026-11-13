import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { TenantContext } from "@/lib/auth/context";
import { date as fmtDate, initials } from "@/lib/format";
import type { BoardCard, ContractOption, JobCardRow, Option, PropertyOption, Transition } from "./types";

/** Configured workflow moves for the tenant. */
export const getTransitions = cache(async (tenantId: string): Promise<Transition[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("job_status_transitions").select("from_key, to_key, required_permission").eq("tenant_id", tenantId);
  return data ?? [];
});

/** Human labels for permission keys (used to explain refused moves). */
export const getPermissionLabels = cache(async (): Promise<Record<string, string>> => {
  const supabase = await createClient();
  const { data } = await supabase.from("permissions").select("key, label");
  return Object.fromEntries((data ?? []).map((p) => [p.key, p.label]));
});

/**
 * Internal staff who can be named as a job's manager. Users who manage users can list
 * internal memberships; for everyone else memberships are private, so we offer the staff
 * already acting as managers on jobs, contracts and accounts, plus the current user.
 */
export const getManagers = cache(async (ctx: TenantContext): Promise<Option[]> => {
  const supabase = await createClient();
  const ids = new Set<string>([ctx.userId]);
  if (ctx.can("users.manage")) {
    const { data } = await supabase
      .from("memberships")
      .select("user_id, roles!inner(scope_type)")
      .eq("tenant_id", ctx.tenantId)
      .eq("status", "active")
      .eq("roles.scope_type", "internal");
    for (const m of data ?? []) ids.add(m.user_id);
  } else {
    const [w, c, o] = await Promise.all([
      supabase.from("work_orders").select("manager_id").eq("tenant_id", ctx.tenantId).not("manager_id", "is", null).limit(1000),
      supabase.from("contracts").select("contract_manager_id").eq("tenant_id", ctx.tenantId).not("contract_manager_id", "is", null),
      supabase.from("organisations").select("account_manager_id, contract_manager_id").eq("tenant_id", ctx.tenantId),
    ]);
    for (const r of w.data ?? []) if (r.manager_id) ids.add(r.manager_id);
    for (const r of c.data ?? []) if (r.contract_manager_id) ids.add(r.contract_manager_id);
    for (const r of o.data ?? []) {
      if (r.account_manager_id) ids.add(r.account_manager_id);
      if (r.contract_manager_id) ids.add(r.contract_manager_id);
    }
  }
  const { data: people } = await supabase.from("profiles").select("id, full_name, email").in("id", [...ids]);
  return (people ?? [])
    .map((p) => ({ value: p.id, label: p.full_name || p.email }))
    .sort((a, b) => a.label.localeCompare(b.label));
});

export const getClients = cache(async (tenantId: string): Promise<Option[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("organisations").select("id, name").eq("tenant_id", tenantId).neq("status", "prospect").is("archived_at", null).order("name");
  return (data ?? []).map((o) => ({ value: o.id, label: o.name }));
});

export const getContractsForFilter = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("contracts").select("id, reference, title, organisation_id, status").eq("tenant_id", tenantId).order("reference");
  return (data ?? []).map((c) => ({ value: c.id, label: `${c.reference} · ${c.title}`, org: c.organisation_id }));
});

export const getOperatives = cache(async (tenantId: string): Promise<Option[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("tenant_id", tenantId)
    .eq("is_field_operative", true)
    .neq("employment_status", "left")
    .order("first_name");
  return (data ?? []).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` }));
});

/** Properties and contracts of one client (for the create / bulk forms). */
export async function loadClientData(tenantId: string, orgId: string): Promise<{ properties: PropertyOption[]; contracts: ContractOption[] }> {
  const supabase = await createClient();
  const [{ data: props }, { data: cons }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, reference, address_line1, address_line2, town, postcode")
      .eq("tenant_id", tenantId)
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("address_line1")
      .limit(5000),
    supabase
      .from("contracts")
      .select("id, reference, title, status, contract_slas(priority, attend_hours, complete_hours)")
      .eq("tenant_id", tenantId)
      .eq("organisation_id", orgId)
      .not("status", "in", "(terminated,completed,expired)")
      .order("reference"),
  ]);
  return {
    properties: (props ?? []).map((p) => ({
      id: p.id,
      reference: p.reference,
      address: [p.address_line1, p.address_line2].filter(Boolean).join(", "),
      postcode: p.postcode,
      town: p.town,
    })),
    contracts: (cons ?? [])
      .sort((a, b) => Number(b.status === "active") - Number(a.status === "active"))
      .map((c) => ({
        id: c.id,
        label: `${c.reference} · ${c.title}${c.status === "active" ? "" : ` (${c.status.replace(/_/g, " ")})`}`,
        status: c.status,
        slas: (c.contract_slas ?? []).map((s) => ({ priority: s.priority, attend_hours: s.attend_hours === null ? null : Number(s.attend_hours), complete_hours: s.complete_hours === null ? null : Number(s.complete_hours) })),
      })),
  };
}

/** Due-date state of an open job: overdue, due within 24 hours, or fine. */
export function dueState(target: string | null, open: boolean, now = Date.now()): BoardCard["targetState"] {
  if (!target || !open) return null;
  const t = new Date(target).getTime();
  if (t < now) return "overdue";
  if (t - now < 86_400_000) return "soon";
  return "ok";
}

export function toBoardCard(r: JobCardRow, open: boolean): BoardCard {
  return {
    id: r.id,
    reference: r.reference,
    title: r.title,
    status: r.status,
    priority: r.priority,
    property: r.properties ? `${r.properties.address_line1}, ${r.properties.postcode}` : "",
    client: r.organisations?.name ?? "",
    target: r.target_completion_at,
    targetLabel: r.target_completion_at ? fmtDate(r.target_completion_at) : null,
    targetState: dueState(r.target_completion_at, open),
    assignees: assignees(r.job_assignments),
  };
}

export function assignees(rows: JobCardRow["job_assignments"]) {
  const seen = new Set<string>();
  const out: { initials: string; name: string; colour: string }[] = [];
  for (const a of rows ?? []) {
    if (a.status === "cancelled") continue;
    const name = a.employees ? `${a.employees.first_name} ${a.employees.last_name}` : a.subcontractors?.company_name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, initials: initials(name), colour: a.employees?.colour ?? "#8b5cf6" });
  }
  return out;
}
