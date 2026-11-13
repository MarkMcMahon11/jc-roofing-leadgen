import Link from "next/link";
import { AlertTriangle, Phone } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, DefinitionList, EmptyState, Mono, Notice, Stat, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { date, dateTime, label, money, pct } from "@/lib/format";
import type { TenantContext } from "@/lib/auth/context";
import type { ServerClient } from "@/lib/supabase/server";
import type { getLookups, getStatuses } from "@/lib/data/lookups";
import type { Job } from "../_lib/job";
import { sourceLabel } from "../_lib/constants";
import { addDays, londonDate, londonParts, londonTime, toLondonInput, weekdayIndex } from "../_lib/time";
import { AssignmentsList, type AssignmentRow } from "./assignments-list";
import { AssignPanel } from "./assign-panel";
import { NoteForm } from "./note-form";
import { Timeline, type UpdateRow } from "./timeline";
import { MaterialsPanel, type MaterialLine } from "./materials-panel";
import { ChecklistPanel, type Checklist, type ChecklistItem } from "./checklist-panel";
import { CompletionForm } from "./completion-form";
import { PhotosPanel } from "./photos-panel";

type Ctx = TenantContext;
type Lookups = Awaited<ReturnType<typeof getLookups>>;
type Statuses = Awaited<ReturnType<typeof getStatuses>>;
type Props = { supabase: ServerClient; ctx: Ctx; job: Job };

const yesNo = (v: boolean | null) => (v === null ? "Not recorded" : v ? "Yes" : "No");

/* ------------------------------------------------------------------ details */

export async function DetailsSection({ supabase, ctx, job, lookups }: Props & { lookups: Lookups }) {
  const canOcc = ctx.can("occupants.read");
  const { data: occupants } = canOcc
    ? job.occupant_id
      ? await supabase.from("occupants").select("id, full_name, phone, email, preferred_contact, access_needs, vulnerability_flags, is_current").eq("id", job.occupant_id).eq("tenant_id", ctx.tenantId)
      : await supabase
          .from("occupants")
          .select("id, full_name, phone, email, preferred_contact, access_needs, vulnerability_flags, is_current")
          .eq("tenant_id", ctx.tenantId)
          .eq("property_id", job.property_id)
          .eq("is_current", true)
          .is("anonymised_at", null)
          .limit(3)
    : { data: null };
  const p = job.properties;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid min-w-0 content-start gap-6">
        <Card>
          <CardHeader title="Work requested" />
          <CardBody>
            {job.description ? <p className="max-w-3xl text-sm leading-relaxed whitespace-pre-wrap text-fg">{job.description}</p> : <p className="text-sm text-subtle">No description.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DefinitionList
              columns={3}
              items={[
                { label: "Work category", value: lookups.label("work_category", job.work_category) },
                { label: "Trade", value: lookups.label("trade", job.trade) },
                { label: "Priority", value: label(job.priority) },
                { label: "Received by", value: sourceLabel(job.source) },
                { label: "Client reference", value: job.client_reference ? <Mono>{job.client_reference}</Mono> : "-" },
                { label: "Reported", value: dateTime(job.reported_at) },
                { label: "Target attendance", value: dateTime(job.target_attend_at) },
                { label: "Target completion", value: dateTime(job.target_completion_at) },
                { label: "Scheduled", value: job.scheduled_start ? `${dateTime(job.scheduled_start)} - ${dateTime(job.scheduled_end)}` : "Not scheduled" },
                { label: "Estimated hours", value: job.estimated_hours === null ? "-" : `${Number(job.estimated_hours)} h` },
                { label: "Estimated cost", value: money(job.estimated_cost) },
                { label: "Not to exceed", value: money(job.not_to_exceed) },
                {
                  label: "Approval",
                  value: job.approved_at ? `Approved ${dateTime(job.approved_at)}${job.approver?.full_name ? ` by ${job.approver.full_name}` : ""}` : job.requires_approval ? <Badge tone="warn">Approval required</Badge> : "Not required",
                },
                { label: "Job manager", value: job.manager?.full_name ?? "Not set" },
                { label: "Created", value: `${dateTime(job.created_at)}${job.creator?.full_name ? ` by ${job.creator.full_name}` : ""}` },
              ]}
            />
          </CardBody>
        </Card>
        {job.access_notes && (
          <Card>
            <CardHeader title="Access notes for this job" />
            <CardBody>
              <p className="text-sm whitespace-pre-wrap text-fg">{job.access_notes}</p>
            </CardBody>
          </Card>
        )}
      </div>
      <div className="grid min-w-0 content-start gap-6">
        <Card>
          <CardHeader title="Property" actions={p ? <Link href={`/properties/${p.id}`} className="text-xs font-medium text-accent-hi hover:underline">Open</Link> : null} />
          <CardBody className="grid gap-3 text-sm">
            {p && (
              <>
                <div>
                  <p className="font-medium text-fg">{[p.address_line1, p.address_line2].filter(Boolean).join(", ")}</p>
                  <p className="text-muted">
                    {p.town} {p.postcode}
                  </p>
                  <p className="mt-1 text-xs text-subtle">
                    <Mono>{p.reference}</Mono> · {label(p.property_type)} · {label(p.status)}
                  </p>
                </div>
                {p.hazards.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-xs font-medium text-[#ffc56b]">
                      <AlertTriangle className="size-3.5" aria-hidden /> Hazards
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {p.hazards.map((h) => (
                        <Badge key={h} tone="warn">
                          {label(h)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {p.restrictions && (
                  <div>
                    <p className="text-xs font-medium text-subtle">Restrictions</p>
                    <p className="text-fg">{p.restrictions}</p>
                  </div>
                )}
                {p.access_notes && (
                  <div>
                    <p className="text-xs font-medium text-subtle">Property access</p>
                    <p className="text-fg">{p.access_notes}</p>
                  </div>
                )}
                {!p.hazards.length && !p.restrictions && !p.access_notes && <p className="text-xs text-subtle">No hazards or restrictions recorded.</p>}
              </>
            )}
          </CardBody>
        </Card>
        {canOcc && (
          <Card>
            <CardHeader title={job.occupant_id ? "Occupant" : "Current occupant"} description={job.occupant_id ? "Linked to this job" : "At the property (not linked to the job)"} />
            <CardBody className="grid gap-3 text-sm">
              {!occupants?.length && <p className="text-subtle">No occupant recorded.</p>}
              {occupants?.map((o) => (
                <div key={o.id}>
                  <p className="font-medium text-fg">{o.full_name}</p>
                  {o.phone && (
                    <a href={`tel:${o.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-accent-hi hover:underline">
                      <Phone className="size-3.5" aria-hidden /> {o.phone}
                    </a>
                  )}
                  {o.email && <p className="text-muted">{o.email}</p>}
                  <p className="text-xs text-subtle">Prefers {label(o.preferred_contact)}</p>
                  {o.access_needs && <p className="mt-1 text-xs text-[#ffd79a]">Access needs: {o.access_needs}</p>}
                  {o.vulnerability_flags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {o.vulnerability_flags.map((f) => (
                        <Badge key={f} tone="warn">
                          {label(f)}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader title="Client & contract" />
          <CardBody className="grid gap-2 text-sm">
            {job.organisations && (
              <Link href={`/crm/${job.organisations.id}`} className="font-medium text-fg hover:text-accent-hi">
                {job.organisations.name}
              </Link>
            )}
            {job.contracts ? (
              <Link href={`/contracts/${job.contracts.id}`} className="text-muted hover:text-accent-hi">
                <Mono>{job.contracts.reference}</Mono> {job.contracts.title}
              </Link>
            ) : (
              <p className="text-subtle">Not under a contract</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ assignment */

function defaultSlot(now = new Date()) {
  let day = londonDate(now);
  const hour = londonParts(now).hour;
  let time = "08:00";
  if (hour >= 15) day = addDays(day, 1);
  else if (hour >= 7) time = `${String(hour + 1).padStart(2, "0")}:00`;
  while (weekdayIndex(day) > 4) day = addDays(day, 1);
  if (day !== londonDate(now)) time = "08:00";
  return { day, time };
}

export async function AssignmentSection({ supabase, ctx, job, lookups }: Props & { lookups: Lookups }) {
  const canAssign = ctx.can("work_orders.assign");
  const [{ data: rows }, { data: subs }] = await Promise.all([
    supabase
      .from("job_assignments")
      .select("id, role, status, scheduled_start, scheduled_end, notes, employee_id, subcontractor_id, employees(id, first_name, last_name, colour), subcontractors(id, company_name, insurance_expiry)")
      .eq("tenant_id", ctx.tenantId)
      .eq("work_order_id", job.id)
      .order("scheduled_start"),
    canAssign
      ? supabase.from("subcontractors").select("id, company_name, insurance_expiry, trades").eq("tenant_id", ctx.tenantId).eq("status", "approved").order("company_name")
      : Promise.resolve({ data: null }),
  ]);
  const today = londonDate();
  const list: AssignmentRow[] = (rows ?? []).map((a) => {
    const hours = Math.round(((new Date(a.scheduled_end).getTime() - new Date(a.scheduled_start).getTime()) / 3_600_000) * 4) / 4;
    const expired = a.subcontractors?.insurance_expiry && a.subcontractors.insurance_expiry < today;
    return {
      id: a.id,
      kind: a.employee_id ? "employee" : "subcontractor",
      who: a.employees ? `${a.employees.first_name} ${a.employees.last_name}` : (a.subcontractors?.company_name ?? "Unknown"),
      href: a.employee_id ? `/workforce/${a.employee_id}` : `/subcontractors/${a.subcontractor_id}`,
      colour: a.employees?.colour ?? "#8b5cf6",
      role: a.role,
      status: a.status,
      start: a.scheduled_start,
      end: a.scheduled_end,
      day: londonDate(a.scheduled_start),
      time: londonTime(a.scheduled_start),
      hours,
      notes: a.notes,
      warning: expired && a.status !== "cancelled" ? `Insurance expired ${date(a.subcontractors!.insurance_expiry)}` : null,
    };
  });
  const slot = defaultSlot();
  const hasLead = (rows ?? []).some((a) => a.role === "lead" && a.status !== "cancelled");
  const est = job.estimated_hours === null ? 2 : Number(job.estimated_hours);
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader title="Visits" description={job.scheduled_start ? `Scheduled window ${dateTime(job.scheduled_start)} - ${dateTime(job.scheduled_end)}` : "Not scheduled yet"} />
        <AssignmentsList rows={list} canAssign={canAssign} />
      </Card>
      {canAssign ? (
        <AssignPanel
          jobId={job.id}
          defaultDay={slot.day}
          defaultTime={slot.time}
          defaultDuration={Math.min(8, Math.max(0.5, est))}
          defaultRole={hasLead ? "support" : "lead"}
          tradeLabels={Object.fromEntries(lookups.options("trade").map((o) => [o.value, o.label]))}
          subcontractors={(subs ?? []).map((s) => ({
            id: s.id,
            name: s.company_name,
            insuranceExpiry: s.insurance_expiry ? date(s.insurance_expiry) : null,
            expired: Boolean(s.insurance_expiry && s.insurance_expiry < today),
            trades: s.trades.map((t) => lookups.label("trade", t)).join(", "),
          }))}
        />
      ) : (
        <Notice tone="neutral">Assigning operatives needs the job assignment permission.</Notice>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ timeline */

export async function TimelineSection({ supabase, ctx, job, statuses }: Props & { statuses: Statuses }) {
  const { data } = await supabase
    .from("job_updates")
    .select("id, type, from_status, to_status, body, data, visibility, created_at, author:profiles!job_updates_author_id_fkey(full_name)")
    .eq("tenant_id", ctx.tenantId)
    .eq("work_order_id", job.id)
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as UpdateRow[];
  const empIds = new Set<string>();
  const subIds = new Set<string>();
  for (const r of rows) {
    const d = (r.data ?? {}) as Record<string, unknown>;
    if (typeof d.employee_id === "string") empIds.add(d.employee_id);
    if (typeof d.subcontractor_id === "string") subIds.add(d.subcontractor_id);
  }
  const [emps, subs] = await Promise.all([
    empIds.size ? supabase.from("employees").select("id, first_name, last_name").in("id", [...empIds]) : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    subIds.size ? supabase.from("subcontractors").select("id, company_name").in("id", [...subIds]) : Promise.resolve({ data: [] as { id: string; company_name: string }[] }),
  ]);
  const names: Record<string, string> = {};
  for (const e of emps.data ?? []) names[e.id] = `${e.first_name} ${e.last_name}`;
  for (const s of subs.data ?? []) names[s.id] = s.company_name;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="min-w-0">
        <CardHeader title="Timeline" description="Newest first. Status changes and assignments are recorded automatically." />
        <Timeline rows={rows} status={(k) => statuses.get(k)} names={names} />
      </Card>
      {ctx.can("work_orders.write") && (
        <Card className="h-fit">
          <CardBody>
            <NoteForm jobId={job.id} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ materials */

export async function MaterialsSection({ supabase, ctx, job }: Props) {
  const showCosts = ctx.can("finance.read");
  const catalogueAvailable = ctx.can("inventory.read");
  const [{ data: lines }, { data: catalogue }] = await Promise.all([
    supabase.from("job_materials").select("id, description, quantity, unit, unit_cost, status, materials(sku)").eq("tenant_id", ctx.tenantId).eq("work_order_id", job.id).order("created_at"),
    catalogueAvailable
      ? supabase.from("materials").select("id, sku, name, unit, unit_cost").eq("tenant_id", ctx.tenantId).eq("is_active", true).order("name").limit(2000)
      : Promise.resolve({ data: null }),
  ]);
  const ml: MaterialLine[] = (lines ?? []).map((l) => ({
    id: l.id,
    description: l.description,
    quantity: Number(l.quantity),
    unit: l.unit,
    unit_cost: showCosts && l.unit_cost !== null ? Number(l.unit_cost) : null,
    status: l.status,
    sku: l.materials?.sku ?? null,
  }));
  return (
    <Card>
      <CardHeader title="Materials" description={showCosts ? "Unit costs come from the catalogue when the line is added." : "What this job needs and what was used."} />
      <MaterialsPanel
        jobId={job.id}
        lines={ml}
        catalogue={(catalogue ?? []).map((m) => ({ id: m.id, label: `${m.name} · ${m.sku} (${m.unit})`, unit: m.unit, cost: showCosts ? Number(m.unit_cost) : null }))}
        canWrite={ctx.can("work_orders.write")}
        showCosts={showCosts}
        catalogueAvailable={catalogueAvailable}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ checklist */

export async function ChecklistSection({ supabase, ctx, job, lookups }: Props & { lookups: Lookups }) {
  const [{ data: lists }, { data: templates }] = await Promise.all([
    supabase
      .from("job_checklists")
      .select("id, name, items, completed_at, completer:profiles!job_checklists_completed_by_fkey(full_name)")
      .eq("tenant_id", ctx.tenantId)
      .eq("work_order_id", job.id)
      .order("created_at"),
    supabase.from("checklist_templates").select("id, name, work_category").eq("tenant_id", ctx.tenantId).eq("is_active", true).order("name"),
  ]);
  const checklists: Checklist[] = (lists ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    items: (Array.isArray(c.items) ? c.items : []) as unknown as ChecklistItem[],
    completed_at: c.completed_at,
    completed_by: c.completer?.full_name ?? null,
  }));
  const opts = (templates ?? [])
    .sort((a, b) => Number(b.work_category === job.work_category) - Number(a.work_category === job.work_category))
    .map((t) => ({ value: t.id, label: t.work_category ? `${t.name} (${lookups.label("work_category", t.work_category)})` : t.name }));
  return <ChecklistPanel jobId={job.id} checklists={checklists} templates={opts} canWrite={ctx.can("work_orders.write")} />;
}

/* ------------------------------------------------------------------ inspection & completion */

export async function CompletionSection({ supabase, ctx, job }: Props) {
  const { data: inspections } = await supabase
    .from("inspections")
    .select("id, reference, type, scheduled_for, completed_at, result, score, findings")
    .eq("tenant_id", ctx.tenantId)
    .eq("work_order_id", job.id)
    .order("scheduled_for", { ascending: false });
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="min-w-0">
        <CardHeader title="Completion" description="What happened on site, whether it was fixed first time and who accepted the work." />
        <CardBody>
          <CompletionForm
            jobId={job.id}
            canWrite={ctx.can("work_orders.write")}
            initial={{
              actual_start: toLondonInput(job.actual_start),
              actual_end: toLondonInput(job.actual_end),
              completion_notes: job.completion_notes ?? "",
              first_time_fix: job.first_time_fix === null ? "" : job.first_time_fix ? "yes" : "no",
              signoff_name: job.signoff_name ?? "",
              signoff_at: toLondonInput(job.signoff_at),
              satisfaction_score: job.satisfaction_score ? String(job.satisfaction_score) : "",
            }}
          />
        </CardBody>
      </Card>
      <div className="grid content-start gap-6">
        <Card>
          <CardHeader title="Summary" />
          <CardBody>
            <DefinitionList
              columns={1}
              items={[
                { label: "Completed", value: job.completed_at ? dateTime(job.completed_at) : "Not completed" },
                { label: "First-time fix", value: yesNo(job.first_time_fix) },
                { label: "Signed off", value: job.signoff_name ? `${job.signoff_name}${job.signoff_at ? `, ${dateTime(job.signoff_at)}` : ""}` : "Not signed off" },
                { label: "Satisfaction", value: job.satisfaction_score ? `${job.satisfaction_score} / 5` : "Not recorded" },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Inspections" />
          {inspections?.length ? (
            <ul className="divide-y divide-line">
              {inspections.map((i) => (
                <li key={i.id} className="px-5 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Mono>{i.reference}</Mono>
                    <span className="text-fg">{label(i.type)}</span>
                    {i.result && <Badge tone={i.result === "pass" ? "ok" : i.result === "fail" ? "bad" : "warn"}>{label(i.result)}</Badge>}
                  </div>
                  <p className="text-xs text-subtle">
                    {i.completed_at ? `Done ${dateTime(i.completed_at)}` : i.scheduled_for ? `Booked ${dateTime(i.scheduled_for)}` : "Not booked"}
                    {i.score !== null && ` · score ${Number(i.score)}`}
                  </p>
                  {i.findings && <p className="mt-1 text-xs text-muted">{i.findings.slice(0, 280)}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <CardBody>
              <p className="text-sm text-subtle">No inspections linked to this job.</p>
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ costs (finance only) */

export async function CostsSection({ supabase, ctx, job }: Props) {
  const [{ data: fin }, { data: costs }, { data: invoices }] = await Promise.all([
    supabase.from("v_job_financials").select("*").eq("work_order_id", job.id).maybeSingle(),
    supabase.from("costs").select("id, category, description, amount, incurred_on, source").eq("tenant_id", ctx.tenantId).eq("work_order_id", job.id).order("incurred_on", { ascending: false }),
    supabase.from("invoices").select("id, reference, status, issue_date, due_date, subtotal, total, amount_paid").eq("tenant_id", ctx.tenantId).eq("work_order_id", job.id).order("issue_date", { ascending: false }),
  ]);
  const est = job.estimated_cost === null ? null : Number(job.estimated_cost);
  const total = Number(fin?.total_cost ?? 0);
  const revenue = Number(fin?.invoiced_net ?? 0);
  const margin = Number(fin?.margin ?? 0);
  const variance = est === null ? null : total - est;
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Invoiced (net)" value={money(revenue, { whole: true })} tone="accent" />
        <Stat label="Cost to date" value={money(total, { whole: true })} hint={`Labour ${money(fin?.labour_cost ?? 0, { whole: true })} · Materials ${money(fin?.materials_cost ?? 0, { whole: true })}`} />
        <Stat label="Margin" value={money(margin, { whole: true })} tone={margin < 0 ? "bad" : revenue > 0 ? "ok" : "neutral"} hint={revenue > 0 ? `${pct((margin / revenue) * 100, 1)} of invoiced` : "Nothing invoiced yet"} />
        <Stat
          label="Against estimate"
          value={variance === null ? "-" : `${variance > 0 ? "+" : ""}${money(variance, { whole: true })}`}
          tone={variance === null ? "neutral" : variance > 0 ? "warn" : "ok"}
          hint={est === null ? "No estimate on the job" : `Estimate ${money(est, { whole: true })}${job.not_to_exceed ? ` · NTE ${money(job.not_to_exceed, { whole: true })}` : ""}`}
        />
      </div>
      {job.not_to_exceed !== null && total > Number(job.not_to_exceed) && (
        <Notice tone="bad" title="Over the not-to-exceed limit">
          Costs of {money(total)} are above the client&apos;s limit of {money(job.not_to_exceed)}. A variation or approval may be needed before invoicing.
        </Notice>
      )}
      <Card>
        <CardHeader title="Costs" description="From approved timesheets, purchase orders, stock issues and manual entries." />
        {costs?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Category</TH>
                <TH>Description</TH>
                <TH>Source</TH>
                <TH align="right">Amount</TH>
              </tr>
            </THead>
            <tbody>
              {costs.map((c) => (
                <TR key={c.id}>
                  <TD className="whitespace-nowrap text-muted">{date(c.incurred_on)}</TD>
                  <TD>{label(c.category)}</TD>
                  <TD>{c.description}</TD>
                  <TD className="text-muted">{label(c.source)}</TD>
                  <TD align="right">{money(c.amount)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="No costs recorded yet" />
        )}
      </Card>
      <Card>
        <CardHeader title="Invoices" />
        {invoices?.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Invoice</TH>
                <TH>Status</TH>
                <TH>Issued</TH>
                <TH>Due</TH>
                <TH align="right">Net</TH>
                <TH align="right">Total</TH>
                <TH align="right">Paid</TH>
              </tr>
            </THead>
            <tbody>
              {invoices.map((i) => (
                <TR key={i.id}>
                  <TD>
                    <Mono>{i.reference}</Mono>
                  </TD>
                  <TD>
                    <Badge tone={i.status === "paid" ? "ok" : i.status === "overdue" ? "bad" : i.status === "draft" ? "neutral" : "info"}>{label(i.status)}</Badge>
                  </TD>
                  <TD className="text-muted">{date(i.issue_date)}</TD>
                  <TD className="text-muted">{date(i.due_date)}</TD>
                  <TD align="right">{money(i.subtotal)}</TD>
                  <TD align="right">{money(i.total)}</TD>
                  <TD align="right">{money(i.amount_paid)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="Not invoiced yet" />
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ photos */

export async function PhotosSection({ supabase, ctx, job }: Props) {
  const { data: rows } = await supabase
    .from("photos")
    .select("id, storage_path, stage, caption, visibility, taken_at, created_at, author:profiles!photos_created_by_fkey(full_name)")
    .eq("tenant_id", ctx.tenantId)
    .eq("work_order_id", job.id)
    .order("created_at", { ascending: false })
    .limit(200);
  const paths = (rows ?? []).map((r) => r.storage_path);
  const { data: signed } = paths.length ? await supabase.storage.from("photos").createSignedUrls(paths, 3600) : { data: [] };
  const urlOf = new Map((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
  return (
    <PhotosPanel
      jobId={job.id}
      canWrite={ctx.can("work_orders.write")}
      photos={(rows ?? []).map((r) => ({
        id: r.id,
        url: urlOf.get(r.storage_path) ?? null,
        stage: r.stage,
        caption: r.caption,
        visibility: r.visibility,
        taken: dateTime(r.taken_at ?? r.created_at),
        by: r.author?.full_name ?? null,
      }))}
    />
  );
}
