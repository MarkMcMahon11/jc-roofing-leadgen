import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireInternal } from "@/lib/auth/context";
import { getLookups } from "@/lib/data/lookups";
import { createClient } from "@/lib/supabase/server";
import { Mono, PageHeader } from "@/components/ui/primitives";
import { OrgForm } from "../../_components/org-form";
import { DeleteOrgCard } from "../../_components/delete-org";
import { getStaffOptions } from "../../_lib/data";
import { isUuid } from "../../_lib/shared";

export const metadata: Metadata = { title: "Edit client" };

export default async function EditClientPage({ params }: PageProps<"/crm/[id]/edit">) {
  const ctx = await requireInternal("crm.write");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organisations")
    .select("id, reference, name, category, status, company_number, vat_number, website, email, phone, address_line1, address_line2, town, postcode, account_manager_id, contract_manager_id, payment_terms_days, credit_limit, tags, notes")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!org) notFound();
  const [lookups, staff] = await Promise.all([getLookups(ctx.tenantId), getStaffOptions(ctx, [org.account_manager_id, org.contract_manager_id])]);
  const categories = lookups.options("organisation_category");
  // keep a retired category selectable so saving does not silently change it
  if (org.category && !categories.some((c) => c.value === org.category)) categories.push({ value: org.category, label: lookups.label("organisation_category", org.category) });
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow={<Mono>{org.reference}</Mono>} title={`Edit ${org.name}`} />
      <OrgForm values={{ ...org, credit_limit: org.credit_limit === null ? null : Number(org.credit_limit) }} categories={categories} staff={staff} cancelHref={`/crm/${org.id}`} />
      {ctx.can("crm.delete") && <DeleteOrgCard id={org.id} name={org.name} />}
    </div>
  );
}
