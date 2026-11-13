"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fromZod, type ActionResult } from "@/lib/actions";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/audit";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export async function signIn(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    // one message for wrong email or password: do not reveal which accounts exist
    return { ok: false, message: error.status === 429 ? "Too many attempts. Please wait a few minutes and try again." : "Email or password is not correct." };
  }
  const { data: m } = await supabase.from("memberships").select("tenant_id").eq("status", "active").limit(1).maybeSingle();
  await logEvent(supabase, m?.tenant_id ?? null, "login", "session");
  const next = parsed.data.next;
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

const resetSchema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address") });

export async function requestPasswordReset(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${env.siteUrl}/auth/callback?next=/auth/update-password` });
  // same answer whether or not the account exists
  return { ok: true, message: "If that email has an account, a reset link is on its way. It expires in one hour." };
}
