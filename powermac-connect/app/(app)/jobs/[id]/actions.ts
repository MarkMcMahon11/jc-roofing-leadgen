"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { fromDb, fromZod, formObject, type ActionResult } from "@/lib/actions";
import { date as ukDate } from "@/lib/format";
import { fromLondon, londonDate } from "../_lib/time";
import { MAX_DAY_HOURS, MATERIAL_STATUS, PHOTO_STAGES } from "../_lib/constants";

const uuid = z.string().uuid();
const refresh = (jobId: string) => revalidatePath(`/jobs/${jobId}`);

/* ------------------------------------------------------------------ notes */

const noteSchema = z.object({
  job_id: uuid,
  body: z.string({ error: "Write a note" }).trim().min(1, "Write a note").max(10000, "Keep notes under 10,000 characters"),
  visibility: z.enum(["internal", "client"]),
});

export async function addNote(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  const parsed = noteSchema.safeParse(formObject(fd));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("job_updates").insert({
    tenant_id: ctx.tenantId,
    work_order_id: parsed.data.job_id,
    type: "note",
    body: parsed.data.body,
    visibility: parsed.data.visibility,
  });
  if (error) return fromDb(error, "The note could not be added.");
  refresh(parsed.data.job_id);
  return { ok: true, message: parsed.data.visibility === "client" ? "Note added and shared with the client." : "Internal note added." };
}

/* ------------------------------------------------------------------ assignment */

type Window = { start: string; end: string };

function windowFrom(day: string, time: string, duration: number): Window | string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return "Choose a date and start time.";
  if (!Number.isFinite(duration) || duration < 0.25 || duration > MAX_DAY_HOURS) return `Duration must be between 15 minutes and ${MAX_DAY_HOURS} hours (one working day).`;
  const start = fromLondon(`${day}T${time}`);
  if (!start) return "Choose a valid date and start time.";
  return { start: start.toISOString(), end: new Date(start.getTime() + duration * 3_600_000).toISOString() };
}

export type Recommendation = {
  employee_id: string;
  name: string;
  trade: string;
  colour: string;
  distance_km: number | null;
  booked_hours_day: number;
  trade_score: number;
  availability_score: number;
  distance_score: number;
  workload_score: number;
  total_score: number;
  conflicts: number;
  reasons: string[];
};

export async function recommendOperatives(jobId: string, day: string, time: string, duration: number): Promise<{ ok: boolean; message?: string; window?: Window; rows?: Recommendation[] }> {
  const ctx = await requireInternal("work_orders.assign");
  if (!uuid.safeParse(jobId).success) return { ok: false, message: "Unknown job." };
  const w = windowFrom(day, time, duration);
  if (typeof w === "string") return { ok: false, message: w };
  const supabase = await createClient();
  const { data: job } = await supabase.from("work_orders").select("id").eq("id", jobId).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!job) return { ok: false, message: "Unknown job." };
  const { data, error } = await supabase.rpc("recommend_operatives", { p_work_order: jobId, p_start: w.start, p_end: w.end });
  if (error) return { ok: false, message: fromDb(error, "Recommendations are not available right now.").message };
  return {
    ok: true,
    window: w,
    rows: (data ?? []).map((r) => ({
      employee_id: r.employee_id,
      name: r.name,
      trade: r.trade,
      colour: r.colour,
      distance_km: r.distance_km === null ? null : Number(r.distance_km),
      booked_hours_day: Number(r.booked_hours_day ?? 0),
      trade_score: r.trade_score,
      availability_score: r.availability_score,
      distance_score: r.distance_score,
      workload_score: r.workload_score,
      total_score: r.total_score,
      conflicts: r.conflicts,
      reasons: r.reasons ?? [],
    })),
  };
}

export type Clash = { kind: string; label: string; starts_at: string; ends_at: string };
export type AssignResult = ActionResult & { conflicts?: Clash[]; needsConfirm?: boolean };

const assignSchema = z.object({
  jobId: uuid,
  employeeId: uuid.optional(),
  subcontractorId: uuid.optional(),
  day: z.string(),
  time: z.string(),
  duration: z.number(),
  role: z.enum(["lead", "support", "supervisor"]),
  confirm: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});

export async function assignJob(input: z.input<typeof assignSchema>): Promise<AssignResult> {
  const ctx = await requireInternal("work_orders.assign");
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success || Boolean(parsed.data.employeeId) === Boolean(parsed.data.subcontractorId)) return { ok: false, message: "Choose one operative or subcontractor." };
  const a = parsed.data;
  const w = windowFrom(a.day, a.time, a.duration);
  if (typeof w === "string") return { ok: false, message: w };
  const supabase = await createClient();
  const { data: job } = await supabase.from("work_orders").select("id, reference").eq("id", a.jobId).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!job) return { ok: false, message: "Unknown job." };

  let who = "";
  if (a.employeeId) {
    const { data: emp } = await supabase.from("employees").select("first_name, last_name, employment_status").eq("id", a.employeeId).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!emp) return { ok: false, message: "That operative could not be found." };
    if (emp.employment_status !== "active") return { ok: false, message: `${emp.first_name} ${emp.last_name} is not active (${emp.employment_status.replace(/_/g, " ")}).` };
    who = `${emp.first_name} ${emp.last_name}`;
    const { data: clashes, error } = await supabase.rpc("assignment_conflicts", { p_employee: a.employeeId, p_start: w.start, p_end: w.end });
    if (error) return fromDb(error, "Could not check the operative's diary.");
    if (clashes?.length && !a.confirm) {
      return { ok: false, needsConfirm: true, message: `${who} has ${clashes.length} clash${clashes.length === 1 ? "" : "es"} in this slot.`, conflicts: clashes };
    }
  } else {
    const { data: sub } = await supabase.from("subcontractors").select("company_name, status, insurance_expiry").eq("id", a.subcontractorId!).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!sub) return { ok: false, message: "That subcontractor could not be found." };
    if (sub.status !== "approved") return { ok: false, message: `${sub.company_name} is not an approved subcontractor.` };
    who = sub.company_name;
    if (sub.insurance_expiry && sub.insurance_expiry < londonDate() && !a.confirm) {
      return { ok: false, needsConfirm: true, message: `${sub.company_name}'s insurance expired on ${ukDate(sub.insurance_expiry)}. Confirm you have seen current cover before assigning.` };
    }
  }

  const { error } = await supabase.from("job_assignments").insert({
    tenant_id: ctx.tenantId,
    work_order_id: a.jobId,
    employee_id: a.employeeId ?? null,
    subcontractor_id: a.subcontractorId ?? null,
    role: a.role,
    scheduled_start: w.start,
    scheduled_end: w.end,
    notes: a.notes?.trim() || (a.confirm && a.employeeId ? "Assigned despite a diary clash (confirmed by the scheduler)." : null),
  });
  if (error) return fromDb(error, "The assignment could not be saved.");
  refresh(a.jobId);
  revalidatePath("/jobs");
  return { ok: true, message: `${who} assigned to ${job.reference}.` };
}

export async function cancelAssignment(id: string): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.assign");
  if (!uuid.safeParse(id).success) return { ok: false, message: "Unknown assignment." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_assignments")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("tenant_id", ctx.tenantId)
    .in("status", ["scheduled", "accepted", "no_access"])
    .select("work_order_id");
  if (error) return fromDb(error);
  if (!data?.length) return { ok: false, message: "Only visits that have not started can be cancelled." };
  await supabase.from("job_updates").insert({ tenant_id: ctx.tenantId, work_order_id: data[0].work_order_id, type: "assignment", body: "Visit cancelled", data: { assignment_id: id, cancelled: true } });
  refresh(data[0].work_order_id);
  revalidatePath("/jobs");
  return { ok: true, message: "Visit cancelled." };
}

export async function rescheduleAssignment(input: { id: string; day: string; time: string; duration: number; confirm?: boolean }): Promise<AssignResult> {
  const ctx = await requireInternal("work_orders.assign");
  if (!uuid.safeParse(input.id).success) return { ok: false, message: "Unknown assignment." };
  const w = windowFrom(input.day, input.time, Number(input.duration));
  if (typeof w === "string") return { ok: false, message: w };
  const supabase = await createClient();
  const { data: a } = await supabase.from("job_assignments").select("id, work_order_id, employee_id, status").eq("id", input.id).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!a) return { ok: false, message: "Unknown assignment." };
  if (!["scheduled", "accepted", "no_access"].includes(a.status)) return { ok: false, message: "Only visits that have not started can be rescheduled." };
  if (a.employee_id) {
    const { data: clashes } = await supabase.rpc("assignment_conflicts", { p_employee: a.employee_id, p_start: w.start, p_end: w.end, p_exclude: a.id });
    if (clashes?.length && !input.confirm) return { ok: false, needsConfirm: true, message: `The new slot clashes with ${clashes.length} other booking${clashes.length === 1 ? "" : "s"}.`, conflicts: clashes };
  }
  const { error } = await supabase
    .from("job_assignments")
    .update({ scheduled_start: w.start, scheduled_end: w.end, status: "scheduled" })
    .eq("id", a.id)
    .eq("tenant_id", ctx.tenantId);
  if (error) return fromDb(error, "The visit could not be moved.");
  await supabase.from("job_updates").insert({ tenant_id: ctx.tenantId, work_order_id: a.work_order_id, type: "assignment", body: "Visit rescheduled", data: { assignment_id: a.id, start: w.start, end: w.end, rescheduled: true } });
  refresh(a.work_order_id);
  revalidatePath("/jobs");
  return { ok: true, message: "Visit rescheduled." };
}

/* ------------------------------------------------------------------ materials */

const materialSchema = z
  .object({
    job_id: uuid,
    material_id: uuid.optional(),
    description: z.string().trim().max(300, "Keep the description under 300 characters").optional(),
    unit: z.string().trim().max(20).optional(),
    quantity: z.coerce.number({ error: "Enter a quantity" }).positive("Enter a quantity above zero").max(1_000_000),
  })
  .refine((v) => v.material_id || v.description, { path: ["material_id"], message: "Choose a catalogue item or describe the item" });

export async function addJobMaterial(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  const parsed = materialSchema.safeParse(formObject(fd));
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  let row = { material_id: null as string | null, description: d.description ?? "", unit: d.unit || "each", unit_cost: null as number | null };
  if (d.material_id) {
    // price comes from the catalogue, never from the browser
    const { data: m } = await supabase.from("materials").select("id, name, unit, unit_cost").eq("id", d.material_id).eq("tenant_id", ctx.tenantId).maybeSingle();
    if (!m) return { ok: false, fieldErrors: { material_id: ["That catalogue item could not be found"] } };
    row = { material_id: m.id, description: d.description || m.name, unit: m.unit, unit_cost: Number(m.unit_cost) };
  }
  const { error } = await supabase.from("job_materials").insert({ tenant_id: ctx.tenantId, work_order_id: d.job_id, quantity: d.quantity, status: "required", ...row });
  if (error) return fromDb(error, "The material could not be added.");
  refresh(d.job_id);
  return { ok: true, message: `${row.description} added.` };
}

export async function setJobMaterialStatus(id: string, status: string): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  if (!uuid.safeParse(id).success || !MATERIAL_STATUS.some((s) => s.value === status)) return { ok: false, message: "Invalid change." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("job_materials").update({ status }).eq("id", id).eq("tenant_id", ctx.tenantId).select("work_order_id, description");
  if (error) return fromDb(error);
  if (!data?.length) return { ok: false, message: "That line could not be changed." };
  if (status === "used" || status === "returned") {
    await supabase.from("job_updates").insert({ tenant_id: ctx.tenantId, work_order_id: data[0].work_order_id, type: "materials", body: `${data[0].description} marked ${status}`, data: { job_material_id: id, status } });
  }
  refresh(data[0].work_order_id);
  return { ok: true };
}

export async function removeJobMaterial(id: string): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  if (!uuid.safeParse(id).success) return { ok: false, message: "Invalid line." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("job_materials").delete().eq("id", id).eq("tenant_id", ctx.tenantId).in("status", ["required", "allocated"]).select("work_order_id");
  if (error) return fromDb(error);
  if (!data?.length) return { ok: false, message: "Only lines that are not yet ordered or used can be removed." };
  refresh(data[0].work_order_id);
  return { ok: true };
}

/* ------------------------------------------------------------------ checklists */

type Item = { label: string; required: boolean; done: boolean; done_at: string | null; done_by: string | null };

export async function attachChecklist(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  const parsed = z.object({ job_id: uuid, template_id: uuid.or(z.undefined()).refine(Boolean, "Choose a checklist") }).safeParse(formObject(fd));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data: t } = await supabase.from("checklist_templates").select("id, name, items").eq("id", parsed.data.template_id!).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!t) return { ok: false, fieldErrors: { template_id: ["That checklist could not be found"] } };
  const items: Item[] = (Array.isArray(t.items) ? t.items : [])
    .map((i) => (i && typeof i === "object" && !Array.isArray(i) ? i : {}))
    .filter((i) => typeof (i as { label?: unknown }).label === "string")
    .map((i) => ({ label: String((i as { label: string }).label), required: Boolean((i as { required?: boolean }).required), done: false, done_at: null, done_by: null }));
  if (!items.length) return { ok: false, message: "That checklist has no items." };
  const { error } = await supabase.from("job_checklists").insert({ tenant_id: ctx.tenantId, work_order_id: parsed.data.job_id, template_id: t.id, name: t.name, items });
  if (error) return fromDb(error, "The checklist could not be added.");
  refresh(parsed.data.job_id);
  return { ok: true, message: `${t.name} added.` };
}

export async function toggleChecklistItem(checklistId: string, index: number, done: boolean): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  if (!uuid.safeParse(checklistId).success || !Number.isInteger(index) || index < 0) return { ok: false, message: "Invalid item." };
  const supabase = await createClient();
  const { data: c } = await supabase.from("job_checklists").select("id, name, items, work_order_id, completed_at").eq("id", checklistId).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!c || !Array.isArray(c.items) || index >= c.items.length) return { ok: false, message: "That item could not be found." };
  const items = (c.items as unknown as Item[]).map((i, n) => (n === index ? { ...i, done, done_at: done ? new Date().toISOString() : null, done_by: done ? ctx.fullName : null } : i));
  const complete = items.every((i) => !i.required || i.done);
  const { error } = await supabase
    .from("job_checklists")
    .update({ items, completed_at: complete ? (c.completed_at ?? new Date().toISOString()) : null, completed_by: complete ? ctx.userId : null })
    .eq("id", c.id)
    .eq("tenant_id", ctx.tenantId);
  if (error) return fromDb(error);
  if (complete && !c.completed_at) {
    await supabase.from("job_updates").insert({ tenant_id: ctx.tenantId, work_order_id: c.work_order_id, type: "system", body: `${c.name} completed`, data: { checklist_id: c.id } });
  }
  refresh(c.work_order_id);
  return { ok: true, message: complete && !c.completed_at ? `${c.name} complete.` : undefined };
}

export async function removeChecklist(id: string): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  if (!uuid.safeParse(id).success) return { ok: false, message: "Invalid checklist." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("job_checklists").delete().eq("id", id).eq("tenant_id", ctx.tenantId).is("completed_at", null).select("work_order_id");
  if (error) return fromDb(error);
  if (!data?.length) return { ok: false, message: "Completed checklists are kept as a record." };
  refresh(data[0].work_order_id);
  return { ok: true };
}

/* ------------------------------------------------------------------ completion */

const dt = (msg: string) =>
  z
    .string()
    .optional()
    .refine((v) => !v || fromLondon(v) !== null, msg)
    .transform((v) => (v ? fromLondon(v)!.toISOString() : null));

const completionSchema = z
  .object({
    job_id: uuid,
    actual_start: dt("Enter a valid date and time"),
    actual_end: dt("Enter a valid date and time"),
    completion_notes: z.string().max(10000, "Keep notes under 10,000 characters").optional(),
    first_time_fix: z.enum(["yes", "no"]).optional(),
    signoff_name: z.string().trim().max(160).optional(),
    signoff_at: dt("Enter a valid date and time"),
    satisfaction_score: z.coerce.number().int().min(1, "Score from 1 to 5").max(5, "Score from 1 to 5").optional(),
  })
  .superRefine((v, c) => {
    if (v.actual_start && v.actual_end && v.actual_end < v.actual_start) c.addIssue({ code: "custom", path: ["actual_end"], message: "Finish is before the start" });
    if (v.actual_end && v.actual_end > new Date(Date.now() + 3_600_000).toISOString()) c.addIssue({ code: "custom", path: ["actual_end"], message: "Finish cannot be in the future" });
    if (v.signoff_at && !v.signoff_name) c.addIssue({ code: "custom", path: ["signoff_name"], message: "Who signed the work off?" });
  });

export async function saveCompletion(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  const parsed = completionSchema.safeParse(formObject(fd));
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { data: before } = await supabase.from("work_orders").select("signoff_name").eq("id", d.job_id).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!before) return { ok: false, message: "Unknown job." };
  const signoffAt = d.signoff_name ? (d.signoff_at ?? new Date().toISOString()) : null;
  const { data, error } = await supabase
    .from("work_orders")
    .update({
      actual_start: d.actual_start,
      actual_end: d.actual_end,
      completion_notes: d.completion_notes ?? null,
      first_time_fix: d.first_time_fix === undefined ? null : d.first_time_fix === "yes",
      signoff_name: d.signoff_name || null,
      signoff_at: signoffAt,
      satisfaction_score: d.satisfaction_score ?? null,
    })
    .eq("id", d.job_id)
    .eq("tenant_id", ctx.tenantId)
    .select("id");
  if (error) return fromDb(error, "The completion details could not be saved.");
  if (!data?.length) return { ok: false, message: "You cannot edit this job." };
  if (d.signoff_name && d.signoff_name !== before.signoff_name) {
    await supabase.from("job_updates").insert({ tenant_id: ctx.tenantId, work_order_id: d.job_id, type: "signoff", body: `Work signed off by ${d.signoff_name}`, visibility: "client" });
  }
  refresh(d.job_id);
  return { ok: true, message: "Completion details saved." };
}

/* ------------------------------------------------------------------ photos */

const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;

/**
 * Photos go straight from the browser to private storage through a one-time signed upload
 * URL (the file never passes through this server). The path is chosen here, inside the
 * tenant's folder, and storage policies check the user's permission when the URL is made.
 */
export async function createPhotoUpload(jobId: string, contentType: string, size: number): Promise<{ ok: boolean; message?: string; path?: string; url?: string }> {
  const ctx = await requireInternal("work_orders.write");
  if (!uuid.safeParse(jobId).success) return { ok: false, message: "Unknown job." };
  const ext = IMAGE_TYPES[contentType];
  if (!ext) return { ok: false, message: "Upload a JPEG, PNG, WebP or HEIC image." };
  if (!(size > 0 && size <= MAX_PHOTO_BYTES)) return { ok: false, message: "Photos can be up to 25 MB." };
  const supabase = await createClient();
  const { data: job } = await supabase.from("work_orders").select("id").eq("id", jobId).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!job) return { ok: false, message: "Unknown job." };
  const path = `${ctx.tenantId}/jobs/${jobId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabase.storage.from("photos").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "Photo storage refused the upload. Check you can edit jobs." };
  return { ok: true, path, url: data.signedUrl };
}

const photoSchema = z.object({
  jobId: uuid,
  path: z.string(),
  stage: z.enum(PHOTO_STAGES.map((s) => s.value) as [string, ...string[]]),
  caption: z.string().trim().max(500).optional(),
  shareWithClient: z.boolean(),
});

export async function recordPhoto(input: z.input<typeof photoSchema>): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  const parsed = photoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "The photo details are not valid." };
  const p = parsed.data;
  const prefix = `${ctx.tenantId}/jobs/${p.jobId}/`;
  if (!p.path.startsWith(prefix) || !/^[0-9a-f-]{36}\.(jpg|png|webp|heic|heif)$/.test(p.path.slice(prefix.length))) return { ok: false, message: "That upload does not belong to this job." };
  const supabase = await createClient();
  const { error } = await supabase.from("photos").insert({
    tenant_id: ctx.tenantId,
    work_order_id: p.jobId,
    storage_path: p.path,
    stage: p.stage,
    caption: p.caption || null,
    taken_at: new Date().toISOString(),
    visibility: p.shareWithClient ? "client" : "internal",
  });
  if (error) {
    await supabase.storage.from("photos").remove([p.path]);
    return fromDb(error, "The photo could not be saved.");
  }
  refresh(p.jobId);
  return { ok: true };
}

export async function notePhotos(jobId: string, count: number, stage: string): Promise<void> {
  const ctx = await requireInternal("work_orders.write");
  if (!uuid.safeParse(jobId).success || !(count > 0)) return;
  const supabase = await createClient();
  await supabase.from("job_updates").insert({
    tenant_id: ctx.tenantId,
    work_order_id: jobId,
    type: "photo",
    body: `${count} ${stage} photo${count === 1 ? "" : "s"} added`,
    data: { count, stage },
  });
  refresh(jobId);
}

export async function deletePhoto(id: string): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  if (!uuid.safeParse(id).success) return { ok: false, message: "Unknown photo." };
  const supabase = await createClient();
  const { data: photo } = await supabase.from("photos").select("id, storage_path, work_order_id").eq("id", id).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!photo) return { ok: false, message: "Unknown photo." };
  const { error } = await supabase.from("photos").delete().eq("id", id).eq("tenant_id", ctx.tenantId);
  if (error) return fromDb(error, "The photo could not be deleted.");
  await supabase.storage.from("photos").remove([photo.storage_path]);
  if (photo.work_order_id) refresh(photo.work_order_id);
  return { ok: true };
}
