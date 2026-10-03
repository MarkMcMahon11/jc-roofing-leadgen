"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, CalendarClock, CalendarDays, ExternalLink, Inbox, LayoutDashboard, LogOut, MapPinned, Menu, MessageSquare, PoundSterling, Printer, ShieldAlert, Truck, Users, Wallet, Wrench, X } from "lucide-react";
import { GuideProvider, GuideToggle, PageGuide } from "./Guide";
import { Button } from "./ui";
import { guideFor } from "@/lib/ops/guides";
import { buildAlerts, scheduleItems } from "@/lib/ops/selectors";
import { today } from "@/lib/ops/format";
import { useOps, type SyncState } from "@/lib/ops/store";

type Item = { href: string; icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>; label: string; badge?: number; tone?: "red" | "amber" };

export function Shell({ children, ownerName }: { children: React.ReactNode; ownerName: string }) {
  const { db, biz, sync, notice, clearNotice, resetFleet, day } = useOps();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);

  // the phone menu behaves like a dialog: focus moves in, Tab stays inside, Escape closes and focus goes back
  useEffect(() => {
    if (!open) return;
    const root = drawer.current;
    const focusable = () => [...(root?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, [tabindex]:not([tabindex='-1'])") ?? [])];
    focusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuBtn.current?.focus();
      } else if (e.key === "Tab") {
        const f = focusable();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const counts = useMemo(() => {
    const alerts = buildAlerts(db, biz.leads);
    return {
      newLeads: biz.leads.filter((l) => l.status === "new" && l.score !== "not-a-fit").length,
      todayVisits: scheduleItems(db, biz.leads, today(), today()).length,
      garage: db.vehicles.filter((v) => v.status === "in_garage").length,
      fines: db.fines.filter((f) => f.status === "to_name").length,
      docs: alerts.filter((a) => (a.group === "vans" || a.group === "crew" || a.group === "service") && a.severity !== "low").length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `day` makes the badges roll over at midnight
  }, [db, biz.leads, day]);

  const groups: { title?: string; items: Item[] }[] = [
    { items: [{ href: "/admin", icon: LayoutDashboard, label: "Dashboard" }] },
    {
      title: "Customers",
      items: [
        { href: "/admin/leads", icon: Inbox, label: "Leads and quotes", badge: counts.newLeads, tone: "red" },
        { href: "/admin/jobs", icon: CalendarDays, label: "Jobs and schedule", badge: counts.todayVisits, tone: "amber" },
        { href: "/admin/map", icon: MapPinned, label: "Project map" },
      ],
    },
    {
      title: "Vans and team",
      items: [
        { href: "/admin/vans", icon: Truck, label: "Vans" },
        { href: "/admin/crew", icon: Users, label: "Team" },
        { href: "/admin/maintenance", icon: Wrench, label: "Servicing", badge: counts.garage, tone: "amber" },
        { href: "/admin/fines", icon: ShieldAlert, label: "Fines and notices", badge: counts.fines, tone: "red" },
        { href: "/admin/documents", icon: CalendarClock, label: "Documents and deadlines", badge: counts.docs, tone: "amber" },
      ],
    },
    {
      title: "Money",
      items: [
        { href: "/admin/costs", icon: Wallet, label: "Costs" },
        { href: "/admin/reports", icon: Printer, label: "Reports" },
      ],
    },
    {
      title: "Settings",
      items: [
        { href: "/admin/pricing", icon: PoundSterling, label: "Quote prices" },
        { href: "/admin/messages", icon: MessageSquare, label: "Messages" },
        { href: "/admin/activity", icon: Activity, label: "Activity log" },
      ],
    },
  ];

  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));


  async function signOut() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    router.replace("/admin/login");
    router.refresh();
  }

  async function clearSample() {
    if (!confirm("Clear all the sample vans, team, jobs and costs? You'll start with an empty dashboard to enter your own. Your real enquiries are not affected.")) return;
    setBusy(true);
    await resetFleet("empty");
    setBusy(false);
  }

  const renderSidebar = (scrollAll: boolean) => (
    <div className={`flex h-full flex-col bg-white ${scrollAll ? "overflow-y-auto" : ""}`}>
      <div className="px-5 pb-3 pt-5">
        <Link href="/admin" onClick={() => setOpen(false)} aria-label="JC Roofing dashboard home">
          <Image src="/logo.png" alt="JC Roofing" width={512} height={198} priority className="h-14 w-auto" />
        </Link>
        <div className="mt-1 text-[11px] text-mute">Owner dashboard · Dumfries</div>
      </div>
      <nav aria-label="Dashboard sections" className={`flex-1 space-y-4 px-3 py-2 lg:space-y-3 ${scrollAll ? "" : "overflow-y-auto"}`}>
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.title && <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-mute">{g.title}</div>}
            <div className="space-y-0.5">
              {g.items.map((n) => {
                const active = isActive(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:min-h-9 lg:py-1.5 ${active ? "bg-brand-tint text-brand" : "text-ink hover:bg-cream"}`}
                  >
                    {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-brand" />}
                    <n.icon size={18} aria-hidden className={active ? "text-brand" : "text-mute group-hover:text-ink"} />
                    <span className="flex-1">{n.label}</span>
                    {!!n.badge && (
                      <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${n.tone === "amber" ? "bg-amber-100 text-amber-900" : "bg-brand text-white"}`}>
                        <span className="sr-only">, </span>
                        {n.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-sand p-3">
        <GuideToggle />
        <Link href="/" target="_blank" className="flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm text-mute hover:bg-cream hover:text-ink">
          <ExternalLink size={16} aria-hidden /> View customer quote form
        </Link>
        <button type="button" onClick={signOut} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-mute hover:bg-cream hover:text-ink">
          <LogOut size={16} aria-hidden /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <GuideProvider>
      <div className="admin-root min-h-screen bg-cream transition-[padding] duration-200 lg:pl-64 print:pl-0">
        <a href="#main" className="sr-only z-[2000] rounded-lg bg-white px-4 py-2 font-semibold text-brand focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
        <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-sand lg:block print:hidden">{renderSidebar(false)}</aside>

        {open && (
          <div ref={drawer} id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-[1250] lg:hidden">
            <div className="absolute inset-0 bg-ink/50" onClick={() => { setOpen(false); menuBtn.current?.focus(); }} />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] shadow-xl">{renderSidebar(true)}</aside>
            <button type="button" onClick={() => { setOpen(false); menuBtn.current?.focus(); }} className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-white text-ink shadow" aria-label="Close menu">
              <X size={20} />
            </button>
          </div>
        )}

        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-sand bg-white/90 px-4 backdrop-blur sm:px-6 print:hidden">
          <button ref={menuBtn} type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls={open ? "mobile-menu" : undefined} className="-ml-2 grid h-11 w-11 place-items-center rounded-lg text-ink hover:bg-cream lg:hidden" aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="lg:hidden">
            <Image src="/logo.png" alt="JC Roofing" width={512} height={198} className="h-8 w-auto" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <SyncPill state={sync} />
            {biz.storage !== "database" && (
              <span title="Data isn't being kept permanently yet. Connect the database (see the README)." className="hidden whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-300 sm:inline">
                Temporary storage
              </span>
            )}
            <div className="hidden items-center gap-2 sm:flex">
              <div aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-brand text-xs font-bold text-white">{ownerName.slice(0, 1).toUpperCase()}</div>
              <span className="max-w-[12rem] truncate text-sm font-medium text-ink">{ownerName}</span>
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="@container mx-auto max-w-[1400px] px-4 py-6 outline-none sm:px-6 lg:py-8 print:max-w-none print:p-0">
          {db.sample && (
            <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-gold/70 bg-amber-50 p-4 text-sm text-ink sm:flex-row sm:items-center sm:justify-between print:hidden">
              <p>
                <b>Sample data.</b> The vans, team, jobs and costs below are made up so you can see how the dashboard works. Your enquiries and quote prices are real.
              </p>
              <Button variant="secondary" onClick={clearSample} disabled={busy} className="shrink-0">
                {busy ? "Clearing…" : "Clear sample data"}
              </Button>
            </div>
          )}
          {notice && (
            <div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-brand bg-brand-tint p-4 text-sm text-brand print:hidden">
              <p>{notice}</p>
              <button type="button" onClick={clearNotice} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-white" aria-label="Dismiss">
                <X size={16} />
              </button>
            </div>
          )}
          <SectionGuide path={path} />
          {children}
        </main>
      </div>
    </GuideProvider>
  );
}

function SyncPill({ state }: { state: SyncState }) {
  const cfg = {
    saved: { dot: "bg-emerald-600", text: "Saved", cls: "text-emerald-800" },
    saving: { dot: "bg-amber-500 animate-pulse", text: "Saving…", cls: "text-amber-800" },
    error: { dot: "bg-brand", text: "Offline, will retry", cls: "text-brand" },
    rejected: { dot: "bg-brand", text: "Some changes weren't saved", cls: "text-brand" },
  }[state];
  return (
    <span role="status" className={`flex items-center gap-1.5 text-xs font-medium ${cfg.cls}`} title={cfg.text}>
      <span aria-hidden className={`h-2 w-2 rounded-full ${cfg.dot}`} />
      <span className="hidden whitespace-nowrap sm:inline">{cfg.text}</span>
      <span className="sr-only sm:hidden">{cfg.text}</span>
    </span>
  );
}

function SectionGuide({ path }: { path: string }) {
  const found = guideFor(path);
  if (!found) return null;
  return <PageGuide id={found.id} title={found.g.title} steps={found.g.steps} />;
}

