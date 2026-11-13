import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { Logo } from "@/components/shell/logo";

export const metadata: Metadata = { title: "Setup required" };

// Shown only when the deployment has no database configured.
export default function SetupPage() {
  if (isSupabaseConfigured()) redirect("/");
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Logo />
      <h1 className="mt-10 text-2xl font-semibold">Connect a Supabase project to start</h1>
      <p className="mt-2 text-muted">PowerMac Connect stores everything in your own Supabase (PostgreSQL) project. This deployment has no database configured yet.</p>
      <ol className="mt-8 list-decimal space-y-3 pl-5 text-sm text-muted">
        <li>Create a Supabase project in a UK/EU region (London recommended for UK GDPR data residency).</li>
        <li>Apply the migrations in <code className="font-mono text-accent-hi">supabase/migrations</code> (<code className="font-mono">supabase db push</code>).</li>
        <li>Set <code className="font-mono text-accent-hi">NEXT_PUBLIC_SUPABASE_URL</code>, <code className="font-mono text-accent-hi">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, <code className="font-mono text-accent-hi">SUPABASE_SERVICE_ROLE_KEY</code> and <code className="font-mono text-accent-hi">NEXT_PUBLIC_SITE_URL</code> on the host, then redeploy.</li>
        <li>Create the first company and administrator (see <code className="font-mono">docs/DEPLOYMENT.md</code>).</li>
      </ol>
    </div>
  );
}
