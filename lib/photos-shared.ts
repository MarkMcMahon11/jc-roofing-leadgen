// Rules shared by the browser (capture UI) and the server (upload routes). No secrets, no Node APIs: safe to import from client components.

export const MAX_PHOTOS_PER_LEAD = 4;
// Generous: photos are captured at full quality (no client-side compression), so this only needs to cover a genuine
// phone-camera JPEG/HEIC (typically a few MB, occasionally more on newer phones), not protect a tight body-size limit.
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export const isPhotoMime = (t: string) => (PHOTO_MIME_TYPES as readonly string[]).includes(t);

export const photoExt = (mime: string) =>
  mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : mime === "image/heic" ? "heic" : mime === "image/heif" ? "heif" : "jpg";
