"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Primary } from "./ui";
import { BUSINESS } from "@/lib/config";
import { consentsFor, defaultConsents, requiredMet, type Consents } from "@/lib/legal";
import { retryPending, saveAcceptance, useLegalStatus } from "@/lib/legal-client";

/**
 * "Your privacy & our agreement": shown before the quote form on the first visit and whenever LEGAL_VERSION changes.
 * Nothing behind it is rendered (or tracked) until the required boxes are ticked. Escape does not close it.
 */
export default function LegalGate({ children }: { children: React.ReactNode }) {
  const status = useLegalStatus();
  useEffect(() => {
    if (status === "accepted") retryPending();
  }, [status]);
  if (status === "unknown") return <p role="status" className="p-8 text-center text-mute">Loading…</p>;
  if (status === "needed") return <PrivacyDialog />;
  return <>{children}</>;
}

export function PrivacyDialog() {
  const [c, setC] = useState<Consents>(() => defaultConsents("homeowner"));
  const ref = useRef<HTMLDivElement>(null);
  const ok = requiredMet(c);

  // Focus moves into the dialog and Tab stays inside it. Escape is deliberately ignored: an answer is needed.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const focusable = () => [...root.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])")];
    root.querySelector<HTMLElement>("h1")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
      if (e.key !== "Tab") return;
      const f = focusable();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-cream">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="legal-title" aria-describedby="legal-intro" className="mx-auto w-full max-w-lg px-4 py-6">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
          <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-green-800">
            <ShieldCheck size={18} aria-hidden /> Privacy and security are built into {BUSINESS.name}&apos;s quote app
          </p>
          <h1 id="legal-title" tabIndex={-1} className="mt-2 text-[1.25rem] font-bold leading-tight outline-none">Your privacy &amp; our agreement</h1>
          <p id="legal-intro" className="mt-1 text-[0.875rem] text-mute">Before you get your price, here&apos;s what happens to your details.</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[0.875rem] leading-snug">
            <li><b className="font-semibold">What we hold:</b> your name, phone, email, the property address, your answers and any photos you add.</li>
            <li><b className="font-semibold">Why:</b> to give you a guide price, contact you about it and book a free inspection.</li>
            <li><b className="font-semibold">Where:</b> stored securely in London, UK. Only {BUSINESS.name} sees your enquiry.</li>
            <li><b className="font-semibold">Never sold:</b> we never sell your information or use it for anything you haven&apos;t agreed to.</li>
            <li><b className="font-semibold">Your rights:</b> see, correct or delete your data, or change your mind, at any time.</li>
          </ul>
          <p className="mt-2 text-[0.875rem]">
            <Link href="/legal" target="_blank" className="font-semibold text-brand underline">Read the full Legal &amp; privacy page<span className="sr-only"> (opens in a new tab)</span></Link>
          </p>

          <fieldset className="mt-4 space-y-2.5">
            <legend className="mb-1 text-[0.875rem] font-semibold">Your choices</legend>
            {consentsFor("homeowner").map((x) => (
              <label key={x.id} className="flex gap-2.5 text-[0.875rem] leading-snug">
                <input
                  type="checkbox"
                  className="mt-0.5 h-[18px] w-[18px] flex-none accent-[#b11017]"
                  checked={!!c[x.id]}
                  onChange={(e) => setC((p) => ({ ...p, [x.id]: e.target.checked }))}
                  aria-required={x.required}
                />
                <span>{x.label} <span className="text-mute">{x.required ? "(required)" : "(optional)"}</span></span>
              </label>
            ))}
          </fieldset>
          {!ok && <p className="mt-2 text-[0.8125rem] text-mute">Tick the two required boxes to continue.</p>}
          <div className="mt-4 flex">
            <Primary disabled={!ok} onClick={() => saveAcceptance(c)}>I agree and continue</Primary>
          </div>
          <p className="mt-3 text-[0.75rem] text-mute">Prefer to talk instead? Call {BUSINESS.phone}.</p>
        </div>
      </div>
    </div>
  );
}
