import type { Metadata } from "next";
import Link from "next/link";
import { requireTenant } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, EmptyState, PageHeader, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { SearchBox } from "@/components/ui/url-controls";
import { label } from "@/lib/format";

export const metadata: Metadata = { title: "Properties" };

export default async function PortalProperties({ searchParams }: PageProps<"/portal/properties">) {
  const ctx = await requireTenant();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_properties", { p_tenant: ctx.tenantId, p_search: typeof sp.q === "string" ? sp.q.slice(0, 80) : undefined });
  return (
    <>
      <PageHeader title="Properties" description="Your properties covered by PowerMac." />
      <Card>
        <div className="px-5 py-3"><SearchBox placeholder="Street, postcode or reference" className="w-full sm:w-80" /></div>
        {(data ?? []).length === 0 ? <EmptyState title="No properties found" /> : (
          <Table>
            <THead><tr><TH>Address</TH><TH>Type</TH><TH>Status</TH><TH align="right">Open jobs</TH><TH /></tr></THead>
            <tbody>
              {(data ?? []).map((p) => (
                <TR key={p.id}>
                  <TD><div className="font-medium">{p.address}</div><div className="text-xs text-subtle">{p.town} {p.postcode} · {p.client_reference ?? p.reference}</div></TD>
                  <TD className="text-muted">{label(p.property_type)}</TD>
                  <TD><Badge tone={p.status === "void" ? "warn" : "neutral"}>{p.status}</Badge></TD>
                  <TD align="right">{p.open_jobs}</TD>
                  <TD align="right">{ctx.can("portal.request") && <Link href={`/portal/request?property=${p.id}`} className="text-xs text-accent-hi hover:underline">Request repair</Link>}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
