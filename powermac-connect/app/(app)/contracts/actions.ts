"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { formObject, fromDb, fromZod, type ActionResult } from "@/lib/actions";
import { CONTRACT_STATUS_KEYS, DEFAULT_KPIS, DEFAULT_SLAS, METRIC_KEYS, PRICING_KEYS, PRIORITY_KEYS } from "./_lib/constants";

const optText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`).optional();
const optUuid = z.string().uuid("Choose an option from the list").optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").optional();
const nul = <T,>(v: T | undefined) => (v === undefined ? null : v);
const MAX_UPLOAD = 50 * 1024 * 1024;

function touch(contractId: string, orgId?: string | null) {
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/contracts");
  if (orgId) revalidatePath(`/crm/${orgId}`);
}

/* ------------------------------------------------------------------ contracts */
const contractSchema = z
  .object({
    id: optUuid,
    opportunity_id: optUuid,
    organisation_id: z.string({ message: "Choose a client" }).uuid("Choose a client"),
    title: z.string().trim().min(2, "Enter a contract title").max(200),
    client_reference: optText(60),
    contract_type: z.string().min(1, "Choose a contract type"),
    scope_of_work: optText(20000),
    status: z.enum(CONTRACT_STATUS_KEYS, { message: "Choose a status" }),
    value: z.coerce.number({ message: "Enter the contract value" }).min(0, "Cannot be negative").max(999_999_999_999),
    annual_budget: z.coerce.number({ message: "Enter an amount" }).min(0, "Cannot be negative").max(999_999_999_999).optional(),
    start_date: isoDate,
    end_date: isoDate,
    renewal_date: isoDate,
    notice_period_days: z.coerce.number({ message: "Enter a number of days" }).int("Whole days only").min(0).max(730, "At most 730 days").optional(),
    payment_terms_days: z.coerce.number({ message: "Enter a number of days" }).int("Whole days only").min(0).max(365, "At most 365 days").default(30),
    retention_percent: z.coerce.number({ message: "Enter a percentage" }).min(0, "0-100").max(100, "0-100").default(0),
    pricing_basis: z.enum(PRICING_KEYS, { message: "Choose a pricing basis" }),
    contract_manager_id: optUuid,
    client_contact_id: optUuid,
    auto_renew: z.string().optional().transform((v) => v === "on"),
    notes: optText(10000),
  })
  .refine((d) => !d.start_date || !d.end_date || d.end_date >= d.start_date, { path: ["end_date"], message: "The end date must be on or after the start date" })
  .refine((d) => !d.end_date || !d.renewal_date || d.renewal_date <= d.end_date, { path: ["renewal_date"], message: "The renewal decision date should be before the end date" });

export async function saveContract(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("contracts.write");
  const parsed = contractSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();

  const lookups = await getLookups(ctx.tenantId);
  if (!lookups.options("contract_type").some((o) => o.value === d.contract_type)) {
    const { data: cur } = d.id ? await supabase.from("contracts").select("contract_type").eq("id", d.id).eq("tenant_id", ctx.tenantId).maybeSingle() : { data: null };
    if (cur?.contract_type !== d.contract_type) return { ok: false, fieldErrors: { contract_type: ["Choose a contract type"] } };
  }
  if (d.client_contact_id) {
    const { data: c } = await supabase.from("contacts").select("organisation_id").eq("id", d.client_contact_id).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (c?.organisation_id !== d.organisation_id) return { ok: false, fieldErrors: { client_contact_id: ["Choose a contact at this client"] } };
  }

  const row = {
    organisation_id: d.organisation_id,
    title: d.title,
    client_reference: nul(d.client_reference),
    contract_type: d.contract_type,
    scope_of_work: nul(d.scope_of_work),
    status: d.status,
    value: d.value,
    annual_budget: nul(d.annual_budget),
    start_date: nul(d.start_date),
    end_date: nul(d.end_date),
    renewal_date: nul(d.renewal_date),
    notice_period_days: nul(d.notice_period_days),
    payment_terms_days: d.payment_terms_days,
    retention_percent: d.retention_percent,
    pricing_basis: d.pricing_basis,
    contract_manager_id: nul(d.contract_manager_id),
    client_contact_id: nul(d.client_contact_id),
    auto_renew: d.auto_renew,
    notes: nul(d.notes),
  };

  let id = d.id;
  if (id) {
    const { data: before } = await supabase.from("contracts").select("organisation_id").eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!before) return { ok: false, message: "This contract no longer exists." };
    if (before.organisation_id !== d.organisation_id) {
      const { count } = await supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("contract_id", id);
      if (count) return { ok: false, fieldErrors: { organisation_id: [`This contract has ${count} jobs, so it cannot move to another client.`] } };
    }
    const { error } = await supabase.from("contracts").update(row).eq("id", id).eq("tenant_id", ctx.tenantId);
    if (error) return fromDb(error);
    if (before.organisation_id !== d.organisation_id) revalidatePath(`/crm/${before.organisation_id}`);
  } else {
    const { data, error } = await supabase.from("contracts").insert({ ...row, tenant_id: ctx.tenantId, reference: "" }).select("id").single();
    if (error) return fromDb(error);
    id = data.id;
    // a new contract is usable straight away: standard SLAs and KPIs, editable on the contract
    const [slas, kpis] = await Promise.all([
      supabase.from("contract_slas").insert(DEFAULT_SLAS.map((s) => ({ ...s, tenant_id: ctx.tenantId, contract_id: id! }))),
      supabase.from("contract_kpis").insert(DEFAULT_KPIS.map((k) => ({ ...k, tenant_id: ctx.tenantId, contract_id: id! }))),
    ]);
    if (slas.error || kpis.error) console.error("default SLAs/KPIs not created", slas.error ?? kpis.error);
    if (d.opportunity_id) {
      await supabase.from("crm_opportunities").update({ contract_id: id }).eq("id", d.opportunity_id).eq("tenant_id", ctx.tenantId).eq("organisation_id", d.organisation_id);
      revalidatePath("/crm/pipeline");
    }
  }
  touch(id!, d.organisation_id);
  redirect(`/contracts/${id}`);
}

export async function deleteContract(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("contracts.delete");
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, message: "Invalid request." };
  const supabase = await createClient();
  const { count: jobs } = await supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("contract_id", id.data);
  if (jobs) return { ok: false, message: `This contract has ${jobs} job${jobs === 1 ? "" : "s"}, so it cannot be deleted. Set its status to terminated or completed instead.` };
  const { data: docs } = await supabase.from("documents").select("storage_path").eq("tenant_id", ctx.tenantId).eq("contract_id", id.data);
  const { data, error } = await supabase.from("contracts").delete().eq("id", id.data).eq("tenant_id", ctx.tenantId).select("organisation_id");
  if (error) {
    if (error.code === "23503") return { ok: false, message: "This contract is still linked to other records, so it cannot be deleted. Set its status to terminated or completed instead." };
    return fromDb(error, "The contract could not be deleted.");
  }
  if (!data?.length) return { ok: false, message: "The contract could not be deleted." };
  if (docs?.length) await supabase.storage.from("documents").remove(docs.map((d) => d.storage_path));
  revalidatePath("/contracts");
  revalidatePath(`/crm/${data[0].organisation_id}`);
  redirect("/contracts");
}

/* ------------------------------------------------------------------ SLAs */
const hoursField = z.coerce.number({ message: "Enter hours" }).positive("Must be more than 0").max(99999).optional();
const slaSchema = z.object({
  contract_id: z.string().uuid(),
  priority: z.enum(PRIORITY_KEYS),
  response_hours: hoursField,
  attend_hours: hoursField,
  complete_hours: hoursField,
  description: optText(500),
});

export async function saveSla(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("contracts.write");
  const parsed = slaSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  if (d.response_hours && d.attend_hours && d.attend_hours < d.response_hours) return { ok: false, fieldErrors: { attend_hours: ["Attendance cannot be sooner than the response"] } };
  if (d.attend_hours && d.complete_hours && d.complete_hours < d.attend_hours) return { ok: false, fieldErrors: { complete_hours: ["Completion cannot be sooner than attendance"] } };
  const supabase = await createClient();
  const { error } = await supabase.from("contract_slas").upsert(
    {
      tenant_id: ctx.tenantId,
      contract_id: d.contract_id,
      priority: d.priority,
      response_hours: nul(d.response_hours),
      attend_hours: nul(d.attend_hours),
      complete_hours: nul(d.complete_hours),
      description: nul(d.description),
    },
    { onConflict: "contract_id,priority" },
  );
  if (error) return fromDb(error);
  touch(d.contract_id);
  return { ok: true };
}

export async function removeSla(contractId: string, priority: string): Promise<ActionResult> {
  const ctx = await requireInternal("contracts.write");
  const id = z.string().uuid().parse(contractId);
  const p = z.enum(PRIORITY_KEYS).parse(priority);
  const supabase = await createClient();
  const { error } = await supabase.from("contract_slas").delete().eq("tenant_id", ctx.tenantId).eq("contract_id", id).eq("priority", p);
  if (error) return fromDb(error);
  touch(id);
  return { ok: true };
}

/* ------------------------------------------------------------------ KPIs */
const kpiSchema = z.object({
  id: optUuid,
  contract_id: z.string().uuid(),
  name: z.string().trim().min(2, "Enter a name").max(120),
  metric_key: z.enum(METRIC_KEYS, { message: "Choose what is measured" }),
  target_value: z.coerce.number({ message: "Enter a target" }).min(-99_999_999).max(99_999_999),
  unit: z.string().trim().max(10, "At most 10 characters").default("%"),
  direction: z.enum(["higher_better", "lower_better"]),
  manual_value: z.coerce.number({ message: "Enter a number" }).min(-99_999_999).max(99_999_999).optional(),
});

export async function saveKpi(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("contracts.write");
  const parsed = kpiSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { id, contract_id, ...d } = parsed.data;
  const row = { ...d, unit: d.unit || "%", manual_value: nul(d.manual_value) };
  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase.from("contract_kpis").update(row).eq("id", id).eq("tenant_id", ctx.tenantId).eq("contract_id", contract_id).select("id");
    if (error) return fromDb(error);
    if (!data?.length) return { ok: false, message: "This KPI no longer exists." };
  } else {
    const { error } = await supabase.from("contract_kpis").insert({ ...row, tenant_id: ctx.tenantId, contract_id });
    if (error) return fromDb(error);
  }
  touch(contract_id);
  return { ok: true, message: id ? "KPI updated." : "KPI added." };
}

export async function removeKpi(kpiId: string): Promise<ActionResult> {
  const ctx = await requireInternal("contracts.write");
  const id = z.string().uuid().parse(kpiId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("contract_kpis").delete().eq("id", id).eq("tenant_id", ctx.tenantId).select("contract_id");
  if (error) return fromDb(error);
  if (data?.[0]) touch(data[0].contract_id);
  return { ok: true };
}

/* ------------------------------------------------------------------ variations */
const variationSchema = z.object({
  contract_id: z.string().uuid(),
  title: z.string().trim().min(2, "Enter a title").max(200),
  description: optText(10000),
  value: z.coerce.number({ message: "Enter the value (negative for an omission)" }).min(-999_999_999_999).max(999_999_999_999),
});

export async function proposeVariation(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("contracts.write");
  const parsed = variationSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("contract_variations").insert({ tenant_id: ctx.tenantId, reference: "", contract_id: d.contract_id, title: d.title, description: nul(d.description), value: d.value, status: "proposed" });
  if (error) return fromDb(error);
  touch(d.contract_id);
  return { ok: true, message: "Variation proposed. Someone with approval rights can now approve or reject it." };
}

export async function decideVariation(variationId: string, decision: "approved" | "rejected" | "withdrawn"): Promise<ActionResult> {
  const ctx = await requireInternal(decision === "withdrawn" ? "contracts.write" : "contracts.approve");
  const id = z.string().uuid().parse(variationId);
  const status = z.enum(["approved", "rejected", "withdrawn"]).parse(decision);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_variations")
    .update({ status })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "proposed")
    .select("contract_id");
  if (error) return fromDb(error);
  if (!data?.length) return { ok: false, message: "This variation has already been decided." };
  touch(data[0].contract_id);
  return { ok: true, message: status === "approved" ? "Variation approved." : status === "rejected" ? "Variation rejected." : "Variation withdrawn." };
}

/* ------------------------------------------------------------------ properties */
export type LinkableProperty = { id: string; reference: string; address: string; postcode: string };

async function contractOrg(contractId: string, tenantId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("contracts").select("id, organisation_id").eq("id", contractId).eq("tenant_id", tenantId).maybeSingle();
  return data;
}

/** The client's properties that are not yet on this contract, matching a search. */
export async function searchLinkableProperties(contractId: string, query: string): Promise<LinkableProperty[]> {
  const ctx = await requireInternal(["contracts.write"]);
  const cid = z.string().uuid().parse(contractId);
  const contract = await contractOrg(cid, ctx.tenantId);
  if (!contract) return [];
  const supabase = await createClient();
  const q = query.replace(/[%,()*\\:"']/g, " ").trim().slice(0, 80);
  let pq = supabase.from("properties").select("id, reference, address_line1, address_line2, town, postcode").eq("tenant_id", ctx.tenantId).eq("organisation_id", contract.organisation_id).is("archived_at", null);
  if (q) pq = pq.or(`address_line1.ilike.%${q}%,postcode.ilike.%${q}%,reference.ilike.%${q}%,town.ilike.%${q}%`);
  const { data: props } = await pq.order("address_line1").limit(80);
  if (!props?.length) return [];
  const { data: linked } = await supabase.from("contract_properties").select("property_id").eq("contract_id", cid).in("property_id", props.map((p) => p.id));
  const taken = new Set((linked ?? []).map((l) => l.property_id));
  return props
    .filter((p) => !taken.has(p.id))
    .slice(0, 25)
    .map((p) => ({ id: p.id, reference: p.reference, address: [p.address_line1, p.address_line2, p.town].filter(Boolean).join(", "), postcode: p.postcode }));
}

export async function linkProperties(contractId: string, propertyIds: string[] | "all"): Promise<ActionResult> {
  const ctx = await requireInternal("contracts.write");
  const cid = z.string().uuid().parse(contractId);
  const contract = await contractOrg(cid, ctx.tenantId);
  if (!contract) return { ok: false, message: "This contract no longer exists." };
  const supabase = await createClient();
  // only the contract client's own properties can be linked
  let pq = supabase.from("properties").select("id").eq("tenant_id", ctx.tenantId).eq("organisation_id", contract.organisation_id).is("archived_at", null);
  if (propertyIds !== "all") pq = pq.in("id", z.array(z.string().uuid()).min(1).max(500).parse(propertyIds));
  const { data: props, error: pe } = await pq.limit(5000);
  if (pe) return fromDb(pe);
  if (!props?.length) return { ok: false, message: "No matching properties belong to this client." };
  const { error } = await supabase
    .from("contract_properties")
    .upsert(props.map((p) => ({ tenant_id: ctx.tenantId, contract_id: cid, property_id: p.id })), { onConflict: "contract_id,property_id", ignoreDuplicates: true });
  if (error) return fromDb(error);
  touch(cid);
  return { ok: true, message: propertyIds === "all" ? "All of the client's properties are now on this contract." : `${props.length} propert${props.length === 1 ? "y" : "ies"} linked.` };
}

export async function unlinkProperty(contractId: string, propertyId: string): Promise<ActionResult> {
  const ctx = await requireInternal("contracts.write");
  const cid = z.string().uuid().parse(contractId);
  const pid = z.string().uuid().parse(propertyId);
  const supabase = await createClient();
  const { error } = await supabase.from("contract_properties").delete().eq("tenant_id", ctx.tenantId).eq("contract_id", cid).eq("property_id", pid);
  if (error) return fromDb(error);
  touch(cid);
  return { ok: true };
}

/* ------------------------------------------------------------------ documents */
// Files go straight from the browser to private storage using a one-time signed upload URL that
// is issued here with the user's own session (storage RLS: documents.write in this tenant), so
// large files never pass through the app server. The documents row is written afterwards.
export type UploadTicket = ActionResult & { path?: string; signedUrl?: string };

const uploadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().positive("The file is empty").max(MAX_UPLOAD, "Files can be up to 50 MB"),
  type: z.string().max(120).optional(),
});

export async function createDocumentUpload(contractId: string, file: { name: string; size: number; type?: string }): Promise<UploadTicket> {
  const ctx = await requireInternal("documents.write");
  const cid = z.string().uuid().parse(contractId);
  const parsed = uploadSchema.safeParse(file);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "That file cannot be uploaded." };
  const contract = await contractOrg(cid, ctx.tenantId);
  if (!contract) return { ok: false, message: "This contract no longer exists." };
  const safe = parsed.data.name.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").replace(/^[_.]+/, "").slice(-120) || "file";
  const path = `${ctx.tenantId}/contracts/${cid}/${randomUUID()}-${safe}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("documents").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "Upload could not be started. Check you have permission to add documents." };
  return { ok: true, path, signedUrl: data.signedUrl };
}

const recordSchema = z.object({
  path: z.string().max(400),
  name: z.string().trim().min(1, "Enter a name").max(255),
  category: z.string().min(1, "Choose a category"),
  size: z.number().int().min(0).max(MAX_UPLOAD),
  mime: z.string().max(120).optional(),
});

export async function recordContractDocument(contractId: string, input: z.input<typeof recordSchema>): Promise<ActionResult> {
  const ctx = await requireInternal("documents.write");
  const cid = z.string().uuid().parse(contractId);
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  const folder = `${ctx.tenantId}/contracts/${cid}`;
  const file = d.path.slice(folder.length + 1);
  if (!d.path.startsWith(folder + "/") || !file || file.includes("/") || d.path.includes("..")) return { ok: false, message: "Invalid upload." };
  const supabase = await createClient();
  const contract = await contractOrg(cid, ctx.tenantId);
  if (!contract) return { ok: false, message: "This contract no longer exists." };
  const lookups = await getLookups(ctx.tenantId);
  if (!lookups.options("document_category").some((o) => o.value === d.category)) return { ok: false, fieldErrors: { category: ["Choose a category"] } };
  const { data: listed } = await supabase.storage.from("documents").list(folder, { search: file, limit: 5 });
  if (!listed?.some((o) => o.name === file)) return { ok: false, message: "The upload did not complete. Please try again." };
  const { error } = await supabase.from("documents").insert({
    tenant_id: ctx.tenantId,
    name: d.name,
    category: d.category,
    storage_path: d.path,
    mime_type: nul(d.mime || undefined),
    size_bytes: d.size,
    contract_id: cid,
    organisation_id: contract.organisation_id,
  });
  if (error) {
    await supabase.storage.from("documents").remove([d.path]);
    return fromDb(error, "The document could not be saved.");
  }
  touch(cid);
  return { ok: true, message: `${d.name} uploaded.` };
}

export async function documentDownloadUrl(documentId: string): Promise<ActionResult & { url?: string }> {
  const ctx = await requireInternal("documents.read");
  const id = z.string().uuid().parse(documentId);
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("name, storage_path").eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!doc) return { ok: false, message: "This document no longer exists." };
  // keep the file's extension in the saved file name even when the display name has none
  const ext = /\.[a-z0-9]{1,8}$/i.exec(doc.storage_path)?.[0] ?? "";
  const filename = ext && !doc.name.toLowerCase().endsWith(ext.toLowerCase()) ? `${doc.name}${ext}` : doc.name;
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60, { download: filename });
  if (error || !data) return { ok: false, message: "The file could not be found in storage." };
  return { ok: true, url: data.signedUrl };
}

export async function deleteDocument(documentId: string): Promise<ActionResult> {
  const ctx = await requireInternal("documents.delete");
  const id = z.string().uuid().parse(documentId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("documents").delete().eq("id", id).eq("tenant_id", ctx.tenantId).select("storage_path, contract_id");
  if (error) return fromDb(error);
  if (!data?.length) return { ok: false, message: "This document could not be deleted." };
  await supabase.storage.from("documents").remove([data[0].storage_path]);
  if (data[0].contract_id) touch(data[0].contract_id);
  return { ok: true, message: "Document deleted." };
}
