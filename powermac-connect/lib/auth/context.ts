import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Scope = "internal" | "client" | "operative" | "subcontractor" | "occupant";

export type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  is_demo: boolean;
  reference_prefix: string;
  subscription_status: string;
  plan_key: string;
  timezone: string;
  currency: string;
  default_vat_rate: number;
  settings: Record<string, unknown>;
};

export type MembershipContext = {
  id: string;
  tenant: TenantSummary;
  role: { id: string; key: string; name: string; scope: Scope };
  permissions: string[];
  organisationId: string | null;
  employeeId: string | null;
  subcontractorId: string | null;
  occupantId: string | null;
};

export type AppContext = {
  userId: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
  memberships: MembershipContext[];
  active: MembershipContext | null;
  can: (permission: string) => boolean;
};

export type TenantContext = AppContext & { active: MembershipContext; tenantId: string };

export const ACTIVE_TENANT_COOKIE = "pmc_tenant";

/** The signed-in user, their memberships and the active tenant. Cached per request. */
export const getContext = cache(async (): Promise<AppContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: rows, error }] = await Promise.all([
    supabase.from("profiles").select("full_name, email, is_platform_admin, last_tenant_id").eq("id", user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select(
        "id, organisation_id, employee_id, subcontractor_id, occupant_id, role:roles(id, key, name, scope_type, role_permissions(permission_key)), tenant:tenants(id, name, slug, is_demo, reference_prefix, subscription_status, plan_key, timezone, currency, default_vat_rate, settings)",
      )
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);
  if (error) throw new Error(`Could not load your access: ${error.message}`);

  const memberships: MembershipContext[] = (rows ?? [])
    .filter((m) => m.tenant && m.role) // tenant hidden when its subscription is suspended/cancelled
    .map((m) => ({
      id: m.id,
      tenant: { ...(m.tenant as unknown as TenantSummary), default_vat_rate: Number(m.tenant!.default_vat_rate) },
      role: { id: m.role!.id, key: m.role!.key, name: m.role!.name, scope: m.role!.scope_type as Scope },
      permissions: (m.role!.role_permissions ?? []).map((p) => p.permission_key),
      organisationId: m.organisation_id,
      employeeId: m.employee_id,
      subcontractorId: m.subcontractor_id,
      occupantId: m.occupant_id,
    }))
    .sort((a, b) => a.tenant.name.localeCompare(b.tenant.name));

  const wanted = (await cookies()).get(ACTIVE_TENANT_COOKIE)?.value ?? profile?.last_tenant_id ?? null;
  const active = memberships.find((m) => m.tenant.id === wanted) ?? memberships[0] ?? null;
  const perms = new Set(active?.permissions ?? []);

  return {
    userId: user.id,
    email: user.email ?? profile?.email ?? "",
    fullName: profile?.full_name || user.email || "",
    isPlatformAdmin: Boolean(profile?.is_platform_admin),
    memberships,
    active,
    can: (p: string) => perms.has(p),
  };
});

export async function requireUser(): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** A signed-in user with an active company. */
export async function requireTenant(): Promise<TenantContext> {
  const ctx = await requireUser();
  if (!ctx.active) redirect(ctx.isPlatformAdmin ? "/platform" : "/no-access?reason=no-company");
  return { ...ctx, active: ctx.active, tenantId: ctx.active.tenant.id };
}

/** PowerMac staff (internal scope), optionally holding a permission. */
export async function requireInternal(permission?: string | string[]): Promise<TenantContext> {
  const ctx = await requireTenant();
  if (ctx.active.role.scope !== "internal") redirect(homeFor(ctx));
  const needed = permission ? (Array.isArray(permission) ? permission : [permission]) : [];
  if (needed.length && !needed.some((p) => ctx.can(p))) redirect(`/no-access?need=${encodeURIComponent(needed.join(","))}`);
  return ctx;
}

/** Where a user lands after signing in. */
export function homeFor(ctx: AppContext): string {
  if (!ctx.active) return ctx.isPlatformAdmin ? "/platform" : "/no-access?reason=no-company";
  switch (ctx.active.role.scope) {
    case "client":
    case "occupant":
      return "/portal";
    case "operative":
    case "subcontractor":
      return "/field";
    default:
      if (ctx.can("dashboard.view")) return "/dashboard";
      if (ctx.can("work_orders.read")) return "/jobs";
      return "/settings/profile";
  }
}
