import type { Metadata } from "next";
import Link from "next/link";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups, getStatuses } from "@/lib/data/lookups";
import { Notice, PageHeader } from "@/components/ui/primitives";
import { dateTime } from "@/lib/format";
import { createJob, loadPropertyOptions } from "../actions";
import { getClients, getManagers, loadClientData } from "../_lib/data";
import { toLondonInput } from "../_lib/time";
import { JobForm, type JobFormValues } from "../_components/job-form";

export const metadata: Metadata = { title: "New job" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNEL_SOURCE: Record<string, string> = { email: "email", api: "api", whatsapp: "whatsapp", portal: "portal" };

export default async function NewJobPage({ searchParams }: PageProps<"/jobs/new">) {
  const ctx = await requireInternal("work_orders.write");
  const sp = await searchParams;
  const param = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && UUID.test(v) ? v : undefined;
  };
  const supabase = await createClient();

  const [statuses, lookups, clients, managers] = await Promise.all([getStatuses(ctx.tenantId), getLookups(ctx.tenantId), getClients(ctx.tenantId), getManagers(ctx)]);
  const startable = statuses.list.filter((s) => s.is_active && (s.category === "intake" || s.category === "pre_works"));

  const intakeId = param("intake");
  const { data: intake } = intakeId
    ? await supabase.from("inbound_messages").select("id, channel, sender, subject, body, received_at, organisation_id, is_authorised, status, work_order_id").eq("id", intakeId).eq("tenant_id", ctx.tenantId).maybeSingle()
    : { data: null };

  const propertyId = param("property");
  const { data: property } = propertyId ? await supabase.from("properties").select("id, organisation_id").eq("id", propertyId).eq("tenant_id", ctx.tenantId).maybeSingle() : { data: null };

  const org = property?.organisation_id ?? intake?.organisation_id ?? param("org") ?? "";
  const clientData = org && clients.some((c) => c.value === org) ? await loadClientData(ctx.tenantId, org) : null;
  const wantedContract = param("contract");
  const active = clientData?.contracts.filter((c) => c.status === "active") ?? [];
  const contract = clientData?.contracts.some((c) => c.id === wantedContract) ? wantedContract! : active.length === 1 ? active[0].id : "";
  const propertyInfo = property ? await loadPropertyOptions(property.id) : null;
  const coveringContract = !contract && propertyInfo ? clientData?.contracts.find((c) => propertyInfo.contractIds.includes(c.id))?.id : undefined;

  const initial: JobFormValues = {
    organisation_id: clientData ? org : "",
    property_id: property?.id ?? "",
    contract_id: contract || coveringContract || "",
    occupant_id: propertyInfo?.occupants?.length === 1 ? propertyInfo.occupants[0].id : "",
    title: intake?.subject?.trim().slice(0, 200) ?? "",
    description: intake?.body?.slice(0, 20000) ?? "",
    work_category: "",
    trade: "",
    priority: "routine",
    source: intake ? (CHANNEL_SOURCE[intake.channel] ?? "email") : "manual",
    client_reference: "",
    reported_at: toLondonInput(intake?.received_at ?? new Date()),
    target_attend_at: "",
    target_completion_at: "",
    estimated_hours: "",
    estimated_cost: "",
    not_to_exceed: "",
    requires_approval: false,
    access_notes: "",
    manager_id: "",
    status: startable[0]?.key ?? "",
    intake_id: intake && intake.status === "new" ? intake.id : "",
  };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/jobs" className="hover:underline">
            Jobs
          </Link>
        }
        title="New job"
        description="Log a work order. Targets are filled from the contract SLA for the priority you choose; you can override them."
      />
      {intake && (
        <div className="mb-6">
          {intake.status === "new" ? (
            <Notice tone={intake.is_authorised ? "accent" : "warn"} title={intake.is_authorised ? "Creating a job from an authorised work request" : "Creating a job from an unknown sender"}>
              <p>
                {intake.channel === "email" ? "Email" : intake.channel} from <strong className="break-all">{intake.sender}</strong> received {dateTime(intake.received_at)}: “{intake.subject || "(no subject)"}”.
              </p>
              <p className="mt-1">
                The title and description are copied from the message
                {intake.organisation_id ? " and the client is matched from the sender" : "; choose the client yourself"}. Check the property and priority. When you create the job, the request is marked as
                turned into a job and linked to it.
              </p>
              {!intake.is_authorised && <p className="mt-1">This sender is not on any client&apos;s authorised list. Only create a job if you have confirmed the request is genuine.</p>}
            </Notice>
          ) : (
            <Notice tone="warn" title="This request has already been handled">
              Its status is “{intake.status.replace(/_/g, " ")}”.{" "}
              {intake.work_order_id && (
                <Link className="underline" href={`/jobs/${intake.work_order_id}`}>
                  Open the job created from it
                </Link>
              )}
            </Notice>
          )}
        </div>
      )}
      <JobForm
        mode="create"
        action={createJob}
        initial={initial}
        clients={clients}
        initialClientData={clientData}
        initialPropertyInfo={propertyInfo}
        categories={lookups.options("work_category")}
        trades={lookups.options("trade")}
        statuses={startable.map((s) => ({ value: s.key, label: s.label }))}
        managers={managers}
        canOccupants={ctx.can("occupants.read")}
        cancelHref={intake ? "/jobs?view=requests" : "/jobs"}
      />
    </>
  );
}
