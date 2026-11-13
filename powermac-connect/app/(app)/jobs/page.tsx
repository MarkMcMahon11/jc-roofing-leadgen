import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Layers, Plus } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups, getStatuses } from "@/lib/data/lookups";
import { ButtonLink, PageHeader } from "@/components/ui/primitives";
import { LinkTabs } from "@/components/ui/url-controls";
import { label } from "@/lib/format";
import { filterQuery, hasFilters, jobQuery, parseFilters } from "./_lib/filters";
import { getClients, getContractsForFilter, getOperatives, getPermissionLabels, getTransitions, toBoardCard } from "./_lib/data";
import { CARD_SELECT, type BoardColumn, type BoardMove, type JobCardRow } from "./_lib/types";
import { PRIORITY_RANK } from "./_lib/constants";
import { FilterBar } from "./_components/filter-bar";
import { Board } from "./_components/board";
import { ListView } from "./_components/list-view";
import { CalendarView, parseMonth } from "./_components/calendar-view";
import { JobsMap } from "./_components/jobs-map";
import { WorkRequests } from "./_components/work-requests";

export const metadata: Metadata = { title: "Jobs" };

const VIEWS = ["board", "list", "calendar", "map", "requests"] as const;
type View = (typeof VIEWS)[number];
const BOARD_LIMIT = 40;
const MAP_LIMIT = 2000;

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  const ctx = await requireInternal("work_orders.read");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const view: View = (VIEWS as readonly string[]).includes(str("view") ?? "") ? (str("view") as View) : "board";
  const filters = parseFilters(sp);
  const supabase = await createClient();

  const [statuses, lookups, clients, contracts, operatives, requests] = await Promise.all([
    getStatuses(ctx.tenantId),
    getLookups(ctx.tenantId),
    getClients(ctx.tenantId),
    getContractsForFilter(ctx.tenantId),
    getOperatives(ctx.tenantId),
    supabase.from("inbound_messages").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("status", "new"),
  ]);
  const active = statuses.list.filter((s) => s.is_active);
  const openKeys = active.filter((s) => s.counts_as_open).map((s) => s.key);
  const canWrite = ctx.can("work_orders.write");
  const requestCount = requests.count ?? 0;

  const tab = (v: View) => `/jobs${filterQuery(filters, { view: v === "board" ? undefined : v })}`;
  const tabs = [
    { key: "board", label: "Board", href: tab("board") },
    { key: "list", label: "List", href: tab("list") },
    { key: "calendar", label: "Calendar", href: tab("calendar") },
    { key: "map", label: "Map", href: tab("map") },
    { key: "requests", label: "Work requests", href: "/jobs?view=requests", count: requestCount },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Jobs"
        description="Every work order from request to close: board, list, calendar and map views share the same filters."
        actions={
          canWrite ? (
            <>
              <ButtonLink href="/jobs/bulk" variant="secondary">
                <Layers className="size-4" aria-hidden /> Bulk create
              </ButtonLink>
              <ButtonLink href="/jobs/new" variant="primary">
                <Plus className="size-4" aria-hidden /> New job
              </ButtonLink>
            </>
          ) : null
        }
      />
      <div className="mb-4">
        <LinkTabs tabs={tabs} current={view} />
      </div>

      {view !== "requests" && (
        <FilterBar
          statuses={active.map((s) => ({ value: s.key, label: s.label }))}
          trades={lookups.options("trade")}
          clients={clients}
          contracts={contracts}
          operatives={operatives}
        />
      )}

      {view === "board" && requestCount > 0 && canWrite && (
        <Link
          href="/jobs?view=requests"
          className="mb-4 flex items-center gap-3 rounded-xl border border-[#1d3d78] bg-accent-lo/50 px-4 py-2.5 text-sm text-[#b5d1ff] transition-colors hover:bg-accent-lo"
        >
          <Inbox className="size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">{requestCount}</strong> work request{requestCount === 1 ? "" : "s"} waiting to be turned into jobs
          </span>
          <span className="ml-auto font-medium">Review →</span>
        </Link>
      )}

      {view === "board" && (
        <BoardSection ctx={{ tenantId: ctx.tenantId, can: ctx.can }} supabase={supabase} filters={filters} active={active} openKeys={openKeys} canWrite={canWrite} />
      )}
      {view === "list" && (
        <ListView
          supabase={supabase}
          tenantId={ctx.tenantId}
          filters={filters}
          openKeys={openKeys}
          statuses={statuses}
          sort={str("sort") === "target" || str("sort") === "priority" ? (str("sort") as "target" | "priority") : "reported"}
          dir={str("dir") === "asc" ? "asc" : str("dir") === "desc" ? "desc" : str("sort") === "target" || str("sort") === "priority" ? "asc" : "desc"}
          page={Math.max(1, Number(str("page")) || 1)}
        />
      )}
      {view === "calendar" && (
        <CalendarView supabase={supabase} tenantId={ctx.tenantId} filters={filters} openKeys={openKeys} month={parseMonth(str("month"))} colourOf={Object.fromEntries(statuses.list.map((s) => [s.key, s.colour]))} />
      )}
      {view === "map" && <MapSection supabase={supabase} tenantId={ctx.tenantId} filters={filters} active={active} openKeys={openKeys} />}
      {view === "requests" && <WorkRequests supabase={supabase} tenantId={ctx.tenantId} canWrite={canWrite} />}

      {view !== "requests" && hasFilters(filters) && <p className="mt-3 text-xs text-subtle">Filters apply to every view. Switch views with the tabs above to see the same jobs differently.</p>}
    </>
  );
}

type Status = Awaited<ReturnType<typeof getStatuses>>["list"][number];
type Supabase = Awaited<ReturnType<typeof createClient>>;

async function BoardSection({
  ctx,
  supabase,
  filters,
  active,
  openKeys,
  canWrite,
}: {
  ctx: { tenantId: string; can: (p: string) => boolean };
  supabase: Supabase;
  filters: ReturnType<typeof parseFilters>;
  active: Status[];
  openKeys: string[];
  canWrite: boolean;
}) {
  const [transitions, permLabels] = await Promise.all([getTransitions(ctx.tenantId), getPermissionLabels()]);
  const shown = filters.status ? active.filter((s) => s.key === filters.status) : active;
  const results = await Promise.all(
    shown.map((s) => {
      let q = jobQuery(supabase, ctx.tenantId, CARD_SELECT, { ...filters, status: s.key }, openKeys, { count: true });
      q = s.counts_as_open ? q.order("target_completion_at", { ascending: true, nullsFirst: false }) : q.order("updated_at", { ascending: false });
      return q.limit(BOARD_LIMIT);
    }),
  );
  const byKey = new Map(shown.map((s, i) => [s.key, results[i]]));
  const columns: BoardColumn[] = active.map((s) => {
    const r = byKey.get(s.key);
    const rows = ((r?.data ?? []) as unknown as JobCardRow[]).map((x) => toBoardCard(x, s.counts_as_open));
    if (s.counts_as_open) rows.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || (a.target ?? "9").localeCompare(b.target ?? "9"));
    return { key: s.key, label: s.label, colour: s.colour, isOpen: s.counts_as_open, total: r?.count ?? 0, cards: rows };
  });
  const activeKeys = new Set(active.map((s) => s.key));
  const labelOf = new Map(active.map((s) => [s.key, s.label]));
  const moves: Record<string, BoardMove[]> = {};
  for (const t of transitions) {
    if (!activeKeys.has(t.to_key)) continue;
    (moves[t.from_key] ??= []).push({
      to: t.to_key,
      label: labelOf.get(t.to_key) ?? label(t.to_key),
      locked: t.required_permission && !ctx.can(t.required_permission) ? (permLabels[t.required_permission] ?? t.required_permission) : null,
    });
  }
  const order = new Map(active.map((s) => [s.key, s.sort_order]));
  for (const k of Object.keys(moves)) moves[k].sort((a, b) => (order.get(a.to) ?? 0) - (order.get(b.to) ?? 0));
  const listHref = Object.fromEntries(active.map((s) => [s.key, `/jobs${filterQuery({ ...filters, status: s.key }, { view: "list" })}`]));
  return <Board columns={columns} moves={moves} canWrite={canWrite} listHref={listHref} />;
}

async function MapSection({
  supabase,
  tenantId,
  filters,
  active,
  openKeys,
}: {
  supabase: Supabase;
  tenantId: string;
  filters: ReturnType<typeof parseFilters>;
  active: Status[];
  openKeys: string[];
}) {
  let q = jobQuery(supabase, tenantId, "id, reference, title, status, priority, target_completion_at, properties(address_line1, town, postcode, latitude, longitude)", filters, openKeys);
  if (!filters.status) q = q.in("status", openKeys.length ? openKeys : ["__none__"]);
  const { data } = await q.order("target_completion_at", { ascending: true, nullsFirst: false }).limit(MAP_LIMIT);
  type Row = { id: string; reference: string; title: string; status: string; priority: string; target_completion_at: string | null; properties: { address_line1: string; town: string; postcode: string; latitude: number | null; longitude: number | null } | null };
  const rows = (data ?? []) as unknown as Row[];
  const meta = new Map(active.map((s) => [s.key, s]));
  const located = rows.filter((r) => r.properties?.latitude !== null && r.properties?.latitude !== undefined);
  // jobs at the same address would sit on top of each other; nudge them apart slightly
  const seen = new Map<string, number>();
  const points = located.map((r) => {
    const key = `${r.properties!.latitude},${r.properties!.longitude}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const angle = n * 2.4;
    const s = meta.get(r.status);
    return {
      id: r.id,
      lat: Number(r.properties!.latitude) + (n ? Math.sin(angle) * 0.00035 * Math.sqrt(n) : 0),
      lng: Number(r.properties!.longitude) + (n ? Math.cos(angle) * 0.0005 * Math.sqrt(n) : 0),
      colour: s?.colour ?? "#64748b",
      title: `${r.reference} · ${r.title}`,
      subtitle: `${r.properties!.address_line1}, ${r.properties!.town} ${r.properties!.postcode}`,
      meta: `${s?.label ?? label(r.status)} · ${label(r.priority)}`,
      href: `/jobs/${r.id}`,
      size: r.priority === "emergency" ? 9 : 7,
    };
  });
  const counts = new Map<string, number>();
  for (const r of located) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const legend = active.filter((s) => counts.get(s.key)).map((s) => ({ label: s.label, colour: s.colour, count: counts.get(s.key)! }));
  return <JobsMap points={points} legend={legend} missing={rows.length - located.length} capped={rows.length >= MAP_LIMIT} />;
}
