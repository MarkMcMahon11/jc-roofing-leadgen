import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { Card, CardBody, CardHeader, ColourBadge, DefinitionList, Notice, PageHeader, Badge, priorityTone } from "@/components/ui/primitives";
import { date, dateTime, money } from "@/lib/format";
import { MessageForm } from "./message-form";

export const metadata: Metadata = { title: "Job" };

type PortalJob = {
  id: string; reference: string; client_reference: string | null; title: string; description: string | null; status: string; status_colour: string; priority: string;
  reported_at: string; target_completion_at: string | null; scheduled_start: string | null; completed_at: string | null; completion_notes: string | null; signoff_name: string | null; signoff_at: string | null;
  property: { id: string; address: string; postcode: string }; contract: string | null;
  timeline: { at: string; type: string; body: string | null; to_status: string | null; by: string }[];
  photos: { path: string; stage: string; caption: string | null }[];
  quotes: { id: string; reference: string; status: string; total: number }[];
};

export default async function PortalJobPage({ params, searchParams }: PageProps<"/portal/jobs/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("portal_job", { p_tenant: ctx.tenantId, p_job: id });
  if (error || !data) notFound();
  const j = data as unknown as PortalJob;

  // Photos: each path was returned by portal_job (already scoped to this client and client-visible);
  // the service role only signs those exact paths for 10 minutes.
  let urls: Record<string, string> = {};
  if (j.photos.length && isAdminConfigured()) {
    const { data: signed } = await createAdminClient().storage.from("photos").createSignedUrls(j.photos.map((p) => p.path).slice(0, 40), 600);
    urls = Object.fromEntries((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
  }

  return (
    <>
      <Link href="/portal/jobs" className="mb-3 inline-block text-sm text-muted hover:text-fg">← Jobs</Link>
      <PageHeader eyebrow={`${j.reference}${j.client_reference ? ` · your ref ${j.client_reference}` : ""}`} title={j.title} actions={<ColourBadge colour={j.status_colour}>{j.status}</ColourBadge>} />
      {sp.submitted === "1" && <div className="mb-5"><Notice tone="ok" title="Request received">PowerMac has your request and will review it. You can follow progress here.</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DefinitionList items={[
                { label: "Property", value: `${j.property.address}, ${j.property.postcode}` },
                { label: "Priority", value: <Badge tone={priorityTone[j.priority] ?? "neutral"}>{j.priority}</Badge> },
                { label: "Reported", value: dateTime(j.reported_at) },
                { label: "Target completion", value: date(j.target_completion_at) },
                { label: "Booked for", value: j.scheduled_start ? dateTime(j.scheduled_start) : "Not booked yet" },
                { label: "Completed", value: j.completed_at ? dateTime(j.completed_at) : "-" },
                { label: "Contract", value: j.contract ?? "-" },
                { label: "Signed off by", value: j.signoff_name ? `${j.signoff_name} (${dateTime(j.signoff_at)})` : "-" },
              ]} />
              {j.description && <p className="mt-4 text-sm whitespace-pre-wrap text-muted">{j.description}</p>}
              {j.completion_notes && <p className="mt-3 text-sm"><span className="text-subtle">Completion notes: </span>{j.completion_notes}</p>}
            </CardBody>
          </Card>
          {j.photos.length > 0 && (
            <Card>
              <CardHeader title={`Photos (${j.photos.length})`} />
              <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {j.photos.map((p) => (
                  <figure key={p.path} className="overflow-hidden rounded-xl border border-line">
                    {urls[p.path] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a href={urls[p.path]} target="_blank" rel="noopener"><img src={urls[p.path]} alt={p.caption ?? `${p.stage} photo`} className="aspect-[4/3] w-full object-cover" /></a>
                    ) : <div className="flex aspect-[4/3] items-center justify-center text-xs text-subtle">Photo</div>}
                    <figcaption className="px-2 py-1.5 text-xs text-muted capitalize">{p.stage}{p.caption ? ` · ${p.caption}` : ""}</figcaption>
                  </figure>
                ))}
              </CardBody>
            </Card>
          )}
          {j.quotes.length > 0 && (
            <Card>
              <CardHeader title="Quotations" />
              <ul className="divide-y divide-line">
                {j.quotes.map((q) => (
                  <li key={q.id} className="flex items-center justify-between px-5 py-3 text-sm">
                    <span>{q.reference}</span>
                    <span className="flex items-center gap-3">{money(q.total)} <Badge tone={q.status === "sent" ? "warn" : q.status === "approved" ? "ok" : "neutral"}>{q.status === "sent" ? "awaiting you" : q.status}</Badge></span>
                  </li>
                ))}
              </ul>
              <div className="px-5 pb-4"><Link href="/portal/quotes" className="text-sm text-accent-hi hover:underline">Review quotations →</Link></div>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          {ctx.can("communications.write") && <MessageForm jobId={j.id} />}
          <Card>
            <CardHeader title="Progress" />
            <ol className="relative space-y-4 px-5 py-4">
              {j.timeline.map((u, i) => (
                <li key={i} className="border-l-2 border-line pl-4">
                  <div className="text-xs text-subtle">{dateTime(u.at)} · {u.by}</div>
                  <div className="text-sm">{u.to_status ? <>Status: <span className="font-medium">{u.to_status}</span></> : u.body ?? u.type.replace(/_/g, " ")}</div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
