"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { fromDb, fromZod, type ActionResult } from "@/lib/actions";

const schema = z.object({ id: z.string().uuid(), retain_months: z.coerce.number().int().min(1).max(240), is_active: z.string().optional() });

export async function updateRetention(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("settings.manage");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("retention_policies").update({ retain_months: parsed.data.retain_months, is_active: parsed.data.is_active === "on" }).eq("id", parsed.data.id).eq("tenant_id", ctx.tenantId);
  if (error) return fromDb(error);
  revalidatePath("/settings/retention");
  return { ok: true, message: "Saved." };
}
