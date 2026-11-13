import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Service-role client. BYPASSES Row Level Security - use only for narrowly scoped server
 * tasks after the caller's permission has been checked (e.g. sending an invite through
 * Supabase Auth). Never import this into client components.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient<Database>(env.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function isAdminConfigured() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
