import Image from "next/image";
import type { ReactNode } from "react";
import { BrandScene } from "@/components/three/brand-scene";
import { Interactions } from "@/components/ui/interactions";
import { Logo } from "./logo";

/** Sign-in and account pages: a live 3D construction scene beside a glass form panel. */
export function AuthFrame({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,520px)]">
      <Interactions />
      <section className="relative hidden overflow-hidden border-r border-white/[0.07] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <BrandScene variant="hero" />
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_30%_100%,rgb(2_3_2/0.95),transparent_70%)]" />
        <div className="relative">
          <Logo />
        </div>
        <div className="relative max-w-xl">
          <div data-tilt className="pm-card mb-10 inline-flex w-[340px] items-center justify-center rounded-3xl px-8 py-7 [animation:pm-float_7s_ease-in-out_infinite]">
            <span className="pm-glare" aria-hidden />
            <Image src="/brand/pmj-logo.png" alt="PowerMac Joinery & Construction Limited" width={446} height={294} priority className="h-auto w-full drop-shadow-[0_0_22px_rgb(94_224_0/0.35)]" />
          </div>
          <p className="flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-accent-hi uppercase">
            <span className="h-px w-8 bg-gradient-to-r from-accent to-transparent" aria-hidden />
            One connected operation
          </p>
          <h2 className="pm-silver mt-3 font-display text-4xl leading-tight font-semibold tracking-tight xl:text-[42px]">
            Complete business intelligence for construction &amp; property maintenance.
          </h2>
          <ul className="mt-8 grid gap-3 text-sm text-muted">
            <li className="flex gap-3"><span className="mt-1.5 size-1.5 rounded-full bg-accent shadow-[0_0_8px_rgb(94_224_0)]" />Clients, contracts, properties and jobs in one live system</li>
            <li className="flex gap-3"><span className="mt-1.5 size-1.5 rounded-full bg-accent shadow-[0_0_8px_rgb(94_224_0)]" />Workforce scheduling, procurement and financial control</li>
            <li className="flex gap-3"><span className="mt-1.5 size-1.5 rounded-full bg-accent shadow-[0_0_8px_rgb(94_224_0)]" />Every client sees only its own data. Every change is audited.</li>
          </ul>
        </div>
        <p className="relative text-xs text-subtle">PowerMac Connect · built by BPOAI.AI</p>
      </section>
      <section className="relative flex flex-col justify-center px-6 py-12 sm:px-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_80%_0%,rgb(94_224_0/0.10),transparent_70%)]" />
        <div className="pm-rise relative mx-auto w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Image src="/brand/pmj-logo.png" alt="PowerMac Joinery & Construction Limited" width={446} height={294} priority className="mx-auto h-auto w-56 drop-shadow-[0_0_18px_rgb(94_224_0/0.35)]" />
          </div>
          <div className="pm-card px-6 py-7 sm:px-8">
            <h1 className="pm-silver font-display text-[28px] font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
            <div className="mt-7">{children}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
