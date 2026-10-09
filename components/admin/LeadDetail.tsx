"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Download, Hammer, Phone, Trash2 } from "lucide-react";
import { Badge, Button, Modal, Plate } from "./ui";
import { JobForm } from "./JobForm";
import { fmtSlot } from "@/lib/dates";
import { detailsText, SERVICE_INFO } from "@/lib/services";
import { fmtDate, fmtDateTime, fmtDay, ukDate } from "@/lib/ops/format";
import { jobKind, jobStatus, leadStatus } from "@/lib/ops/labels";
import { vanReg } from "@/lib/ops/selectors";
import { useOps, type LeadView } from "@/lib/ops/store";
import type { Lead } from "@/lib/types";

const STATUSES: Lead["status"][] = ["new", "contacted", "quoted", "won", "lost"];
const scoreTone = { hot: "red", warm: "amber", "not-a-fit": "slate" } as const;

export function LeadDetail({ lead, onClose }: { lead: LeadView; onClose: () => void }) {
  const { db, biz, setLeadStatus, deleteLead } = useOps();
  const [form, setForm] = useState<"inspection" | "job" | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");

  const matLabel = biz.settings.materials.find((m) => m.id === lead.material)?.label;
  const details = detailsText(lead, matLabel);
  const jobs = db.jobs.filter((j) => j.leadId === lead.id);
  const hasVisit = jobs.some((j) => j.kind === "inspection");
  const messages = biz.outbox.filter((m) => m.leadId === lead.id);

  async function status(s: Lead["status"]) {
    setErr("");
    const e = await setLeadStatus(lead.id, s);
    if (e) setErr(e);
  }

  function exportLead() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ lead, messages }, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `enquiry-${lead.name.replace(/\W+/g, "-")}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function remove() {
    if (!confirm(`Delete ${lead.name}'s enquiry, their messages and photos permanently?`)) return;
    const e = await deleteLead(lead.id);
    if (e) setErr(e);
    else onClose();
  }

  return (
    <>
      <Modal open onClose={onClose} title={lead.name} wide>
        <div className="space-y-5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={scoreTone[lead.score]}>{lead.score === "not-a-fit" ? "Out of area" : lead.score}</Badge>
            <Badge tone={leadStatus[lead.status].tone}>{leadStatus[lead.status].label}</Badge>
            {lead.waitlist && <Badge tone="amber">Waiting list</Badge>}
            <span className="text-xs text-steel">Received {fmtDate(ukDate(lead.createdAt))}</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-steel">Contact</div>
              <a href={`tel:${lead.phone}`} className="mt-1 flex min-h-10 items-center gap-2 font-medium underline"><Phone size={14} aria-hidden /> {lead.phone}</a>
              <a href={`mailto:${lead.email}`} className="flex min-h-10 items-center break-all underline">{lead.email}</a>
              <p className="mt-2">{lead.address.replace(/, (UK|United Kingdom)$/, "")}{lead.address.includes(lead.postcode) ? "" : `, ${lead.postcode}`}</p>
              <p className="text-xs text-steel">{lead.placeId ? "Address checked" : "Address typed by the customer: please check"}</p>
              {typeof lead.lat === "number" && typeof lead.lng === "number" && lead.score !== "not-a-fit" && (
                <Link href={`/admin/map?pin=lead-${lead.id}`} className="mt-1 inline-flex min-h-10 items-center text-sm font-medium underline">Show on the project map</Link>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-steel">The job</div>
              <p className="mt-1 font-medium">{SERVICE_INFO[lead.service ?? "roof"].label}{details ? `: ${details}` : ""}</p>
              {lead.basis && <p className="text-steel">{lead.basis}</p>}
              {lead.notes && <p className="mt-1 italic">&ldquo;{lead.notes}&rdquo;</p>}
              <p className="mt-2 text-lg font-bold tabular-nums">{lead.noPrice ? "No price given" : `£${lead.low.toLocaleString("en-GB")} – £${lead.high.toLocaleString("en-GB")}`}</p>
              <p className="text-xs text-steel">{lead.urgency === "urgent" ? "Urgent" : lead.urgency === "3-months" ? "Within 3 months" : "Just pricing"} · {lead.propertyType}, {lead.homeAge}{lead.listed === "yes" ? ", listed" : ""}</p>
            </div>
          </div>

          {lead.inspectionBooked && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 font-semibold text-emerald-900">Inspection booked: {fmtSlot(lead.inspectionBooked)}</p>
          )}

          {lead.photos && lead.photos.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel">Customer photos</div>
              <div className="flex flex-wrap gap-2">
                {lead.photos.map((p) =>
                  p.url && !broken.has(p.path) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed, time-limited storage URL; next/image can't optimise this
                    <a key={p.path} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="Customer photo" onError={() => setBroken((s) => new Set(s).add(p.path))} className="h-24 w-24 rounded-lg border border-ctrl object-cover" /></a>
                  ) : (
                    <div key={p.path} className="grid h-24 w-24 place-items-center rounded-lg border border-ctrl bg-silver-soft text-center text-[0.6875rem] text-steel">Unavailable</div>
                  ),
                )}
              </div>
              {lead.photos.filter((p) => p.assessment).map((p) => (
                <div key={p.path} className="mt-2 rounded-xl bg-silver-soft px-3 py-2">
                  <p><b className="capitalize">{p.assessment!.material}</b> · <span className="text-steel">{p.assessment!.confidence} confidence</span></p>
                  <p className="text-steel">{p.assessment!.condition}</p>
                  {p.hint && <p className="text-steel">Looks {p.hint}.</p>}
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel">Where is it up to?</div>
            <div role="group" aria-label="Enquiry status" className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button key={s} type="button" aria-pressed={lead.status === s} onClick={() => status(s)} className={`min-h-10 rounded-full px-4 py-1.5 text-sm font-medium ${lead.status === s ? "bg-brand text-white" : "bg-surface text-night ring-1 ring-edge hover:bg-silver-soft"}`}>
                  {leadStatus[s].label}
                </button>
              ))}
            </div>
            {err && <p role="alert" className="mt-2 text-brand">{err}</p>}
          </div>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-steel">Schedule</div>
            {jobs.length > 0 && (
              <ul className="mb-3 space-y-1.5">
                {jobs.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-edge px-3 py-2">
                    <Badge tone={jobStatus[j.status].tone}>{jobStatus[j.status].label}</Badge>
                    <span className="font-medium">{jobKind[j.kind]}</span>
                    <span className="text-steel">{fmtDay(j.date)}{j.time ? ` ${j.time}` : ""}</span>
                    {j.vanIds.map((id) => <Plate key={id}>{vanReg(db, id)}</Plate>)}
                    <Link href="/admin/jobs" className="ml-auto text-xs underline">Open schedule</Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {!hasVisit && (
                <Button variant="secondary" onClick={() => setForm("inspection")}><CalendarPlus size={16} /> {lead.inspectionBooked ? "Assign van and crew to the inspection" : "Add an inspection visit"}</Button>
              )}
              {!jobs.some((j) => j.kind === "job") && <Button onClick={() => setForm("job")}><Hammer size={16} /> Schedule the job</Button>}
            </div>
          </div>

          {messages.length > 0 && (
            <details>
              <summary className="min-h-10 cursor-pointer text-xs font-semibold uppercase tracking-wide text-steel">Messages for this customer ({messages.length})</summary>
              <ul className="mt-2 space-y-2">
                {messages.map((m) => (
                  <li key={m.id} className="rounded-xl bg-silver-soft p-3 text-xs">
                    <div className="text-steel">{m.audience === "owner" ? "To you" : m.audience === "supplier" ? "To supplier" : "To customer"} · {m.channel.toUpperCase()} · {m.status === "preview" ? "Preview (not sent)" : m.status}</div>
                    <p className="mt-1 whitespace-pre-line text-night">{m.body}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className="text-xs text-steel">Consent given {fmtDateTime(lead.consentAt ?? lead.createdAt)} (wording {lead.consentVersion ?? "v1"}).</p>

          <div className="flex flex-wrap justify-between gap-2 border-t border-silver pt-4">
            <Button variant="secondary" size="sm" onClick={exportLead}><Download size={14} /> Export data</Button>
            <Button variant="danger" size="sm" onClick={remove}><Trash2 size={14} /> Delete enquiry</Button>
          </div>
        </div>
      </Modal>
      {form && <JobForm key={form} open kind={form} lead={lead} onClose={() => setForm(null)} />}
    </>
  );
}
