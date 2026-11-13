"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { fromDb, fromZod, type ActionResult } from "@/lib/actions";

export async function setPermission(roleId: string, permission: string, granted: boolean): Promise<ActionResult> {
  const ctx = await requireInternal("users.manage");
  const ok = z.object({ roleId: z.string().uuid(), permission: z.string().regex(/^[a-z_]+\.[a-z_]+$/) }).safeParse({ roleId, permission });
  if (!ok.success) return { ok: false, message: "Invalid request." };
  const supabase = await createClient();
  const { error } = granted
    ? await supabase.from("role_permissions").insert({ tenant_id: ctx.tenantId, role_id: roleId, permission_key: permission })
    : await supabase.from("role_permissions").delete().eq("role_id", roleId).eq("permission_key", permission).eq("tenant_id", ctx.tenantId);
  if (error) return fromDb(error, "The permission could not be changed.");
  revalidatePath("/settings/roles");
  return { ok: true };
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Enter a role name").max(80),
  description: z.string().trim().max(500).optional(),
  copy_from: z.string().uuid("Choose a role to start from"),
});

export async function createRole(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("users.manage");
  const parsed = createSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data: base } = await supabase.from("roles").select("scope_type, role_permissions(permission_key)").eq("id", parsed.data.copy_from).single();
  if (!base) return { ok: false, message: "Starting role not found." };
  const key = parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32) + "_" + Math.random().toString(36).slice(2, 6);
  const { data: role, error } = await supabase
    .from("roles")
    .insert({ tenant_id: ctx.tenantId, key, name: parsed.data.name, description: parsed.data.description ?? "", scope_type: base.scope_type, is_system: false })
    .select("id")
    .single();
  if (error || !role) return fromDb(error, "The role could not be created.");
  const perms = (base.role_permissions ?? []).map((p) => p.permission_key).filter((p) => ctx.can(p));
  if (perms.length) {
    const { error: pErr } = await supabase.from("role_permissions").insert(perms.map((p) => ({ tenant_id: ctx.tenantId, role_id: role.id, permission_key: p })));
    if (pErr) return fromDb(pErr, "The role was created but some permissions could not be copied.");
  }
  revalidatePath("/settings/roles");
  return { ok: true, message: `Role "${parsed.data.name}" created with ${perms.length} permissions.` };
}

export async function deleteRole(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("users.manage");
  const id = z.string().uuid().safeParse(formData.get("role_id"));
  if (!id.success) return { ok: false, message: "Invalid request." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("roles").delete().eq("id", id.data).eq("tenant_id", ctx.tenantId).eq("is_system", false).select("id");
  if (error) return fromDb(error, "This role is still assigned to people. Move them to another role first.");
  if (!data?.length) return { ok: false, message: "Built-in roles cannot be deleted." };
  revalidatePath("/settings/roles");
  return { ok: true, message: "Role deleted." };
}
