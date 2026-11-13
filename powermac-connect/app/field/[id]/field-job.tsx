"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, ChevronDown, KeyRound, MapPin, Navigation, Phone, Play, Square, Pause, Ban, Truck } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { cx } from "@/components/ui/primitives";
import { newRef, useFieldSend } from "../offline";

export type FieldJobData = {
  assignment: { id: string; status: string; start: string; end: string; arrived_at: string | null; started_at: string | null; finished_at: string | null };
  job: { id: string; reference: string; title: string; description: string | null; priority: string; status: string; status_label: string; trade: string; target_completion_at: string | null; estimated_hours: number | null; access_notes: string | null; signoff_name: string | null; signoff_at: string | null; client: string };
  property: { address: string; town: string; postcode: string; lat: number | null; lng: number | null; access_notes: string | null; restrictions: string | null; hazards: string[]; key_safe_info: string | null };
  occupant: { name: string; phone: string | null; access_needs: string | null; preferred_contact: string } | null;
  checklists: { id: string; name: string; items: { label: string; required?: boolean; done?: boolean }[]; completed_at: string | null }[];
  materials: { id: string; description: string; quantity: number; unit: string; status: string }[];
  updates: { at: string; type: string; body: string | null; by: string | null }[];
  photos: { path: string; stage: string; caption: string | null }[];
  timesheets: { date: string; hours: number; type: string; status: string }[];
};

const t = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "");

export function FieldJob({ data, assignmentId, tenantId, isOperative, today, photoUrls }: { data: FieldJobData; assignmentId: string; tenantId: string; isOperative: boolean; today: string; photoUrls: Record<string, string> }) {
  const router = useRouter();
  const send = useFieldSend();
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [status, setStatus] = useState(data.assignment.status);
  const started = Boolean(data.assignment.started_at) || status === "on_site" && Boolean(data.assignment.started_at);
  const a = data.assignment;

  const act = (call: Parameters<typeof send>[0], okText: string, nextStatus?: string) =>
    start(async () => {
      const r = await send(call);
      if (r.ok) {
        if (nextStatus) setStatus(nextStatus);
        setFlash({ ok: true, text: r.queued ? `${okText} - saved on this phone, will send when you have signal.` : okText });
        if (!r.queued) router.refresh();
      } else setFlash({ ok: false, text: r.message ?? "That could not be saved." });
    });

  const navUrl = data.property.lat != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${data.property.lat},${data.property.lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${data.property.address}, ${data.property.postcode}`)}`;

  return (
    <div className="space-y-4">
      <Link href="/field" className="inline-flex items-center gap-1.5 py-1 text-sm text-muted"><ArrowLeft className="size-4" />My jobs</Link>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono text-subtle">{data.job.reference}</span>
          <span className="font-semibold text-accent-hi">{t(a.start)} – {t(a.end)}</span>
        </div>
        <h1 className="mt-1.5 text-xl leading-snug font-semibold">{data.job.title}</h1>
        <div className="mt-1 text-sm text-muted">{data.job.client} · {data.job.status_label}</div>
        {data.job.priority !== "routine" && (
          <span className={cx("mt-2 inline-block rounded-md px-2 py-0.5 text-xs font-semibold capitalize", data.job.priority === "emergency" ? "bg-bad text-white" : data.job.priority === "urgent" ? "bg-warn-lo text-[#ffc56b]" : "bg-raised text-muted")}>{data.job.priority}</span>
        )}
        <a href={navUrl} target="_blank" rel="noopener" className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-sunken p-3 active:bg-raised">
          <MapPin className="size-5 shrink-0 text-accent-hi" aria-hidden />
          <span className="min-w-0 flex-1 text-[15px]">{data.property.address}<span className="block text-sm text-muted">{data.property.town} {data.property.postcode}</span></span>
          <span className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"><Navigation className="size-4" aria-hidden />Go</span>
        </a>
      </section>

      {flash && (
        <div role="status" className={cx("rounded-xl border px-4 py-3 text-sm", flash.ok ? "border-[#18492f] bg-ok-lo text-[#9be8bd]" : "border-[#5a1f1d] bg-bad-lo text-[#ffb3b1]")}>{flash.text}</div>
      )}

      {/* the one big button: what to do next */}
      <section className="space-y-2.5">
        {status === "completed" ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#18492f] bg-ok-lo p-4 font-semibold text-[#9be8bd]"><CheckCircle2 className="size-5" />Finished {t(a.finished_at)}</div>
        ) : status === "no_access" ? (
          <div className="rounded-2xl border border-[#57400f] bg-warn-lo p-4 text-center font-semibold text-[#ffd79a]">Marked as no access</div>
        ) : (
          <>
            {(status === "scheduled" || status === "accepted") && (
              <BigButton onClick={() => act({ fn: "update", assignmentId, action: "travelling", ref: newRef() }, "On your way", "travelling")} disabled={pending} icon={<Truck className="size-6" />}>I&apos;m on my way</BigButton>
            )}
            {(status === "scheduled" || status === "accepted" || status === "travelling") && (
              <BigButton tone="primary" onClick={() => act({ fn: "update", assignmentId, action: "arrived", ref: newRef() }, "Arrival recorded", "on_site")} disabled={pending} icon={<MapPin className="size-6" />}>I&apos;ve arrived</BigButton>
            )}
            {(status === "on_site" && !data.assignment.started_at) || status === "paused" ? (
              <BigButton tone="primary" onClick={() => act({ fn: "update", assignmentId, action: "start", ref: newRef() }, status === "paused" ? "Work resumed" : "Work started", "on_site")} disabled={pending} icon={<Play className="size-6" />}>{status === "paused" ? "Resume work" : "Start work"}</BigButton>
            ) : null}
            {status === "on_site" && data.assignment.started_at && (
              <div className="grid grid-cols-2 gap-2.5">
                <BigButton onClick={() => act({ fn: "update", assignmentId, action: "pause", ref: newRef() }, "Paused", "paused")} disabled={pending} icon={<Pause className="size-6" />}>Pause</BigButton>
                <BigButton tone="ok" onClick={() => { if (confirm("Finish this job and submit it?")) act({ fn: "update", assignmentId, action: "finish", ref: newRef() }, "Job finished and submitted", "completed"); }} disabled={pending} icon={<Square className="size-6" />}>Finish</BigButton>
              </div>
            )}
            {!started && status !== "on_site" && (
              <button onClick={() => { const n = prompt("What happened? (e.g. no answer, refused entry)"); if (n !== null) act({ fn: "update", assignmentId, action: "no_access", note: n || undefined, ref: newRef() }, "No access reported to the office", "no_access"); }} className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm text-muted active:bg-raised" disabled={pending}>
                <Ban className="size-4" />No access
              </button>
            )}
          </>
        )}
      </section>

      {(data.property.hazards.length > 0 || data.property.restrictions) && (
        <section className="rounded-2xl border border-[#57400f] bg-warn-lo/60 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[#ffd79a]"><AlertTriangle className="size-4" />Safety</h2>
          {data.property.hazards.length > 0 && <p className="mt-1 text-[15px] text-fg capitalize">{data.property.hazards.join(", ").replace(/_/g, " ")}</p>}
          {data.property.restrictions && <p className="mt-1 text-sm text-[#ffd79a]">{data.property.restrictions}</p>}
        </section>
      )}

      <Panel title="Access & contact" open>
        {data.occupant ? (
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[15px] font-medium">{data.occupant.name}</div>
              {data.occupant.access_needs && <div className="text-sm text-[#ffd79a]">{data.occupant.access_needs}</div>}
            </div>
            {data.occupant.phone && <a href={`tel:${data.occupant.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white"><Phone className="size-4" />Call</a>}
          </div>
        ) : (
          <p className="mb-2 text-sm text-muted">No occupant contact on this job.</p>
        )}
        {[data.property.access_notes, data.job.access_notes].filter(Boolean).map((n, i) => <p key={i} className="text-sm text-fg">{n}</p>)}
        {data.property.key_safe_info && <p className="mt-2 flex items-center gap-2 text-sm"><KeyRound className="size-4 text-accent-hi" />{data.property.key_safe_info}</p>}
      </Panel>

      <Panel title="Job instructions" open>
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{data.job.description || "No further instructions."}</p>
        {data.job.estimated_hours ? <p className="mt-2 text-sm text-muted">Estimated {data.job.estimated_hours} h</p> : null}
      </Panel>

      {data.checklists.map((c) => <Checklist key={c.id} checklist={c} onSave={(items) => act({ fn: "checklist", assignmentId, checklistId: c.id, items, ref: newRef() }, "Checklist saved")} pending={pending} />)}

      <Photos jobId={data.job.id} tenantId={tenantId} assignmentId={assignmentId} existing={data.photos} urls={photoUrls} onAdded={(path, stage, caption) => act({ fn: "photo", assignmentId, path, stage, caption, ref: newRef() }, "Photo added")} />

      <Panel title={`Materials used (${data.materials.length})`}>
        <ul className="mb-3 space-y-1 text-sm">
          {data.materials.map((m) => <li key={m.id} className="flex justify-between"><span>{m.description}</span><span className="text-muted tabular">{m.quantity} {m.unit}</span></li>)}
        </ul>
        <form
          className="grid grid-cols-[1fr_80px] gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const description = String(f.get("description") ?? "").trim();
            const quantity = Number(f.get("quantity"));
            if (!description || !(quantity > 0)) return setFlash({ ok: false, text: "Enter the material and a quantity." });
            act({ fn: "material", assignmentId, description, quantity, unit: "each", ref: newRef() }, "Material recorded");
            e.currentTarget.reset();
          }}
        >
          <input name="description" placeholder="e.g. 15mm copper pipe" className={field} aria-label="Material" />
          <input name="quantity" type="number" inputMode="decimal" min="0.01" step="0.01" placeholder="Qty" className={field} aria-label="Quantity" />
          <button className="col-span-2 rounded-xl border border-line-strong bg-raised py-3 text-sm font-medium" disabled={pending}>Add material</button>
        </form>
      </Panel>

      <Panel title="Note, issue or approval">
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const note = String(f.get("note") ?? "").trim();
            const kind = String(f.get("kind"));
            if (!note) return setFlash({ ok: false, text: "Write a note first." });
            act({ fn: "update", assignmentId, action: kind, note, ref: newRef() }, kind === "issue" ? "Issue reported to the office" : kind === "approval_request" ? "Approval requested from the office" : "Note added");
            e.currentTarget.reset();
          }}
        >
          <select name="kind" className={field} aria-label="Type">
            <option value="note">Note</option>
            <option value="issue">Report an unexpected issue</option>
            <option value="approval_request">Request approval for extra work</option>
          </select>
          <textarea name="note" rows={3} className={cx(field, "h-auto py-2")} placeholder="What do you need to tell the office?" aria-label="Note" />
          <button className="w-full rounded-xl border border-line-strong bg-raised py-3 text-sm font-medium" disabled={pending}>Send</button>
        </form>
      </Panel>

      {isOperative && (
        <Panel title="Timesheet">
          <ul className="mb-3 space-y-1 text-sm">
            {data.timesheets.map((ts, i) => <li key={i} className="flex justify-between"><span>{ts.date} · {ts.type}</span><span className="text-muted">{ts.hours} h · {ts.status}</span></li>)}
          </ul>
          <form
            className="grid grid-cols-2 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const hours = Number(f.get("hours"));
              if (!(hours > 0 && hours <= 16)) return setFlash({ ok: false, text: "Enter hours between 0 and 16." });
              act({ fn: "timesheet", assignmentId, date: String(f.get("date")), hours, type: String(f.get("type")), ref: newRef() }, "Timesheet submitted for approval");
              e.currentTarget.reset();
            }}
          >
            <input name="date" type="date" defaultValue={today} max={today} className={field} aria-label="Date" />
            <input name="hours" type="number" inputMode="decimal" step="0.25" min="0.25" max="16" placeholder="Hours" className={field} aria-label="Hours" />
            <select name="type" className={cx(field, "col-span-2")} aria-label="Type"><option value="labour">Labour</option><option value="travel">Travel</option><option value="overtime">Overtime</option></select>
            <button className="col-span-2 rounded-xl border border-line-strong bg-raised py-3 text-sm font-medium" disabled={pending}>Submit hours</button>
          </form>
        </Panel>
      )}

      <SignOff data={data} tenantId={tenantId} pending={pending} onSign={(name, rating, path) => act({ fn: "signoff", assignmentId, name, rating, signaturePath: path, ref: newRef() }, "Customer sign-off recorded")} />

      <Panel title="Job history">
        <ul className="space-y-3">
          {data.updates.map((u, i) => (
            <li key={i} className="text-sm">
              <div className="text-xs text-subtle">{new Date(u.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} · {u.by ?? "System"}</div>
              <div>{u.body ?? u.type.replace(/_/g, " ")}</div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

const field = "h-12 w-full rounded-xl border border-line-strong bg-sunken px-3 text-[15px] text-fg placeholder:text-subtle focus:border-accent focus:outline-none";

function BigButton({ children, onClick, disabled, icon, tone = "secondary" }: { children: ReactNode; onClick: () => void; disabled?: boolean; icon: ReactNode; tone?: "primary" | "secondary" | "ok" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex h-16 w-full items-center justify-center gap-3 rounded-2xl text-lg font-semibold transition-transform active:scale-[0.98] disabled:opacity-60",
        tone === "primary" && "bg-accent text-white shadow-[0_8px_24px_-8px_rgb(47_125_255/0.8)]",
        tone === "ok" && "bg-ok text-[#04150c]",
        tone === "secondary" && "border border-line-strong bg-raised text-fg",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function Panel({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-[15px] font-semibold">
        {title}
        <ChevronDown className="size-5 text-subtle transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line px-4 py-4">{children}</div>
    </details>
  );
}

function Checklist({ checklist, onSave, pending }: { checklist: FieldJobData["checklists"][number]; onSave: (items: FieldJobData["checklists"][number]["items"]) => void; pending: boolean }) {
  const [items, setItems] = useState(checklist.items);
  const done = items.filter((i) => i.done).length;
  return (
    <Panel title={`${checklist.name} (${done}/${items.length})`} open={!checklist.completed_at}>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2 active:bg-raised">
              <input type="checkbox" checked={Boolean(it.done)} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} className="size-6 accent-[#2f7dff]" />
              <span className="text-[15px]">{it.label}{it.required && <span className="ml-1 text-accent-hi">*</span>}</span>
            </label>
          </li>
        ))}
      </ul>
      <button onClick={() => onSave(items)} disabled={pending} className="mt-3 w-full rounded-xl bg-accent py-3 text-sm font-semibold text-white">Save checklist</button>
    </Panel>
  );
}

function Photos({ jobId, tenantId, existing, urls, onAdded }: { jobId: string; tenantId: string; assignmentId: string; existing: FieldJobData["photos"]; urls: Record<string, string>; onAdded: (path: string, stage: string, caption?: string) => void }) {
  const [stage, setStage] = useState("before");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const upload = async (file: File) => {
    setErr(null);
    if (!navigator.onLine) return setErr("Photos need signal to upload. Take the photo now and add it when you are back online.");
    if (file.size > 25 * 1024 * 1024) return setErr("That photo is over 25 MB.");
    setBusy(true);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${tenantId}/jobs/${jobId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await createBrowserSupabase().storage.from("photos").upload(path, file, { contentType: file.type || "image/jpeg" });
    setBusy(false);
    if (error) return setErr("Upload failed. Please try again.");
    onAdded(path, stage);
  };
  return (
    <Panel title={`Photos (${existing.length})`}>
      {existing.length > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {existing.map((p) => (
            <figure key={p.path} className="overflow-hidden rounded-lg border border-line bg-sunken">
              {urls[p.path] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[p.path]} alt={`${p.stage} photo`} className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center text-xs text-subtle">{p.stage}</div>
              )}
              <figcaption className="px-1.5 py-1 text-[11px] text-muted capitalize">{p.stage}</figcaption>
            </figure>
          ))}
        </div>
      )}
      <div className="grid grid-cols-4 gap-1.5">
        {["before", "during", "after", "issue"].map((s) => (
          <button key={s} onClick={() => setStage(s)} className={cx("rounded-lg py-2.5 text-sm capitalize", stage === s ? "bg-accent text-white" : "bg-raised text-muted")} aria-pressed={stage === s}>{s}</button>
        ))}
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      <button onClick={() => input.current?.click()} disabled={busy} className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-raised font-semibold"><Camera className="size-5" />{busy ? "Uploading…" : `Take ${stage} photo`}</button>
      {err && <p className="mt-2 text-sm text-[#ffb3b1]">{err}</p>}
    </Panel>
  );
}

function SignOff({ data, tenantId, onSign, pending }: { data: FieldJobData; tenantId: string; onSign: (name: string, rating: number | undefined, path?: string) => void; pending: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [drawn, setDrawn] = useState(false);
  const [rating, setRating] = useState<number | undefined>();
  const [err, setErr] = useState<string | null>(null);
  if (data.job.signoff_at) {
    return <Panel title="Customer sign-off"><p className="flex items-center gap-2 text-sm text-[#9be8bd]"><CheckCircle2 className="size-4" />Signed by {data.job.signoff_name}</p></Panel>;
  }
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * e.currentTarget.width, ((e.clientY - r.top) / r.height) * e.currentTarget.height] as const;
  };
  const submit = async (name: string) => {
    setErr(null);
    if (name.trim().length < 2) return setErr("Enter the name of the person signing.");
    let path: string | undefined;
    if (drawn && canvas.current && navigator.onLine) {
      const blob = await new Promise<Blob | null>((res) => canvas.current!.toBlob(res, "image/png"));
      if (blob) {
        path = `${tenantId}/jobs/${data.job.id}/signature-${crypto.randomUUID()}.png`;
        const { error } = await createBrowserSupabase().storage.from("photos").upload(path, blob, { contentType: "image/png" });
        if (error) path = undefined;
      }
    }
    onSign(name.trim(), rating, path);
  };
  return (
    <Panel title="Customer sign-off">
      <form onSubmit={(e) => { e.preventDefault(); submit(String(new FormData(e.currentTarget).get("name") ?? "")); }} className="space-y-3">
        <input name="name" placeholder="Name of person signing" className={field} aria-label="Name" />
        <div>
          <div className="mb-1 text-xs text-muted">Signature</div>
          <canvas
            ref={canvas}
            width={600}
            height={200}
            className="h-32 w-full touch-none rounded-xl border border-line-strong bg-white"
            aria-label="Signature pad"
            onPointerDown={(e) => { drawing.current = true; const c = e.currentTarget.getContext("2d")!; const [x, y] = pos(e); c.lineWidth = 3; c.lineCap = "round"; c.strokeStyle = "#0a101e"; c.beginPath(); c.moveTo(x, y); }}
            onPointerMove={(e) => { if (!drawing.current) return; const c = e.currentTarget.getContext("2d")!; const [x, y] = pos(e); c.lineTo(x, y); c.stroke(); setDrawn(true); }}
            onPointerUp={() => { drawing.current = false; }}
          />
          <button type="button" className="mt-1 text-xs text-muted underline" onClick={() => { const c = canvas.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setDrawn(false); }}>Clear</button>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted">How happy is the customer?</div>
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button type="button" key={n} onClick={() => setRating(n)} aria-pressed={rating === n} className={cx("rounded-lg py-3 text-base font-semibold", rating === n ? "bg-accent text-white" : "bg-raised text-muted")}>{n}</button>
            ))}
          </div>
        </div>
        {err && <p className="text-sm text-[#ffb3b1]">{err}</p>}
        <button className="h-14 w-full rounded-xl bg-accent text-base font-semibold text-white" disabled={pending}>Record sign-off</button>
      </form>
    </Panel>
  );
}
