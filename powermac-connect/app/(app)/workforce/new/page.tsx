import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/primitives";
import { EmployeeForm } from "../_components/employee-form";
import { employeeFormOptions } from "../_lib/form-options";

export const metadata: Metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  const ctx = await requireInternal("workforce.write");
  const opts = await employeeFormOptions(ctx.tenantId);
  return (
    <>
      <Link href="/workforce" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden />
        Workforce
      </Link>
      <PageHeader eyebrow="Workforce" title="Add employee" description="Work details for scheduling. Personal data (date of birth, NI number, pay) is added on their profile by people with access to it." />
      <EmployeeForm values={{}} trades={opts.trades} skills={opts.skills} vehicles={opts.vehicles} />
    </>
  );
}
