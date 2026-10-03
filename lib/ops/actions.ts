// Everything the dashboard can change. Each function edits a draft copy of the document in place and writes the
// activity log; the store works out which records changed and saves only those.

import { addDays, addMonths, gbp, pence, today, uid } from "./format";
import { fineType, maintType } from "./labels";
import type { Activity, CrewMember, Expense, ExpenseCategory, FleetDB, Fine, Job, JobStatus, MaintType, Vehicle, VehicleStatus } from "./types";

export function log(d: FleetDB, kind: Activity["kind"], text: string, href?: string) {
  d.activity.unshift({ id: uid("a"), at: new Date().toISOString(), kind, text, ...(href ? { href } : {}) });
  if (d.activity.length > 300) d.activity.length = 300;
}

const reg = (d: FleetDB, id: string) => d.vehicles.find((v) => v.id === id)?.reg ?? "";

// ---------- vans ----------

export function addVan(d: FleetDB, v: Omit<Vehicle, "id" | "tracker" | "status" | "equipment"> & { equipment?: string[]; status?: VehicleStatus }): string {
  const id = uid("v");
  d.vehicles.push({ equipment: [], status: "at_yard", ...v, id, tracker: { online: true, lastSeen: new Date().toISOString(), area: "Heathhall" } });
  log(d, "van", `Van added: ${v.make} ${v.model} (${v.reg})`, `/admin/vans/${id}`);
  return id;
}

export function updateVan(d: FleetDB, id: string, patch: Partial<Vehicle>, what = "updated") {
  const v = d.vehicles.find((x) => x.id === id);
  if (!v) return;
  Object.assign(v, patch);
  log(d, "van", `Van ${what}: ${v.reg}`, `/admin/vans/${id}`);
}

export function setVanStatus(d: FleetDB, id: string, status: VehicleStatus) {
  const v = d.vehicles.find((x) => x.id === id);
  if (!v) return;
  v.status = status;
  const words: Record<VehicleStatus, string> = { in_use: "back on the road", at_yard: "at the yard", in_garage: "in the garage", off_road: "taken off the road (SORN)" };
  log(d, "van", `${v.reg} ${words[status]}`, `/admin/vans/${id}`);
}

export const vanHasHistory = (d: FleetDB, id: string) =>
  d.maintenance.some((m) => m.vehicleId === id) || d.fines.some((f) => f.vehicleId === id) || d.expenses.some((e) => e.vehicleId === id) || d.jobs.some((j) => j.vanIds.includes(id));

/** Only a van with no history can be deleted (to undo a mistake). Otherwise take it off the road and keep the records. */
export function deleteVan(d: FleetDB, id: string): boolean {
  if (vanHasHistory(d, id)) return false;
  const v = d.vehicles.find((x) => x.id === id);
  d.vehicles = d.vehicles.filter((x) => x.id !== id);
  if (v) log(d, "van", `Van removed: ${v.reg}`);
  return true;
}

// ---------- crew ----------

export function addCrew(d: FleetDB, c: Omit<CrewMember, "id" | "status">): string {
  const id = uid("c");
  d.crew.push({ ...c, id, status: "active" });
  log(d, "crew", `Team member added: ${c.name}`, `/admin/crew/${id}`);
  return id;
}

export function updateCrew(d: FleetDB, id: string, patch: Partial<CrewMember>, what = "updated") {
  const c = d.crew.find((x) => x.id === id);
  if (!c) return;
  Object.assign(c, patch);
  log(d, "crew", `Team member ${what}: ${c.name}`, `/admin/crew/${id}`);
}

export const crewHasHistory = (d: FleetDB, id: string) =>
  d.jobs.some((j) => j.crewIds.includes(id)) || d.fines.some((f) => f.crewId === id) || d.vehicles.some((v) => v.assignedCrewId === id);

export function deleteCrew(d: FleetDB, id: string): boolean {
  if (crewHasHistory(d, id)) return false;
  const c = d.crew.find((x) => x.id === id);
  d.crew = d.crew.filter((x) => x.id !== id);
  if (c) log(d, "crew", `Team member removed: ${c.name}`);
  return true;
}

// ---------- jobs and inspections ----------

export function addJob(d: FleetDB, j: Omit<Job, "id" | "status"> & { status?: JobStatus }): string {
  const id = uid("j");
  d.jobs.push({ status: "scheduled", ...j, id });
  if (j.kind === "job") syncVanStatuses(d, j.vanIds);
  log(d, "job", `${j.kind === "inspection" ? "Inspection" : "Job"} scheduled: ${j.title} (${j.customer ?? j.address})`, "/admin/jobs");
  return id;
}

export function updateJob(d: FleetDB, id: string, patch: Partial<Job>) {
  const j = d.jobs.find((x) => x.id === id);
  if (!j) return;
  Object.assign(j, patch);
  log(d, "job", `Updated: ${j.title} (${j.customer ?? j.address})`, "/admin/jobs");
}

/** A van is "on the road" while any started roofing job has it, otherwise at the yard. Garage and off-road are left alone. */
function refreshVanStatus(d: FleetDB, vanId: string) {
  const v = d.vehicles.find((x) => x.id === vanId);
  if (!v || (v.status !== "in_use" && v.status !== "at_yard")) return;
  v.status = d.jobs.some((j) => j.kind === "job" && j.status === "in_progress" && j.vanIds.includes(vanId)) ? "in_use" : "at_yard";
}

/** Re-work the status of these vans from the jobs now in progress (used after a job is added, edited or removed). */
export function syncVanStatuses(d: FleetDB, vanIds: string[]) {
  for (const id of new Set(vanIds)) refreshVanStatus(d, id);
}

export function setJobStatus(d: FleetDB, id: string, status: JobStatus) {
  const j = d.jobs.find((x) => x.id === id);
  if (!j) return;
  j.status = status;
  const words: Record<JobStatus, string> = { scheduled: "rescheduled", in_progress: "started", done: "finished", cancelled: "cancelled" };
  log(d, "job", `Job ${words[status]}: ${j.title} (${j.customer ?? j.address})`, "/admin/jobs");
  if (j.kind === "job") for (const vid of j.vanIds) refreshVanStatus(d, vid);
}

export function deleteJob(d: FleetDB, id: string) {
  const j = d.jobs.find((x) => x.id === id);
  d.jobs = d.jobs.filter((x) => x.id !== id);
  if (j) {
    log(d, "job", `Job removed: ${j.title} (${j.customer ?? j.address})`);
    for (const vid of j.vanIds) refreshVanStatus(d, vid);
  }
}

// ---------- servicing ----------

export function openMaintenance(d: FleetDB, p: { vehicleId: string; type: MaintType; description: string; garage: string; cost: number; date: string; inGarageNow: boolean }): string {
  const id = uid("m");
  const v = d.vehicles.find((x) => x.id === p.vehicleId);
  d.maintenance.push({ id, vehicleId: p.vehicleId, type: p.type, description: p.description, garage: p.garage, cost: p.cost, openedAt: p.date, status: p.inGarageNow ? "in_progress" : "scheduled", mileage: v?.mileage ?? 0 });
  if (v && p.inGarageNow) v.status = "in_garage";
  log(d, "maintenance", `${p.inGarageNow ? "In the garage" : "Booked in"}: ${p.description} (${reg(d, p.vehicleId)})`, `/admin/vans/${p.vehicleId}`);
  return id;
}

export function startMaintenance(d: FleetDB, id: string) {
  const m = d.maintenance.find((x) => x.id === id);
  if (!m) return;
  m.status = "in_progress";
  m.openedAt = today();
  const v = d.vehicles.find((x) => x.id === m.vehicleId);
  if (v) v.status = "in_garage";
  log(d, "maintenance", `In the garage: ${m.description} (${reg(d, m.vehicleId)})`, `/admin/vans/${m.vehicleId}`);
}

const expenseFor: Record<MaintType, ExpenseCategory> = { service: "repairs", mot: "mot", repair: "repairs", tyres: "tyres", bodywork: "repairs", equipment: "equipment" };

/** Finish a work order: the van is released, the cost becomes an expense, and service/MOT dates roll forward. */
/** New MOT expiry: tested up to a month before the old expiry the anniversary is kept, otherwise a year less a day from the test. */
export function nextMotExpiry(oldExpiry: string, testDate: string): string {
  const earliestToKeep = addDays(addMonths(oldExpiry, -1), 1);
  if (testDate >= earliestToKeep && testDate <= oldExpiry) return addMonths(oldExpiry, 12);
  return addDays(addMonths(testDate, 12), -1);
}

export function closeMaintenance(d: FleetDB, id: string, cost: number) {
  const m = d.maintenance.find((x) => x.id === id);
  if (!m || m.status === "done") return;
  cost = pence(cost);
  m.status = "done";
  m.closedAt = today();
  m.cost = cost;
  const v = d.vehicles.find((x) => x.id === m.vehicleId);
  if (v) {
    const stillIn = d.maintenance.some((o) => o.id !== m.id && o.vehicleId === v.id && o.status === "in_progress");
    if (v.status === "in_garage" && !stillIn) {
      v.status = "at_yard";
      refreshVanStatus(d, v.id); // back on the road if a started job still has it
    }
    if (m.type === "service") {
      v.nextServiceMiles = v.mileage + 12000;
      v.nextServiceDate = addDays(today(), 365);
    }
    if (m.type === "mot") v.docs.mot = nextMotExpiry(v.docs.mot, today());
  }
  addExpenseRow(d, { date: today(), category: expenseFor[m.type], amount: cost, description: m.description, vehicleId: m.vehicleId, method: "card" }, false);
  log(d, "maintenance", `${maintType[m.type]} finished: ${m.description} (${reg(d, m.vehicleId)}, ${gbp(cost)})`, `/admin/vans/${m.vehicleId}`);
}

// ---------- penalty notices ----------

export function addFine(d: FleetDB, f: Omit<Fine, "id" | "status" | "nameBy" | "discountBy">): string {
  const id = uid("f");
  d.fines.unshift({ ...f, id, status: "to_name", nameBy: addDays(f.date, 28), discountBy: addDays(f.date, 14) });
  log(d, "fine", `${fineType[f.type]} notice recorded: ${f.ref} (${reg(d, f.vehicleId)})`, "/admin/fines");
  return id;
}

export function setFineStatus(d: FleetDB, id: string, status: Fine["status"]) {
  const f = d.fines.find((x) => x.id === id);
  if (!f) return;
  f.status = status;
  const description = `${fineType[f.type]} notice ${f.ref}`;
  if (status === "paid" && !d.expenses.some((e) => e.category === "fines" && e.vehicleId === f.vehicleId && e.description === description))
    addExpenseRow(d, { date: today(), category: "fines", amount: f.amount, description, vehicleId: f.vehicleId, method: "bank" }, false);
  const words: Record<Fine["status"], string> = { to_name: "back to name the driver", named: "driver named", paid: "paid by the company", recharged: "taken from the driver", appealed: "being appealed" };
  log(d, "fine", `Notice ${f.ref}: ${words[status]} (${reg(d, f.vehicleId)})`, "/admin/fines");
}

// ---------- costs ----------

function addExpenseRow(d: FleetDB, e: Omit<Expense, "id">, doLog: boolean) {
  d.expenses.unshift({ ...e, amount: pence(e.amount), id: uid("e") });
  d.expenses.sort((a, b) => (a.date < b.date ? 1 : -1));
  if (doLog) log(d, "expense", `Cost recorded: ${e.description} (${gbp(e.amount)})`, "/admin/costs");
}
export const addExpense = (d: FleetDB, e: Omit<Expense, "id">) => addExpenseRow(d, e, true);

export function deleteExpense(d: FleetDB, id: string) {
  d.expenses = d.expenses.filter((x) => x.id !== id);
}
