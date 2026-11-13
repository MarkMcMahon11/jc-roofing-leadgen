import type { Metadata } from "next";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader, DefinitionList, Badge } from "@/components/ui/primitives";
import { date } from "@/lib/format";
import { CompanyForm } from "./company-form";

export const metadata: Metadata = { title: "Company" };

export default async function CompanyPage() {
  const ctx = await requireInternal("settings.manage");
  const supabase = await createClient();
  const { data: t } = await supabase.from("tenants").select("*, plan:plans(name, included_users)").eq("id", ctx.tenantId).single();
  if (!t) return null;
  return (
    <div className="grid gap-6">
      <CompanyForm tenant={{ name: t.name, legal_name: t.legal_name ?? "", company_number: t.company_number ?? "", vat_number: t.vat_number ?? "", reference_prefix: t.reference_prefix, default_vat_rate: String(t.default_vat_rate), timezone: t.timezone }} />
      <Card>
        <CardHeader title="Subscription" description="Managed by BPOAI.AI. Contact your account manager to change plan." />
        <CardBody>
          <DefinitionList columns={3} items={[
            { label: "Plan", value: t.plan?.name },
            { label: "Status", value: <Badge tone={t.subscription_status === "active" ? "ok" : "warn"}>{t.subscription_status}</Badge> },
            { label: "Seats", value: t.seats },
            { label: "Environment", value: t.is_demo ? <Badge tone="warn">Demo</Badge> : "Live" },
            { label: "Trial ends", value: date(t.trial_ends_at) },
            { label: "Customer since", value: date(t.created_at) },
          ]} />
        </CardBody>
      </Card>
    </div>
  );
}
