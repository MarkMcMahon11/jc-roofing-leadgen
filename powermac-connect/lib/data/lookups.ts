import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type LookupList = "trade" | "work_category" | "property_type" | "organisation_category" | "contract_type" | "document_category" | "skill" | "absence_type" | "cost_category" | "lead_source";
export type Option = { value: string; label: string };

/** All active picklist values for the tenant, grouped by list. Cached per request. */
export const getLookups = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("lookup_values").select("list, key, label, is_active, sort_order").eq("tenant_id", tenantId).order("sort_order");
  const map = new Map<string, Option[]>();
  const labels = new Map<string, string>();
  for (const row of data ?? []) {
    labels.set(`${row.list}:${row.key}`, row.label);
    if (!row.is_active) continue;
    if (!map.has(row.list)) map.set(row.list, []);
    map.get(row.list)!.push({ value: row.key, label: row.label });
  }
  return {
    options: (list: LookupList) => map.get(list) ?? [],
    label: (list: LookupList, key: string | null | undefined) => (key ? labels.get(`${list}:${key}`) ?? key.replace(/_/g, " ") : "-"),
  };
});

export type JobStatus = { key: string; label: string; client_label: string | null; category: string; colour: string; sort_order: number; is_terminal: boolean; counts_as_open: boolean; is_active: boolean };

export const getStatuses = cache(async (tenantId: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("job_statuses")
    .select("key, label, client_label, category, colour, sort_order, is_terminal, counts_as_open, is_active")
    .eq("tenant_id", tenantId)
    .order("sort_order");
  const list = (data ?? []) as JobStatus[];
  const byKey = new Map(list.map((s) => [s.key, s]));
  return { list, get: (key: string) => byKey.get(key) ?? { key, label: key, colour: "#64748b", category: "intake" } as JobStatus };
});
