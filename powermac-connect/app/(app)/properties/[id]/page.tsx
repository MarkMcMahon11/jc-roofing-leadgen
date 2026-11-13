import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ChevronLeft, MapPinOff, Pencil, Plus } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups, getStatuses } from "@/lib/data/lookups";
import { Badge, ButtonLink, Card, Mono, Notice, PageHeader, type Tone } from "@/components/ui/primitives";
import { LinkTabs } from "@/components/ui/url-controls";
import { PropertyMap } from "../_components/property-map";
import { MAP_COLOURS } from "../_lib/map-colours";
import { hazardLabel, param, PROPERTY_STATUS } from "../_lib/ui";
import { CertificatesTab, DocumentsTab, InspectionsTab, JobsTab, OccupantsTab, OverviewTab } from "./tabs";

export const metadata: Metadata = { title: "Property" };

const GEO_MESSAGES: Record<string, string> = {
  not_found: "The postcode was not found by the mapping service, so this property has no map location yet. Check the postcode and save again.",
  unavailable: "The mapping service could not be reached, so this property has no map location yet. Edit and save it later to add the location.",
};

export default async function PropertyPage({ params, searchParams }: PageProps<"/properties/[id]">) {
  const ctx = await requireInternal("properties.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: p } = await supabase.from("properties").select("*, organisation:organisations(id, name)").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle();
  if (!p) notFound();

  const canJobs = ctx.can("work_orders.read");
  const canOcc = ctx.can("occupants.read");
  const canDocs = ctx.can("documents.read");
  const [lookups, statuses] = await Promise.all([getLookups(ctx.tenantId), getStatuses(ctx.tenantId)]);
  const openKeys = statuses.list.filter((s) => s.counts_as_open).map((s) => s.key);
  const head = { count: "exact" as const, head: true };
  const none = Promise.resolve({ count: null as number | null, data: null });
  const [occ, openJobs, emergencies, insp, certs, docs] = await Promise.all([
    canOcc ? supabase.from("occupants").select("id", head).eq("tenant_id", ctx.tenantId).eq("property_id", id).eq("is_current", true) : none,
    canJobs ? supabase.from("work_orders").select("id", head).eq("tenant_id", ctx.tenantId).eq("property_id", id).in("status", openKeys) : none,
    canJobs ? supabase.from("work_orders").select("id", head).eq("tenant_id", ctx.tenantId).eq("property_id", id).in("status", openKeys).eq("priority", "emergency") : none,
    canJobs ? supabase.from("inspections").select("id", head).eq("tenant_id", ctx.tenantId).eq("property_id", id) : none,
    supabase.from("certificates").select("id", head).eq("tenant_id", ctx.tenantId).eq("property_id", id),
    canDocs ? supabase.from("documents").select("id", head).eq("tenant_id", ctx.tenantId).eq("property_id", id) : none,
  ]);

  const tabKeys = ["overview", "occupants", "jobs", "inspections", "certificates", "documents"] as const;
  type TabKey = (typeof tabKeys)[number];
  const requested = param(sp.tab) as TabKey;
  const tab: TabKey = tabKeys.includes(requested) ? requested : "overview";
  const href = (t: TabKey) => (t === "overview" ? `/properties/${id}` : `/properties/${id}?tab=${t}`);
  const tabs = [
    { key: "overview", label: "Overview", href: href("overview") },
    { key: "occupants", label: "Occupants", href: href("occupants"), count: occ.count ?? undefined },
    { key: "jobs", label: "Jobs", href: href("jobs"), count: openJobs.count ?? undefined },
    { key: "inspections", label: "Inspections", href: href("inspections"), count: insp.count ?? undefined },
    { key: "certificates", label: "Certificates", href: href("certificates"), count: certs.count ?? undefined },
    { key: "documents", label: "Documents & photos", href: href("documents"), count: docs.count ?? undefined },
  ];

  const st = PROPERTY_STATUS[p.status] ?? { label: p.status, tone: "neutral" as Tone };
  const state = emergencies.count ? "emergency" : openJobs.count ? "open" : p.status === "void" ? "void" : "none";
  const located = p.latitude !== null && p.longitude !== null;
  const saved = param(sp.saved);
  const geo = param(sp.geo);
  const contractsNote = param(sp.contracts);

  return (
    <>
      <Link href="/properties" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden />
        Properties
      </Link>
      <PageHeader
        eyebrow="Property"
        title={
          <>
            {p.address_line1}
            {p.address_line2 && <span className="text-muted">, {p.address_line2}</span>}
          </>
        }
        description={`${p.town} · ${p.postcode}`}
        actions={
          <>
            {ctx.can("properties.write") && (
              <ButtonLink href={`/properties/${id}/edit`}>
                <Pencil className="size-4" aria-hidden />
                Edit
              </ButtonLink>
            )}
            {ctx.can("work_orders.write") && (
              <ButtonLink href={`/jobs/new?property=${id}`} variant="primary">
                <Plus className="size-4" aria-hidden />
                New job
              </ButtonLink>
            )}
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Mono>{p.reference}</Mono>
          <Badge tone={st.tone} dot>{st.label}</Badge>
          <Badge>{lookups.label("property_type", p.property_type)}</Badge>
          {p.organisation ? (
            ctx.can("crm.read") ? (
              <Link href={`/crm/${p.organisation.id}`} className="text-sm text-accent-hi hover:underline">
                {p.organisation.name}
              </Link>
            ) : (
              <span className="text-sm text-muted">{p.organisation.name}</span>
            )
          ) : null}
          {p.hazards.map((h) => (
            <Badge key={h} tone="warn">
              <AlertTriangle className="size-3" aria-hidden />
              {hazardLabel(h)}
            </Badge>
          ))}
        </div>
      </PageHeader>

      <div className="mb-6 grid gap-3">
        {saved && <Notice tone="ok">{saved === "created" ? "Property added." : "Property saved."}</Notice>}
        {geo && GEO_MESSAGES[geo] && <Notice tone="warn" title="No map location">{GEO_MESSAGES[geo]}</Notice>}
        {contractsNote === "denied" && <Notice tone="warn">The property was saved, but it was not linked to contracts because that needs contract edit access.</Notice>}
        {contractsNote === "failed" && <Notice tone="warn">The property was saved, but the contract links could not be updated. Try again from Edit.</Notice>}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card className="overflow-hidden p-2">
          {located ? (
            <PropertyMap
              height={220}
              legend={false}
              points={[
                {
                  id: p.id,
                  lat: Number(p.latitude),
                  lng: Number(p.longitude),
                  colour: MAP_COLOURS[state],
                  title: p.address_line1,
                  subtitle: `${p.town} ${p.postcode}`,
                  meta: state === "emergency" ? "Open emergency" : state === "open" ? `${openJobs.count} open job${openJobs.count === 1 ? "" : "s"}` : st.label,
                  size: 9,
                },
              ]}
            />
          ) : (
            <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-center text-sm text-muted">
              <MapPinOff className="size-6 text-subtle" aria-hidden />
              No map location for {p.postcode}
              {ctx.can("properties.write") && (
                <Link href={`/properties/${id}/edit`} className="text-accent-hi hover:underline">
                  Check the postcode
                </Link>
              )}
            </div>
          )}
        </Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
          <Fact label="Open jobs" value={canJobs ? String(openJobs.count ?? 0) : "-"} tone={emergencies.count ? "bad" : openJobs.count ? "accent" : "neutral"} hint={emergencies.count ? `${emergencies.count} emergency` : undefined} href={canJobs ? href("jobs") : undefined} />
          <Fact label="Current occupants" value={canOcc ? String(occ.count ?? 0) : "Restricted"} href={canOcc ? href("occupants") : undefined} />
          <Fact label="Certificates" value={String(certs.count ?? 0)} href={href("certificates")} />
          <Fact label="Inspections" value={canJobs ? String(insp.count ?? 0) : "-"} href={canJobs ? href("inspections") : undefined} />
        </div>
      </div>

      <LinkTabs tabs={tabs} current={tab} />
      <div className="mt-6">
        {tab === "overview" && <OverviewTab ctx={ctx} property={p} />}
        {tab === "occupants" && <OccupantsTab ctx={ctx} propertyId={id} />}
        {tab === "jobs" && <JobsTab ctx={ctx} propertyId={id} />}
        {tab === "inspections" && <InspectionsTab ctx={ctx} propertyId={id} />}
        {tab === "certificates" && <CertificatesTab ctx={ctx} propertyId={id} />}
        {tab === "documents" && <DocumentsTab ctx={ctx} propertyId={id} />}
      </div>
    </>
  );
}

function Fact({ label, value, hint, href, tone = "neutral" }: { label: string; value: string; hint?: string; href?: string; tone?: Tone }) {
  const bar: Record<Tone, string> = { neutral: "bg-line-strong", accent: "bg-accent", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", info: "bg-info" };
  const body = (
    <div className="pm-card relative h-full overflow-hidden px-4 py-3.5">
      <span className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${bar[tone]}`} aria-hidden />
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className="mt-1.5 text-[22px] leading-none font-semibold tracking-tight text-fg tabular">{value}</div>
      {hint && <div className="mt-1.5 text-xs text-[#ff8a87]">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} scroll={false} className="block rounded-[14px] transition-transform hover:-translate-y-px">
      {body}
    </Link>
  ) : (
    body
  );
}
