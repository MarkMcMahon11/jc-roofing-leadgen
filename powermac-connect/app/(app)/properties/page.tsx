import type { Metadata } from "next";
import Link from "next/link";
import { Home, List, Map as MapIcon, Plus } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups, getStatuses } from "@/lib/data/lookups";
import { Badge, ButtonLink, Card, cx, EmptyState, Mono, Notice, PageHeader, Table, TD, TH, THead, TR, type Tone } from "@/components/ui/primitives";
import { FilterSelect, Pagination, SearchBox } from "@/components/ui/url-controls";
import type { MapPoint } from "@/components/ui/map";
import { count, date } from "@/lib/format";
import { PropertyMap } from "./_components/property-map";
import { MAP_COLOURS } from "./_lib/map-colours";
import { cleanSearch, param, PROPERTY_STATUS } from "./_lib/ui";

export const metadata: Metadata = { title: "Properties" };

const PAGE = 50;
const MAP_LIMIT = 2000;

// one literal select so the generated types apply; the optional !inner embeds are added at runtime
const BASE_SELECT = "id, reference, client_reference, uprn, address_line1, address_line2, town, postcode, property_type, status, latitude, longitude, created_at, organisation:organisations(id, name)";

export default async function PropertiesPage({ searchParams }: PageProps<"/properties">) {
  const ctx = await requireInternal("properties.read");
  const sp = await searchParams;
  const q = cleanSearch(sp.q);
  const org = param(sp.org);
  const contract = param(sp.contract);
  const type = param(sp.type);
  const status = param(sp.status);
  const jobs = param(sp.jobs);
  const view = param(sp.view) === "map" ? "map" : "list";
  const page = Math.max(1, Number(param(sp.page)) || 1);
  const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

  const canJobs = ctx.can("work_orders.read");
  const canContracts = ctx.can("contracts.read");
  const supabase = await createClient();
  const [lookups, statuses, { data: orgs }, { data: contracts }] = await Promise.all([
    getLookups(ctx.tenantId),
    getStatuses(ctx.tenantId),
    supabase.from("organisations").select("id, name").eq("tenant_id", ctx.tenantId).neq("status", "prospect").order("name"),
    canContracts
      ? supabase.from("contracts").select("id, reference, title, organisation_id").eq("tenant_id", ctx.tenantId).order("title")
      : Promise.resolve({ data: [] as { id: string; reference: string; title: string; organisation_id: string }[] }),
  ]);
  const openKeys = statuses.list.filter((s) => s.counts_as_open).map((s) => s.key);
  const nowIso = new Date().toISOString();

  const contractFilter = canContracts && isUuid(contract) ? contract : "";
  const jobsFilter = canJobs && (jobs === "open" || jobs === "overdue") ? jobs : "";
  const select = [BASE_SELECT, contractFilter && "contract_properties!inner(contract_id)", jobsFilter && "work_orders!inner(id)"].filter(Boolean).join(", ") as typeof BASE_SELECT;

  function filtered(withCount: boolean) {
    let query = supabase.from("properties").select(select, withCount ? { count: "exact" } : undefined).eq("tenant_id", ctx.tenantId).is("archived_at", null);
    if (q) {
      const compact = q.replace(/\s+/g, "").toUpperCase();
      const spaced = /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(compact) ? `${compact.slice(0, -3)} ${compact.slice(-3)}` : q;
      query = query.or(
        [`address_line1.ilike.%${q}%`, `address_line2.ilike.%${q}%`, `town.ilike.%${q}%`, `postcode.ilike.%${spaced}%`, `reference.ilike.%${q}%`, `client_reference.ilike.%${q}%`, `uprn.ilike.%${q.replace(/\s+/g, "")}%`].join(","),
      );
    }
    if (isUuid(org)) query = query.eq("organisation_id", org);
    if (type) query = query.eq("property_type", type);
    if (status in PROPERTY_STATUS) query = query.eq("status", status);
    if (contractFilter) query = query.eq("contract_properties.contract_id", contractFilter);
    if (jobsFilter) {
      query = query.in("work_orders.status", openKeys);
      if (jobsFilter === "overdue") query = query.lt("work_orders.target_completion_at", nowIso);
    }
    return query;
  }

  const { data: rows, count: total } =
    view === "map"
      ? await filtered(true).order("reference").range(0, MAP_LIMIT - 1)
      : await filtered(true).order("created_at", { ascending: false }).order("reference", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const props = rows ?? [];

  // job activity for the properties shown (list) or open jobs tenant-wide (map colouring)
  type Wo = { property_id: string; status: string; priority: string; reported_at: string; target_completion_at: string | null };
  let wos: Wo[] = [];
  if (canJobs && props.length) {
    if (view === "map") {
      const { data } = await supabase.from("work_orders").select("property_id, status, priority, reported_at, target_completion_at").eq("tenant_id", ctx.tenantId).in("status", openKeys).limit(5000);
      wos = data ?? [];
    } else {
      const { data } = await supabase.from("work_orders").select("property_id, status, priority, reported_at, target_completion_at").eq("tenant_id", ctx.tenantId).in("property_id", props.map((p) => p.id)).limit(5000);
      wos = data ?? [];
    }
  }
  const open = new Set(openKeys);
  const activity = new Map<string, { open: number; emergency: number; overdue: number; last: string | null }>();
  for (const w of wos) {
    const a = activity.get(w.property_id) ?? { open: 0, emergency: 0, overdue: 0, last: null };
    if (open.has(w.status)) {
      a.open++;
      if (w.priority === "emergency") a.emergency++;
      if (w.target_completion_at && w.target_completion_at < nowIso) a.overdue++;
    }
    if (!a.last || w.reported_at > a.last) a.last = w.reported_at;
    activity.set(w.property_id, a);
  }

  const typeOptions = lookups.options("property_type");
  const orgOptions = (orgs ?? []).map((o) => ({ value: o.id, label: o.name }));
  const contractOptions = (contracts ?? []).filter((c) => !isUuid(org) || c.organisation_id === org).map((c) => ({ value: c.id, label: `${c.reference} · ${c.title}` }));
  const filtersActive = Boolean(q || org || contractFilter || type || status || jobsFilter);

  const qs = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) next.set(k, v);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    const s = next.toString();
    return `/properties${s ? `?${s}` : ""}`;
  };

  const points: MapPoint[] = [];
  let unlocated = 0;
  if (view === "map") {
    for (const p of props) {
      if (p.latitude === null || p.longitude === null) {
        unlocated++;
        continue;
      }
      const a = activity.get(p.id);
      const state = a?.emergency ? "emergency" : a?.open ? "open" : p.status === "void" ? "void" : "none";
      points.push({
        id: p.id,
        lat: Number(p.latitude),
        lng: Number(p.longitude),
        colour: MAP_COLOURS[state],
        title: [p.address_line1, p.address_line2].filter(Boolean).join(", "),
        subtitle: `${p.town} ${p.postcode}${p.organisation?.name ? ` · ${p.organisation.name}` : ""}`,
        meta:
          state === "emergency"
            ? `${a!.emergency} open emergency · ${a!.open} open job${a!.open === 1 ? "" : "s"}`
            : state === "open"
              ? `${a!.open} open job${a!.open === 1 ? "" : "s"}${a!.overdue ? ` · ${a!.overdue} overdue` : ""}`
              : state === "void"
                ? "Void · no open jobs"
                : "No open jobs",
        href: `/properties/${p.id}`,
        size: state === "emergency" ? 9 : 7,
      });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Properties"
        description="Every property you maintain, its client, status and live work."
        actions={
          <>
            <div className="inline-flex rounded-[10px] border border-line-strong bg-sunken p-0.5" role="group" aria-label="View">
              <Link href={qs({ view: null })} aria-current={view === "list" ? "page" : undefined} className={cx("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px]", view === "list" ? "bg-raised font-medium text-fg" : "text-muted hover:text-fg")}>
                <List className="size-4" aria-hidden />
                List
              </Link>
              <Link href={qs({ view: "map" })} aria-current={view === "map" ? "page" : undefined} className={cx("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px]", view === "map" ? "bg-raised font-medium text-fg" : "text-muted hover:text-fg")}>
                <MapIcon className="size-4" aria-hidden />
                Map
              </Link>
            </div>
            {ctx.can("properties.write") && (
              <ButtonLink href={isUuid(org) ? `/properties/new?org=${org}` : "/properties/new"} variant="primary">
                <Plus className="size-4" aria-hidden />
                Add property
              </ButtonLink>
            )}
          </>
        }
      />

      {param(sp.deleted) === "1" && (
        <div className="mb-4">
          <Notice tone="ok">Property deleted.</Notice>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3 sm:px-5">
          <SearchBox placeholder="Address, postcode, reference, UPRN…" className="w-full sm:w-80" />
          {orgOptions.length > 0 && <FilterSelect param="org" label="Client" options={orgOptions} className="w-full sm:w-auto sm:max-w-64" />}
          {canContracts && contractOptions.length > 0 && <FilterSelect param="contract" label="Contract" options={contractOptions} className="w-full sm:w-auto sm:max-w-72" />}
          <FilterSelect param="type" label="Type" options={typeOptions} className="w-full sm:w-auto" />
          <FilterSelect param="status" label="Status" options={Object.entries(PROPERTY_STATUS).map(([value, s]) => ({ value, label: s.label }))} className="w-full sm:w-auto" />
          {canJobs && (
            <FilterSelect
              param="jobs"
              label="Jobs"
              options={[
                { value: "open", label: "Has open jobs" },
                { value: "overdue", label: "Has overdue jobs" },
              ]}
              className="w-full sm:w-auto"
            />
          )}
          {filtersActive && (
            <Link href={view === "map" ? "/properties?view=map" : "/properties"} className="inline-flex h-10 items-center px-2 text-sm text-accent-hi hover:underline">
              Clear filters
            </Link>
          )}
        </div>

        {view === "map" ? (
          <div className="p-4 sm:p-5">
            <PropertyMap points={points} emptyLabel={props.length ? "None of these properties has a map location" : "No properties match these filters"} />
            <p className="mt-3 text-xs text-subtle">
              {count(points.length)} of {count(total ?? props.length)} matching properties on the map
              {unlocated > 0 && ` · ${unlocated} without a location (add or correct the postcode to place them)`}
              {(total ?? 0) > MAP_LIMIT && ` · showing the first ${count(MAP_LIMIT)}: narrow the filters to see the rest`}
              {!canJobs && " · job activity is hidden because you cannot view jobs"}
            </p>
          </div>
        ) : props.length ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Reference</TH>
                  <TH>Address</TH>
                  <TH>Client</TH>
                  <TH>Type</TH>
                  <TH>Status</TH>
                  {canJobs && <TH align="right">Open jobs</TH>}
                  {canJobs && <TH>Last job</TH>}
                </tr>
              </THead>
              <tbody>
                {props.map((p) => {
                  const a = activity.get(p.id);
                  const st = PROPERTY_STATUS[p.status] ?? { label: p.status, tone: "neutral" as Tone };
                  return (
                    <TR key={p.id}>
                      <TD className="whitespace-nowrap">
                        <Link href={`/properties/${p.id}`} className="hover:underline">
                          <Mono>{p.reference}</Mono>
                        </Link>
                        {p.client_reference && <div className="text-xs text-subtle">{p.client_reference}</div>}
                      </TD>
                      <TD className="min-w-[220px]">
                        <Link href={`/properties/${p.id}`} className="font-medium hover:text-accent-hi">
                          {p.address_line1}
                          {p.address_line2 && <span className="font-normal text-muted">, {p.address_line2}</span>}
                        </Link>
                        <div className="text-xs text-subtle">
                          {p.town} · <span className="whitespace-nowrap">{p.postcode}</span>
                        </div>
                      </TD>
                      <TD className="min-w-[180px] text-[13px]">{p.organisation?.name ?? <span className="text-subtle">-</span>}</TD>
                      <TD className="text-[13px] whitespace-nowrap text-muted">{lookups.label("property_type", p.property_type)}</TD>
                      <TD>
                        <Badge tone={st.tone} dot>{st.label}</Badge>
                      </TD>
                      {canJobs && (
                        <TD align="right">
                          {a?.open ? (
                            <span className="inline-flex items-center justify-end gap-1.5">
                              {a.emergency > 0 && <Badge tone="bad">{a.emergency} emergency</Badge>}
                              {a.overdue > 0 && <Badge tone="warn">{a.overdue} overdue</Badge>}
                              <span className="font-medium tabular">{a.open}</span>
                            </span>
                          ) : (
                            <span className="text-subtle tabular">0</span>
                          )}
                        </TD>
                      )}
                      {canJobs && <TD className="whitespace-nowrap text-[13px] text-muted">{a?.last ? date(a.last) : <span className="text-subtle">Never</span>}</TD>}
                    </TR>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={PAGE} total={total ?? 0} />
          </>
        ) : (
          <EmptyState
            icon={<Home className="size-8" aria-hidden />}
            title={filtersActive ? "No properties match these filters" : "No properties yet"}
            action={
              !filtersActive && ctx.can("properties.write") ? (
                <ButtonLink href="/properties/new" variant="primary">
                  <Plus className="size-4" aria-hidden />
                  Add the first property
                </ButtonLink>
              ) : undefined
            }
          >
            {filtersActive ? "Try a different search or clear the filters." : "Add properties to start raising and tracking work against them."}
          </EmptyState>
        )}
      </Card>
    </>
  );
}
