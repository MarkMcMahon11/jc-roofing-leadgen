// The daily round (Vercel cron, once a morning): each opted-in team member gets today's and tomorrow's jobs, Jamie gets
// a briefing of what's on and what needs him, and old conversations are deleted. Each reminder is claimed before it is
// sent, so running the round twice can never message anyone twice.

import { addDays, fmtDay } from "@/lib/ops/format";
import { buildAlerts, scheduleItems } from "@/lib/ops/selectors";
import { deliver } from "./engine";
import { loadCtx, type Ctx } from "./ctx";
import { loadAssistant, mutateAssistant } from "./db";
import { itemLine } from "./staff";
import { toDigits, validWa } from "./phone";
import { KEEP_DAYS, type AssistantDoc } from "./types";

const strip = (s: string) => s.replace(/ \[id [^\]]*\]| \[[a-z_]+\]$/g, "");
const first = (n: string) => n.split(" ")[0];

/** true if this reminder had not been sent yet (and is now marked as sent). */
const claim = (key: string) =>
  mutateAssistant((d) => {
    if (d.reminded.includes(key)) return false;
    d.reminded.push(key);
    return true;
  });
/** A reminder that WhatsApp couldn't carry is not "sent": let a later run (or the manual button) try again. */
const release = (key: string) =>
  mutateAssistant((d) => {
    d.reminded = d.reminded.filter((k) => k !== key);
  });
const delivered = (r: string) => r === "sent" || r === "demo";

export function ownerBriefing(ctx: Ctx, doc: AssistantDoc): string {
  const today = scheduleItems(ctx.fleet, ctx.leads, ctx.today, ctx.today);
  const todayIds = new Set(today.map((i) => i.jobId).filter(Boolean));
  const tomorrow = scheduleItems(ctx.fleet, ctx.leads, addDays(ctx.today, 1), addDays(ctx.today, 1)).filter((i) => i.status !== "done" && (!i.jobId || !todayIds.has(i.jobId)));
  const open = doc.tasks.filter((t) => t.status === "open");
  const alerts = buildAlerts(ctx.fleet, ctx.leads).slice(0, 5);
  const newLeads = ctx.leads.filter((l) => l.status === "new" && l.score !== "not-a-fit").length;
  return [
    `Morning Jamie. ${fmtDay(ctx.today)}.`,
    today.length ? `Today:\n${today.map((i) => `• ${strip(itemLine(ctx, i))}`).join("\n")}` : "Nothing booked today.",
    tomorrow.length ? `Tomorrow: ${tomorrow.length} on (${tomorrow.map((i) => i.title).slice(0, 3).join(", ")})` : "",
    newLeads ? `${newLeads} new quote enquir${newLeads === 1 ? "y" : "ies"} waiting.` : "",
    open.length ? `${open.length} message${open.length === 1 ? "" : "s"} for you${open.some((t) => t.urgent) ? " (some urgent)" : ""}. Send "tasks" to see them.` : "",
    alerts.length ? `Needs attention:\n${alerts.map((a) => `• ${a.text}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The "send me the briefing now" button: goes to Jamie's own number only. */
export async function sendOwnerBriefingNow(): Promise<"sent" | "no-number" | "not-delivered"> {
  const ctx = await loadCtx();
  if (!ctx.ownerDigits) return "no-number";
  return delivered(await deliver(ctx.ownerDigits, ownerBriefing(ctx, await loadAssistant()), "bot")) ? "sent" : "not-delivered";
}

export type RoundResult = { staff: number; owner: boolean; purged: number; skipped?: string };

export async function dailyRound(opts: { ownerOnly?: boolean; force?: boolean } = {}): Promise<RoundResult> {
  const ctx = await loadCtx();
  const doc = await loadAssistant();
  const out: RoundResult = { staff: 0, owner: false, purged: 0 };
  if (!doc.enabled && !opts.force) return { ...out, purged: await purgeOld(), skipped: "assistant is switched off" };
  const day = ctx.today;

  if (!opts.ownerOnly) {
    for (const crew of ctx.fleet.crew) {
      const phone = toDigits(crew.phone);
      if (crew.status !== "active" || !crew.whatsappOk || !validWa(phone)) continue;
      const mine = (d: string) => scheduleItems(ctx.fleet, ctx.leads, d, d).filter((i) => i.crewIds.includes(crew.id) && i.status !== "done");
      const t0 = mine(day);
      const today = new Set(t0.map((i) => i.jobId).filter(Boolean));
      const t1 = mine(addDays(day, 1)).filter((i) => !i.jobId || !today.has(i.jobId)); // a multi-day job is not listed twice
      if (!t0.length && !t1.length) continue;
      if (!(await claim(`staff:${day}:${phone}`))) continue;
      const text = [`Morning ${first(crew.name)}.`, t0.length ? `Today:\n${t0.map((i) => `• ${strip(itemLine(ctx, i))}`).join("\n")}` : "Nothing booked today.", t1.length ? `Tomorrow:\n${t1.map((i) => `• ${strip(itemLine(ctx, i))}`).join("\n")}` : "", "Message me here if anything changes or you hit a problem."].filter(Boolean).join("\n\n");
      if (delivered(await deliver(phone, text, "bot"))) out.staff += 1;
      else await release(`staff:${day}:${phone}`);
    }
  }

  if (ctx.ownerDigits && (await claim(`owner:${day}`))) {
    if (delivered(await deliver(ctx.ownerDigits, ownerBriefing(ctx, await loadAssistant()), "bot"))) out.owner = true;
    else await release(`owner:${day}`);
  }

  out.purged = await purgeOld();
  return out;
}

/** Conversations and finished tasks are kept for KEEP_DAYS, then deleted. */
export async function purgeOld(): Promise<number> {
  const cutoff = Date.now() - KEEP_DAYS * 86_400_000;
  return mutateAssistant((d) => {
    const before = d.messages.length + d.tasks.length + d.contacts.length;
    d.messages = d.messages.filter((m) => Date.parse(m.at) >= cutoff);
    // open tasks are kept for twice as long, then go too (nobody is waiting on a six-month-old message)
    d.tasks = d.tasks.filter((t) => (t.status === "open" ? Date.parse(t.at) >= cutoff - KEEP_DAYS * 86_400_000 : Date.parse(t.resolvedAt ?? t.at) >= cutoff));
    const talking = new Set([...d.messages.map((m) => m.phone), ...d.tasks.map((t) => t.phone)]);
    d.contacts = d.contacts.filter((c) => c.kind === "staff" || c.blocked || talking.has(c.phone) || Date.parse(c.lastInboundAt ?? c.createdAt) >= cutoff);
    return before - (d.messages.length + d.tasks.length + d.contacts.length);
  });
}
