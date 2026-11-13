import "server-only";
import type { ServerClient } from "@/lib/supabase/server";

export async function loadJob(supabase: ServerClient, tenantId: string, id: string) {
  const { data } = await supabase
    .from("work_orders")
    .select(
      `id, reference, title, description, status, priority, source, work_category, trade, client_reference, reported_at, target_attend_at, target_completion_at,
       estimated_hours, estimated_cost, not_to_exceed, requires_approval, approved_at, access_notes, completion_notes, signoff_name, signoff_at, satisfaction_score,
       first_time_fix, actual_start, actual_end, scheduled_start, scheduled_end, completed_at, closed_at, created_at, organisation_id, contract_id, property_id, occupant_id,
       organisations(id, name, reference),
       contracts(id, reference, title, status),
       properties(id, reference, address_line1, address_line2, town, postcode, hazards, restrictions, access_notes, property_type, status),
       manager:profiles!work_orders_manager_id_fkey(full_name),
       approver:profiles!work_orders_approved_by_fkey(full_name),
       creator:profiles!work_orders_created_by_fkey(full_name)`,
    )
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return data;
}

export type Job = NonNullable<Awaited<ReturnType<typeof loadJob>>>;
