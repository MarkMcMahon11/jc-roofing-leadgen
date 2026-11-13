import type { Metadata } from "next";
import Link from "next/link";
import { FileSignature, Plus } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { Badge, ButtonLink, Card, EmptyState, Mono, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { FilterSelect, Pagination, SearchBox } from "@/components/ui/url-controls";
import { count, date, money, todayISO } from "@/lib/format";
import { getOrgOptions } from "../crm/_lib/data";
import { gbpShort, isUuid, pageNo, searchTerm, str } from "../crm/_lib/shared";
import { CONTRACT_STATUSES, contractStatusLabel, contractStatusTone, expiry } from "./_lib/constants";

export const metadata: Metadata = { title: "Contracts" };
const PAGE = 25;
const SORTS = [
  { value: "ending", label: "Ending soonest" },
  { value: "value", label: "Highest value" },
  { value: "newest", label: "Newest" },
];

function plusDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function ContractsPage({ searchParams }: PageProps<"/contracts">) {
  const ctx = await requireInternal("contracts.read");
  const sp = await searchParams;
  const page = pageNo(sp.page);
  const q = searchTerm(sp.q);
  const status = str(sp.status);
  const type = str(sp.type);
  const client = isUuid(sp.client) ? sp.client : undefined;
  const expiring = sp.expiring === "90";
  const sort = SORTS.some((s) => s.value === sp.sort) ? (sp.sort as string) : "newest";
  const today = todayISO();
  const in90 = plusDays(today, 90);

  const supabase = await createClient();
  let query = supabase
    .from("contracts")
    .select("id, reference, client_reference, title, contract_type, status, value, start_date, end_date, organisation_id, org:organisations(name)", { count: "exact" })
    .eq("tenant_id", ctx.tenantId);
  if (q) query = query.or(`title.ilike.%${q}%,reference.ilike.%${q}%,client_reference.ilike.%${q}%`);
  if (status) query = query.eq("status", status);
  if (type) query = query.eq("contract_type", type);
  if (client) query = query.eq("organisation_id", client);
  if (expiring) query = query.eq("status", "active").gte("end_date", today).lte("end_date", in90);
  query =
    sort === "ending"
      ? query.order("end_date", { ascending: true, nullsFirst: false })
      : sort === "value"
        ? query.order("value", { ascending: false })
        : query.order("created_at", { ascending: false });

  const [{ data, count: total }, lookups, orgs, active, ending, tender] = await Promise.all([
    query.range((page - 1) * PAGE, page * PAGE - 1),
    getLookups(ctx.tenantId),
    getOrgOptions(ctx.tenantId, { includeInactive: true }),
    supabase.from("contracts").select("value").eq("tenant_id", ctx.tenantId).eq("status", "active"),
    supabase.from("contracts").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("status", "active").gte("end_date", today).lte("end_date", in90),
    supabase.from("contracts").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("status", "tender"),
  ]);
  const activeValue = (active.data ?? []).reduce((a, c) => a + Number(c.value), 0);
  const filtered = Boolean(q || status || type || client || expiring);

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Contracts"
        description="Every client contract with its value, term, SLAs, KPIs and performance."
        actions={
          ctx.can("contracts.write") && (
            <ButtonLink href="/contracts/new" variant="primary">
              <Plus className="size-4" aria-hidden />
              New contract
            </ButtonLink>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active contracts" value={count(active.data?.length ?? 0)} href="/contracts?status=active" tone="ok" />
        <Stat label="Active contract value" value={gbpShort(activeValue)} hint={money(activeValue, { whole: true })} href="/contracts?status=active&sort=value" tone="accent" />
        <Stat label="Expiring in 90 days" value={count(ending.count ?? 0)} hint="Active contracts ending soon" href="/contracts?expiring=90&sort=ending" tone={ending.count ? "warn" : "neutral"} />
        <Stat label="In tender" value={count(tender.count ?? 0)} hint="Bids not yet awarded" href="/contracts?status=tender" tone="info" />
      </div>

      <Card>
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3 sm:px-5">
          <SearchBox placeholder="Search title or reference…" className="w-full sm:w-64" />
          <div className="w-[calc(50%-4px)] sm:w-40"><FilterSelect param="status" label="Status" options={CONTRACT_STATUSES} /></div>
          <div className="w-[calc(50%-4px)] sm:w-52"><FilterSelect param="type" label="Type" options={lookups.options("contract_type")} /></div>
          <div className="w-[calc(50%-4px)] sm:w-60"><FilterSelect param="client" label="Client" options={orgs} /></div>
          <div className="w-[calc(50%-4px)] sm:w-48"><FilterSelect param="sort" label="Sort" options={SORTS} /></div>
          {expiring && (
            <Link href="/contracts" className="inline-flex items-center">
              <Badge tone="warn">Expiring in 90 days ✕</Badge>
            </Link>
          )}
        </div>
        {data?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Contract</TH>
                <TH>Client</TH>
                <TH>Type</TH>
                <TH align="right">Value</TH>
                <TH>Term</TH>
                <TH>Expires in</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <tbody>
              {data.map((c) => {
                const e = expiry(c.end_date, c.status);
                const live = c.status === "active" || c.status === "on_hold";
                return (
                  <TR key={c.id}>
                    <TD className="max-w-xs">
                      <Link href={`/contracts/${c.id}`} className="font-medium text-fg hover:text-accent-hi">
                        {c.title}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-subtle">
                        <Mono className="text-[11.5px]">{c.reference}</Mono>
                        {c.client_reference && <span>Client ref {c.client_reference}</span>}
                      </div>
                    </TD>
                    <TD className="text-[13px]">
                      <Link href={`/crm/${c.organisation_id}`} className="hover:text-accent-hi">{c.org?.name ?? "-"}</Link>
                    </TD>
                    <TD className="text-[13px] text-muted">{lookups.label("contract_type", c.contract_type)}</TD>
                    <TD align="right">{money(c.value, { whole: true })}</TD>
                    <TD className="whitespace-nowrap text-[13px]">
                      <div>{date(c.start_date)}</div>
                      <div className="text-xs text-subtle">to {date(c.end_date)}</div>
                    </TD>
                    <TD>{live && e.days !== null ? <Badge tone={e.tone}>{e.text}</Badge> : <span className="text-xs text-subtle">{live ? e.text : "-"}</span>}</TD>
                    <TD>
                      <Badge tone={contractStatusTone[c.status] ?? "neutral"} dot>
                        {contractStatusLabel(c.status)}
                      </Badge>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            icon={<FileSignature className="size-8" />}
            title={filtered ? "No contracts match these filters" : "No contracts yet"}
            action={!filtered && ctx.can("contracts.write") ? <ButtonLink href="/contracts/new" variant="primary">Add a contract</ButtonLink> : undefined}
          >
            {filtered ? "Try a different search or clear the filters." : "Record your client contracts to track SLAs, KPIs, renewals and spend."}
          </EmptyState>
        )}
        <Pagination page={page} pageSize={PAGE} total={total ?? 0} />
      </Card>
    </>
  );
}
