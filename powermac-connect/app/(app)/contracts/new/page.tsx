import type { Metadata } from "next";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { PageHeader } from "@/components/ui/primitives";
import { getOrgOptions, getStaffOptions } from "../../crm/_lib/data";
import { isUuid } from "../../crm/_lib/shared";
import { ContractForm, type ContractFormValues } from "../_components/contract-form";

export const metadata: Metadata = { title: "New contract" };

export default async function NewContractPage({ searchParams }: PageProps<"/contracts/new">) {
  const ctx = await requireInternal("contracts.write");
  const sp = await searchParams;
  const supabase = await createClient();
  const orgId = isUuid(sp.org) ? sp.org : undefined;
  const oppId = isUuid(sp.opportunity) ? sp.opportunity : undefined;
  const [lookups, orgs, org, opp] = await Promise.all([
    getLookups(ctx.tenantId),
    getOrgOptions(ctx.tenantId),
    orgId ? supabase.from("organisations").select("id, name, payment_terms_days, contract_manager_id").eq("tenant_id", ctx.tenantId).eq("id", orgId).maybeSingle() : Promise.resolve({ data: null }),
    oppId ? supabase.from("crm_opportunities").select("id, title, value, organisation_id, contact_id, description").eq("tenant_id", ctx.tenantId).eq("id", oppId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const staff = await getStaffOptions(ctx, [org.data?.contract_manager_id]);
  const values: ContractFormValues = {
    status: "draft",
    pricing_basis: "schedule_of_rates",
    organisation_id: org.data?.id ?? opp.data?.organisation_id,
    payment_terms_days: org.data?.payment_terms_days ?? 30,
    contract_manager_id: org.data?.contract_manager_id ?? ctx.userId,
    ...(opp.data && { opportunity_id: opp.data.id, title: opp.data.title, value: Number(opp.data.value), client_contact_id: opp.data.contact_id, scope_of_work: opp.data.description }),
  };
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Contracts"
        title="New contract"
        description={opp.data ? `From the won opportunity "${opp.data.title}". A reference is assigned automatically.` : org.data ? `For ${org.data.name}. A reference is assigned automatically.` : "A reference is assigned automatically."}
      />
      <ContractForm values={values} orgs={orgs} staff={staff} types={lookups.options("contract_type")} cancelHref={org.data ? `/crm/${org.data.id}?tab=contracts` : "/contracts"} />
    </div>
  );
}
