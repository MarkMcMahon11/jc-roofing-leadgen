import Link from "next/link";
import { Camera, ClipboardList, FileText, KeyRound, Lock, Plus, UserRound } from "lucide-react";
import type { TenantContext } from "@/lib/auth/context";
import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { getLookups, getStatuses } from "@/lib/data/lookups";
import { Badge, ButtonLink, Card, CardBody, CardHeader, ColourBadge, DefinitionList, EmptyState, Mono, Notice, priorityTone, Table, TD, TH, THead, TR, type Tone } from "@/components/ui/primitives";
import { date, dateTime, label, todayISO } from "@/lib/format";
import { DeleteDocumentButton, DeletePhotoButton, DownloadButton, UploadForm } from "../_components/files";
import { AddOccupantButton, EditOccupantButton, MoveOutButton } from "../_components/occupants";
import { AddCertificateButton, AddInspectionButton, DeleteCertificateButton, EditCertificateButton, EditInspectionButton } from "../_components/records";
import { isoToLondonInput } from "../_lib/time";
import { CERTIFICATE_TYPES, ExpiryDate, expiryState, hazardLabel, INSPECTION_TYPES, optLabel, Prose, vulnerabilityLabel } from "../_lib/ui";

type Ctx = TenantContext;
type PropertyRow = Tables<"properties"> & { organisation: { id: string; name: string } | null };

function Restricted({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <EmptyState icon={<Lock className="size-7" aria-hidden />} title={title}>
        {children}
      </EmptyState>
    </Card>
  );
}

/* ================================================================== overview */
export async function OverviewTab({ ctx, property: p }: { ctx: Ctx; property: PropertyRow }) {
  const supabase = await createClient();
  const lookups = await getLookups(ctx.tenantId);
  const { data: links } = ctx.can("contracts.read")
    ? await supabase.from("contract_properties").select("contract:contracts(id, reference, title, status)").eq("tenant_id", ctx.tenantId).eq("property_id", p.id)
    : { data: null };
  const contracts = (links ?? []).map((l) => l.contract).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const tenure = label(p.tenure).replace("Mid market", "Mid-market");

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader title="Property details" />
        <CardBody>
          <DefinitionList
            items={[
              { label: "Reference", value: <Mono>{p.reference}</Mono> },
              { label: "Client's reference", value: p.client_reference },
              { label: "UPRN", value: p.uprn ? <span className="font-mono text-[13px]">{p.uprn}</span> : null },
              {
                label: "Client",
                value: p.organisation ? (
                  ctx.can("crm.read") ? (
                    <Link className="text-accent-hi hover:underline" href={`/crm/${p.organisation.id}`}>
                      {p.organisation.name}
                    </Link>
                  ) : (
                    p.organisation.name
                  )
                ) : null,
              },
              { label: "Property type", value: lookups.label("property_type", p.property_type) },
              { label: "Tenure", value: tenure },
              { label: "Bedrooms", value: p.bedrooms ?? null },
              { label: "Build year", value: p.build_year ?? null },
              {
                label: "Address",
                value: (
                  <span className="whitespace-pre-line">
                    {[p.address_line1, p.address_line2, p.town, p.postcode].filter(Boolean).join("\n")}
                  </span>
                ),
              },
              {
                label: "Map location",
                value: p.latitude !== null ? <span className="tabular">{Number(p.latitude).toFixed(5)}, {Number(p.longitude).toFixed(5)}</span> : <span className="text-subtle">Not located</span>,
              },
              { label: "Added", value: date(p.created_at) },
              { label: "Last updated", value: dateTime(p.updated_at) },
            ]}
          />
        </CardBody>
      </Card>

      <div className="grid content-start gap-6">
        <Card>
          <CardHeader title="Access and safety" description="Shown to everyone sent to this property." />
          <CardBody className="grid gap-5">
            <div>
              <div className="mb-1.5 text-xs font-medium text-subtle">Hazards</div>
              {p.hazards.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {p.hazards.map((h) => (
                    <Badge key={h} tone="warn">{hazardLabel(h)}</Badge>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-subtle">None recorded</span>
              )}
            </div>
            <DefinitionList
              columns={1}
              items={[
                { label: "Access requirements", value: <Prose text={p.access_notes} /> },
                { label: "Restrictions", value: <Prose text={p.restrictions} /> },
              ]}
            />
            <div className="rounded-xl border border-line bg-sunken/70 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium text-subtle">
                <KeyRound className="size-3.5" aria-hidden />
                Key safe information · confidential
              </div>
              <div className="mt-1 text-sm">{p.key_safe_info ? <span className="font-mono">{p.key_safe_info}</span> : <span className="text-subtle">None recorded</span>}</div>
            </div>
          </CardBody>
        </Card>

        {ctx.can("contracts.read") && (
          <Card>
            <CardHeader title="Contracts" description="Contracts this property is covered by." />
            <CardBody>
              {contracts.length ? (
                <ul className="divide-y divide-line/70">
                  {contracts.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                      <Link href={`/contracts/${c.id}`} className="min-w-0 truncate text-sm hover:text-accent-hi">
                        <Mono>{c.reference}</Mono> <span className="ml-1">{c.title}</span>
                      </Link>
                      <Badge tone={c.status === "active" ? "ok" : "neutral"}>{label(c.status)}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-subtle">Not linked to a contract.{ctx.can("properties.write") && ctx.can("contracts.write") ? " Link one from Edit." : ""}</p>
              )}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Notes" />
          <CardBody>
            <p className="text-sm">
              <Prose text={p.notes} empty="No notes" />
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

/* ================================================================== occupants */
export async function OccupantsTab({ ctx, propertyId }: { ctx: Ctx; propertyId: string }) {
  if (!ctx.can("occupants.read"))
    return (
      <Restricted title="Occupant details restricted">
        Occupants&apos; personal data is only shown to people with occupant access. Ask an administrator if you need it for your work.
      </Restricted>
    );
  const supabase = await createClient();
  const { data } = await supabase
    .from("occupants")
    .select("id, full_name, phone, email, preferred_contact, is_current, move_in_date, move_out_date, access_needs, vulnerability_flags, consent_to_contact, anonymised_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("property_id", propertyId)
    .order("is_current", { ascending: false })
    .order("move_in_date", { ascending: false, nullsFirst: false });
  const rows = data ?? [];
  const current = rows.filter((o) => o.is_current);
  const former = rows.filter((o) => !o.is_current);
  const canWrite = ctx.can("occupants.write");
  const contactLabel: Record<string, string> = { phone: "Phone call", sms: "Text message", email: "Email", whatsapp: "WhatsApp", letter: "Letter", via_client: "Via the client" };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader
          title="Current occupants"
          description="Personal data. Use it only to arrange access and keep people safe."
          actions={canWrite ? <AddOccupantButton propertyId={propertyId} /> : undefined}
        />
        {current.length ? (
          <ul className="divide-y divide-line/70">
            {current.map((o) => (
              <li key={o.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <UserRound className="size-4 text-subtle" aria-hidden />
                    <span className="font-medium">{o.full_name}</span>
                    {!o.consent_to_contact && <Badge tone="warn">Do not contact directly</Badge>}
                    {o.vulnerability_flags.map((v) => (
                      <span key={v} className="rounded-md border border-line bg-raised px-1.5 py-0.5 text-[11px] text-muted" title="Support need (confidential)">
                        {vulnerabilityLabel(v)}
                      </span>
                    ))}
                  </div>
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div><dt className="text-xs text-subtle">Phone</dt><dd>{o.phone ? <a className="hover:text-accent-hi" href={`tel:${o.phone.replace(/\s+/g, "")}`}>{o.phone}</a> : "-"}</dd></div>
                    <div className="min-w-0"><dt className="text-xs text-subtle">Email</dt><dd className="truncate">{o.email ? <a className="hover:text-accent-hi" href={`mailto:${o.email}`}>{o.email}</a> : "-"}</dd></div>
                    <div><dt className="text-xs text-subtle">Preferred contact</dt><dd>{contactLabel[o.preferred_contact] ?? o.preferred_contact}</dd></div>
                    <div><dt className="text-xs text-subtle">Moved in</dt><dd>{date(o.move_in_date)}</dd></div>
                  </dl>
                  {o.access_needs && (
                    <p className="mt-2 text-sm text-muted">
                      <span className="text-xs text-subtle">Access needs: </span>
                      {o.access_needs}
                    </p>
                  )}
                </div>
                {canWrite && (
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <EditOccupantButton
                      propertyId={propertyId}
                      values={{
                        id: o.id,
                        full_name: o.full_name,
                        phone: o.phone,
                        email: o.email,
                        preferred_contact: o.preferred_contact,
                        move_in_date: o.move_in_date,
                        access_needs: o.access_needs,
                        vulnerability_flags: o.vulnerability_flags,
                        consent_to_contact: o.consent_to_contact,
                      }}
                    />
                    <MoveOutButton propertyId={propertyId} occupantId={o.id} name={o.full_name} today={todayISO()} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No current occupants">{canWrite ? "Add the people living or working here so operatives can arrange access." : "Nobody is recorded as living here."}</EmptyState>
        )}
      </Card>

      <Card>
        <CardHeader title="Former occupants" description="Anonymised automatically after the retention period set in Settings." />
        {former.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Moved in</TH>
                <TH>Moved out</TH>
                <TH>Status</TH>
              </tr>
            </THead>
            <tbody>
              {former.map((o) => (
                <TR key={o.id}>
                  <TD>{o.anonymised_at ? <span className="text-subtle">Former occupant</span> : o.full_name}</TD>
                  <TD className="text-muted">{date(o.move_in_date)}</TD>
                  <TD className="text-muted">{date(o.move_out_date)}</TD>
                  <TD>{o.anonymised_at ? <Badge>Anonymised {date(o.anonymised_at)}</Badge> : <Badge tone="info">Moved out</Badge>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="px-5 py-4 text-sm text-subtle">No former occupants recorded.</p>
        )}
      </Card>
    </div>
  );
}

/* ================================================================== jobs */
export async function JobsTab({ ctx, propertyId }: { ctx: Ctx; propertyId: string }) {
  if (!ctx.can("work_orders.read")) return <Restricted title="Jobs are not available to you">Viewing jobs needs work order access.</Restricted>;
  const supabase = await createClient();
  const [statuses, lookups, { data }] = await Promise.all([
    getStatuses(ctx.tenantId),
    getLookups(ctx.tenantId),
    supabase
      .from("work_orders")
      .select("id, reference, title, priority, status, trade, reported_at, target_completion_at, completed_at")
      .eq("tenant_id", ctx.tenantId)
      .eq("property_id", propertyId)
      .order("reported_at", { ascending: false })
      .limit(300),
  ]);
  const rows = data ?? [];
  const isOpen = (key: string) => statuses.get(key).counts_as_open === true;
  const open = rows.filter((w) => isOpen(w.status));
  const history = rows.filter((w) => !isOpen(w.status));
  const now = new Date().toISOString();

  const jobTable = (list: typeof rows, completed?: boolean) => (
    <Table>
      <THead>
        <tr>
          <TH>Reference</TH>
          <TH>Job</TH>
          <TH>Priority</TH>
          <TH>Status</TH>
          <TH>Reported</TH>
          <TH>{completed ? "Completed" : "Target date"}</TH>
        </tr>
      </THead>
      <tbody>
        {list.map((w) => {
          const s = statuses.get(w.status);
          const overdue = !completed && w.target_completion_at && w.target_completion_at < now;
          return (
            <TR key={w.id}>
              <TD className="whitespace-nowrap">
                <Link href={`/jobs/${w.id}`} className="hover:underline">
                  <Mono>{w.reference}</Mono>
                </Link>
              </TD>
              <TD>
                <Link href={`/jobs/${w.id}`} className="font-medium hover:text-accent-hi">
                  {w.title}
                </Link>
                <div className="text-xs text-subtle">{lookups.label("trade", w.trade)}</div>
              </TD>
              <TD>
                <Badge tone={priorityTone[w.priority] ?? "neutral"}>{label(w.priority)}</Badge>
              </TD>
              <TD>
                <ColourBadge colour={s.colour}>{s.label}</ColourBadge>
              </TD>
              <TD className="whitespace-nowrap text-[13px] text-muted">{date(w.reported_at)}</TD>
              <TD className="whitespace-nowrap text-[13px]">
                {completed ? (
                  <span className="text-muted">{date(w.completed_at)}</span>
                ) : w.target_completion_at ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className={overdue ? "text-[#ff8a87]" : "text-muted"}>{date(w.target_completion_at)}</span>
                    {overdue && <Badge tone="bad">Overdue</Badge>}
                  </span>
                ) : (
                  <span className="text-subtle">-</span>
                )}
              </TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader
          title="Open jobs"
          description={`${open.length} open`}
          actions={
            ctx.can("work_orders.write") ? (
              <ButtonLink href={`/jobs/new?property=${propertyId}`} variant="primary" size="sm">
                <Plus className="size-4" aria-hidden />
                New job
              </ButtonLink>
            ) : undefined
          }
        />
        {open.length ? jobTable(open) : <EmptyState icon={<ClipboardList className="size-7" aria-hidden />} title="No open jobs at this property" />}
      </Card>
      <Card>
        <CardHeader title="Job history" description={rows.length >= 300 ? "Most recent 300 jobs" : `${history.length} completed, closed or cancelled`} />
        {history.length ? jobTable(history, true) : <p className="px-5 py-4 text-sm text-subtle">No previous jobs.</p>}
      </Card>
    </div>
  );
}

/* ================================================================== inspections */
const RESULT_TONE: Record<string, Tone> = { pass: "ok", fail: "bad", advisory: "warn", not_applicable: "neutral" };

export async function InspectionsTab({ ctx, propertyId }: { ctx: Ctx; propertyId: string }) {
  if (!ctx.can("work_orders.read")) return <Restricted title="Inspections are not available to you">Viewing inspections needs work order access.</Restricted>;
  const supabase = await createClient();
  const [{ data }, { data: emps }] = await Promise.all([
    supabase
      .from("inspections")
      .select("id, reference, type, scheduled_for, completed_at, result, score, findings, inspector_id, work_order_id, inspector:employees(first_name, last_name)")
      .eq("tenant_id", ctx.tenantId)
      .eq("property_id", propertyId)
      .order("completed_at", { ascending: false, nullsFirst: true })
      .order("scheduled_for", { ascending: false }),
    ctx.can("workforce.read")
      ? supabase.from("employees").select("id, first_name, last_name").eq("tenant_id", ctx.tenantId).neq("employment_status", "left").order("last_name")
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
  ]);
  const rows = data ?? [];
  const inspectors = (emps ?? []).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}` }));
  const canWrite = ctx.can("work_orders.write");
  const now = new Date().toISOString();

  return (
    <Card>
      <CardHeader
        title="Inspections"
        description="Surveys, void, quality and compliance inspections at this property."
        actions={canWrite ? <AddInspectionButton propertyId={propertyId} inspectors={inspectors} /> : undefined}
      />
      {rows.length ? (
        <Table>
          <THead>
            <tr>
              <TH>Reference</TH>
              <TH>Type</TH>
              <TH>Inspector</TH>
              <TH>Scheduled</TH>
              <TH>Completed</TH>
              <TH>Result</TH>
              <TH>Findings</TH>
              {canWrite && <TH align="right"><span className="sr-only">Actions</span></TH>}
            </tr>
          </THead>
          <tbody>
            {rows.map((i) => {
              const late = !i.completed_at && i.scheduled_for && i.scheduled_for < now;
              return (
                <TR key={i.id}>
                  <TD className="whitespace-nowrap"><Mono>{i.reference}</Mono></TD>
                  <TD className="whitespace-nowrap">
                    {optLabel(INSPECTION_TYPES, i.type)}
                    {i.work_order_id && (
                      <div>
                        <Link href={`/jobs/${i.work_order_id}`} className="text-xs text-accent-hi hover:underline">Linked job</Link>
                      </div>
                    )}
                  </TD>
                  <TD className="text-[13px]">{i.inspector ? `${i.inspector.first_name} ${i.inspector.last_name}` : <span className="text-subtle">-</span>}</TD>
                  <TD className="whitespace-nowrap text-[13px] text-muted">
                    {i.scheduled_for ? dateTime(i.scheduled_for) : "-"}
                    {late && <div><Badge tone="warn">Not completed</Badge></div>}
                  </TD>
                  <TD className="whitespace-nowrap text-[13px] text-muted">{i.completed_at ? dateTime(i.completed_at) : <Badge tone="info">Scheduled</Badge>}</TD>
                  <TD className="whitespace-nowrap">
                    {i.result ? <Badge tone={RESULT_TONE[i.result] ?? "neutral"}>{label(i.result)}</Badge> : <span className="text-subtle">-</span>}
                    {i.score !== null && <div className="mt-0.5 text-xs text-subtle tabular">Score {Number(i.score)}</div>}
                  </TD>
                  <TD className="max-w-sm text-[13px] text-muted">
                    <span className="line-clamp-3 whitespace-pre-line">{i.findings ?? "-"}</span>
                  </TD>
                  {canWrite && (
                    <TD align="right">
                      <EditInspectionButton
                        propertyId={propertyId}
                        inspectors={inspectors}
                        label={i.completed_at ? "Edit" : "Record result"}
                        values={{
                          id: i.id,
                          type: i.type,
                          inspector_id: i.inspector_id,
                          scheduled_for: isoToLondonInput(i.scheduled_for),
                          completed_at: isoToLondonInput(i.completed_at),
                          result: i.result,
                          score: i.score === null ? null : Number(i.score),
                          findings: i.findings,
                        }}
                      />
                    </TD>
                  )}
                </TR>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<ClipboardList className="size-7" aria-hidden />} title="No inspections recorded">
          {canWrite ? "Schedule a survey or record a completed inspection." : undefined}
        </EmptyState>
      )}
    </Card>
  );
}

/* ================================================================== certificates */
export async function CertificatesTab({ ctx, propertyId }: { ctx: Ctx; propertyId: string }) {
  const supabase = await createClient();
  const canDocs = ctx.can("documents.read");
  const [{ data }, { data: docs }] = await Promise.all([
    supabase
      .from("certificates")
      .select("id, reference, type, issued_on, expires_on, issued_by, result, document_id, work_order_id")
      .eq("tenant_id", ctx.tenantId)
      .eq("property_id", propertyId)
      .order("issued_on", { ascending: false }),
    canDocs
      ? supabase.from("documents").select("id, name").eq("tenant_id", ctx.tenantId).eq("property_id", propertyId).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const rows = data ?? [];
  const docOptions = (docs ?? []).map((d) => ({ value: d.id, label: d.name }));
  const docName = new Map(docOptions.map((d) => [d.value, d.label]));
  // a certificate is superseded when a newer one of the same type exists
  const latest = new Map<string, string>();
  for (const c of rows) if (!latest.has(c.type)) latest.set(c.type, c.id);
  const canWrite = ctx.can("documents.write");
  const canDelete = ctx.can("documents.delete");
  const attention = rows.filter((c) => latest.get(c.type) === c.id && c.expires_on && (expiryState(c.expires_on).tone === "bad" || expiryState(c.expires_on).tone === "warn"));

  return (
    <div className="grid gap-4">
      {attention.length > 0 && (
        <Notice tone={attention.some((c) => expiryState(c.expires_on).tone === "bad") ? "bad" : "warn"} title="Compliance attention needed">
          {attention.map((c) => `${optLabel(CERTIFICATE_TYPES, c.type)} ${expiryState(c.expires_on).tone === "bad" ? "has expired" : `expires ${date(c.expires_on)}`}`).join(" · ")}
        </Notice>
      )}
      <Card>
        <CardHeader title="Certificates" description="Gas, electrical, fire and other compliance certificates. Flagged 30 days before expiry." actions={canWrite ? <AddCertificateButton propertyId={propertyId} documents={docOptions} /> : undefined} />
        {rows.length ? (
          <Table>
            <THead>
              <tr>
                <TH>Certificate</TH>
                <TH>Reference</TH>
                <TH>Issued</TH>
                <TH>Expires</TH>
                <TH>Outcome</TH>
                <TH>Document</TH>
                {(canWrite || canDelete) && <TH align="right"><span className="sr-only">Actions</span></TH>}
              </tr>
            </THead>
            <tbody>
              {rows.map((c) => {
                const superseded = latest.get(c.type) !== c.id;
                return (
                  <TR key={c.id} className={superseded ? "opacity-70" : undefined}>
                    <TD>
                      <div className="font-medium">{optLabel(CERTIFICATE_TYPES, c.type)}</div>
                      {c.issued_by && <div className="text-xs text-subtle">{c.issued_by}</div>}
                    </TD>
                    <TD className="whitespace-nowrap"><Mono>{c.reference}</Mono></TD>
                    <TD className="whitespace-nowrap text-[13px] text-muted">{date(c.issued_on)}</TD>
                    <TD className="text-[13px]">{superseded ? <span className="inline-flex flex-wrap items-center gap-1.5 text-muted">{date(c.expires_on)} <Badge>Superseded</Badge></span> : <ExpiryDate value={c.expires_on} quietWhenValid={false} emptyLabel="No expiry" />}</TD>
                    <TD>{c.result ? <Badge tone={c.result === "satisfactory" ? "ok" : c.result === "unsatisfactory" ? "bad" : "warn"}>{label(c.result)}</Badge> : <span className="text-subtle">-</span>}</TD>
                    <TD>
                      {c.document_id && canDocs ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="max-w-40 truncate text-[13px] text-muted">{docName.get(c.document_id) ?? "Document"}</span>
                          <DownloadButton documentId={c.document_id} label="Open" />
                        </span>
                      ) : (
                        <span className="text-subtle">-</span>
                      )}
                    </TD>
                    {(canWrite || canDelete) && (
                      <TD align="right">
                        <span className="inline-flex items-center gap-2">
                          {canWrite && (
                            <EditCertificateButton
                              propertyId={propertyId}
                              documents={docOptions}
                              values={{ id: c.id, type: c.type, issued_on: c.issued_on, expires_on: c.expires_on, issued_by: c.issued_by, result: c.result, document_id: c.document_id }}
                            />
                          )}
                          {canDelete && <DeleteCertificateButton propertyId={propertyId} id={c.id} />}
                        </span>
                      </TD>
                    )}
                  </TR>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <EmptyState icon={<FileText className="size-7" aria-hidden />} title="No certificates recorded">
            {canWrite ? "Record gas safety, EICR, fire risk and other certificates to track their expiry." : undefined}
          </EmptyState>
        )}
      </Card>
    </div>
  );
}

/* ================================================================== documents & photos */
function fileSize(n: number | null) {
  if (!n) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export async function DocumentsTab({ ctx, propertyId }: { ctx: Ctx; propertyId: string }) {
  const supabase = await createClient();
  const canDocs = ctx.can("documents.read");
  const canPhotos = ctx.can("work_orders.read");
  const lookups = await getLookups(ctx.tenantId);

  const [{ data: docs }, { data: jobIds }] = await Promise.all([
    canDocs
      ? supabase.from("documents").select("id, name, category, mime_type, size_bytes, visibility, expires_on, created_at").eq("tenant_id", ctx.tenantId).eq("property_id", propertyId).order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
    canPhotos ? supabase.from("work_orders").select("id").eq("tenant_id", ctx.tenantId).eq("property_id", propertyId).order("reported_at", { ascending: false }).limit(200) : Promise.resolve({ data: null }),
  ]);

  let photos: { id: string; url: string | null; caption: string | null; stage: string; taken_at: string | null; created_at: string; property_id: string | null; work_order_id: string | null }[] = [];
  if (canPhotos) {
    const ids = (jobIds ?? []).map((j) => j.id);
    const { data } = await supabase
      .from("photos")
      .select("id, storage_path, caption, stage, taken_at, created_at, property_id, work_order_id")
      .eq("tenant_id", ctx.tenantId)
      .or(ids.length ? `property_id.eq.${propertyId},work_order_id.in.(${ids.join(",")})` : `property_id.eq.${propertyId}`)
      .order("created_at", { ascending: false })
      .limit(60);
    const rows = data ?? [];
    const signed = rows.length ? (await supabase.storage.from("photos").createSignedUrls(rows.map((r) => r.storage_path), 3600)).data ?? [] : [];
    const urlFor = new Map(signed.filter((s) => s.path && s.signedUrl).map((s) => [s.path!, s.signedUrl]));
    photos = rows.map((r) => ({ ...r, url: urlFor.get(r.storage_path) ?? null }));
  }

  const categories = lookups.options("document_category");
  const visLabel: Record<string, string> = { internal: "Staff only", client: "Client", occupant: "Client & occupant" };

  return (
    <div className="grid gap-6">
      {canDocs ? (
        <Card>
          <CardHeader title="Documents" description="Stored privately. Download links last 60 seconds." />
          {ctx.can("documents.write") && (
            <div className="border-b border-line px-5 py-4">
              <UploadForm endpoint={`/properties/${propertyId}/files`} categories={categories} />
            </div>
          )}
          {docs?.length ? (
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Category</TH>
                  <TH>Visible to</TH>
                  <TH>Expires</TH>
                  <TH>Size</TH>
                  <TH>Added</TH>
                  <TH align="right"><span className="sr-only">Actions</span></TH>
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
                    <TD className="text-[13px] text-muted">{visLabel[d.visibility] ?? d.visibility}</TD>
                    <TD className="text-[13px]"><ExpiryDate value={d.expires_on} /></TD>
                    <TD className="text-[13px] text-muted tabular">{fileSize(d.size_bytes)}</TD>
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
            <EmptyState icon={<FileText className="size-7" aria-hidden />} title="No documents yet">
              Surveys, drawings, consents and reports for this property appear here.
            </EmptyState>
          )}
        </Card>
      ) : (
        <Restricted title="Documents are not available to you">Viewing documents needs document access.</Restricted>
      )}

      {canPhotos ? (
        <Card>
          <CardHeader title="Photos" description="Photos taken at this property and on its jobs." />
          {ctx.can("work_orders.write") && (
            <div className="border-b border-line px-5 py-4">
              <UploadForm endpoint={`/properties/${propertyId}/files`} kind="photo" />
            </div>
          )}
          {photos.length ? (
            <ul className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {photos.map((ph) => (
                <li key={ph.id} className="overflow-hidden rounded-xl border border-line bg-sunken">
                  {ph.url ? (
                    <a href={ph.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden">
                      {/* signed, short-lived storage URL: not suitable for the image optimiser */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ph.url} alt={ph.caption ?? `${label(ph.stage)} photo`} className="size-full object-cover transition-transform hover:scale-[1.03]" loading="lazy" />
                    </a>
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center text-xs text-subtle">Unavailable</div>
                  )}
                  <div className="flex items-start justify-between gap-2 px-2.5 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs text-fg">{ph.caption ?? label(ph.stage)}</div>
                      <div className="text-[11px] text-subtle">
                        {date(ph.taken_at ?? ph.created_at)}
                        {ph.work_order_id && (
                          <>
                            {" · "}
                            <Link href={`/jobs/${ph.work_order_id}`} className="text-accent-hi hover:underline">job</Link>
                          </>
                        )}
                      </div>
                    </div>
                    {ctx.can("work_orders.write") && ph.property_id === propertyId && <DeletePhotoButton photoId={ph.id} />}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Camera className="size-7" aria-hidden />} title="No photos yet">Photos from site visits and jobs appear here.</EmptyState>
          )}
        </Card>
      ) : (
        <Restricted title="Photos are not available to you">Viewing photos needs work order access.</Restricted>
      )}
    </div>
  );
}
