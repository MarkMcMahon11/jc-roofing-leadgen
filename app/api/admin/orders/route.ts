import { z } from "zod";
import { bad } from "@/lib/http";
import { clientIp, limited } from "@/lib/limits";
import { crossSite, ownerSession, sameOrigin, unauthorized } from "@/lib/server/auth";
import { createOrder, deleteSupplier, loadProcurement, publicBase, resendOrder, saveSupplier, setOrderStatus } from "@/lib/orders/service";

export const maxDuration = 60;

/** GET: suppliers and orders for the Materials orders page. ?brief=1: just the counts for the menu badge. */
export async function GET(req: Request) {
  if (!(await ownerSession())) return unauthorized();
  const d = await loadProcurement();
  const awaiting = d.orders.filter((o) => o.status === "sent" || o.status === "failed").length;
  const q = new URL(req.url).searchParams;
  if (q.get("brief")) return Response.json({ awaiting, declined: d.orders.filter((o) => o.status === "declined").length });
  // slim answers for the map (which only needs to know what has been ordered where) and the order form (which only needs suppliers)
  if (q.get("suppliers")) return Response.json({ suppliers: d.suppliers });
  if (q.get("sites")) return Response.json({ orders: d.orders.slice(0, 300).map((o) => ({ id: o.id, ref: o.ref, status: o.status, supplierName: o.supplierName, deliverBy: o.deliverBy, site: { jobId: o.site.jobId, leadId: o.site.leadId } })) });
  // every open order, then the most recent finished ones
  const OPEN = ["sent", "confirmed", "failed", "declined"];
  const shown = [...d.orders.filter((o) => OPEN.includes(o.status)), ...d.orders.filter((o) => !OPEN.includes(o.status)).slice(0, 100)].slice(0, 300);
  return Response.json({
    suppliers: d.suppliers,
    orders: shown.map(({ token, ...o }) => ({ ...o, link: `${publicBase(req)}/supplier/order/${token}` })),
    awaiting,
    config: { email: !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM), sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) },
  });
}

const Body = z.discriminatedUnion("op", [
  z.object({ op: z.literal("supplier_save"), supplier: z.unknown() }),
  z.object({ op: z.literal("supplier_delete"), id: z.string().max(60) }),
  z.object({ op: z.literal("order_create"), order: z.unknown() }),
  z.object({ op: z.literal("order_resend"), id: z.string().max(60) }),
  z.object({ op: z.literal("order_status"), id: z.string().max(60), status: z.enum(["delivered", "cancelled", "confirmed"]) }),
]);

export async function POST(req: Request) {
  if (!sameOrigin(req)) return crossSite();
  if (!(await ownerSession())) return unauthorized();
  if (limited(`orders:${clientIp(req)}`, 60, 60_000)) return bad("Slow down a moment.", 429);
  if (Number(req.headers.get("content-length") ?? 0) > 200_000) return bad("Too large.", 413);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Bad request.");
  const b = parsed.data;
  const base = publicBase(req);
  switch (b.op) {
    case "supplier_save": {
      const r = await saveSupplier(b.supplier);
      return r.ok ? Response.json({ ok: true, supplier: r.supplier }) : bad(r.error);
    }
    case "supplier_delete": {
      const r = await deleteSupplier(b.id);
      return r.ok ? Response.json({ ok: true }) : bad(r.error, 409);
    }
    case "order_create": {
      const r = await createOrder(b.order, { base, by: "dashboard" });
      if (!r.ok) return bad(r.error);
      const { token, ...order } = r.order;
      return Response.json({ ok: true, duplicate: !!r.duplicate, order: { ...order, link: `${base}/supplier/order/${token}` } });
    }
    case "order_resend": {
      const r = await resendOrder(b.id, base);
      return r.ok ? Response.json({ ok: true }) : bad(r.error, 409);
    }
    case "order_status": {
      const r = await setOrderStatus(b.id, b.status, base);
      return r.ok ? Response.json({ ok: true }) : bad(r.error, 409);
    }
  }
}
