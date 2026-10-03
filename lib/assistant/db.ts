// Storage helpers for the assistant document. `mutateAssistant` callbacks may run more than once (checked writes retry),
// so they only edit the document they are handed: no sending, no AI calls inside them.

import { getAssistantDoc, mutateAssistantDoc } from "@/lib/store";
import { today, uid } from "@/lib/ops/format";
import { CAPS, emptyAssistant, type AssistantDoc, type Contact, type Msg, type Task } from "./types";

export async function loadAssistant(): Promise<AssistantDoc> {
  const d = await getAssistantDoc<AssistantDoc | null>(null);
  return d ? { ...emptyAssistant(), ...d, settings: { ...emptyAssistant().settings, ...(d.settings ?? {}) } } : emptyAssistant();
}

function trim(d: AssistantDoc) {
  // one noisy number can't push everyone else's history out: each person keeps their latest messages only
  const per = new Map<string, number>();
  for (let i = d.messages.length - 1; i >= 0; i--) {
    const p = d.messages[i].phone;
    const n = (per.get(p) ?? 0) + 1;
    per.set(p, n);
    if (n > CAPS.perPhone) d.messages.splice(i, 1);
  }
  if (d.messages.length > CAPS.messages) d.messages.splice(0, d.messages.length - CAPS.messages);
  // open tasks are capped too: the oldest non-urgent ones are dismissed first
  const open = d.tasks.filter((t) => t.status === "open");
  if (open.length > CAPS.tasks) {
    const victims = open.filter((t) => !t.urgent && !t.expense).sort((a, b) => (a.at < b.at ? -1 : 1));
    for (const t of victims.slice(0, open.length - CAPS.tasks)) {
      t.status = "dismissed";
      t.resolvedAt = new Date().toISOString();
    }
  }
  if (d.contacts.length > CAPS.contacts) {
    const busy = new Set(d.tasks.filter((t) => t.status === "open").map((t) => t.phone));
    const idle = d.contacts.filter((c) => c.kind !== "staff" && !c.blocked && !busy.has(c.phone)).sort((a, b) => ((a.lastInboundAt ?? a.createdAt) < (b.lastInboundAt ?? b.createdAt) ? -1 : 1));
    for (const c of idle.slice(0, d.contacts.length - CAPS.contacts)) {
      d.contacts.splice(d.contacts.indexOf(c), 1);
      d.messages = d.messages.filter((m) => m.phone !== c.phone);
    }
  }
  if (d.tasks.length > CAPS.tasks) {
    // drop the oldest finished tasks first, never an open one
    const done = d.tasks.filter((t) => t.status !== "open").sort((a, b) => (a.at < b.at ? -1 : 1));
    for (const t of done) {
      if (d.tasks.length <= CAPS.tasks) break;
      d.tasks.splice(d.tasks.indexOf(t), 1);
    }
  }
  if (d.seen.length > CAPS.seen) d.seen.splice(0, d.seen.length - CAPS.seen);
  if (d.reminded.length > CAPS.reminded) d.reminded.splice(0, d.reminded.length - CAPS.reminded);
}

export function mutateAssistant<R>(fn: (d: AssistantDoc) => R): Promise<R> {
  return mutateAssistantDoc<AssistantDoc, R>(emptyAssistant, (d) => {
    // older saved documents may lack newer fields
    d.settings ??= { staffAutoUpdates: true };
    d.contacts ??= [];
    d.tasks ??= [];
    d.seen ??= [];
    d.reminded ??= [];
    d.ai ??= { day: "", n: 0 };
    const r = fn(d);
    d.rev += 1;
    trim(d);
    return r;
  });
}

export const findContact = (d: AssistantDoc, phone: string) => d.contacts.find((c) => c.phone === phone);

export function ensureContact(d: AssistantDoc, phone: string, init: Partial<Contact> = {}): Contact {
  let c = findContact(d, phone);
  if (!c) {
    c = { phone, kind: "unknown", bot: true, createdAt: new Date().toISOString(), ...init };
    d.contacts.push(c);
  } else {
    for (const [k, v] of Object.entries(init)) if (v !== undefined && (c as Record<string, unknown>)[k] === undefined) (c as Record<string, unknown>)[k] = v;
  }
  return c;
}

export function pushMsg(d: AssistantDoc, m: Omit<Msg, "id" | "at"> & { at?: string }): Msg {
  const msg: Msg = { id: uid("m"), at: new Date().toISOString(), ...m };
  d.messages.push(msg);
  return msg;
}

export function pushTask(d: AssistantDoc, t: Omit<Task, "id" | "at" | "status"> & { at?: string }): Task {
  const task: Task = { id: uid("t"), at: new Date().toISOString(), status: "open", ...t };
  d.tasks.unshift(task);
  return task;
}

export const historyFor = (d: AssistantDoc, phone: string, n = 10) => d.messages.filter((m) => m.phone === phone).slice(-n);

/** Counts one AI-answered message against today's cap. Returns false (and counts nothing) when the cap is used up. */
export function takeAiCall(d: AssistantDoc, cap: number, role: "owner" | "staff" | "public" = "public"): boolean {
  const t = today();
  if (d.ai.day !== t) d.ai = { day: t, n: 0 };
  // the public can use at most 70% of the day's budget, so a flood of strangers can never switch off Jamie and the team
  if (d.ai.n >= (role === "public" ? Math.floor(cap * 0.7) : cap)) return false;
  d.ai.n += 1;
  return true;
}

export const openTasks = (d: AssistantDoc) => d.tasks.filter((t) => t.status === "open");
