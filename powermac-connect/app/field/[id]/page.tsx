import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { FieldJob, type FieldJobData } from "./field-job";

export default async function FieldJobPage({ params }: PageProps<"/field/[id]">) {
  const { id } = await params;
  const ctx = await requireTenant();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("field_job", { p_tenant: ctx.tenantId, p_assignment: id });
  if (error || !data) notFound();
  const job = data as unknown as FieldJobData;
  let photoUrls: Record<string, string> = {};
  if (job.photos.length) {
    const { data: signed } = await supabase.storage.from("photos").createSignedUrls(job.photos.map((p) => p.path).slice(0, 40), 600);
    photoUrls = Object.fromEntries((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
  }
  return <FieldJob data={job} assignmentId={id} tenantId={ctx.tenantId} isOperative={ctx.active.role.scope === "operative"} today={todayISO()} photoUrls={photoUrls} />;
}
