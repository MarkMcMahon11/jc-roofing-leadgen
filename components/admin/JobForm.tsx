"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, MapPin } from "lucide-react";
import { Button, Field, FormError, Input, Modal, Plate, Select, Textarea } from "./ui";
import { useNextStep } from "./Guide";
import { SERVICE_INFO } from "@/lib/services";
import { UK_POSTCODE, formatPostcode } from "@/lib/format";
import { addJob, deleteJob, syncVanStatuses, updateJob } from "@/lib/ops/actions";
import { pence, today } from "@/lib/ops/format";
import { vehicleStatus } from "@/lib/ops/labels";
import { jobIssues } from "@/lib/ops/selectors";
import { useOps, type LeadView } from "@/lib/ops/store";
import type { Job, JobKind, JobStatus } from "@/lib/ops/types";

/** Add or edit an inspection or roofing job: who goes, in which van, with live warnings about clashes and out-of-date paperwork. */
export function JobForm({ open, onClose, job, lead, kind: kindIn, prefill }: { open: boolean; onClose: () => void; job?: Job; lead?: LeadView; kind?: JobKind; prefill?: { date?: string; vanId?: string } }) {
  const { db, mutate, setLeadStatus } = useOps();
  const nextStep = useNextStep();
  const editing = !!job;
  const [kind, setKind] = useState<JobKind>(job?.kind ?? kindIn ?? "job");
  const [title, setTitle] = useState(job?.title ?? (lead ? (kindIn === "inspection" ? "Free roof inspection" : SERVICE_INFO[lead.service ?? "roof"].label) : ""));
  const [customer, setCustomer] = useState(job?.customer ?? lead?.name ?? "");
  const [address, setAddress] = useState(job?.address ?? lead?.address.replace(/, (UK|United Kingdom)$/, "") ?? "");
  const [postcode, setPostcode] = useState(job?.postcode ?? lead?.postcode ?? "");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | undefined>(job && job.lat !== undefined && job.lng !== undefined ? { lat: job.lat, lng: job.lng } : lead && typeof lead.lat === "number" && typeof lead.lng === "number" ? { lat: lead.lat, lng: lead.lng } : undefined);
  const [date, setDate] = useState(job?.date ?? (kindIn === "inspection" && lead?.inspectionBooked ? lead.inspectionBooked.slice(0, 10) : prefill?.date ?? today()));
  const [endDate, setEndDate] = useState(job?.endDate ?? "");
  const [time, setTime] = useState(job?.time ?? (lead?.inspectionBooked ? lead.inspectionBooked.slice(11, 16) : "10:00"));
  const [status, setStatus] = useState<JobStatus>(job?.status ?? "scheduled");
  const [vanIds, setVanIds] = useState<string[]>(job?.vanIds ?? (prefill?.vanId ? [prefill.vanId] : []));
  const [crewIds, setCrewIds] = useState<string[]>(job?.crewIds ?? []);
  const [value, setValue] = useState(job?.value !== undefined ? String(job.value) : lead && kindIn !== "inspection" && !lead.noPrice ? String(Math.round((lead.low + lead.high) / 2)) : "");
  const [notes, setNotes] = useState(job?.notes ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (list: string[], id: string, set: (v: string[]) => void) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const candidate: Job = useMemo(
    () => ({ id: job?.id ?? "new", kind, title, address, date, endDate: kind === "job" && endDate ? endDate : undefined, time: kind === "inspection" ? time : undefined, status, vanIds, crewIds }),
    [job?.id, kind, title, address, date, endDate, time, status, vanIds, crewIds],
  );
  const issues = useMemo(() => (date ? jobIssues(db, candidate) : []), [db, candidate, date]);

  async function lookup(): Promise<{ lat: number; lng: number } | undefined> {
    if (!UK_POSTCODE.test(postcode.trim())) return undefined;
    try {
      const r = await fetch(`/api/admin/geocode?postcode=${encodeURIComponent(postcode.trim())}`);
      if (!r.ok) return undefined;
      const g = (await r.json()) as { lat: number; lng: number };
      setGeo({ lat: g.lat, lng: g.lng });
      return g;
    } catch {
      return undefined;
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Give the job a short title.");
    if (!address.trim()) return setError("Add the address.");
    if (!date) return setError("Choose the date.");
    if (kind === "job" && endDate && endDate < date) return setError("The last day can't be before the first day.");
    if (postcode.trim() && !UK_POSTCODE.test(postcode.trim())) return setError("That doesn't look like a UK postcode.");
    const price = value.trim() === "" ? undefined : Number(value);
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) return setError("The price must be a number.");
    setError("");
    setBusy(true);
    const g = geo ?? (await lookup());
    const body = {
      kind,
      title: title.trim(),
      address: address.trim(),
      date,
      status,
      vanIds,
      crewIds,
      ...(customer.trim() ? { customer: customer.trim() } : {}),
      ...(postcode.trim() ? { postcode: formatPostcode(postcode) } : {}),
      ...(g ? { lat: Math.round(g.lat * 1e5) / 1e5, lng: Math.round(g.lng * 1e5) / 1e5 } : {}),
      ...(kind === "job" && endDate && endDate !== date ? { endDate } : {}),
      ...(kind === "inspection" && time ? { time } : {}),
      ...(kind === "job" && price !== undefined ? { value: pence(price) } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(lead ? { leadId: lead.id } : job?.leadId ? { leadId: job.leadId } : {}),
    };
    if (job) {
      mutate((d) => {
        const i = d.jobs.findIndex((x) => x.id === job.id);
        if (i >= 0) d.jobs[i] = { id: job.id, ...body }; // replace, so a cleared field really goes
        updateJob(d, job.id, {});
        syncVanStatuses(d, [...job.vanIds, ...vanIds]);
      });
    } else {
      mutate((d) => addJob(d, body));
      if (lead && kind === "job" && lead.status !== "won") await setLeadStatus(lead.id, "won");
      nextStep({ title: kind === "job" ? "Job scheduled" : "Inspection scheduled", body: "It's on the schedule and the project map. Start it from the Jobs page when the crew arrives.", href: "/admin/jobs", action: "Open schedule" });
    }
    setBusy(false);
    onClose();
  }

  const crewList = db.crew.filter((c) => c.status === "active" && c.role !== "Office");

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit " + (kind === "job" ? "job" : "inspection") : kind === "job" ? "Schedule a roofing job" : "Schedule an inspection"} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {!editing && !kindIn && (
          <Field label="What is it?" className="sm:col-span-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value as JobKind)}>
              <option value="job">Roofing job</option>
              <option value="inspection">Free inspection visit</option>
            </Select>
          </Field>
        )}
        <Field label="Title" className="sm:col-span-2"><Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder={kind === "job" ? "Re-roof, natural slate" : "Free roof inspection"} /></Field>
        <Field label="Customer"><Input value={customer} onChange={(e) => setCustomer(e.target.value)} maxLength={80} /></Field>
        <Field label="Postcode" hint="Used to put the project on the map.">
          <div className="flex gap-2">
            <Input value={postcode} onChange={(e) => { setPostcode(e.target.value); setGeo(undefined); }} maxLength={10} placeholder="DG1 3QX" className="uppercase" />
            <Button variant="secondary" onClick={lookup} className="mt-1 shrink-0" aria-label="Find on map"><MapPin size={16} /></Button>
          </div>
          {geo && <span className="mt-1 block text-xs text-emerald-700">Found on the map ✓</span>}
        </Field>
        <Field label="Address (required)" className="sm:col-span-2"><Input value={address} onChange={(e) => setAddress(e.target.value)} required maxLength={200} /></Field>
        <Field label={kind === "job" ? "First day" : "Date"}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
        {kind === "job" ? (
          <Field label="Last day (if more than one day)"><Input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} /></Field>
        ) : (
          <Field label="Time"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        )}

        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium text-night">Van{kind === "job" ? "s" : ""}</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {db.vehicles.filter((v) => v.status !== "off_road").map((v) => (
              <label key={v.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] px-3 py-2 text-sm ${vanIds.includes(v.id) ? "border-brand bg-brand-tint" : "border-ctrl bg-surface"}`}>
                <input type="checkbox" checked={vanIds.includes(v.id)} onChange={() => toggle(vanIds, v.id, setVanIds)} className="h-4 w-4 accent-[#b11017]" />
                <span className="min-w-0 flex-1"><Plate>{v.reg}</Plate> <span className="text-steel">{v.make} {v.model}</span></span>
                {v.status !== "in_use" && v.status !== "at_yard" && <span className="text-xs text-brand">{vehicleStatus[v.status].label}</span>}
              </label>
            ))}
            {db.vehicles.length === 0 && <p className="text-sm text-steel">Add your vans first under Vans.</p>}
          </div>
        </fieldset>
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium text-night">Crew</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {crewList.map((c) => (
              <label key={c.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] px-3 py-2 text-sm ${crewIds.includes(c.id) ? "border-brand bg-brand-tint" : "border-ctrl bg-surface"}`}>
                <input type="checkbox" checked={crewIds.includes(c.id)} onChange={() => toggle(crewIds, c.id, setCrewIds)} className="h-4 w-4 accent-[#b11017]" />
                <span className="flex-1">{c.name}</span>
                <span className="text-xs text-steel">{c.role}</span>
              </label>
            ))}
            {crewList.length === 0 && <p className="text-sm text-steel">Add your team first under Team.</p>}
          </div>
        </fieldset>

        {issues.length > 0 && (
          <div role="alert" className="rounded-xl border border-brand bg-brand-tint p-3 text-sm text-brand sm:col-span-2">
            <div className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle size={16} aria-hidden /> Check before you save</div>
            <ul className="list-disc space-y-0.5 pl-5">{issues.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="mt-1 text-xs">You can still save: these are warnings, not blocks.</p>
          </div>
        )}

        {kind === "job" && <Field label="Agreed price (£)"><Input type="number" min={0} step="any" value={value} onChange={(e) => setValue(e.target.value)} /></Field>}
        {editing && (
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as JobStatus)}>
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>
        )}
        <Field label="Notes" className="sm:col-span-2"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Access, scaffold, materials ordered…" /></Field>

        <FormError>{error}</FormError>
        <div className="flex flex-wrap justify-between gap-2 sm:col-span-2">
          {editing ? (
            <Button variant="danger" onClick={() => { if (job && confirm("Delete this from the schedule?")) { mutate((d) => deleteJob(d, job.id)); onClose(); } }}>Delete</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add to schedule"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
