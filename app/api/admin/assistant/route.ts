import { z } from "zod";
import { dashboardIo, deliver, dryRun, handleInbound } from "@/lib/assistant/engine";
import { execute } from "@/lib/assistant/owner";
import { loadCtx } from "@/lib/assistant/ctx";
import { ensureContact, findContact, loadAssistant, mutateAssistant } from "@/lib/assistant/db";
import { aiConfigured, DAILY_CAP, MODEL } from "@/lib/assistant/llm";
import { pretty, toDigits, validWa } from "@/lib/assistant/phone";
import { sendOwnerBriefingNow } from "@/lib/assistant/reminders";
import { templateName, waConfigured, waReceiveConfigured } from "@/lib/assistant/wa";
import { uid } from "@/lib/ops/format";
import { bad } from "@/lib/http";
import { clientIp, limited } from "@/lib/limits";
import { crossSite, ownerSession, sameOrigin, unauthorized } from "@/lib/server/auth";

export const maxDuration = 60;

/** GET: everything the Messages page shows. ?brief=1: just the counts for the menu badge. */
export async function GET(req: Request) {
  if (!(await ownerSession())) return unauthorized();
  const doc = await loadAssistant();
  const open = doc.tasks.filter((t) => t.status === "open");
  if (new URL(req.url).searchParams.get("brief")) return Response.json({ open: open.length, urgent: open.filter((t) => t.urgent).length });
  const ctx = await loadCtx();
  const h = req.headers;
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  return Response.json({
    config: {
      whatsapp: waConfigured(),
      receiving: waReceiveConfigured(),
      ai: aiConfigured(),
      model: MODEL,
      aiToday: doc.ai.day === ctx.today ? doc.ai.n : 0,
      aiCap: DAILY_CAP,
      template: !!templateName(),
      cron: !!process.env.CRON_SECRET?.trim(),
      ownerPhone: ctx.ownerDigits ? pretty(ctx.ownerDigits) : "",
      webhookUrl: `${origin}/api/whatsapp/webhook`,
    },
    enabled: doc.enabled,
    settings: doc.settings,
    pending: doc.pending ?? null,
    contacts: doc.contacts,
    messages: doc.messages.slice(-400),
    // urgent first; the page never needs more than a screenful, and "open" above is the true total
    tasks: [...[...open].sort((a, b) => Number(b.urgent) - Number(a.urgent)).slice(0, 150), ...doc.tasks.filter((t) => t.status !== "open").slice(0, 40)],
    openTotal: open.length,
    team: ctx.fleet.crew.filter((c) => c.status === "active").map((c) => ({ id: c.id, name: c.name, phone: c.phone, whatsappOk: !!c.whatsappOk })),
  });
}

const phone = z.string().max(25).transform(toDigits).refine(validWa, "That doesn't look like a full phone number");
const Body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("toggle"), enabled: z.boolean() }),
  z.object({ op: z.literal("settings"), staffAutoUpdates: z.boolean() }),
  z.object({ op: z.literal("task"), id: z.string().max(80), status: z.enum(["open", "done", "dismissed"]) }),
  z.object({ op: z.literal("contact"), phone, bot: z.boolean().optional(), blocked: z.boolean().optional() }),
  z.object({ op: z.literal("delete_contact"), phone }),
  z.object({ op: z.literal("send"), phone, text: z.string().trim().min(1).max(1000) }),
  z.object({ op: z.literal("simulate"), from: phone, text: z.string().trim().min(1).max(1000) }),
  z.object({ op: z.literal("approve"), id: z.string().max(80) }),
  z.object({ op: z.literal("briefing") }),
]);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return crossSite();
  if (!(await ownerSession())) return unauthorized();
  if (limited(`assistant:${clientIp(req)}`, 120, 60_000)) return bad("Slow down a moment.", 429);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Bad request.");
  const b = parsed.data;

  switch (b.op) {
    case "toggle":
      await mutateAssistant((d) => { d.enabled = b.enabled; });
      break;
    case "settings":
      await mutateAssistant((d) => { d.settings.staffAutoUpdates = b.staffAutoUpdates; });
      break;
    case "task":
      await mutateAssistant((d) => {
        const t = d.tasks.find((x) => x.id === b.id);
        if (!t) return;
        t.status = b.status;
        t.resolvedAt = b.status === "open" ? undefined : new Date().toISOString();
      });
      break;
    case "contact":
      await mutateAssistant((d) => {
        const c = findContact(d, b.phone);
        if (!c) return;
        if (b.bot !== undefined) c.bot = b.bot;
        if (b.blocked !== undefined) c.blocked = b.blocked || undefined;
      });
      break;
    case "delete_contact":
      await mutateAssistant((d) => {
        // an opt-out is remembered even when the conversation is deleted
        d.contacts = d.contacts.flatMap((c) => (c.phone !== b.phone ? [c] : c.blocked ? [{ phone: c.phone, kind: "unknown" as const, bot: true, blocked: true, createdAt: c.createdAt }] : []));
        d.messages = d.messages.filter((m) => m.phone !== b.phone);
        d.tasks = d.tasks.filter((t) => t.phone !== b.phone);
      });
      break;
    case "send": {
      const doc = await loadAssistant();
      const known = findContact(doc, b.phone);
      if (!known?.lastInboundAt) return bad("That number hasn't messaged us, so you can't message it from here.");
      if (known.blocked) return bad("They asked us to stop messaging them. Press \"Allow replies\" first if that changes.", 409);
      const r = await deliver(b.phone, b.text, "owner");
      if (r === "failed" || r === "skipped") return bad("Not delivered. WhatsApp only lets us message people within 24 hours of their last message to us.", 409);
      await mutateAssistant((d) => { ensureContact(d, b.phone).bot = false; }); // he's stepped in: the assistant stays quiet
      break;
    }
    case "simulate": {
      // runs the real assistant, but nothing is sent to any phone
      const before = (await loadAssistant()).messages.length;
      await dryRun(() => handleInbound({ waId: `sim-${uid("w")}`, from: b.from, at: new Date().toISOString(), type: "text", text: b.text }));
      const after = await loadAssistant();
      return Response.json({ replies: after.messages.slice(before).filter((m) => m.dir === "out" && m.phone === b.from).map((m) => m.text) });
    }
    case "approve": {
      const msg = await execute(await loadCtx(), dashboardIo(), { type: "approve_expense", taskId: b.id });
      return msg.startsWith("Done") ? Response.json({ ok: true, message: msg }) : bad(msg.replace(/^Couldn't: /, ""), 409);
    }
    case "briefing": {
      const r = await sendOwnerBriefingNow();
      if (r === "no-number") return bad("Add your mobile number under Quote prices first.");
      if (r === "not-delivered") return bad("WhatsApp couldn't deliver it. Send the business number a message first (that opens a 24-hour window), then try again.", 409);
      break;
    }
  }
  return Response.json({ ok: true });
}
