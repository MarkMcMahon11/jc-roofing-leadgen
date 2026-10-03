import { COLLECTIONS, type Collection, type FleetDB } from "./types";

export type RowChange = { type: "row"; collection: Collection; id: string; data: { id: string } };
export type DelChange = { type: "del"; collection: Collection; id: string };
export type Change = RowChange | DelChange;

export const keyOf = (c: { collection: Collection; id: string }) => `${c.collection}:${c.id}`;

/** Records that are new, changed or removed between two versions of the document. */
export function diff(prev: FleetDB, next: FleetDB): Change[] {
  const out: Change[] = [];
  for (const c of COLLECTIONS) {
    const before = new Map((prev[c] as { id: string }[]).map((x) => [x.id, JSON.stringify(x)]));
    const seen = new Set<string>();
    for (const item of next[c] as { id: string }[]) {
      seen.add(item.id);
      if (before.get(item.id) !== JSON.stringify(item)) out.push({ type: "row", collection: c, id: item.id, data: item });
    }
    for (const id of before.keys()) if (!seen.has(id)) out.push({ type: "del", collection: c, id });
  }
  return out;
}

/** Put our not-yet-saved changes back on top of a document freshly loaded from the server. */
export function applyPending(doc: FleetDB, pending: Iterable<Change>): FleetDB {
  const next = structuredClone(doc);
  for (const ch of pending) {
    const list = next[ch.collection] as { id: string }[];
    const i = list.findIndex((x) => x.id === ch.id);
    if (ch.type === "del") {
      if (i >= 0) list.splice(i, 1);
    } else if (i >= 0) list[i] = ch.data;
    else list.push(ch.data);
  }
  return sortDB(next);
}

export function sortDB(db: FleetDB): FleetDB {
  db.activity.sort((a, b) => (a.at < b.at ? 1 : -1));
  db.expenses.sort((a, b) => (a.date < b.date ? 1 : -1));
  return db;
}
