// Roof photos live in Supabase Storage, not in the leads document: keeps that JSON document small (unrelated writes,
// like a new enquiry elsewhere, don't have to rewrite megabytes of image data), and photo bytes never pass through
// our own server on upload (see app/api/photos/sign) so a "highest quality" phone photo isn't capped by the host's
// request-body limit. The bucket is private; the owner page gets short-lived signed links instead of a public URL.
const BUCKET = "photos";

function sbUrl() {
  return process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
}
function sbKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
}
export const photosEnabled = () => !!(sbUrl() && sbKey());

async function storageFetch(path: string, init: { method?: string; headers?: Record<string, string>; body?: BodyInit } = {}) {
  const key = sbKey()!;
  return fetch(`${sbUrl()}/storage/v1${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20000), // photo bytes are only ever fetched server-to-server (see downloadPhoto), never proxied to a browser here
  });
}

/**
 * A one-time upload permission for exactly this object path. The browser uploads directly to this URL (never through
 * our server), so the file's real size is limited only by the bucket's own settings (docs/supabase.sql), not by our host.
 */
export async function createUploadUrl(objectPath: string): Promise<string> {
  const r = await storageFetch(`/object/upload/sign/${BUCKET}/${objectPath}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) throw new Error(`Could not prepare an upload slot (${r.status})`);
  const { url } = (await r.json()) as { url?: string };
  if (!url) throw new Error("Storage did not return an upload URL");
  return `${sbUrl()}/storage/v1${url}`; // relative -> absolute, so the browser can PUT to it directly
}

/** Fetch a photo's bytes for AI analysis. Server-to-server only (not subject to the host's client-facing body-size limit). */
export async function downloadPhoto(objectPath: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const r = await storageFetch(`/object/${BUCKET}/${objectPath}`);
  if (!r.ok) return null;
  return { bytes: await r.arrayBuffer(), contentType: r.headers.get("content-type") ?? "image/jpeg" };
}

export async function deletePhotos(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const r = await storageFetch(`/object/${BUCKET}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: paths }) });
  if (!r.ok) console.error(`[photos] delete failed (${r.status}) for`, paths);
}

/** Short-lived (1 hour) URLs so the owner page can show photos without the bucket being public. */
export async function signPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const r = await storageFetch(`/object/sign/${BUCKET}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 3600, paths }) });
  if (!r.ok) return {};
  const rows = (await r.json().catch(() => [])) as { path?: string; signedURL?: string }[];
  const out: Record<string, string> = {};
  for (const row of rows) if (row.path && row.signedURL) out[row.path] = `${sbUrl()}/storage/v1${row.signedURL}`;
  return out;
}
