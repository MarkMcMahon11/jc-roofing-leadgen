"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { fromDb, type ActionResult } from "@/lib/actions";

export type UrlResult = ActionResult & { url?: string };

const id = z.string().uuid();

/** Short-lived signed download link for a document the user can read (RLS + storage policy). */
export async function documentDownloadUrl(documentId: string): Promise<UrlResult> {
  const ctx = await requireInternal("documents.read");
  if (!id.safeParse(documentId).success) return { ok: false, message: "Document not found." };
  const supabase = await createClient();
  const { data: doc } = await supabase.from("documents").select("storage_path, name").eq("tenant_id", ctx.tenantId).eq("id", documentId).maybeSingle();
  if (!doc) return { ok: false, message: "Document not found." };
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60, { download: doc.name });
  if (error || !data?.signedUrl) return { ok: false, message: "The file is not available. It may have been removed from storage." };
  return { ok: true, url: data.signedUrl };
}

export async function deleteDocument(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("documents.delete");
  const documentId = String(formData.get("document_id") ?? "");
  if (!id.safeParse(documentId).success) return { ok: false, message: "Document not found." };
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("documents")
    .select("id, storage_path, property_id, subcontractor_id")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { ok: false, message: "Document not found." };
  const { error } = await supabase.from("documents").delete().eq("id", doc.id).eq("tenant_id", ctx.tenantId);
  if (error) return fromDb(error, "The document could not be removed.");
  await supabase.storage.from("documents").remove([doc.storage_path]);
  if (doc.property_id) revalidatePath(`/properties/${doc.property_id}`);
  if (doc.subcontractor_id) revalidatePath(`/subcontractors/${doc.subcontractor_id}`);
  return { ok: true, message: "Document removed." };
}

export async function deletePhoto(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const ctx = await requireInternal("work_orders.write");
  const photoId = String(formData.get("photo_id") ?? "");
  if (!id.safeParse(photoId).success) return { ok: false, message: "Photo not found." };
  const supabase = await createClient();
  const { data: photo } = await supabase.from("photos").select("id, storage_path, property_id").eq("tenant_id", ctx.tenantId).eq("id", photoId).maybeSingle();
  if (!photo) return { ok: false, message: "Photo not found." };
  const { error } = await supabase.from("photos").delete().eq("id", photo.id).eq("tenant_id", ctx.tenantId);
  if (error) return fromDb(error, "The photo could not be removed.");
  await supabase.storage.from("photos").remove([photo.storage_path]);
  if (photo.property_id) revalidatePath(`/properties/${photo.property_id}`);
  return { ok: true, message: "Photo removed." };
}
