import type { Metadata } from "next";
import Link from "next/link";
import { requireTenant } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Card, ColourBadge, EmptyState, PageHeader, Table, TD, TH, THead, TR, Badge, priorityTone } from "@/components/ui/primitives";
import { LinkTabs, SearchBox } from "@/components/ui/url-controls";
import { date } from "@/lib/format";

export const metadata: Metadata = { title: "Jobs" };

export default async function PortalJobs({ searchParams }: PageProps<"/portal/jobs">) {
  const ctx = await requireTenant();
  const sp = await searchParams;
  const all = sp.all === "1";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : undefined;
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_jobs", { p_tenant: ctx.tenantId, p_open_only: !all, p_search: q, p_limit: 300 });
  return (
    <>
      <PageHeader title="Jobs" description="Every repair and works order at your properties." />
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pt-3">
          <LinkTabs current={all ? "all" : "open"} tabs={[{ key: "open", label: "Open", href: "/portal/jobs" }, { key: "all", label: "All", href: "/portal/jobs?all=1" }]} />
          <SearchBox placeholder="Reference, your ref, address…" className="mb-2 w-full sm:w-72" />
        </div>
        {(data ?? []).length === 0 ? <EmptyState title="No jobs found" /> : (
          <Table>
            <THead><tr><TH>Job</TH><TH>Property</TH><TH>Priority</TH><TH>Reported</TH><TH>Target / booked</TH><TH>Status</TH></tr></THead>
            <tbody>
              {(data ?? []).map((j) => (
                <TR key={j.id}>
                  <TD><Link href={`/portal/jobs/${j.id}`} className="font-medium hover:text-accent-hi">{j.title}</Link><div className="text-xs text-subtle">{j.reference}{j.client_reference ? ` · ${j.client_reference}` : ""}</div></TD>
                  <TD className="text-[13px]">{j.address}<div className="text-xs text-subtle">{j.postcode}</div></TD>
                  <TD><Badge tone={priorityTone[j.priority] ?? "neutral"}>{j.priority}</Badge></TD>
                  <TD className="text-muted">{date(j.reported_at)}</TD>
                  <TD className="text-muted">{j.completed_at ? `Done ${date(j.completed_at)}` : j.scheduled_start ? `Booked ${date(j.scheduled_start)}` : date(j.target_completion_at)}</TD>
                  <TD><ColourBadge colour={j.status_colour}>{j.status_label}</ColourBadge></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
