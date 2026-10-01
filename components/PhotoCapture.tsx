"use client";
import { useRef, useState } from "react";
import { isPhotoMime, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_LEAD } from "@/lib/photos-shared";

type Assessment = { material: string; condition: string; affectedPercent: number | null; confidence: "low" | "medium" | "high"; caveat: string } | null;
type Item = { id: string; previewUrl: string; status: "uploading" | "analysing" | "done" | "error"; error?: string; assessment?: Assessment; hint?: string | null };

const CONF_LABEL: Record<string, string> = { low: "Low confidence", medium: "Medium confidence", high: "Good confidence" };

/**
 * Lets a customer add up to a few photos to their enquiry, at full quality (no compression - the owner and any AI
 * read of them are only as good as the photo). Uploads go straight from this browser to storage, not through our
 * own server, so a large phone photo is never held back by a server request-size limit.
 */
export default function PhotoCapture({ leadId }: { leadId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const count = items.filter((i) => i.status !== "error").length;

  async function upload(file: File) {
    const id = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file); // local only; never uploaded anywhere but this browser
    setItems((p) => [...p, { id, previewUrl, status: "uploading" }]);
    try {
      const signRes = await fetch("/api/photos/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, contentType: file.type }),
      });
      const signed = await signRes.json().catch(() => ({}));
      if (!signRes.ok) throw new Error(signed.error ?? "Could not start that upload.");

      const put = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type, "x-upsert": "false" }, body: file });
      if (!put.ok) throw new Error("The upload didn't go through. Please try again.");

      setItems((p) => p.map((i) => (i.id === id ? { ...i, status: "analysing" } : i)));
      const doneRes = await fetch("/api/photos/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, path: signed.path }),
      });
      const done = await doneRes.json().catch(() => ({}));
      if (!doneRes.ok) throw new Error(done.error ?? "Could not finish that upload.");
      setItems((p) => p.map((i) => (i.id === id ? { ...i, status: "done", assessment: done.assessment ?? null, hint: done.hint ?? null } : i)));
    } catch (e) {
      setItems((p) => p.map((i) => (i.id === id ? { ...i, status: "error", error: (e as Error).message } : i)));
    }
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    setNote("");
    const room = MAX_PHOTOS_PER_LEAD - count;
    let skippedType = false, skippedSize = false, skippedRoom = false;
    Array.from(files).slice(0, Math.max(room, 0)).forEach((file, i) => {
      if (i >= room) return;
      if (!isPhotoMime(file.type)) { skippedType = true; return; }
      if (file.size > MAX_PHOTO_BYTES) { skippedSize = true; return; }
      upload(file);
    });
    if (files.length > room) skippedRoom = true;
    if (skippedType) setNote("One photo wasn't a JPEG, PNG, WEBP or HEIC, so it wasn't added.");
    else if (skippedSize) setNote(`One photo was over ${Math.round(MAX_PHOTO_BYTES / 1024 / 1024)}MB, so it wasn't added.`);
    else if (skippedRoom) setNote(`You can add up to ${MAX_PHOTOS_PER_LEAD} photos.`);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <div key={i.id} className="relative h-20 w-20 flex-none overflow-hidden rounded-lg border-[1.5px] border-line bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview, next/image can't optimise this */}
            <img src={i.previewUrl} alt="" className="h-full w-full object-cover" />
            {(i.status === "uploading" || i.status === "analysing") && (
              <div role="status" className="absolute inset-0 grid place-items-center bg-white/75">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-sand border-t-brand" />
              </div>
            )}
            {i.status === "error" && (
              <div className="absolute inset-0 grid place-items-center bg-brand-tint p-1 text-center text-[11px] leading-tight text-brand">{i.error ?? "Failed"}</div>
            )}
          </div>
        ))}
        {count < MAX_PHOTOS_PER_LEAD && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-20 w-20 flex-none flex-col items-center justify-center gap-0.5 rounded-lg border-[1.5px] border-dashed border-line text-mute"
          >
            <span aria-hidden className="text-xl leading-none">+</span>
            <span className="text-[0.6875rem]">Add photo</span>
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
      />
      <p aria-live="polite" className="mt-1.5 min-h-4 text-[0.75rem] text-mute">{note}</p>

      {items.filter((i) => i.status === "done" && i.assessment).map((i) => (
        <div key={i.id} className="mt-2 rounded-xl bg-cream px-3 py-2.5 text-[0.8125rem] leading-snug">
          <p><b className="font-semibold capitalize">{i.assessment!.material}</b> · <span className="text-mute">{CONF_LABEL[i.assessment!.confidence]}</span></p>
          <p className="mt-0.5">{i.assessment!.condition}</p>
          {i.hint && <p className="mt-0.5 text-mute">Based on this photo, this looks like it&apos;s {i.hint}.</p>}
          {i.assessment!.caveat && <p className="mt-0.5 text-mute">({i.assessment!.caveat})</p>}
          <p className="mt-1 text-mute">A rough visual read only - confirmed at your free inspection.</p>
        </div>
      ))}
    </div>
  );
}
