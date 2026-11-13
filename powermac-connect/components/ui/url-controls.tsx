"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X, ChevronLeft, ChevronRight } from "lucide-react";
import { cx, Select } from "./primitives";

function useSetParam() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in updates)) next.delete("page");
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  return { set, params, pending };
}

export function SearchBox({ placeholder = "Search…", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const { set, params, pending } = useSetParam();
  const [value, setValue] = useState(params.get(param) ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => set({ [param]: value.trim() || null }), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={cx("relative", className)}>
      <Search className={cx("pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2", pending ? "animate-pulse text-accent-hi" : "text-subtle")} aria-hidden />
      <input
        type="search"
        aria-label={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-[10px] border border-line-strong bg-sunken pr-9 pl-9 text-sm text-fg placeholder:text-subtle hover:border-[#3d4f74] focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => setValue("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-subtle hover:text-fg" aria-label="Clear search">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function FilterSelect({ param, label, options, className }: { param: string; label: string; options: { value: string; label: string }[]; className?: string }) {
  const { set, params } = useSetParam();
  return (
    <Select aria-label={label} value={params.get(param) ?? ""} onChange={(e) => set({ [param]: e.target.value || null })} className={cx("w-auto min-w-36", className)}>
      <option value="">{label}: all</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const { set } = useSetParam();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <p className="px-5 py-3 text-xs text-subtle">{total} {total === 1 ? "record" : "records"}</p>;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-muted">
      <span className="tabular">
        {from}-{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button className="rounded-lg p-1.5 hover:bg-raised disabled:opacity-40" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-2 tabular">
          {page} / {pages}
        </span>
        <button className="rounded-lg p-1.5 hover:bg-raised disabled:opacity-40" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })} aria-label="Next page">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** Tabs that are real links (each tab is a URL). */
export function LinkTabs({ tabs, current }: { tabs: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
              active ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className={cx("rounded-full px-1.5 text-[11px] tabular", active ? "bg-accent-lo text-accent-hi" : "bg-raised text-subtle")}>{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
