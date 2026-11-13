"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { fromDb, fromZod, type ActionResult } from "@/lib/actions";

const schema = z.object({
  full_name: z.string().trim().min(2, "Enter your name").max(160),
  phone: z.string().trim().max(40).optional().transform((v) => v || null),
});

export async function updateProfile(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", ctx.userId);
  if (error) return fromDb(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile saved." };
}

const pw = z
  .object({
    password: z.string().min(12, "Use at least 12 characters").max(128).refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p), "Include upper and lower case letters and a number"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "The passwords do not match" });

export async function changePassword(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const parsed = pw.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: error.message.includes("same") ? "Choose a password you have not used before." : "The password could not be changed." };
  return { ok: true, message: "Password changed." };
}
