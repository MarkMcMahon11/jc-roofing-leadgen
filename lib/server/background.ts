import { getBackgroundDoc, mutateBackgroundDoc } from "@/lib/store";

// The owner's dashboard background: the built-in roofing scene, or one picture he uploads.
export type Background = { rev: number; mode: "default" | "custom"; strength: number; image?: string };
export type BackgroundMeta = { mode: "default" | "custom"; strength: number; src: string };

export const DEFAULT_STRENGTH = 68;
export const DEFAULT_SRC = "/admin/bg-slate.svg";
export const MAX_IMAGE_CHARS = 1_200_000; // data-URL length; the browser shrinks pictures well below this

const empty = (): Background => ({ rev: 0, mode: "default", strength: DEFAULT_STRENGTH });
const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

export const loadBackground = () => getBackgroundDoc<Background>(empty());

export async function metaOf(): Promise<BackgroundMeta> {
  const b = await loadBackground();
  const custom = b.mode === "custom" && !!b.image;
  return { mode: custom ? "custom" : "default", strength: clamp(b.strength), src: custom ? `/api/admin/background/image?v=${b.rev}` : DEFAULT_SRC };
}

export const clamp = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(100, Math.max(15, Math.round(n))) : DEFAULT_STRENGTH);

export type Change = { mode?: unknown; strength?: unknown; image?: unknown };

export async function saveBackground(c: Change): Promise<{ ok: true } | { ok: false; error: string }> {
  if (c.image !== undefined && (typeof c.image !== "string" || c.image.length > MAX_IMAGE_CHARS || !IMG.test(c.image))) return { ok: false, error: "That picture isn't usable. Use a JPG, PNG or WebP." };
  if (c.mode !== undefined && c.mode !== "default" && c.mode !== "custom") return { ok: false, error: "Unknown background." };
  const mode = c.mode;
  return mutateBackgroundDoc(empty, (d) => {
    if (typeof c.image === "string") d.image = c.image;
    if (mode) d.mode = mode;
    if (c.strength !== undefined) d.strength = clamp(c.strength);
    if (d.mode === "custom" && !d.image) d.mode = "default";
    d.rev += 1;
    return { ok: true as const };
  });
}
