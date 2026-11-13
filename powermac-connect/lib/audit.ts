import "server-only";
import type { ServerClient } from "@/lib/supabase/server";

type Action = "login" | "logout" | "export" | "ai_action" | "approve" | "reject";

/** Records an explicit audit event (data changes are audited automatically by the database). */
export async function logEvent(supabase: ServerClient, tenantId: string | null, action: Action, entity: string, summary?: string, details?: Record<string, unknown>) {
  await supabase.rpc("log_audit_event", {
    p_tenant: tenantId as string, // nullable in the database: platform-level events have no tenant
    p_action: action,
    p_entity: entity,
    p_summary: summary,
    p_details: details as never,
  });
}
