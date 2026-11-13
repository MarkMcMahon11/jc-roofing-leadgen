"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { fromDb, fromZod, type ActionResult } from "@/lib/actions";

async function requirePlatform() {
  const ctx = await requireUser();
  if (!ctx.isPlatformAdmin) redirect("/no-access?need=platform");
  return ctx;
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/, "Lowercase letters, numbers and hyphens"),
  plan: z.enum(["trial", "professional", "enterprise"]),
  prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,6}$/, "1-6 letters or numbers"),
  is_demo: z.string().optional(),
});

export async function createTenant(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePlatform();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_create_tenant", { p_name: parsed.data.name, p_slug: parsed.data.slug, p_plan: parsed.data.plan, p_is_demo: parsed.data.is_demo === "on", p_prefix: parsed.data.prefix });
  if (error) return fromDb(error, "The company could not be created.");
  revalidatePath("/platform");
  return { ok: true, message: `${parsed.data.name} created with default roles, workflow and picklists. Add its first administrator below.` };
}

const subSchema = z.object({ tenant: z.string().uuid(), plan: z.enum(["trial", "professional", "enterprise"]), status: z.enum(["trial", "active", "past_due", "suspended", "cancelled"]), seats: z.coerce.number().int().min(1).max(5000) });

export async function updateSubscription(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requirePlatform();
  const parsed = subSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_update_subscription", { p_tenant: parsed.data.tenant, p_plan: parsed.data.plan, p_status: parsed.data.status, p_seats: parsed.data.seats });
  if (error) return fromDb(error);
  revalidatePath("/platform");
  return { ok: true, message: "Subscription updated." };
}
