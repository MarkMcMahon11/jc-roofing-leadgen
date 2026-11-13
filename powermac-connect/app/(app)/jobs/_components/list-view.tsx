import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Badge, Card, ColourBadge, EmptyState, Mono, priorityTone, Table, TD, TH, THead, TR, cx } from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/url-controls";
import { date, label } from "@/lib/format";

const thisYear = String(new Date().getFullYear());
/** "13 Nov" this year, "13 Nov 2025" otherwise. */
const shortDate = (v: string) => {
  const d = date(v);
  return d.endsWith(thisYear) ? d.slice(0, -5) : d;
};
import type { ServerClient } from "@/lib/supabase/server";
import { jobQuery, filterQuery, type JobFilters } from "../_lib/filters";
import { assignees, dueState } from "../_lib/data";
import { CARD_SELECT, type JobCardRow } from "../_lib/types";
import { PRIORITIES } from "../_lib/constants";

export const PAGE_SIZE = 50;
type Sort = "reported" | "target" | "priority";
type StatusInfo = { get: (k: string) => { label: string; colour: string; counts_as_open: boolean } };

/**
 * Priority is stored as text, so "emergency first" is not an alphabetical order. We count
 * each priority (cheap head queries), work out which priority buckets the requested page
 * spans, and read just those slices - exact paging without loading every job.
 */
async function byPriority(supabase: ServerClient, tenantId: string, f: JobFilters, openKeys: string[], page: number, desc: boolean) {
  const order = PRIORITIES.map((p) => p.value).filter((p) => !f.priority || p === f.priority);
  if (desc) order.reverse();
  const counts = await Promise.all(order.map((p) => jobQuery(supabase, tenantId, "id", { ...f, priority: p }, openKeys, { head: true }).then((r) => r.count ?? 0)));
  const total = counts.reduce((a, b) => a + b, 0);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE; // exclusive
  const slices: PromiseLike<JobCardRow[]>[] = [];
  let start = 0;
  order.forEach((p, i) => {
    const end = start + counts[i];
    const lo = Math.max(from, start);
    const hi = Math.min(to, end);
    if (hi > lo) {
      slices.push(
        jobQuery(supabase, tenantId, CARD_SELECT, { ...f, priority: p }, openKeys)
          .order("target_completion_at", { ascending: true, nullsFirst: false })
          .order("reference")
          .range(lo - start, hi - start - 1)
          .then((r) => (r.data ?? []) as unknown as JobCardRow[]),
      );
    }
    start = end;
  });
  return { rows: (await Promise.all(slices)).flat(), total };
}

export async function ListView({
  supabase,
  tenantId,
  filters,
  openKeys,
  statuses,
  sort,
  dir,
  page,
}: {
  supabase: ServerClient;
  tenantId: string;
  filters: JobFilters;
  openKeys: string[];
  statuses: StatusInfo;
  sort: Sort;
  dir: "asc" | "desc";
  page: number;
}) {
  let rows: JobCardRow[];
  let total: number;
  if (sort === "priority") {
    ({ rows, total } = await byPriority(supabase, tenantId, filters, openKeys, page, dir === "desc"));
  } else {
    const col = sort === "target" ? "target_completion_at" : "reported_at";
    const res = await jobQuery(supabase, tenantId, CARD_SELECT, filters, openKeys, { count: true })
      .order(col, { ascending: dir === "asc", nullsFirst: false })
      .order("reference", { ascending: dir === "asc" })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    rows = (res.data ?? []) as unknown as JobCardRow[];
    total = res.count ?? 0;
  }

  const head = (key: Sort, text: string) => {
    const active = sort === key;
    const nextDir = active ? (dir === "asc" ? "desc" : "asc") : key === "reported" ? "desc" : "asc";
    const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <Link
        href={`/jobs${filterQuery(filters, { view: "list", sort: key, dir: nextDir })}`}
        scroll={false}
        className={cx("inline-flex items-center gap-1 hover:text-fg", active && "text-fg")}
        aria-label={`Sort by ${text}`}
      >
        {text}
        <Icon className="size-3.5" aria-hidden />
      </Link>
    );
  };

  return (
    <Card>
      {rows.length === 0 ? (
        <EmptyState title="No jobs match these filters">Try clearing a filter or searching for a different reference.</EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Job</TH>
              <TH>Property</TH>
              <TH>Status</TH>
              <TH>{head("priority", "Priority")}</TH>
              <TH>{head("reported", "Reported")}</TH>
              <TH>{head("target", "Target")}</TH>
              <TH>Assigned</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map((r) => {
              const s = statuses.get(r.status);
              const due = dueState(r.target_completion_at, s.counts_as_open);
              const people = assignees(r.job_assignments);
              return (
                <TR key={r.id}>
                  <TD className="max-w-[250px]">
                    <Link href={`/jobs/${r.id}`} className="group block">
                      <Mono>{r.reference}</Mono>
                      <span className="mt-0.5 block truncate font-medium group-hover:text-accent-hi">{r.title}</span>
                      {r.client_reference && <span className="block truncate text-xs text-subtle">Client ref {r.client_reference}</span>}
                    </Link>
                  </TD>
                  <TD className="max-w-[200px]">
                    <span className="block truncate">{r.properties?.address_line1}</span>
                    <span className="block truncate text-xs text-subtle">
                      {r.properties?.postcode} · {r.organisations?.name}
                    </span>
                  </TD>
                  <TD>
                    <ColourBadge colour={s.colour}>{s.label}</ColourBadge>
                  </TD>
                  <TD>
                    <Badge tone={priorityTone[r.priority] ?? "neutral"}>{label(r.priority)}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-muted tabular">{shortDate(r.reported_at)}</TD>
                  <TD className={cx("whitespace-nowrap tabular", due === "overdue" ? "font-semibold text-[#ff8a87]" : due === "soon" ? "text-[#ffc56b]" : "text-muted")}>
                    {r.target_completion_at ? shortDate(r.target_completion_at) : "-"}
                    {due === "overdue" && <span className="block text-[11px] font-medium">Overdue</span>}
                  </TD>
                  <TD>
                    {people.length ? (
                      <div className="flex -space-x-1.5">
                        {people.slice(0, 3).map((a) => (
                          <span key={a.name} title={a.name} className="flex size-7 items-center justify-center rounded-full border-2 border-surface text-[10px] font-semibold text-white" style={{ backgroundColor: a.colour }}>
                            {a.initials}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-subtle">Unassigned</span>
                    )}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
    </Card>
  );
}
