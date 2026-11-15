import Link from "next/link";
import { AlertTriangle, BellRing, ClipboardList, Info, Mail, Phone, Plus } from "lucide-react";
import type { TenantContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups, getStatuses } from "@/lib/data/lookups";
import { Badge, ButtonLink, Card, CardBody, CardHeader, ColourBadge, DefinitionList, EmptyState, Mono, Notice, priorityTone, Stat, Table, TD, TH, THead, TR, cx } from "@/components/ui/primitives";
import { Meter } from "@/components/ui/charts";
import { count, date, dateTime, label, money, pct } from "@/lib/format";
import { fileSize, fullName } from "../../crm/_lib/shared";
import { AUTO_METRICS, PRICING_BASIS } from "../_lib/constants";
import { Documents } from "./documents";
import { KpiEditor, type KpiRow } from "./kpi-editor";
import { PropertyLinker } from "./property-linker";
import { SlaEditor, type Sla } from "./sla-editor";
import { Variations } from "./variations";

export type Perf = {
  jobs_total: number;
  jobs_open: number;
  jobs_completed: number;
  jobs_overdue: number;
  on_time_pct: number | null;
  first_time_fix_pct: number | null;
  avg_satisfaction: number | null;
  revenue: number;
  cost: number;
  margin: number;
  cost_last_12m: number;
  properties: number;
};

export type ContractDetail = {
  id: string;
  reference: string;
  organisation_id: string;
  title: string;
  client_reference: string | null;
  contract_type: string;
  scope_of_work: string | null;
  status: string;
  value: number;
  annual_budget: number | null;
  start_date: string | null;
  end_date: string | null;
  renewal_date: string | null;
  notice_period_days: number | null;
  payment_terms_days: number;
  retention_percent: number;
  pricing_basis: string;
  auto_renew: boolean;
  notes: string | null;
  created_at: string;
  org: { name: string } | null;
  manager: { full_name: string; email: string } | null;
  contact: { first_name: string; last_name: string; job_title: string | null; email: string | null; phone: string | null; mobile: string | null } | null;
};

/* ================================================================== overview */
export async function OverviewTab({ ctx, c, perf }: { ctx: TenantContext; c: ContractDetail; perf: Perf }) {
  const lookups = await getLookups(ctx.tenantId);
  const canFinance = ctx.can("finance.read");
  const budget = c.annual_budget ? Number(c.annual_budget) : null;
  const used = budget ? perf.cost_last_12m / budget : null;
  const marginPct = perf.revenue > 0 ? (100 * perf.margin) / perf.revenue : null;
  const ct = c.contact;
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader title="Performance" description="Live from the jobs raised under this contract." />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Jobs (all time)" value={count(perf.jobs_total)} href={`/contracts/${c.id}?tab=jobs`} />
            <Stat label="Open jobs" value={count(perf.jobs_open)} href={`/jobs?contract=${c.id}`} tone="info" />
            <Stat label="Overdue jobs" value={count(perf.jobs_overdue)} href={`/jobs?contract=${c.id}&due=overdue`} tone={perf.jobs_overdue ? "bad" : "ok"} />
            <Stat label="Completed" value={count(perf.jobs_completed)} tone="ok" />
            <Stat label="On-time completion" value={pct(perf.on_time_pct)} tone={perf.on_time_pct === null ? "neutral" : perf.on_time_pct >= 95 ? "ok" : perf.on_time_pct >= 85 ? "warn" : "bad"} href={`/contracts/${c.id}?tab=kpis`} />
            <Stat label="First-time fix" value={pct(perf.first_time_fix_pct)} tone={perf.first_time_fix_pct === null ? "neutral" : perf.first_time_fix_pct >= 85 ? "ok" : "warn"} href={`/contracts/${c.id}?tab=kpis`} />
            <Stat label="Satisfaction" value={perf.avg_satisfaction === null ? "-" : `${Number(perf.avg_satisfaction).toFixed(1)}/5`} tone={perf.avg_satisfaction === null ? "neutral" : perf.avg_satisfaction >= 4.5 ? "ok" : perf.avg_satisfaction >= 4 ? "warn" : "bad"} />
            <Stat label="Properties covered" value={count(perf.properties)} href={`/contracts/${c.id}?tab=properties`} />
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Terms" />
          <CardBody>
            <DefinitionList
              columns={3}
              items={[
                { label: "Contract type", value: lookups.label("contract_type", c.contract_type) },
                { label: "Pricing basis", value: PRICING_BASIS.find((p) => p.value === c.pricing_basis)?.label ?? label(c.pricing_basis) },
                { label: "Client's reference", value: c.client_reference },
                { label: "Contract value", value: money(c.value) },
                { label: "Annual budget", value: budget === null ? "Not set" : money(budget) },
                { label: "Retention", value: `${Number(c.retention_percent)}%` },
                { label: "Start date", value: date(c.start_date) },
                { label: "End date", value: date(c.end_date) },
                { label: "Renewal decision", value: date(c.renewal_date) },
                { label: "Notice period", value: c.notice_period_days === null ? "Not set" : `${c.notice_period_days} days` },
                { label: "Payment terms", value: `${c.payment_terms_days} days` },
                { label: "Auto-renews", value: c.auto_renew ? "Yes" : "No" },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="People" />
          <CardBody>
            <DefinitionList
              columns={1}
              items={[
                { label: "Contract manager", value: c.manager?.full_name ?? <span className="text-subtle">Not assigned</span> },
                {
                  label: "Client contact",
                  value: ct ? (
                    <div className="space-y-0.5">
                      <div>
                        {fullName(ct)}
                        {ct.job_title && <span className="text-muted"> · {ct.job_title}</span>}
                      </div>
                      {ct.email && (
                        <a href={`mailto:${ct.email}`} className="flex items-center gap-1.5 text-[13px] text-accent-hi hover:underline">
                          <Mail className="size-3.5" aria-hidden />
                          {ct.email}
                        </a>
                      )}
                      {(ct.phone || ct.mobile) && (
                        <a href={`tel:${(ct.phone || ct.mobile)!.replace(/\s/g, "")}`} className="flex items-center gap-1.5 text-[13px] hover:text-accent-hi">
                          <Phone className="size-3.5" aria-hidden />
                          {ct.phone || ct.mobile}
                        </a>
                      )}
                    </div>
                  ) : (
                    <span className="text-subtle">Not set</span>
                  ),
                },
                { label: "Client", value: <Link href={`/crm/${c.organisation_id}`} className="text-accent-hi hover:underline">{c.org?.name}</Link> },
                { label: "Recorded", value: date(c.created_at) },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      {canFinance && (
        <Card>
          <CardHeader title="Financials" description="Invoiced revenue (net of VAT) and recorded costs on this contract." />
          <CardBody>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Revenue" value={money(perf.revenue, { whole: true })} tone="accent" />
              <Stat label="Cost" value={money(perf.cost, { whole: true })} />
              <Stat label="Margin" value={money(perf.margin, { whole: true })} hint={marginPct === null ? "No revenue yet" : `${marginPct.toFixed(1)}% of revenue`} tone={perf.margin < 0 ? "bad" : marginPct !== null && marginPct < 10 ? "warn" : "ok"} />
              <Stat label="Cost, last 12 months" value={money(perf.cost_last_12m, { whole: true })} hint={budget ? `of ${money(budget, { whole: true })} annual budget` : "No annual budget set"} tone={used === null ? "neutral" : used > 1 ? "bad" : used >= 0.9 ? "warn" : "ok"} />
            </div>
            {budget !== null && (
              <div className="mt-5 max-w-xl">
                <Meter value={perf.cost_last_12m} max={budget} label="Annual budget used (rolling 12 months)" tone={used! > 1 ? "bad" : used! >= 0.9 ? "warn" : used! >= 0.75 ? "accent" : "ok"} />
                {used! > 1 && <p className="mt-2 text-xs text-[#ff8a87]">Over budget by {money(perf.cost_last_12m - budget, { whole: true })}.</p>}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Scope of work" />
          <CardBody>{c.scope_of_work ? <p className="text-sm leading-relaxed whitespace-pre-line text-fg">{c.scope_of_work}</p> : <p className="text-sm text-subtle">No scope recorded.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Notes" />
          <CardBody>{c.notes ? <p className="text-sm leading-relaxed whitespace-pre-line text-fg">{c.notes}</p> : <p className="text-sm text-subtle">No notes.</p>}</CardBody>
        </Card>
      </div>
    </div>
  );
}

/* ================================================================== SLAs */
export async function SlasTab({ ctx, contractId }: { ctx: TenantContext; contractId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("contract_slas").select("priority, response_hours, attend_hours, complete_hours, description").eq("tenant_id", ctx.tenantId).eq("contract_id", contractId);
  const slas: Sla[] = (data ?? []).map((s) => ({ ...s, response_hours: s.response_hours === null ? null : Number(s.response_hours), attend_hours: s.attend_hours === null ? null : Number(s.attend_hours), complete_hours: s.complete_hours === null ? null : Number(s.complete_hours) }));
  return (
    <Card>
      <CardHeader title="Service levels" description="Target times by job priority, in hours from when a job is reported. New jobs on this contract take their targets from here." />
      <SlaEditor contractId={contractId} slas={slas} canWrite={ctx.can("contracts.write")} />
    </Card>
  );
}

/* ================================================================== KPIs */
export async function KpisTab({ ctx, contractId, perf }: { ctx: TenantContext; contractId: string; perf: Perf }) {
  const supabase = await createClient();
  const { data } = await supabase.from("contract_kpis").select("id, name, metric_key, target_value, unit, direction, manual_value").eq("tenant_id", ctx.tenantId).eq("contract_id", contractId).order("created_at");
  const live: Record<string, number | null> = {
    on_time_completion: perf.on_time_pct,
    first_time_fix: perf.first_time_fix_pct,
    customer_satisfaction: perf.avg_satisfaction === null ? null : Number(perf.avg_satisfaction),
    jobs_completed: perf.jobs_completed,
  };
  const kpis: KpiRow[] = (data ?? []).map((k) => {
    const auto = AUTO_METRICS.includes(k.metric_key);
    return { ...k, target_value: Number(k.target_value), manual_value: k.manual_value === null ? null : Number(k.manual_value), auto, actual: auto ? (live[k.metric_key] ?? null) : k.manual_value === null ? null : Number(k.manual_value) };
  });
  const measured = kpis.filter((k) => k.actual !== null);
  const met = measured.filter((k) => (k.direction === "lower_better" ? k.actual! <= k.target_value : k.actual! >= k.target_value)).length;
  return (
    <Card>
      <KpiEditor
        contractId={contractId}
        kpis={kpis}
        canWrite={ctx.can("contracts.write")}
        description={measured.length ? `${met} of ${measured.length} measured KPIs met. On-time, first-time fix, satisfaction and jobs completed are calculated from completed jobs.` : "On-time, first-time fix, satisfaction and jobs completed are calculated from completed jobs; others are entered by hand."}
      />
    </Card>
  );
}

/* ================================================================== variations */
export async function VariationsTab({ ctx, c }: { ctx: TenantContext; c: ContractDetail }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contract_variations")
    .select("id, reference, title, description, value, status, created_at, approved_at, updated_at, author:profiles!contract_variations_created_by_fkey(full_name), approver:profiles!contract_variations_approved_by_fkey(full_name)")
    .eq("tenant_id", ctx.tenantId)
    .eq("contract_id", c.id)
    .order("created_at", { ascending: false });
  const rows = (data ?? []).map((v) => ({
    id: v.id,
    reference: v.reference,
    title: v.title,
    description: v.description,
    value: Number(v.value),
    status: v.status,
    raised: date(v.created_at),
    raisedBy: v.author?.full_name ?? null,
    decided: v.status === "approved" ? date(v.approved_at) : v.status === "proposed" ? null : date(v.updated_at),
    decidedBy: v.status === "approved" ? (v.approver?.full_name ?? null) : null,
  }));
  const approved = rows.filter((r) => r.status === "approved").reduce((a, r) => a + r.value, 0);
  const pending = rows.filter((r) => r.status === "proposed");
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Original value" value={money(c.value, { whole: true })} />
        <Stat label="Approved variations" value={`${approved > 0 ? "+" : ""}${money(approved, { whole: true })}`} tone={approved < 0 ? "warn" : "ok"} hint={`${rows.filter((r) => r.status === "approved").length} approved`} />
        <Stat label="Adjusted contract value" value={money(Number(c.value) + approved, { whole: true })} tone="accent" />
        <Stat label="Awaiting approval" value={money(pending.reduce((a, r) => a + r.value, 0), { whole: true })} hint={`${pending.length} proposed`} tone={pending.length ? "warn" : "neutral"} />
      </div>
      <Card>
        <Variations contractId={c.id} rows={rows} canWrite={ctx.can("contracts.write")} canApprove={ctx.can("contracts.approve")} />
      </Card>
    </div>
  );
}

/* ================================================================== properties */
export async function PropertiesTab({ ctx, c }: { ctx: TenantContext; c: ContractDetail }) {
  if (!ctx.can("properties.read")) return <Notice tone="neutral">You need access to properties to see the properties on this contract.</Notice>;
  const supabase = await createClient();
  const [{ data, count: total }, lookups, clientProps] = await Promise.all([
    supabase
      .from("contract_properties")
      .select("added_at, property:properties!inner(id, reference, address_line1, address_line2, town, postcode, property_type, status)", { count: "exact" })
      .eq("tenant_id", ctx.tenantId)
      .eq("contract_id", c.id)
      .order("added_at", { ascending: false })
      .limit(200),
    getLookups(ctx.tenantId),
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("organisation_id", c.organisation_id).is("archived_at", null),
  ]);
  const linked = (data ?? []).map((r) => ({
    id: r.property.id,
    reference: r.property.reference,
    address: [r.property.address_line1, r.property.address_line2, r.property.town].filter(Boolean).join(", "),
    postcode: r.property.postcode,
    type: lookups.label("property_type", r.property.property_type),
    status: r.property.status,
    added: date(r.added_at),
  }));
  const linkedTotal = total ?? 0;
  // properties of this client already linked (client properties can only be linked once per contract)
  const { count: linkedOfClient } = await supabase
    .from("contract_properties")
    .select("property_id, property:properties!inner(organisation_id)", { count: "exact", head: true })
    .eq("contract_id", c.id)
    .eq("property.organisation_id", c.organisation_id);
  const unlinked = Math.max(0, (clientProps.count ?? 0) - (linkedOfClient ?? 0));
  return (
    <Card>
      <CardHeader
        title={`${count(linkedTotal)} properties on this contract`}
        description={`${c.org?.name ?? "The client"} has ${count(clientProps.count ?? 0)} properties; ${count(unlinked)} are not on this contract.`}
        actions={<ButtonLink href={`/properties?org=${c.organisation_id}`} size="sm" variant="ghost">Client properties</ButtonLink>}
      />
      <PropertyLinker contractId={c.id} linked={linked} linkedTotal={linkedTotal} unlinkedCount={unlinked} canWrite={ctx.can("contracts.write")} />
    </Card>
  );
}

/* ================================================================== jobs */
export async function JobsTab({ ctx, c }: { ctx: TenantContext; c: ContractDetail }) {
  const supabase = await createClient();
  const [{ data, count: total }, statuses] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, reference, title, priority, status, reported_at, target_completion_at, property:properties(address_line1, postcode)", { count: "exact" })
      .eq("tenant_id", ctx.tenantId)
      .eq("contract_id", c.id)
      .order("reported_at", { ascending: false })
      .limit(50),
    getStatuses(ctx.tenantId),
  ]);
  const now = new Date().toISOString();
  return (
    <Card>
      <CardHeader
        title="Jobs on this contract"
        description={`Latest ${Math.min(50, total ?? 0)} of ${count(total ?? 0)}`}
        actions={
          <>
            <ButtonLink href={`/jobs?contract=${c.id}`} size="sm" variant="ghost">All jobs</ButtonLink>
            {ctx.can("work_orders.write") && c.status === "active" && (
              <ButtonLink href={`/jobs/new?org=${c.organisation_id}&contract=${c.id}`} size="sm" variant="primary">
                <Plus className="size-4" aria-hidden />
                New job
              </ButtonLink>
            )}
          </>
        }
      />
      {data?.length ? (
        <Table>
          <THead><tr><TH>Job</TH><TH>Property</TH><TH>Priority</TH><TH>Status</TH><TH>Reported</TH><TH>Target</TH></tr></THead>
          <tbody>
            {data.map((j) => {
              const s = statuses.get(j.status);
              const late = s.counts_as_open && j.target_completion_at && j.target_completion_at < now;
              return (
                <TR key={j.id}>
                  <TD>
                    <Link href={`/jobs/${j.id}`} className="font-medium hover:text-accent-hi">{j.title}</Link>
                    <div><Mono className="text-[11.5px]">{j.reference}</Mono></div>
                  </TD>
                  <TD className="text-[13px]">{j.property ? <>{j.property.address_line1}<div className="text-xs text-subtle">{j.property.postcode}</div></> : "-"}</TD>
                  <TD><Badge tone={priorityTone[j.priority] ?? "neutral"}>{label(j.priority)}</Badge></TD>
                  <TD><ColourBadge colour={s.colour}>{s.label}</ColourBadge></TD>
                  <TD className="whitespace-nowrap text-[13px] text-muted">{date(j.reported_at)}</TD>
                  <TD className={cx("whitespace-nowrap text-[13px]", late ? "font-medium text-[#ff8a87]" : "text-muted")}>{date(j.target_completion_at)}{late && " · overdue"}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<ClipboardList className="size-8" />} title="No jobs on this contract yet" />
      )}
    </Card>
  );
}

/* ================================================================== documents */
export async function DocumentsTab({ ctx, contractId }: { ctx: TenantContext; contractId: string }) {
  if (!ctx.can("documents.read")) return <Notice tone="neutral">You need access to documents to see this contract&apos;s files.</Notice>;
  const supabase = await createClient();
  const [{ data }, lookups] = await Promise.all([
    supabase
      .from("documents")
      .select("id, name, category, size_bytes, mime_type, created_at, author:profiles!documents_created_by_fkey(full_name)")
      .eq("tenant_id", ctx.tenantId)
      .eq("contract_id", contractId)
      .order("created_at", { ascending: false })
      .limit(200),
    getLookups(ctx.tenantId),
  ]);
  const docs = (data ?? []).map((d) => ({ id: d.id, name: d.name, category: lookups.label("document_category", d.category), size: fileSize(d.size_bytes), uploaded: dateTime(d.created_at), by: d.author?.full_name ?? null, mime: d.mime_type }));
  return (
    <Card>
      <CardHeader title="Documents" description="Contract documents, schedules, specifications and correspondence." />
      <Documents contractId={contractId} docs={docs} categories={lookups.options("document_category")} canWrite={ctx.can("documents.write")} canDelete={ctx.can("documents.delete")} />
    </Card>
  );
}

/* ================================================================== alerts */
export type Alert = { severity: string; kind: string; title: string; detail: string; link: string; due: string | null };

export function AlertsTab({ alerts }: { alerts: Alert[] }) {
  const tone = { critical: "bad", warning: "warn", info: "info" } as const;
  return (
    <Card>
      <CardHeader title="Alerts" description="Renewals, budget, performance and approvals that need attention on this contract." />
      {alerts.length ? (
        <ul className="divide-y divide-line/70">
          {alerts.map((a, i) => (
            <li key={i} className="flex items-start gap-3 px-5 py-3.5">
              <span className={cx("mt-0.5", a.severity === "critical" ? "text-[#ff8a87]" : a.severity === "warning" ? "text-[#ffc56b]" : "text-[#8cc8ff]")} aria-hidden>
                {a.severity === "info" ? <Info className="size-4" /> : <AlertTriangle className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{a.title}</p>
                <p className="text-xs text-muted">{a.detail}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={tone[a.severity as keyof typeof tone] ?? "neutral"}>{label(a.severity)}</Badge>
                {a.due && <span className="text-xs text-subtle">{date(a.due)}</span>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<BellRing className="size-8" />} title="No alerts">
          Nothing on this contract needs attention right now.
        </EmptyState>
      )}
    </Card>
  );
}
