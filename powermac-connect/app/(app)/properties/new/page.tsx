import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/primitives";
import { PropertyForm } from "../_components/property-form";
import { propertyFormOptions } from "../_lib/form-options";
import { param } from "../_lib/ui";

export const metadata: Metadata = { title: "Add property" };

export default async function NewPropertyPage({ searchParams }: PageProps<"/properties/new">) {
  const ctx = await requireInternal("properties.write");
  const sp = await searchParams;
  const org = param(sp.org);
  const opts = await propertyFormOptions(ctx);
  const preset = opts.organisations.some((o) => o.value === org) ? org : undefined;
  return (
    <>
      <Link href="/properties" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden />
        Properties
      </Link>
      <PageHeader eyebrow="Properties" title="Add property" description="Add a property to a client's portfolio. You can add occupants, certificates and documents once it is saved." />
      <PropertyForm
        values={{ organisation_id: preset }}
        organisations={opts.organisations}
        contracts={opts.contracts}
        propertyTypes={opts.propertyTypes}
        hazards={opts.hazards}
        canLinkContracts={ctx.can("contracts.write")}
        canSeeContracts={ctx.can("contracts.read")}
        canDelete={false}
      />
    </>
  );
}
