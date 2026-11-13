"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternal } from "@/lib/auth/context";
import { createClient, type ServerClient } from "@/lib/supabase/server";
import { formObject, fromDb, fromZod, type ActionResult } from "@/lib/actions";
import { geocodePostcode, normalisePostcode, POSTCODE_RE } from "./_lib/geo";
import { londonInputToISO } from "./_lib/time";

const opt = (max: number) => z.string().trim().max(max, `Up to ${max} characters`).optional();
const key = z.string().regex(/^[a-z0-9_]{1,60}$/, "Choose a value");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date");
const dtLocal = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a date and time");
const HAZARD_KEYS = ["asbestos", "working_at_height", "confined_space", "lone_working", "dog", "other"] as const;
const TENURES = ["social_rent", "mid_market", "private_rent", "owner_occupied", "commercial", "education", "public_building", "other"] as const;

/* ============================================================== properties */
const propertySchema = z.object({
  organisation_id: z.string().uuid("Choose the client"),
  address_line1: z.string().trim().min(2, "Enter the first line of the address").max(200),
  address_line2: opt(200),
  town: z.string().trim().min(2, "Enter the town").max(100),
  postcode: z.string().trim().regex(POSTCODE_RE, "Enter a valid UK postcode, e.g. G51 4TZ").transform(normalisePostcode),
  uprn: z.string().trim().regex(/^[0-9]{1,12}$/, "The UPRN is up to 12 digits").optional(),
  client_reference: opt(60),
  property_type: key,
  tenure: z.enum(TENURES),
  status: z.enum(["occupied", "void", "under_works", "inactive"]),
  bedrooms: z.coerce.number().int("Whole number").min(0).max(50).optional(),
  build_year: z.coerce.number().int("Whole number").min(1500, "Year from 1500").max(2100, "Year up to 2100").optional(),
  access_notes: opt(2000),
  restrictions: opt(2000),
  key_safe_info: opt(200),
  notes: opt(10000),
  hazards: z.array(z.enum(HAZARD_KEYS)).default([]),
  contract_ids: z.array(z.string().uuid()).default([]),
});

function parseProperty(fd: FormData) {
  return propertySchema.safeParse({ ...formObject(fd), hazards: fd.getAll("hazards").map(String), contract_ids: fd.getAll("contract_ids").map(String).filter(Boolean) });
}

function propertyRow(d: z.infer<typeof propertySchema>) {
  return {
    organisation_id: d.organisation_id,
    address_line1: d.address_line1,
    address_line2: d.address_line2 ?? null,
    town: d.town,
    postcode: d.postcode,
    uprn: d.uprn ?? null,
    client_reference: d.client_reference ?? null,
    property_type: d.property_type,
    tenure: d.tenure,
    status: d.status,
    bedrooms: d.bedrooms ?? null,
    build_year: d.build_year ?? null,
    access_notes: d.access_notes ?? null,
    restrictions: d.restrictions ?? null,
    key_safe_info: d.key_safe_info ?? null,
    notes: d.notes ?? null,
    hazards: d.hazards,
  };
}

/** Keeps contract links for the property in line with the selection (contracts of its client only). */
async function syncContracts(supabase: ServerClient, tenantId: string, propertyId: string, organisationId: string, wanted: string[]) {
  const [{ data: current }, { data: valid }] = await Promise.all([
    supabase.from("contract_properties").select("contract_id").eq("tenant_id", tenantId).eq("property_id", propertyId),
    supabase.from("contracts").select("id").eq("tenant_id", tenantId).eq("organisation_id", organisationId),
  ]);
  const validIds = new Set((valid ?? []).map((c) => c.id));
  const want = new Set(wanted.filter((id) => validIds.has(id)));
  const have = new Set((current ?? []).map((c) => c.contract_id));
  const remove = [...have].filter((id) => !want.has(id));
  const add = [...want].filter((id) => !have.has(id));
  if (remove.length) {
    const { error } = await supabase.from("contract_properties").delete().eq("tenant_id", tenantId).eq("property_id", propertyId).in("contract_id", remove);
    if (error) return error;
  }
  if (add.length) {
    const { error } = await supabase.from("contract_properties").insert(add.map((contract_id) => ({ tenant_id: tenantId, contract_id, property_id: propertyId })));
    if (error) return error;
  }
  return null;
}

export async function createProperty(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("properties.write");
  const parsed = parseProperty(formData);
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const geo = await geocodePostcode(d.postcode);
  const { data, error } = await supabase
    .from("properties")
    .insert({ ...propertyRow(d), tenant_id: ctx.tenantId, reference: "", latitude: geo.ok ? geo.lat : null, longitude: geo.ok ? geo.lng : null })
    .select("id")
    .single();
  if (error || !data) return fromDb(error, "The property could not be saved.");
  let contractsNote = "";
  if (d.contract_ids.length) {
    if (ctx.can("contracts.write")) {
      const e = await syncContracts(supabase, ctx.tenantId, data.id, d.organisation_id, d.contract_ids);
      if (e) contractsNote = "&contracts=failed";
    } else contractsNote = "&contracts=denied";
  }
  revalidatePath("/properties");
  redirect(`/properties/${data.id}?saved=created${geo.ok ? "" : `&geo=${geo.reason}`}${contractsNote}`);
}

export async function updateProperty(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("properties.write");
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Property not found." };
  const parsed = parseProperty(formData);
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { data: existing } = await supabase.from("properties").select("id, organisation_id, postcode, latitude").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle();
  if (!existing) return { ok: false, message: "Property not found." };

  if (existing.organisation_id !== d.organisation_id) {
    const { count } = await supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("property_id", id);
    if (count) return { ok: false, fieldErrors: { organisation_id: [`This property has ${count} job${count === 1 ? "" : "s"} for its current client, so the client cannot be changed.`] }, message: "Please check the highlighted fields." };
  }

  const postcodeChanged = normalisePostcode(existing.postcode) !== d.postcode;
  let geoFail: string | null = null;
  let coords: { latitude: number | null; longitude: number | null } | Record<string, never> = {};
  if (postcodeChanged || existing.latitude === null) {
    const geo = await geocodePostcode(d.postcode);
    if (geo.ok) coords = { latitude: geo.lat, longitude: geo.lng };
    else {
      geoFail = geo.reason;
      if (postcodeChanged) coords = { latitude: null, longitude: null }; // old pin would be in the wrong place
    }
  }
  const { error } = await supabase.from("properties").update({ ...propertyRow(d), ...coords }).eq("tenant_id", ctx.tenantId).eq("id", id);
  if (error) return fromDb(error, "The property could not be saved.");
  let contractsNote = "";
  if (ctx.can("contracts.write")) {
    const e = await syncContracts(supabase, ctx.tenantId, id, d.organisation_id, d.contract_ids);
    if (e) contractsNote = "&contracts=failed";
  }
  revalidatePath("/properties");
  revalidatePath(`/properties/${id}`);
  redirect(`/properties/${id}?saved=updated${geoFail ? `&geo=${geoFail}` : ""}${contractsNote}`);
}

export async function deleteProperty(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("properties.delete");
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Property not found." };
  const supabase = await createClient();
  const { count } = await supabase.from("work_orders").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("property_id", id);
  if (count) return { ok: false, message: `This property has ${count} job${count === 1 ? "" : "s"} and cannot be deleted. Set its status to Inactive instead.` };
  const { data, error } = await supabase.from("properties").delete().eq("tenant_id", ctx.tenantId).eq("id", id).select("id");
  if (error) return fromDb(error, "The property could not be deleted.");
  if (!data?.length) return { ok: false, message: "Nothing was deleted." };
  revalidatePath("/properties");
  redirect("/properties?deleted=1");
}

/* ============================================================== occupants (personal data) */
const VULN = ["mobility", "hearing", "sight", "language", "elderly", "medical", "mental_health", "safeguarding", "other"] as const;
const occupantSchema = z.object({
  id: z.string().uuid().optional(),
  property_id: z.string().uuid(),
  full_name: z.string().trim().min(1, "Enter the occupant's name").max(160),
  phone: opt(40),
  email: z.string().trim().email("Enter a valid email address").max(320).optional(),
  preferred_contact: z.enum(["phone", "sms", "email", "whatsapp", "letter", "via_client"]),
  move_in_date: dateStr.optional(),
  access_needs: opt(1000),
  vulnerability_flags: z.array(z.enum(VULN)).default([]),
  consent_to_contact: z.boolean(),
});

export async function saveOccupant(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("occupants.write");
  const parsed = occupantSchema.safeParse({
    ...formObject(formData),
    vulnerability_flags: formData.getAll("vulnerability_flags").map(String),
    consent_to_contact: formData.get("consent_to_contact") === "on",
  });
  if (!parsed.success) return fromZod(parsed.error);
  const { id, property_id, ...d } = parsed.data;
  if (d.preferred_contact === "email" && !d.email) return { ok: false, fieldErrors: { email: ["Add an email address or choose another contact method"] }, message: "Please check the highlighted fields." };
  if ((d.preferred_contact === "phone" || d.preferred_contact === "sms" || d.preferred_contact === "whatsapp") && !d.phone)
    return { ok: false, fieldErrors: { phone: ["Add a phone number or choose another contact method"] }, message: "Please check the highlighted fields." };
  const row = {
    full_name: d.full_name,
    phone: d.phone ?? null,
    email: d.email ?? null,
    preferred_contact: d.preferred_contact,
    move_in_date: d.move_in_date ?? null,
    access_needs: d.access_needs ?? null,
    vulnerability_flags: d.vulnerability_flags,
    consent_to_contact: d.consent_to_contact,
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("occupants").update(row).eq("tenant_id", ctx.tenantId).eq("id", id).eq("property_id", property_id)
    : await supabase.from("occupants").insert({ ...row, tenant_id: ctx.tenantId, property_id, is_current: true });
  if (error) return fromDb(error, "The occupant could not be saved.");
  revalidatePath(`/properties/${property_id}`);
  return { ok: true, message: id ? "Occupant updated." : "Occupant added." };
}

const moveOutSchema = z.object({ id: z.string().uuid(), property_id: z.string().uuid(), move_out_date: dateStr });

export async function moveOutOccupant(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("occupants.write");
  const parsed = moveOutSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { id, property_id, move_out_date } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("occupants")
    .update({ is_current: false, move_out_date, portal_enabled: false })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .eq("property_id", property_id)
    .select("id");
  if (error) return fromDb(error, "The move-out could not be recorded.");
  if (!data?.length) return { ok: false, message: "Occupant not found." };
  revalidatePath(`/properties/${property_id}`);
  return { ok: true, message: "Move-out recorded." };
}

/* ============================================================== inspections */
const inspectionSchema = z.object({
  id: z.string().uuid().optional(),
  property_id: z.string().uuid(),
  type: z.enum(["survey", "pre_works", "post_works", "void", "quality", "compliance", "stock_condition"]),
  inspector_id: z.string().uuid().optional(),
  scheduled_for: dtLocal.optional(),
  completed_at: dtLocal.optional(),
  result: z.enum(["pass", "fail", "advisory", "not_applicable"]).optional(),
  score: z.coerce.number().min(0, "0 to 100").max(100, "0 to 100").optional(),
  findings: opt(20000),
});

export async function saveInspection(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  const parsed = inspectionSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { id, property_id, ...d } = parsed.data;
  if (!d.scheduled_for && !d.completed_at) return { ok: false, fieldErrors: { scheduled_for: ["Enter when it is scheduled or when it was completed"] }, message: "Please check the highlighted fields." };
  if (d.result && !d.completed_at) return { ok: false, fieldErrors: { completed_at: ["Enter when the inspection was completed to record a result"] }, message: "Please check the highlighted fields." };
  const completed = d.completed_at ? londonInputToISO(d.completed_at) : null;
  if (completed && new Date(completed).getTime() > Date.now() + 5 * 60_000) return { ok: false, fieldErrors: { completed_at: ["The completion time cannot be in the future"] }, message: "Please check the highlighted fields." };
  const row = {
    type: d.type,
    inspector_id: d.inspector_id ?? null,
    scheduled_for: d.scheduled_for ? londonInputToISO(d.scheduled_for) : null,
    completed_at: completed,
    result: d.result ?? null,
    score: d.score ?? null,
    findings: d.findings ?? null,
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("inspections").update(row).eq("tenant_id", ctx.tenantId).eq("id", id).eq("property_id", property_id)
    : await supabase.from("inspections").insert({ ...row, tenant_id: ctx.tenantId, property_id, reference: "" });
  if (error) return fromDb(error, "The inspection could not be saved.");
  revalidatePath(`/properties/${property_id}`);
  return { ok: true, message: id ? "Inspection updated." : "Inspection recorded." };
}

/* ============================================================== certificates */
const CERT_TYPES = ["gas_safety", "eicr", "pat", "fensa", "building_control", "asbestos", "fire_risk", "legionella", "completion", "warranty", "other"] as const;
const certificateSchema = z.object({
  id: z.string().uuid().optional(),
  property_id: z.string().uuid(),
  type: z.enum(CERT_TYPES),
  issued_on: dateStr,
  expires_on: dateStr.optional(),
  issued_by: opt(160),
  result: z.enum(["satisfactory", "unsatisfactory", "advisory"]).optional(),
  document_id: z.string().uuid().optional(),
});

export async function saveCertificate(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("documents.write");
  const parsed = certificateSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { id, property_id, ...d } = parsed.data;
  if (d.expires_on && d.expires_on < d.issued_on) return { ok: false, fieldErrors: { expires_on: ["The expiry date must be on or after the issue date"] }, message: "Please check the highlighted fields." };
  const supabase = await createClient();
  if (d.document_id) {
    const { data: doc } = await supabase.from("documents").select("id").eq("tenant_id", ctx.tenantId).eq("id", d.document_id).eq("property_id", property_id).maybeSingle();
    if (!doc) return { ok: false, fieldErrors: { document_id: ["Choose a document stored against this property"] }, message: "Please check the highlighted fields." };
  }
  const row = { type: d.type, issued_on: d.issued_on, expires_on: d.expires_on ?? null, issued_by: d.issued_by ?? null, result: d.result ?? null, document_id: d.document_id ?? null };
  const { error } = id
    ? await supabase.from("certificates").update(row).eq("tenant_id", ctx.tenantId).eq("id", id).eq("property_id", property_id)
    : await supabase.from("certificates").insert({ ...row, tenant_id: ctx.tenantId, property_id, reference: "" });
  if (error) return fromDb(error, "The certificate could not be saved.");
  revalidatePath(`/properties/${property_id}`);
  return { ok: true, message: id ? "Certificate updated." : "Certificate recorded." };
}

export async function deleteCertificate(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("documents.delete");
  const parsed = z.object({ id: z.string().uuid(), property_id: z.string().uuid() }).safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: "Certificate not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("certificates").delete().eq("tenant_id", ctx.tenantId).eq("id", parsed.data.id).eq("property_id", parsed.data.property_id).select("id");
  if (error) return fromDb(error, "The certificate could not be removed.");
  if (!data?.length) return { ok: false, message: "Certificate not found." };
  revalidatePath(`/properties/${parsed.data.property_id}`);
  return { ok: true, message: "Certificate removed." };
}
