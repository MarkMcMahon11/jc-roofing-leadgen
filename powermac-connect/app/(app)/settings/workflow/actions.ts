"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { fromDb, fromZod, type ActionResult } from "@/lib/actions";

const statusSchema = z.object({
  key: z.string().regex(/^[a-z_]{2,40}$/),
  label: z.string().trim().min(2).max(60),
  client_label: z.string().trim().max(60).optional().transform((v) => v || null),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #3b82f6"),
});

export async function updateStatus(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("settings.manage");
  const parsed = statusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const { key, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("job_statuses").update(rest).eq("tenant_id", ctx.tenantId).eq("key", key);
  if (error) return fromDb(error);
  revalidatePath("/settings/workflow");
  return { ok: true, message: "Saved." };
}

export async function setTransition(from: string, to: string, allowed: boolean, permission: string | null): Promise<ActionResult> {
  const ctx = await requireInternal("settings.manage");
  const supabase = await createClient();
  const { error } = allowed
    ? await supabase.from("job_status_transitions").upsert({ tenant_id: ctx.tenantId, from_key: from, to_key: to, required_permission: permission }, { onConflict: "tenant_id,from_key,to_key" })
    : await supabase.from("job_status_transitions").delete().eq("tenant_id", ctx.tenantId).eq("from_key", from).eq("to_key", to);
  if (error) return fromDb(error);
  revalidatePath("/settings/workflow");
  return { ok: true };
}
