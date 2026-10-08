"use client";

import { useState } from "react";
import { Button, Field, FormError, Input, Modal, Select } from "./ui";
import { useNextStep } from "./Guide";
import { openMaintenance } from "@/lib/ops/actions";
import { pence, today } from "@/lib/ops/format";
import { maintType } from "@/lib/ops/labels";
import { useOps } from "@/lib/ops/store";
import type { MaintType } from "@/lib/ops/types";

/** Book a service, MOT or repair. Mount it only while open. */
export function MaintenanceForm({ onClose, vehicleId }: { onClose: () => void; vehicleId?: string }) {
  const { db, mutate } = useOps();
  const nextStep = useNextStep();
  const [type, setType] = useState<MaintType>("service");
  const [error, setError] = useState("");

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const vid = vehicleId ?? String(f.get("vehicleId") ?? "");
    const description = String(f.get("description") ?? "").trim();
    if (!vid) return setError("Choose the van.");
    if (!description) return setError("Say what needs doing.");
    const cost = Number(f.get("cost"));
    if (!Number.isFinite(cost) || cost < 0) return setError("The cost must be a number (an estimate is fine).");
    const inGarageNow = f.get("now") === "on";
    mutate((d) => openMaintenance(d, { vehicleId: vid, type, description, garage: String(f.get("garage") ?? "").trim(), cost: pence(cost), date: String(f.get("date") || today()), inGarageNow }));
    nextStep({
      title: inGarageNow ? "Van is in the garage" : "Booked in",
      body: inGarageNow ? "It's marked In the garage and warned about if you schedule it on a job. Press “Finish and release” on the Servicing page when it's back." : "It's on the Servicing list. Press “Van is in” on the day it goes into the garage.",
      href: "/admin/maintenance",
      action: "Open servicing",
    });
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Book a service or repair">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {!vehicleId && (
          <Field label="Van" className="sm:col-span-2">
            <Select name="vehicleId" defaultValue="" required>
              <option value="" disabled>Choose a van…</option>
              {db.vehicles.map((v) => <option key={v.id} value={v.id}>{v.reg} · {v.make} {v.model}</option>)}
            </Select>
          </Field>
        )}
        <Field label="What kind?">
          <Select value={type} onChange={(e) => setType(e.target.value as MaintType)}>
            {(Object.keys(maintType) as MaintType[]).map((k) => <option key={k} value={k}>{maintType[k]}</option>)}
          </Select>
        </Field>
        <Field label="Date"><Input name="date" type="date" defaultValue={today()} required /></Field>
        <Field label="What needs doing?" className="sm:col-span-2"><Input name="description" required maxLength={200} placeholder={type === "mot" ? "MOT test" : type === "service" ? "Full service and oil change" : "Brake pads and discs"} /></Field>
        <Field label="Garage"><Input name="garage" maxLength={80} placeholder="Dumfries Van Centre" /></Field>
        <Field label="Estimated cost (£)"><Input name="cost" type="number" min={0} step="any" defaultValue={0} required /></Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-ctrl bg-surface px-3 py-2 text-sm sm:col-span-2">
          <input name="now" type="checkbox" className="h-4 w-4 accent-[#b11017]" /> The van is going into the garage now
        </label>
        <FormError>{error}</FormError>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit">Book it</Button>
        </div>
      </form>
    </Modal>
  );
}
