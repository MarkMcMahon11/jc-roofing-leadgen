import type { Metadata } from "next";
import Link from "next/link";
import { Building2, CalendarClock, KanbanSquare, Plus } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups, getStatuses } from "@/lib/data/lookups";
import { Badge, ButtonLink, Card, EmptyState, Mono, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { FilterSelect, Pagination, SearchBox } from "@/components/ui/url-controls";
import { count, todayISO } from "@/lib/format";
import { ORG_STATUSES, OPEN_STAGES, gbpShort, londonToISO, orgStatusTone, pageNo, searchTerm, str } from "./_lib/shared";

export const metadata: Metadata = { title: "Clients & CRM" };
const PAGE = 25;

export default async function CrmPage({ searchParams }: PageProps<"/crm">) {
  const ctx = await requireInternal("crm.read");
  const sp = await searchParams;
  const page = pageNo(sp.page);
  const q = searchTerm(sp.q);
  const status = str(sp.status);
  const category = str(sp.category);
  const manager = str(sp.manager);
  const [lookups, statuses] = await Promise.all([getLookups(ctx.tenantId), getStatuses(ctx.tenantId)]);
  const openKeys = statuses.list.filter((s) => s.counts_as_open).map((s) => s.key);
  const showContracts = ctx.can("contracts.read");
  const showJobs = ctx.can("work_orders.read");

  const supabase = await createClient();
  let query = supabase
    .from("organisations")
    .select(
      "id, reference, name, category, status, town, account_manager:profiles!organisations_account_manager_id_fkey(full_name), primary:contacts(first_name, last_name, job_title), active_contracts:contracts(count), open_jobs:work_orders(count)",
      { count: "exact" },
    )
    .eq("tenant_id", ctx.tenantId)
    .is("archived_at", null)
    .eq("primary.is_primary", true)
    .is("primary.archived_at", null)
    .eq("active_contracts.status", "active")
    .in("open_jobs.status", openKeys.length ? openKeys : ["-"]);
  if (q) query = query.or(`name.ilike.%${q}%,reference.ilike.%${q}%`);
  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);
  if (manager === "me") query = query.eq("account_manager_id", ctx.userId);

  const endOfToday = londonToISO(`${todayISO()}T23:59`)!;
  const [{ data: orgs, count: total }, active, prospects, opps, due, overdue] = await Promise.all([
    query.order("name").range((page - 1) * PAGE, page * PAGE - 1),
    supabase.from("organisations").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).is("archived_at", null).eq("status", "active"),
    supabase.from("organisations").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).is("archived_at", null).eq("status", "prospect"),
    supabase.from("crm_opportunities").select("value, probability").eq("tenant_id", ctx.tenantId).in("stage", OPEN_STAGES),
    supabase.from("crm_activities").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("owner_id", ctx.userId).is("completed_at", null).lte("due_at", endOfToday),
    supabase.from("crm_activities").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("owner_id", ctx.userId).is("completed_at", null).lt("due_at", new Date().toISOString()),
  ]);
  const pipeline = (opps.data ?? []).reduce((a, o) => ({ value: a.value + Number(o.value), weighted: a.weighted + (Number(o.value) * o.probability) / 100 }), { value: 0, weighted: 0 });
  const filtered = Boolean(q || status || category || manager);

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Clients & CRM"
        description="Corporate clients, their people, contracts and the relationship history in one place."
        actions={
          <>
            <ButtonLink href="/crm/follow-ups" variant="ghost">
              <CalendarClock className="size-4" aria-hidden />
              Follow-ups
            </ButtonLink>
            <ButtonLink href="/crm/pipeline" variant="secondary">
              <KanbanSquare className="size-4" aria-hidden />
              Pipeline
            </ButtonLink>
            {ctx.can("crm.write") && (
              <ButtonLink href="/crm/new" variant="primary">
                <Plus className="size-4" aria-hidden />
                New client
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active clients" value={count(active.count ?? 0)} href="/crm?status=active" tone="ok" />
        <Stat label="Prospects" value={count(prospects.count ?? 0)} href="/crm?status=prospect" tone="info" />
        <Stat label="Open pipeline" value={gbpShort(pipeline.value)} hint={`${gbpShort(pipeline.weighted)} weighted · ${opps.data?.length ?? 0} open`} href="/crm/pipeline" tone="accent" />
        <Stat
          label="My follow-ups due"
          value={count(due.count ?? 0)}
          hint={overdue.count ? `${overdue.count} overdue` : "Nothing overdue"}
          href="/crm/follow-ups"
          tone={overdue.count ? "bad" : due.count ? "warn" : "neutral"}
        />
      </div>

      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3 sm:px-5">
          <SearchBox placeholder="Search name or reference…" className="w-full sm:w-72" />
          <div className="w-[calc(50%-4px)] sm:w-44"><FilterSelect param="status" label="Status" options={ORG_STATUSES} /></div>
          <div className="w-[calc(50%-4px)] sm:w-56"><FilterSelect param="category" label="Category" options={lookups.options("organisation_category")} /></div>
          <div className="w-full sm:w-56"><FilterSelect param="manager" label="Account manager" options={[{ value: "me", label: "Me" }]} /></div>
        </div>
        {orgs?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Client</TH>
                <TH>Category</TH>
                <TH>Status</TH>
                <TH>Primary contact</TH>
                {showContracts && <TH align="right">Active contracts</TH>}
                {showJobs && <TH align="right">Open jobs</TH>}
                <TH>Account manager</TH>
              </tr>
            </THead>
            <tbody>
              {orgs.map((o) => {
                const primary = o.primary?.[0];
                const contracts = o.active_contracts?.[0]?.count ?? 0;
                const jobs = o.open_jobs?.[0]?.count ?? 0;
                return (
                  <TR key={o.id}>
                    <TD>
                      <Link href={`/crm/${o.id}`} className="font-medium text-fg hover:text-accent-hi">
                        {o.name}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-subtle">
                        <Mono className="text-[11.5px]">{o.reference}</Mono>
                        {o.town && <span>{o.town}</span>}
                      </div>
                    </TD>
                    <TD className="text-[13px] text-muted">{lookups.label("organisation_category", o.category)}</TD>
                    <TD>
                      <Badge tone={orgStatusTone[o.status] ?? "neutral"} dot>
                        {ORG_STATUSES.find((s) => s.value === o.status)?.label ?? o.status}
                      </Badge>
                    </TD>
                    <TD className="text-[13px]">
                      {primary ? (
                        <>
                          <div>{`${primary.first_name} ${primary.last_name}`.trim()}</div>
                          {primary.job_title && <div className="text-xs text-subtle">{primary.job_title}</div>}
                        </>
                      ) : (
                        <span className="text-subtle">None set</span>
                      )}
                    </TD>
                    {showContracts && (
                      <TD align="right">
                        {contracts ? <Link href={`/contracts?client=${o.id}&status=active`} className="hover:text-accent-hi">{contracts}</Link> : <span className="text-subtle">0</span>}
                      </TD>
                    )}
                    {showJobs && <TD align="right">{jobs ? jobs : <span className="text-subtle">0</span>}</TD>}
                    <TD className="text-[13px]">{o.account_manager?.full_name ?? <span className="text-subtle">Not assigned</span>}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            icon={<Building2 className="size-8" />}
            title={filtered ? "No clients match these filters" : "No clients yet"}
            action={!filtered && ctx.can("crm.write") ? <ButtonLink href="/crm/new" variant="primary">Add your first client</ButtonLink> : undefined}
          >
            {filtered ? "Try a different search or clear the filters." : "Add the housing associations, councils and companies you work for."}
          </EmptyState>
        )}
        <Pagination page={page} pageSize={PAGE} total={total ?? 0} />
      </Card>
    </>
  );
}
