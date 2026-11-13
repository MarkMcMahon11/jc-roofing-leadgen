"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { formObject, fromDb, fromZod, type ActionResult } from "@/lib/actions";
import { geocodePostcode, normalisePostcode, POSTCODE_RE } from "../properties/_lib/geo";
import { londonToISO } from "../properties/_lib/time";
import { DAYS } from "./_lib/shared";

const opt = (max: number) => z.string().trim().max(max, `Up to ${max} characters`).optional();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date");
const timeStr = z.string().regex(/^\d{2}:\d{2}$/, "Enter a time");
const uuid = z.string().uuid();
const check = (field: string, message: string): ActionResult => ({ ok: false, fieldErrors: { [field]: [message] }, message: "Please check the highlighted fields." });


/* ============================================================== employees */
const employeeSchema = z.object({
  first_name: z.string().trim().min(1, "Enter the first name").max(80),
  last_name: z.string().trim().min(1, "Enter the last name").max(80),
  job_title: opt(120),
  trade: z.string().regex(/^[a-z0-9_]{1,60}$/, "Choose a trade"),
  skills: z.array(z.string().regex(/^[a-z0-9_]{1,60}$/)).default([]),
  work_email: z.string().trim().toLowerCase().email("Enter a valid email address").max(320).optional(),
  work_phone: opt(40),
  employment_status: z.enum(["active", "on_leave", "suspended", "left"]),
  employment_type: z.enum(["full_time", "part_time", "fixed_term", "apprentice", "agency"]),
  start_date: dateStr.optional(),
  end_date: dateStr.optional(),
  is_field_operative: z.boolean(),
  charge_rate: z.coerce.number().min(0, "Cannot be negative").max(999999, "Too large").optional(),
  base_postcode: z.string().trim().regex(POSTCODE_RE, "Enter a valid UK postcode").transform(normalisePostcode).optional(),
  vehicle_id: uuid.optional(),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a colour"),
  max_daily_hours: z.coerce.number().min(1, "1 to 16 hours").max(16, "1 to 16 hours"),
});

function toHours(t: string) {
  const [h, m] = t.split(":").map(Number);
  return Math.round((h! + m! / 60) * 100) / 100;
}

/** Day rows ("wh_mon_start"/"wh_mon_end", HH:MM) -> {"mon":[8,17],...}; blank day = not working. */
function parseWorkingHours(fd: FormData): { ok: true; value: Record<string, [number, number]> } | { ok: false; field: string; message: string } {
  const value: Record<string, [number, number]> = {};
  for (const d of DAYS) {
    const s = String(fd.get(`wh_${d}_start`) ?? "").trim();
    const e = String(fd.get(`wh_${d}_end`) ?? "").trim();
    if (!s && !e) continue;
    if (!timeStr.safeParse(s).success || !timeStr.safeParse(e).success) return { ok: false, field: `wh_${d}_start`, message: "Enter both a start and finish time, or leave the day blank" };
    const start = toHours(s);
    const end = toHours(e);
    if (end <= start) return { ok: false, field: `wh_${d}_start`, message: "The finish time must be after the start time" };
    value[d] = [start, end];
  }
  if (!Object.keys(value).length) return { ok: false, field: "wh_mon_start", message: "Enter at least one working day" };
  return { ok: true, value };
}

async function parseEmployee(fd: FormData, tenantId: string, existingSkills: string[] = []) {
  const parsed = employeeSchema.safeParse({ ...formObject(fd), skills: fd.getAll("skills").map(String), is_field_operative: fd.get("is_field_operative") === "on" });
  if (!parsed.success) return { error: fromZod(parsed.error) } as const;
  const d = parsed.data;
  if (d.start_date && d.end_date && d.end_date < d.start_date) return { error: check("end_date", "The end date must be on or after the start date") } as const;
  const lookups = await getLookups(tenantId);
  const allowed = new Set([...lookups.options("skill").map((o) => o.value), ...existingSkills]);
  const unknown = d.skills.filter((s) => !allowed.has(s));
  if (unknown.length) return { error: check("skills", "Choose skills from the list") } as const;
  const wh = parseWorkingHours(fd);
  if (!wh.ok) return { error: check(wh.field, wh.message) } as const;
  return { data: d, workingHours: wh.value } as const;
}

function employeeRow(d: z.infer<typeof employeeSchema>, workingHours: Record<string, [number, number]>) {
  return {
    first_name: d.first_name,
    last_name: d.last_name,
    job_title: d.job_title ?? null,
    trade: d.trade,
    skills: [...new Set(d.skills)],
    work_email: d.work_email ?? null,
    work_phone: d.work_phone ?? null,
    employment_status: d.employment_status,
    employment_type: d.employment_type,
    start_date: d.start_date ?? null,
    end_date: d.end_date ?? null,
    is_field_operative: d.is_field_operative,
    charge_rate: d.charge_rate ?? null,
    base_postcode: d.base_postcode ?? null,
    vehicle_id: d.vehicle_id ?? null,
    colour: d.colour.toLowerCase(),
    working_hours: workingHours,
    max_daily_hours: d.max_daily_hours,
  };
}

export async function createEmployee(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("workforce.write");
  const r = await parseEmployee(formData, ctx.tenantId);
  if ("error" in r) return r.error!;
  const geo = r.data.base_postcode ? await geocodePostcode(r.data.base_postcode) : null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .insert({
      ...employeeRow(r.data, r.workingHours),
      tenant_id: ctx.tenantId,
      reference: "",
      base_latitude: geo?.ok ? geo.lat : null,
      base_longitude: geo?.ok ? geo.lng : null,
    })
    .select("id")
    .single();
  if (error || !data) return fromDb(error, "The employee could not be saved.");
  revalidatePath("/workforce");
  redirect(`/workforce/${data.id}?saved=created${geo && !geo.ok ? `&geo=${geo.reason}` : ""}`);
}

export async function updateEmployee(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("workforce.write");
  const id = String(formData.get("id") ?? "");
  if (!uuid.safeParse(id).success) return { ok: false, message: "Employee not found." };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("employees").select("id, skills, base_postcode, base_latitude").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle();
  if (!existing) return { ok: false, message: "Employee not found." };
  const r = await parseEmployee(formData, ctx.tenantId, existing.skills);
  if ("error" in r) return r.error!;
  const pc = r.data.base_postcode ?? null;
  let coords: Record<string, number | null> = {};
  let geoFail: string | null = null;
  if (!pc) coords = { base_latitude: null, base_longitude: null };
  else if (pc !== (existing.base_postcode ? normalisePostcode(existing.base_postcode) : null) || existing.base_latitude === null) {
    const geo = await geocodePostcode(pc);
    if (geo.ok) coords = { base_latitude: geo.lat, base_longitude: geo.lng };
    else {
      geoFail = geo.reason;
      coords = { base_latitude: null, base_longitude: null };
    }
  }
  const { error } = await supabase.from("employees").update({ ...employeeRow(r.data, r.workingHours), ...coords }).eq("tenant_id", ctx.tenantId).eq("id", id);
  if (error) return fromDb(error, "The employee could not be saved.");
  revalidatePath("/workforce");
  revalidatePath(`/workforce/${id}`);
  redirect(`/workforce/${id}?saved=updated${geoFail ? `&geo=${geoFail}` : ""}`);
}

/* ============================================================== personal data (workforce.pii) */
const privateSchema = z.object({
  employee_id: uuid,
  date_of_birth: dateStr.optional(),
  ni_number: z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .pipe(z.string().regex(/^[A-CEGHJ-PR-TW-Z]{2}[0-9]{6}[A-D]$/, "Enter a valid National Insurance number, e.g. AB123456C"))
    .optional(),
  home_address: opt(500),
  personal_phone: opt(40),
  emergency_contact_name: opt(160),
  emergency_contact_phone: opt(40),
  hourly_cost: z.coerce.number().min(0, "Cannot be negative").max(9999, "Too large").optional(),
  notes: opt(5000),
});

export async function savePersonalData(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("workforce.pii");
  const parsed = privateSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  if (d.date_of_birth) {
    const age = (Date.now() - new Date(d.date_of_birth + "T12:00:00Z").getTime()) / (365.25 * 86_400_000);
    if (age < 15 || age > 100) return check("date_of_birth", "Check the date of birth");
  }
  const supabase = await createClient();
  const { data: emp } = await supabase.from("employees").select("id").eq("tenant_id", ctx.tenantId).eq("id", d.employee_id).maybeSingle();
  if (!emp) return { ok: false, message: "Employee not found." };
  const { error } = await supabase.from("employee_private").upsert(
    {
      employee_id: d.employee_id,
      tenant_id: ctx.tenantId,
      date_of_birth: d.date_of_birth ?? null,
      ni_number: d.ni_number ?? null,
      home_address: d.home_address ?? null,
      personal_phone: d.personal_phone ?? null,
      emergency_contact_name: d.emergency_contact_name ?? null,
      emergency_contact_phone: d.emergency_contact_phone ?? null,
      hourly_cost: d.hourly_cost ?? null,
      notes: d.notes ?? null,
    },
    { onConflict: "employee_id" },
  );
  if (error) return fromDb(error, "The personal data could not be saved.");
  revalidatePath(`/workforce/${d.employee_id}`);
  return { ok: true, message: "Personal data saved." };
}

/* ============================================================== qualifications (employees and subcontractors) */
const qualificationSchema = z.object({
  id: uuid.optional(),
  employee_id: uuid.optional(),
  subcontractor_id: uuid.optional(),
  name: z.string().trim().min(2, "Enter the qualification").max(160),
  issuer: opt(160),
  certificate_number: opt(80),
  issued_on: dateStr.optional(),
  expires_on: dateStr.optional(),
});

function qualificationPath(q: { employee_id?: string | null; subcontractor_id?: string | null }) {
  return q.employee_id ? `/workforce/${q.employee_id}` : `/subcontractors/${q.subcontractor_id}`;
}

export async function saveQualification(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("workforce.write");
  const parsed = qualificationSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { id, employee_id, subcontractor_id, ...d } = parsed.data;
  if (Boolean(employee_id) === Boolean(subcontractor_id)) return { ok: false, message: "Choose who the qualification belongs to." };
  if (d.issued_on && d.expires_on && d.expires_on < d.issued_on) return check("expires_on", "The expiry date must be on or after the issue date");
  const row = { name: d.name, issuer: d.issuer ?? null, certificate_number: d.certificate_number ?? null, issued_on: d.issued_on ?? null, expires_on: d.expires_on ?? null };
  const supabase = await createClient();
  const owner = employee_id ? { employee_id } : { subcontractor_id: subcontractor_id! };
  let query;
  if (id) {
    query = supabase.from("qualifications").update(row).eq("tenant_id", ctx.tenantId).eq("id", id);
    query = employee_id ? query.eq("employee_id", employee_id) : query.eq("subcontractor_id", subcontractor_id!);
  } else {
    query = supabase.from("qualifications").insert({ ...row, ...owner, tenant_id: ctx.tenantId });
  }
  const { error } = await query;
  if (error) return fromDb(error, "The qualification could not be saved.");
  revalidatePath(qualificationPath(owner));
  revalidatePath(employee_id ? "/workforce" : "/subcontractors");
  return { ok: true, message: id ? "Qualification updated." : "Qualification added." };
}

export async function deleteQualification(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("workforce.write");
  const id = String(formData.get("id") ?? "");
  if (!uuid.safeParse(id).success) return { ok: false, message: "Qualification not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("qualifications").delete().eq("tenant_id", ctx.tenantId).eq("id", id).select("employee_id, subcontractor_id");
  if (error) return fromDb(error, "The qualification could not be removed.");
  if (!data?.length) return { ok: false, message: "Qualification not found." };
  revalidatePath(qualificationPath(data[0]!));
  revalidatePath(data[0]!.employee_id ? "/workforce" : "/subcontractors");
  return { ok: true, message: "Qualification removed." };
}

/* ============================================================== absences */
const absenceSchema = z.object({
  employee_id: uuid,
  type: z.string().regex(/^[a-z0-9_]{1,60}$/, "Choose a type"),
  from_date: dateStr,
  to_date: dateStr,
  from_time: timeStr.optional(),
  to_time: timeStr.optional(),
  status: z.enum(["approved", "requested"]),
  notes: opt(1000),
});

export async function saveAbsence(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("workforce.write");
  const parsed = absenceSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  if (d.to_date < d.from_date) return check("to_date", "The last day must be on or after the first day");
  const startsAt = londonToISO(d.from_date, d.from_time ?? "00:00");
  // a full last day ends at midnight; a time makes it a part day
  const endsAt = d.to_time ? londonToISO(d.to_date, d.to_time) : londonToISO(addDay(d.to_date), "00:00");
  if (new Date(endsAt) <= new Date(startsAt)) return check("to_time", "The absence must end after it starts");
  const supabase = await createClient();
  const { data: emp } = await supabase.from("employees").select("id").eq("tenant_id", ctx.tenantId).eq("id", d.employee_id).maybeSingle();
  if (!emp) return check("employee_id", "Choose an employee");
  const { data: overlap } = await supabase
    .from("employee_absences")
    .select("id")
    .eq("tenant_id", ctx.tenantId)
    .eq("employee_id", d.employee_id)
    .in("status", ["approved", "requested"])
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt)
    .limit(1);
  if (overlap?.length) return check("from_date", "This overlaps an absence already booked for this person");
  const { error } = await supabase.from("employee_absences").insert({
    tenant_id: ctx.tenantId,
    employee_id: d.employee_id,
    type: d.type,
    starts_at: startsAt,
    ends_at: endsAt,
    status: d.status,
    notes: d.notes ?? null,
    approved_by: d.status === "approved" ? ctx.userId : null,
  });
  if (error) return fromDb(error, "The absence could not be saved.");
  revalidatePath("/workforce");
  revalidatePath(`/workforce/${d.employee_id}`);
  return { ok: true, message: d.status === "approved" ? "Absence booked." : "Absence request recorded." };
}

function addDay(iso: string) {
  const dt = new Date(iso + "T12:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

const decisionSchema = z.object({ id: uuid, decision: z.enum(["approve", "reject", "cancel"]) });

export async function decideAbsence(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("workforce.write");
  const parsed = decisionSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { id, decision } = parsed.data;
  const supabase = await createClient();
  const { data: abs } = await supabase.from("employee_absences").select("id, status, employee_id").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle();
  if (!abs) return { ok: false, message: "Absence not found." };
  if (decision !== "cancel" && abs.status !== "requested") return { ok: false, message: "Only requested absences can be approved or rejected." };
  if (decision === "cancel" && !["approved", "requested"].includes(abs.status)) return { ok: false, message: "This absence is no longer active." };
  const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "cancelled";
  const { error } = await supabase
    .from("employee_absences")
    .update({ status, approved_by: decision === "cancel" ? undefined : ctx.userId })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);
  if (error) return fromDb(error, "The absence could not be updated.");
  revalidatePath("/workforce");
  revalidatePath(`/workforce/${abs.employee_id}`);
  return { ok: true, message: decision === "approve" ? "Absence approved." : decision === "reject" ? "Absence rejected." : "Absence cancelled." };
}

/* ============================================================== vehicles */
const vehicleSchema = z.object({
  id: uuid.optional(),
  registration: z
    .string()
    .transform((v) => v.toUpperCase().replace(/\s+/g, " ").trim())
    .pipe(z.string().regex(/^[A-Z0-9 ]{2,10}$/, "Enter the registration, e.g. SK21 PMC")),
  make: opt(60),
  model: opt(60),
  vehicle_type: z.enum(["van", "pickup", "tipper", "car", "trailer", "plant", "other"]),
  status: z.enum(["active", "maintenance", "off_road", "disposed"]),
  mot_due: dateStr.optional(),
  insurance_due: dateStr.optional(),
  service_due: dateStr.optional(),
  tax_due: dateStr.optional(),
  notes: opt(5000),
  assigned_employee_id: uuid.optional(),
});

export async function saveVehicle(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("workforce.write");
  const parsed = vehicleSchema.safeParse(formObject(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { id, assigned_employee_id, ...d } = parsed.data;
  const row = {
    registration: d.registration,
    make: d.make ?? null,
    model: d.model ?? null,
    vehicle_type: d.vehicle_type,
    status: d.status,
    mot_due: d.mot_due ?? null,
    insurance_due: d.insurance_due ?? null,
    service_due: d.service_due ?? null,
    tax_due: d.tax_due ?? null,
    notes: d.notes ?? null,
  };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("vehicles").update(row).eq("tenant_id", ctx.tenantId).eq("id", id).select("id").single()
    : await supabase.from("vehicles").insert({ ...row, tenant_id: ctx.tenantId }).select("id").single();
  if (error || !data) {
    if (error?.code === "23505") return check("registration", "A vehicle with this registration already exists");
    return fromDb(error, "The vehicle could not be saved.");
  }
  // assignment lives on the employee record: move the van to the chosen person
  const { data: holders } = await supabase.from("employees").select("id").eq("tenant_id", ctx.tenantId).eq("vehicle_id", data.id);
  const release = (holders ?? []).map((h) => h.id).filter((h) => h !== assigned_employee_id);
  if (release.length) {
    const { error: e1 } = await supabase.from("employees").update({ vehicle_id: null }).eq("tenant_id", ctx.tenantId).in("id", release);
    if (e1) return fromDb(e1, "The vehicle was saved but its assignment could not be changed.");
  }
  if (assigned_employee_id && !(holders ?? []).some((h) => h.id === assigned_employee_id)) {
    const { error: e2 } = await supabase.from("employees").update({ vehicle_id: data.id }).eq("tenant_id", ctx.tenantId).eq("id", assigned_employee_id);
    if (e2) return fromDb(e2, "The vehicle was saved but could not be assigned.");
  }
  revalidatePath("/workforce");
  return { ok: true, message: id ? "Vehicle updated." : "Vehicle added." };
}
