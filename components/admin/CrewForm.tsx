"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, FormError, Input, Modal, Select, Textarea } from "./ui";
import { useNextStep } from "./Guide";
import { addCrew, crewHasHistory, deleteCrew, updateCrew } from "@/lib/ops/actions";
import { today } from "@/lib/ops/format";
import { crewRoles } from "@/lib/ops/labels";
import { useOps } from "@/lib/ops/store";
import type { CrewMember, CrewRole, CscsCard } from "@/lib/ops/types";

/** Add or edit a team member. Mount it only while open. */
export function CrewForm({ onClose, member }: { onClose: () => void; member?: CrewMember }) {
  const { db, mutate } = useOps();
  const router = useRouter();
  const nextStep = useNextStep();
  const [drives, setDrives] = useState(member?.drives ?? false);
  const [error, setError] = useState("");
  const m = member;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    if (!s("name")) return setError("Enter their name.");
    const pts = s("licencePoints");
    if (pts !== "" && (!Number.isInteger(Number(pts)) || Number(pts) < 0 || Number(pts) > 36)) return setError("Licence points should be a whole number from 0 to 36.");
    if (drives && !s("licenceExpiry")) return setError("Add when their driving licence next needs checking, or untick “Drives company vans”.");

    const base = {
      name: s("name"),
      phone: s("phone"),
      role: s("role") as CrewRole,
      startDate: s("startDate") || today(),
      drives,
      ...(s("email") ? { email: s("email") } : {}),
      ...(drives && s("licenceExpiry") ? { licenceExpiry: s("licenceExpiry") } : {}),
      ...(drives && pts !== "" ? { licencePoints: Number(pts) } : {}),
      ...(s("cscsCard") ? { cscsCard: s("cscsCard") as CscsCard } : {}),
      ...(s("cscsExpiry") ? { cscsExpiry: s("cscsExpiry") } : {}),
      ...(s("heightExpiry") ? { heightExpiry: s("heightExpiry") } : {}),
      ...(s("firstAidExpiry") ? { firstAidExpiry: s("firstAidExpiry") } : {}),
      ...(s("notes") ? { notes: s("notes") } : {}),
    };
    if (member) {
      const status = f.get("inactive") === "on" ? "inactive" : "active";
      mutate((d) => {
        const i = d.crew.findIndex((x) => x.id === member.id);
        if (i >= 0) d.crew[i] = { id: member.id, status, ...base };
        updateCrew(d, member.id, {}, "details updated");
        if (status === "inactive") for (const v of d.vehicles) if (v.assignedCrewId === member.id) delete v.assignedCrewId;
      });
      onClose();
      return;
    }
    const id = mutate((d) => addCrew(d, base));
    onClose();
    if (id) {
      router.push(`/admin/crew/${id}`);
      nextStep({ title: "Team member added", body: "Their licence, CSCS card and training dates now feed the dashboard warnings. Pick them when you schedule a job.", href: "/admin/jobs", action: "Go to the schedule" });
    }
  }

  return (
    <Modal open onClose={onClose} title={member ? `Edit ${member.name}` : "Add a team member"} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><Input name="name" required defaultValue={m?.name} maxLength={80} autoComplete="off" /></Field>
        <Field label="Role">
          <Select name="role" defaultValue={m?.role ?? "Roofer"}>{crewRoles.map((r) => <option key={r}>{r}</option>)}</Select>
        </Field>
        <Field label="Mobile"><Input name="phone" type="tel" defaultValue={m?.phone} maxLength={30} /></Field>
        <Field label="Email (optional)"><Input name="email" type="email" defaultValue={m?.email} maxLength={120} /></Field>
        <Field label="Started"><Input name="startDate" type="date" defaultValue={m?.startDate ?? today()} /></Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end rounded-xl border-[1.5px] border-line bg-white px-3 py-2 text-sm">
          <input type="checkbox" checked={drives} onChange={(e) => setDrives(e.target.checked)} className="h-4 w-4 accent-[#b11017]" /> Drives company vans
        </label>
        {drives && (
          <>
            <Field label="Driving licence next checked by" hint="Photocard expiry, or when you next check it on the DVLA site."><Input name="licenceExpiry" type="date" defaultValue={m?.licenceExpiry} /></Field>
            <Field label="Points on licence"><Input name="licencePoints" type="number" min={0} max={36} defaultValue={m?.licencePoints ?? 0} /></Field>
          </>
        )}
        <div className="sm:col-span-2 text-sm font-semibold text-ink">Site cards and training</div>
        <Field label="CSCS card colour">
          <Select name="cscsCard" defaultValue={m?.cscsCard ?? ""}>
            <option value="">No card</option>
            <option value="Green">Green (labourer)</option>
            <option value="Red">Red (trainee or apprentice)</option>
            <option value="Blue">Blue (skilled worker)</option>
            <option value="Gold">Gold (supervisor)</option>
            <option value="Black">Black (manager)</option>
          </Select>
        </Field>
        <Field label="CSCS card expires"><Input name="cscsExpiry" type="date" defaultValue={m?.cscsExpiry} /></Field>
        <Field label="Working at height training expires"><Input name="heightExpiry" type="date" defaultValue={m?.heightExpiry} /></Field>
        <Field label="First aid certificate expires"><Input name="firstAidExpiry" type="date" defaultValue={m?.firstAidExpiry} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={m?.notes} maxLength={500} /></Field>
        {member && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm sm:col-span-2">
            <input name="inactive" type="checkbox" defaultChecked={member.status === "inactive"} className="h-4 w-4 accent-[#b11017]" /> Left the company (hide from schedules and reminders)
          </label>
        )}
        <FormError>{error}</FormError>
        <div className="flex flex-wrap justify-between gap-2 sm:col-span-2">
          {member && !crewHasHistory(db, member.id) ? (
            <Button variant="danger" onClick={() => { if (confirm(`Delete ${member.name}? They have no history, so nothing else is lost.`)) { mutate((d) => deleteCrew(d, member.id)); router.push("/admin/crew"); } }}>Delete</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit">{member ? "Save changes" : "Add team member"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
