import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { getLookups } from "@/lib/data/lookups";
import { PageHeader } from "@/components/ui/primitives";
import { SubcontractorForm } from "../_components/subcontractor-form";

export const metadata: Metadata = { title: "Add subcontractor" };

export default async function NewSubcontractorPage() {
  const ctx = await requireInternal("subcontractors.write");
  const lookups = await getLookups(ctx.tenantId);
  return (
    <>
      <Link href="/subcontractors" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden />
        Subcontractors
      </Link>
      <PageHeader eyebrow="Subcontractors" title="Add subcontractor" description="New subcontractors start as pending until their insurance and CIS status have been checked." />
      <SubcontractorForm values={{}} trades={lookups.options("trade")} />
    </>
  );
}
