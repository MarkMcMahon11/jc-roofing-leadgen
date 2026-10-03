// The front door: one inbound WhatsApp message in, the right behaviour out.
//   owner  -> Jamie: asks questions, gives instructions; every change waits for his YES
//   staff  -> a recognised employee: own schedule/van/deadlines, job start/finish, issues for Jamie
//   public -> anyone else: front desk for customers and suppliers, collects details, never commits to prices or dates
// The role comes only from the sender's verified number (see ctx.resolveRole).

import { AsyncLocalStorage } from "node:async_hooks";
import { uid } from "@/lib/ops/format";
import type { CrewMember } from "@/lib/ops/types";
import { textOwner } from "@/lib/notify";
import { aiConfigured, DAILY_CAP } from "./llm";
import { ensureContact, findContact, historyFor, loadAssistant, mutateAssistant, pushMsg, pushTask, takeAiCall } from "./db";
import { applyFleet } from "./apply";
import { loadCtx, resolveRole, type Ctx } from "./ctx";
import { aiOwner, describe, execute, rulesOwner, type Io } from "./owner";
import { pretty } from "./phone";
import { aiPublic, looksUrgent, rulesPublic, type PublicOutcome } from "./public";
import { aiStaff, rulesStaff, type NewTask } from "./staff";
import type { Msg, Role, Task } from "./types";
import { sendTemplate, sendText, templateName, waConfigured, type WaInbound } from "./wa";

export type SendResult = "sent" | "failed" | "demo" | "skipped";

/** Inside `dryRun(...)` nothing reaches a real phone: replies are only recorded (used by the dashboard's "try it"). */
const dry = new AsyncLocalStorage<boolean>();
export const dryRun = <T>(fn: () => Promise<T>) => dry.run(true, fn);

const HOUR = 3_600_000;
/** WhatsApp lets us send free-form text for 24 hours after the person last messaged us. */
export const windowOpen = (iso?: string) => !!iso && Date.now() - Date.parse(iso) < 23.5 * HOUR;
const clean = (s: string, n = 1000) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, n);

/** Send (or demo-send) and record it against the person's conversation. Never throws. */
export async function deliver(phone: string, text: string, by: "bot" | "owner" = "bot"): Promise<SendResult> {
  try {
    const doc = await loadAssistant();
    const c = findContact(doc, phone);
    let res: SendResult;
    if (c?.blocked) res = "skipped"; // they asked us to stop (Jamie can press "Allow replies" first)
    else if (dry.getStore() || !waConfigured()) res = "demo";
    else {
      res = windowOpen(c?.lastInboundAt) ? await sendText(phone, text) : "failed";
      if (res === "failed" && templateName()) res = await sendTemplate(phone, text);
      if (res === "failed" && !windowOpen(c?.lastInboundAt) && !templateName()) res = "skipped";
    }
    // a message WhatsApp couldn't carry is not a conversation turn: keep it out of the thread (and out of the AI's history)
    if (res !== "skipped" || by === "owner") {
      await mutateAssistant((d) => {
        ensureContact(d, phone);
        pushMsg(d, { phone, dir: "out", by, text: text.slice(0, 1500), delivery: res });
      });
    }
    return res;
  } catch (e) {
    console.error("[assistant] deliver failed:", (e as Error).message);
    return "failed";
  }
}

/** Tell Jamie. Urgent things always go; the rest only while his 24 h window is open (otherwise they wait for the morning briefing). */
export async function notifyOwner(ctx: Ctx, text: string, urgent: boolean): Promise<void> {
  if (!ctx.ownerDigits) return;
  const doc = await loadAssistant();
  if (!urgent && !windowOpen(doc.ownerLastInboundAt)) return;
  const r = await deliver(ctx.ownerDigits, text, "bot");
  // WhatsApp can't carry it (his 24 h window is closed and no template is set up): an urgent alert still reaches him by text
  const smsTo = ctx.settings.ownerPhone || `+${ctx.ownerDigits}`;
  if (urgent && (r === "skipped" || r === "failed") && smsTo.length > 5) await textOwner(smsTo, text.replace(/^🚨\s*/, "").slice(0, 300));
}

type Rec = {
  phone: string;
  name?: string;
  history: Msg[];
  blocked: boolean;
  botOn: boolean;
  enabled: boolean;
  staffAuto: boolean;
  limited: boolean;
};

async function takeAi(role: Role): Promise<boolean> {
  if (!aiConfigured()) return false;
  return mutateAssistant((d) => takeAiCall(d, DAILY_CAP, role));
}

export async function handleInbound(m: WaInbound): Promise<void> {
  const ctx = await loadCtx();
  const { role, crew } = resolveRole(ctx, m.from);
  const text = clean(m.text ?? "");
  const now = new Date().toISOString();

  const rec = await mutateAssistant<Rec | null>((d) => {
    if (d.seen.includes(m.waId) || d.messages.some((x) => x.waId === m.waId)) return null; // Meta retries: already handled
    d.seen.push(m.waId);
    const history = historyFor(d, m.from, 10);
    const c = ensureContact(d, m.from, {});
    c.lastInboundAt = now;
    if (role === "staff" && crew) {
      c.kind = "staff";
      c.crewId = crew.id;
      c.name = crew.name;
    } else if (role === "owner") {
      c.kind = "staff";
      c.name = "Jamie (owner)";
      d.ownerLastInboundAt = now;
    } else {
      const nm = clean(m.name ?? "", 60);
      if (nm && !c.name) c.name = nm;
      const lead = c.leadId ? undefined : ctx.leads.find((l) => l.phone.replace(/\D/g, "").replace(/^0/, "44") === m.from);
      if (lead) {
        c.leadId = lead.id;
        c.kind = c.kind === "unknown" ? "customer" : c.kind;
        c.name ??= lead.name;
      }
    }
    const t = Date.now();
    const inRecent = d.messages.filter((x) => x.phone === m.from && x.dir === "in" && t - Date.parse(x.at) < 10 * 60_000).length;
    const outRecent = d.messages.filter((x) => x.phone === m.from && x.dir === "out" && t - Date.parse(x.at) < HOUR).length;
    const limited = role === "public" ? inRecent >= 25 || outRecent >= 15 : inRecent >= 60;
    // someone flooding us: not stored, no reply, no AI spend
    if (!limited) pushMsg(d, { phone: m.from, dir: "in", by: "contact", text: text || `[${m.type}]`, at: now, waId: m.waId });
    return { phone: m.from, name: c.name, history, blocked: !!c.blocked, botOn: c.bot, enabled: d.enabled, staffAuto: d.settings.staffAutoUpdates, limited };
  });
  if (!rec) return;
  if (rec.limited) {
    // someone flooding us: not stored, no reply, no AI spend. A genuine emergency still reaches Jamie.
    if (role === "public" && looksUrgent(text)) {
      const r = await addTask({ phone: m.from, who: rec.name ?? pretty(m.from), role: "public", kind: "urgent", urgent: true, summary: `Possibly urgent (sent while rate-limited): "${text.slice(0, 250)}"` });
      if (r.fresh || r.becameUrgent) await notifyOwner(ctx, ping(r.task), true);
    }
    return;
  }

  if (!text) {
    // a photo, voice note or file: we can't read it, but Jamie should know it arrived
    const who = role === "staff" && crew ? crew.name : rec.name ?? pretty(m.from);
    const r = await addTask({ phone: m.from, who, role: role === "staff" ? "staff" : "public", ...(crew ? { crewId: crew.id } : {}), kind: "other", urgent: false, summary: `Sent something other than text (${m.type}). Check WhatsApp on the business phone.` });
    if (r.fresh && role !== "owner") await notifyOwner(ctx, ping(r.task), false);
    if (rec.enabled && !rec.blocked) await deliver(m.from, "Thanks. I can only read text messages here, so please type what you need. I've let Jamie know you sent something.", "bot");
    return;
  }

  try {
    if (role === "owner") await handleOwner(ctx, rec, text);
    else if (role === "staff" && crew) await handleStaff(ctx, rec, crew, text);
    else await handlePublic(ctx, rec, text);
  } catch (e) {
    console.error("[assistant] handler failed:", (e as Error).message);
    if (role !== "public") await deliver(m.from, "Sorry, something went wrong on my side. Please try again in a moment.", "bot");
  }
}

// ---------- tasks ----------
/** Adds a task, or folds a repeat message from the same person into the one already open. Returns it, and whether it is new. */
async function addTask(t: Omit<Task, "id" | "at" | "status">): Promise<{ task: Task; fresh: boolean; becameUrgent: boolean }> {
  return mutateAssistant((d) => {
    const existing = d.tasks.find((x) => x.status === "open" && x.phone === t.phone && x.kind === t.kind && Date.now() - Date.parse(x.at) < (t.urgent ? 30 * 60_000 : 6 * HOUR) && !t.expense);
    if (existing) {
      const becameUrgent = t.urgent && !existing.urgent;
      existing.urgent ||= t.urgent;
      if (!existing.summary.includes(t.summary)) existing.summary = `${existing.summary} | ${t.summary}`.slice(0, 700);
      return { task: { ...existing }, fresh: false, becameUrgent };
    }
    return { task: { ...pushTask(d, t) }, fresh: true, becameUrgent: false };
  });
}

const kindWord = (t: Task) => (t.role === "staff" ? "Team" : t.kind === "supplier" ? "Supplier" : t.kind === "enquiry" ? "Enquiry" : "Message");
const ping = (t: Task) => `${t.urgent ? "🚨 URGENT " : "📥 "}${kindWord(t)} from ${t.who}${t.role === "public" ? ` (${pretty(t.phone)})` : ""}: ${t.summary.slice(0, 350)}`;

// ---------- public ----------
async function handlePublic(ctx: Ctx, rec: Rec, text: string) {
  const who = rec.name ?? pretty(rec.phone);
  if (rec.blocked || !rec.enabled || !rec.botOn) {
    // the assistant is off, they asked us to stop, or Jamie has taken this conversation: stay quiet but make sure he sees it
    const urgent = looksUrgent(text);
    const r = await addTask({ phone: rec.phone, who, role: "public", kind: urgent ? "urgent" : "other", urgent, summary: `"${text.slice(0, 300)}"` });
    if (r.fresh || r.becameUrgent) await notifyOwner(ctx, ping(r.task), r.task.urgent);
    return;
  }
  const useAi = await takeAi("public");
  const out: PublicOutcome = (useAi && (await aiPublic(ctx, rec.history, text))) || rulesPublic(ctx, rec.history, text);
  await deliver(rec.phone, out.reply, "bot");
  await mutateAssistant((d) => {
    const c = findContact(d, rec.phone);
    if (!c) return;
    if (out.contactKind !== "unknown" && (c.kind === "unknown" || c.kind === out.contactKind)) c.kind = out.contactKind;
    if (out.name && !c.name) c.name = out.name;
    if (out.stop) c.blocked = true;
  });
  if (out.task) {
    const name = out.name ?? out.task.detail?.name ?? rec.name;
    const r = await addTask({ phone: rec.phone, who: name ?? pretty(rec.phone), role: "public", kind: out.task.kind, urgent: out.task.urgent, summary: out.task.summary, detail: out.task.detail });
    if (r.fresh || r.becameUrgent) await notifyOwner(ctx, ping(r.task), r.task.urgent);
  }
}

// ---------- staff ----------
async function handleStaff(ctx: Ctx, rec: Rec, crew: CrewMember, text: string) {
  if (/^\s*(stop|unsubscribe)\s*$/i.test(text)) {
    await applyFleet((d) => {
      const c = d.crew.find((x) => x.id === crew.id);
      if (c) c.whatsappOk = false;
    });
    await deliver(rec.phone, "OK, no more daily reminders. You can still message me any time for your jobs.", "bot");
    return;
  }
  if (!rec.enabled) {
    const r = await addTask({ phone: rec.phone, who: crew.name, role: "staff", crewId: crew.id, kind: "other", urgent: false, summary: `"${text.slice(0, 300)}"` });
    if (r.fresh) await notifyOwner(ctx, ping(r.task), false);
    return;
  }
  const useAi = await takeAi("staff");
  const out = (useAi && (await aiStaff(ctx, crew, rec.history, text, rec.staffAuto))) || rulesStaff(ctx, crew, text);
  await deliver(rec.phone, out.reply, "bot");
  for (const nt of out.tasks as NewTask[]) {
    const r = await addTask({ phone: rec.phone, who: crew.name, role: "staff", crewId: crew.id, kind: nt.kind, urgent: nt.urgent, summary: nt.summary, detail: nt.detail, expense: nt.expense });
    if (r.fresh || r.becameUrgent) await notifyOwner(ctx, ping(r.task), r.task.urgent);
  }
}

// ---------- owner ----------
const YES_WORDS = new Set(["yes", "y", "yep", "yeah", "yup", "aye", "sure", "ok", "okay", "confirm", "confirmed", "approve", "approved", "go", "fine", "agreed", "do", "please", "👍"]);
const NO_WORDS = new Set(["no", "n", "nope", "nah", "cancel", "dont", "don't", "stop", "scrap", "ignore", "leave"]);
const FILLER = new Set(["please", "thanks", "thank", "you", "do", "it", "go", "ahead", "mate", "that", "all", "good", "great", "cheers", "ta", "then", "now", "jc", "with", "them", "those", "the", "lot", "ok", "okay", "yes", "sure", "off", "he", "x"]);
/** "yes", "yes please", "ok thanks", "yeah go ahead", "👍🏻": every word is a yes/filler word and the first is a yes word. Anything longer is a new instruction. */
function polarity(raw: string): "yes" | "no" | null {
  const words = raw.toLowerCase().replace(/[\u{1F3FB}-\u{1F3FF}\uFE0F]/gu, "").replace(/[.!,]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 5) return null;
  const rest = (from: number) => words.slice(from).every((w) => FILLER.has(w) || YES_WORDS.has(w));
  if (YES_WORDS.has(words[0]) && words[0] !== "please" && words[0] !== "do" && rest(1)) return "yes";
  if (words[0] === "do" && words[1] === "it" && rest(2)) return "yes";
  if (NO_WORDS.has(words[0]) && words.slice(1).every((w) => FILLER.has(w) || NO_WORDS.has(w) || ["it", "that", "them"].includes(w))) return "no";
  return null;
}
const PENDING_TTL = 2 * HOUR;

async function handleOwner(ctx: Ctx, rec: Rec, text: string) {
  const reply = (t: string) => deliver(rec.phone, t.slice(0, 3800), "bot");
  const pol = polarity(text);
  const doc = await loadAssistant();
  const p = doc.pending;
  const fresh = !!p && Date.now() - Date.parse(p.at) < PENDING_TTL;

  if (pol) {
    if (!p || !fresh) {
      if (p) await mutateAssistant((d) => { d.pending = undefined; });
      await reply(pol === "no" ? "OK." : p ? "That confirmation has expired (it was over 2 hours old), so nothing was changed. Tell me again and I'll line it up." : "There's nothing waiting for your confirmation. Tell me what you'd like done.");
      return;
    }
    // claim it first, so a double "YES" can never run it twice
    const taken = await mutateAssistant((d) => {
      const cur = d.pending;
      if (!cur || cur.id !== p.id) return null;
      d.pending = undefined;
      return cur;
    });
    if (!taken) return reply("That one has already been dealt with.");
    if (pol === "no") return reply("Cancelled. Nothing was changed.");
    const io = makeIo();
    const lines: string[] = [];
    for (const a of taken.actions) {
      try {
        lines.push(await execute(ctx, io, a));
      } catch (e) {
        lines.push(`Couldn't: ${(e as Error).message}`);
      }
    }
    return reply(lines.map((l) => (l.startsWith("Done") ? `✅ ${l}` : `⚠️ ${l}`)).join("\n"));
  }

  const useAi = await takeAi("owner");
  const out = (useAi && (await aiOwner(ctx, doc, rec.history, text))) || rulesOwner(ctx, doc, text);
  if (!out.actions.length) {
    // just an answer: anything already waiting for a YES stays waiting
    const nudge = p && fresh ? "\n\n(You still have changes waiting: reply YES to do them or NO to cancel.)" : "";
    return reply((out.reply || "I didn't catch that. Try \"today\", \"tasks\" or \"leads\".") + nudge);
  }
  const summary = out.actions.map((a) => describe(ctx, a, a.type === "task" || a.type === "approve_expense" ? doc.tasks.find((x) => x.id === a.taskId) : undefined));
  await mutateAssistant((d) => {
    d.pending = { id: uid("p"), at: new Date().toISOString(), actions: out.actions, summary };
  });
  const list = summary.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return reply(`${out.reply ? out.reply + "\n\n" : ""}I'll do this:\n${list}\n\nReply YES to confirm or NO to cancel.`);
}

/** The same effects Jamie can confirm by message, for buttons he presses on the dashboard. */
export const dashboardIo = (): Io => makeIo();

function makeIo(): Io {
  return {
    sendTo: (phone, text, by) => deliver(phone, text, by),
    claimExpense: (id) =>
      mutateAssistant((d) => {
        const x = d.tasks.find((y) => y.id === id);
        if (!x || x.status !== "open" || !x.expense) return undefined;
        x.status = "done";
        x.resolvedAt = new Date().toISOString();
        return { ...x, status: "open" as const };
      }),
    reopenTask: (id) =>
      mutateAssistant((d) => {
        const x = d.tasks.find((y) => y.id === id);
        if (x) {
          x.status = "open";
          x.resolvedAt = undefined;
        }
      }),
    setTask: (id, status) =>
      mutateAssistant((d) => {
        const x = d.tasks.find((y) => y.id === id);
        if (!x) return false;
        x.status = status;
        x.resolvedAt = new Date().toISOString();
        return true;
      }),
    setBot: (phone, bot) =>
      mutateAssistant((d) => {
        ensureContact(d, phone).bot = bot;
      }),
  };
}
