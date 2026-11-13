"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { fromDb, type ActionResult } from "@/lib/actions";

// Field actions take plain arguments so the offline outbox can store and replay them.
// Each carries a client reference: the database ignores a replay it has already applied.

async function field() {
  const ctx = await requireTenant();
  if (!["operative", "subcontractor"].includes(ctx.active.role.scope)) throw new Error("Field app is for operatives and subcontractors");
  return { ctx, supabase: await createClient() };
}

export type FieldCall =
  | { fn: "update"; assignmentId: string; action: string; note?: string; ref: string }
  | { fn: "material"; assignmentId: string; description: string; quantity: number; unit: string; ref: string }
  | { fn: "timesheet"; assignmentId: string; date: string; hours: number; type: string; notes?: string; ref: string }
  | { fn: "checklist"; assignmentId: string; checklistId: string; items: unknown[]; ref: string }
  | { fn: "signoff"; assignmentId: string; name: string; rating?: number; signaturePath?: string; ref: string }
  | { fn: "photo"; assignmentId: string; path: string; stage: string; caption?: string; ref: string };

export async function runFieldCall(call: FieldCall): Promise<ActionResult> {
  const { ctx, supabase } = await field();
  const t = ctx.tenantId;
  let error;
  switch (call.fn) {
    case "update":
      ({ error } = await supabase.rpc("field_update", { p_tenant: t, p_assignment: call.assignmentId, p_action: call.action, p_note: call.note, p_client_ref: call.ref }));
      break;
    case "material":
      ({ error } = await supabase.rpc("field_add_material", { p_tenant: t, p_assignment: call.assignmentId, p_description: call.description, p_quantity: call.quantity, p_unit: call.unit, p_client_ref: call.ref }));
      break;
    case "timesheet":
      ({ error } = await supabase.rpc("field_submit_timesheet", { p_tenant: t, p_assignment: call.assignmentId, p_date: call.date, p_hours: call.hours, p_type: call.type, p_notes: call.notes, p_client_ref: call.ref }));
      break;
    case "checklist":
      ({ error } = await supabase.rpc("field_checklist", { p_tenant: t, p_assignment: call.assignmentId, p_checklist: call.checklistId, p_items: call.items as never }));
      break;
    case "signoff":
      ({ error } = await supabase.rpc("field_signoff", { p_tenant: t, p_assignment: call.assignmentId, p_name: call.name, p_satisfaction: call.rating, p_signature_path: call.signaturePath }));
      break;
    case "photo":
      ({ error } = await supabase.rpc("field_add_photo", { p_tenant: t, p_assignment: call.assignmentId, p_path: call.path, p_stage: call.stage, p_caption: call.caption }));
      break;
  }
  if (error) return fromDb(error, "That could not be saved. Please try again.");
  revalidatePath(`/field/${call.assignmentId}`);
  revalidatePath("/field");
  return { ok: true };
}
