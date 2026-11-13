import type { ReactNode } from "react";
import { Logo } from "./logo";

/** Split-screen frame for sign-in and account pages. */
export function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,520px)]">
      <section className="relative hidden overflow-hidden border-r border-line bg-chrome lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_400px_at_20%_20%,rgb(47_125_255/0.18),transparent_70%)]" />
        <Logo />
        <div className="relative max-w-lg">
          <p className="text-xs font-medium tracking-[0.16em] text-accent-hi uppercase">One connected operation</p>
          <h2 className="mt-3 text-4xl leading-tight font-semibold tracking-tight text-fg">Complete business intelligence for construction &amp; property maintenance.</h2>
          <ul className="mt-8 grid gap-3 text-sm text-muted">
            <li className="flex gap-3"><span className="mt-1.5 size-1.5 rounded-full bg-accent" />Clients, contracts, properties and jobs in one live system</li>
            <li className="flex gap-3"><span className="mt-1.5 size-1.5 rounded-full bg-accent" />Workforce scheduling, procurement and financial control</li>
            <li className="flex gap-3"><span className="mt-1.5 size-1.5 rounded-full bg-accent" />Every client sees only its own data. Every change is audited.</li>
          </ul>
        </div>
        <p className="relative text-xs text-subtle">PowerMac Connect · built by BPOAI.AI</p>
      </section>
      <section className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 lg:hidden"><Logo /></div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </div>
  );
}
