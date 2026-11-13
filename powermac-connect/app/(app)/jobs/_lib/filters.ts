import "server-only";
import type { ServerClient } from "@/lib/supabase/server";
import { addDays, londonDate, londonDayBounds } from "./time";
import { PRIORITY_RANK } from "./constants";

type SP = Record<string, string | string[] | undefined>;

export type JobFilters = {
  q?: string;
  status?: string;
  priority?: string;
  trade?: string;
  org?: string;
  contract?: string;
  assignee?: string;
  due?: "overdue" | "today" | "week";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z_]{2,60}$/;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** Read the shared job filters from the URL, ignoring anything malformed. */
export function parseFilters(sp: SP): JobFilters {
  const f: JobFilters = {};
  const q = one(sp.q);
  // PostgREST filter syntax uses , ( ) and * - keep only characters people search with
  if (q) f.q = q.replace(/[^\p{L}\p{N}\s\-/.#&']/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80) || undefined;
  const status = one(sp.status);
  if (status && KEY.test(status)) f.status = status;
  const priority = one(sp.priority);
  if (priority && priority in PRIORITY_RANK) f.priority = priority;
  const trade = one(sp.trade);
  if (trade && KEY.test(trade)) f.trade = trade;
  for (const k of ["org", "contract", "assignee"] as const) {
    const v = one(sp[k]);
    if (v && UUID.test(v)) f[k] = v;
  }
  const due = one(sp.due) ?? (one(sp.filter) === "overdue" ? "overdue" : undefined);
  if (due === "overdue" || due === "today" || due === "week") f.due = due;
  return f;
}

export function hasFilters(f: JobFilters) {
  return Object.values(f).some(Boolean);
}

/** Query-string for the given filters (plus extra params), for links between views. */
export function filterQuery(f: JobFilters, extra: Record<string, string | undefined> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * A work_orders query with the shared filters applied. The select list is chosen by the
 * caller; results are typed by the caller (the select is built at run time).
 * Assignee filtering uses an inner-joined, aliased embed so it scales to any number of jobs.
 */
export function jobQuery(
  supabase: ServerClient,
  tenantId: string,
  select: string,
  f: JobFilters,
  openKeys: string[],
  opts: { count?: boolean; head?: boolean } = {},
) {
  const columns = f.assignee ? `${select}, _assignee:job_assignments!inner(employee_id, status)` : select;
  let q = supabase
    .from("work_orders")
    .select(columns, opts.count || opts.head ? { count: "exact", head: Boolean(opts.head) } : undefined)
    .eq("tenant_id", tenantId);
  if (f.assignee) q = q.eq("_assignee.employee_id", f.assignee).neq("_assignee.status", "cancelled");
  if (f.q) {
    const like = `%${f.q}%`;
    q = q.or(`reference.ilike.${like},title.ilike.${like},client_reference.ilike.${like}`);
  }
  if (f.status) q = q.eq("status", f.status);
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.trade) q = q.eq("trade", f.trade);
  if (f.org) q = q.eq("organisation_id", f.org);
  if (f.contract) q = q.eq("contract_id", f.contract);
  if (f.due) {
    const today = londonDate();
    if (f.due === "overdue") q = q.lt("target_completion_at", new Date().toISOString());
    if (f.due === "today") {
      const b = londonDayBounds(today);
      q = q.gte("target_completion_at", b.start).lt("target_completion_at", b.end);
    }
    if (f.due === "week") {
      q = q.gte("target_completion_at", londonDayBounds(today).start).lt("target_completion_at", londonDayBounds(addDays(today, 7)).start);
    }
    // "due" only makes sense for open work
    q = q.in("status", openKeys.length ? openKeys : ["__none__"]);
  }
  return q;
}
