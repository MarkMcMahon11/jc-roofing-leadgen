import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/primitives";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "Request a repair" };

export default async function RequestPage({ searchParams }: PageProps<"/portal/request">) {
  const ctx = await requireTenant();
  if (!ctx.can("portal.request")) redirect("/portal");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("portal_properties", { p_tenant: ctx.tenantId });
  return (
    <>
      <PageHeader title="Request a repair" description="Tell us what is wrong and where. Emergencies (danger to people, serious water leaks, no heating for vulnerable residents) are attended within 4 hours - please also phone." />
      <RequestForm
        properties={(data ?? []).map((p) => ({ value: p.id, label: `${p.address}, ${p.town} ${p.postcode}${p.client_reference ? ` (${p.client_reference})` : ""}` }))}
        defaultProperty={typeof sp.property === "string" ? sp.property : undefined}
      />
    </>
  );
}
