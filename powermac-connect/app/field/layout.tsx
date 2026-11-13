import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { FlaskConical, LogOut } from "lucide-react";
import { homeFor, requireTenant } from "@/lib/auth/context";
import { Logo } from "@/components/shell/logo";
import { signOut } from "@/components/shell/actions";
import { OfflineBar } from "./offline";

export const metadata: Metadata = { title: "My jobs", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { themeColor: "#060a14", width: "device-width", initialScale: 1, viewportFit: "cover" };

// Mobile app for operatives and subcontractors: one hand, big targets, works with poor signal.
export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant();
  if (!["operative", "subcontractor"].includes(ctx.active.role.scope)) redirect(homeFor(ctx));
  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-24">
      {ctx.active.tenant.is_demo && (
        <div className="flex items-center justify-center gap-1.5 bg-[#2a1f0a] px-3 py-1 text-[11px] font-medium text-[#ffcf7d]">
          <FlaskConical className="size-3" aria-hidden /> DEMO · sample data
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas/90 px-4 backdrop-blur">
        <Logo compact />
        <div className="min-w-0 flex-1 px-3">
          <div className="truncate text-sm font-medium">{ctx.fullName}</div>
          <div className="truncate text-[11px] text-subtle">{ctx.active.role.name} · {ctx.active.tenant.name}</div>
        </div>
        <form action={signOut}>
          <button className="rounded-lg p-2.5 text-subtle hover:bg-raised" aria-label="Sign out"><LogOut className="size-5" /></button>
        </form>
      </header>
      <OfflineBar />
      <main className="px-4 pt-4">{children}</main>
    </div>
  );
}
