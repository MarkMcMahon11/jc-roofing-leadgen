"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "./ui";
import { AGREEMENT_ID, AGREEMENT_POINTS, agreementLabel, CLIENT_COMPANY, LEGAL_VERSION, type Consents } from "@/lib/legal";
import { ownerLocal, retryOwnerPending, saveOwnerAcceptance, useOwnerLocal } from "@/lib/legal-client";

const OWNER_CONSENTS: Consents = { privacy: true, [AGREEMENT_ID]: true };

/** The two ticks and the accept button, used by the first-open pop-up and by "Accept now" on the Legal page. */
export function AgreementForm({ ownerName, onDone }: { ownerName: string; onDone?: (savedOnServer: boolean) => void }) {
  const [privacy, setPrivacy] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function accept() {
    setBusy(true);
    const ok = await saveOwnerAcceptance({ privacy, [AGREEMENT_ID]: agree }, ownerName, LEGAL_VERSION);
    setBusy(false);
    if (!ok) setMsg("Accepted in this browser. We couldn't reach the database just now, so it will be recorded on the server next time.");
    onDone?.(ok);
  }

  return (
    <div className="space-y-3 text-sm">
      <ul className="list-disc space-y-1 pl-5 text-steel">{AGREEMENT_POINTS.map((p) => <li key={p}>{p}</li>)}</ul>
      <p>
        <Link href="/legal#business" target="_blank" className="font-semibold text-brand underline">Read the full Legal &amp; privacy page<span className="sr-only"> (opens in a new tab)</span></Link>
      </p>
      <label className="flex gap-2.5">
        <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] flex-none accent-[#b11017]" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
        <span>I&apos;ve read the privacy notice. <span className="text-steel">(required)</span></span>
      </label>
      <label className="flex gap-2.5">
        <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] flex-none accent-[#b11017]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>{agreementLabel()} <span className="text-steel">(required)</span></span>
      </label>
      <p className="text-steel">Signing as <b className="text-night">{ownerName}</b> (owner) for {CLIENT_COMPANY}.</p>
      <Button onClick={accept} disabled={!privacy || !agree || busy}>{busy ? "Saving…" : "I agree and continue"}</Button>
      {msg && <p role="status" className="text-amber-900">{msg}</p>}
    </div>
  );
}

/**
 * First time the owner opens the dashboard (and whenever LEGAL_VERSION changes): accept the Service Agreement and
 * Data Processing Agreement on behalf of JC Roofing. `serverAccepted` is null if the records couldn't be read.
 */
export function OwnerAgreementGate({ serverAccepted, ownerName }: { serverAccepted: boolean | null; ownerName: string }) {
  const raw = useOwnerLocal();
  const local = raw ? ownerLocal() : null;
  const localOk = local?.version === LEGAL_VERSION;
  const ref = useRef<HTMLDivElement>(null);
  const show = raw !== null && serverAccepted !== true && !localOk;

  // accepted here earlier but the server didn't get it: send it again
  useEffect(() => {
    if (serverAccepted === false && localOk) void retryOwnerPending(OWNER_CONSENTS);
  }, [serverAccepted, localOk]);

  // focus stays inside; Escape does nothing (an answer is needed)
  useEffect(() => {
    if (!show) return;
    const root = ref.current;
    if (!root) return;
    root.querySelector<HTMLElement>("h2")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
      if (e.key !== "Tab") return;
      const f = [...root.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])")];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [show]);

  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[3000] overflow-y-auto bg-silver print:hidden">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="owner-legal-title" className="mx-auto w-full max-w-lg px-4 py-8">
        <div className="elev rounded-3xl p-5">
          <p className="flex items-center gap-2 text-xs font-semibold text-emerald-700"><ShieldCheck size={16} aria-hidden /> Privacy and security are built into your dashboard</p>
          <h2 id="owner-legal-title" tabIndex={-1} className="mt-2 text-lg font-semibold text-night outline-none">Your privacy &amp; our agreement</h2>
          <p className="mb-3 mt-1 text-sm text-steel">Before you use the dashboard, please accept the Service Agreement and Data Processing Agreement (version {LEGAL_VERSION}) for {CLIENT_COMPANY}.</p>
          <AgreementForm ownerName={ownerName} />
        </div>
      </div>
    </div>
  );
}
