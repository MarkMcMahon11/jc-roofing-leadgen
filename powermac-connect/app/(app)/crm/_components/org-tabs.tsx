import Link from "next/link";
import { ArrowRight, CalendarClock, ClipboardList, FileSignature, Home, Mail, MessageSquare, Phone, Plus, Receipt } from "lucide-react";
import type { TenantContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups, getStatuses } from "@/lib/data/lookups";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  ColourBadge,
  DefinitionList,
  EmptyState,
  Mono,
  Notice,
  priorityTone,
  Stat,
  Table,
  TD,
  TH,
  THead,
  TR,
  cx,
} from "@/components/ui/primitives";
import { count, date, dateTime, label, money, pct, relative, todayISO } from "@/lib/format";
import { contractStatusLabel, contractStatusTone, expiry } from "../../contracts/_lib/constants";
import { getStaffOptions } from "../_lib/data";
import { OPEN_STAGES, activityLabel, fullName, gbpShort, stageLabel, STAGES } from "../_lib/shared";
import { ActionButton } from "./action-button";
import { ActivityComposer } from "./activity-composer";
import { ContactsPanel, type ContactRow } from "./contacts-panel";
import { setActivityDone } from "../actions";

type Org = {
  id: string;
  name: string;
  category: string;
  status: string;
  company_number: string | null;
  vat_number: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  town: string | null;
  postcode: string | null;
  payment_terms_days: number;
  credit_limit: number | null;
  portal_enabled: boolean;
  tags: string[];
  notes: string | null;
  created_at: string;
  account_manager: { full_name: string; email: string } | null;
  contract_manager: { full_name: string; email: string } | null;
};

const INVOICE_OPEN = ["issued", "part_paid", "overdue"];
const quoteTone: Record<string, "neutral" | "info" | "ok" | "bad" | "warn" | "accent"> = { draft: "neutral", internal_review: "info", sent: "accent", approved: "ok", rejected: "bad", expired: "warn", superseded: "neutral" };
const invoiceTone: Record<string, "neutral" | "info" | "ok" | "bad" | "warn" | "accent"> = { draft: "neutral", issued: "info", part_paid: "warn", paid: "ok", overdue: "bad", void: "neutral", credited: "neutral" };

function website(v: string) {
  const href = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-hi hover:underline">
      {v.replace(/^https?:\/\//i, "")}
    </a>
  );
}

/* ================================================================== overview */
export async function OverviewTab({ ctx, org }: { ctx: TenantContext; org: Org }) {
  const supabase = await createClient();
  const [lookups, statuses] = await Promise.all([getLookups(ctx.tenantId), getStatuses(ctx.tenantId)]);
  const openKeys = statuses.list.filter((s) => s.counts_as_open).map((s) => s.key);
  const now = new Date().toISOString();
  const jobsBase = () => supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("organisation_id", org.id);
  const canJobs = ctx.can("work_orders.read");
  const canFinance = ctx.can("finance.read");
  const [primary, perf, jobsTotal, jobsOpen, jobsOverdue, invoices, opps, followUps] = await Promise.all([
    supabase.from("contacts").select("first_name, last_name, job_title, email, phone, mobile").eq("tenant_id", ctx.tenantId).eq("organisation_id", org.id).eq("is_primary", true).is("archived_at", null).maybeSingle(),
    ctx.can("contracts.read")
      ? supabase.from("v_contract_performance").select("jobs_completed, on_time_pct, first_time_fix_pct, avg_satisfaction").eq("tenant_id", ctx.tenantId).eq("organisation_id", org.id)
      : Promise.resolve({ data: [] as { jobs_completed: number | null; on_time_pct: number | null; first_time_fix_pct: number | null; avg_satisfaction: number | null }[] }),
    canJobs ? jobsBase() : Promise.resolve({ count: 0 }),
    canJobs ? jobsBase().in("status", openKeys.length ? openKeys : ["-"]) : Promise.resolve({ count: 0 }),
    canJobs ? jobsBase().in("status", openKeys.length ? openKeys : ["-"]).lt("target_completion_at", now) : Promise.resolve({ count: 0 }),
    canFinance
      ? supabase.from("invoices").select("total, amount_paid, due_date").eq("tenant_id", ctx.tenantId).eq("organisation_id", org.id).in("status", INVOICE_OPEN)
      : Promise.resolve({ data: [] as { total: number; amount_paid: number; due_date: string | null }[] }),
    supabase.from("crm_opportunities").select("id, title, stage, value, probability, expected_close_date").eq("tenant_id", ctx.tenantId).eq("organisation_id", org.id).in("stage", OPEN_STAGES).order("expected_close_date", { nullsFirst: false }).limit(5),
    supabase
      .from("crm_activities")
      .select("id, type, subject, due_at, owner:profiles!crm_activities_owner_id_fkey(full_name)")
      .eq("tenant_id", ctx.tenantId)
      .eq("organisation_id", org.id)
      .is("completed_at", null)
      .not("due_at", "is", null)
      .order("due_at")
      .limit(4),
  ]);

  // performance across this client's contracts, weighted by completed jobs
  const rows = perf.data ?? [];
  const weighted = (key: "on_time_pct" | "first_time_fix_pct" | "avg_satisfaction") => {
    let w = 0, sum = 0;
    for (const r of rows) {
      if (r[key] === null || !r.jobs_completed) continue;
      w += r.jobs_completed;
      sum += Number(r[key]) * r.jobs_completed;
    }
    return w ? sum / w : null;
  };
  const onTime = weighted("on_time_pct");
  const ftf = weighted("first_time_fix_pct");
  const csat = weighted("avg_satisfaction");
  const today = todayISO();
  const openInv = invoices.data ?? [];
  const overdueInv = openInv.filter((i) => i.due_date && i.due_date < today);
  const outstanding = openInv.reduce((a, i) => a + Number(i.total) - Number(i.amount_paid), 0);
  const overdueJobs = jobsOverdue.count ?? 0;
  const issues = overdueJobs + overdueInv.length;
  const p = primary.data;
  const address = [org.address_line1, org.address_line2, org.town, org.postcode].filter(Boolean).join(", ");

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="grid min-w-0 gap-6 xl:col-span-2">
        {canJobs && (
          <Card>
            <CardHeader title="Client performance" description="Live from job records. On-time, first-time fix and satisfaction cover jobs under this client's contracts." />
            <CardBody>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Stat label="Jobs (all time)" value={count(jobsTotal.count ?? 0)} href={`/crm/${org.id}?tab=jobs`} />
                <Stat label="Open jobs" value={count(jobsOpen.count ?? 0)} href={`/jobs?org=${org.id}`} tone="info" />
                <Stat label="Overdue jobs" value={count(overdueJobs)} href={`/jobs?org=${org.id}&due=overdue`} tone={overdueJobs ? "bad" : "ok"} />
                <Stat label="On-time completion" value={pct(onTime)} tone={onTime === null ? "neutral" : onTime >= 95 ? "ok" : onTime >= 85 ? "warn" : "bad"} hint={ftf !== null ? `First-time fix ${pct(ftf)}` : "No completed jobs yet"} />
                <Stat label="Avg satisfaction" value={csat === null ? "-" : `${csat.toFixed(1)}/5`} tone={csat === null ? "neutral" : csat >= 4.5 ? "ok" : csat >= 4 ? "warn" : "bad"} />
                <Stat
                  label="Outstanding issues"
                  value={count(issues)}
                  tone={issues ? "bad" : "ok"}
                  hint={`${overdueJobs} job${overdueJobs === 1 ? "" : "s"}${canFinance ? ` · ${overdueInv.length} invoice${overdueInv.length === 1 ? "" : "s"}` : ""} overdue`}
                  href={canFinance && overdueInv.length ? `/crm/${org.id}?tab=money` : `/jobs?org=${org.id}&due=overdue`}
                />
              </div>
              {canFinance && (
                <p className="mt-4 text-[13px] text-muted">
                  Outstanding balance <span className="font-medium text-fg tabular">{money(outstanding)}</span> across {openInv.length} unpaid invoice{openInv.length === 1 ? "" : "s"}
                  {org.credit_limit !== null && (
                    <>
                      {" "}· credit limit <span className="tabular text-fg">{money(org.credit_limit, { whole: true })}</span>
                      {outstanding > Number(org.credit_limit) && <Badge tone="bad" className="ml-2">Over limit</Badge>}
                    </>
                  )}
                </p>
              )}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Profile" />
          <CardBody>
            <DefinitionList
              items={[
                { label: "Category", value: lookups.label("organisation_category", org.category) },
                { label: "Status", value: label(org.status) },
                { label: "Company number", value: org.company_number },
                { label: "VAT number", value: org.vat_number },
                { label: "Email", value: org.email ? <a href={`mailto:${org.email}`} className="text-accent-hi hover:underline">{org.email}</a> : null },
                { label: "Phone", value: org.phone ? <a href={`tel:${org.phone.replace(/\s/g, "")}`} className="hover:text-accent-hi">{org.phone}</a> : null },
                { label: "Website", value: org.website ? website(org.website) : null },
                { label: "Address", value: address || null },
                { label: "Payment terms", value: `${org.payment_terms_days} days` },
                { label: "Credit limit", value: org.credit_limit === null ? "Not set" : money(org.credit_limit, { whole: true }) },
                { label: "Client portal", value: org.portal_enabled ? "Enabled" : "Not enabled" },
                { label: "Client since", value: date(org.created_at) },
                { label: "Tags", value: org.tags.length ? <span className="flex flex-wrap gap-1">{org.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span> : null },
              ]}
            />
            {org.notes && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="text-xs font-medium text-subtle">Notes</p>
                <p className="mt-1 text-sm whitespace-pre-line text-fg">{org.notes}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid min-w-0 content-start gap-6">
        <Card>
          <CardHeader title="Relationship" />
          <CardBody>
            <DefinitionList
              columns={1}
              items={[
                { label: "Account manager", value: org.account_manager?.full_name ?? <span className="text-subtle">Not assigned</span> },
                { label: "Contract manager", value: org.contract_manager?.full_name ?? <span className="text-subtle">Not assigned</span> },
                {
                  label: "Primary contact",
                  value: p ? (
                    <div className="space-y-0.5">
                      <div>{fullName(p)}{p.job_title && <span className="text-muted"> · {p.job_title}</span>}</div>
                      {p.email && <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-[13px] text-accent-hi hover:underline"><Mail className="size-3.5" aria-hidden />{p.email}</a>}
                      {(p.phone || p.mobile) && <a href={`tel:${(p.phone || p.mobile)!.replace(/\s/g, "")}`} className="flex items-center gap-1.5 text-[13px] hover:text-accent-hi"><Phone className="size-3.5" aria-hidden />{p.phone || p.mobile}</a>}
                    </div>
                  ) : (
                    <Link href={`/crm/${org.id}?tab=contacts`} className="text-accent-hi hover:underline">Set a primary contact</Link>
                  ),
                },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Upcoming follow-ups" actions={<Link href={`/crm/${org.id}?tab=activity`} className="text-xs text-accent-hi hover:underline">Activity</Link>} />
          {followUps.data?.length ? (
            <ul className="divide-y divide-line/70">
              {followUps.data.map((f) => {
                const overdue = f.due_at! < now;
                return (
                  <li key={f.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-fg">{f.subject}</p>
                      <p className={cx("text-xs", overdue ? "text-[#ff8a87]" : "text-subtle")}>
                        {activityLabel(f.type)} · {overdue ? "overdue, " : ""}due {dateTime(f.due_at)}
                        {f.owner?.full_name && ` · ${f.owner.full_name}`}
                      </p>
                    </div>
                    {ctx.can("crm.write") && <ActionButton link action={setActivityDone.bind(null, f.id, true)}>Done</ActionButton>}
                  </li>
                );
              })}
            </ul>
          ) : (
            <CardBody><p className="text-sm text-subtle">Nothing scheduled.</p></CardBody>
          )}
        </Card>

        <Card>
          <CardHeader title="Open opportunities" actions={<Link href="/crm/pipeline" className="text-xs text-accent-hi hover:underline">Pipeline</Link>} />
          {opps.data?.length ? (
            <ul className="divide-y divide-line/70">
              {opps.data.map((o) => (
                <li key={o.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-sm text-fg">{o.title}</p>
                    <span className="shrink-0 text-sm text-fg tabular">{gbpShort(o.value)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-subtle">
                    <Badge tone={STAGES.find((s) => s.key === o.stage)?.tone ?? "neutral"} className="mr-1.5">{stageLabel(o.stage)}</Badge>
                    {o.probability}% · {o.expected_close_date ? `close ${date(o.expected_close_date)}` : "no close date"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <CardBody><p className="text-sm text-subtle">No open opportunities.</p></CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ================================================================== contacts */
export async function ContactsTab({ ctx, orgId }: { ctx: TenantContext; orgId: string }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, job_title, email, phone, mobile, is_primary, is_billing, preferred_channel, notes, archived_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("organisation_id", orgId)
    .order("is_primary", { ascending: false })
    .order("first_name");
  return <ContactsPanel orgId={orgId} contacts={(data ?? []) as ContactRow[]} canWrite={ctx.can("crm.write")} />;
}

/* ================================================================== contracts */
export async function ContractsTab({ ctx, orgId }: { ctx: TenantContext; orgId: string }) {
  const supabase = await createClient();
  const [{ data }, lookups] = await Promise.all([
    supabase.from("contracts").select("id, reference, title, contract_type, status, value, start_date, end_date").eq("tenant_id", ctx.tenantId).eq("organisation_id", orgId).order("start_date", { ascending: false, nullsFirst: false }),
    getLookups(ctx.tenantId),
  ]);
  const active = (data ?? []).filter((c) => c.status === "active");
  return (
    <Card>
      <CardHeader
        title="Contracts"
        description={`${active.length} active · ${money(active.reduce((a, c) => a + Number(c.value), 0), { whole: true })} active value`}
        actions={ctx.can("contracts.write") && <ButtonLink href={`/contracts/new?org=${orgId}`} size="sm" variant="primary"><Plus className="size-4" aria-hidden />New contract</ButtonLink>}
      />
      {data?.length ? (
        <Table>
          <THead><tr><TH>Contract</TH><TH>Type</TH><TH align="right">Value</TH><TH>Start</TH><TH>End</TH><TH>Expires in</TH><TH>Status</TH></tr></THead>
          <tbody>
            {data.map((c) => {
              const e = expiry(c.end_date, c.status);
              return (
                <TR key={c.id}>
                  <TD>
                    <Link href={`/contracts/${c.id}`} className="font-medium hover:text-accent-hi">{c.title}</Link>
                    <div><Mono className="text-[11.5px]">{c.reference}</Mono></div>
                  </TD>
                  <TD className="text-[13px] text-muted">{lookups.label("contract_type", c.contract_type)}</TD>
                  <TD align="right">{money(c.value, { whole: true })}</TD>
                  <TD className="whitespace-nowrap text-[13px]">{date(c.start_date)}</TD>
                  <TD className="whitespace-nowrap text-[13px]">{date(c.end_date)}</TD>
                  <TD>{e.days !== null && c.status === "active" ? <Badge tone={e.tone}>{e.text}</Badge> : <span className="text-xs text-subtle">{c.status === "active" ? e.text : "-"}</span>}</TD>
                  <TD><Badge tone={contractStatusTone[c.status] ?? "neutral"} dot>{contractStatusLabel(c.status)}</Badge></TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<FileSignature className="size-8" />} title="No contracts with this client yet" />
      )}
    </Card>
  );
}

/* ================================================================== properties */
export async function PropertiesTab({ ctx, orgId }: { ctx: TenantContext; orgId: string }) {
  const supabase = await createClient();
  const [{ data, count: total }, lookups] = await Promise.all([
    supabase
      .from("properties")
      .select("id, reference, address_line1, address_line2, town, postcode, property_type, status", { count: "exact" })
      .eq("tenant_id", ctx.tenantId)
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("address_line1")
      .limit(50),
    getLookups(ctx.tenantId),
  ]);
  const tone: Record<string, "ok" | "warn" | "info" | "neutral"> = { occupied: "ok", void: "warn", under_works: "info", inactive: "neutral" };
  return (
    <Card>
      <CardHeader
        title={`${count(total ?? 0)} properties`}
        description={total && total > 50 ? "Showing the first 50 - open the property register for the full list, map and filters." : "Homes and buildings this client owns or manages."}
        actions={<ButtonLink href={`/properties?org=${orgId}`} size="sm">Open in Properties<ArrowRight className="size-3.5" aria-hidden /></ButtonLink>}
      />
      {data?.length ? (
        <Table>
          <THead><tr><TH>Address</TH><TH>Postcode</TH><TH>Type</TH><TH>Status</TH></tr></THead>
          <tbody>
            {data.map((p) => (
              <TR key={p.id}>
                <TD>
                  <Link href={`/properties/${p.id}`} className="font-medium hover:text-accent-hi">{[p.address_line1, p.address_line2].filter(Boolean).join(", ")}</Link>
                  <div className="text-xs text-subtle"><Mono className="text-[11.5px]">{p.reference}</Mono> · {p.town}</div>
                </TD>
                <TD className="whitespace-nowrap text-[13px]">{p.postcode}</TD>
                <TD className="text-[13px] text-muted">{lookups.label("property_type", p.property_type)}</TD>
                <TD><Badge tone={tone[p.status] ?? "neutral"} dot>{label(p.status)}</Badge></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<Home className="size-8" />} title="No properties recorded for this client" />
      )}
    </Card>
  );
}

/* ================================================================== jobs */
export async function JobsTab({ ctx, orgId }: { ctx: TenantContext; orgId: string }) {
  const supabase = await createClient();
  const [{ data, count: total }, statuses] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, reference, title, priority, status, reported_at, target_completion_at, property:properties(address_line1, postcode)", { count: "exact" })
      .eq("tenant_id", ctx.tenantId)
      .eq("organisation_id", orgId)
      .order("reported_at", { ascending: false })
      .limit(25),
    getStatuses(ctx.tenantId),
  ]);
  const now = new Date().toISOString();
  return (
    <Card>
      <CardHeader
        title="Recent jobs"
        description={`Latest ${Math.min(25, total ?? 0)} of ${count(total ?? 0)}`}
        actions={
          <>
            <ButtonLink href={`/jobs?org=${orgId}`} size="sm" variant="ghost">All jobs</ButtonLink>
            {ctx.can("work_orders.write") && <ButtonLink href={`/jobs/new?org=${orgId}`} size="sm" variant="primary"><Plus className="size-4" aria-hidden />New job</ButtonLink>}
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
        <EmptyState icon={<ClipboardList className="size-8" />} title="No jobs for this client yet" />
      )}
    </Card>
  );
}

/* ================================================================== quotes & invoices */
export async function MoneyTab({ ctx, orgId }: { ctx: TenantContext; orgId: string }) {
  const supabase = await createClient();
  const canQuotes = ctx.can("quotes.read");
  const canFinance = ctx.can("finance.read");
  const [quotes, invoices] = await Promise.all([
    canQuotes
      ? supabase.from("quotations").select("id, reference, title, status, total, valid_until, created_at").eq("tenant_id", ctx.tenantId).eq("organisation_id", orgId).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: null }),
    canFinance
      ? supabase.from("invoices").select("id, reference, status, issue_date, due_date, total, amount_paid").eq("tenant_id", ctx.tenantId).eq("organisation_id", orgId).order("issue_date", { ascending: false, nullsFirst: true }).limit(50)
      : Promise.resolve({ data: null }),
  ]);
  const today = todayISO();
  const inv = invoices.data ?? [];
  const open = inv.filter((i) => INVOICE_OPEN.includes(i.status));
  const outstanding = open.reduce((a, i) => a + Number(i.total) - Number(i.amount_paid), 0);
  const overdue = open.filter((i) => i.due_date && i.due_date < today);
  return (
    <div className="grid gap-6">
      {canFinance && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label="Outstanding" value={money(outstanding, { whole: true })} tone="info" hint={`${open.length} unpaid invoice${open.length === 1 ? "" : "s"}`} />
          <Stat label="Overdue" value={money(overdue.reduce((a, i) => a + Number(i.total) - Number(i.amount_paid), 0), { whole: true })} tone={overdue.length ? "bad" : "ok"} hint={`${overdue.length} past due date`} />
          <Stat label="Invoiced (shown)" value={money(inv.filter((i) => !["draft", "void", "credited"].includes(i.status)).reduce((a, i) => a + Number(i.total), 0), { whole: true })} hint="Latest 50 invoices, incl. VAT" />
        </div>
      )}
      {canQuotes && (
        <Card>
          <CardHeader title="Quotations" description="Latest 50" />
          {quotes.data?.length ? (
            <Table>
              <THead><tr><TH>Quotation</TH><TH>Status</TH><TH align="right">Total</TH><TH>Valid until</TH><TH>Created</TH></tr></THead>
              <tbody>
                {quotes.data.map((q) => (
                  <TR key={q.id}>
                    <TD><div className="font-medium">{q.title}</div><Mono className="text-[11.5px]">{q.reference}</Mono></TD>
                    <TD><Badge tone={quoteTone[q.status] ?? "neutral"}>{label(q.status)}</Badge></TD>
                    <TD align="right">{money(q.total)}</TD>
                    <TD className="whitespace-nowrap text-[13px] text-muted">{date(q.valid_until)}</TD>
                    <TD className="whitespace-nowrap text-[13px] text-muted">{date(q.created_at)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<Receipt className="size-8" />} title="No quotations for this client" />
          )}
        </Card>
      )}
      {canFinance && (
        <Card>
          <CardHeader title="Invoices" description="Latest 50" />
          {inv.length ? (
            <Table>
              <THead><tr><TH>Invoice</TH><TH>Status</TH><TH>Issued</TH><TH>Due</TH><TH align="right">Total</TH><TH align="right">Outstanding</TH></tr></THead>
              <tbody>
                {inv.map((i) => {
                  const late = INVOICE_OPEN.includes(i.status) && i.due_date && i.due_date < today;
                  const owed = Number(i.total) - Number(i.amount_paid);
                  return (
                    <TR key={i.id}>
                      <TD><Mono>{i.reference}</Mono></TD>
                      <TD><Badge tone={late ? "bad" : (invoiceTone[i.status] ?? "neutral")}>{late && i.status !== "overdue" ? "Overdue" : label(i.status)}</Badge></TD>
                      <TD className="whitespace-nowrap text-[13px] text-muted">{date(i.issue_date)}</TD>
                      <TD className={cx("whitespace-nowrap text-[13px]", late ? "text-[#ff8a87]" : "text-muted")}>{date(i.due_date)}</TD>
                      <TD align="right">{money(i.total)}</TD>
                      <TD align="right" className={owed > 0 && INVOICE_OPEN.includes(i.status) ? "" : "text-subtle"}>{INVOICE_OPEN.includes(i.status) ? money(owed) : "-"}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <EmptyState icon={<Receipt className="size-8" />} title="No invoices for this client" />
          )}
        </Card>
      )}
    </div>
  );
}

/* ================================================================== activity */
type TimelineItem =
  | { kind: "activity"; at: string; id: string; type: string; subject: string; body: string | null; due_at: string | null; completed_at: string | null; who: string | null; contact: string | null }
  | { kind: "comm"; at: string; id: string; channel: string; direction: string; subject: string | null; body: string | null; status: string; who: string | null; contact: string | null };

export async function ActivityTab({ ctx, orgId }: { ctx: TenantContext; orgId: string }) {
  const supabase = await createClient();
  const canComms = ctx.can("communications.read");
  const [acts, comms, contacts, opps, staff] = await Promise.all([
    supabase
      .from("crm_activities")
      .select("id, type, subject, body, due_at, completed_at, created_at, owner:profiles!crm_activities_owner_id_fkey(full_name), contact:contacts(first_name, last_name)")
      .eq("tenant_id", ctx.tenantId)
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100),
    canComms
      ? supabase
          .from("communications")
          .select("id, channel, direction, subject, body, status, sent_at, created_at, author:profiles!communications_created_by_fkey(full_name), contact:contacts(first_name, last_name)")
          .eq("tenant_id", ctx.tenantId)
          .eq("organisation_id", orgId)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: null }),
    supabase.from("contacts").select("id, first_name, last_name").eq("tenant_id", ctx.tenantId).eq("organisation_id", orgId).is("archived_at", null).order("first_name"),
    supabase.from("crm_opportunities").select("id, title").eq("tenant_id", ctx.tenantId).eq("organisation_id", orgId).in("stage", OPEN_STAGES).order("title"),
    ctx.can("crm.write") ? getStaffOptions(ctx) : Promise.resolve([]),
  ]);
  const now = new Date().toISOString();
  const open = (acts.data ?? []).filter((a) => a.due_at && !a.completed_at).sort((a, b) => a.due_at!.localeCompare(b.due_at!));
  const items: TimelineItem[] = [
    ...(acts.data ?? []).map((a) => ({ kind: "activity" as const, at: a.created_at, id: a.id, type: a.type, subject: a.subject, body: a.body, due_at: a.due_at, completed_at: a.completed_at, who: a.owner?.full_name ?? null, contact: a.contact ? fullName(a.contact) : null })),
    ...(comms.data ?? []).map((c) => ({ kind: "comm" as const, at: c.sent_at ?? c.created_at, id: c.id, channel: c.channel, direction: c.direction, subject: c.subject, body: c.body, status: c.status, who: c.author?.full_name ?? null, contact: c.contact ? fullName(c.contact) : null })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const canWrite = ctx.can("crm.write");

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid min-w-0 content-start gap-6">
        {canWrite && (
          <ActivityComposer
            orgId={orgId}
            contacts={(contacts.data ?? []).map((c) => ({ value: c.id, label: fullName(c) }))}
            staff={staff}
            me={ctx.userId}
            opportunities={(opps.data ?? []).map((o) => ({ value: o.id, label: o.title }))}
          />
        )}
        <Card>
          <CardHeader title="Communication history" description={canComms ? "Logged activity and messages sent or received through PowerMac Connect." : "Logged calls, meetings, notes and tasks."} />
          {items.length ? (
            <ol className="relative px-5 py-4">
              {items.map((it) => (
                <li key={`${it.kind}-${it.id}`} className="relative border-l border-line pb-5 pl-6 last:pb-0">
                  <span className={cx("absolute top-0.5 -left-[9px] grid size-[18px] place-items-center rounded-full border", it.kind === "comm" ? "border-[#1b3d63] bg-info-lo text-[#8cc8ff]" : "border-[#2f5a12] bg-accent-lo text-accent-hi")} aria-hidden>
                    {it.kind === "comm" ? <MessageSquare className="size-2.5" /> : it.type === "follow_up" || it.type === "task" ? <CalendarClock className="size-2.5" /> : it.type === "call" ? <Phone className="size-2.5" /> : it.type === "email" ? <Mail className="size-2.5" /> : <span className="size-1.5 rounded-full bg-current" />}
                  </span>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {it.kind === "activity" ? (
                      <>
                        <Badge tone={it.type === "follow_up" || it.type === "task" ? "warn" : "accent"}>{activityLabel(it.type)}</Badge>
                        {it.completed_at && <Badge tone="ok">Done</Badge>}
                      </>
                    ) : (
                      <>
                        <Badge tone="info">{label(it.channel)} · {it.direction}</Badge>
                        {it.status === "preview" ? <Badge tone="warn">Not sent (no provider)</Badge> : it.status === "failed" ? <Badge tone="bad">Failed</Badge> : null}
                      </>
                    )}
                    <span className="text-xs text-subtle" title={dateTime(it.at)}>{relative(it.at)}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-fg">{it.subject || <span className="text-muted">(no subject)</span>}</p>
                  {it.body && <p className="mt-0.5 line-clamp-4 text-[13px] whitespace-pre-line text-muted">{it.body}</p>}
                  <p className="mt-1 text-xs text-subtle">
                    {[it.who && (it.kind === "comm" ? `by ${it.who}` : it.who), it.contact && `with ${it.contact}`, it.kind === "activity" && it.due_at && `due ${dateTime(it.due_at)}`].filter(Boolean).join(" · ")}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="No activity recorded yet">Log calls, meetings and notes so the whole team has the history.</EmptyState>
          )}
        </Card>
      </div>
      <Card className="content-start self-start">
        <CardHeader title="Open follow-ups & tasks" description={`${open.length} outstanding`} />
        {open.length ? (
          <ul className="divide-y divide-line/70">
            {open.map((a) => {
              const overdue = a.due_at! < now;
              return (
                <li key={a.id} className={cx("flex items-start justify-between gap-3 px-5 py-3", overdue && "bg-bad-lo/25")}>
                  <div className="min-w-0">
                    <p className="text-sm text-fg">{a.subject}</p>
                    <p className={cx("text-xs", overdue ? "text-[#ff8a87]" : "text-subtle")}>
                      {overdue ? "Overdue · " : ""}due {dateTime(a.due_at)}{a.owner?.full_name ? ` · ${a.owner.full_name}` : ""}
                    </p>
                  </div>
                  {canWrite && <ActionButton size="sm" action={setActivityDone.bind(null, a.id, true)}>Done</ActionButton>}
                </li>
              );
            })}
          </ul>
        ) : (
          <CardBody><Notice tone="ok">Nothing outstanding for this client.</Notice></CardBody>
        )}
      </Card>
    </div>
  );
}
