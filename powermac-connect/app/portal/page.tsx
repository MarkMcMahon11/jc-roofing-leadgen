import type { Metadata } from "next";
import Link from "next/link";
import { requireTenant } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink, Card, CardHeader, ColourBadge, EmptyState, PageHeader, Stat } from "@/components/ui/primitives";
import { date } from "@/lib/format";

export const metadata: Metadata = { title: "Client portal" };

export default async function PortalHome() {
  const ctx = await requireTenant();
  const supabase = await createClient();
  const [{ data: ov }, { data: jobs }] = await Promise.all([
    supabase.rpc("portal_overview", { p_tenant: ctx.tenantId }),
    supabase.rpc("portal_jobs", { p_tenant: ctx.tenantId, p_open_only: true, p_limit: 8 }),
  ]);
  const o = (ov ?? {}) as Record<string, number | string>;
  return (
    <>
      <PageHeader
        eyebrow={String(o.organisation ?? "")}
        title={`Welcome, ${ctx.fullName.split(" ")[0]}`}
        description="Track repairs and works at your properties, approve quotations and see completed work."
        actions={ctx.can("portal.request") ? <ButtonLink href="/portal/request" variant="primary">Request a repair</ButtonLink> : null}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Open jobs" value={o.open_jobs ?? 0} href="/portal/jobs" tone="accent" />
        <Stat label="Past target date" value={o.overdue ?? 0} href="/portal/jobs" tone={Number(o.overdue) ? "warn" : "ok"} />
        <Stat label="Awaiting your approval" value={o.awaiting_your_approval ?? 0} href="/portal/quotes" tone={Number(o.awaiting_your_approval) ? "warn" : "neutral"} />
        <Stat label="Completed (30 days)" value={o.completed_30d ?? 0} href="/portal/jobs?all=1" tone="ok" />
        <Stat label="Properties" value={o.properties ?? 0} href="/portal/properties" />
      </div>
      <Card className="mt-6">
        <CardHeader title="Latest open jobs" actions={<ButtonLink href="/portal/jobs" size="sm" variant="ghost">All jobs</ButtonLink>} />
        {(jobs ?? []).length === 0 ? <EmptyState title="No open jobs" /> : (
          <ul className="divide-y divide-line">
            {(jobs ?? []).map((j) => (
              <li key={j.id}>
                <Link href={`/portal/jobs/${j.id}`} className="flex flex-col gap-1 px-5 py-3 hover:bg-raised/50 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{j.title}</span>
                    <span className="block truncate text-xs text-muted">{j.address}, {j.postcode} · {j.reference}{j.client_reference ? ` · your ref ${j.client_reference}` : ""}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-xs text-subtle">
                    {j.scheduled_start ? `Booked ${date(j.scheduled_start)}` : j.target_completion_at ? `Target ${date(j.target_completion_at)}` : ""}
                    <ColourBadge colour={j.status_colour}>{j.status_label}</ColourBadge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
