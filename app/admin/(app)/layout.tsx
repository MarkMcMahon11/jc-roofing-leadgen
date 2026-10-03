import { redirect } from "next/navigation";
import { Shell } from "@/components/admin/Shell";
import { OpsProvider } from "@/lib/ops/store";
import { ownerSession } from "@/lib/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Real check (the proxy in front is only an optimistic gate)
  const session = await ownerSession();
  if (!session) redirect("/admin/login");

  return (
    <OpsProvider>
      <Shell ownerName={session.name}>{children}</Shell>
    </OpsProvider>
  );
}
