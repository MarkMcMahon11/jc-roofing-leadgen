import type { Metadata } from "next";
import Link from "next/link";
import { Handshake, Plus, Star } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups, getStatuses } from "@/lib/data/lookups";
import { Badge, ButtonLink, Card, EmptyState, Mono, PageHeader, Table, TD, TH, THead, TR, type Tone } from "@/components/ui/primitives";
import { FilterSelect, Pagination, SearchBox } from "@/components/ui/url-controls";
import { addDaysISO, todayISO } from "@/lib/format";
import { Chips, cleanSearch, ExpiryDate, param } from "../properties/_lib/ui";
import { CIS_STATUS, LIVE_ASSIGNMENT, SUB_STATUS } from "./_lib/shared";

export const metadata: Metadata = { title: "Subcontractors" };
const PAGE = 50;

export default async function SubcontractorsPage({ searchParams }: PageProps<"/subcontractors">) {
  const ctx = await requireInternal("subcontractors.read");
  const sp = await searchParams;
  const q = cleanSearch(sp.q);
  const status = param(sp.status);
  const trade = param(sp.trade);
  const insurance = param(sp.insurance);
  const page = Math.max(1, Number(param(sp.page)) || 1);
  const today = todayISO();
  const supabase = await createClient();
  const [lookups, statuses] = await Promise.all([getLookups(ctx.tenantId), getStatuses(ctx.tenantId)]);

  let query = supabase
    .from("subcontractors")
    .select("id, reference, company_name, contact_name, trades, status, insurance_expiry, cis_status, rating, day_rate", { count: "exact" })
    .eq("tenant_id", ctx.tenantId);
  if (q) query = query.or([`company_name.ilike.%${q}%`, `contact_name.ilike.%${q}%`, `reference.ilike.%${q}%`, `email.ilike.%${q}%`].join(","));
  if (status in SUB_STATUS) query = query.eq("status", status);
  else query = query.neq("status", "archived");
  if (trade) query = query.contains("trades", [trade]);
  if (insurance === "expired") query = query.lt("insurance_expiry", today);
  if (insurance === "expiring") query = query.gte("insurance_expiry", today).lte("insurance_expiry", addDaysISO(today, 30));
  if (insurance === "missing") query = query.is("insurance_expiry", null);
  const { data, count } = await query.order("company_name").range((page - 1) * PAGE, page * PAGE - 1);
  const rows = data ?? [];

  // live assignments: not finished, on jobs that are still open
  const canJobs = ctx.can("work_orders.read");
  const live = new Map<string, number>();
  if (canJobs && rows.length) {
    const openKeys = statuses.list.filter((s) => s.counts_as_open).map((s) => s.key);
    const { data: assigns } = await supabase
      .from("job_assignments")
      .select("subcontractor_id, work_order_id, work_order:work_orders!inner(status)")
      .eq("tenant_id", ctx.tenantId)
      .in("subcontractor_id", rows.map((r) => r.id))
      .in("status", LIVE_ASSIGNMENT)
      .in("work_order.status", openKeys);
    const seen = new Set<string>();
    for (const a of assigns ?? []) {
      const k = `${a.subcontractor_id}:${a.work_order_id}`;
      if (!a.subcontractor_id || seen.has(k)) continue;
      seen.add(k);
      live.set(a.subcontractor_id, (live.get(a.subcontractor_id) ?? 0) + 1);
    }
  }
  const filtersActive = Boolean(q || status || trade || insurance);

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Subcontractors"
        description="Approved supply chain, compliance and live work."
        actions={
          ctx.can("subcontractors.write") ? (
            <ButtonLink href="/subcontractors/new" variant="primary">
              <Plus className="size-4" aria-hidden />
              Add subcontractor
            </ButtonLink>
          ) : undefined
        }
      />
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3 sm:px-5">
          <SearchBox placeholder="Company, contact, reference…" className="w-full sm:w-72" />
          <FilterSelect param="status" label="Status" options={Object.entries(SUB_STATUS).map(([value, s]) => ({ value, label: s.label }))} className="w-full sm:w-auto" />
          <FilterSelect param="trade" label="Trade" options={lookups.options("trade")} className="w-full sm:w-auto" />
          <FilterSelect
            param="insurance"
            label="Insurance"
            options={[
              { value: "expired", label: "Expired" },
              { value: "expiring", label: "Expiring in 30 days" },
              { value: "missing", label: "Not recorded" },
            ]}
            className="w-full sm:w-auto"
          />
          {filtersActive && (
            <Link href="/subcontractors" className="inline-flex h-10 items-center px-2 text-sm text-accent-hi hover:underline">
              Clear filters
            </Link>
          )}
        </div>
        {rows.length ? (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Company</TH>
                  <TH>Trades</TH>
                  <TH>Status</TH>
                  <TH>Insurance expiry</TH>
                  <TH>CIS</TH>
                  <TH align="right">Rating</TH>
                  {canJobs && <TH align="right">Live jobs</TH>}
                </tr>
              </THead>
              <tbody>
                {rows.map((s) => {
                  const st = SUB_STATUS[s.status] ?? { label: s.status, tone: "neutral" as Tone };
                  const cis = CIS_STATUS[s.cis_status] ?? { label: s.cis_status, tone: "neutral" as Tone };
                  const n = live.get(s.id) ?? 0;
                  const insuranceBad = !s.insurance_expiry || s.insurance_expiry < today;
                  return (
                    <TR key={s.id}>
                      <TD className="min-w-[220px]">
                        <Link href={`/subcontractors/${s.id}`} className="font-medium hover:text-accent-hi">
                          {s.company_name}
                        </Link>
                        <div className="text-xs text-subtle">
                          <Mono className="text-[11.5px] text-subtle">{s.reference}</Mono>
                          {s.contact_name && <> · {s.contact_name}</>}
                        </div>
                      </TD>
                      <TD className="min-w-[160px]">
                        <Chips items={s.trades.map((t) => lookups.label("trade", t))} />
                      </TD>
                      <TD><Badge tone={st.tone} dot>{st.label}</Badge></TD>
                      <TD className="text-[13px]">
                        <ExpiryDate value={s.insurance_expiry} emptyLabel="Not recorded" />
                      </TD>
                      <TD><Badge tone={cis.tone}>{cis.label}</Badge></TD>
                      <TD align="right">
                        {s.rating !== null ? (
                          <span className="inline-flex items-center gap-1 tabular">
                            <Star className="size-3.5 fill-warn text-warn" aria-hidden />
                            {Number(s.rating).toFixed(1)}
                            <span className="sr-only">out of 5</span>
                          </span>
                        ) : (
                          <span className="text-subtle">-</span>
                        )}
                      </TD>
                      {canJobs && (
                        <TD align="right">
                          {n ? (
                            <span className="inline-flex items-center justify-end gap-1.5">
                              {(s.status !== "approved" || insuranceBad) && <Badge tone="bad">Non-compliant</Badge>}
                              <Link href={`/subcontractors/${s.id}?tab=assignments`} className="font-medium hover:text-accent-hi">{n}</Link>
                            </span>
                          ) : (
                            <span className="text-subtle">0</span>
                          )}
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={PAGE} total={count ?? 0} />
          </>
        ) : (
          <EmptyState icon={<Handshake className="size-8" aria-hidden />} title={filtersActive ? "No subcontractors match these filters" : "No subcontractors yet"}>
            {filtersActive ? "Try a different search or clear the filters." : "Add the specialist firms you use so their compliance and work can be tracked."}
          </EmptyState>
        )}
      </Card>
    </>
  );
}
