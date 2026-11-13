import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Mono, PageHeader } from "@/components/ui/primitives";
import { EmployeeForm } from "../../_components/employee-form";
import { employeeFormOptions } from "../../_lib/form-options";
import { readWorkingHours } from "../../_lib/shared";

export const metadata: Metadata = { title: "Edit employee" };

export default async function EditEmployeePage({ params }: PageProps<"/workforce/[id]/edit">) {
  const ctx = await requireInternal("workforce.write");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: e } = await supabase
    .from("employees")
    .select("id, reference, first_name, last_name, job_title, trade, skills, work_email, work_phone, employment_status, employment_type, start_date, end_date, is_field_operative, charge_rate, base_postcode, base_latitude, vehicle_id, colour, working_hours, max_daily_hours")
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();
  const opts = await employeeFormOptions(ctx.tenantId, e.vehicle_id);
  return (
    <>
      <Link href={`/workforce/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden />
        Back to profile
      </Link>
      <PageHeader eyebrow="Workforce" title={`Edit ${e.first_name} ${e.last_name}`}>
        <div className="mt-1.5"><Mono>{e.reference}</Mono></div>
      </PageHeader>
      <EmployeeForm
        values={{
          ...e,
          charge_rate: e.charge_rate === null ? null : Number(e.charge_rate),
          max_daily_hours: Number(e.max_daily_hours),
          working_hours: readWorkingHours(e.working_hours),
          has_base_location: e.base_latitude !== null,
        }}
        trades={opts.trades}
        skills={opts.skills}
        vehicles={opts.vehicles}
      />
    </>
  );
}
