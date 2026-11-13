"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { FilterSelect, SearchBox } from "@/components/ui/url-controls";
import type { Option } from "../_lib/types";
import { DUE_FILTERS, PRIORITIES } from "../_lib/constants";

const FILTER_KEYS = ["q", "status", "priority", "trade", "org", "contract", "assignee", "due", "filter"];

export function FilterBar({
  statuses,
  trades,
  clients,
  contracts,
  operatives,
}: {
  statuses: Option[];
  trades: Option[];
  clients: Option[];
  contracts: (Option & { org: string })[];
  operatives: Option[];
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const org = params.get("org");
  const active = FILTER_KEYS.filter((k) => params.get(k)).length;
  const clear = new URLSearchParams();
  for (const k of ["view", "month", "sort", "dir"]) {
    const v = params.get(k);
    if (v) clear.set(k, v);
  }
  return (
    <div className="pm-card mb-4 p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-center">
        <SearchBox placeholder="Search reference, title, client ref…" className="col-span-2 sm:col-span-3 lg:w-72" />
        <FilterSelect param="status" label="Status" options={statuses} className="w-full lg:w-auto" />
        <FilterSelect param="priority" label="Priority" options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} className="w-full lg:w-auto" />
        <FilterSelect param="trade" label="Trade" options={trades} className="w-full lg:w-auto" />
        <FilterSelect param="org" label="Client" options={clients} className="w-full lg:w-auto lg:max-w-56" />
        <FilterSelect param="contract" label="Contract" options={contracts.filter((c) => !org || c.org === org)} className="w-full lg:w-auto lg:max-w-56" />
        <FilterSelect param="assignee" label="Assignee" options={operatives} className="w-full lg:w-auto" />
        <FilterSelect param="due" label="Due" options={DUE_FILTERS.map((d) => ({ value: d.value, label: d.label }))} className="w-full lg:w-auto" />
        {active > 0 && (
          <Link
            href={`${pathname}${clear.size ? `?${clear}` : ""}`}
            scroll={false}
            className="col-span-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm text-muted hover:bg-raised hover:text-fg sm:col-span-1"
          >
            <X className="size-4" aria-hidden />
            Clear {active} filter{active === 1 ? "" : "s"}
          </Link>
        )}
      </div>
    </div>
  );
}
