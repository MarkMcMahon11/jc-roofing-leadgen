import "server-only";
import type { TenantContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { HAZARDS } from "./ui";

/** Options for the property form: clients, their contracts, property types, hazards. */
export async function propertyFormOptions(ctx: TenantContext, currentOrgId?: string) {
  const supabase = await createClient();
  const [{ data: orgs }, { data: contracts }, lookups] = await Promise.all([
    supabase.from("organisations").select("id, name, status, archived_at").eq("tenant_id", ctx.tenantId).order("name"),
    ctx.can("contracts.read")
      ? supabase.from("contracts").select("id, reference, title, organisation_id, status").eq("tenant_id", ctx.tenantId).order("title")
      : Promise.resolve({ data: [] as { id: string; reference: string; title: string; organisation_id: string; status: string }[] }),
    getLookups(ctx.tenantId),
  ]);
  return {
    organisations: (orgs ?? [])
      .filter((o) => (!o.archived_at && o.status !== "inactive") || o.id === currentOrgId)
      .map((o) => ({ value: o.id, label: o.status === "prospect" ? `${o.name} (prospect)` : o.name })),
    // all of the client's contracts (ended ones too, so saving never drops an existing link)
    contracts: (contracts ?? []).map((c) => ({ id: c.id, label: `${c.reference} · ${c.title}`, organisation_id: c.organisation_id, status: c.status })),
    propertyTypes: lookups.options("property_type"),
    hazards: HAZARDS,
  };
}
