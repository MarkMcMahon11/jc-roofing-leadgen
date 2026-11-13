import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { PageHeader } from "@/components/ui/primitives";
import { loadPropertyOptions, updateJob } from "../../actions";
import { getClients, getManagers, loadClientData } from "../../_lib/data";
import { toLondonInput } from "../../_lib/time";
import { JobForm } from "../../_components/job-form";

export const metadata: Metadata = { title: "Edit job" };

const num = (v: number | null) => (v === null || v === undefined ? "" : String(v));

export default async function EditJobPage({ params }: PageProps<"/jobs/[id]/edit">) {
  const ctx = await requireInternal("work_orders.write");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("work_orders")
    .select(
      "id, reference, title, description, organisation_id, property_id, contract_id, occupant_id, work_category, trade, priority, source, client_reference, reported_at, target_attend_at, target_completion_at, estimated_hours, estimated_cost, not_to_exceed, requires_approval, access_notes, manager_id, status",
    )
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!job) notFound();

  const [lookups, clients, managers, clientData, propertyInfo] = await Promise.all([
    getLookups(ctx.tenantId),
    getClients(ctx.tenantId),
    getManagers(ctx),
    loadClientData(ctx.tenantId, job.organisation_id),
    loadPropertyOptions(job.property_id),
  ]);
  // keep the job's current contract selectable even if it has since ended
  if (job.contract_id && !clientData.contracts.some((c) => c.id === job.contract_id)) {
    const { data: c } = await supabase.from("contracts").select("id, reference, title, status").eq("id", job.contract_id).maybeSingle();
    if (c) clientData.contracts.push({ id: c.id, label: `${c.reference} · ${c.title} (${c.status})`, status: c.status, slas: [] });
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/jobs/${job.id}`} className="hover:underline">
            {job.reference}
          </Link>
        }
        title="Edit job"
        description="Status changes go through the workflow buttons on the job page, not this form."
      />
      <JobForm
        mode="edit"
        action={updateJob}
        initial={{
          id: job.id,
          organisation_id: job.organisation_id,
          property_id: job.property_id,
          contract_id: job.contract_id ?? "",
          occupant_id: job.occupant_id ?? "",
          title: job.title,
          description: job.description ?? "",
          work_category: job.work_category,
          trade: job.trade,
          priority: job.priority,
          source: job.source,
          client_reference: job.client_reference ?? "",
          reported_at: toLondonInput(job.reported_at),
          target_attend_at: toLondonInput(job.target_attend_at),
          target_completion_at: toLondonInput(job.target_completion_at),
          estimated_hours: num(job.estimated_hours),
          estimated_cost: num(job.estimated_cost),
          not_to_exceed: num(job.not_to_exceed),
          requires_approval: job.requires_approval,
          access_notes: job.access_notes ?? "",
          manager_id: job.manager_id ?? "",
          status: job.status,
          intake_id: "",
        }}
        clients={clients}
        initialClientData={clientData}
        initialPropertyInfo={propertyInfo}
        categories={lookups.options("work_category")}
        trades={lookups.options("trade")}
        statuses={[]}
        managers={managers}
        canOccupants={ctx.can("occupants.read")}
        cancelHref={`/jobs/${job.id}`}
      />
    </>
  );
}
