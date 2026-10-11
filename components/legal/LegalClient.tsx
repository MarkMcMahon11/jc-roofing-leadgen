"use client";
import { useState } from "react";
import { consentsFor, defaultConsents, type Consents } from "@/lib/legal";
import { deviceId, localData, readAcceptance, saveAcceptance, useLegalStatus } from "@/lib/legal-client";

/** Section 5: change the optional choices (saved like the pop-up: this browser first, then our records). */
export function YourChoices() {
  const status = useLegalStatus();
  if (status === "unknown") return <p className="text-sm text-mute">Loading…</p>;
  return <ChoicesForm key={status} />;
}

function ChoicesForm() {
  const [c, setC] = useState<Consents>(() => readAcceptance()?.consents ?? defaultConsents());
  const [msg, setMsg] = useState("");
  const accepted = !!readAcceptance();
  const toggle = (id: string, on: boolean) => {
    const next = { ...c, [id]: on };
    setC(next);
    if (accepted) {
      saveAcceptance(next, "choices");
      setMsg("Saved.");
    }
  };
  return (
    <div className="space-y-2">
      {consentsFor("homeowner").map((x) => (
        <label key={x.id} className="flex gap-2.5 text-[0.9375rem] leading-snug">
          <input
            type="checkbox"
            className="mt-0.5 h-[18px] w-[18px] flex-none accent-[#b11017]"
            checked={!!c[x.id]}
            disabled={x.required || !accepted}
            onChange={(e) => toggle(x.id, e.target.checked)}
          />
          <span>{x.label} <span className="text-mute">{x.required ? "(needed to get a quote)" : "(optional)"}</span></span>
        </label>
      ))}
      <p aria-live="polite" className="min-h-5 text-sm text-mute">
        {accepted ? msg || "Changes save straight away." : "You'll make these choices when you start a quote."}
      </p>
      <p className="text-sm text-mute">Choices made here apply to new enquiries from this browser. To change an enquiry you&apos;ve already sent, contact us below.</p>
    </div>
  );
}

/** Section 6: download what we hold for this browser, or ask for deletion. */
export function YourData({ privacyEmail, phone }: { privacyEmail: string; phone: string }) {
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  async function download() {
    setBusy(true);
    let server: unknown = "Couldn't reach our records just now.";
    try {
      const r = await fetch(`/api/legal?device=${encodeURIComponent(deviceId())}`, { cache: "no-store" });
      if (r.ok) server = await r.json();
    } catch {
      /* keep the message */
    }
    const data = { exportedAt: new Date().toISOString(), inThisBrowser: localData(), onOurServer: server, yourEnquiry: `For a copy of your enquiry (name, contact details, address, photos) email ${privacyEmail}: we check it's you first.` };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "jc-roofing-my-data.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    setBusy(false);
  }

  async function requestDelete(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/legal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete-request", deviceId: deviceId(), contact, note }) });
      const j = await r.json().catch(() => ({}));
      setMsg(r.ok ? "Thanks. Your request has been sent to JC Roofing. They'll reply within one month." : (j.error ?? `Something went wrong. Please email ${privacyEmail}.`));
      if (r.ok) { setContact(""); setNote(""); }
    } catch {
      setMsg(`We couldn't send that. Please email ${privacyEmail} or call ${phone}.`);
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-xl border-[1.5px] border-line bg-white px-3 py-2.5 text-base";
  return (
    <div className="space-y-3">
      <button type="button" onClick={download} disabled={busy} className="min-h-11 rounded-xl border-[1.5px] border-line px-4 py-2.5 font-medium hover:bg-cream disabled:opacity-40">Download my data</button>
      <form onSubmit={requestDelete} className="space-y-2 rounded-xl bg-white p-3 ring-1 ring-line">
        <p className="font-semibold">Ask to delete my data</p>
        <label className="block text-sm">Phone or email you used<input className={input} value={contact} onChange={(e) => setContact(e.target.value)} required minLength={5} maxLength={120} autoComplete="email" /></label>
        <label className="block text-sm">Anything else (optional)<textarea className={input} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-brand px-4 py-2.5 font-semibold text-white disabled:opacity-40">Send request</button>
        <p aria-live="polite" className="min-h-5 text-sm">{msg}</p>
        <p className="text-sm text-mute">Or email <a href={`mailto:${privacyEmail}`} className="underline">{privacyEmail}</a> or call {phone}.</p>
      </form>
    </div>
  );
}
