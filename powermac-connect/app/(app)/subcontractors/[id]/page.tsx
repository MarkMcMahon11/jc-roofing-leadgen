import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, ChevronLeft, ClipboardList, FileText, Lock, Pencil, ShieldCheck, ShieldX, Star } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups, getStatuses } from "@/lib/data/lookups";
import { Badge, ButtonLink, Card, CardBody, CardHeader, ColourBadge, cx, DefinitionList, EmptyState, Mono, Notice, PageHeader, priorityTone, Stat, Table, TD, TH, THead, TR, type Tone } from "@/components/ui/primitives";
import { LinkTabs } from "@/components/ui/url-controls";
import { date, label, money, time, todayISO } from "@/lib/format";
import { DeleteDocumentButton, DownloadButton, UploadForm } from "../../properties/_components/files";
import { Chips, ExpiryDate, expiryState, param, Prose } from "../../properties/_lib/ui";
import { DeleteQualificationButton, QualificationButton } from "../../workforce/_components/workforce-forms";
import { CIS_STATUS, LIVE_ASSIGNMENT, SUB_STATUS } from "../_lib/shared";

export const metadata: Metadata = { title: "Subcontractor" };

async function fetchSub(tenantId: string, id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("subcontractors").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  return data;
}
type Sub = NonNullable<Awaited<ReturnType<typeof fetchSub>>>;
type Ctx = Awaited<ReturnType<typeof requireInternal>>;

export default async function SubcontractorPage({ params, searchParams }: PageProps<"/subcontractors/[id]">) {
  const ctx = await requireInternal("subcontractors.read");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const s = await fetchSub(ctx.tenantId, id);
  if (!s) notFound();
  const supabase = await createClient();
  const [lookups, statuses] = await Promise.all([getLookups(ctx.tenantId), getStatuses(ctx.tenantId)]);
  const today = todayISO();
  const canJobs = ctx.can("work_orders.read");
  const openKeys = statuses.list.filter((x) => x.counts_as_open).map((x) => x.key);
  const head = { count: "exact" as const, head: true };
  const none = Promise.resolve({ count: null as number | null, data: null });
  const [liveRes, quals, docs] = await Promise.all([
    canJobs
      ? supabase.from("job_assignments").select("work_order_id, work_order:work_orders!inner(status)").eq("tenant_id", ctx.tenantId).eq("subcontractor_id", id).in("status", LIVE_ASSIGNMENT).in("work_order.status", openKeys)
      : Promise.resolve({ data: [] as { work_order_id: string }[] }),
    ctx.can("workforce.read") ? supabase.from("qualifications").select("id", head).eq("tenant_id", ctx.tenantId).eq("subcontractor_id", id) : none,
    ctx.can("documents.read") ? supabase.from("documents").select("id", head).eq("tenant_id", ctx.tenantId).eq("subcontractor_id", id) : none,
  ]);
  const liveJobs = new Set((liveRes.data ?? []).map((a) => a.work_order_id)).size;

  const tabKeys = ["overview", "accreditations", "assignments", "documents"] as const;
  type TabKey = (typeof tabKeys)[number];
  const tab: TabKey = tabKeys.find((t) => t === param(sp.tab)) ?? "overview";
  const href = (t: TabKey) => (t === "overview" ? `/subcontractors/${id}` : `/subcontractors/${id}?tab=${t}`);

  const st = SUB_STATUS[s.status] ?? { label: s.status, tone: "neutral" as Tone };
  const ins = expiryState(s.insurance_expiry);
  const insuranceExpired = !s.insurance_expiry || s.insurance_expiry < today;
  const approved = s.status === "approved";
  const compliant = approved && !insuranceExpired;
  const saved = param(sp.saved);

  return (
    <>
      <Link href="/subcontractors" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden />
        Subcontractors
      </Link>
      <PageHeader
        eyebrow="Subcontractor"
        title={s.company_name}
        description={s.contact_name ? `Contact: ${s.contact_name}` : undefined}
        actions={
          ctx.can("subcontractors.write") ? (
            <ButtonLink href={`/subcontractors/${id}/edit`}>
              <Pencil className="size-4" aria-hidden />
              Edit
            </ButtonLink>
          ) : undefined
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Mono>{s.reference}</Mono>
          <Badge tone={st.tone} dot>{st.label}</Badge>
          <Chips items={s.trades.map((t) => lookups.label("trade", t))} max={6} />
        </div>
      </PageHeader>

      <div className="mb-6 grid gap-3">
        {saved && <Notice tone="ok">{saved === "created" ? "Subcontractor added." : "Subcontractor saved."}</Notice>}
        {!compliant && (
          <Notice tone={liveJobs ? "bad" : "warn"} title={liveJobs ? `${liveJobs} live job${liveJobs === 1 ? "" : "s"} with a non-compliant subcontractor` : "Do not assign new work"}>
            {[!approved && `Status is ${st.label.toLowerCase()}, not approved.`, insuranceExpired && (s.insurance_expiry ? `Insurance expired on ${date(s.insurance_expiry)}.` : "No insurance expiry is recorded.")].filter(Boolean).join(" ")}{" "}
            {liveJobs ? "Review their live assignments and reassign or obtain up-to-date documents." : "Approve them only once in-date insurance has been checked."}
          </Notice>
        )}
        {compliant && ins.tone === "warn" && <Notice tone="warn" title="Insurance renewal due">Insurance expires {date(s.insurance_expiry)} ({ins.label}). Ask for the renewed certificate.</Notice>}
      </div>

      <LinkTabs
        current={tab}
        tabs={[
          { key: "overview", label: "Overview", href: href("overview") },
          { key: "accreditations", label: "Accreditations", href: href("accreditations"), count: quals.count ?? undefined },
          { key: "assignments", label: "Assignments", href: href("assignments"), count: canJobs ? liveJobs : undefined },
          { key: "documents", label: "Documents", href: href("documents"), count: docs.count ?? undefined },
        ]}
      />
      <div className="mt-6">
        {tab === "overview" && <OverviewTab ctx={ctx} s={s} liveJobs={liveJobs} canJobs={canJobs} />}
        {tab === "accreditations" && <AccreditationsTab ctx={ctx} subId={id} />}
        {tab === "assignments" && <AssignmentsTab ctx={ctx} subId={id} compliant={compliant} />}
        {tab === "documents" && <DocumentsTab ctx={ctx} subId={id} />}
      </div>
    </>
  );
}

function Restricted({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <EmptyState icon={<Lock className="size-7" aria-hidden />} title={title}>{children}</EmptyState>
    </Card>
  );
}

function CheckRow({ ok, warn, title, detail }: { ok: boolean; warn?: boolean; title: string; detail: React.ReactNode }) {
  const Icon = ok ? ShieldCheck : ShieldX;
  return (
    <li className="relative flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <Icon className={cx("mt-0.5 size-5 shrink-0", ok ? (warn ? "text-warn" : "text-ok") : "text-bad")} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-[13px] text-muted">{detail}</div>
      </div>
      <span className="sr-only">{ok ? (warn ? "Attention" : "Pass") : "Fail"}</span>
    </li>
  );
}

/* ================================================================== overview */
async function OverviewTab({ ctx, s, liveJobs, canJobs }: { ctx: Ctx; s: Sub; liveJobs: number; canJobs: boolean }) {
  const supabase = await createClient();
  const today = todayISO();
  const ins = expiryState(s.insurance_expiry);
  const cis = CIS_STATUS[s.cis_status] ?? { label: s.cis_status, tone: "neutral" as Tone, hint: "" };
  const st = SUB_STATUS[s.status] ?? { label: s.status, tone: "neutral" as Tone };
  const canFinance = ctx.can("finance.read");
  const now = new Date();
  const fyStart = `${now.getUTCMonth() < 3 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()}-04-01`;
  const { data: costs } = canFinance
    ? await supabase.from("costs").select("id, description, amount, incurred_on, work_order_id, category").eq("tenant_id", ctx.tenantId).eq("subcontractor_id", s.id).order("incurred_on", { ascending: false })
    : { data: null };
  const total = (costs ?? []).reduce((a, c) => a + Number(c.amount), 0);
  const fy = (costs ?? []).filter((c) => c.incurred_on >= fyStart).reduce((a, c) => a + Number(c.amount), 0);

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Compliance" description="Checked before any work is assigned." />
          <CardBody>
            <ul className="divide-y divide-line/70">
              <CheckRow ok={s.status === "approved"} title={`Approval: ${st.label}`} detail={s.status === "approved" ? "Approved to receive work." : "Not approved: do not assign work until approved."} />
              <CheckRow
                ok={Boolean(s.insurance_expiry) && s.insurance_expiry! >= today}
                warn={ins.tone === "warn"}
                title="Insurance"
                detail={s.insurance_expiry ? <ExpiryDate value={s.insurance_expiry} quietWhenValid={false} /> : "No expiry date recorded."}
              />
              <CheckRow
                ok={(Number(s.public_liability_gbp) || 0) >= 2_000_000}
                warn={(Number(s.public_liability_gbp) || 0) >= 2_000_000 && (Number(s.public_liability_gbp) || 0) < 5_000_000}
                title="Public liability cover"
                detail={s.public_liability_gbp !== null ? `${money(s.public_liability_gbp, { whole: true })}${Number(s.public_liability_gbp) < 2_000_000 ? " · below the usual £2m minimum" : ""}` : "Not recorded."}
              />
              <CheckRow ok={s.cis_status !== "unverified"} warn={s.cis_status === "higher"} title={`CIS: ${cis.label}`} detail={cis.hint} />
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Contact and terms" />
          <CardBody>
            <DefinitionList
              items={[
                { label: "Contact", value: s.contact_name },
                { label: "Email", value: s.email ? <a href={`mailto:${s.email}`} className="hover:text-accent-hi">{s.email}</a> : null },
                { label: "Phone", value: s.phone ? <a href={`tel:${s.phone.replace(/\s+/g, "")}`} className="hover:text-accent-hi">{s.phone}</a> : null },
                { label: "Postcode", value: s.postcode },
                { label: "Address", value: s.address ? <span className="whitespace-pre-line">{s.address}</span> : null },
                { label: "Day rate", value: s.day_rate !== null ? money(s.day_rate) : null },
                {
                  label: "Rating",
                  value:
                    s.rating !== null ? (
                      <span className="inline-flex items-center gap-1">
                        <Star className="size-3.5 fill-warn text-warn" aria-hidden />
                        {Number(s.rating).toFixed(1)} / 5
                      </span>
                    ) : null,
                },
                { label: "Live jobs", value: canJobs ? String(liveJobs) : "-" },
                { label: "Notes", value: <Prose text={s.notes} empty="No notes" /> },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      {canFinance ? (
        <Card>
          <CardHeader title="Costs to date" description="Subcontractor costs recorded against jobs and contracts." />
          <CardBody className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label="Total to date" value={money(total, { whole: true })} tone="accent" />
              <Stat label="This financial year" value={money(fy, { whole: true })} hint={`Since ${date(fyStart)}`} />
              <Stat label="Cost entries" value={(costs ?? []).length} />
            </div>
          </CardBody>
          {costs?.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Description</TH>
                  <TH>Job</TH>
                  <TH align="right">Amount</TH>
                </tr>
              </THead>
              <tbody>
                {costs.slice(0, 15).map((c) => (
                  <TR key={c.id}>
                    <TD className="whitespace-nowrap text-[13px] text-muted">{date(c.incurred_on)}</TD>
                    <TD className="text-[13px]">{c.description}</TD>
                    <TD>{c.work_order_id && canJobs ? <Link href={`/jobs/${c.work_order_id}`} className="text-[13px] text-accent-hi hover:underline">Open job</Link> : <span className="text-subtle">-</span>}</TD>
                    <TD align="right">{money(c.amount)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="px-5 pb-4 text-sm text-subtle">No costs recorded yet.</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}

/* ================================================================== accreditations */
async function AccreditationsTab({ ctx, subId }: { ctx: Ctx; subId: string }) {
  if (!ctx.can("workforce.read")) return <Restricted title="Accreditations are not available to you">Viewing accreditations needs workforce access.</Restricted>;
  const supabase = await createClient();
  const { data } = await supabase
    .from("qualifications")
    .select("id, name, issuer, certificate_number, issued_on, expires_on")
    .eq("tenant_id", ctx.tenantId)
    .eq("subcontractor_id", subId)
    .order("expires_on", { ascending: true, nullsFirst: false });
  const rows = data ?? [];
  const canWrite = ctx.can("workforce.write");
  return (
    <Card>
      <CardHeader
        title="Qualifications and accreditations"
        description="Trade bodies, safety schemes and operative cards (e.g. NICEIC, Gas Safe, CHAS, SafeContractor)."
        actions={canWrite ? <QualificationButton owner={{ subcontractor_id: subId }} /> : undefined}
      />
      {rows.length ? (
        <Table>
          <THead>
            <tr>
              <TH>Accreditation</TH>
              <TH>Number</TH>
              <TH>Issued</TH>
              <TH>Expires</TH>
              {canWrite && <TH align="right" className="relative"><span className="sr-only">Actions</span></TH>}
            </tr>
          </THead>
          <tbody>
            {rows.map((q) => (
              <TR key={q.id}>
                <TD className="min-w-[200px]">
                  <div className="font-medium">{q.name}</div>
                  {q.issuer && <div className="text-xs text-subtle">{q.issuer}</div>}
                </TD>
                <TD className="font-mono text-[13px] text-muted">{q.certificate_number ?? "-"}</TD>
                <TD className="whitespace-nowrap text-[13px] text-muted">{date(q.issued_on)}</TD>
                <TD className="text-[13px]"><ExpiryDate value={q.expires_on} quietWhenValid={false} emptyLabel="Does not expire" /></TD>
                {canWrite && (
                  <TD align="right">
                    <span className="inline-flex gap-2">
                      <QualificationButton owner={{ subcontractor_id: subId }} values={q} />
                      <DeleteQualificationButton id={q.id} name={q.name} />
                    </span>
                  </TD>
                )}
              </TR>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<Award className="size-7" aria-hidden />} title="No accreditations recorded">
          {canWrite ? undefined : "Adding accreditations needs workforce edit access."}
        </EmptyState>
      )}
    </Card>
  );
}

/* ================================================================== assignments */
async function AssignmentsTab({ ctx, subId, compliant }: { ctx: Ctx; subId: string; compliant: boolean }) {
  if (!ctx.can("work_orders.read")) return <Restricted title="Assignments are not available to you">Viewing jobs needs work order access.</Restricted>;
  const supabase = await createClient();
  const statuses = await getStatuses(ctx.tenantId);
  const { data } = await supabase
    .from("job_assignments")
    .select("id, role, status, scheduled_start, scheduled_end, work_order:work_orders(id, reference, title, status, priority, property:properties(address_line1, postcode))")
    .eq("tenant_id", ctx.tenantId)
    .eq("subcontractor_id", subId)
    .order("scheduled_start", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  const isLive = (a: (typeof rows)[number]) => LIVE_ASSIGNMENT.includes(a.status) && a.work_order && statuses.get(a.work_order.status).counts_as_open;
  const live = rows.filter(isLive).reverse();
  const history = rows.filter((a) => !isLive(a));
  const ASSIGN_TONE: Record<string, Tone> = { scheduled: "info", accepted: "accent", travelling: "accent", on_site: "ok", paused: "warn", completed: "ok", cancelled: "neutral", no_access: "bad" };

  const table = (list: typeof rows) => (
    <Table>
      <THead>
        <tr>
          <TH>When</TH>
          <TH>Job</TH>
          <TH>Property</TH>
          <TH>Priority</TH>
          <TH>Job status</TH>
          <TH>Visit</TH>
        </tr>
      </THead>
      <tbody>
        {list.map((a) => {
          const w = a.work_order;
          const s = w ? statuses.get(w.status) : null;
          return (
            <TR key={a.id}>
              <TD className="whitespace-nowrap text-[13px]">
                <div>{date(a.scheduled_start)}</div>
                <div className="text-xs text-subtle tabular">{time(a.scheduled_start)} – {time(a.scheduled_end)}</div>
              </TD>
              <TD className="min-w-[220px]">
                {w ? (
                  <Link href={`/jobs/${w.id}`} className="hover:text-accent-hi">
                    <Mono>{w.reference}</Mono>
                    <div className="font-medium">{w.title}</div>
                  </Link>
                ) : (
                  "-"
                )}
              </TD>
              <TD className="min-w-[160px] text-[13px] text-muted">{w?.property ? `${w.property.address_line1}, ${w.property.postcode}` : "-"}</TD>
              <TD>{w ? <Badge tone={priorityTone[w.priority] ?? "neutral"}>{label(w.priority)}</Badge> : "-"}</TD>
              <TD>{s ? <ColourBadge colour={s.colour}>{s.label}</ColourBadge> : "-"}</TD>
              <TD><Badge tone={ASSIGN_TONE[a.status] ?? "neutral"}>{label(a.status)}</Badge></TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );

  return (
    <div className="grid gap-6">
      {!compliant && live.length > 0 && <Notice tone="bad" title="Assigned while non-compliant">These visits are booked with a subcontractor who is not approved or whose insurance has lapsed.</Notice>}
      <Card>
        <CardHeader title="Live assignments" description="Visits still to be completed on open jobs." actions={ctx.can("schedule.read") ? <ButtonLink href="/schedule" size="sm">Open schedule</ButtonLink> : undefined} />
        {live.length ? table(live) : <EmptyState icon={<ClipboardList className="size-7" aria-hidden />} title="No live assignments" />}
      </Card>
      <Card>
        <CardHeader title="History" description={rows.length >= 200 ? "Most recent 200 assignments" : "Completed, cancelled and past visits"} />
        {history.length ? table(history) : <p className="px-5 py-4 text-sm text-subtle">No previous assignments.</p>}
      </Card>
    </div>
  );
}

/* ================================================================== documents */
async function DocumentsTab({ ctx, subId }: { ctx: Ctx; subId: string }) {
  if (!ctx.can("documents.read")) return <Restricted title="Documents are not available to you">Viewing documents needs document access.</Restricted>;
  const supabase = await createClient();
  const [lookups, { data: docs }] = await Promise.all([
    getLookups(ctx.tenantId),
    supabase.from("documents").select("id, name, category, size_bytes, expires_on, created_at").eq("tenant_id", ctx.tenantId).eq("subcontractor_id", subId).order("created_at", { ascending: false }),
  ]);
  return (
    <Card>
      <CardHeader title="Documents" description="Insurance certificates, CIS verification, RAMS and accreditations. Stored privately." />
      {ctx.can("documents.write") && (
        <div className="border-b border-line px-5 py-4">
          <UploadForm endpoint={`/subcontractors/${subId}/files`} categories={lookups.options("document_category")} />
        </div>
      )}
      {docs?.length ? (
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Category</TH>
              <TH>Expires</TH>
              <TH>Added</TH>
              <TH align="right" className="relative"><span className="sr-only">Actions</span></TH>
            </tr>
          </THead>
          <tbody>
            {docs.map((d) => (
              <TR key={d.id}>
                <TD className="max-w-xs">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 shrink-0 text-subtle" aria-hidden />
                    <span className="truncate font-medium">{d.name}</span>
                  </div>
                </TD>
                <TD className="text-[13px] text-muted">{lookups.label("document_category", d.category)}</TD>
                <TD className="text-[13px]"><ExpiryDate value={d.expires_on} /></TD>
                <TD className="whitespace-nowrap text-[13px] text-muted">{date(d.created_at)}</TD>
                <TD align="right">
                  <span className="inline-flex items-start gap-2">
                    <DownloadButton documentId={d.id} />
                    {ctx.can("documents.delete") && <DeleteDocumentButton documentId={d.id} name={d.name} />}
                  </span>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<FileText className="size-7" aria-hidden />} title="No documents yet">Upload their insurance certificate so its expiry can be checked.</EmptyState>
      )}
    </Card>
  );
}
