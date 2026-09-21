"use client";
import type { ReactNode } from "react";
import { SWATCH } from "@/lib/swatches";

/** One choice among several. `radio` shows a dot (list rows); without it the tile is compact (grids). */
export function Opt({ label, sub, on, onClick, radio = false }: { label: ReactNode; sub?: ReactNode; on?: boolean; onClick: () => void; radio?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={!!on}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-2.5 text-left transition-colors ${on ? "border-brand bg-brand-tint" : "border-sand bg-white hover:border-ink/50"}`}
    >
      {radio && (
        <span aria-hidden className={`grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-[1.5px] ${on ? "border-brand" : "border-sand"}`}>
          {on && <span className="h-2 w-2 rounded-full bg-brand" />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-snug">{label}</span>
        {sub && <span className="block text-[13px] leading-snug text-mute">{sub}</span>}
      </span>
    </button>
  );
}

/** Short either/or choices as one connected control. */
export function Seg({ options, value, onChange }: { options: [string, string][]; value?: string; onChange: (v: string) => void }) {
  return (
    <div role="group" className="grid overflow-hidden rounded-xl border-[1.5px] border-sand bg-white" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map(([v, l], i) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`px-2 py-2.5 text-[15px] font-medium transition-colors ${i > 0 ? "border-l border-sand" : ""} ${value === v ? "bg-brand-tint text-brand" : "hover:bg-cream"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function Swatches({ colours, value, onChange }: { colours: string[]; value?: string; onChange: (c: string) => void }) {
  return (
    <div role="group" aria-label="Colour" className="flex flex-wrap gap-x-4 gap-y-3">
      {colours.map((c) => (
        <button key={c} type="button" aria-pressed={value === c} aria-label={c} onClick={() => onChange(c)} className="flex w-[64px] flex-col items-center gap-1.5">
          <span className={`h-10 w-10 rounded-full border border-black/15 ring-offset-2 transition-shadow ${value === c ? "ring-2 ring-brand" : ""}`} style={{ background: SWATCH[c] ?? "#ccc" }} />
          <span className={`text-center text-[12px] leading-tight ${value === c ? "font-semibold text-brand" : "text-mute"}`}>{c}</span>
        </button>
      ))}
    </div>
  );
}

export const Label = ({ children, hint }: { children: ReactNode; hint?: string }) => (
  <div className="mb-2 mt-5 first:mt-0">
    <h2 className="text-[17px] font-semibold leading-snug">{children}</h2>
    {hint && <p className="text-[13px] text-mute">{hint}</p>}
  </div>
);

export const inputCls = "w-full rounded-xl border-[1.5px] border-sand bg-white px-3.5 py-3 text-base focus:border-ink";

/** Bottom bar that stays on screen so Next/Back are always reachable. */
export function StickyBar({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-10 -mx-4 mt-5 flex gap-2 border-t border-sand bg-white/95 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur">{children}</div>;
}
export const Primary = ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className="flex-1 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-40">{children}</button>
);
export const Ghost = ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...p} className="rounded-xl border-[1.5px] border-sand px-4 py-3 text-base font-medium text-ink hover:bg-cream">{children}</button>
);
