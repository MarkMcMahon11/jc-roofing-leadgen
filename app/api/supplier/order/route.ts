import { z } from "zod";
import { bad } from "@/lib/http";
import { clientIp, limited } from "@/lib/limits";
import { supplierRespond, validToken } from "@/lib/orders/service";

/** The supplier's one-tap answer from the link in their email or text. No sign-in: the long private link in the message is the key. */
const Body = z.object({ token: z.string().max(80), action: z.enum(["confirm", "decline"]), date: z.string().max(10).optional(), note: z.string().max(400).optional() });

export async function POST(req: Request) {
  const ip = clientIp(req);
  // junk is cheap to refuse and mustn't use up a real supplier's allowance (offices share one address)
  if (limited(`supplier-any:${ip}`, 300, 10 * 60_000)) return bad("Too many attempts. Please wait a few minutes or phone us.", 429);
  if (Number(req.headers.get("content-length") ?? 0) > 4000) return bad("Too large.", 413);
  const raw = await req.text();
  if (raw.length > 4000) return bad("Too large.", 413);
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return bad("Bad request.");
  }
  const p = Body.safeParse(json);
  if (!p.success) return bad("Please check what you typed and try again.");
  if (!validToken(p.data.token)) return bad("This link isn't valid.", 404);
  if (limited(`supplier:${ip}`, 30, 10 * 60_000)) return bad("Too many attempts. Please wait a few minutes or phone us.", 429);
  if (limited(`supplier-token:${p.data.token}`, 12, 3_600_000)) return bad("Too many changes to this order. Please phone us.", 429);
  const r = await supplierRespond(p.data.token, p.data.action, p.data.date || undefined, p.data.note || undefined);
  return r.ok ? Response.json({ ok: true, status: r.order.status }) : bad(r.error, 409);
}
