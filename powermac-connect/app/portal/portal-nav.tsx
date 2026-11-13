"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/primitives";

export function PortalNav({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 md:px-8" aria-label="Portal">
      {links.map((l) => {
        const active = l.href === "/portal" ? pathname === "/portal" : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={cx("border-b-2 px-3 py-3 text-sm whitespace-nowrap", active ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg")}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
