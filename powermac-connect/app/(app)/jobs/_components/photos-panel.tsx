"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Eye, EyeOff, Loader2, Trash2, Upload } from "lucide-react";
import { Badge, buttonClass, Card, CardHeader, EmptyState, Input, Label, Notice, Select } from "@/components/ui/primitives";
import { createPhotoUpload, deletePhoto, notePhotos, recordPhoto } from "../[id]/actions";
import { PHOTO_STAGES } from "../_lib/constants";

export type PhotoItem = { id: string; url: string | null; stage: string; caption: string | null; visibility: string; taken: string; by: string | null };

const STAGE_TONE: Record<string, "info" | "accent" | "ok" | "bad" | "neutral"> = { before: "info", during: "accent", after: "ok", issue: "bad" };
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

export function PhotosPanel({ jobId, photos, canWrite }: { jobId: string; photos: PhotoItem[]; canWrite: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState("before");
  const [caption, setCaption] = useState("");
  const [share, setShare] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const upload = () => {
    const files = Array.from(fileRef.current?.files ?? []);
    if (!files.length) {
      setErrors(["Choose one or more photos first."]);
      return;
    }
    setErrors([]);
    setDone(null);
    start(async () => {
      const problems: string[] = [];
      let ok = 0;
      for (const [i, file] of files.entries()) {
        setProgress(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
        const slot = await createPhotoUpload(jobId, file.type, file.size);
        if (!slot.ok || !slot.url || !slot.path) {
          problems.push(`${file.name}: ${slot.message ?? "upload refused"}`);
          continue;
        }
        const put = await fetch(slot.url, { method: "PUT", headers: { "content-type": file.type, "x-upsert": "false" }, body: file }).catch(() => null);
        if (!put || !put.ok) {
          problems.push(`${file.name}: the storage service did not accept the file`);
          continue;
        }
        const saved = await recordPhoto({ jobId, path: slot.path, stage, caption: caption || undefined, shareWithClient: share });
        if (!saved.ok) problems.push(`${file.name}: ${saved.message ?? "could not be saved"}`);
        else ok++;
      }
      if (ok) await notePhotos(jobId, ok, stage);
      setProgress(null);
      setErrors(problems);
      if (ok) setDone(`${ok} photo${ok === 1 ? "" : "s"} uploaded.`);
      if (fileRef.current) fileRef.current.value = "";
      setCaption("");
    });
  };

  const remove = (p: PhotoItem) => {
    if (!window.confirm("Delete this photo? This cannot be undone.")) return;
    start(async () => {
      const res = await deletePhoto(p.id);
      if (!res.ok) setErrors([res.message ?? "Could not delete."]);
    });
  };

  return (
    <div className="grid gap-4">
      {canWrite && (
        <Card>
          <CardHeader title="Add photos" description="Stored privately; links to view them expire after an hour." />
          <div className="grid gap-3 px-5 py-4 md:grid-cols-[1.4fr_160px_1fr_auto] md:items-end">
            <div>
              <Label htmlFor="photo-files">Photos</Label>
              <input
                ref={fileRef}
                id="photo-files"
                type="file"
                accept={ACCEPT}
                multiple
                className="block w-full text-sm text-muted file:mr-3 file:h-10 file:rounded-[10px] file:border file:border-line-strong file:bg-raised file:px-3 file:text-sm file:font-medium file:text-fg hover:file:bg-[#1a2643]"
              />
            </div>
            <div>
              <Label htmlFor="photo-stage">Stage</Label>
              <Select id="photo-stage" value={stage} onChange={(e) => setStage(e.target.value)}>
                {PHOTO_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="photo-caption">Caption (optional)</Label>
              <Input id="photo-caption" value={caption} maxLength={500} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Stain on kitchen ceiling" />
            </div>
            <button type="button" className={buttonClass("primary")} onClick={upload} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
              Upload
            </button>
            <label className="flex items-center gap-2 text-sm text-muted md:col-span-4">
              <input type="checkbox" className="size-4 accent-[#2f7dff]" checked={share} onChange={(e) => setShare(e.target.checked)} />
              Client can see these photos
            </label>
          </div>
          {(progress || errors.length > 0 || done) && (
            <div className="grid gap-2 px-5 pb-4">
              {progress && (
                <p className="flex items-center gap-2 text-sm text-accent-hi" role="status">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> {progress}
                </p>
              )}
              {done && <Notice tone="ok">{done}</Notice>}
              {errors.length > 0 && (
                <Notice tone="bad">
                  {errors.map((e) => (
                    <p key={e}>{e}</p>
                  ))}
                </Notice>
              )}
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="Photos" description={`${photos.length} on this job`} />
        {photos.length === 0 ? (
          <EmptyState title="No photos yet" icon={<Camera className="size-7" aria-hidden />}>
            Before, during and after photos are the evidence for completion and invoicing.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4" data-testid="photos">
            {photos.map((p) => (
              <li key={p.id} className="group overflow-hidden rounded-xl border border-line bg-sunken">
                <a href={p.url ?? "#"} target="_blank" rel="noreferrer" className="relative block aspect-[4/3] bg-raised">
                  {p.url ? (
                    // signed, expiring storage URLs: a plain img avoids caching them in the image optimiser
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt={p.caption ?? `${p.stage} photo`} className="size-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-xs text-subtle">Unavailable</span>
                  )}
                  <span className="absolute top-2 left-2">
                    <Badge tone={STAGE_TONE[p.stage] ?? "neutral"} className="bg-canvas/80 backdrop-blur">
                      {p.stage}
                    </Badge>
                  </span>
                </a>
                <div className="flex items-start gap-2 p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-fg">{p.caption || <span className="text-subtle">No caption</span>}</p>
                    <p className="flex items-center gap-1 text-[11px] text-subtle">
                      {p.visibility === "client" ? <Eye className="size-3" aria-label="Client can see" /> : <EyeOff className="size-3" aria-label="Internal only" />}
                      {p.taken}
                      {p.by ? ` · ${p.by}` : ""}
                    </p>
                  </div>
                  {canWrite && (
                    <button type="button" className="rounded-lg p-1.5 text-subtle hover:bg-raised hover:text-[#ff8a87]" aria-label="Delete photo" onClick={() => remove(p)} disabled={pending}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
