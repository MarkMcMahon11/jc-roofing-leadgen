"use client";

import { ImageIcon, RotateCcw, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Modal, Segmented } from "./ui";
import type { Theme } from "@/lib/theme";
import type { BackgroundMeta } from "@/lib/server/background";

// the light "veil" that keeps text readable: the stronger the picture, the thinner the veil
const veil = (strength: number) => ((100 - strength) / 100) * 0.92;

/** The picture behind the dashboard (fixed, under everything, never printed). */
export function BackgroundLayer({ bg }: { bg: BackgroundMeta }) {
  return (
    <div aria-hidden className="admin-photo print:hidden" style={{ backgroundImage: `url("${bg.src}")`, ["--veil" as string]: veil(bg.strength) }} />
  );
}

/** Shrinks any picture to a sensible size in the browser so it loads fast on a phone. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  const g = c.getContext("2d");
  if (!g) throw new Error("no canvas");
  g.drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.84, 0.72, 0.6, 0.48]) {
    const url = c.toDataURL("image/jpeg", q);
    if (url.length < 1_000_000) return url;
  }
  throw new Error("too big");
}

export function BackgroundButton({ bg, onChange, theme, onTheme }: { bg: BackgroundMeta; onChange: (b: BackgroundMeta) => void; theme: Theme; onTheme: (t: Theme) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const strength = bg.strength;
  const file = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function save(change: Record<string, unknown>) {
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/background", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Couldn't save that. Try again.");
      onChange(j as BackgroundMeta);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    if (!/^image\//.test(f.type)) return setErr("Choose a picture (JPG, PNG or WebP).");
    setBusy(true);
    setErr("");
    try {
      const image = await shrink(f);
      await save({ mode: "custom", image });
    } catch {
      setErr("We couldn't read that picture. Try a different one.");
      setBusy(false);
    }
    if (file.current) file.current.value = "";
  }

  function slide(n: number) {
    onChange({ ...bg, strength: n }); // instant preview
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save({ strength: n }), 500);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Change the background picture" className="btn-silver inline-flex h-10 items-center gap-1.5 rounded-lg border-[1.5px] border-ctrl px-2.5 text-sm font-semibold text-night">
        <ImageIcon size={16} aria-hidden />
        <span className="hidden sm:inline">Background</span>
        <span className="sr-only sm:hidden">Change background</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Appearance">
        <div className="space-y-5">
          <div>
            <div className="mb-1.5 text-sm font-semibold text-night">Light or dark</div>
            <Segmented<Theme> value={theme} onChange={onTheme} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "auto", label: "Match my device" }]} />
          </div>
          <div className="text-sm font-semibold text-night">Background picture</div>
          <div className="relative isolate h-36 overflow-hidden rounded-xl border border-edge bg-silver-soft">
            <div className="admin-photo absolute!" style={{ backgroundImage: `url("${bg.src}")`, ["--veil" as string]: veil(strength) }} />
            <span className="elev absolute bottom-2 left-2 rounded-md px-2 py-0.5 text-xs font-semibold text-night">{bg.mode === "custom" ? "Your picture" : "JC Roofing scene"}</span>
          </div>

          <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="bg-file" onChange={(e) => void pick(e.target.files?.[0])} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => file.current?.click()} disabled={busy}>
              <Upload size={16} aria-hidden /> {busy ? "Saving…" : "Choose a picture"}
            </Button>
            {bg.mode === "custom" && (
              <Button variant="secondary" onClick={() => void save({ mode: "default" })} disabled={busy}>
                <RotateCcw size={16} aria-hidden /> Back to the roofing scene
              </Button>
            )}
          </div>

          <div>
            <label htmlFor="bg-strength" className="mb-1 flex justify-between text-sm font-semibold text-night">
              <span>Picture strength</span>
              <span className="text-steel">{strength}%</span>
            </label>
            <input id="bg-strength" type="range" min={15} max={100} step={1} value={strength} onChange={(e) => slide(Number(e.target.value))} className="h-6 w-full accent-brand" />
            <p className="mt-1 text-xs text-steel">Lower keeps the text easy to read. Higher shows more of the picture. Any size or shape of picture works; we shrink it for you.</p>
          </div>
          {err && <p role="alert" className="rounded-lg border border-brand bg-brand-tint p-2.5 text-sm text-brand">{err}</p>}
        </div>
      </Modal>
    </>
  );
}
