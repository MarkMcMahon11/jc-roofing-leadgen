"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cx } from "@/components/ui/primitives";

function useParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v === null || v === "") next.delete(k);
    else next.set(k, v);
    start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  return { set, pending };
}

/** Jump to any date (the week view shows the week containing it). */
export function DateJump({ value }: { value: string }) {
  const { set, pending } = useParams();
  return (
    <input
      type="date"
      aria-label="Go to date"
      defaultValue={value}
      key={value}
      onChange={(e) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) set("date", e.target.value);
      }}
      className={cx(
        "h-8 rounded-lg border border-line-strong bg-sunken px-2.5 text-[13px] text-fg [color-scheme:dark] hover:border-[#3d4f74] focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none",
        pending && "animate-pulse",
      )}
    />
  );
}

export function WeekendToggle({ on }: { on: boolean }) {
  const { set, pending } = useParams();
  return (
    <label className={cx("hidden h-8 cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-sunken px-2.5 text-[13px] text-muted hover:text-fg md:flex", pending && "opacity-70")}>
      <input type="checkbox" className="size-3.5 accent-[#2f7dff]" checked={on} onChange={(e) => set("weekend", e.target.checked ? "1" : null)} />
      Weekend
    </label>
  );
}
