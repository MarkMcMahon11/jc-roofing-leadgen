import type { Metadata } from "next";
import { Logo } from "@/components/shell/logo";

export const metadata: Metadata = { title: "Privacy notice" };

// Draft notice: the company using PowerMac Connect is the data controller and must approve the final wording.
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed text-muted">
      <Logo />
      <h1 className="mt-10 text-2xl font-semibold text-fg">Privacy notice (draft)</h1>
      <p className="mt-2 text-xs text-subtle">Draft for review by the data controller before go-live.</p>
      <h2 className="mt-8 text-base font-semibold text-fg">Who is responsible</h2>
      <p className="mt-2">Each company using PowerMac Connect is the controller for the data it holds about its clients, residents and staff. BPOAI.AI provides the platform as a processor.</p>
      <h2 className="mt-6 text-base font-semibold text-fg">What we hold and why</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Staff accounts: name, work email and activity, to give secure access and an audit trail (legitimate interests, contract).</li>
        <li>Residents of properties where work is done: name, contact details and access needs, to arrange and carry out repairs (contract with the housing provider, legitimate interests). Vulnerability information is recorded only where needed for safe access.</li>
        <li>Employees: details needed to schedule work and manage qualifications; personal and pay data is restricted to authorised staff.</li>
      </ul>
      <h2 className="mt-6 text-base font-semibold text-fg">How it is protected</h2>
      <p className="mt-2">Data is encrypted in transit, separated per company at database level, available only to people whose role needs it, and every change is logged. Data is deleted or anonymised under the retention rules each company configures.</p>
      <h2 className="mt-6 text-base font-semibold text-fg">Your rights</h2>
      <p className="mt-2">You can ask the company that holds your data for a copy, a correction or deletion, or object to its use. You can also complain to the Information Commissioner&apos;s Office (ico.org.uk).</p>
    </div>
  );
}
