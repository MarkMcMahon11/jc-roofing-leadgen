import type { Metadata } from "next";
import Image from "next/image";
import { BUSINESS } from "@/lib/config";
import { fmtDay } from "@/lib/ops/format";
import { orderForToken } from "@/lib/orders/service";
import { WINDOW_LABEL } from "@/lib/orders/types";
import { SupplierReply } from "./SupplierReply";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery request · JC Roofing", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SupplierOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await orderForToken(token);
  if (!found) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">This link isn&apos;t valid</h1>
        <p className="mt-2 text-sm text-mute">It may have been copied wrongly. Please check the email or text we sent, or call us on {BUSINESS.phone}.</p>
      </Shell>
    );
  }
  const { order: o, open } = found;
  const where = `${o.site.address}${o.site.postcode && !o.site.address.toUpperCase().includes(o.site.postcode.toUpperCase()) ? `, ${o.site.postcode}` : ""}`;
  const map = typeof o.site.lat === "number" && typeof o.site.lng === "number" ? `${o.site.lat},${o.site.lng}` : encodeURIComponent(where);
  return (
    <Shell>
      <p className="text-xs font-semibold uppercase tracking-wide text-mute">Delivery request</p>
      <h1 className="text-2xl font-bold">{o.ref}</h1>
      <p className="mt-1 text-sm text-mute">For {o.supplierName}</p>

      <dl className="mt-5 space-y-3 text-sm">
        <div>
          <dt className="font-semibold">Deliver to</dt>
          <dd className="break-words [overflow-wrap:anywhere]">{o.site.name}<br />{where}<br /><a className="font-medium text-brand underline" href={`https://www.google.com/maps/search/?api=1&query=${map}`} target="_blank" rel="noreferrer noopener">Open in maps</a></dd>
        </div>
        <div>
          <dt className="font-semibold">Deliver by</dt>
          <dd>{fmtDay(o.deliverBy)} · {WINDOW_LABEL[o.window]}</dd>
        </div>
        {(o.contactName || o.contactPhone) && (
          <div>
            <dt className="font-semibold">On site contact</dt>
            <dd>{[o.contactName, o.contactPhone].filter(Boolean).join(" · ")}</dd>
          </div>
        )}
        <div>
          <dt className="font-semibold">Materials</dt>
          <dd>
            <ul className="mt-1 divide-y divide-sand rounded-xl border border-sand bg-white">
              {o.items.map((i, n) => (
                <li key={n} className="flex justify-between gap-3 px-3 py-2"><span className="min-w-0 break-words [overflow-wrap:anywhere]">{i.description}</span><span className="max-w-[45%] shrink-0 break-words text-right font-semibold tabular-nums [overflow-wrap:anywhere]">{i.qty} {i.unit}</span></li>
              ))}
            </ul>
          </dd>
        </div>
        {o.notes && (
          <div>
            <dt className="font-semibold">Notes</dt>
            <dd className="whitespace-pre-line break-words [overflow-wrap:anywhere]">{o.notes}</dd>
          </div>
        )}
      </dl>

      <div className="mt-6 border-t border-sand pt-5">
        {open ? (
          <SupplierReply token={token} deliverBy={o.deliverBy} current={o.reply ? { action: o.reply.action, date: o.reply.date, note: o.reply.note } : undefined} />
        ) : (
          <p role="status" className="rounded-xl bg-cream p-3 text-sm">
            {o.status === "delivered" ? "This order has been marked delivered. Thank you." : o.status === "cancelled" ? "This order has been cancelled." : o.status === "declined" ? "You told us you can't supply this order. Thank you." : "This link has expired."} Questions? Call {BUSINESS.phone}.
          </p>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 py-8">
      <Image src="/logo-clean.png" alt={BUSINESS.name} width={512} height={198} className="mb-6 h-12 w-auto" />
      <div className="rounded-2xl border border-sand bg-white p-5 shadow-sm">{children}</div>
      <p className="mt-4 text-center text-xs text-mute">{BUSINESS.name} · {BUSINESS.phone}</p>
    </main>
  );
}
