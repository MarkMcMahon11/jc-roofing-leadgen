import { redirect } from "next/navigation";
import { FlaskConical, LogOut } from "lucide-react";
import { homeFor, requireTenant } from "@/lib/auth/context";
import { Logo } from "@/components/shell/logo";
import { signOut } from "@/components/shell/actions";
import { PortalNav } from "./portal-nav";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant();
  const scope = ctx.active.role.scope;
  if (scope !== "client" && scope !== "occupant") redirect(homeFor(ctx));
  const links = [
    { href: "/portal", label: "Overview" },
    { href: "/portal/jobs", label: "Jobs", perm: "work_orders.read" },
    { href: "/portal/request", label: "Request a repair", perm: "portal.request" },
    { href: "/portal/properties", label: "Properties", perm: "properties.read" },
    { href: "/portal/quotes", label: "Quotations", perm: "quotes.read" },
    { href: "/portal/invoices", label: "Invoices", perm: "finance.read" },
    { href: "/portal/contracts", label: "Contracts", perm: "contracts.read" },
  ].filter((l) => !l.perm || ctx.can(l.perm));
  return (
    <div className="min-h-dvh">
      {ctx.active.tenant.is_demo && (
        <div className="flex h-8 items-center justify-center gap-2 border-b border-[#57400f] bg-[#2a1f0a] text-[12px] font-medium text-[#ffcf7d]">
          <FlaskConical className="size-3.5" aria-hidden />DEMO ENVIRONMENT · sample data
        </div>
      )}
      <header className="border-b border-line bg-chrome/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 md:px-8">
          <Logo />
          <span className="hidden rounded-full border border-[#1d3d78] bg-accent-lo px-2.5 py-0.5 text-[11px] font-medium text-accent-hi sm:inline">Client portal</span>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-[13px] font-medium">{ctx.fullName}</div>
              <div className="text-[11px] text-subtle">{ctx.active.tenant.name}</div>
            </div>
            <form action={signOut}><button className="rounded-lg p-2 text-subtle hover:bg-raised hover:text-fg" aria-label="Sign out"><LogOut className="size-4" /></button></form>
          </div>
        </div>
        {scope === "client" && <PortalNav links={links} />}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        {scope === "client" ? children : (
          <div className="pm-card mx-auto max-w-lg p-8 text-center">
            <h1 className="text-xl font-semibold">Repair updates</h1>
            <p className="mt-2 text-sm text-muted">Your account is set up. Online repair tracking for residents has not been switched on by your landlord yet, so please keep using their usual repairs line. This page will show your repairs once it is enabled.</p>
          </div>
        )}
      </main>
    </div>
  );
}
