"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Trash2, Upload } from "lucide-react";
import { ActionForm, ConfirmButton } from "@/components/ui/form";
import { buttonClass, cx, Input, Label, Select } from "@/components/ui/primitives";
import { deleteDocument, deletePhoto, documentDownloadUrl } from "../_lib/document-actions";

type Opt = { value: string; label: string };

/** Uploads a document (or photo) to the record's upload endpoint, then refreshes the page. */
export function UploadForm({ endpoint, kind = "document", categories = [], maxMb = 9 }: { endpoint: string; kind?: "document" | "photo"; categories?: Opt[]; maxMb?: number }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return setResult({ ok: false, message: "Choose a file to upload." });
    if (file.size > maxMb * 1024 * 1024) return setResult({ ok: false, message: `That file is larger than ${maxMb} MB.` });
    fd.set("kind", kind);
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const body = (await res.json().catch(() => null)) as { ok: boolean; message: string } | null;
      setResult(body ?? { ok: false, message: "The upload failed. Please try again." });
      if (body?.ok) {
        form.current?.reset();
        startTransition(() => router.refresh());
      }
    } catch {
      setResult({ ok: false, message: "The upload failed. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const id = `${kind}-upload`;
  return (
    <form ref={form} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={kind === "photo" ? "Upload photo" : "Upload document"}>
      {result && (
        <div role={result.ok ? "status" : "alert"} className={cx("rounded-xl border px-4 py-2.5 text-sm sm:col-span-2 lg:col-span-4", result.ok ? "border-[#18492f] bg-ok-lo/70 text-[#9be8bd]" : "border-[#5a1f1d] bg-bad-lo/70 text-[#ffb3b1]")}>
          {result.message}
        </div>
      )}
      <div className="sm:col-span-2">
        <Label htmlFor={`${id}-file`} required>{kind === "photo" ? "Photo" : "File"}</Label>
        <input
          id={`${id}-file`}
          name="file"
          type="file"
          required
          accept={kind === "photo" ? "image/jpeg,image/png,image/webp,image/heic,image/heif" : undefined}
          className="block w-full rounded-[10px] border border-line-strong bg-sunken text-sm text-muted file:mr-3 file:h-10 file:border-0 file:border-r file:border-line-strong file:bg-raised file:px-3 file:text-sm file:text-fg hover:file:bg-[#1a2643]"
        />
        <p className="mt-1.5 text-xs text-subtle">Up to {maxMb} MB.</p>
      </div>
      {kind === "document" ? (
        <>
          <div>
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input id={`${id}-name`} name="name" placeholder="Defaults to the file name" maxLength={255} />
          </div>
          <div>
            <Label htmlFor={`${id}-cat`}>Category</Label>
            <Select id={`${id}-cat`} name="category" defaultValue={categories.some((c) => c.value === "other") ? "other" : categories[0]?.value}>
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-vis`}>Visible to</Label>
            <Select id={`${id}-vis`} name="visibility" defaultValue="internal">
              <option value="internal">Staff only</option>
              <option value="client">Staff and client</option>
              <option value="occupant">Staff, client and occupant</option>
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-exp`}>Expires on</Label>
            <Input id={`${id}-exp`} name="expires_on" type="date" />
          </div>
        </>
      ) : (
        <>
          <div>
            <Label htmlFor={`${id}-stage`}>Stage</Label>
            <Select id={`${id}-stage`} name="stage" defaultValue="during">
              {["before", "during", "after", "issue", "inspection"].map((s) => <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor={`${id}-cap`}>Caption</Label>
            <Input id={`${id}-cap`} name="caption" maxLength={500} />
          </div>
        </>
      )}
      <div className="flex items-end sm:col-span-2 lg:col-span-4">
        <button type="submit" disabled={busy} className={buttonClass("primary", "md")}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
          {busy ? "Uploading…" : kind === "photo" ? "Upload photo" : "Upload document"}
        </button>
      </div>
    </form>
  );
}

/** Fetches a 60-second signed link and starts the download. */
export function DownloadButton({ documentId, label = "Download" }: { documentId: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={busy}
        className={buttonClass("secondary", "sm")}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await documentDownloadUrl(documentId);
          setBusy(false);
          if (r.ok && r.url) window.location.assign(r.url);
          else setError(r.message ?? "Download failed.");
        }}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
        {label}
      </button>
      {error && <span role="alert" className="mt-1 text-xs text-[#ff9b98]">{error}</span>}
    </span>
  );
}

export function DeleteDocumentButton({ documentId, name }: { documentId: string; name: string }) {
  return (
    <ActionForm action={deleteDocument} className="inline-flex">
      <input type="hidden" name="document_id" value={documentId} />
      <ConfirmButton message={`Remove "${name}"? The file is deleted permanently.`}>
        <Trash2 className="size-3.5" aria-hidden />
        <span className="sr-only sm:not-sr-only">Remove</span>
      </ConfirmButton>
    </ActionForm>
  );
}

export function DeletePhotoButton({ photoId }: { photoId: string }) {
  return (
    <ActionForm action={deletePhoto} className="inline-flex">
      <input type="hidden" name="photo_id" value={photoId} />
      <ConfirmButton message="Remove this photo permanently?">
        <Trash2 className="size-3.5" aria-hidden />
        <span className="sr-only">Remove photo</span>
      </ConfirmButton>
    </ActionForm>
  );
}
