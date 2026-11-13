import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { getLookups } from "@/lib/data/lookups";
import { Mono, PageHeader } from "@/components/ui/primitives";
import { SubcontractorForm } from "../../_components/subcontractor-form";

export const metadata: Metadata = { title: "Edit subcontractor" };

export default async function EditSubcontractorPage({ params }: PageProps<"/subcontractors/[id]/edit">) {
  const ctx = await requireInternal("subcontractors.write");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: s }, lookups] = await Promise.all([supabase.from("subcontractors").select("*").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle(), getLookups(ctx.tenantId)]);
  if (!s) notFound();
  return (
    <>
      <Link href={`/subcontractors/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden />
        Back to subcontractor
      </Link>
      <PageHeader eyebrow="Subcontractors" title={`Edit ${s.company_name}`}>
        <div className="mt-1.5"><Mono>{s.reference}</Mono></div>
      </PageHeader>
      <SubcontractorForm
        values={{
          ...s,
          public_liability_gbp: s.public_liability_gbp === null ? null : Number(s.public_liability_gbp),
          day_rate: s.day_rate === null ? null : Number(s.day_rate),
          rating: s.rating === null ? null : Number(s.rating),
        }}
        trades={lookups.options("trade")}
      />
    </>
  );
}
