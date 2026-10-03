// WhatsApp Business Platform (Meta Cloud API). Switched on by environment variables; with none set the assistant runs
// in demo mode (everything works in the dashboard, nothing is sent to a real phone).
//   WHATSAPP_TOKEN            permanent access token (server only)
//   WHATSAPP_PHONE_NUMBER_ID  the business number's id in Meta
//   WHATSAPP_APP_SECRET       Meta app secret: webhook signatures are checked with it
//   WHATSAPP_VERIFY_TOKEN     any long random string, typed again into Meta's webhook settings
//   WHATSAPP_TEMPLATE_NAME    optional approved "utility" template with one {{1}} variable, used for reminders outside the 24 h window

import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH = process.env.WHATSAPP_GRAPH_URL || "https://graph.facebook.com/v23.0";

export const waConfigured = () => Boolean(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());
export const waReceiveConfigured = () => Boolean(process.env.WHATSAPP_APP_SECRET?.trim() && process.env.WHATSAPP_VERIFY_TOKEN?.trim());
export const templateName = () => process.env.WHATSAPP_TEMPLATE_NAME?.trim() || "";

const headers = () => ({ Authorization: `Bearer ${process.env.WHATSAPP_TOKEN?.trim()}`, "content-type": "application/json" });
const url = () => `${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()}/messages`;

export type Delivery = "sent" | "failed" | "demo";

/** Free-form text. WhatsApp only delivers it within 24 h of the person's last message to us. */
export async function sendText(to: string, body: string): Promise<Delivery> {
  if (!waConfigured()) return "demo";
  try {
    const res = await fetch(url(), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: body.slice(0, 4000), preview_url: false } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[whatsapp] send failed", res.status, (await res.text()).slice(0, 200));
    return res.ok ? "sent" : "failed";
  } catch (e) {
    console.error("[whatsapp] send error", (e as Error).message);
    return "failed";
  }
}

const tidy = (t: string) => {
  const s = t.replace(/\s*\n+\s*/g, " · ").replace(/[ \t]{2,}/g, " ").trim();
  return s.length > 900 ? s.slice(0, 897) + "..." : s;
};

/** A pre-approved template message (works outside the 24 h window). Template variables can't contain line breaks. */
export async function sendTemplate(to: string, text: string): Promise<Delivery> {
  if (!waConfigured()) return "demo";
  const name = templateName();
  if (!name) return "failed";
  try {
    const res = await fetch(url(), {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: { name, language: { code: process.env.WHATSAPP_TEMPLATE_LANG?.trim() || "en_GB" }, components: [{ type: "body", parameters: [{ type: "text", text: tidy(text) }] }] },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[whatsapp] template failed", res.status, (await res.text()).slice(0, 200));
    return res.ok ? "sent" : "failed";
  } catch (e) {
    console.error("[whatsapp] template error", (e as Error).message);
    return "failed";
  }
}

/** Meta signs every webhook call with the app secret. Anything else is refused. */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"));
  const got = Buffer.from(header.slice(7));
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export type WaInbound = { waId: string; from: string; at: string; type: string; text?: string; name?: string };

type WebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{ id: string; from: string; timestamp: string; type: string; text?: { body?: string }; image?: { caption?: string }; document?: { caption?: string }; button?: { text?: string } }>;
      };
    }>;
  }>;
};

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Tolerates any shape (a signed but odd payload must never crash the webhook) and keeps only well-formed messages. */
export function parseWebhook(body: unknown): WaInbound[] {
  const out: WaInbound[] = [];
  try {
    for (const e of arr((body as WebhookBody)?.entry)) {
      if (!isRec(e)) continue;
      for (const ch of arr(e.changes)) {
        if (!isRec(ch) || !isRec(ch.value)) continue;
        const value = ch.value;
        const contacts = arr(value.contacts).filter(isRec);
        for (const m of arr(value.messages)) {
          if (!isRec(m)) continue;
          const id = m.id;
          const from = typeof m.from === "string" ? m.from.replace(/\D/g, "") : "";
          if (typeof id !== "string" || id.length === 0 || id.length > 128 || !/^\d{7,15}$/.test(from)) continue;
          const text = (isRec(m.text) ? m.text.body : undefined) ?? (isRec(m.image) ? m.image.caption : undefined) ?? (isRec(m.document) ? m.document.caption : undefined) ?? (isRec(m.button) ? m.button.text : undefined);
          const profile = contacts.find((c) => c.wa_id === m.from)?.profile;
          out.push({
            waId: id,
            from,
            at: new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString(),
            type: String(m.type ?? "unknown").slice(0, 30),
            text: typeof text === "string" ? text : undefined,
            name: isRec(profile) && typeof profile.name === "string" ? profile.name : undefined,
          });
        }
      }
    }
  } catch {
    // keep whatever parsed cleanly
  }
  return out;
}
