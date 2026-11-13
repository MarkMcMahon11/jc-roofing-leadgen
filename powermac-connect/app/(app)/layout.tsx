import { redirect } from "next/navigation";
import { homeFor, requireTenant } from "@/lib/auth/context";
import { visibleNav } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import { initials, relative } from "@/lib/format";
import { Shell } from "@/components/shell/shell";

// The internal (PowerMac staff) workspace. Client portal, field app and platform console have their own layouts.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant();
  if (ctx.active.role.scope !== "internal") redirect(homeFor(ctx));

  const supabase = await createClient();
  const { data: notes } = await supabase
    .from("notifications")
    .select("id, title, body, link, severity, created_at")
    .eq("tenant_id", ctx.tenantId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <Shell
      nav={visibleNav(ctx.can)}
      user={{ name: ctx.fullName, email: ctx.email, role: ctx.active.role.name, initials: initials(ctx.fullName) }}
      tenant={{ id: ctx.tenantId, name: ctx.active.tenant.name, isDemo: ctx.active.tenant.is_demo }}
      tenants={ctx.memberships.map((m) => ({ id: m.tenant.id, name: m.tenant.name, isDemo: m.tenant.is_demo }))}
      notifications={(notes ?? []).map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, severity: n.severity, created: relative(n.created_at) }))}
      isPlatformAdmin={ctx.isPlatformAdmin}
    >
      {children}
    </Shell>
  );
}
