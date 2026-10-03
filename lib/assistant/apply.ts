// Changing the real system from the assistant. Every change goes through the same validated, checked-write path the
// dashboard uses, so a mistake in a message can never write bad or dangling data.

import { updateLeads } from "@/lib/store";
import { applyBatch, loadFleet, validateBatch } from "@/lib/server/fleet";
import { diff } from "@/lib/ops/sync";
import type { FleetDB } from "@/lib/ops/types";
import type { Lead } from "@/lib/types";

export type Result = { ok: true } | { ok: false; error: string };

/** Run `mutator` on a copy of the fleet data and save only what it changed. */
export async function applyFleet(mutator: (d: FleetDB) => void): Promise<Result> {
  const before = await loadFleet();
  const draft = structuredClone(before);
  try {
    mutator(draft);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const changes = diff(before, draft);
  if (!changes.length) return { ok: true };
  const rows = changes.filter((c) => c.type === "row").map((c) => ({ collection: c.collection, id: c.id, data: (c as { data: unknown }).data }));
  const deletes = changes.filter((c) => c.type === "del").map((c) => ({ collection: c.collection, id: c.id }));
  const checked = validateBatch({ rows, deletes });
  if (!checked.ok) return { ok: false, error: checked.error };
  const res = await applyBatch(checked.rows, checked.deletes);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function setLeadStatus(id: string, status: Lead["status"]): Promise<Result> {
  const found = await updateLeads((leads) => {
    const l = leads.find((x) => x.id === id);
    if (l) l.status = status;
    return !!l;
  });
  return found ? { ok: true } : { ok: false, error: "That enquiry no longer exists." };
}
