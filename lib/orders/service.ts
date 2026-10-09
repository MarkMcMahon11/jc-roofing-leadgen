// Materials orders, server side: validation, sending to the supplier, and the supplier's one-tap answer.
// Every write goes through mutateProcurement (a checked write); nothing is sent from inside it.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { BUSINESS } from "@/lib/config";
import { formatPostcode, normalisePhone, UK_POSTCODE, validEmail } from "@/lib/format";
import { alertOwner, emailSupplier, textSupplier, type SendStatus } from "@/lib/notify";
import { loadFleet } from "@/lib/server/fleet";
import { getLeads, getProcurementDoc, getSettings, isNoWrite, mutateProcurementDoc, noWrite } from "@/lib/store";
import { addDays, fmtDay, today, uid } from "@/lib/ops/format";
import { CAPS, emptyProcurement, WINDOW_LABEL, type Order, type Procurement, type Supplier } from "./types";

export const loadProcurement = async (): Promise<Procurement> => {
  const d = await getProcurementDoc<Procurement | null>(null);
  return d ? { ...emptyProcurement(), ...d } : emptyProcurement();
};
const EXPIRE_OPEN_DAYS = 60;

/** Checked write. Return `noWrite(x)` from `fn` when nothing changed: nothing is saved and the revision doesn't move. */
export const mutateProcurement = <R>(fn: (d: Procurement) => R | ReturnType<typeof noWrite<R>>) =>
  mutateProcurementDoc<Procurement, R>(emptyProcurement, (d) => {
    d.suppliers ??= [];
    d.orders ??= [];
    d.seq ??= 0;
    const r = fn(d);
    if (isNoWrite(r)) return r as ReturnType<typeof noWrite<R>>;
    d.rev += 1;
    // an order nobody has answered or closed for 60 days is closed for them (the supplier's link has expired by then)
    for (const o of d.orders) {
      if ((o.status === "sent" || o.status === "failed") && Date.now() - Date.parse(o.createdAt) > EXPIRE_OPEN_DAYS * 86_400_000) {
        o.status = "cancelled";
        addLog(o, "Closed automatically: nobody answered in 60 days");
      }
    }
    if (d.orders.length > CAPS.orders) {
      // drop the oldest finished orders first, never one still waiting on a supplier
      const done = d.orders.filter((o) => ["delivered", "cancelled", "declined"].includes(o.status)).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      for (const o of done) {
        if (d.orders.length <= CAPS.orders) break;
        d.orders.splice(d.orders.indexOf(o), 1);
      }
    }
    return r;
  });

/** Where the supplier's link points: SITE_URL if the owner set it, else the address the request came in on, else the Vercel production domain. */
export function publicBase(req?: Request): string {
  const env = process.env.SITE_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  // the supplier's link must open for anyone, so on Vercel use the public production address (preview addresses ask for a Vercel sign-in)
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod}`;
  if (req) {
    const h = req.headers;
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  }
  return "https://www.jcroofingdumfries.com";
}

const realDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "That isn't a real calendar date");

const text = (max: number) => z.string().trim().max(max);
const plain = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/https?:\/\/\S+|www\.\S+/gi, "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
/** Trim, cap, clean (links and tags removed), THEN require something to be left. */
const clean = (max: number, min: number, msg: string) => z.string().max(max * 3).transform(plain).pipe(z.string().min(min, msg).max(max, `That is too long (up to ${max} characters)`));
const cleanOpt = (max: number) => z.string().max(max * 3).transform(plain).pipe(z.string().max(max)).optional().transform((v) => v || undefined);

export const SupplierInput = z.object({
  id: z.string().max(60).optional(),
  name: text(80).min(1, "Enter the supplier's name"),
  email: text(254).optional().transform((v) => v || undefined),
  phone: text(30).optional().transform((v) => v || undefined),
  contact: text(80).optional().transform((v) => v || undefined),
  account: text(40).optional().transform((v) => v || undefined),
  notes: text(300).optional().transform((v) => v || undefined),
  active: z.boolean().default(true),
});

export const OrderInput = z.object({
  clientId: z.string().max(60).optional(),
  supplierId: z.string().max(60),
  site: z.object({
    name: clean(80, 1, "Give the site a short name"),
    address: clean(200, 5, "Enter the delivery address"),
    postcode: text(10).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    jobId: z.string().max(80).optional(),
    leadId: z.string().max(80).optional(),
  }),
  items: z
    .array(
      z.object({
        description: clean(120, 1, "Describe each material"),
        qty: z.number("Enter a quantity").max(100000, "That quantity is too large").transform((q) => Math.round(q * 100) / 100).pipe(z.number().min(0.01, "Quantity must be at least 0.01")),
        unit: clean(20, 1, "Add a unit for each material").default("pcs"),
      }),
    )
    .min(1, "Add at least one material")
    .max(20, "Up to 20 lines per order"),
  deliverBy: realDate,
  window: z.enum(["morning", "afternoon", "any"]).default("any"),
  contactName: cleanOpt(60),
  contactPhone: text(30).optional(),
  notes: cleanOpt(500),
});
export type OrderInputT = z.infer<typeof OrderInput>;

const firstIssue = (e: z.ZodError) => {
  const i = e.issues[0];
  if (!i) return "Check the details and try again.";
  // our own messages read well; zod's stock ones ("Invalid string: must match pattern...") don't
  if (!/^(Invalid|Too (big|small)|Expected)/i.test(i.message)) return i.message;
  const where = i.path.filter((p) => typeof p === "string").map(String).join(" ").replace(/([A-Z])/g, " $1").toLowerCase();
  return `Check ${where ? `the ${where}` : "the details"} and try again.`;
};

export function validateSupplier(raw: unknown): { ok: true; value: z.infer<typeof SupplierInput> } | { ok: false; error: string } {
  const p = SupplierInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  const v = p.data;
  if (v.email && !validEmail(v.email)) return { ok: false, error: "That email address doesn't look right." };
  if (v.phone && !normalisePhone(v.phone)) return { ok: false, error: "That mobile number doesn't look right." };
  if (!v.email && !v.phone) return { ok: false, error: "Add an email address or a mobile number so we can send them orders." };
  return { ok: true, value: { ...v, name: plain(v.name), ...(v.contact ? { contact: plain(v.contact) } : {}), ...(v.account ? { account: plain(v.account) } : {}), ...(v.notes ? { notes: v.notes } : {}), ...(v.phone ? { phone: normalisePhone(v.phone)! } : {}) } };
}

export async function saveSupplier(raw: unknown): Promise<{ ok: true; supplier: Supplier } | { ok: false; error: string }> {
  const v = validateSupplier(raw);
  if (!v.ok) return v;
  type R = { ok: true; supplier: Supplier } | { ok: false; error: string };
  return mutateProcurement<R>((d) => {
    const dup = d.suppliers.find((s) => s.name.toLowerCase() === v.value.name.toLowerCase() && s.id !== v.value.id);
    if (dup) return noWrite<R>({ ok: false, error: `You already have a supplier called ${dup.name}.` });
    if (v.value.id) {
      const i = d.suppliers.findIndex((s) => s.id === v.value.id);
      if (i < 0) return noWrite<R>({ ok: false, error: "That supplier no longer exists." });
      d.suppliers[i] = { ...v.value, id: v.value.id };
      for (const o of d.orders) if (o.supplierId === v.value.id) o.supplierName = v.value.name;
      return { ok: true, supplier: d.suppliers[i] };
    }
    if (d.suppliers.length >= CAPS.suppliers) return noWrite<R>({ ok: false, error: "That's the most suppliers we can keep. Remove one you don't use." });
    const s: Supplier = { ...v.value, id: uid("sup") };
    d.suppliers.push(s);
    return { ok: true, supplier: s };
  });
}

export async function deleteSupplier(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  type R = { ok: true } | { ok: false; error: string };
  return mutateProcurement<R>((d) => {
    if (d.orders.some((o) => o.supplierId === id && ["sent", "confirmed", "failed", "declined"].includes(o.status))) return noWrite<R>({ ok: false, error: "They have an open order. Mark it delivered or cancel it first." });
    if (!d.suppliers.some((s) => s.id === id)) return noWrite<R>({ ok: true });
    d.suppliers = d.suppliers.filter((s) => s.id !== id);
    return { ok: true };
  });
}

// ---------- wording ----------
const mapLink = (o: Order) => {
  const q = typeof o.site.lat === "number" && typeof o.site.lng === "number" ? `${o.site.lat},${o.site.lng}` : encodeURIComponent(`${o.site.address} ${o.site.postcode ?? ""}`.trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
};
const itemLine = (i: Order["items"][number]) => `- ${i.qty} ${i.unit}: ${i.description}`;
const where = (o: Order) => `${o.site.address}${o.site.postcode && !o.site.address.toUpperCase().includes(o.site.postcode.toUpperCase()) ? `, ${o.site.postcode}` : ""}`;

export const supplierLink = (base: string, o: Order) => `${base}/supplier/order/${o.token}`;

export function emailBody(o: Order, s: Supplier, base: string, cancelled = false): { subject: string; body: string } {
  const hello = `Hello ${s.contact || s.name},`;
  if (cancelled) return { subject: `CANCELLED: delivery request ${o.ref} (${o.site.name})`, body: `${hello}\n\nPlease cancel delivery request ${o.ref} for ${o.site.name} (${where(o)}). Sorry for the change.\n\n${BUSINESS.name}\n${BUSINESS.phone}` };
  const body = [
    hello,
    "",
    `Please can you supply and deliver the following to our site.`,
    "",
    `Order ref: ${o.ref}${s.account ? `   (our account: ${s.account})` : ""}`,
    `Deliver to: ${o.site.name}, ${where(o)}`,
    `Map: ${mapLink(o)}`,
    `Deliver by: ${fmtDay(o.deliverBy)} · ${WINDOW_LABEL[o.window]}`,
    o.contactName || o.contactPhone ? `On site contact: ${[o.contactName, o.contactPhone].filter(Boolean).join(" ")}` : "",
    "",
    "Materials:",
    ...o.items.map(itemLine),
    o.notes ? `\nNotes: ${o.notes}` : "",
    "",
    "Please confirm you can deliver (or tell us if you can't) with one tap:",
    supplierLink(base, o),
    "",
    `Or reply to this email or call ${BUSINESS.phone}. Please quote ${o.ref} on the delivery note and invoice.`,
    "",
    "Thanks,",
    BUSINESS.name,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return { subject: `Delivery request ${o.ref}: ${o.site.name} by ${fmtDay(o.deliverBy)}`, body };
}

const smsBody = (o: Order, base: string) => {
  // the link goes last and is never cut: shorten the wording in front of it instead
  const link = supplierLink(base, o);
  const head = `${BUSINESS.name} delivery request ${o.ref}: ${o.items.length} item${o.items.length === 1 ? "" : "s"} to ${o.site.address.split(",").slice(0, 2).join(",")} by ${fmtDay(o.deliverBy)}. Details and confirm: `;
  const room = Math.max(20, 300 - link.length);
  return `${head.length > room ? head.slice(0, room - 2).trimEnd() + "… " : head}${link}`;
};

async function sendTo(o: Order, s: Supplier, base: string, cancelled = false) {
  const settings = await getSettings();
  const out: Order["sends"] = [];
  const at = new Date().toISOString();
  const lead = o.site.leadId ?? o.msgLeadId ?? "";
  if (s.email) {
    const m = emailBody(o, s, base, cancelled);
    out.push({ at, channel: "email", to: s.email, result: (await emailSupplier(s.email, m.subject, m.body, lead, settings.ownerEmail || BUSINESS.email)) as SendStatus });
  }
  if (s.phone) {
    const t = cancelled ? `${BUSINESS.name}: please cancel delivery request ${o.ref} (${o.site.name}). Sorry for the change.` : smsBody(o, base);
    out.push({ at, channel: "sms", to: s.phone, result: (await textSupplier(s.phone, t, lead)) as SendStatus });
  }
  return out;
}

const summary = (sends: Order["sends"]) => (sends.length ? sends.map((s) => `${s.channel === "email" ? "email" : "text"} ${s.result === "sent" ? "sent" : s.result === "preview" ? "previewed (not switched on yet)" : "FAILED"}`).join(", ") : "nothing sent");
const allFailed = (sends: Order["sends"]) => sends.length > 0 && sends.every((s) => s.result === "failed");

const addLog = (o: Order, t: string) => {
  o.log.push({ at: new Date().toISOString(), text: t });
  if (o.log.length > CAPS.log) o.log.splice(0, o.log.length - CAPS.log);
};

// ---------- create / resend / status ----------
export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Everything about an order that can be checked without touching data. Used by the dashboard, WhatsApp proposals and createOrder. */
export function checkOrderInput(raw: unknown): Result<{ value: OrderInputT; postcode?: string; phone?: string }> {
  const p = OrderInput.safeParse(raw);
  if (!p.success) return { ok: false, error: firstIssue(p.error) };
  const v = p.data;
  const t = today();
  if (v.deliverBy < t) return { ok: false, error: "The delivery date has already passed." };
  if (v.deliverBy > addDays(t, 365)) return { ok: false, error: "That delivery date is too far ahead." };
  const pc = v.site.postcode?.replace(/\s+/g, " ").trim();
  if (pc && !UK_POSTCODE.test(pc)) return { ok: false, error: "That postcode doesn't look right." };
  let phone: string | undefined;
  if (v.contactPhone) {
    phone = normalisePhone(v.contactPhone.replace(/\(0\)/g, "")) ?? undefined;
    if (!phone) return { ok: false, error: "The on-site contact's number doesn't look right." };
  }
  return { ok: true, value: v, ...(pc ? { postcode: pc } : {}), ...(phone ? { phone } : {}) };
}

export async function createOrder(raw: unknown, opts: { base: string; by: Order["by"] }): Promise<Result<{ order: Order; duplicate?: boolean }>> {
  const checked = checkOrderInput(raw);
  if (!checked.ok) return checked;
  const { value: v, postcode: pc, phone } = checked;
  // the site must be a real job or enquiry if one is named
  let leadForMessages = v.site.leadId;
  if (v.site.jobId || v.site.leadId) {
    const [fleet, leads] = await Promise.all([v.site.jobId ? loadFleet() : null, v.site.leadId ? getLeads().catch(() => []) : null]);
    const job = fleet?.jobs.find((j) => j.id === v.site.jobId);
    if (v.site.jobId && !job) return { ok: false, error: "That job no longer exists." };
    if (v.site.leadId && !leads?.some((l) => l.id === v.site.leadId)) return { ok: false, error: "That enquiry no longer exists." };
    leadForMessages ??= job?.leadId; // the supplier's messages go when the customer's enquiry is erased
  }
  const token = makeToken();
  type Created = { kind: "dup"; order: Order; supplier?: Supplier } | { kind: "err"; error: string } | { kind: "ok"; order: Order; supplier?: Supplier };
  const created = await mutateProcurement<Created>((d) => {
    if (v.clientId) {
      const dup = d.orders.find((o) => o.clientId === v.clientId);
      if (dup) return noWrite<Created>({ kind: "dup", order: structuredClone(dup), supplier: d.suppliers.find((s) => s.id === dup.supplierId) });
    }
    const s = d.suppliers.find((x) => x.id === v.supplierId);
    if (!s || !s.active) return noWrite<Created>({ kind: "err", error: "Choose a supplier." });
    if (!s.email && !s.phone) return noWrite<Created>({ kind: "err", error: `${s.name} has no email or mobile saved, so we can't send the order.` });
    if (d.orders.filter((o) => Date.now() - Date.parse(o.createdAt) < 3_600_000).length >= CAPS.perHour) return noWrite<Created>({ kind: "err", error: "That's a lot of orders in an hour. Wait a little and try again." });
    d.seq += 1;
    const o: Order = {
      id: uid("ord"),
      ref: `JC-${String(d.seq).padStart(4, "0")}`,
      ...(v.clientId ? { clientId: v.clientId } : {}),
      ...(leadForMessages && !v.site.leadId ? { msgLeadId: leadForMessages } : {}),
      createdAt: new Date().toISOString(),
      by: opts.by,
      token,
      supplierId: s.id,
      supplierName: s.name,
      site: { name: v.site.name, address: v.site.address, ...(pc ? { postcode: formatPostcode(pc) } : {}), ...(typeof v.site.lat === "number" && typeof v.site.lng === "number" ? { lat: Math.round(v.site.lat * 1e5) / 1e5, lng: Math.round(v.site.lng * 1e5) / 1e5 } : {}), ...(v.site.jobId ? { jobId: v.site.jobId } : {}), ...(v.site.leadId ? { leadId: v.site.leadId } : {}) },
      items: v.items.map((i) => ({ description: i.description, qty: i.qty, unit: i.unit })),
      deliverBy: v.deliverBy,
      window: v.window,
      ...(v.contactName ? { contactName: v.contactName } : {}),
      ...(phone ? { contactPhone: phone } : {}),
      ...(v.notes ? { notes: plain(v.notes) } : {}),
      status: "sent",
      sends: [],
      log: [],
    };
    addLog(o, opts.by === "whatsapp" ? "Created from WhatsApp" : "Created on the dashboard");
    d.orders.unshift(o);
    return { kind: "ok", order: structuredClone(o), supplier: structuredClone(s) };
  });
  if (created.kind === "err") return { ok: false, error: created.error };
  if (created.kind === "dup") return { ok: true, order: created.order, duplicate: true };
  const sends = await sendTo(created.order, created.supplier!, opts.base);
  const final = await mutateProcurement((d) => {
    const o = d.orders.find((x) => x.id === created.order.id)!;
    o.sends.push(...sends);
    if (allFailed(sends)) o.status = "failed";
    addLog(o, `Sent to ${o.supplierName}: ${summary(sends)}`);
    return structuredClone(o);
  });
  return { ok: true, order: final };
}

export async function resendOrder(id: string, base: string): Promise<Result<{ order: Order }>> {
  const cur = await loadProcurement();
  const o = cur.orders.find((x) => x.id === id);
  const s = o && cur.suppliers.find((x) => x.id === o.supplierId);
  if (!o) return { ok: false, error: "That order no longer exists." };
  if (!["sent", "failed", "confirmed"].includes(o.status)) return { ok: false, error: "That order is already finished." };
  if (!s || (!s.email && !s.phone)) return { ok: false, error: "The supplier has no email or mobile saved." };
  if (Date.now() - Date.parse(o.createdAt) > EXPIRE_OPEN_DAYS * 86_400_000) return { ok: false, error: "That order is too old to send again (the supplier's link has expired). Cancel it and make a new one." };
  // reserve the slot first (inside the checked write), so ten clicks at once can't send ten times
  const reserved = await mutateProcurement<boolean>((d) => {
    const x = d.orders.find((y) => y.id === id);
    if (!x) return noWrite<boolean>(false);
    x.resends = (x.resends ?? []).filter((t) => Date.now() - Date.parse(t) < 3_600_000);
    if (x.resends.length >= 6) return noWrite<boolean>(false);
    x.resends.push(new Date().toISOString());
    return true;
  });
  if (!reserved) return { ok: false, error: "Already re-sent a few times in the last hour. Give them a little while." };
  const sends = await sendTo(o, s, base);
  const order = await mutateProcurement((d) => {
    const x = d.orders.find((y) => y.id === id)!;
    x.sends.push(...sends);
    if (x.status === "failed" && !allFailed(sends)) x.status = "sent";
    addLog(x, `Sent again: ${summary(sends)}`);
    return structuredClone(x);
  });
  return { ok: true, order };
}

export async function setOrderStatus(id: string, status: "delivered" | "cancelled" | "confirmed", base: string): Promise<Result<{ order: Order }>> {
  const cur = await loadProcurement();
  const o0 = cur.orders.find((x) => x.id === id);
  if (!o0) return { ok: false, error: "That order no longer exists." };
  if (["delivered", "cancelled"].includes(o0.status)) return { ok: false, error: `That order is already ${o0.status}.` };
  if (status === "confirmed" && o0.status === "confirmed") return { ok: false, error: "That order is already confirmed." };
  const r = await mutateProcurement<Order | null>((d) => {
    const o = d.orders.find((x) => x.id === id);
    if (!o || ["delivered", "cancelled"].includes(o.status)) return noWrite<Order | null>(null);
    o.status = status;
    if (status === "confirmed") o.reply = { at: new Date().toISOString(), action: "confirm", date: o.deliverBy, note: "Confirmed by phone" };
    addLog(o, status === "delivered" ? "Marked delivered" : status === "confirmed" ? "Marked confirmed by phone" : "Cancelled");
    return structuredClone(o);
  });
  if (!r) return { ok: false, error: "That order has just changed. Refresh and try again." };
  if (status === "cancelled") {
    const s = cur.suppliers.find((x) => x.id === r.supplierId);
    if (s && o0.status !== "failed" && o0.status !== "declined") {
      const sends = await sendTo(r, s, base, true);
      const order = await mutateProcurement((d) => {
        const x = d.orders.find((y) => y.id === id)!;
        x.sends.push(...sends);
        addLog(x, `Told ${x.supplierName} it's cancelled: ${summary(sends)}`);
        return structuredClone(x);
      });
      return { ok: true, order };
    }
  }
  return { ok: true, order: r };
}

// ---------- the supplier's answer ----------
// A supplier link is 24 random characters plus a 12 character signature only we can make, so junk can be refused with no database read.
const LINK = /^[A-Za-z0-9_-]{36}$/;
const tokenKey = () => process.env.SESSION_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim() || "jc-orders-dev";
const sign = (body: string) => createHmac("sha256", tokenKey()).update(`order:${body}`).digest("base64url").slice(0, 12);
export const makeToken = () => {
  const body = randomBytes(18).toString("base64url");
  return body + sign(body);
};
export function validToken(t: unknown): t is string {
  if (typeof t !== "string" || !LINK.test(t)) return false;
  const want = Buffer.from(sign(t.slice(0, 24)));
  const got = Buffer.from(t.slice(24));
  return want.length === got.length && timingSafeEqual(want, got);
}
const LIVE = ["sent", "confirmed", "failed", "declined"];

/** The order behind a supplier link, with only what the supplier needs to see. */
export async function orderForToken(token: string): Promise<{ order: Order; open: boolean } | null> {
  if (!validToken(token)) return null;
  const d = await loadProcurement();
  const o = d.orders.find((x) => x.token === token);
  if (!o) return null;
  const old = Date.now() - Date.parse(o.createdAt) > 60 * 86_400_000;
  return { order: o, open: LIVE.includes(o.status) && !old };
}

export async function supplierRespond(token: string, action: "confirm" | "decline", date: string | undefined, note: string | undefined): Promise<Result<{ order: Order }>> {
  if (!validToken(token)) return { ok: false, error: "This link isn't valid." };
  const n = note ? plain(note).slice(0, 300) : undefined;
  const t = today();
  if (action === "confirm" && date) {
    const ok = realDate.safeParse(date);
    if (!ok.success) return { ok: false, error: "That isn't a real date." };
    if (date < t) return { ok: false, error: "Choose a delivery date from today onwards." };
    if (date > addDays(t, 365)) return { ok: false, error: "That date is too far ahead. Please phone us." };
  }
  type R = { err: string; order?: undefined; sameAnswer?: undefined } | { err?: undefined; order: Order; sameAnswer: boolean };
  const r = await mutateProcurement<R>((d) => {
    const o = d.orders.find((x) => x.token === token);
    if (!o) return noWrite<R>({ err: "This link isn't valid." });
    if (!LIVE.includes(o.status) || Date.now() - Date.parse(o.createdAt) > 60 * 86_400_000) return noWrite<R>({ err: "This order is closed, so it can't be changed here. Please phone us." });
    const sameAnswer = o.reply?.action === action && (action === "decline" || (o.reply?.date ?? o.deliverBy) === (date ?? o.deliverBy));
    if (sameAnswer && (n ?? "") === (o.reply?.note ?? "")) return noWrite<R>({ order: structuredClone(o), sameAnswer: true }); // nothing to record
    o.status = action === "confirm" ? "confirmed" : "declined";
    o.reply = { at: new Date().toISOString(), action, ...(action === "confirm" ? { date: date ?? o.deliverBy } : {}), ...(n ? { note: n } : {}) };
    addLog(o, action === "confirm" ? `${o.supplierName} confirmed delivery for ${fmtDay(date ?? o.deliverBy)}${n ? `: "${n}"` : ""}` : `${o.supplierName} can't supply${n ? `: "${n}"` : ""}`);
    return { order: structuredClone(o), sameAnswer };
  });
  if (!r.order) return { ok: false, error: r.err ?? "This link isn't valid." };
  if (r.sameAnswer) return { ok: true, order: r.order }; // pressing the same button again shouldn't text the owner again
  // tell the owner (text + email; and WhatsApp if his window is open)
  try {
    const o = r.order;
    const settings = await getSettings();
    const msg = action === "confirm" ? `${o.supplierName} confirmed ${o.ref} for ${o.site.name}: delivery ${fmtDay(o.reply?.date ?? o.deliverBy)}${(o.reply?.date ?? o.deliverBy) !== o.deliverBy ? ` (you asked for ${fmtDay(o.deliverBy)})` : ""}${n ? `. "${n}"` : ""}` : `${o.supplierName} CAN'T supply ${o.ref} for ${o.site.name}${n ? `: "${n}"` : ""}. Order it elsewhere.`;
    await alertOwner(settings, `${action === "confirm" ? "Delivery confirmed" : "Supplier can't deliver"}: ${o.ref}`, msg);
    const { loadCtx } = await import("@/lib/assistant/ctx");
    const { notifyOwner } = await import("@/lib/assistant/engine");
    await notifyOwner(await loadCtx(), `📦 ${msg}`, action === "decline");
  } catch (e) {
    console.error("[orders] couldn't alert the owner:", (e as Error).message);
  }
  return { ok: true, order: r.order };
}

// ---------- privacy: erase what an order says about a customer ----------
const FINISHED: Order["status"][] = ["delivered", "cancelled", "declined"];
const KEEP_FINISHED_DAYS = 730; // 24 months, the same as other customer records

/** When a customer's enquiry is erased: unlink its orders, and wipe the site details from any that are finished. */
export async function scrubOrdersForLead(leadId: string) {
  await mutateProcurement((d) => {
    for (const o of d.orders) {
      if (o.site.leadId !== leadId && o.msgLeadId !== leadId) continue;
      delete o.site.leadId;
      delete o.msgLeadId;
      if (FINISHED.includes(o.status)) {
        o.site = { name: "(removed)", address: "(removed)" };
        delete o.contactName;
        delete o.contactPhone;
        delete o.notes;
        o.log = o.log.filter((l) => !/Created|Sent/.test(l.text)).slice(-5);
      }
    }
  });
}

/** Finished orders older than 24 months are deleted. */
export async function pruneOldOrders() {
  const cutoff = Date.now() - KEEP_FINISHED_DAYS * 86_400_000;
  return mutateProcurement((d) => {
    const before = d.orders.length;
    d.orders = d.orders.filter((o) => !FINISHED.includes(o.status) || Date.parse(o.createdAt) >= cutoff);
    return before - d.orders.length;
  });
}
