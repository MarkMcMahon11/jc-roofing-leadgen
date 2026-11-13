"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ACTIVE_TENANT_COOKIE, homeFor, requireUser } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { logEvent } from "@/lib/audit";

export async function switchTenant(formData: FormData) {
  const ctx = await requireUser();
  const id = String(formData.get("tenantId") ?? "");
  const target = ctx.memberships.find((m) => m.tenant.id === id);
  if (!target) return;
  (await cookies()).set(ACTIVE_TENANT_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 180 });
  const supabase = await createClient();
  await supabase.from("profiles").update({ last_tenant_id: id }).eq("id", ctx.userId);
  revalidatePath("/", "layout");
  redirect(homeFor({ ...ctx, active: target, can: (p) => target.permissions.includes(p) }));
}

export async function signOut() {
  const supabase = await createClient();
  const ctx = await requireUser();
  await logEvent(supabase, ctx.active?.tenant.id ?? null, "logout", "session");
  await supabase.auth.signOut();
  const jar = await cookies();
  jar.delete(ACTIVE_TENANT_COOKIE);
  jar.delete("pmc_last_active");
  redirect("/login");
}

export async function markNotificationsRead() {
  const ctx = await requireUser();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", ctx.userId).is("read_at", null);
  revalidatePath("/", "layout");
}

export type SearchHit = { kind: string; id: string; title: string; subtitle: string | null; link: string };

/** Global search across jobs, properties, clients, contracts and people - limited to what the user can see. */
export async function globalSearch(query: string): Promise<SearchHit[]> {
  const ctx = await requireUser();
  const q = query.trim().slice(0, 80);
  if (!ctx.active || q.length < 2) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("search_everything", { p_tenant: ctx.active.tenant.id, p_query: q, p_limit: 5 });
  return (data ?? []).map((r) => ({ kind: r.kind, id: r.id, title: r.title, subtitle: r.subtitle, link: r.link }));
}
