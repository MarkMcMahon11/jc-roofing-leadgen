"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fromZod, type ActionResult } from "@/lib/actions";

const schema = z
  .object({
    password: z
      .string()
      .min(12, "Use at least 12 characters")
      .max(128)
      .refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p), "Include upper and lower case letters and a number"),
    confirm: z.string(),
    fullName: z.string().trim().max(160).optional(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "The passwords do not match" });

export async function updatePassword(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "This link has expired. Please request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: error.message.includes("same") ? "Choose a password you have not used before." : "The password could not be changed. Please try again." };
  if (parsed.data.fullName) await supabase.from("profiles").update({ full_name: parsed.data.fullName }).eq("id", user.id);
  // accept any pending invitations now that the account is set up
  await supabase.rpc("accept_my_invitations");
  redirect("/");
}
