// Server side of the operations dashboard: loads, saves and resets the fleet document (vans, crew, jobs ...).
// The document lives in the same store as leads and settings (Supabase "kv" row "fleet", or a JSON file locally).

import { getFleetDoc, mutateFleetDoc, noWrite } from "@/lib/store";
import { buildSeed, emptyFleet } from "@/lib/ops/seed";
import { SCHEMAS } from "@/lib/ops/schema";
import { COLLECTIONS, type Collection, type FleetDB } from "@/lib/ops/types";

export type Row = { collection: Collection; id: string; data: { id: string } };
export type Delete = { collection: Collection; id: string };

const MAX_ACTIVITY = 300;
const MAX_ROW_BYTES = 20_000;
export const MAX_ROWS = 200;

const isCollection = (c: unknown): c is Collection => typeof c === "string" && (COLLECTIONS as readonly string[]).includes(c);

/** A brand-new site starts with the sample data, saved on first visit. */
export async function loadFleet(): Promise<FleetDB> {
  const doc = await getFleetDoc<FleetDB | null>(null);
  if (doc) return doc;
  // the fallback (sample data) is what gets stored when the document doesn't exist yet
  return mutateFleetDoc<FleetDB, FleetDB>(buildSeed, (cur) => cur);
}

/** Validate a batch of changed/deleted records. Returns clean rows or an error message. */
export function validateBatch(body: unknown): { ok: true; rows: Row[]; deletes: Delete[] } | { ok: false; error: string } {
  const b = body as { rows?: unknown; deletes?: unknown } | null;
  const rowsIn = Array.isArray(b?.rows) ? (b!.rows as unknown[]) : [];
  const delsIn = Array.isArray(b?.deletes) ? (b!.deletes as unknown[]) : [];
  if (rowsIn.length + delsIn.length === 0 || rowsIn.length + delsIn.length > MAX_ROWS) return { ok: false, error: "Nothing to save, or too many changes at once." };

  const rows: Row[] = [];
  for (const r of rowsIn as { collection?: unknown; id?: unknown; data?: unknown }[]) {
    if (!r || !isCollection(r.collection) || typeof r.id !== "string") return { ok: false, error: "Invalid record." };
    const data = r.data as { id?: unknown } | null;
    if (!data || typeof data !== "object" || Array.isArray(data) || data.id !== r.id) return { ok: false, error: "Invalid record." };
    if (JSON.stringify(data).length > MAX_ROW_BYTES) return { ok: false, error: "A record is too large." };
    const parsed = SCHEMAS[r.collection].safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, error: `Invalid ${r.collection} record (${issue.path.join(".") || "value"}: ${issue.message}).` };
    }
    rows.push({ collection: r.collection, id: r.id, data: parsed.data });
  }
  const deletes: Delete[] = [];
  for (const x of delsIn as { collection?: unknown; id?: unknown }[]) {
    if (!x || !isCollection(x.collection) || typeof x.id !== "string" || x.id.length > 80) return { ok: false, error: "Invalid deletion." };
    deletes.push({ collection: x.collection, id: x.id });
  }
  return { ok: true, rows, deletes };
}

const CAPS: Record<Collection, number> = { vehicles: 60, crew: 120, jobs: 5000, maintenance: 3000, fines: 2000, expenses: 30000, activity: MAX_ACTIVITY };

type Rec = Record<string, unknown> & { id: string };
export type BatchResult = { ok: true; rev: number } | { ok: false; error: string; status: number };
const rejected = (error: string, status = 400) => noWrite<BatchResult>({ ok: false, error, status });

/** Does the document, as it would be after this batch, still hang together? Returns a plain-English problem, or null. */
function integrityProblem(doc: FleetDB, rows: Row[], deletes: Delete[]): string | null {
  const post = (c: Collection): Rec[] => {
    const m = new Map<string, Rec>();
    for (const x of doc[c] as unknown as Rec[]) m.set(x.id, x);
    for (const r of rows) if (r.collection === c) m.set(r.id, r.data as Rec);
    for (const x of deletes) if (x.collection === c) m.delete(x.id);
    return [...m.values()];
  };
  const touched = new Set(rows.map((r) => r.collection).concat(deletes.map((x) => x.collection)));
  for (const c of touched) if (post(c).length > CAPS[c] && c !== "activity") return `There are too many ${c} records (the limit is ${CAPS[c].toLocaleString("en-GB")}).`;

  const vans = new Set(post("vehicles").map((v) => v.id));
  const crew = new Set(post("crew").map((c) => c.id));

  // deleting something that is still in use
  const deletedVans = deletes.filter((x) => x.collection === "vehicles").map((x) => x.id);
  if (deletedVans.length) {
    const used = (id: string) =>
      post("jobs").some((j) => (j.vanIds as string[]).includes(id)) ||
      post("maintenance").some((m) => m.vehicleId === id) ||
      post("fines").some((f) => f.vehicleId === id) ||
      post("expenses").some((e) => e.vehicleId === id);
    if (deletedVans.some(used)) return "That van still has jobs, service records, notices or costs. Take it off the road instead of deleting it.";
  }
  const deletedCrew = deletes.filter((x) => x.collection === "crew").map((x) => x.id);
  if (deletedCrew.length) {
    const used = (id: string) =>
      post("jobs").some((j) => (j.crewIds as string[]).includes(id)) || post("fines").some((f) => f.crewId === id) || post("vehicles").some((v) => v.assignedCrewId === id);
    if (deletedCrew.some(used)) return "That team member is still on jobs, notices or a van. Mark them as having left instead of deleting them.";
  }

  // records written by this batch must point at things that exist
  for (const r of rows) {
    const d = r.data as Rec;
    if (r.collection === "jobs" && ((d.vanIds as string[]).some((id) => !vans.has(id)) || (d.crewIds as string[]).some((id) => !crew.has(id)))) return "A job points at a van or team member that doesn't exist.";
    if (r.collection === "maintenance" && !vans.has(d.vehicleId as string)) return "A service record points at a van that doesn't exist.";
    if (r.collection === "fines" && (!vans.has(d.vehicleId as string) || (d.crewId && !crew.has(d.crewId as string)))) return "A notice points at a van or driver that doesn't exist.";
    if (r.collection === "expenses" && d.vehicleId && !vans.has(d.vehicleId as string)) return "A cost points at a van that doesn't exist.";
    if (r.collection === "vehicles" && d.assignedCrewId && !crew.has(d.assignedCrewId as string)) return "A van's usual driver doesn't exist.";
  }
  return null;
}

/** Apply a validated batch atomically (checked write, retried on conflict) and bump the revision. */
export function applyBatch(rows: Row[], deletes: Delete[]): Promise<BatchResult> {
  return mutateFleetDoc<FleetDB, BatchResult>(buildSeed, (doc) => {
    const problem = integrityProblem(doc, rows, deletes);
    if (problem) return rejected(problem, problem.startsWith("There are too many") ? 413 : 400);
    let changed = false;
    for (const r of rows) {
      const list = doc[r.collection] as { id: string }[];
      const i = list.findIndex((x) => x.id === r.id);
      if (i >= 0) {
        if (JSON.stringify(list[i]) !== JSON.stringify(r.data)) changed = true;
        list[i] = r.data;
      } else {
        list.push(r.data);
        changed = true;
      }
    }
    for (const x of deletes) {
      const list = doc[x.collection] as { id: string }[];
      const i = list.findIndex((y) => y.id === x.id);
      if (i >= 0) {
        list.splice(i, 1);
        changed = true;
      }
    }
    // nothing actually changed (a repeat save, or deleting something already gone): don't save or bump the revision
    if (!changed) return noWrite<BatchResult>({ ok: true, rev: doc.rev });
    doc.activity.sort((a, b) => (a.at < b.at ? 1 : -1));
    if (doc.activity.length > MAX_ACTIVITY) doc.activity.length = MAX_ACTIVITY;
    doc.rev += 1;
    return { ok: true, rev: doc.rev };
  });
}

/** Replace everything: with fresh sample data, or with an empty dashboard ready for the real vans. */
export function resetFleet(mode: "sample" | "empty"): Promise<FleetDB> {
  return mutateFleetDoc<FleetDB, FleetDB>(buildSeed, (cur) => {
    const next = mode === "sample" ? buildSeed() : emptyFleet();
    next.rev = (cur.rev ?? 0) + 1;
    for (const k of Object.keys(cur)) delete (cur as unknown as Record<string, unknown>)[k];
    Object.assign(cur, next);
    return cur;
  });
}
