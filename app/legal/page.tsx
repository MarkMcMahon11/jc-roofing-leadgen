import Link from "next/link";
import { BUSINESS } from "@/lib/config";
import { getLegalDoc } from "@/lib/store";
import {
  AGREEMENT_POINTS, CLIENT_COMPANY, DATA_WE_HOLD, DRAFT_NOTE, LAW, LEGAL_VERSION, NEVER_SOLD, OPERATOR, ownerAcceptance,
  RETENTION, RIGHTS, SUBPROCESSORS, TERMS, WHERE_STORED, WHY, type LegalRecord,
} from "@/lib/legal";
import { YourChoices, YourData } from "@/components/legal/LegalClient";

export const metadata = { title: `Legal & privacy – ${BUSINESS.name}` };
export const dynamic = "force-dynamic"; // shows the live agreement record

const SECTIONS = [
  ["privacy", "Privacy notice"],
  ["terms", "Terms of use"],
  ["business", "For business clients"],
  ["sharing", "Who we share data with"],
  ["choices", "Your choices"],
  ["your-data", "Your data"],
  ["contact", "Contact & DPO"],
] as const;

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

export default async function LegalPage() {
  let agreement: LegalRecord | null = null;
  let recordsOk = true;
  try {
    agreement = ownerAcceptance(await getLegalDoc());
  } catch {
    recordsOk = false;
  }
  const h2 = "scroll-mt-4 pt-4 text-lg font-bold";

  return (
    <main className="mx-auto w-full max-w-xl space-y-3 px-4 py-8 leading-relaxed">
      <Link href="/" className="inline-block min-h-11 py-2 text-mute underline">← Back to your quote</Link>
      <h1 className="text-2xl font-bold">Legal &amp; privacy</h1>
      <p className="rounded-xl bg-green-50 p-3 text-sm text-green-900">Privacy and security are built into {BUSINESS.name}&apos;s quote app. {NEVER_SOLD}</p>

      <nav aria-label="On this page" className="rounded-xl bg-white p-3 text-sm ring-1 ring-line">
        <ol className="list-decimal space-y-0.5 pl-5">
          {SECTIONS.map(([id, label]) => <li key={id}><a href={`#${id}`} className="inline-block py-1 underline">{label}</a></li>)}
        </ol>
      </nav>

      <h2 id="privacy" className={h2}>1. Privacy notice</h2>
      <p>{BUSINESS.name} ({BUSINESS.address}) is the controller of the information you give us here. The app is supplied and run for them by {OPERATOR.company} ({OPERATOR.name}), which handles it only on their instructions. The law that applies is {LAW.name}.</p>
      <h3 className="font-semibold">What we hold</h3>
      <ul className="list-disc space-y-1 pl-5">{DATA_WE_HOLD.map((x) => <li key={x}>{x}</li>)}</ul>
      <h3 className="font-semibold">Why, and our legal basis</h3>
      <ul className="list-disc space-y-1 pl-5">{WHY.map((x) => <li key={x}>{x}</li>)}</ul>
      <h3 className="font-semibold">Where it&apos;s stored</h3>
      <p>{WHERE_STORED}</p>
      <h3 className="font-semibold">How long we keep it</h3>
      <p>{RETENTION}</p>
      <h3 className="font-semibold">Who it&apos;s shared with</h3>
      <p>Only the services listed under <a href="#sharing" className="underline">Who we share data with</a>, each under contract and only to run this app. {NEVER_SOLD}</p>
      <h3 className="font-semibold">Your rights</h3>
      <ul className="list-disc space-y-1 pl-5">{RIGHTS.map((x) => <li key={x}>{x}</li>)}</ul>
      <p>To complain to the regulator, contact the {LAW.regulator}: <a href={LAW.complainUrl} className="underline" target="_blank" rel="noreferrer">{LAW.complainUrl.replace("https://", "")}</a>.</p>
      <p className="text-sm text-mute">More detail (address search, messages, WhatsApp, suppliers): <Link href="/privacy" className="underline">full privacy notice</Link>.</p>

      <h2 id="terms" className={h2}>2. Terms of use</h2>
      <ul className="list-disc space-y-1 pl-5">{TERMS.map((x) => <li key={x}>{x}</li>)}</ul>

      <h2 id="business" className={h2}>3. For business clients: Service Agreement &amp; Data Processing Agreement</h2>
      <p>Between {OPERATOR.company} (the app operator, processor) and {CLIENT_COMPANY} (the controller). Current version: <b>{LEGAL_VERSION}</b>. Key points:</p>
      <ul className="list-disc space-y-1 pl-5">{AGREEMENT_POINTS.map((x) => <li key={x}>{x}</li>)}</ul>
      {agreement ? (
        <p className="rounded-xl bg-green-50 p-3 text-sm text-green-900">Accepted by {agreement.name ?? "the owner"} (owner) for {agreement.company} on {fmt(agreement.at)}, version {agreement.version}.</p>
      ) : (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <p>{recordsOk ? `Not yet accepted by ${CLIENT_COMPANY} for version ${LEGAL_VERSION}.` : "The acceptance record can't be shown just now."}</p>
          {recordsOk && <Link href="/admin/legal" className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-brand px-4 font-semibold text-white">Accept now (owner sign-in)</Link>}
        </div>
      )}

      <h2 id="sharing" className={h2}>4. Who we share data with</h2>
      <div className="overflow-x-auto rounded-xl ring-1 ring-line">
        <table className="w-full min-w-[30rem] bg-white text-left text-sm">
          <thead className="bg-cream"><tr><th className="p-2">Service</th><th className="p-2">What for</th><th className="p-2">Where</th></tr></thead>
          <tbody>
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name} className="border-t border-sand">
                <td className="p-2 font-medium">{s.name}{s.status === "planned" && <span className="ml-1 text-xs text-mute">(planned)</span>}</td>
                <td className="p-2">{s.purpose}</td>
                <td className="p-2">{s.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="choices" className={h2}>5. Your choices</h2>
      <YourChoices />

      <h2 id="your-data" className={h2}>6. Your data</h2>
      <YourData privacyEmail={BUSINESS.email} phone={BUSINESS.phone} />

      <h2 id="contact" className={h2}>7. Contact &amp; Data Protection Officer</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>About your enquiry: {BUSINESS.name}, {BUSINESS.phone}, <a href={`mailto:${BUSINESS.email}`} className="underline">{BUSINESS.email}</a></li>
        <li>App operator: {OPERATOR.company} ({OPERATOR.name}), privacy contact {OPERATOR.email}</li>
        <li>Data Protection Officer: {OPERATOR.dpo}</li>
        <li>Regulator: {LAW.regulator}, <a href={LAW.regulatorUrl} className="underline" target="_blank" rel="noreferrer">ico.org.uk</a></li>
      </ul>

      <p className="border-t border-sand pt-4 text-sm text-mute">Last updated: {LEGAL_VERSION}. {DRAFT_NOTE}</p>
    </main>
  );
}
