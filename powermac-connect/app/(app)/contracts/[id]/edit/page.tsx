import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { Mono, PageHeader } from "@/components/ui/primitives";
import { getOrgOptions, getStaffOptions } from "../../../crm/_lib/data";
import { isUuid } from "../../../crm/_lib/shared";
import { ContractForm } from "../../_components/contract-form";
import { DeleteContractCard } from "../../_components/delete-contract";

export const metadata: Metadata = { title: "Edit contract" };

export default async function EditContractPage({ params }: PageProps<"/contracts/[id]/edit">) {
  const ctx = await requireInternal("contracts.write");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("id, reference, organisation_id, title, client_reference, contract_type, scope_of_work, status, value, annual_budget, start_date, end_date, renewal_date, notice_period_days, payment_terms_days, retention_percent, pricing_basis, contract_manager_id, client_contact_id, auto_renew, notes, org:organisations(name)")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();
  const [lookups, orgs, staff] = await Promise.all([getLookups(ctx.tenantId), getOrgOptions(ctx.tenantId, { includeInactive: true }), getStaffOptions(ctx, [c.contract_manager_id])]);
  const types = lookups.options("contract_type");
  if (!types.some((t) => t.value === c.contract_type)) types.push({ value: c.contract_type, label: lookups.label("contract_type", c.contract_type) });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow={<Mono>{c.reference}</Mono>} title={`Edit ${c.title}`} description={c.org?.name} />
      <ContractForm
        values={{ ...c, value: Number(c.value), annual_budget: c.annual_budget === null ? null : Number(c.annual_budget), retention_percent: Number(c.retention_percent) }}
        orgs={orgs}
        staff={staff}
        types={types}
        cancelHref={`/contracts/${c.id}`}
      />
      {ctx.can("contracts.delete") && <DeleteContractCard id={c.id} title={c.title} />}
    </div>
  );
}
