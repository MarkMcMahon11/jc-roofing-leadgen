import type { Metadata } from "next";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { getContext, homeFor } from "@/lib/auth/context";
import { buttonClass } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "No access" };

export default async function NoAccess({ searchParams }: PageProps<"/no-access">) {
  const sp = await searchParams;
  const ctx = await getContext();
  const noCompany = sp.reason === "no-company";
  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="pm-card max-w-md p-8 text-center">
        <ShieldX className="mx-auto size-10 text-warn" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">{noCompany ? "No active company" : "You do not have access to this"}</h1>
        <p className="mt-2 text-sm text-muted">
          {noCompany
            ? "Your account is not currently linked to an active company, or your invitation has not been accepted yet. Ask your administrator to check your access."
            : "Your role does not include the permission needed for this page. Your administrator can change role permissions under Settings."}
        </p>
        {typeof sp.need === "string" && !noCompany && <p className="mt-3 font-mono text-xs text-subtle">Needs: {sp.need}</p>}
        <div className="mt-6 flex justify-center gap-2">
          {ctx && !noCompany && <Link href={homeFor(ctx)} className={buttonClass("primary")}>Go to my home page</Link>}
          {!ctx && <Link href="/login" className={buttonClass("primary")}>Sign in</Link>}
        </div>
      </div>
    </div>
  );
}
