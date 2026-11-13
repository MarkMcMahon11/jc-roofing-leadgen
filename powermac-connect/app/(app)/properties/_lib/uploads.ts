import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

/*
 * File uploads for property and subcontractor records. A Route Handler (not a Server Action)
 * receives the file because Server Action bodies are capped at 1 MB; the proxy buffers up to
 * 10 MB, so we accept files up to 9 MB. Storage and table writes use the signed-in user's
 * client, so storage policies and RLS decide what is allowed.
 */
export const MAX_UPLOAD_BYTES = 9 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

type Owner = { kind: "property"; id: string } | { kind: "subcontractor"; id: string };

const docSchema = z.object({
  name: z.string().trim().max(255).optional(),
  category: z.string().trim().regex(/^[a-z0-9_]{1,60}$/).default("other"),
  visibility: z.enum(["internal", "client", "occupant"]).default("internal"),
  expires_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const photoSchema = z.object({
  caption: z.string().trim().max(500).optional(),
  stage: z.enum(["before", "during", "after", "issue", "inspection", "signoff"]).default("during"),
  visibility: z.enum(["internal", "client", "occupant"]).default("internal"),
});

export function safeFileName(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return (cleaned || "file").slice(-120);
}

const json = (status: number, body: { ok: boolean; message: string }) => Response.json(body, { status });

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function handleUpload(request: Request, owner: Owner): Promise<Response> {
  if (!sameOrigin(request)) return json(403, { ok: false, message: "Upload rejected: request did not come from this site." });
  const ctx = await getContext();
  if (!ctx?.active || ctx.active.role.scope !== "internal") return json(401, { ok: false, message: "Please sign in again." });
  const tenantId = ctx.active.tenant.id;
  if (!z.string().uuid().safeParse(owner.id).success) return json(404, { ok: false, message: "Record not found." });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, message: "The file could not be read. Files can be up to 9 MB." });
  }
  const kind = form.get("kind") === "photo" ? "photo" : "document";
  if (kind === "photo" && owner.kind !== "property") return json(400, { ok: false, message: "Photos can only be added to properties." });
  const perm = kind === "photo" ? "work_orders.write" : "documents.write";
  if (!ctx.can(perm)) return json(403, { ok: false, message: "You do not have permission to upload here." });

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return json(400, { ok: false, message: "Choose a file to upload." });
  if (file.size > MAX_UPLOAD_BYTES) return json(413, { ok: false, message: "That file is larger than 9 MB." });
  if (kind === "photo" && !PHOTO_TYPES.includes(file.type)) return json(415, { ok: false, message: "Photos must be JPEG, PNG, WebP or HEIC images." });

  const fields = Object.fromEntries([...form.entries()].filter(([k, v]) => typeof v === "string" && v.trim() !== "" && k !== "kind" && k !== "file"));
  const supabase = await createClient();

  // the record must exist and be visible to this user in this tenant
  const ownerTable = owner.kind === "property" ? "properties" : "subcontractors";
  const { data: rec } = await supabase.from(ownerTable).select("id").eq("tenant_id", tenantId).eq("id", owner.id).maybeSingle();
  if (!rec) return json(404, { ok: false, message: "Record not found." });

  const folder = owner.kind === "property" ? "properties" : "subcontractors";
  const path = `${tenantId}/${folder}/${owner.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const bucket = kind === "photo" ? "photos" : "documents";
  const page = owner.kind === "property" ? `/properties/${owner.id}` : `/subcontractors/${owner.id}`;

  if (kind === "document") {
    const parsed = docSchema.safeParse(fields);
    if (!parsed.success) return json(400, { ok: false, message: "Please check the document details." });
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
    if (upErr) return json(400, { ok: false, message: upErr.message.includes("row-level security") ? "You do not have permission to upload documents." : "The file could not be stored. Please try again." });
    const { error } = await supabase.from("documents").insert({
      tenant_id: tenantId,
      name: (parsed.data.name || file.name).slice(0, 255),
      category: parsed.data.category,
      visibility: parsed.data.visibility,
      expires_on: parsed.data.expires_on ?? null,
      storage_path: path,
      mime_type: (file.type || "application/octet-stream").slice(0, 120),
      size_bytes: file.size,
      ...(owner.kind === "property" ? { property_id: owner.id } : { subcontractor_id: owner.id }),
    });
    if (error) {
      await supabase.storage.from(bucket).remove([path]);
      return json(400, { ok: false, message: error.code === "23514" ? "That document category is not configured." : "The document could not be saved." });
    }
    revalidatePath(page);
    return json(200, { ok: true, message: `Uploaded ${file.name}.` });
  }

  const parsed = photoSchema.safeParse(fields);
  if (!parsed.success) return json(400, { ok: false, message: "Please check the photo details." });
  const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return json(400, { ok: false, message: upErr.message.includes("row-level security") ? "You do not have permission to upload photos." : "The photo could not be stored. Please try again." });
  const { error } = await supabase.from("photos").insert({
    tenant_id: tenantId,
    property_id: owner.id,
    storage_path: path,
    caption: parsed.data.caption ?? null,
    stage: parsed.data.stage,
    visibility: parsed.data.visibility,
    taken_at: new Date().toISOString(),
  });
  if (error) {
    await supabase.storage.from(bucket).remove([path]);
    return json(400, { ok: false, message: "The photo could not be saved." });
  }
  revalidatePath(page);
  return json(200, { ok: true, message: "Photo added." });
}
