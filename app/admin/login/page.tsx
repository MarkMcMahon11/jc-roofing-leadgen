"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CalendarClock, MapPinned, Truck, Inbox } from "lucide-react";

const POINTS: [React.ComponentType<{ size?: number; className?: string }>, string][] = [
  [Inbox, "New enquiries and instant quotes, with the customer's photos"],
  [MapPinned, "Every project on a map, from first enquiry to finished roof"],
  [Truck, "Vans and crew sent to the right job, with clashes flagged"],
  [CalendarClock, "MOT, tax, insurance, servicing and CSCS dates before they run out"],
];

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/admin";
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: String(f.get("email") ?? ""), password: String(f.get("password") ?? "") }),
      });
      if (res.ok) {
        router.replace(next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin");
        router.refresh();
        return;
      }
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setPending(false);
  }

  return (
    <div className="admin-bg grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#c8161e] via-brand to-[#6f0a10] p-12 text-white shadow-[12px_0_40px_-20px_rgba(18,24,38,0.6)] lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-black/20 blur-3xl" />
        <div className="relative">
          <span className="elev inline-block rounded-2xl px-5 py-3 shadow-2xl">
            <Image src="/logo.png" alt="JC Roofing" width={512} height={198} priority className="h-16 w-auto" />
          </span>
          <div className="mt-3 text-xs text-white">JC Roofing Dumfries · Heathhall, Dumfries</div>
        </div>
        <div className="relative max-w-md">
          <p className="text-4xl font-bold leading-tight tracking-tight">Your whole roofing business, on one screen.</p>
          <ul className="mt-8 space-y-4 text-white/90">
            {POINTS.map(([Icon, text]) => (
              <li key={text} className="flex gap-3">
                <Icon size={20} className="mt-0.5 shrink-0 text-white" />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-white/95">Owner access only</div>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="elev w-full max-w-sm rounded-3xl p-7 sm:p-8">
          <div className="mb-8 lg:hidden">
            <Image src="/logo.png" alt="JC Roofing" width={512} height={198} priority className="h-14 w-auto" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-night">Sign in to the dashboard</h1>
          <p className="mt-1 text-sm text-steel">Owner access only.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-night">Email</span>
              <input name="email" type="email" required autoComplete="username" className="field-3d mt-1 w-full rounded-xl border-[1.5px] border-ctrl bg-white px-3.5 py-3 text-base outline-none focus:border-night" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-night">Password</span>
              <input name="password" type="password" required autoComplete="current-password" className="field-3d mt-1 w-full rounded-xl border-[1.5px] border-ctrl bg-white px-3.5 py-3 text-base outline-none focus:border-night" />
            </label>
            {error && (
              <p role="alert" className="rounded-xl bg-brand-tint px-3 py-2 text-sm text-brand">
                {error}
              </p>
            )}
            <button disabled={pending} className="btn-red min-h-11 w-full rounded-xl px-4 py-3 text-base font-semibold text-white transition disabled:opacity-60">
              {pending ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-6 text-xs text-steel">Forgotten your password? It&apos;s the owner password set up with the site. Ask whoever set it up to reset it.</p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
