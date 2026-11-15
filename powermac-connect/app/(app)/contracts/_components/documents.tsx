"use client";

import { useRef, useState, useTransition } from "react";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { Button, CardBody, EmptyState, Input, Label, Notice, Select, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { env } from "@/lib/env";
import type { Opt } from "../../crm/_lib/shared";
import { createDocumentUpload, deleteDocument, documentDownloadUrl, recordContractDocument } from "../actions";

export type DocRow = { id: string; name: string; category: string; size: string; uploaded: string; by: string | null; mime: string | null };

const MAX = 50 * 1024 * 1024;

function putFile(url: string, file: File, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    if (env.supabaseAnonKey) xhr.setRequestHeader("apikey", env.supabaseAnonKey);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    xhr.send(file);
  });
}

export function Documents({ contractId, docs, categories, canWrite, canDelete }: { contractId: string; docs: DocRow[]; categories: Opt[]; canWrite: boolean; canDelete: boolean }) {
  return (
    <>
      {canWrite && <UploadForm contractId={contractId} categories={categories} />}
      {docs.length ? (
        <Table>
          <THead>
            <tr>
              <TH>Document</TH>
              <TH>Category</TH>
              <TH align="right">Size</TH>
              <TH>Uploaded</TH>
              <TH align="right">Actions</TH>
            </tr>
          </THead>
          <tbody>
            {docs.map((d) => (
              <DocRowView key={d.id} d={d} canDelete={canDelete} />
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<FileText className="size-8" />} title="No documents yet">
          Keep the signed contract, schedules of rates, specifications and correspondence here.
        </EmptyState>
      )}
    </>
  );
}

function DocRowView({ d, canDelete }: { d: DocRow; canDelete: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <TR>
      <TD className="max-w-sm">
        <div className="flex items-center gap-2">
          <FileText className="size-4 shrink-0 text-subtle" aria-hidden />
          <span className="truncate font-medium">{d.name}</span>
        </div>
        {error && (
          <p role="alert" className="mt-1 text-xs text-[#ff9b98]">
            {error}
          </p>
        )}
      </TD>
      <TD className="text-[13px] text-muted">{d.category}</TD>
      <TD align="right" className="text-[13px] text-muted">
        {d.size}
      </TD>
      <TD className="text-[13px] whitespace-nowrap">
        {d.uploaded}
        {d.by && <div className="text-xs text-subtle">{d.by}</div>}
      </TD>
      <TD align="right">
        <span className="inline-flex items-center gap-1">
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await documentDownloadUrl(d.id);
                if (r.ok && r.url) window.location.assign(r.url);
                else setError(r.message ?? "Download failed.");
              })
            }
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
            Download
          </Button>
          {canDelete && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              aria-label={`Delete ${d.name}`}
              onClick={() => {
                if (!window.confirm(`Delete ${d.name}? This cannot be undone.`)) return;
                start(async () => {
                  setError(null);
                  const r = await deleteDocument(d.id);
                  if (!r.ok) setError(r.message ?? "Delete failed.");
                });
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </span>
      </TD>
    </TR>
  );
}

function UploadForm({ contractId, categories }: { contractId: string; categories: Opt[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    const category = String(new FormData(e.currentTarget).get("category") ?? "");
    setResult(null);
    if (!file) return setResult({ ok: false, text: "Choose a file to upload." });
    if (file.size > MAX) return setResult({ ok: false, text: "Files can be up to 50 MB." });
    if (!file.size) return setResult({ ok: false, text: "That file is empty." });
    if (!category) return setResult({ ok: false, text: "Choose a category." });
    setBusy(true);
    setProgress(0);
    try {
      const ticket = await createDocumentUpload(contractId, { name: file.name, size: file.size, type: file.type });
      if (!ticket.ok || !ticket.signedUrl || !ticket.path) throw new Error(ticket.message ?? "Upload could not be started.");
      await putFile(ticket.signedUrl, file, setProgress);
      const r = await recordContractDocument(contractId, { path: ticket.path, name: name.trim() || file.name, category, size: file.size, mime: file.type || undefined });
      if (!r.ok) throw new Error(r.message ?? "The document could not be saved.");
      setResult({ ok: true, text: r.message ?? "Uploaded." });
      formRef.current?.reset();
      setName("");
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <CardBody className="border-b border-line">
      <form ref={formRef} onSubmit={submit} className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <div className="min-w-0">
          <Label htmlFor={`doc-file-${contractId}`} required>
            File
          </Label>
          <input
            ref={fileRef}
            id={`doc-file-${contractId}`}
            name="file"
            type="file"
            required
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && !name) setName(f.name.replace(/\.[^.]+$/, ""));
            }}
            className="block h-10 w-full rounded-[10px] border border-line-strong bg-sunken text-sm text-muted file:mr-3 file:h-full file:border-0 file:border-r file:border-line-strong file:bg-raised file:px-3 file:text-sm file:text-fg hover:file:bg-[#18211a]"
          />
        </div>
        <div className="min-w-0">
          <Label htmlFor={`doc-name-${contractId}`}>Name</Label>
          <Input id={`doc-name-${contractId}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={255} placeholder="Defaults to the file name" />
        </div>
        <div className="min-w-0">
          <Label htmlFor={`doc-cat-${contractId}`} required>
            Category
          </Label>
          <Select id={`doc-cat-${contractId}`} name="category" required defaultValue={categories.some((c) => c.value === "contract") ? "contract" : ""}>
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
          {busy ? (progress !== null && progress > 0 && progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : "Uploading…") : "Upload"}
        </Button>
      </form>
      <p className="mt-2 text-xs text-subtle">Up to 50 MB. Files are stored privately and shared only through short-lived download links.</p>
      {busy && progress !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Upload progress">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${Math.max(3, progress * 100)}%` }} />
        </div>
      )}
      {result && (
        <div className="mt-3">
          <Notice tone={result.ok ? "ok" : "bad"}>{result.text}</Notice>
        </div>
      )}
    </CardBody>
  );
}
