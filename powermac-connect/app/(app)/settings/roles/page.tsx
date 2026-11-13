import type { Metadata } from "next";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { RolesMatrix } from "./roles-matrix";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const ctx = await requireInternal("users.manage");
  const supabase = await createClient();
  const [{ data: roles }, { data: perms }, { data: members }] = await Promise.all([
    supabase.from("roles").select("id, key, name, description, scope_type, is_system, role_permissions(permission_key)").eq("tenant_id", ctx.tenantId).order("is_system", { ascending: false }).order("name"),
    supabase.from("permissions").select("key, module, label, description, scopes, is_sensitive, sort_order").order("sort_order"),
    supabase.from("memberships").select("role_id").eq("tenant_id", ctx.tenantId),
  ]);
  const counts = new Map<string, number>();
  for (const m of members ?? []) counts.set(m.role_id, (counts.get(m.role_id) ?? 0) + 1);
  const myRole = ctx.active.role.id;
  return (
    <RolesMatrix
      roles={(roles ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        scope: r.scope_type,
        isSystem: r.is_system,
        members: counts.get(r.id) ?? 0,
        isMine: r.id === myRole,
        permissions: (r.role_permissions ?? []).map((p) => p.permission_key),
      }))}
      permissions={(perms ?? []).map((p) => ({ key: p.key, module: p.module, label: p.label, description: p.description, scopes: p.scopes, sensitive: p.is_sensitive, mine: ctx.can(p.key) }))}
    />
  );
}
