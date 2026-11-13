import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarDays, FileSignature, Home, Pencil } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups, getStatuses } from "@/lib/data/lookups";
import { Badge, ButtonLink, Card, ColourBadge, Mono, Notice, PageHeader, priorityTone } from "@/components/ui/primitives";
import { LinkTabs } from "@/components/ui/url-controls";
import { label } from "@/lib/format";
import { getTransitions } from "../_lib/data";
import { loadJob } from "../_lib/job";
import { londonDate, nowMs } from "../_lib/time";
import { StatusActions } from "../_components/status-actions";
import { SlaCountdown } from "../_components/sla-countdown";
import { AssignmentSection, ChecklistSection, CompletionSection, CostsSection, DetailsSection, MaterialsSection, PhotosSection, TimelineSection } from "../_components/job-sections";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABS = ["details", "assignment", "timeline", "materials", "checklist", "completion", "costs", "photos"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: PageProps<"/jobs/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Job" };
  const ctx = await requireInternal("work_orders.read");
  const supabase = await createClient();
  const { data } = await supabase.from("work_orders").select("reference").eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
  return { title: data?.reference ?? "Job" };
}

export default async function JobPage({ params, searchParams }: PageProps<"/jobs/[id]">) {
  const ctx = await requireInternal("work_orders.read");
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const job = await loadJob(supabase, ctx.tenantId, id);
  if (!job) notFound();

  const canFinance = ctx.can("finance.read");
  const requested = typeof sp.tab === "string" ? sp.tab : "details";
  const tab: Tab = (TABS as readonly string[]).includes(requested) && (requested !== "costs" || canFinance) ? (requested as Tab) : "details";

  const head = (table: "job_updates" | "job_materials" | "job_checklists" | "photos") =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("work_order_id", job.id);
  const [statuses, lookups, transitions, statusRow, nAssign, nUpdates, nMaterials, nChecklists, nPhotos] = await Promise.all([
    getStatuses(ctx.tenantId),
    getLookups(ctx.tenantId),
    getTransitions(ctx.tenantId),
    supabase.from("job_statuses").select("pauses_sla").eq("tenant_id", ctx.tenantId).eq("key", job.status).maybeSingle(),
    supabase.from("job_assignments").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("work_order_id", job.id).neq("status", "cancelled"),
    head("job_updates"),
    head("job_materials"),
    head("job_checklists"),
    head("photos"),
  ]);

  const status = statuses.get(job.status);
  const isOpen = status.counts_as_open;
  const canWrite = ctx.can("work_orders.write");
  const activeKeys = new Set(statuses.list.filter((s) => s.is_active).map((s) => s.key));
  const moves = canWrite
    ? transitions
        .filter((t) => t.from_key === job.status && activeKeys.has(t.to_key) && (!t.required_permission || ctx.can(t.required_permission)))
        .map((t) => ({ to: t.to_key, label: statuses.get(t.to_key).label, colour: statuses.get(t.to_key).colour, order: statuses.get(t.to_key).sort_order }))
        .sort((a, b) => a.order - b.order)
    : [];
  const hidden = canWrite ? transitions.filter((t) => t.from_key === job.status && t.required_permission && !ctx.can(t.required_permission)).length : 0;

  const tabHref = (t: Tab) => `/jobs/${job.id}${t === "details" ? "" : `?tab=${t}`}`;
  const tabs = [
    { key: "details", label: "Details", href: tabHref("details") },
    { key: "assignment", label: "Assignment", href: tabHref("assignment"), count: nAssign.count ?? 0 },
    { key: "timeline", label: "Timeline", href: tabHref("timeline"), count: nUpdates.count ?? 0 },
    { key: "materials", label: "Materials", href: tabHref("materials"), count: nMaterials.count ?? 0 },
    { key: "checklist", label: "Checklist", href: tabHref("checklist"), count: nChecklists.count ?? 0 },
    { key: "completion", label: "Inspection & completion", href: tabHref("completion") },
    ...(canFinance ? [{ key: "costs", label: "Costs", href: tabHref("costs") }] : []),
    { key: "photos", label: "Photos", href: tabHref("photos"), count: nPhotos.count ?? 0 },
  ];
  const p = job.properties;
  const now = nowMs();
  const props = { supabase, ctx, job };

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/jobs" className="hover:underline">
            Jobs
          </Link>
        }
        title={job.title}
        actions={
          <>
            {job.scheduled_start && (
              <ButtonLink href={`/schedule?date=${londonDate(job.scheduled_start)}`} variant="ghost" size="sm">
                <CalendarDays className="size-4" aria-hidden /> On the schedule
              </ButtonLink>
            )}
            {canWrite && (
              <ButtonLink href={`/jobs/${job.id}/edit`} variant="secondary" size="sm">
                <Pencil className="size-4" aria-hidden /> Edit
              </ButtonLink>
            )}
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Mono className="text-[13.5px]">{job.reference}</Mono>
          <ColourBadge colour={status.colour}>{status.label}</ColourBadge>
          <Badge tone={priorityTone[job.priority] ?? "neutral"}>{label(job.priority)}</Badge>
          {job.requires_approval && !job.approved_at && <Badge tone="warn">Needs approval</Badge>}
          {job.client_reference && <span className="text-xs text-subtle">Client ref {job.client_reference}</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {job.organisations && (
            <Link href={`/crm/${job.organisations.id}`} className="inline-flex items-center gap-1.5 text-muted hover:text-accent-hi">
              <Building2 className="size-4 text-subtle" aria-hidden /> {job.organisations.name}
            </Link>
          )}
          {job.contracts && (
            <Link href={`/contracts/${job.contracts.id}`} className="inline-flex items-center gap-1.5 text-muted hover:text-accent-hi">
              <FileSignature className="size-4 text-subtle" aria-hidden /> {job.contracts.reference} · {job.contracts.title}
            </Link>
          )}
          {p && (
            <Link href={`/properties/${p.id}`} className="inline-flex items-center gap-1.5 text-muted hover:text-accent-hi">
              <Home className="size-4 text-subtle" aria-hidden /> {p.address_line1}, {p.town} {p.postcode}
            </Link>
          )}
        </div>
      </PageHeader>

      {sp.created === "1" && (
        <div className="mb-4">
          <Notice tone="ok">
            Job <strong>{job.reference}</strong> created. Assign an operative or move it on through the workflow when ready.
          </Notice>
        </div>
      )}
      {sp.saved === "1" && (
        <div className="mb-4">
          <Notice tone="ok">Changes saved.</Notice>
        </div>
      )}

      <Card className="mb-6">
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">Move this job</p>
            {!canWrite ? (
              <p className="text-sm text-muted">Your role can view this job but not change its status.</p>
            ) : moves.length ? (
              <StatusActions jobId={job.id} current={{ label: status.label, colour: status.colour }} moves={moves} />
            ) : (
              <p className="text-sm text-muted">{status.is_terminal ? "This job is closed. No further moves are configured." : "No moves are open to your role from this status."}</p>
            )}
            {hidden > 0 && (
              <p className="mt-2 text-xs text-subtle">
                {hidden} further move{hidden === 1 ? " needs" : "s need"} a permission your role does not have (for example approval).
              </p>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:flex">
            {job.target_attend_at && (isOpen || job.actual_start) && (
              <SlaCountdown label="Attend" verb="Attended" target={job.target_attend_at} finishedAt={job.actual_start} paused={Boolean(statusRow.data?.pauses_sla)} initialNow={now} />
            )}
            {job.target_completion_at && (isOpen || job.completed_at) && (
              <SlaCountdown label="Complete" verb="Completed" target={job.target_completion_at} finishedAt={job.completed_at} paused={Boolean(statusRow.data?.pauses_sla)} initialNow={now} />
            )}
            {!job.target_attend_at && !job.target_completion_at && <p className="text-sm text-subtle">No SLA targets set</p>}
          </div>
        </div>
      </Card>

      <div className="mb-6">
        <LinkTabs tabs={tabs} current={tab} />
      </div>

      {tab === "details" && <DetailsSection {...props} lookups={lookups} />}
      {tab === "assignment" && <AssignmentSection {...props} lookups={lookups} />}
      {tab === "timeline" && <TimelineSection {...props} statuses={statuses} />}
      {tab === "materials" && <MaterialsSection {...props} />}
      {tab === "checklist" && <ChecklistSection {...props} lookups={lookups} />}
      {tab === "completion" && <CompletionSection {...props} />}
      {tab === "costs" && canFinance && <CostsSection {...props} />}
      {tab === "photos" && <PhotosSection {...props} />}
    </>
  );
}
