import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Badge, ButtonLink, Card, CardHeader, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Logo } from "@/components/shell/logo";
import { signOut } from "@/components/shell/actions";
import { count, date } from "@/lib/format";
import { CreateTenantForm, SubscriptionForm } from "./platform-forms";

export const metadata: Metadata = { title: "Platform console" };

export default async function PlatformPage() {
  const ctx = await requireUser();
  if (!ctx.isPlatformAdmin) redirect("/no-access?need=platform");
  const supabase = await createClient();
  const { data: tenants } = await supabase.rpc("platform_tenant_overview");
  const list = tenants ?? [];
  const mrr = { trial: 0, professional: 799, enterprise: 1999 } as Record<string, number>;
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-8 md:px-8">
      <div className="mb-8 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          {ctx.active && <ButtonLink href="/" variant="secondary" size="sm">Open {ctx.active.tenant.name}</ButtonLink>}
          <form action={signOut}><button className="text-sm text-muted hover:text-fg">Sign out</button></form>
        </div>
      </div>
      <PageHeader eyebrow="BPOAI.AI" title="Platform console" description="Customer companies, subscriptions and usage. Business records inside each company are not visible here." />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Companies" value={list.length} tone="accent" />
        <Stat label="Active subscriptions" value={list.filter((t) => t.subscription_status === "active").length} tone="ok" />
        <Stat label="Monthly recurring (list)" value={`£${count(list.filter((t) => t.subscription_status === "active").reduce((s, t) => s + (mrr[t.plan_key] ?? 0), 0))}`} />
        <Stat label="Active users" value={count(list.reduce((s, t) => s + Number(t.active_users), 0))} />
      </div>
      <Card className="mb-6">
        <CardHeader title="Companies" />
        <Table>
          <THead><tr><TH>Company</TH><TH>Plan</TH><TH>Status</TH><TH align="right">Users</TH><TH align="right">Properties</TH><TH align="right">Jobs</TH><TH>Since</TH><TH>Subscription</TH></tr></THead>
          <tbody>
            {list.map((t) => (
              <TR key={t.id}>
                <TD><div className="font-medium">{t.name}</div><div className="font-mono text-xs text-subtle">{t.slug}</div>{t.is_demo && <Badge tone="warn" className="mt-1">Demo</Badge>}</TD>
                <TD>{t.plan_key}</TD>
                <TD><Badge tone={t.subscription_status === "active" ? "ok" : t.subscription_status === "trial" ? "info" : "warn"}>{t.subscription_status}</Badge></TD>
                <TD align="right">{t.active_users} / {t.seats}</TD>
                <TD align="right">{count(Number(t.properties))}</TD>
                <TD align="right">{count(Number(t.work_orders))}</TD>
                <TD className="text-muted">{date(t.created_at)}</TD>
                <TD><SubscriptionForm tenant={{ id: t.id, plan: t.plan_key, status: t.subscription_status, seats: t.seats }} /></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
      <CreateTenantForm />
      <p className="mt-6 text-xs text-subtle">To give a new company its first administrator, add a membership for them as Company Director (for example via the Supabase dashboard or a platform invitation). Platform admins do not automatically get access to company data. <Link href="/privacy" className="underline">Privacy</Link></p>
    </div>
  );
}
