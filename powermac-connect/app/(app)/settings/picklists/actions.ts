"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { fromDb, fromZod, type ActionResult } from "@/lib/actions";

const LISTS = ["trade", "work_category", "property_type", "organisation_category", "contract_type", "document_category", "skill", "absence_type", "lead_source"] as const;

const addSchema = z.object({ list: z.enum(LISTS), label: z.string().trim().min(1, "Enter a value").max(80) });

export async function addValue(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("settings.manage");
  const parsed = addSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const key = parsed.data.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "value";
  const supabase = await createClient();
  const { error } = await supabase.from("lookup_values").insert({ tenant_id: ctx.tenantId, list: parsed.data.list, key, label: parsed.data.label, sort_order: 999 });
  if (error) return fromDb(error);
  revalidatePath("/settings/picklists");
  return { ok: true, message: `Added "${parsed.data.label}".` };
}

export async function toggleValue(id: string, active: boolean): Promise<ActionResult> {
  const ctx = await requireInternal("settings.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("lookup_values").update({ is_active: active }).eq("id", z.string().uuid().parse(id)).eq("tenant_id", ctx.tenantId);
  if (error) return fromDb(error);
  revalidatePath("/settings/picklists");
  return { ok: true };
}
