"use client";
import type { InputHTMLAttributes, ReactNode } from "react";
import { SWATCH } from "@/lib/swatches";

/** One choice among several. `radio` shows a dot (list rows); without it the tile is compact (grids). */
export function Opt({ label, sub, on, onClick, radio = false }: { label: ReactNode; sub?: ReactNode; on?: boolean; onClick: () => void; radio?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={!!on}
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-2.5 text-left transition-colors ${on ? "border-brand bg-brand-tint" : "border-line bg-white hover:border-ink"}`}
    >
      {radio && (
        <span aria-hidden className={`grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-[1.5px] ${on ? "border-brand" : "border-line"}`}>
          {on && <span className="h-2 w-2 rounded-full bg-brand" />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-medium leading-snug">{label}</span>
        {sub && <span className="block text-[0.8125rem] leading-snug text-mute">{sub}</span>}
      </span>
    </button>
  );
}

/** Short either/or choices as one connected control. */
export function Seg({ options, value, onChange, labelledBy }: { options: [string, string][]; value?: string; onChange: (v: string) => void; labelledBy: string }) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="grid overflow-hidden rounded-xl border-[1.5px] border-line bg-white" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(([v, l], i) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`min-h-11 px-2 py-2.5 text-[0.9375rem] font-medium transition-colors ${i > 0 ? "border-l border-line" : ""} ${value === v ? "bg-brand-tint text-brand" : "hover:bg-cream"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Swatches({ colours, value, onChange, labelledBy }: { colours: string[]; value?: string; onChange: (c: string) => void; labelledBy: string }) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-x-4 gap-y-3">
      {colours.map((c) => (
        <button key={c} type="button" aria-pressed={value === c} onClick={() => onChange(c)} className="flex w-[4.5rem] flex-col items-center gap-1.5">
          <span aria-hidden className={`h-11 w-11 rounded-full border border-black/25 ring-offset-2 transition-shadow ${value === c ? "ring-2 ring-brand" : ""}`} style={{ background: SWATCH[c] ?? "#ccc" }} />
          <span className={`text-center text-[0.75rem] leading-tight ${value === c ? "font-semibold text-brand" : "text-mute"}`}>{c}</span>
        </button>
      ))}
    </div>
  );
}

/** A question heading. The first one on each step is the "step heading" that receives focus when the step changes. */
export const Label = ({ children, hint, id, first }: { children: ReactNode; hint?: string; id?: string; first?: boolean }) => (
  <div className="mb-2 mt-5 first:mt-0">
    <h2 id={id} tabIndex={-1} data-step-heading={first ? "" : undefined} className="text-[1.0625rem] font-semibold leading-snug outline-none">{children}</h2>
    {hint && <p className="text-[0.8125rem] text-mute">{hint}</p>}
  </div>
);

export const inputCls = "w-full rounded-xl border-[1.5px] border-line bg-white px-3.5 py-3 text-base focus:border-ink aria-[invalid=true]:border-brand";

/** Visible label + input + error text, wired together for screen readers. */
export function Field({ label, error, id, className = "", ...input }: { label: string; error?: string } & InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[0.8125rem] font-semibold">{label}</label>
      <input id={id} className={`${inputCls} ${className}`} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} {...input} />
      {error && <p id={`${id}-err`} aria-live="polite" className="mt-1 text-[0.8125rem] text-brand">{error}</p>}
    </div>
  );
}

/** Bottom bar that stays on screen so Next/Back are always reachable. */
export function StickyBar({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-10 -mx-4 mt-5 flex flex-wrap gap-2 border-t border-sand bg-white/95 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur">{children}</div>;
}
export const Primary = ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className="min-h-11 min-w-[9rem] flex-1 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-40">{children}</button>
);
export const Ghost = ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className="min-h-11 rounded-xl border-[1.5px] border-line px-4 py-3 text-base font-medium text-ink hover:bg-cream">{children}</button>
);
