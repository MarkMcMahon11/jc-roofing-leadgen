"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternal, type TenantContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { fromDb, type ActionResult } from "@/lib/actions";
import type { Clash, Recommendation } from "./_lib/types";
import { fmtSlot } from "./_lib/time";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const uuid = z.string().uuid();
const instant = z.iso.datetime({ offset: true });
const MAX_BOOKING_MS = 7 * 24 * 3_600_000;

const slotSchema = z
  .object({ start: instant, end: instant })
  .refine((v) => Date.parse(v.end) > Date.parse(v.start), { message: "The end time must be after the start time.", path: ["end"] })
  .refine((v) => Date.parse(v.end) - Date.parse(v.start) <= MAX_BOOKING_MS, { message: "A single booking cannot be longer than a week.", path: ["end"] });

const resource = z
  .object({ employeeId: uuid.nullable(), subcontractorId: uuid.nullable() })
  .refine((v) => (v.employeeId ? 1 : 0) + (v.subcontractorId ? 1 : 0) === 1, { message: "Choose one operative or one subcontractor." });

const EDITABLE_STATUS = ["scheduled", "accepted", "travelling", "on_site", "paused", "completed", "no_access"] as const;

const denied: ActionResult = { ok: false, message: "Booking work needs the Assign work orders permission as well as Schedule (write). Ask an administrator." };

/** schedule.write for the page, work_orders.assign for job_assignments (the RLS rule). */
async function writer(): Promise<TenantContext | null> {
  const ctx = await requireInternal("schedule.write");
  return ctx.can("work_orders.assign") ? ctx : null;
}

function firstIssue(e: z.ZodError) {
  return e.issues[0]?.message ?? "Invalid request.";
}

type People = {
  employees?: { id: string; first_name: string; last_name: string; employment_status: string }[];
  subcontractors?: { id: string; company_name: string; status: string }[];
};

/**
 * Who is being booked, via schedule_people() (the same people the planner shows: field operatives
 * that are active or on leave, approved or pending subcontractors). Anyone else cannot be booked.
 */
async function resourceName(supabase: Supabase, tenantId: string, r: { employeeId: string | null; subcontractorId: string | null }) {
  const now = new Date().toISOString();
  const { data } = await supabase.rpc("schedule_people", { p_tenant: tenantId, p_from: now, p_to: now });
  const people = (data ?? {}) as People;
  if (r.employeeId) {
    const e = people.employees?.find((x) => x.id === r.employeeId);
    return e ? { name: `${e.first_name} ${e.last_name}`, ok: true, status: e.employment_status } : null;
  }
  const s = people.subcontractors?.find((x) => x.id === r.subcontractorId);
  return s ? { name: s.company_name, ok: s.status === "approved", status: s.status === "pending" ? "not approved yet" : s.status } : null;
}

/* ------------------------------------------------------------------ clash check */
export async function checkClashes(input: { employeeId: string; start: string; end: string; excludeId?: string | null }): Promise<ActionResult & { clashes?: Clash[] }> {
  const ctx = await writer();
  if (!ctx) return denied;
  const parsed = z.object({ employeeId: uuid, excludeId: uuid.nullish() }).and(slotSchema).safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("assignment_conflicts", {
    p_employee: parsed.data.employeeId,
    p_start: parsed.data.start,
    p_end: parsed.data.end,
    ...(parsed.data.excludeId ? { p_exclude: parsed.data.excludeId } : {}),
  });
  if (error) return fromDb(error, "Clashes could not be checked. Please try again.");
  return { ok: true, clashes: (data ?? []).map((c) => ({ kind: c.kind, label: c.label, start: c.starts_at, end: c.ends_at })) };
}

/* ------------------------------------------------------------------ recommendations */
export async function getRecommendations(input: { workOrderId: string; start: string; end: string }): Promise<ActionResult & { items?: Recommendation[] }> {
  await requireInternal("schedule.read");
  const parsed = z.object({ workOrderId: uuid }).and(slotSchema).safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recommend_operatives", { p_work_order: parsed.data.workOrderId, p_start: parsed.data.start, p_end: parsed.data.end });
  if (error) return fromDb(error, "Recommendations are not available right now.");
  return {
    ok: true,
    items: (data ?? []).slice(0, 5).map((r) => ({
      employeeId: r.employee_id,
      name: r.name,
      trade: r.trade,
      colour: r.colour,
      distanceKm: r.distance_km === null ? null : Number(r.distance_km),
      bookedHours: Number(r.booked_hours_day ?? 0),
      totalScore: Number(r.total_score),
      tradeScore: Number(r.trade_score),
      availabilityScore: Number(r.availability_score),
      distanceScore: Number(r.distance_score),
      workloadScore: Number(r.workload_score),
      conflicts: Number(r.conflicts),
      reasons: r.reasons ?? [],
    })),
  };
}

/* ------------------------------------------------------------------ book a queued job */
export async function bookJob(input: { workOrderId: string; employeeId: string | null; subcontractorId: string | null; start: string; end: string }): Promise<ActionResult> {
  const ctx = await writer();
  if (!ctx) return denied;
  const parsed = z.object({ workOrderId: uuid }).and(resource).and(slotSchema).safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();

  const { data: job } = await supabase.from("work_orders").select("id, reference, status").eq("tenant_id", ctx.tenantId).eq("id", v.workOrderId).maybeSingle();
  if (!job) return { ok: false, message: "That job no longer exists, or your role cannot see it." };
  const { data: status } = await supabase.from("job_statuses").select("label, category").eq("tenant_id", ctx.tenantId).eq("key", job.status).maybeSingle();
  if (status && ["complete", "closed"].includes(status.category)) return { ok: false, message: `${job.reference} is ${status.label.toLowerCase()} and can no longer be booked.` };

  const who = await resourceName(supabase, ctx.tenantId, v);
  if (!who) return { ok: false, message: "Only active field operatives and approved subcontractors can be booked." };
  if (!who.ok) return { ok: false, message: `${who.name} is ${who.status} and cannot be booked.` };

  const { error } = await supabase.from("job_assignments").insert({
    tenant_id: ctx.tenantId,
    work_order_id: job.id,
    employee_id: v.employeeId,
    subcontractor_id: v.subcontractorId,
    role: "lead",
    scheduled_start: v.start,
    scheduled_end: v.end,
    status: "scheduled",
  });
  if (error) return fromDb(error, "The booking could not be saved.");

  let note = "";
  if (job.status !== "scheduled") note = await moveToScheduled(supabase, ctx, job);
  revalidatePath("/schedule");
  return { ok: true, message: `Booked ${job.reference} with ${who.name}, ${fmtSlot(v.start, v.end)}.${note}` };
}

/** Moves the job to "scheduled" when the configured workflow allows it from its current status. */
async function moveToScheduled(supabase: Supabase, ctx: TenantContext, job: { id: string; status: string }) {
  const { data: rule } = await supabase
    .from("job_status_transitions")
    .select("required_permission")
    .eq("tenant_id", ctx.tenantId)
    .eq("from_key", job.status)
    .eq("to_key", "scheduled")
    .maybeSingle();
  if (!rule) return ""; // e.g. awaiting quotation: the visit is booked, the status stays
  if (rule.required_permission && !ctx.can(rule.required_permission)) return " The job status was left as it is: moving it to Scheduled needs a permission your role does not have.";
  const { data, error } = await supabase.from("work_orders").update({ status: "scheduled" }).eq("tenant_id", ctx.tenantId).eq("id", job.id).select("id");
  if (error) return ` The job status could not be changed: ${fromDb(error).message}`;
  if (!data?.length) return " The job status was left as it is: your role cannot edit jobs.";
  return " Job moved to Scheduled.";
}

/* ------------------------------------------------------------------ reschedule / edit a booking */
export async function updateBooking(input: {
  id: string;
  employeeId: string | null;
  subcontractorId: string | null;
  start: string;
  end: string;
  status?: string;
}): Promise<ActionResult> {
  const ctx = await writer();
  if (!ctx) return denied;
  const parsed = z
    .object({ id: uuid, status: z.enum(EDITABLE_STATUS).optional() })
    .and(resource)
    .and(slotSchema)
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("job_assignments")
    .select("id, employee_id, subcontractor_id, status, work_order:work_orders(reference)")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", v.id)
    .maybeSingle();
  if (!current) return { ok: false, message: "That booking no longer exists." };
  if (current.status === "cancelled") return { ok: false, message: "That booking was cancelled. Book the job again from the queue." };

  let who: Awaited<ReturnType<typeof resourceName>> = null;
  if (v.employeeId !== current.employee_id || v.subcontractorId !== current.subcontractor_id) {
    who = await resourceName(supabase, ctx.tenantId, v);
    if (!who) return { ok: false, message: "Only active field operatives and approved subcontractors can be booked." };
    if (!who.ok) return { ok: false, message: `${who.name} is ${who.status} and cannot be booked.` };
  }

  const { data, error } = await supabase
    .from("job_assignments")
    .update({
      employee_id: v.employeeId,
      subcontractor_id: v.subcontractorId,
      scheduled_start: v.start,
      scheduled_end: v.end,
      ...(v.status ? { status: v.status } : {}),
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", v.id)
    .select("id");
  if (error) return fromDb(error, "The booking could not be changed.");
  if (!data?.length) return { ok: false, message: "You do not have permission to change this booking." };
  revalidatePath("/schedule");
  const ref = current.work_order?.reference ?? "Booking";
  return { ok: true, message: `${ref} ${who ? `moved to ${who.name}, ` : "now "}${fmtSlot(v.start, v.end)}.` };
}

/* ------------------------------------------------------------------ unassign */
export async function unassignBooking(id: string): Promise<ActionResult> {
  const ctx = await writer();
  if (!ctx) return denied;
  if (!uuid.safeParse(id).success) return { ok: false, message: "Invalid request." };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("job_assignments")
    .update({ status: "cancelled" })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .neq("status", "cancelled")
    .select("id, work_order_id, work_order:work_orders(id, reference, status)");
  if (error) return fromDb(error, "The booking could not be cancelled.");
  const row = data?.[0];
  if (!row) return { ok: false, message: "That booking was already cancelled or you cannot change it." };

  // A "Scheduled" job with nobody booked any more goes back to the queue as Approved
  // (only when the configured workflow allows that move).
  let note = "";
  const job = row.work_order;
  if (job?.status === "scheduled") {
    const { count } = await supabase
      .from("job_assignments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", ctx.tenantId)
      .eq("work_order_id", job.id)
      .not("status", "in", "(cancelled,no_access)");
    if (!count) {
      const { data: rule } = await supabase.from("job_status_transitions").select("required_permission").eq("tenant_id", ctx.tenantId).eq("from_key", "scheduled").eq("to_key", "approved").maybeSingle();
      if (rule && (!rule.required_permission || ctx.can(rule.required_permission))) {
        const { data: moved, error: mErr } = await supabase.from("work_orders").update({ status: "approved" }).eq("tenant_id", ctx.tenantId).eq("id", job.id).select("id");
        note = mErr ? ` The job stays Scheduled: ${fromDb(mErr).message}` : moved?.length ? " The job is back in the queue as Approved." : "";
      }
    }
  }
  revalidatePath("/schedule");
  return { ok: true, message: `${job?.reference ?? "Booking"} unassigned.${note}` };
}
