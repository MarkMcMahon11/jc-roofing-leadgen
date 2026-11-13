import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";

export async function employeeFormOptions(tenantId: string, currentVehicleId?: string | null) {
  const supabase = await createClient();
  const [lookups, { data: vehicles }, { data: holders }] = await Promise.all([
    getLookups(tenantId),
    supabase.from("vehicles").select("id, registration, make, model, status").eq("tenant_id", tenantId).order("registration"),
    supabase.from("employees").select("vehicle_id, first_name, last_name").eq("tenant_id", tenantId).neq("employment_status", "left").not("vehicle_id", "is", null),
  ]);
  const holder = new Map((holders ?? []).map((h) => [h.vehicle_id!, `${h.first_name} ${h.last_name}`]));
  return {
    trades: lookups.options("trade"),
    skills: lookups.options("skill"),
    vehicles: (vehicles ?? [])
      .filter((v) => v.status !== "disposed" || v.id === currentVehicleId)
      .map((v) => {
        const who = v.id !== currentVehicleId ? holder.get(v.id) : undefined;
        return { value: v.id, label: `${v.registration}${v.make ? ` · ${[v.make, v.model].filter(Boolean).join(" ")}` : ""}${who ? ` (also ${who})` : ""}` };
      }),
  };
}
