"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bell, ChevronsUpDown, LogOut, Menu, UserRound, X, Check, FlaskConical } from "lucide-react";
import type { NavGroup } from "@/lib/nav";
import { Icon } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";
import { Logo } from "./logo";
import { markNotificationsRead, signOut, switchTenant } from "./actions";
import { GlobalSearch } from "./search";

export type ShellUser = { name: string; email: string; role: string; initials: string };
export type ShellTenant = { id: string; name: string; isDemo: boolean };
export type ShellNotification = { id: string; title: string; body: string | null; link: string | null; severity: string; created: string };

export function Shell({
  nav,
  user,
  tenant,
  tenants,
  notifications,
  isPlatformAdmin,
  children,
}: {
  nav: NavGroup[];
  user: ShellUser;
  tenant: ShellTenant;
  tenants: ShellTenant[];
  notifications: ShellNotification[];
  isPlatformAdmin: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // the drawer belongs to the page it was opened on, so navigating closes it
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null);

  return (
    <div className="min-h-dvh">
      {tenant.isDemo && (
        <div className="sticky top-0 z-40 flex h-8 items-center justify-center gap-2 border-b border-[#57400f] bg-[#2a1f0a] px-3 text-center text-[12px] font-medium text-[#ffcf7d]">
          <FlaskConical className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">DEMO ENVIRONMENT · {tenant.name} · all clients, people and figures are sample data</span>
        </div>
      )}

      {/* mobile drawer backdrop */}
      {open && <button className="fixed inset-0 z-40 bg-[#02050c]/70 backdrop-blur-sm lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)} />}

      <aside
        className={cx(
          "fixed bottom-0 left-0 z-50 flex w-[264px] flex-col border-r border-line bg-chrome/95 backdrop-blur transition-transform lg:translate-x-0",
          tenant.isDemo ? "top-8" : "top-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/" aria-label="PowerMac Connect home">
            <Logo />
          </Link>
          <button className="rounded-lg p-1.5 text-muted hover:bg-raised lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>

        <TenantSwitcher tenant={tenant} tenants={tenants} />

        <nav className="flex-1 overflow-y-auto px-3 pt-2 pb-6">
          {nav.map((group) => (
            <div key={group.label} className="mt-4 first:mt-1">
              <div className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-subtle uppercase">{group.label}</div>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith((item.match ?? item.href) + "/");
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cx(
                          "group relative flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] transition-colors",
                          active ? "bg-accent-lo/80 font-medium text-fg" : "text-muted hover:bg-raised hover:text-fg",
                        )}
                      >
                        {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-accent shadow-[0_0_12px_rgb(47_125_255/0.9)]" aria-hidden />}
                        <Icon name={item.icon} className={cx("size-[17px] shrink-0", active ? "text-accent-hi" : "text-subtle group-hover:text-muted")} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {isPlatformAdmin && (
            <div className="mt-4">
              <div className="px-3 pb-1.5 text-[10.5px] font-semibold tracking-[0.12em] text-subtle uppercase">BPOAI.AI</div>
              <Link href="/platform" className="flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] text-muted hover:bg-raised hover:text-fg">
                <Icon name="database" className="size-[17px] text-subtle" />
                Platform console
              </Link>
            </div>
          )}
        </nav>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2f7dff] to-[#1c3f80] text-xs font-semibold text-white">{user.initials}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-fg">{user.name}</div>
              <div className="truncate text-[11.5px] text-subtle">{user.role}</div>
            </div>
            <form action={signOut}>
              <button className="rounded-lg p-2 text-subtle hover:bg-raised hover:text-fg" aria-label="Sign out" title="Sign out">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="lg:pl-[264px]">
        <header className={cx("sticky z-30 flex h-16 items-center gap-3 border-b border-line bg-canvas/80 px-4 backdrop-blur-md md:px-8", tenant.isDemo ? "top-8" : "top-0")}>
          <button className="-ml-1 rounded-lg p-2 text-muted hover:bg-raised lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="lg:hidden">
            <Logo compact />
          </div>
          <div className="ml-2 hidden min-w-0 flex-1 md:block lg:ml-0">
            <GlobalSearch />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="md:hidden"><GlobalSearch compact /></div>
            <Notifications items={notifications} />
            <Link href="/settings/profile" className="hidden items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-muted hover:bg-raised hover:text-fg sm:flex">
              <UserRound className="size-4" aria-hidden />
              <span className="max-w-40 truncate">{user.email}</span>
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1480px] px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

function TenantSwitcher({ tenant, tenants }: { tenant: ShellTenant; tenants: ShellTenant[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const multiple = tenants.length > 1;
  return (
    <div ref={ref} className="relative px-3">
      <button
        type="button"
        disabled={!multiple}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 text-left transition-colors enabled:hover:border-line-strong"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-raised text-[11px] font-semibold text-accent-hi">{tenant.name.slice(0, 2).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-fg">{tenant.name}</span>
          <span className="block text-[11px] text-subtle">{tenant.isDemo ? "Demo company" : "Company"}</span>
        </span>
        {multiple && <ChevronsUpDown className="size-4 text-subtle" aria-hidden />}
      </button>
      {open && (
        <div className="absolute inset-x-3 top-full z-10 mt-1 rounded-xl border border-line bg-raised p-1 shadow-[var(--shadow-pop)]" role="listbox">
          {tenants.map((t) => (
            <form key={t.id} action={switchTenant}>
              <input type="hidden" name="tenantId" value={t.id} />
              <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-fg hover:bg-[#1c2944]" role="option" aria-selected={t.id === tenant.id}>
                <span className="flex-1 truncate">{t.name}</span>
                {t.id === tenant.id && <Check className="size-4 text-accent-hi" />}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}

function Notifications({ items }: { items: ShellNotification[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const dot: Record<string, string> = { critical: "bg-bad", warning: "bg-warn", success: "bg-ok", info: "bg-accent" };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-muted hover:bg-raised hover:text-fg" aria-label={`Notifications (${items.length} unread)`} aria-expanded={open}>
        <Bell className="size-[18px]" />
        {items.length > 0 && (
          <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-4 font-semibold text-white tabular">{items.length}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-24px))] rounded-xl border border-line bg-raised shadow-[var(--shadow-pop)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {items.length > 0 && (
              <form action={markNotificationsRead}>
                <button className="text-xs text-accent-hi hover:underline">Mark all read</button>
              </form>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">You are all caught up.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {items.map((n) => (
                <li key={n.id}>
                  <Link href={n.link ?? "#"} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-[#1c2944]">
                    <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", dot[n.severity] ?? "bg-accent")} aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-fg">{n.title}</span>
                      {n.body && <span className="mt-0.5 block text-xs text-muted">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-subtle">{n.created}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
