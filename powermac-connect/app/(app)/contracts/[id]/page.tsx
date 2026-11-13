import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, ChevronLeft, Pencil, Plus, UserRound } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { Badge, ButtonLink, Mono, Notice, PageHeader, Stat } from "@/components/ui/primitives";
import { LinkTabs } from "@/components/ui/url-controls";
import { count, date, daysUntil, money } from "@/lib/format";
import { isUuid } from "../../crm/_lib/shared";
import { AlertsTab, DocumentsTab, JobsTab, KpisTab, OverviewTab, PropertiesTab, SlasTab, VariationsTab, type Alert, type ContractDetail, type Perf } from "../_components/contract-tabs";
import { PRICING_BASIS, contractStatusLabel, contractStatusTone, expiry } from "../_lib/constants";

export async function generateMetadata({ params }: PageProps<"/contracts/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: "Contract" };
  const supabase = await createClient();
  const { data } = await supabase.from("contracts").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ?? "Contract" };
}

const EMPTY_PERF: Perf = { jobs_total: 0, jobs_open: 0, jobs_completed: 0, jobs_overdue: 0, on_time_pct: null, first_time_fix_pct: null, avg_satisfaction: null, revenue: 0, cost: 0, margin: 0, cost_last_12m: 0, properties: 0 };

export default async function ContractPage({ params, searchParams }: PageProps<"/contracts/[id]">) {
  const ctx = await requireInternal("contracts.read");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("contracts")
    .select(
      "id, reference, organisation_id, title, client_reference, contract_type, scope_of_work, status, value, annual_budget, start_date, end_date, renewal_date, notice_period_days, payment_terms_days, retention_percent, pricing_basis, auto_renew, notes, created_at, org:organisations(name), manager:profiles!contracts_contract_manager_id_fkey(full_name, email), contact:contacts(first_name, last_name, job_title, email, phone, mobile)",
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!row) notFound();
  const c: ContractDetail = { ...row, value: Number(row.value), annual_budget: row.annual_budget === null ? null : Number(row.annual_budget), retention_percent: Number(row.retention_percent) };

  const head = { count: "exact" as const, head: true };
  const [lookups, perfRes, variations, slas, kpis, links, jobs, docs, alertsRes] = await Promise.all([
    getLookups(ctx.tenantId),
    supabase.from("v_contract_performance").select("*").eq("contract_id", id).maybeSingle(),
    supabase.from("contract_variations").select("value, status").eq("tenant_id", ctx.tenantId).eq("contract_id", id),
    supabase.from("contract_slas").select("id", head).eq("tenant_id", ctx.tenantId).eq("contract_id", id),
    supabase.from("contract_kpis").select("id", head).eq("tenant_id", ctx.tenantId).eq("contract_id", id),
    supabase.from("contract_properties").select("property_id", head).eq("tenant_id", ctx.tenantId).eq("contract_id", id),
    ctx.can("work_orders.read") ? supabase.from("work_orders").select("id", head).eq("tenant_id", ctx.tenantId).eq("contract_id", id) : Promise.resolve({ count: 0 }),
    ctx.can("documents.read") ? supabase.from("documents").select("id", head).eq("tenant_id", ctx.tenantId).eq("contract_id", id) : Promise.resolve({ count: 0 }),
    supabase.rpc("management_alerts", { p_tenant: ctx.tenantId }),
  ]);
  const p = perfRes.data;
  const perf: Perf = p
    ? {
        jobs_total: p.jobs_total ?? 0,
        jobs_open: p.jobs_open ?? 0,
        jobs_completed: p.jobs_completed ?? 0,
        jobs_overdue: p.jobs_overdue ?? 0,
        on_time_pct: p.on_time_pct === null ? null : Number(p.on_time_pct),
        first_time_fix_pct: p.first_time_fix_pct === null ? null : Number(p.first_time_fix_pct),
        avg_satisfaction: p.avg_satisfaction === null ? null : Number(p.avg_satisfaction),
        revenue: Number(p.revenue ?? 0),
        cost: Number(p.cost ?? 0),
        margin: Number(p.margin ?? 0),
        cost_last_12m: Number(p.cost_last_12m ?? 0),
        properties: p.properties ?? 0,
      }
    : EMPTY_PERF;
  const vs = variations.data ?? [];
  const approved = vs.filter((v) => v.status === "approved").reduce((a, v) => a + Number(v.value), 0);
  const proposed = vs.filter((v) => v.status === "proposed");
  const alerts: Alert[] = (alertsRes.data ?? []).filter((a) => a.link === `/contracts/${id}`);

  const base = `/contracts/${id}`;
  const tabs = [
    { key: "overview", label: "Overview", href: base },
    { key: "slas", label: "SLAs", href: `${base}?tab=slas`, count: slas.count ?? 0 },
    { key: "kpis", label: "KPIs", href: `${base}?tab=kpis`, count: kpis.count ?? 0 },
    { key: "variations", label: "Variations", href: `${base}?tab=variations`, count: vs.length },
    { key: "properties", label: "Properties", href: `${base}?tab=properties`, count: links.count ?? 0 },
    ctx.can("work_orders.read") && { key: "jobs", label: "Jobs", href: `${base}?tab=jobs`, count: jobs.count ?? 0 },
    ctx.can("documents.read") && { key: "documents", label: "Documents", href: `${base}?tab=documents`, count: docs.count ?? 0 },
    { key: "alerts", label: "Alerts", href: `${base}?tab=alerts`, count: alerts.length },
  ].filter((t): t is { key: string; label: string; href: string; count: number } => Boolean(t));
  const tab = tabs.some((t) => t.key === sp.tab) ? (sp.tab as string) : "overview";

  // expiry / renewal callout
  const e = expiry(c.end_date, c.status);
  const live = c.status === "active" || c.status === "on_hold";
  const renewalIn = daysUntil(c.renewal_date);
  const noticeBy = c.end_date && c.notice_period_days !== null ? shift(c.end_date, -c.notice_period_days) : null;
  const noticeIn = daysUntil(noticeBy);
  let callout: { tone: "bad" | "warn" | "info"; title: string; body: string } | null = null;
  if (live && e.days !== null && e.days < 0) {
    callout = { tone: "bad", title: `This contract ended ${date(c.end_date)}`, body: "It is still marked active. Record the extension or change the status to completed or expired." };
  } else if (live && e.days !== null && e.days <= 90) {
    callout = {
      tone: e.days <= 30 ? "bad" : "warn",
      title: `Ends in ${e.days} day${e.days === 1 ? "" : "s"} (${date(c.end_date)})`,
      body: [
        c.auto_renew ? "Set to renew automatically unless notice is given." : "Agree an extension or plan the re-tender now.",
        noticeBy && noticeIn !== null ? (noticeIn < 0 ? `The ${c.notice_period_days}-day notice date (${date(noticeBy)}) has passed.` : `Notice must be given by ${date(noticeBy)}.`) : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
  } else if (live && renewalIn !== null && renewalIn >= 0 && renewalIn <= 45) {
    callout = { tone: "info", title: `Renewal decision due ${date(c.renewal_date)} (${renewalIn} days)`, body: c.auto_renew ? "The contract renews automatically unless notice is given." : "Prepare the performance pack and pricing for the extension discussion." };
  }

  return (
    <>
      <Link href="/contracts" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ChevronLeft className="size-3.5" aria-hidden />
        Contracts
      </Link>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-x-2">
            <Mono className="text-xs">{c.reference}</Mono>
            <span aria-hidden>·</span>
            {lookups.label("contract_type", c.contract_type)}
          </span>
        }
        title={c.title}
        actions={
          <>
            {ctx.can("work_orders.write") && c.status === "active" && (
              <ButtonLink href={`/jobs/new?org=${c.organisation_id}&contract=${c.id}`} variant="ghost">
                <Plus className="size-4" aria-hidden />
                New job
              </ButtonLink>
            )}
            {ctx.can("contracts.write") && (
              <ButtonLink href={`/contracts/${c.id}/edit`} variant="secondary">
                <Pencil className="size-4" aria-hidden />
                Edit
              </ButtonLink>
            )}
          </>
        }
      >
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted">
          <Badge tone={contractStatusTone[c.status] ?? "neutral"} dot>
            {contractStatusLabel(c.status)}
          </Badge>
          <Link href={`/crm/${c.organisation_id}`} className="inline-flex items-center gap-1.5 text-accent-hi hover:underline">
            <Building2 className="size-3.5" aria-hidden />
            {c.org?.name}
          </Link>
          {c.client_reference && <span>Client ref {c.client_reference}</span>}
          {c.manager && (
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-3.5 text-subtle" aria-hidden />
              {c.manager.full_name}
            </span>
          )}
        </div>
      </PageHeader>

      {callout && (
        <div className="mb-5">
          <Notice tone={callout.tone} title={callout.title}>
            {callout.body}
          </Notice>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Contract value" value={money(c.value, { whole: true })} hint={PRICING_BASIS.find((x) => x.value === c.pricing_basis)?.label} />
        <Stat
          label="Adjusted value"
          value={money(c.value + approved, { whole: true })}
          hint={`${approved >= 0 ? "+" : ""}${money(approved, { whole: true })} approved variations${proposed.length ? ` · ${proposed.length} pending` : ""}`}
          href={`${base}?tab=variations`}
          tone={proposed.length ? "warn" : "accent"}
        />
        <Stat label="Term" value={live && e.days !== null && e.days >= 0 ? `${count(e.days)} days left` : e.text} hint={c.end_date ? `Ends ${date(c.end_date)}` : `Started ${date(c.start_date)}`} tone={live ? e.tone : "neutral"} />
        <Stat label="Open jobs" value={count(perf.jobs_open)} hint={perf.jobs_overdue ? `${perf.jobs_overdue} overdue` : "None overdue"} href={ctx.can("work_orders.read") ? `${base}?tab=jobs` : undefined} tone={perf.jobs_overdue ? "bad" : "info"} />
      </div>

      <div className="mb-6">
        <LinkTabs tabs={tabs} current={tab} />
      </div>

      {tab === "overview" && <OverviewTab ctx={ctx} c={c} perf={perf} />}
      {tab === "slas" && <SlasTab ctx={ctx} contractId={c.id} />}
      {tab === "kpis" && <KpisTab ctx={ctx} contractId={c.id} perf={perf} />}
      {tab === "variations" && <VariationsTab ctx={ctx} c={c} />}
      {tab === "properties" && <PropertiesTab ctx={ctx} c={c} />}
      {tab === "jobs" && <JobsTab ctx={ctx} c={c} />}
      {tab === "documents" && <DocumentsTab ctx={ctx} contractId={c.id} />}
      {tab === "alerts" && <AlertsTab alerts={alerts} />}
    </>
  );
}

function shift(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
