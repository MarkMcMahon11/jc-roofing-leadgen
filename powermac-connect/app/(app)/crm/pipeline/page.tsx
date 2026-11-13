import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { PageHeader, Stat } from "@/components/ui/primitives";
import { FilterSelect, SearchBox } from "@/components/ui/url-controls";
import { pct, todayISO } from "@/lib/format";
import { NewOpportunityButton, PipelineBoard, type Opp } from "../_components/pipeline-board";
import { getOrgOptions, getStaffOptions } from "../_lib/data";
import { OPEN_STAGES, fullName, gbpShort, isUuid, isoDaysFromNow, searchTerm, str } from "../_lib/shared";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: PageProps<"/crm/pipeline">) {
  const ctx = await requireInternal("crm.read");
  const sp = await searchParams;
  const q = searchTerm(sp.q);
  const owner = str(sp.owner);
  const org = str(sp.org);
  const supabase = await createClient();
  const yearAgo = isoDaysFromNow(-365);

  let query = supabase
    .from("crm_opportunities")
    .select(
      "id, reference, title, description, stage, value, probability, expected_close_date, organisation_id, contact_id, owner_id, source, lost_reason, closed_at, contract_id, org:organisations(name), contact:contacts(first_name, last_name), owner:profiles!crm_opportunities_owner_id_fkey(full_name)",
    )
    .eq("tenant_id", ctx.tenantId)
    .or(`stage.in.(${OPEN_STAGES.join(",")}),closed_at.gte.${yearAgo}`);
  if (q) query = query.ilike("title", `%${q}%`);
  if (owner === "me") query = query.eq("owner_id", ctx.userId);
  else if (isUuid(owner)) query = query.eq("owner_id", owner);
  if (isUuid(org)) query = query.eq("organisation_id", org);

  const [{ data }, lookups, staff, orgs] = await Promise.all([
    query.order("expected_close_date", { ascending: true, nullsFirst: false }).order("created_at").limit(1000),
    getLookups(ctx.tenantId),
    getStaffOptions(ctx),
    getOrgOptions(ctx.tenantId),
  ]);
  const opps: Opp[] = (data ?? []).map((o) => ({
    id: o.id,
    reference: o.reference,
    title: o.title,
    description: o.description,
    stage: o.stage,
    value: Number(o.value),
    probability: o.probability,
    expected_close_date: o.expected_close_date,
    organisation_id: o.organisation_id,
    org_name: o.org?.name ?? "Unknown client",
    contact_id: o.contact_id,
    contact_name: o.contact ? fullName(o.contact) : null,
    owner_id: o.owner_id,
    owner_name: o.owner?.full_name ?? null,
    source: o.source,
    lost_reason: o.lost_reason,
    closed_at: o.closed_at,
    contract_id: o.contract_id,
  }));
  const open = opps.filter((o) => OPEN_STAGES.includes(o.stage as (typeof OPEN_STAGES)[number]));
  const won = opps.filter((o) => o.stage === "won");
  const lost = opps.filter((o) => o.stage === "lost");
  const sum = (xs: Opp[], w = false) => xs.reduce((a, o) => a + (w ? (o.value * o.probability) / 100 : o.value), 0);
  const winRate = won.length + lost.length ? (100 * won.length) / (won.length + lost.length) : null;
  const canWrite = ctx.can("crm.write");
  const sources = lookups.options("lead_source");

  return (
    <>
      <Link href="/crm" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ChevronLeft className="size-3.5" aria-hidden />
        Clients & CRM
      </Link>
      <PageHeader
        eyebrow="Clients"
        title="Opportunity pipeline"
        description="Tenders, frameworks and work packages by stage. Weighted value = value × probability."
        actions={canWrite && <NewOpportunityButton orgs={orgs} staff={staff} sources={sources} me={ctx.userId} />}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open pipeline" value={gbpShort(sum(open))} hint={`${open.length} open opportunities`} tone="accent" />
        <Stat label="Weighted forecast" value={gbpShort(sum(open, true))} hint="Value × probability" tone="info" />
        <Stat label="Won (12 months)" value={gbpShort(sum(won))} hint={`${won.length} won`} tone="ok" />
        <Stat label="Win rate (12 months)" value={pct(winRate)} hint={`${won.length} won · ${lost.length} lost`} tone={winRate === null ? "neutral" : winRate >= 40 ? "ok" : "warn"} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox placeholder="Search opportunities…" className="w-full sm:w-72" />
        <div className="w-[calc(50%-4px)] sm:w-52">
          <FilterSelect param="owner" label="Owner" options={[{ value: "me", label: "Me" }, ...staff.filter((s) => s.value !== ctx.userId)]} />
        </div>
        <div className="w-[calc(50%-4px)] sm:w-64">
          <FilterSelect param="org" label="Client" options={orgs} />
        </div>
      </div>
      <PipelineBoard
        opps={opps}
        orgs={orgs}
        staff={staff}
        sources={sources}
        me={ctx.userId}
        today={todayISO()}
        canWrite={canWrite}
        canDelete={ctx.can("crm.delete")}
        canCreateContract={ctx.can("contracts.write")}
      />
    </>
  );
}
