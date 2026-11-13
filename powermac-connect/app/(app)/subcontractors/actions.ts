"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { formObject, fromDb, fromZod, type ActionResult } from "@/lib/actions";
import { todayISO } from "@/lib/format";
import { normalisePostcode, POSTCODE_RE } from "../properties/_lib/geo";

const opt = (max: number) => z.string().trim().max(max, `Up to ${max} characters`).optional();
const check = (field: string, message: string): ActionResult => ({ ok: false, fieldErrors: { [field]: [message] }, message: "Please check the highlighted fields." });

const schema = z.object({
  company_name: z.string().trim().min(2, "Enter the company name").max(200),
  contact_name: opt(160),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(320).optional(),
  phone: opt(40),
  trades: z.array(z.string().regex(/^[a-z0-9_]{1,60}$/)).min(1, "Choose at least one trade"),
  status: z.enum(["pending", "approved", "suspended", "archived"]),
  address: opt(500),
  postcode: z.string().trim().regex(POSTCODE_RE, "Enter a valid UK postcode").transform(normalisePostcode).optional(),
  insurance_expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date").optional(),
  public_liability_gbp: z.coerce.number().min(0, "Cannot be negative").max(1e12, "Too large").optional(),
  cis_status: z.enum(["gross", "net", "higher", "unverified"]),
  day_rate: z.coerce.number().min(0, "Cannot be negative").max(1e8, "Too large").optional(),
  rating: z.coerce.number().min(0, "0 to 5").max(5, "0 to 5").optional(),
  notes: opt(5000),
});

async function parse(fd: FormData, tenantId: string, existingTrades: string[] = []) {
  const parsed = schema.safeParse({ ...formObject(fd), trades: fd.getAll("trades").map(String) });
  if (!parsed.success) return { error: fromZod(parsed.error) } as const;
  const d = parsed.data;
  const lookups = await getLookups(tenantId);
  const allowed = new Set([...lookups.options("trade").map((o) => o.value), ...existingTrades]);
  if (d.trades.some((t) => !allowed.has(t))) return { error: check("trades", "Choose trades from the list") } as const;
  // approval is a compliance decision: insurance must be in date
  if (d.status === "approved" && (!d.insurance_expiry || d.insurance_expiry < todayISO()))
    return { error: check("insurance_expiry", "A subcontractor can only be approved with in-date insurance. Enter the current policy's expiry date.") } as const;
  return {
    row: {
      company_name: d.company_name,
      contact_name: d.contact_name ?? null,
      email: d.email ?? null,
      phone: d.phone ?? null,
      trades: [...new Set(d.trades)],
      status: d.status,
      address: d.address ?? null,
      postcode: d.postcode ?? null,
      insurance_expiry: d.insurance_expiry ?? null,
      public_liability_gbp: d.public_liability_gbp ?? null,
      cis_status: d.cis_status,
      day_rate: d.day_rate ?? null,
      rating: d.rating === undefined ? null : Math.round(d.rating * 10) / 10,
      notes: d.notes ?? null,
    },
  };
}

export async function createSubcontractor(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("subcontractors.write");
  const r = await parse(formData, ctx.tenantId);
  if ("error" in r) return r.error!;
  const supabase = await createClient();
  const { data, error } = await supabase.from("subcontractors").insert({ ...r.row, tenant_id: ctx.tenantId, reference: "" }).select("id").single();
  if (error || !data) return fromDb(error, "The subcontractor could not be saved.");
  revalidatePath("/subcontractors");
  redirect(`/subcontractors/${data.id}?saved=created`);
}

export async function updateSubcontractor(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("subcontractors.write");
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Subcontractor not found." };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("subcontractors").select("id, trades").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle();
  if (!existing) return { ok: false, message: "Subcontractor not found." };
  const r = await parse(formData, ctx.tenantId, existing.trades);
  if ("error" in r) return r.error!;
  const { error } = await supabase.from("subcontractors").update(r.row).eq("tenant_id", ctx.tenantId).eq("id", id);
  if (error) return fromDb(error, "The subcontractor could not be saved.");
  revalidatePath("/subcontractors");
  revalidatePath(`/subcontractors/${id}`);
  redirect(`/subcontractors/${id}?saved=updated`);
}
