"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PostgrestError } from "@supabase/supabase-js";
import { requireInternal, type TenantContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { fromDb, fromZod, formObject, type ActionResult } from "@/lib/actions";
import { getLookups, getStatuses } from "@/lib/data/lookups";
import { fromLondon } from "./_lib/time";
import { PRIORITIES, SOURCES } from "./_lib/constants";
import { getPermissionLabels, loadClientData } from "./_lib/data";
import { parseCsv } from "./_lib/csv";
import type { ContractOption, PropertyOption } from "./_lib/types";

const uuid = z.string().uuid();

/* ------------------------------------------------------------------ status moves */

/** Explains a refused status change using the database's own reason, in plain words. */
async function explainStatusError(error: PostgrestError, fromLabel: string, toLabel: string): Promise<string> {
  const perm = /requires the ([a-z_.]+) permission/.exec(error.message)?.[1];
  if (error.code === "42501" && perm) {
    const labels = await getPermissionLabels();
    return `Moving a job to “${toLabel}” needs the “${labels[perm] ?? perm}” permission, which your role does not have. The database refused the change.`;
  }
  if (error.code === "23514" && /not allowed by the workflow/.test(error.message)) {
    return `The job workflow does not allow moving a job from “${fromLabel}” to “${toLabel}”.`;
  }
  return fromDb(error, "The status could not be changed.").message ?? "The status could not be changed.";
}

export async function moveJob(jobId: string, toStatus: string, note?: string): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  if (!uuid.safeParse(jobId).success || !/^[a-z_]{2,40}$/.test(toStatus)) return { ok: false, message: "That move is not valid." };
  const supabase = await createClient();
  const statuses = await getStatuses(ctx.tenantId);
  const { data: job } = await supabase.from("work_orders").select("id, status, reference").eq("id", jobId).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!job) return { ok: false, message: "That job could not be found." };
  if (job.status === toStatus) return { ok: true };
  const from = statuses.get(job.status).label;
  const to = statuses.get(toStatus).label;

  const { data, error } = await supabase
    .from("work_orders")
    .update({ status: toStatus })
    .eq("id", jobId)
    .eq("tenant_id", ctx.tenantId)
    .eq("status", job.status) // someone else may have moved it meanwhile
    .select("id");
  if (error) return { ok: false, message: await explainStatusError(error, from, to) };
  if (!data?.length) return { ok: false, message: `${job.reference} was changed by someone else or you cannot edit it. Refresh and try again.` };

  const text = note?.trim();
  if (text) {
    await supabase.from("job_updates").insert({
      tenant_id: ctx.tenantId,
      work_order_id: jobId,
      type: "note",
      body: text.slice(0, 10000),
      visibility: "internal",
      data: { status_from: job.status, status_to: toStatus },
    });
  }
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  return { ok: true, message: `${job.reference} moved to ${to}.` };
}

/* ------------------------------------------------------------------ intake */

export async function rejectRequest(id: string): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  if (!uuid.safeParse(id).success) return { ok: false, message: "Unknown request." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbound_messages")
    .update({ status: "rejected", processed_by: ctx.userId, processed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "new")
    .select("id");
  if (error) return fromDb(error);
  if (!data?.length) return { ok: false, message: "That request was already handled." };
  revalidatePath("/jobs");
  return { ok: true, message: "Request rejected." };
}

/* ------------------------------------------------------------------ form lookups */

export async function loadClientOptions(orgId: string): Promise<{ properties: PropertyOption[]; contracts: ContractOption[] }> {
  const ctx = await requireInternal("work_orders.write");
  if (!uuid.safeParse(orgId).success) return { properties: [], contracts: [] };
  return loadClientData(ctx.tenantId, orgId);
}

export type PropertyInfo = {
  hazards: string[];
  restrictions: string | null;
  access_notes: string | null;
  contractIds: string[];
  occupants: { id: string; name: string; phone: string | null }[] | null;
};

export async function loadPropertyOptions(propertyId: string): Promise<PropertyInfo | null> {
  const ctx = await requireInternal("work_orders.read");
  if (!uuid.safeParse(propertyId).success) return null;
  const supabase = await createClient();
  const [{ data: p }, { data: cps }, occ] = await Promise.all([
    supabase.from("properties").select("hazards, restrictions, access_notes").eq("id", propertyId).eq("tenant_id", ctx.tenantId).maybeSingle(),
    supabase.from("contract_properties").select("contract_id").eq("tenant_id", ctx.tenantId).eq("property_id", propertyId),
    ctx.can("occupants.read")
      ? supabase.from("occupants").select("id, full_name, phone").eq("tenant_id", ctx.tenantId).eq("property_id", propertyId).eq("is_current", true).is("anonymised_at", null).order("full_name")
      : Promise.resolve({ data: null }),
  ]);
  if (!p) return null;
  return {
    hazards: p.hazards ?? [],
    restrictions: p.restrictions,
    access_notes: p.access_notes,
    contractIds: (cps ?? []).map((c) => c.contract_id),
    occupants: occ.data ? occ.data.map((o) => ({ id: o.id, name: o.full_name, phone: o.phone })) : null,
  };
}

/* ------------------------------------------------------------------ create & edit */

const optionalNumber = (max: number, msg: string) => z.coerce.number({ error: msg }).min(0, msg).max(max, msg).optional();
const londonDateTime = (msg: string) =>
  z
    .string()
    .optional()
    .refine((v) => !v || fromLondon(v) !== null, msg)
    .transform((v) => (v ? fromLondon(v)!.toISOString() : null));

const jobSchema = z
  .object({
    organisation_id: uuid.or(z.undefined()).refine((v) => Boolean(v), "Choose the client"),
    property_id: uuid.or(z.undefined()).refine((v) => Boolean(v), "Choose the property"),
    contract_id: uuid.optional(),
    occupant_id: uuid.optional(),
    title: z.string({ error: "Give the job a title" }).trim().min(3, "Give the job a title (at least 3 characters)").max(200, "Keep the title under 200 characters"),
    description: z.string().max(20000, "The description is too long").optional(),
    work_category: z.string({ error: "Choose a work category" }).regex(/^[a-z_]{2,60}$/, "Choose a work category"),
    trade: z.string({ error: "Choose a trade" }).regex(/^[a-z_]{2,60}$/, "Choose a trade"),
    priority: z.enum(PRIORITIES.map((p) => p.value) as [string, ...string[]], { error: "Choose a priority" }),
    source: z.enum(SOURCES.map((s) => s.value) as [string, ...string[]], { error: "Choose how the job came in" }),
    client_reference: z.string().max(60, "Keep the client reference under 60 characters").optional(),
    reported_at: londonDateTime("Enter a valid date and time"),
    target_attend_at: londonDateTime("Enter a valid date and time"),
    target_completion_at: londonDateTime("Enter a valid date and time"),
    estimated_hours: optionalNumber(10000, "Enter hours as a number"),
    estimated_cost: optionalNumber(1e9, "Enter an amount in pounds"),
    not_to_exceed: optionalNumber(1e9, "Enter an amount in pounds"),
    requires_approval: z.string().optional().transform((v) => v === "on"),
    access_notes: z.string().max(2000, "Keep access notes under 2,000 characters").optional(),
    manager_id: uuid.optional(),
    status: z.string().regex(/^[a-z_]{2,40}$/).optional(),
    intake_id: uuid.optional(),
  })
  .superRefine((v, c) => {
    if (v.target_attend_at && v.target_completion_at && v.target_completion_at < v.target_attend_at)
      c.addIssue({ code: "custom", path: ["target_completion_at"], message: "Completion target is before the attendance target" });
    if (v.reported_at && v.target_completion_at && v.target_completion_at < v.reported_at)
      c.addIssue({ code: "custom", path: ["target_completion_at"], message: "Completion target is before the job was reported" });
  });

type JobInput = z.infer<typeof jobSchema>;

async function validateJob(ctx: TenantContext, fd: FormData): Promise<{ data: JobInput } | { error: ActionResult }> {
  const parsed = jobSchema.safeParse(formObject(fd));
  if (!parsed.success) return { error: fromZod(parsed.error) };
  const lookups = await getLookups(ctx.tenantId);
  const fieldErrors: Record<string, string[]> = {};
  if (!lookups.options("work_category").some((o) => o.value === parsed.data.work_category)) fieldErrors.work_category = ["Choose a work category"];
  if (!lookups.options("trade").some((o) => o.value === parsed.data.trade)) fieldErrors.trade = ["Choose a trade"];
  if (Object.keys(fieldErrors).length) return { error: { ok: false, message: "Please check the highlighted fields.", fieldErrors } };
  return { data: parsed.data };
}

function jobColumns(d: JobInput, ctx: TenantContext) {
  return {
    organisation_id: d.organisation_id!,
    property_id: d.property_id!,
    contract_id: d.contract_id ?? null,
    ...(ctx.can("occupants.read") ? { occupant_id: d.occupant_id ?? null } : {}),
    title: d.title,
    description: d.description ?? null,
    work_category: d.work_category,
    trade: d.trade,
    priority: d.priority,
    source: d.source,
    client_reference: d.client_reference ?? null,
    reported_at: d.reported_at ?? new Date().toISOString(),
    target_attend_at: d.target_attend_at,
    target_completion_at: d.target_completion_at,
    estimated_hours: d.estimated_hours ?? null,
    estimated_cost: d.estimated_cost ?? null,
    not_to_exceed: d.not_to_exceed ?? null,
    requires_approval: d.requires_approval,
    access_notes: d.access_notes ?? null,
    manager_id: d.manager_id ?? null,
  };
}

export async function createJob(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  const v = await validateJob(ctx, fd);
  if ("error" in v) return v.error;
  const d = v.data;

  const statuses = await getStatuses(ctx.tenantId);
  const startable = statuses.list.filter((s) => s.is_active && (s.category === "intake" || s.category === "pre_works"));
  const status = d.status ?? startable[0]?.key;
  if (!status || !startable.some((s) => s.key === status)) return { ok: false, fieldErrors: { status: ["New jobs start in an intake or pre-works status"] }, message: "Please check the highlighted fields." };

  const supabase = await createClient();
  const { data: job, error } = await supabase
    .from("work_orders")
    .insert({ tenant_id: ctx.tenantId, reference: "", status, ...jobColumns(d, ctx) }) // reference is assigned by the database
    .select("id, reference")
    .single();
  if (error || !job) return fromDb(error, "The job could not be created.");

  if (d.intake_id) {
    await supabase
      .from("inbound_messages")
      .update({ status: "draft_created", work_order_id: job.id, processed_by: ctx.userId, processed_at: new Date().toISOString(), organisation_id: d.organisation_id })
      .eq("id", d.intake_id)
      .eq("tenant_id", ctx.tenantId)
      .in("status", ["new", "processing", "needs_info"]);
  }
  revalidatePath("/jobs");
  redirect(`/jobs/${job.id}?created=1`);
}

export async function updateJob(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  const id = String(fd.get("id") ?? "");
  if (!uuid.safeParse(id).success) return { ok: false, message: "Unknown job." };
  const v = await validateJob(ctx, fd);
  if ("error" in v) return v.error;
  const supabase = await createClient();
  const { data, error } = await supabase.from("work_orders").update(jobColumns(v.data, ctx)).eq("id", id).eq("tenant_id", ctx.tenantId).select("id");
  if (error) return fromDb(error, "The job could not be saved.");
  if (!data?.length) return { ok: false, message: "You cannot edit this job." };
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${id}`);
  redirect(`/jobs/${id}?saved=1`);
}

/* ------------------------------------------------------------------ bulk create */

export type BulkResult = ActionResult & {
  created?: { id: string; reference: string; title: string; address: string }[];
  unmatched?: { line: number; text: string; reason: string }[];
};

const bulkSchema = z.object({
  organisation_id: uuid.or(z.undefined()).refine((v) => Boolean(v), "Choose the client"),
  contract_id: uuid.optional(),
  work_category: z.string({ error: "Choose a work category" }).regex(/^[a-z_]{2,60}$/, "Choose a work category"),
  trade: z.string({ error: "Choose a trade" }).regex(/^[a-z_]{2,60}$/, "Choose a trade"),
  priority: z.enum(PRIORITIES.map((p) => p.value) as [string, ...string[]], { error: "Choose a priority" }),
  status: z.string({ error: "Choose a starting status" }).regex(/^[a-z_]{2,40}$/),
  title_template: z.string({ error: "Enter a title" }).trim().min(3, "Enter a title (at least 3 characters)").max(200),
  description: z.string().max(20000).optional(),
  estimated_hours: optionalNumber(10000, "Enter hours as a number"),
  mode: z.enum(["select", "csv"]),
  csv: z.string().max(200_000, "Paste at most a few thousand lines at a time").optional(),
});

const MAX_BULK = 500;
const normPostcode = (s: string) => s.toUpperCase().replace(/\s+/g, "");

function fillTemplate(tpl: string, p: { reference: string; address_line1: string; town: string; postcode: string }) {
  return tpl
    .replace(/\{address\}/gi, p.address_line1)
    .replace(/\{postcode\}/gi, p.postcode)
    .replace(/\{town\}/gi, p.town)
    .replace(/\{reference\}/gi, p.reference)
    .slice(0, 200);
}

export async function bulkCreateJobs(_: BulkResult, fd: FormData): Promise<BulkResult> {
  const ctx = await requireInternal("work_orders.write");
  const raw = formObject(fd);
  const parsed = bulkSchema.safeParse(raw);
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;

  const [statuses, lookups] = await Promise.all([getStatuses(ctx.tenantId), getLookups(ctx.tenantId)]);
  if (!statuses.list.some((s) => s.key === d.status && s.is_active && (s.category === "intake" || s.category === "pre_works")))
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors: { status: ["New jobs start in an intake or pre-works status"] } };
  if (!lookups.options("work_category").some((o) => o.value === d.work_category)) return { ok: false, fieldErrors: { work_category: ["Choose a work category"] } };
  if (!lookups.options("trade").some((o) => o.value === d.trade)) return { ok: false, fieldErrors: { trade: ["Choose a trade"] } };

  const supabase = await createClient();
  const { data: props } = await supabase
    .from("properties")
    .select("id, reference, address_line1, town, postcode")
    .eq("tenant_id", ctx.tenantId)
    .eq("organisation_id", d.organisation_id!)
    .is("archived_at", null)
    .limit(10000);
  const all = props ?? [];

  type Wanted = { property: (typeof all)[number]; title: string; description: string | null };
  const wanted: Wanted[] = [];
  const unmatched: NonNullable<BulkResult["unmatched"]> = [];

  if (d.mode === "select") {
    const ids = new Set(fd.getAll("property_id").map(String).filter((v) => uuid.safeParse(v).success));
    if (!ids.size) return { ok: false, message: "Tick at least one property." };
    for (const p of all) if (ids.has(p.id)) wanted.push({ property: p, title: fillTemplate(d.title_template, p), description: d.description ?? null });
  } else {
    const rows = parseCsv(d.csv ?? "");
    if (!rows.length) return { ok: false, fieldErrors: { csv: ["Paste at least one line"] }, message: "Paste at least one line." };
    const byRef = new Map(all.map((p) => [p.reference.toUpperCase(), p]));
    const byPostcode = new Map<string, typeof all>();
    for (const p of all) {
      const k = normPostcode(p.postcode);
      byPostcode.set(k, [...(byPostcode.get(k) ?? []), p]);
    }
    for (const r of rows) {
      const key = (r.cells[0] ?? "").trim();
      // a header row is fine to paste; skip it quietly
      if (r.line === 1 && /^(property|reference|ref|postcode)/i.test(key)) continue;
      if (!key) {
        unmatched.push({ line: r.line, text: r.text, reason: "No property reference or postcode" });
        continue;
      }
      let p = byRef.get(key.toUpperCase());
      if (!p) {
        const hits = byPostcode.get(normPostcode(key)) ?? [];
        if (hits.length > 1) {
          unmatched.push({ line: r.line, text: r.text, reason: `Postcode matches ${hits.length} properties - use the property reference` });
          continue;
        }
        p = hits[0];
      }
      if (!p) {
        unmatched.push({ line: r.line, text: r.text, reason: "No property of this client has that reference or postcode" });
        continue;
      }
      const title = (r.cells[1] ?? "").trim() || fillTemplate(d.title_template, p);
      if (title.length < 3) {
        unmatched.push({ line: r.line, text: r.text, reason: "Title too short" });
        continue;
      }
      wanted.push({ property: p, title: title.slice(0, 200), description: r.cells.slice(2).join(", ").trim() || d.description || null });
    }
  }

  if (!wanted.length) return { ok: false, message: "No jobs were created - nothing matched.", unmatched };
  if (wanted.length > MAX_BULK) return { ok: false, message: `That is ${wanted.length} jobs; create at most ${MAX_BULK} at a time.`, unmatched };

  // SLA targets from the contract for the chosen priority
  let attend: string | null = null;
  let complete: string | null = null;
  const now = new Date();
  if (d.contract_id) {
    const { data: sla } = await supabase.from("contract_slas").select("attend_hours, complete_hours").eq("tenant_id", ctx.tenantId).eq("contract_id", d.contract_id).eq("priority", d.priority).maybeSingle();
    if (sla?.attend_hours) attend = new Date(now.getTime() + Number(sla.attend_hours) * 3_600_000).toISOString();
    if (sla?.complete_hours) complete = new Date(now.getTime() + Number(sla.complete_hours) * 3_600_000).toISOString();
  }

  const { data: created, error } = await supabase
    .from("work_orders")
    .insert(
      wanted.map((w) => ({
        tenant_id: ctx.tenantId,
        reference: "",
        organisation_id: d.organisation_id!,
        contract_id: d.contract_id ?? null,
        property_id: w.property.id,
        title: w.title,
        description: w.description,
        work_category: d.work_category,
        trade: d.trade,
        priority: d.priority,
        status: d.status,
        source: "bulk",
        reported_at: now.toISOString(),
        target_attend_at: attend,
        target_completion_at: complete,
        estimated_hours: d.estimated_hours ?? null,
      })),
    )
    .select("id, reference, title, property_id");
  if (error) return { ...fromDb(error, "The jobs could not be created."), unmatched };

  const addr = new Map(wanted.map((w) => [w.property.id, `${w.property.address_line1}, ${w.property.postcode}`]));
  revalidatePath("/jobs");
  return {
    ok: true,
    message: `${created?.length ?? 0} job${created?.length === 1 ? "" : "s"} created.${unmatched.length ? ` ${unmatched.length} line${unmatched.length === 1 ? "" : "s"} not matched.` : ""}`,
    created: (created ?? []).map((c) => ({ id: c.id, reference: c.reference, title: c.title, address: addr.get(c.property_id) ?? "" })).sort((a, b) => a.reference.localeCompare(b.reference)),
    unmatched,
  };
}
