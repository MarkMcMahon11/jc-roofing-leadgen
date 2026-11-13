"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { formObject, fromDb, fromZod, type ActionResult } from "@/lib/actions";
import { ACTIVITY_KEYS, STAGE_KEYS, londonToISO, type Opt } from "./_lib/shared";

const optText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`).optional();
const optUuid = z.string().uuid("Choose an option from the list").optional();
const optEmail = z.string().trim().toLowerCase().email("Enter a valid email address").max(320).optional();
const checkbox = z.string().optional().transform((v) => v === "on" || v === "true");
const nul = <T,>(v: T | undefined) => (v === undefined ? null : v);

/* ------------------------------------------------------------------ organisations */
const orgSchema = z.object({
  id: optUuid,
  name: z.string().trim().min(2, "Enter the client's name").max(200),
  category: z.string().min(1, "Choose a category"),
  status: z.enum(["prospect", "active", "inactive"], { message: "Choose a status" }),
  company_number: optText(20),
  vat_number: optText(20),
  website: optText(200),
  email: optEmail,
  phone: optText(40),
  address_line1: optText(200),
  address_line2: optText(200),
  town: optText(100),
  postcode: z.string().trim().toUpperCase().max(10, "Postcodes are at most 10 characters").optional(),
  account_manager_id: optUuid,
  contract_manager_id: optUuid,
  payment_terms_days: z.coerce.number({ message: "Enter a number of days" }).int("Whole days only").min(0).max(365, "At most 365 days").default(30),
  credit_limit: z.coerce.number({ message: "Enter an amount" }).min(0, "Cannot be negative").max(999_999_999_999).optional(),
  tags: z
    .string()
    .max(500)
    .optional()
    .transform((v) => [...new Set((v ?? "").split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 20)),
  notes: optText(10000),
});

export async function saveOrganisation(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("crm.write");
  const parsed = orgSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const lookups = await getLookups(ctx.tenantId);
  if (!lookups.options("organisation_category").some((o) => o.value === d.category)) {
    // a category hidden in Settings stays valid on clients that already use it
    const { data: cur } = d.id ? await supabase.from("organisations").select("category").eq("id", d.id).eq("tenant_id", ctx.tenantId).maybeSingle() : { data: null };
    if (cur?.category !== d.category) return { ok: false, fieldErrors: { category: ["Choose a category"] } };
  }

  const row = {
    name: d.name,
    category: d.category,
    status: d.status,
    company_number: nul(d.company_number),
    vat_number: nul(d.vat_number),
    website: nul(d.website),
    email: nul(d.email),
    phone: nul(d.phone),
    address_line1: nul(d.address_line1),
    address_line2: nul(d.address_line2),
    town: nul(d.town),
    postcode: nul(d.postcode),
    account_manager_id: nul(d.account_manager_id),
    contract_manager_id: nul(d.contract_manager_id),
    payment_terms_days: d.payment_terms_days,
    credit_limit: nul(d.credit_limit),
    tags: d.tags,
    notes: nul(d.notes),
  };
  let id = d.id;
  if (id) {
    const { data, error } = await supabase.from("organisations").update(row).eq("id", id).eq("tenant_id", ctx.tenantId).select("id");
    if (error) return fromDb(error);
    if (!data?.length) return { ok: false, message: "This client no longer exists." };
  } else {
    const { data, error } = await supabase.from("organisations").insert({ ...row, tenant_id: ctx.tenantId, reference: "" }).select("id").single();
    if (error) return fromDb(error);
    id = data.id;
  }
  revalidatePath("/crm");
  revalidatePath(`/crm/${id}`);
  redirect(`/crm/${id}`);
}

export async function deleteOrganisation(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("crm.delete");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, message: "Invalid request." };
  const supabase = await createClient();
  const [cons, props, jobs] = await Promise.all([
    supabase.from("contracts").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("organisation_id", id.data),
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("organisation_id", id.data),
    supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("organisation_id", id.data),
  ]);
  const blockers = [
    cons.count ? `${cons.count} contract${cons.count === 1 ? "" : "s"}` : null,
    props.count ? `${props.count} propert${props.count === 1 ? "y" : "ies"}` : null,
    jobs.count ? `${jobs.count} job${jobs.count === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  if (blockers.length) return { ok: false, message: `This client still has ${blockers.join(", ")}, so it cannot be deleted. Set its status to inactive instead.` };
  const { data, error } = await supabase.from("organisations").delete().eq("id", id.data).eq("tenant_id", ctx.tenantId).select("id");
  if (error) {
    if (error.code === "23503") return { ok: false, message: "This client is still linked to contracts, properties, quotations or invoices, so it cannot be deleted. Set its status to inactive instead." };
    return fromDb(error, "The client could not be deleted.");
  }
  if (!data?.length) return { ok: false, message: "This client could not be deleted." };
  revalidatePath("/crm");
  redirect("/crm");
}

/* ------------------------------------------------------------------ contacts */
const contactSchema = z.object({
  id: optUuid,
  organisation_id: z.string().uuid(),
  first_name: z.string().trim().min(1, "Enter a first name").max(80),
  last_name: z.string().trim().max(80).optional(),
  job_title: optText(120),
  email: optEmail,
  phone: optText(40),
  mobile: optText(40),
  preferred_channel: z.enum(["email", "phone", "sms", "whatsapp", "post"]).default("email"),
  is_primary: checkbox,
  is_billing: checkbox,
  notes: optText(5000),
});

export async function saveContact(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("crm.write");
  const parsed = contactSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  // one primary contact per client (unique index): clear the old one first
  if (d.is_primary) {
    let clear = supabase.from("contacts").update({ is_primary: false }).eq("tenant_id", ctx.tenantId).eq("organisation_id", d.organisation_id).eq("is_primary", true);
    if (d.id) clear = clear.neq("id", d.id);
    const { error } = await clear;
    if (error) return fromDb(error);
  }
  const row = {
    first_name: d.first_name,
    last_name: d.last_name ?? "",
    job_title: nul(d.job_title),
    email: nul(d.email),
    phone: nul(d.phone),
    mobile: nul(d.mobile),
    preferred_channel: d.preferred_channel,
    is_primary: d.is_primary,
    is_billing: d.is_billing,
    notes: nul(d.notes),
  };
  if (d.id) {
    const { data, error } = await supabase.from("contacts").update(row).eq("id", d.id).eq("tenant_id", ctx.tenantId).eq("organisation_id", d.organisation_id).select("id");
    if (error) return fromDb(error);
    if (!data?.length) return { ok: false, message: "This contact no longer exists." };
  } else {
    const { error } = await supabase.from("contacts").insert({ ...row, tenant_id: ctx.tenantId, organisation_id: d.organisation_id });
    if (error) return fromDb(error);
  }
  revalidatePath(`/crm/${d.organisation_id}`);
  revalidatePath("/crm");
  return { ok: true, message: d.id ? "Contact updated." : `${d.first_name} added.` };
}

export async function contactAction(contactId: string, op: "primary" | "archive" | "restore"): Promise<ActionResult> {
  const ctx = await requireInternal("crm.write");
  const id = z.string().uuid().parse(contactId);
  const supabase = await createClient();
  const { data: c } = await supabase.from("contacts").select("id, organisation_id, archived_at").eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!c) return { ok: false, message: "This contact no longer exists." };
  if (op === "primary") {
    if (c.archived_at) return { ok: false, message: "Restore this contact before making them the primary contact." };
    const { error: e1 } = await supabase.from("contacts").update({ is_primary: false }).eq("tenant_id", ctx.tenantId).eq("organisation_id", c.organisation_id).eq("is_primary", true).neq("id", id);
    if (e1) return fromDb(e1);
    const { error } = await supabase.from("contacts").update({ is_primary: true }).eq("id", id).eq("tenant_id", ctx.tenantId);
    if (error) return fromDb(error);
  } else {
    const patch = op === "archive" ? { archived_at: new Date().toISOString(), is_primary: false } : { archived_at: null };
    const { error } = await supabase.from("contacts").update(patch).eq("id", id).eq("tenant_id", ctx.tenantId);
    if (error) return fromDb(error);
  }
  revalidatePath(`/crm/${c.organisation_id}`);
  revalidatePath("/crm");
  return { ok: true, message: op === "primary" ? "Primary contact updated." : op === "archive" ? "Contact archived." : "Contact restored." };
}

/** Contacts of one client, for dependent pickers (opportunities, contracts). */
export async function contactOptions(organisationId: string): Promise<Opt[]> {
  const ctx = await requireInternal("crm.read");
  const id = z.string().uuid().safeParse(organisationId);
  if (!id.success) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, job_title, is_primary")
    .eq("tenant_id", ctx.tenantId)
    .eq("organisation_id", id.data)
    .is("archived_at", null)
    .order("is_primary", { ascending: false })
    .order("first_name");
  return (data ?? []).map((c) => ({ value: c.id, label: `${c.first_name} ${c.last_name}`.trim() + (c.job_title ? ` · ${c.job_title}` : "") + (c.is_primary ? " (primary)" : "") }));
}

/* ------------------------------------------------------------------ activities */
const activitySchema = z.object({
  organisation_id: z.string().uuid(),
  type: z.enum(ACTIVITY_KEYS, { message: "Choose a type" }),
  subject: z.string().trim().min(1, "Enter a subject").max(200),
  body: optText(10000),
  contact_id: optUuid,
  opportunity_id: optUuid,
  owner_id: optUuid,
  due_at: z.string().optional(),
});

export async function addActivity(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("crm.write");
  const parsed = activitySchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  let due: string | null = null;
  if (d.due_at) {
    due = londonToISO(d.due_at);
    if (!due) return { ok: false, fieldErrors: { due_at: ["Enter a valid date and time"] } };
  }
  if ((d.type === "follow_up" || d.type === "task") && !due) return { ok: false, fieldErrors: { due_at: ["Follow-ups and tasks need a due date"] } };
  const supabase = await createClient();
  const { error } = await supabase.from("crm_activities").insert({
    tenant_id: ctx.tenantId,
    organisation_id: d.organisation_id,
    type: d.type,
    subject: d.subject,
    body: nul(d.body),
    contact_id: nul(d.contact_id),
    opportunity_id: nul(d.opportunity_id),
    owner_id: d.owner_id ?? ctx.userId,
    due_at: due,
  });
  if (error) return fromDb(error);
  revalidatePath(`/crm/${d.organisation_id}`);
  revalidatePath("/crm/follow-ups");
  revalidatePath("/crm");
  return { ok: true, message: due ? "Saved. It will appear in follow-ups until it is marked done." : "Activity logged." };
}

export async function setActivityDone(activityId: string, done: boolean): Promise<ActionResult> {
  const ctx = await requireInternal("crm.write");
  const id = z.string().uuid().parse(activityId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_activities")
    .update({ completed_at: done ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .select("organisation_id");
  if (error) return fromDb(error);
  if (!data?.length) return { ok: false, message: "This activity no longer exists." };
  revalidatePath(`/crm/${data[0].organisation_id}`);
  revalidatePath("/crm/follow-ups");
  revalidatePath("/crm");
  return { ok: true, message: done ? "Marked as done." : "Reopened." };
}

/* ------------------------------------------------------------------ opportunities */
const oppSchema = z.object({
  id: optUuid,
  organisation_id: z.string({ message: "Choose a client" }).uuid("Choose a client"),
  contact_id: optUuid,
  title: z.string().trim().min(2, "Enter a title").max(200),
  description: optText(10000),
  stage: z.enum(STAGE_KEYS).optional(),
  value: z.coerce.number({ message: "Enter a value" }).min(0, "Cannot be negative").max(999_999_999_999).default(0),
  probability: z.coerce.number({ message: "Enter a percentage" }).int("Whole numbers only").min(0, "0-100").max(100, "0-100").default(10),
  expected_close_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").optional(),
  owner_id: optUuid,
  source: z.string().max(60).optional(),
});

export async function saveOpportunity(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("crm.write");
  const parsed = oppSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  if (d.source) {
    const lookups = await getLookups(ctx.tenantId);
    if (!lookups.options("lead_source").some((o) => o.value === d.source)) return { ok: false, fieldErrors: { source: ["Choose a source from the list"] } };
  }
  const supabase = await createClient();
  if (d.contact_id) {
    const { data: c } = await supabase.from("contacts").select("organisation_id").eq("id", d.contact_id).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (c?.organisation_id !== d.organisation_id) return { ok: false, fieldErrors: { contact_id: ["Choose a contact at this client"] } };
  }
  const row = {
    organisation_id: d.organisation_id,
    contact_id: nul(d.contact_id),
    title: d.title,
    description: nul(d.description),
    value: d.value,
    probability: d.probability,
    expected_close_date: nul(d.expected_close_date),
    owner_id: d.owner_id ?? ctx.userId,
    source: nul(d.source),
  };
  if (d.id) {
    const { data, error } = await supabase.from("crm_opportunities").update(row).eq("id", d.id).eq("tenant_id", ctx.tenantId).select("id");
    if (error) return fromDb(error);
    if (!data?.length) return { ok: false, message: "This opportunity no longer exists." };
  } else {
    const stage = d.stage ?? "lead";
    const closed = stage === "won" || stage === "lost";
    const { error } = await supabase
      .from("crm_opportunities")
      .insert({ ...row, tenant_id: ctx.tenantId, reference: "", stage, closed_at: closed ? new Date().toISOString() : null });
    if (error) return fromDb(error);
  }
  revalidatePath("/crm/pipeline");
  revalidatePath(`/crm/${d.organisation_id}`);
  revalidatePath("/crm");
  return { ok: true, message: d.id ? "Opportunity updated." : "Opportunity added to the pipeline." };
}

const moveSchema = z.object({
  id: z.string().uuid(),
  stage: z.enum(STAGE_KEYS),
  lost_reason: z.string().trim().max(1000).optional(),
});

export async function moveOpportunity(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("crm.write");
  const parsed = moveSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { id, stage, lost_reason } = parsed.data;
  if (stage === "lost" && !lost_reason) return { ok: false, fieldErrors: { lost_reason: ["Say why it was lost - it helps future bids"] } };
  const supabase = await createClient();
  const { data: current } = await supabase.from("crm_opportunities").select("stage, probability, organisation_id").eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!current) return { ok: false, message: "This opportunity no longer exists." };
  if (current.stage === stage) return { ok: true };
  const closing = stage === "won" || stage === "lost";
  const wasClosed = current.stage === "won" || current.stage === "lost";
  const { error } = await supabase
    .from("crm_opportunities")
    .update({
      stage,
      closed_at: closing ? new Date().toISOString() : null,
      lost_reason: stage === "lost" ? lost_reason : null,
      // won is certain, lost is zero; reopening a closed deal resets to a neutral estimate
      probability: stage === "won" ? 100 : stage === "lost" ? 0 : wasClosed ? 50 : current.probability,
    })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId);
  if (error) return fromDb(error);
  revalidatePath("/crm/pipeline");
  revalidatePath(`/crm/${current.organisation_id}`);
  revalidatePath("/crm");
  return { ok: true, message: stage === "won" ? "Marked as won." : stage === "lost" ? "Marked as lost." : "Stage updated." };
}

export async function deleteOpportunity(opportunityId: string): Promise<ActionResult> {
  const ctx = await requireInternal("crm.delete");
  const id = z.string().uuid().parse(opportunityId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("crm_opportunities").delete().eq("id", id).eq("tenant_id", ctx.tenantId).select("organisation_id");
  if (error) return fromDb(error);
  if (!data?.length) return { ok: false, message: "This opportunity could not be deleted." };
  revalidatePath("/crm/pipeline");
  revalidatePath(`/crm/${data[0].organisation_id}`);
  return { ok: true, message: "Opportunity deleted." };
}
