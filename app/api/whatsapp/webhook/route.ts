import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { handleInbound } from "@/lib/assistant/engine";
import { parseWebhook, verifySignature, waReceiveConfigured } from "@/lib/assistant/wa";

export const maxDuration = 60;

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Meta checks the address once when it's set up: it sends our verify token and expects its challenge back. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (token && q.get("hub.mode") === "subscribe" && same(q.get("hub.verify_token") ?? "", token)) return new Response(q.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  return new Response("Forbidden", { status: 403 });
}

/** Messages from WhatsApp. Only calls signed by Meta with our app secret are accepted. */
export async function POST(req: Request) {
  if (!waReceiveConfigured()) return new Response("Not configured", { status: 503 });
  const raw = await req.text();
  if (raw.length > 1_000_000) return new Response("Too large", { status: 413 });
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("Bad signature", { status: 401 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const messages = parseWebhook(body).slice(0, 20);
  // answer Meta straight away (it retries slow replies), then do the work
  after(async () => {
    for (const m of messages) await handleInbound(m).catch((e) => console.error("[whatsapp] inbound failed:", (e as Error).message));
  });
  return Response.json({ ok: true });
}
