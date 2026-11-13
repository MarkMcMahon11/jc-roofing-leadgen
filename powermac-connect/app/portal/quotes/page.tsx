import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui/primitives";
import { date, money } from "@/lib/format";
import { DecisionForm } from "./decision-form";

export const metadata: Metadata = { title: "Quotations" };

export default async function PortalQuotes() {
  const ctx = await requireTenant();
  if (!ctx.can("quotes.read")) redirect("/portal");
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_quotes", { p_tenant: ctx.tenantId });
  const quotes = data ?? [];
  return (
    <>
      <PageHeader title="Quotations" description="Review and approve quotations. Your decision is recorded with your name and the time." />
      {quotes.length === 0 && <Card><EmptyState title="No quotations yet" /></Card>}
      <div className="space-y-4">
        {quotes.map((q) => {
          const lines = (q.lines ?? []) as { description: string; quantity: number; unit: string; unit_price: number; total: number }[];
          return (
            <Card key={q.id}>
              <CardHeader
                title={q.title}
                description={`${q.reference}${q.job_reference ? ` · job ${q.job_reference}` : ""}${q.address ? ` · ${q.address}` : ""}`}
                actions={<Badge tone={q.status === "sent" ? "warn" : q.status === "approved" ? "ok" : q.status === "rejected" ? "bad" : "neutral"}>{q.status === "sent" ? "Awaiting your decision" : q.status}</Badge>}
              />
              <CardBody>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead className="text-left text-xs text-subtle"><tr><th className="py-1.5 font-medium">Item</th><th className="py-1.5 text-right font-medium">Qty</th><th className="py-1.5 text-right font-medium">Rate</th><th className="py-1.5 text-right font-medium">Amount</th></tr></thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={i} className="border-t border-line/60"><td className="py-2">{l.description}</td><td className="py-2 text-right tabular">{l.quantity} {l.unit}</td><td className="py-2 text-right tabular">{money(l.unit_price)}</td><td className="py-2 text-right tabular">{money(l.total)}</td></tr>
                      ))}
                    </tbody>
                    <tfoot className="text-sm">
                      <tr className="border-t border-line"><td colSpan={3} className="pt-2 text-right text-muted">Net</td><td className="pt-2 text-right tabular">{money(q.subtotal)}</td></tr>
                      <tr><td colSpan={3} className="text-right text-muted">VAT</td><td className="text-right tabular">{money(q.vat_total)}</td></tr>
                      <tr><td colSpan={3} className="text-right font-semibold">Total</td><td className="text-right font-semibold tabular">{money(q.total)}</td></tr>
                    </tfoot>
                  </table>
                </div>
                <p className="mt-3 text-xs text-subtle">Sent {date(q.sent_at)}{q.valid_until ? ` · valid until ${date(q.valid_until)}` : ""}{q.decided_at ? ` · decided ${date(q.decided_at)}` : ""}</p>
                {q.status === "sent" && ctx.can("quotes.approve") && <DecisionForm quoteId={q.id} defaultName={ctx.fullName} />}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
