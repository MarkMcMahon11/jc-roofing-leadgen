"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import { FilterSelect, SearchBox } from "@/components/ui/url-controls";
import type { Option } from "../_lib/types";
import { DUE_FILTERS, PRIORITIES } from "../_lib/constants";

const FILTER_KEYS = ["status", "priority", "trade", "org", "contract", "assignee", "due", "filter"];

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
  const [open, setOpen] = useState(false);
  const org = params.get("org");
  const active = FILTER_KEYS.filter((k) => params.get(k)).length + (params.get("q") ? 1 : 0);
  const selects = FILTER_KEYS.filter((k) => params.get(k)).length;
  const clear = new URLSearchParams();
  for (const k of ["view", "month", "sort", "dir"]) {
    const v = params.get(k);
    if (v) clear.set(k, v);
  }
  return (
    <div className="pm-card mb-4 p-3">
      <div className="flex gap-2 lg:hidden">
        <SearchBox placeholder="Search reference, title, client ref…" className="min-w-0 flex-1" />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="job-filters"
          className={cx(
            "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-sm",
            selects ? "border-[#1d3d78] bg-accent-lo text-accent-hi" : "border-line-strong bg-raised text-muted",
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filters{selects ? ` (${selects})` : ""}
        </button>
      </div>
      <div id="job-filters" className={cx(open ? "mt-2 grid" : "hidden", "grid-cols-2 gap-2 sm:grid-cols-3 lg:mt-0 lg:flex lg:flex-wrap lg:items-center")}>
        <SearchBox placeholder="Search reference, title, client ref…" className="hidden lg:block lg:w-72" />
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
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] px-3 text-sm text-muted hover:bg-raised hover:text-fg"
          >
            <X className="size-4" aria-hidden />
            Clear {active} filter{active === 1 ? "" : "s"}
          </Link>
        )}
      </div>
    </div>
  );
}
