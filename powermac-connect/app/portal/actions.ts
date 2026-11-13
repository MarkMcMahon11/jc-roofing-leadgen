"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireTenant } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { fromDb, fromZod, type ActionResult } from "@/lib/actions";

async function portal() {
  const ctx = await requireTenant();
  if (ctx.active.role.scope !== "client") redirect("/");
  return { ctx, supabase: await createClient() };
}

const requestSchema = z.object({
  property_id: z.string().uuid("Choose the property"),
  title: z.string().trim().min(3, "Describe the problem in a few words").max(200),
  description: z.string().trim().max(5000).optional(),
  priority: z.enum(["emergency", "urgent", "routine", "planned"]),
  client_reference: z.string().trim().max(60).optional(),
});

export async function submitRequest(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const { ctx, supabase } = await portal();
  const parsed = requestSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return fromZod(parsed.error);
  const d = parsed.data;
  const { data, error } = await supabase.rpc("portal_submit_request", { p_tenant: ctx.tenantId, p_property: d.property_id, p_title: d.title, p_description: d.description ?? "", p_priority: d.priority, p_client_reference: d.client_reference });
  if (error || !data) return fromDb(error, "Your request could not be submitted.");
  revalidatePath("/portal");
  redirect(`/portal/jobs/${data}?submitted=1`);
}

export async function addMessage(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const { ctx, supabase } = await portal();
  const job = z.string().uuid().safeParse(formData.get("job_id"));
  const body = String(formData.get("body") ?? "").trim();
  if (!job.success) return { ok: false, message: "Invalid request." };
  if (!body) return { ok: false, fieldErrors: { body: ["Write a message"] } };
  const { error } = await supabase.rpc("portal_add_message", { p_tenant: ctx.tenantId, p_job: job.data, p_body: body });
  if (error) return fromDb(error);
  revalidatePath(`/portal/jobs/${job.data}`);
  return { ok: true, message: "Message sent to PowerMac." };
}

const decideSchema = z.object({ quote_id: z.string().uuid(), decision: z.enum(["approve", "reject"]), name: z.string().trim().min(2, "Enter your name"), reason: z.string().trim().max(2000).optional() });

export async function decideQuote(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const { ctx, supabase } = await portal();
  const parsed = decideSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return fromZod(parsed.error);
  if (parsed.data.decision === "reject" && !parsed.data.reason) return { ok: false, fieldErrors: { reason: ["Tell us why so we can revise it"] } };
  const { error } = await supabase.rpc("portal_decide_quote", { p_tenant: ctx.tenantId, p_quote: parsed.data.quote_id, p_approve: parsed.data.decision === "approve", p_name: parsed.data.name, p_reason: parsed.data.reason });
  if (error) return fromDb(error);
  revalidatePath("/portal/quotes");
  return { ok: true, message: parsed.data.decision === "approve" ? "Quotation approved. PowerMac has been notified." : "Quotation rejected. PowerMac has been notified." };
}
