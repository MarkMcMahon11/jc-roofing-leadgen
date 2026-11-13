import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, Stat, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { date, money } from "@/lib/format";

export const metadata: Metadata = { title: "Invoices" };

export default async function PortalInvoices() {
  const ctx = await requireTenant();
  if (!ctx.can("finance.read")) redirect("/portal");
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_invoices", { p_tenant: ctx.tenantId });
  const rows = data ?? [];
  const open = rows.filter((i) => ["issued", "part_paid", "overdue"].includes(i.status));
  return (
    <>
      <PageHeader title="Invoices" description="Invoices issued to your organisation." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Outstanding" value={money(open.reduce((s, i) => s + Number(i.total) - Number(i.amount_paid), 0), { whole: true })} tone="warn" />
        <Stat label="Overdue" value={open.filter((i) => i.status === "overdue").length} tone={open.some((i) => i.status === "overdue") ? "bad" : "ok"} />
        <Stat label="Invoices" value={rows.length} />
      </div>
      <Card>
        {rows.length === 0 ? <EmptyState title="No invoices yet" /> : (
          <Table>
            <THead><tr><TH>Invoice</TH><TH>Job</TH><TH>Issued</TH><TH>Due</TH><TH align="right">Total</TH><TH align="right">Paid</TH><TH>Status</TH></tr></THead>
            <tbody>
              {rows.map((i) => (
                <TR key={i.id}>
                  <TD><span className="font-mono text-[13px]">{i.reference}</span>{i.purchase_order_ref && <div className="text-xs text-subtle">PO {i.purchase_order_ref}</div>}</TD>
                  <TD className="text-muted">{i.job_reference ?? "-"}</TD>
                  <TD className="text-muted">{date(i.issue_date)}</TD>
                  <TD className="text-muted">{date(i.due_date)}</TD>
                  <TD align="right">{money(i.total)}</TD>
                  <TD align="right">{money(i.amount_paid)}</TD>
                  <TD><Badge tone={i.status === "paid" ? "ok" : i.status === "overdue" ? "bad" : "warn"}>{i.status.replace("_", " ")}</Badge></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
