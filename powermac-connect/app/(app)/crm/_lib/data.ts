import "server-only";
import type { TenantContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { Opt } from "./shared";

/**
 * Active internal staff for account manager / contract manager / owner pickers, from the
 * minimal `internal_staff` directory function. `include` keeps people already named on the
 * record (e.g. someone who has since left) so the current value still displays.
 */
export async function getStaffOptions(ctx: TenantContext, include: (string | null | undefined)[] = []): Promise<Opt[]> {
  const supabase = await createClient();
  const names = new Map<string, string>();
  const { data } = await supabase.rpc("internal_staff", { p_tenant: ctx.tenantId });
  for (const p of data ?? []) names.set(p.user_id, p.full_name);
  const missing = include.filter((x): x is string => Boolean(x) && !names.has(x as string));
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
