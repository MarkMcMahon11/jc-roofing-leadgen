import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardBody, CardHeader, DefinitionList, EmptyState, PageHeader } from "@/components/ui/primitives";
import { date, label, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Contracts" };

export default async function PortalContracts() {
  const ctx = await requireTenant();
  if (!ctx.can("contracts.read")) redirect("/portal");
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_contracts", { p_tenant: ctx.tenantId });
  return (
    <>
      <PageHeader title="Contracts" description="Your contracts with PowerMac and how they are performing." />
      {(data ?? []).length === 0 && <Card><EmptyState title="No contracts" /></Card>}
      <div className="grid gap-4 md:grid-cols-2">
        {(data ?? []).map((c) => (
          <Card key={c.id}>
            <CardHeader title={c.title} description={`${c.reference} · ${label(c.contract_type)}`} actions={<Badge tone={c.status === "active" ? "ok" : "neutral"}>{c.status}</Badge>} />
            <CardBody>
              <DefinitionList items={[
                { label: "Term", value: `${date(c.start_date)} – ${date(c.end_date)}` },
                { label: "Open jobs", value: c.jobs_open },
                { label: "Completed jobs", value: c.jobs_completed },
                { label: "Completed on time", value: pct(c.on_time_pct === null ? null : Number(c.on_time_pct)) },
                { label: "Average satisfaction", value: c.avg_satisfaction ? `${Number(c.avg_satisfaction).toFixed(1)} / 5` : "-" },
              ]} />
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
