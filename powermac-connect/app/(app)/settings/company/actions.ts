"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { fromDb, fromZod, type ActionResult } from "@/lib/actions";

const schema = z.object({
  name: z.string().trim().min(2).max(160),
  legal_name: z.string().trim().max(200).optional().transform((v) => v || null),
  company_number: z.string().trim().max(20).optional().transform((v) => v || null),
  vat_number: z.string().trim().max(20).optional().transform((v) => v || null),
  reference_prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,6}$/, "1-6 letters or numbers"),
  default_vat_rate: z.coerce.number().min(0).max(100),
  timezone: z.string().trim().min(3).max(60),
});

export async function updateCompany(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("settings.manage");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("tenants").update(parsed.data).eq("id", ctx.tenantId);
  if (error) return fromDb(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Company details saved." };
}
