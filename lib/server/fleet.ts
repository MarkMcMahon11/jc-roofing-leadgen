// Server side of the operations dashboard: loads, saves and resets the fleet document (vans, crew, jobs ...).
// The document lives in the same store as leads and settings (Supabase "kv" row "fleet", or a JSON file locally).

import { getFleetDoc, mutateFleetDoc } from "@/lib/store";
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
  // only look at what this batch could have broken: records it wrote, or anything pointing at what it deleted
  const check = (c: Collection, list: Rec[], bad: (r: Rec) => string | null) => {
    if (!touched.has(c) && !touched.has("vehicles") && !touched.has("crew")) return null;
    for (const r of list) {
      const p = bad(r);
      if (p) return p;
    }
    return null;
  };
  return (
    check("jobs", post("jobs"), (j) => ((j.vanIds as string[]).some((id) => !vans.has(id)) || (j.crewIds as string[]).some((id) => !crew.has(id)) ? "A job points at a van or team member that no longer exists." : null)) ??
    check("maintenance", post("maintenance"), (m) => (vans.has(m.vehicleId as string) ? null : "A service record points at a van that no longer exists.")) ??
    check("fines", post("fines"), (f) => (vans.has(f.vehicleId as string) && (!f.crewId || crew.has(f.crewId as string)) ? null : "A notice points at a van or driver that no longer exists.")) ??
    check("expenses", post("expenses"), (e) => (!e.vehicleId || vans.has(e.vehicleId as string) ? null : "A cost points at a van that no longer exists.")) ??
    check("vehicles", post("vehicles"), (v) => (!v.assignedCrewId || crew.has(v.assignedCrewId as string) ? null : "A van's usual driver no longer exists."))
  );
}

/** Apply a validated batch atomically (checked write, retried on conflict) and bump the revision. */
export function applyBatch(rows: Row[], deletes: Delete[]): Promise<BatchResult> {
  return mutateFleetDoc<FleetDB, BatchResult>(buildSeed, (doc) => {
    const problem = integrityProblem(doc, rows, deletes);
    if (problem) {
      const wasDelete = deletes.length > 0 && !problem.startsWith("There are too many");
      return {
        ok: false,
        error: wasDelete ? "That can't be deleted because a job, service record, notice or cost still uses it. Take a van off the road instead of deleting it." : problem,
        status: problem.startsWith("There are too many") ? 413 : 400,
      };
    }
    for (const r of rows) {
      const list = doc[r.collection] as { id: string }[];
      const i = list.findIndex((x) => x.id === r.id);
      if (i >= 0) list[i] = r.data;
      else list.push(r.data);
    }
    for (const x of deletes) {
      const list = doc[x.collection] as { id: string }[];
      const i = list.findIndex((y) => y.id === x.id);
      if (i >= 0) list.splice(i, 1);
    }
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
