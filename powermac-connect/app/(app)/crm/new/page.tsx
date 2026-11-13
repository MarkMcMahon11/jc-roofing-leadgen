import type { Metadata } from "next";
import { requireInternal } from "@/lib/auth/context";
import { getLookups } from "@/lib/data/lookups";
import { PageHeader } from "@/components/ui/primitives";
import { OrgForm } from "../_components/org-form";
import { getStaffOptions } from "../_lib/data";

export const metadata: Metadata = { title: "New client" };

export default async function NewClientPage() {
  const ctx = await requireInternal("crm.write");
  const [lookups, staff] = await Promise.all([getLookups(ctx.tenantId), getStaffOptions(ctx)]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Clients & CRM" title="New client" description="Add a corporate client or prospect. A reference is assigned automatically." />
      <OrgForm values={{ status: "prospect", account_manager_id: ctx.userId, payment_terms_days: 30 }} categories={lookups.options("organisation_category")} staff={staff} cancelHref="/crm" />
    </div>
  );
}
