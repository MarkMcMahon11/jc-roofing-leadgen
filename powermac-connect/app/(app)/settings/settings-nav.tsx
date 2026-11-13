"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/primitives";

export function SettingsNav({ sections }: { sections: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {sections.map((s) => {
        const active = pathname === s.href || pathname.startsWith(s.href + "/");
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={cx("rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors", active ? "bg-raised font-medium text-fg" : "text-muted hover:bg-raised/60 hover:text-fg")}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
