"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, FormError, Input, Modal, Select, Textarea } from "./ui";
import { useNextStep } from "./Guide";
import { addVan, deleteVan, updateVan, vanHasHistory } from "@/lib/ops/actions";
import { addDays, today } from "@/lib/ops/format";
import { EQUIPMENT } from "@/lib/ops/labels";
import { isValidPlate, isValidVin, normalisePlate, normaliseVin } from "@/lib/ops/reg";
import { useOps } from "@/lib/ops/store";
import type { Fuel, Vehicle, VehicleKind } from "@/lib/ops/types";

/** Add a van, or edit one. Mount it only while open so the fields reset each time. */
export function VanForm({ onClose, van }: { onClose: () => void; van?: Vehicle }) {
  const { db, mutate } = useOps();
  const router = useRouter();
  const nextStep = useNextStep();
  const [equipment, setEquipment] = useState<string[]>(van?.equipment ?? []);
  const [error, setError] = useState("");
  const editing = !!van;
  const drivers = db.crew.filter((c) => c.status === "active" && c.drives);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const n = (k: string) => Number(f.get(k));
    const reg = normalisePlate(s("reg"));
    if (!isValidPlate(reg)) return setError("Enter the number plate, e.g. SN70 XKR.");
    const dup = db.vehicles.find((v) => v.id !== van?.id && v.reg.replace(/\s/g, "") === reg.replace(/\s/g, ""));
    if (dup) return setError(`${dup.reg} is already in the list.`);
    const vin = normaliseVin(s("vin"));
    if (vin && !isValidVin(vin)) return setError("The chassis number (VIN) should be 17 characters, without I, O or Q. Leave it blank if you don't have it.");
    const year = n("year");
    if (!Number.isInteger(year) || year < 1980 || year > new Date().getFullYear() + 1) return setError("Check the year.");
    const mileage = n("mileage");
    const nextMiles = n("nextServiceMiles");
    if (!Number.isFinite(mileage) || mileage < 0) return setError("Enter the current mileage.");
    if (!Number.isFinite(nextMiles) || nextMiles < mileage) return setError("The next service mileage should be above the current mileage.");
    for (const [k, label] of [["mot", "MOT expiry"], ["roadTax", "Vehicle tax expiry"], ["insurance", "Insurance renewal"]] as const) if (!s(k)) return setError(`Add the ${label} date.`);

    const base = {
      reg, make: s("make"), model: s("model"), year, colour: s("colour"), fuel: s("fuel") as Fuel, kind: s("kind") as VehicleKind, mileage,
      nextServiceMiles: nextMiles, purchasePrice: n("purchasePrice") || 0, purchaseDate: s("purchaseDate") || today(), value: n("value") || 0, equipment,
      docs: { mot: s("mot"), roadTax: s("roadTax"), insurance: s("insurance"), ...(s("breakdown") ? { breakdown: s("breakdown") } : {}) },
      ...(s("nextServiceDate") ? { nextServiceDate: s("nextServiceDate") } : {}),
      ...(vin ? { vin } : {}),
      ...(n("payloadKg") > 0 ? { payloadKg: Math.round(n("payloadKg")) } : {}),
      ...(s("assignedCrewId") ? { assignedCrewId: s("assignedCrewId") } : {}),
      ...(s("notes") ? { notes: s("notes") } : {}),
    };
    if (van) {
      mutate((d) => {
        const i = d.vehicles.findIndex((x) => x.id === van.id);
        if (i >= 0) d.vehicles[i] = { ...van, ...base, nextServiceDate: base.nextServiceDate, vin: base.vin, payloadKg: base.payloadKg, assignedCrewId: base.assignedCrewId, notes: base.notes, docs: base.docs };
        updateVan(d, van.id, {}, "details updated");
      });
      onClose();
      return;
    }
    const id = mutate((d) => addVan(d, base));
    onClose();
    if (id) {
      router.push(`/admin/vans/${id}`);
      nextStep({ title: "Van added", body: "It's at the yard. Send it out by choosing it when you schedule a job, and book its service from the van page.", href: "/admin/jobs", action: "Go to the schedule" });
    }
  }

  const v = van;
  return (
    <Modal open onClose={onClose} title={editing ? `Edit ${v!.reg}` : "Add a van"} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Number plate"><Input name="reg" required defaultValue={v?.reg} placeholder="SN70 XKR" maxLength={12} className="uppercase" /></Field>
        <Field label="Type">
          <Select name="kind" defaultValue={v?.kind ?? "Van"}>
            {(["Van", "Pickup", "Tipper", "Flatbed", "Car"] as const).map((k) => <option key={k}>{k}</option>)}
          </Select>
        </Field>
        <Field label="Make"><Input name="make" required defaultValue={v?.make} placeholder="Ford" /></Field>
        <Field label="Model"><Input name="model" required defaultValue={v?.model} placeholder="Transit Custom" /></Field>
        <Field label="Year"><Input name="year" type="number" required defaultValue={v?.year ?? new Date().getFullYear() - 2} min={1980} /></Field>
        <Field label="Colour"><Input name="colour" required defaultValue={v?.colour ?? "White"} /></Field>
        <Field label="Fuel">
          <Select name="fuel" defaultValue={v?.fuel ?? "Diesel"}>{(["Diesel", "Petrol", "Electric", "Hybrid"] as const).map((k) => <option key={k}>{k}</option>)}</Select>
        </Field>
        <Field label="Payload (kg, optional)"><Input name="payloadKg" type="number" min={0} defaultValue={v?.payloadKg} /></Field>
        <Field label="Mileage now"><Input name="mileage" type="number" required min={0} defaultValue={v?.mileage ?? 0} /></Field>
        <Field label="Next service at (miles)"><Input name="nextServiceMiles" type="number" required min={0} defaultValue={v?.nextServiceMiles ?? 10000} /></Field>
        <Field label="Next service by (date, optional)"><Input name="nextServiceDate" type="date" defaultValue={v?.nextServiceDate} /></Field>
        <Field label="Chassis number (VIN, optional)"><Input name="vin" defaultValue={v?.vin} maxLength={20} className="uppercase" /></Field>

        <div className="sm:col-span-2">
          <div className="text-sm font-semibold text-night">Deadlines</div>
        </div>
        <Field label="MOT expires" hint="New vans: the date the first MOT is due."><Input name="mot" type="date" required defaultValue={v?.docs.mot ?? addDays(today(), 365)} /></Field>
        <Field label="Vehicle tax expires"><Input name="roadTax" type="date" required defaultValue={v?.docs.roadTax ?? addDays(today(), 365)} /></Field>
        <Field label="Insurance renews"><Input name="insurance" type="date" required defaultValue={v?.docs.insurance ?? addDays(today(), 365)} /></Field>
        <Field label="Breakdown cover renews (optional)"><Input name="breakdown" type="date" defaultValue={v?.docs.breakdown} /></Field>

        <Field label="Usual driver">
          <Select name="assignedCrewId" defaultValue={v?.assignedCrewId ?? ""}>
            <option value="">No usual driver</option>
            {drivers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Bought for (£)"><Input name="purchasePrice" type="number" min={0} step="any" defaultValue={v?.purchasePrice} /></Field>
        <Field label="Date bought"><Input name="purchaseDate" type="date" defaultValue={v?.purchaseDate} /></Field>
        <Field label="Worth about now (£)"><Input name="value" type="number" min={0} step="any" defaultValue={v?.value} /></Field>

        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium text-night">Fitted equipment</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {[...EQUIPMENT, ...equipment.filter((x) => !EQUIPMENT.includes(x))].map((x) => (
              <label key={x} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-3 py-1.5 text-sm ${equipment.includes(x) ? "border-brand bg-brand-tint" : "border-ctrl bg-surface"}`}>
                <input type="checkbox" checked={equipment.includes(x)} onChange={() => setEquipment(equipment.includes(x) ? equipment.filter((y) => y !== x) : [...equipment, x])} className="h-4 w-4 accent-[#b11017]" />
                {x}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={v?.notes} maxLength={500} placeholder="e.g. hoist inspection due, key held at the yard…" /></Field>

        <FormError>{error}</FormError>
        <div className="flex flex-wrap justify-between gap-2 sm:col-span-2">
          {van && !vanHasHistory(db, van.id) ? (
            <Button variant="danger" onClick={() => { if (confirm(`Delete ${van.reg}? It has no history, so nothing else is lost.`)) { mutate((d) => deleteVan(d, van.id)); router.push("/admin/vans"); } }}>Delete van</Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit">{editing ? "Save changes" : "Add van"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
