"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { fromDb, fromZod, type ActionResult } from "@/lib/actions";
import { env } from "@/lib/env";
import { escapeHtml, sendEmail } from "@/lib/email";
import { logEvent } from "@/lib/audit";

export type InviteResult = ActionResult & { link?: string };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  full_name: z.string().trim().min(2, "Enter their name").max(160),
  role_id: z.string().uuid("Choose a role"),
  link_id: z.string().uuid().optional(),
});

export async function inviteUser(_: InviteResult, formData: FormData): Promise<InviteResult> {
  const ctx = await requireInternal("users.manage");
  const parsed = inviteSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return fromZod(parsed.error);
  if (!isAdminConfigured()) return { ok: false, message: "Inviting users needs SUPABASE_SERVICE_ROLE_KEY on the server." };
  const { email, full_name, role_id, link_id } = parsed.data;

  const supabase = await createClient();
  const { data: role } = await supabase.from("roles").select("id, name, scope_type").eq("id", role_id).eq("tenant_id", ctx.tenantId).single();
  if (!role) return { ok: false, fieldErrors: { role_id: ["Choose a role"] } };
  const linkField = { client: "organisation_id", operative: "employee_id", subcontractor: "subcontractor_id", occupant: "occupant_id", internal: "employee_id" }[role.scope_type]!;
  if (role.scope_type !== "internal" && !link_id) return { ok: false, fieldErrors: { link_id: ["Choose who this account belongs to"] } };

  // Create (or find) the auth user and a single-use invitation link. The service role is used
  // ONLY for Supabase Auth; the membership row below is written with the inviter's own session,
  // so RLS and the escalation guards apply to it.
  const admin = createAdminClient();
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "invite", email, options: { data: { full_name } } });
  let userId = linkData?.user?.id;
  let tokenHash = linkData?.properties?.hashed_token;
  let linkType: "invite" | "magiclink" = "invite";
  if (linkError) {
    // existing account (e.g. member of another company): send a sign-in link instead
    const { data: ml, error: mlError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (mlError || !ml?.user) return { ok: false, message: "The invitation could not be created. Check the email address." };
    userId = ml.user.id; tokenHash = ml.properties.hashed_token; linkType = "magiclink";
  }
  if (!userId || !tokenHash) return { ok: false, message: "The invitation could not be created." };

  const { error } = await supabase.from("memberships").insert({
    tenant_id: ctx.tenantId,
    user_id: userId,
    role_id,
    status: "invited",
    invited_by: ctx.userId,
    invited_at: new Date().toISOString(),
    ...(link_id ? { [linkField]: link_id } : {}),
  });
  if (error) {
    if (error.code === "23505") return { ok: false, message: "That person already has access to this company." };
    return fromDb(error, "The invitation could not be saved.");
  }

  const link = `${env.siteUrl}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${linkType}&next=${encodeURIComponent("/auth/update-password?welcome=1")}`;
  const company = ctx.active.tenant.name;
  const sent = await sendEmail({
    to: email,
    subject: `You have been invited to ${company} on PowerMac Connect`,
    text: `Hello ${full_name},\n\n${ctx.fullName} has invited you to ${company} on PowerMac Connect as ${role.name}.\n\nSet up your account: ${link}\n\nThis link can be used once and expires in 24 hours.`,
    html: `<p>Hello ${escapeHtml(full_name)},</p><p>${escapeHtml(ctx.fullName)} has invited you to <strong>${escapeHtml(company)}</strong> on PowerMac Connect as <strong>${escapeHtml(role.name)}</strong>.</p><p><a href="${link}">Set up your account</a></p><p>This link can be used once and expires in 24 hours.</p>`,
  });
  await logEvent(supabase, ctx.tenantId, "approve", "memberships", `Invited ${email} as ${role.name}`);
  revalidatePath("/settings/users");
  if (sent.status === "sent") return { ok: true, message: `Invitation emailed to ${email}.` };
  return {
    ok: true,
    message: sent.status === "preview" ? "Invitation created. Email is not configured, so share this one-time link with them securely:" : `Invitation created but the email failed (${sent.error}). Share this one-time link securely:`,
    link,
  };
}

const roleSchema = z.object({ membership_id: z.string().uuid(), role_id: z.string().uuid() });

export async function changeRole(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("users.manage");
  const parsed = roleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZod(parsed.error);
  const supabase = await createClient();
  const { data: role } = await supabase.from("roles").select("scope_type").eq("id", parsed.data.role_id).single();
  const { data: current } = await supabase.from("memberships").select("role:roles(scope_type)").eq("id", parsed.data.membership_id).single();
  if (!role || !current) return { ok: false, message: "Not found." };
  if (role.scope_type !== current.role?.scope_type) return { ok: false, message: "Roles can only be changed within the same kind of access (staff, client, operative...). Invite a new account instead." };
  const { error } = await supabase.from("memberships").update({ role_id: parsed.data.role_id }).eq("id", parsed.data.membership_id).eq("tenant_id", ctx.tenantId);
  if (error) return fromDb(error);
  revalidatePath("/settings/users");
  return { ok: true, message: "Role updated." };
}

const memberActionSchema = z.object({ membership_id: z.string().uuid(), op: z.enum(["suspend", "reactivate", "remove"]) });

export async function memberAction(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("users.manage");
  const parsed = memberActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { membership_id, op } = parsed.data;
  const supabase = await createClient();
  const q = op === "remove"
    ? supabase.from("memberships").delete().eq("id", membership_id).eq("tenant_id", ctx.tenantId).select("id")
    : supabase.from("memberships").update({ status: op === "suspend" ? "suspended" : "active" }).eq("id", membership_id).eq("tenant_id", ctx.tenantId).select("id");
  const { data, error } = await q;
  if (error) return fromDb(error);
  if (!data?.length) return { ok: false, message: "Nothing changed." };
  revalidatePath("/settings/users");
  return { ok: true, message: op === "remove" ? "Access removed." : op === "suspend" ? "Access suspended." : "Access restored." };
}
