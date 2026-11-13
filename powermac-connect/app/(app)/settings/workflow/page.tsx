import type { Metadata } from "next";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getStatuses } from "@/lib/data/lookups";
import { WorkflowEditor } from "./workflow-editor";

export const metadata: Metadata = { title: "Job workflow" };

export default async function WorkflowPage() {
  const ctx = await requireInternal("settings.manage");
  const supabase = await createClient();
  const [statuses, { data: transitions }] = await Promise.all([
    getStatuses(ctx.tenantId),
    supabase.from("job_status_transitions").select("from_key, to_key, required_permission").eq("tenant_id", ctx.tenantId),
  ]);
  return <WorkflowEditor statuses={statuses.list} transitions={transitions ?? []} />;
}
