import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Mono, PageHeader } from "@/components/ui/primitives";
import { PropertyForm } from "../../_components/property-form";
import { propertyFormOptions } from "../../_lib/form-options";

export const metadata: Metadata = { title: "Edit property" };

export default async function EditPropertyPage({ params }: PageProps<"/properties/[id]/edit">) {
  const ctx = await requireInternal("properties.write");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: p }, { data: links }] = await Promise.all([
    supabase.from("properties").select("*").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle(),
    supabase.from("contract_properties").select("contract_id").eq("tenant_id", ctx.tenantId).eq("property_id", id),
  ]);
  if (!p) notFound();
  const opts = await propertyFormOptions(ctx, p.organisation_id);
  return (
    <>
      <Link href={`/properties/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden />
        Back to property
      </Link>
      <PageHeader eyebrow="Properties" title={`Edit ${p.address_line1}`}>
        <div className="mt-1.5"><Mono>{p.reference}</Mono></div>
      </PageHeader>
      <PropertyForm
        values={{ ...p, contract_ids: (links ?? []).map((l) => l.contract_id), has_location: p.latitude !== null }}
        organisations={opts.organisations}
        contracts={opts.contracts}
        propertyTypes={opts.propertyTypes}
        hazards={opts.hazards}
        canLinkContracts={ctx.can("contracts.write")}
        canSeeContracts={ctx.can("contracts.read")}
        canDelete={ctx.can("properties.delete")}
      />
    </>
  );
}
