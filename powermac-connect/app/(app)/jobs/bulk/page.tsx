import type { Metadata } from "next";
import Link from "next/link";
import { requireInternal } from "@/lib/auth/context";
import { getLookups, getStatuses } from "@/lib/data/lookups";
import { PageHeader } from "@/components/ui/primitives";
import { getClients } from "../_lib/data";
import { BulkForm } from "../_components/bulk-form";

export const metadata: Metadata = { title: "Bulk create jobs" };

export default async function BulkJobsPage() {
  const ctx = await requireInternal("work_orders.write");
  const [statuses, lookups, clients] = await Promise.all([getStatuses(ctx.tenantId), getLookups(ctx.tenantId), getClients(ctx.tenantId)]);
  const startable = statuses.list.filter((s) => s.is_active && (s.category === "intake" || s.category === "pre_works"));
  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/jobs" className="hover:underline">
            Jobs
          </Link>
        }
        title="Bulk create jobs"
        description="Raise the same work across many properties at once - planned programmes, cyclical maintenance, compliance visits."
      />
      <BulkForm
        clients={clients}
        categories={lookups.options("work_category")}
        trades={lookups.options("trade")}
        statuses={startable.map((s) => ({ value: s.key, label: s.label }))}
      />
    </>
  );
}
