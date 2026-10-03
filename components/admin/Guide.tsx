"use client";

// Guided mode for new staff: a tip at the top of each section ("what this page is for, what to do") and a
// "what next" card after saving a form. Tips can be hidden one by one ("Got it") or all at once in the side menu.
// Saved on this device only.

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ArrowRight, Lightbulb, X } from "lucide-react";

type NextStep = { title: string; body: string; href?: string; action?: string };
type Ctx = {
  on: boolean;
  setOn: (v: boolean) => void;
  dismissed: Set<string>;
  dismiss: (id: string) => void;
  resetTips: () => void;
  next: (s: NextStep) => void;
};

const GuideCtx = createContext<Ctx>({ on: false, setOn: () => {}, dismissed: new Set(), dismiss: () => {}, resetTips: () => {}, next: () => {} });
const KEY_ON = "jc-guide-on";
const KEY_DISMISSED = "jc-guide-dismissed";

const read = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

export function GuideProvider({ children }: { children: React.ReactNode }) {
  const [on, setOnState] = useState(false); // set after hydration (default on for a new device)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<NextStep | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore saved preference after hydration
    setOnState(read(KEY_ON, true));
    setDismissed(new Set(read<string[]>(KEY_DISMISSED, [])));
  }, []);

  const setOn = useCallback((v: boolean) => {
    setOnState(v);
    write(KEY_ON, v);
    if (!v) setStep(null);
  }, []);
  const dismiss = useCallback((id: string) => {
    setDismissed((s) => {
      const n = new Set(s).add(id);
      write(KEY_DISMISSED, [...n]);
      return n;
    });
  }, []);
  const resetTips = useCallback(() => {
    setDismissed(new Set());
    write(KEY_DISMISSED, []);
    setOn(true);
  }, [setOn]);
  const next = useCallback((s: NextStep) => setStep(s), []);

  useEffect(() => {
    if (!step) return;
    const id = setTimeout(() => setStep(null), 14_000);
    return () => clearTimeout(id);
  }, [step]);

  return (
    <GuideCtx.Provider value={{ on, setOn, dismissed, dismiss, resetTips, next }}>
      {children}
      {on && step && <NextStepCard step={step} onClose={() => setStep(null)} />}
    </GuideCtx.Provider>
  );
}

export const useGuide = () => useContext(GuideCtx);

/** Call after a form is saved: shows "what next" (only while guided mode is on). */
export const useNextStep = () => useGuide().next;

function NextStepCard({ step, onClose }: { step: NextStep; onClose: () => void }) {
  const here = typeof window !== "undefined" && step.href === window.location.pathname + window.location.search;
  return (
    <div role="status" className="fixed bottom-4 left-4 right-4 z-[1150] mx-auto max-w-md rounded-2xl bg-ink p-4 text-sm text-white shadow-2xl ring-1 ring-white/10 sm:left-auto sm:right-5 sm:mx-0 print:hidden">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 rounded-full bg-emerald-500/20 p-1.5 text-emerald-300">✓</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{step.title}</div>
          <div className="mt-1 text-stone-300">{step.body}</div>
          {step.href && !here && step.action && (
            <div className="mt-3">
              <Link href={step.href} onClick={onClose} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-semibold text-ink hover:bg-cream">
                {step.action} <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-stone-300 hover:bg-white/10 hover:text-white" aria-label="Close">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/** Tip at the top of a section: what it is for and the usual steps. */
export function PageGuide({ id, title, steps }: { id: string; title: string; steps: string[] }) {
  const { on, dismissed, dismiss } = useGuide();
  const [open, setOpen] = useState(false); // on phones the steps stay folded away until asked for
  if (!on || dismissed.has(id)) return null;
  return (
    <div className="mb-5 rounded-2xl border border-gold/60 bg-amber-50 p-4 text-sm text-ink print:hidden">
      <div className="flex items-start gap-3">
        <Lightbulb size={18} aria-hidden className="mt-0.5 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{title}</div>
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="min-h-10 text-xs font-medium underline sm:hidden">{open ? "Hide the steps" : "Show the steps"}</button>
          <ol className={`mt-1.5 list-decimal space-y-1 pl-5 text-ink/90 ${open ? "block" : "hidden sm:block"}`}>
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
        <button type="button" onClick={() => dismiss(id)} className="min-h-10 shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-ink ring-1 ring-gold hover:bg-amber-100">
          Got it
        </button>
      </div>
    </div>
  );
}

/** Side-menu switch: tips on/off, and bring hidden tips back. */
export function GuideToggle() {
  const { on, setOn, resetTips, dismissed } = useGuide();
  return (
    <div className="px-3 py-1 text-sm text-mute">
      <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 rounded-lg hover:text-ink">
        <span className="flex items-center gap-3">
          <Lightbulb size={16} aria-hidden /> Usage tips
        </span>
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-4 w-4 accent-[#b11017]" />
      </label>
      {on && dismissed.size > 0 && (
        <button type="button" onClick={resetTips} className="pl-7 text-xs underline hover:text-ink">
          Show tips again
        </button>
      )}
    </div>
  );
}
