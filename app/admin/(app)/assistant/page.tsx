"use client";

import { useRouter } from "next/navigation";
import { Bot, Check, CircleAlert, MessageCircle, Send, ShieldOff, Trash2, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, CardHeader, Empty, Field, FormError, Input, PageHeader, Segmented, Select, Textarea } from "@/components/admin/ui";
import { fmtDateTime } from "@/lib/ops/format";
import type { Contact, Msg, Pending, Task } from "@/lib/assistant/types";

type Config = { whatsapp: boolean; receiving: boolean; ai: boolean; model: string; aiToday: number; aiCap: number; template: boolean; cron: boolean; ownerPhone: string; webhookUrl: string };
type State = { openTotal: number; config: Config; enabled: boolean; settings: { staffAutoUpdates: boolean }; pending: Pending | null; contacts: Contact[]; messages: Msg[]; tasks: Task[]; team: { id: string; name: string; phone: string; whatsappOk: boolean }[] };

const TEST_CUSTOMER = "447700900999";
const kindLabel: Record<string, string> = { enquiry: "Enquiry", supplier: "Supplier", reschedule: "Reschedule", complaint: "Complaint", urgent: "Urgent", van_issue: "Van", safety: "Safety", late_or_off: "Late or off", time_off: "Time off", materials: "Materials", expense: "Expense", question: "Question", other: "Message" };

async function post(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; replies?: string[] }> {
  try {
    const r = await fetch("/api/admin/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, ...j } : { ok: false, error: j.error ?? "That didn't work. Try again." };
  } catch {
    return { ok: false, error: "No connection. Try again." };
  }
}

export default function AssistantPage() {
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"todo" | "chats" | "try" | "setup">("todo");
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/assistant", { cache: "no-store" });
      if (r.ok) setS(await r.json());
      else if (r.status !== 401) setErr("Couldn't load. Retrying…");
      else router.push("/admin/login");
    } catch {
      setErr("No connection. Retrying…");
    }
  }, [router]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => !document.hidden && void load(), 10_000);
    const v = () => !document.hidden && void load();
    document.addEventListener("visibilitychange", v);
    return () => { clearTimeout(first); clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [load]);

  async function act(body: Record<string, unknown>) {
    setErr("");
    const r = await post(body);
    if (!r.ok) setErr(r.error ?? "");
    await load();
    window.dispatchEvent(new Event("assistant:changed")); // refreshes the menu badge
    return r;
  }

  if (!s) return <div className="py-16 text-center text-sm text-steel">{err || "Loading…"}</div>;
  const open = s.tasks.filter((t) => t.status === "open");
  const c = s.config;

  return (
    <div className="space-y-4">
      <PageHeader
        title="WhatsApp assistant"
        sub="One number for customers, suppliers, your team and you. It answers, reminds, and keeps the system up to date."
        actions={
          <Button variant={s.enabled ? "secondary" : "primary"} onClick={() => void act({ op: "toggle", enabled: !s.enabled })}>
            {s.enabled ? "Switch assistant off" : "Switch assistant on"}
          </Button>
        }
      />
      {!c.whatsapp && (
        <div role="note" className="rounded-2xl border border-gold/70 bg-amber-50 p-3 text-sm text-night">
          <b>Demo mode.</b> No WhatsApp number is connected yet, so nothing goes to a real phone. Use <b>Try it</b> to see exactly how it behaves, then follow <b>Set up</b> to connect your number.
        </div>
      )}
      {!s.enabled && <div role="alert" className="rounded-2xl border border-brand bg-brand-tint p-3 text-sm text-brand">The assistant is <b>off</b>: it won&rsquo;t reply to customers or the team. Messages still arrive here for you.</div>}
      {err && <FormError>{err}</FormError>}

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "todo", label: "Needs you", count: s.openTotal },
          { value: "chats", label: "Conversations" },
          { value: "try", label: "Try it" },
          { value: "setup", label: "Set up" },
        ]}
      />

      {tab === "todo" && <Todo s={s} open={open} act={act} />}
      {tab === "chats" && <Chats s={s} act={act} />}
      {tab === "try" && <TryIt s={s} onDone={load} />}
      {tab === "setup" && <Setup s={s} act={act} />}
    </div>
  );
}

function Todo({ s, open, act: rawAct }: { s: State; open: Task[]; act: (b: Record<string, unknown>) => Promise<{ ok: boolean }> }) {
  const [reply, setReply] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [working, setWorking] = useState(false);
  // one press at a time, so a double tap can't act twice
  const act = async (b: Record<string, unknown>) => {
    if (working) return { ok: false };
    setWorking(true);
    try {
      return await rawAct(b);
    } finally {
      setWorking(false);
    }
  };
  const done = s.tasks.filter((t) => t.status !== "open").slice(0, 8);
  const sorted = [...open].sort((a, b) => Number(b.urgent) - Number(a.urgent));

  async function send(t: Task) {
    if (!reply?.text.trim()) return;
    setBusy(t.id);
    const r = await act({ op: "send", phone: t.phone, text: reply.text });
    setBusy("");
    if (r.ok) setReply(null);
  }

  return (
    <div className="space-y-4">
      {s.pending && (
        <Card className="p-4">
          <p className="text-sm font-semibold text-night">Waiting for your YES on WhatsApp</p>
          <ul className="mt-1 list-decimal pl-5 text-sm text-steel">{s.pending.summary.map((l, i) => <li key={i} className="whitespace-pre-line break-words [overflow-wrap:anywhere]">{l}</li>)}</ul>
        </Card>
      )}
      <Card>
        <CardHeader title="Needs you" sub={open.length ? `${s.openTotal} open${s.openTotal > open.length ? ` (showing the ${open.length} most urgent)` : ""}` : "All clear"} />
        {sorted.length === 0 && <Empty>Nothing waiting. New enquiries, supplier messages and team issues show up here and on your WhatsApp.</Empty>}
        <ul className="divide-y divide-edge">
          {sorted.map((t) => (
            <li key={t.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {t.urgent && <Badge tone="red" dot>Urgent</Badge>}
                {!(t.kind === "urgent" && t.urgent) && <Badge tone={t.role === "staff" ? "violet" : t.kind === "supplier" ? "blue" : "slate"}>{t.role === "staff" ? "Team" : kindLabel[t.kind] ?? "Message"}</Badge>}
                <span className="min-w-0 break-words font-semibold text-night [overflow-wrap:anywhere]">{t.who}</span>
                <span className="text-xs text-steel">{fmtDateTime(t.at)}</span>
              </div>
              <p className="whitespace-pre-line break-words text-sm text-night [overflow-wrap:anywhere]">{t.summary}</p>
              {t.detail && <p className="text-xs text-steel">{Object.entries(t.detail).map(([k, v]) => `${k.replace("_", " ")}: ${v}`).join(" · ")}</p>}
              {t.expense && <p className="text-xs font-semibold text-night">Expense claim: £{t.expense.amount.toFixed(2)} (nothing is paid or recorded until you approve)</p>}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={working} onClick={() => setReply(reply?.id === t.id ? null : { id: t.id, text: "" })}><Send size={14} aria-hidden /> Reply</Button>
                {t.expense && <Button size="sm" variant="secondary" disabled={working} onClick={() => void act({ op: "approve", id: t.id })}><Check size={14} aria-hidden /> Approve £{t.expense.amount.toFixed(2)}</Button>}
                <Button size="sm" variant="secondary" disabled={working} onClick={() => void act({ op: "task", id: t.id, status: "done" })}><Check size={14} aria-hidden /> Done</Button>
                <Button size="sm" variant="ghost" disabled={working} onClick={() => void act({ op: "task", id: t.id, status: "dismissed" })}>Dismiss</Button>
              </div>
              {reply?.id === t.id && (
                <div className="flex gap-2">
                  <Textarea autoFocus aria-label={`Reply to ${t.who}`} value={reply.text} maxLength={1000} onChange={(e) => setReply({ id: t.id, text: e.target.value })} placeholder="Type your reply. It goes from the business number." className="min-h-20" />
                  <Button onClick={() => void send(t)} disabled={busy === t.id || !reply.text.trim()}>Send</Button>
                </div>
              )}
              {reply?.id === t.id && <p className="text-xs text-steel">Sending a reply from here puts that conversation in your hands: the assistant stops replying to them until you hand it back.</p>}
            </li>
          ))}
        </ul>
      </Card>
      {done.length > 0 && (
        <Card>
          <CardHeader title="Recently handled" />
          <ul className="divide-y divide-edge text-sm">
            {done.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate text-steel"><b className="text-night">{t.who}</b> · {t.summary}</span>
                <button type="button" disabled={working} className="inline-flex min-h-10 shrink-0 items-center px-2 text-xs font-semibold text-brand hover:underline disabled:opacity-50" onClick={() => void act({ op: "task", id: t.id, status: "open" })}>Reopen</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Chats({ s, act }: { s: State; act: (b: Record<string, unknown>) => Promise<{ ok: boolean }> }) {
  const last = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of s.messages) m.set(x.phone, x.at);
    return m;
  }, [s.messages]);
  const list = [...s.contacts].filter((c) => last.has(c.phone)).sort((a, b) => ((last.get(b.phone) ?? "") > (last.get(a.phone) ?? "") ? 1 : -1));
  const [sel, setSel] = useState("");
  const phone = list.some((x) => x.phone === sel) ? sel : list[0]?.phone || "";
  const c = s.contacts.find((x) => x.phone === phone);
  const thread = s.messages.filter((m) => m.phone === phone);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [thread.length, phone]);

  if (!list.length) return <Card><Empty>No conversations yet. They appear here as soon as someone messages the business number.</Empty></Card>;
  const who = (x: Contact) => x.name ?? `+${x.phone}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      <Card className="max-h-[32rem] overflow-y-auto">
        <ul className="divide-y divide-edge">
          {list.map((x) => (
            <li key={x.phone}>
              <button type="button" onClick={() => { setSel(x.phone); if (window.innerWidth < 1024) setTimeout(() => threadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} aria-current={x.phone === phone} className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-silver-soft ${x.phone === phone ? "bg-silver-soft" : ""}`}>
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-night text-xs font-bold text-white">{who(x).replace("+", "").slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-night">{who(x)}</span>
                  <span className="block truncate text-xs text-steel">{x.kind === "staff" ? "Team" : x.kind === "unknown" ? "New contact" : x.kind}{!x.bot ? " · you" : ""}{x.blocked ? " · stopped" : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {c && (
        <Card className="flex min-h-[24rem] scroll-mt-20 flex-col"><div ref={threadRef} />
          <CardHeader
            title={who(c)}
            sub={<span className="break-all">{`+${c.phone}${c.kind !== "unknown" ? ` · ${c.kind === "staff" ? "team" : c.kind}` : ""}`}</span>}
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void act({ op: "contact", phone: c.phone, bot: !c.bot })}>
                  {c.bot ? <><UserRound size={14} aria-hidden /> Take over</> : <><Bot size={14} aria-hidden /> Hand back to assistant</>}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void act({ op: "contact", phone: c.phone, blocked: !c.blocked })}><ShieldOff size={14} aria-hidden /> {c.blocked ? "Allow replies" : "Stop replies"}</Button>
                <Button size="sm" variant="danger" onClick={() => { if (confirm(`Delete this whole conversation with ${who(c)}? This can't be undone.`)) void act({ op: "delete_contact", phone: c.phone }); }}><Trash2 size={14} aria-hidden /> Delete</Button>
              </div>
            }
          />
          <div className="flex-1 space-y-2 overflow-y-auto p-4" style={{ maxHeight: "26rem" }}>
            {thread.map((m) => (
              <div key={m.id} className={`flex ${m.dir === "out" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.dir === "out" ? (m.by === "owner" ? "bg-night text-white" : "bg-brand-tint text-night") : "bg-silver-soft text-night"}`}>
                  <p className="whitespace-pre-line break-words">{m.text}</p>
                  <p className={`mt-1 text-[11px] ${m.by === "owner" ? "text-white/75" : "text-steel"}`}>
                    {m.dir === "out" ? (m.by === "owner" ? "You" : "Assistant") : "Them"} · {fmtDateTime(m.at)}
                    {m.delivery === "demo" ? " · demo (not sent)" : m.delivery === "failed" ? " · NOT delivered" : m.delivery === "skipped" ? " · not sent" : ""}
                  </p>
                </div>
              </div>
            ))}
            <div ref={end} />
          </div>
          <form
            className="flex gap-2 border-t border-edge p-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!text.trim()) return;
              const r = await act({ op: "send", phone: c.phone, text });
              if (r.ok) setText("");
            }}
          >
            <Input aria-label="Message" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Reply as the business (the assistant then stays quiet)" />
            <Button type="submit" disabled={!text.trim()}><Send size={16} aria-hidden /><span className="sr-only">Send</span></Button>
          </form>
        </Card>
      )}
    </div>
  );
}

function TryIt({ s, onDone }: { s: State; onDone: () => void }) {
  const people = [
    { value: TEST_CUSTOMER, label: "A customer (test number)" },
    ...(s.config.ownerPhone ? [{ value: s.config.ownerPhone.replace(/\D/g, ""), label: "You (Jamie)" }] : []),
    ...s.team.filter((t) => t.phone).map((t) => ({ value: t.phone, label: `${t.name} (team)` })),
  ];
  const [from, setFrom] = useState(people[0].value);
  const [text, setText] = useState("");
  const [log, setLog] = useState<{ q: string; a: string[] }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setErr("");
    const r = await post({ op: "simulate", from, text });
    setBusy(false);
    if (!r.ok) return setErr(r.error ?? "");
    setLog((l) => [...l, { q: text, a: r.replies?.length ? r.replies : ["(no reply: the assistant stays quiet in this case)"] }]);
    setText("");
    onDone();
  }

  return (
    <Card className="space-y-3 p-4">
      <p className="text-sm text-steel">Send a pretend message and see how the real assistant answers. <b className="text-night">Nothing is sent to any phone.</b> Anything it records (a customer enquiry, a team issue, a job started) is real, so use the test customer, or delete the test conversation afterwards. As Jamie, changes still wait for a YES, so you can type &ldquo;yes&rdquo; to try it.</p>
      <form onSubmit={run} className="grid gap-3 sm:grid-cols-[14rem_1fr_auto] sm:items-end">
        <Field label="Message as"><Select value={from} onChange={(e) => setFrom(e.target.value)}>{people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</Select></Field>
        <Field label="Message"><Input value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="e.g. Hi, I've got a leak in my roof in Dumfries" /></Field>
        <Button type="submit" disabled={busy || !text.trim()}>{busy ? "Thinking…" : "Send"}</Button>
      </form>
      {err && <FormError>{err}</FormError>}
      <div className="space-y-3">
        {log.map((x, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-start"><p className="max-w-[85%] whitespace-pre-line break-words rounded-2xl bg-silver-soft px-3 py-2 text-sm [overflow-wrap:anywhere]">{x.q}</p></div>
            {x.a.map((a, j) => <div key={j} className="flex justify-end"><p className="max-w-[85%] whitespace-pre-line break-words rounded-2xl bg-brand-tint px-3 py-2 text-sm [overflow-wrap:anywhere]">{a}</p></div>)}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Setup({ s, act }: { s: State; act: (b: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }> }) {
  const c = s.config;
  const [note, setNote] = useState("");
  const rows: { ok: boolean; label: string; help: string; optional?: boolean }[] = [
    { ok: c.whatsapp, label: "WhatsApp number connected", help: "Sending: WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in the host settings." },
    { ok: c.receiving, label: "Incoming messages switched on", help: "Receiving: WHATSAPP_APP_SECRET and WHATSAPP_VERIFY_TOKEN, and the address below pasted into Meta." },
    { ok: !!c.ownerPhone, label: "Your own mobile number is saved", help: "Under Quote prices > Your mobile. Messages from this number are treated as you." },
    { ok: c.ai, label: `AI switched on (${c.model})`, help: "ANTHROPIC_API_KEY. Without it the assistant still works with simple rules but understands far less." },
    { ok: c.cron, label: "Morning briefing and reminders scheduled", help: "CRON_SECRET in the host settings. Runs once a day at about 7am." },
    { ok: c.template, label: "Reminder template", help: "WHATSAPP_TEMPLATE_NAME. WhatsApp only lets us message someone first with an approved template. Without one, morning reminders and alerts reach only people who messaged the business number in the last 24 hours (urgent alerts to you also go by text).", optional: true },
  ];
  const withReminders = s.team.filter((t) => t.whatsappOk).length;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Checklist" sub="Add the missing items in your host's settings (Vercel > Settings > Environment Variables), then redeploy." />
        <ul className="divide-y divide-edge">
          {rows.map((r) => (
            <li key={r.label} className="flex items-start gap-3 px-4 py-3 text-sm">
              {r.ok ? <Check size={18} className="mt-0.5 shrink-0 text-emerald-700" aria-label="Done" /> : <CircleAlert size={18} className={`mt-0.5 shrink-0 ${r.optional ? "text-steel" : "text-amber-700"}`} aria-label="Missing" />}
              <span><b className="text-night">{r.label}</b><span className="block text-xs text-steel">{r.help}</span></span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="space-y-2 p-4 text-sm">
        <p className="font-semibold text-night">Address to give Meta (WhatsApp &gt; Configuration &gt; Webhook)</p>
        <code className="block break-all rounded-lg bg-silver-soft p-2 text-xs">{c.webhookUrl}</code>
        <p className="text-xs text-steel">Callback URL as above; Verify token = your WHATSAPP_VERIFY_TOKEN; subscribe to the <b>messages</b> field.</p>
      </Card>
      <Card className="space-y-3 p-4 text-sm">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={s.settings.staffAutoUpdates} onChange={(e) => void act({ op: "settings", staffAutoUpdates: e.target.checked })} className="mt-0.5 h-4 w-4 shrink-0 accent-[#b11017]" />
          <span><b className="text-night">Let the team update jobs and mileage themselves</b><span className="block text-xs text-steel">When someone messages &ldquo;started the Kirkconnel job&rdquo; or &ldquo;SV68 LDG is on 84,210&rdquo;, the schedule and van are updated straight away. Off = it goes to you as a message to action.</span></span>
        </label>
        <p className="text-xs text-steel">{withReminders} of {s.team.length} team members get daily WhatsApp reminders (switch this on per person under Team &gt; Edit).</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={async () => { const r = await act({ op: "briefing" }); setNote(r.ok ? "Briefing sent to your WhatsApp." : r.error ?? ""); }}><MessageCircle size={16} aria-hidden /> Send me today&rsquo;s briefing now</Button>
          {note && <span role="status" className="text-xs text-steel">{note}</span>}
        </div>
        <p className="text-xs text-steel">AI replies today: {c.aiToday} of {c.aiCap}. Conversations and finished tasks are deleted after 90 days.</p>
      </Card>
    </div>
  );
}
