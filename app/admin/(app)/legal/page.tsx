"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge, Button, Card, CardHeader, Empty, PageHeader, Table, Td, Th } from "@/components/admin/ui";
import { AgreementForm } from "@/components/admin/OwnerAgreement";
import { fmtDateTime } from "@/lib/ops/format";
import { useOps } from "@/lib/ops/store";
import { CLIENT_COMPANY, DRAFT_NOTE, LEGAL_VERSION, SUBPROCESSORS, type DeletionRequest, type LegalRecord } from "@/lib/legal";

type Data = { ownerName: string; version: string; agreement: LegalRecord | null; records: LegalRecord[]; requests: DeletionRequest[] };

const yesNo = (v: boolean | undefined) => (v ? <Badge tone="green">Yes</Badge> : <Badge>No</Badge>);

export default function LegalAdminPage() {
  const { biz } = useOps();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/legal", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Couldn't load the privacy records.");
      setData(j as Data);
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    let live = true;
    fetch("/api/admin/legal", { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? "Couldn't load the privacy records."); return j as Data; })
      .then((j) => live && setData(j))
      .catch((e: Error) => live && setErr(e.message));
    return () => { live = false; };
  }, []);

  async function markDone(id: string) {
    const r = await fetch("/api/admin/legal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request-done", id }) });
    if (r.ok) await load();
    else setErr("Couldn't update that request. Please try again.");
  }

  const leads = biz.leads;
  const homeowners = (data?.records ?? []).filter((r) => r.role === "homeowner").slice(0, 50);
  const open = (data?.requests ?? []).filter((r) => r.status === "open");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Legal & privacy"
        sub={`Agreement, homeowner consents and privacy requests · version ${LEGAL_VERSION}`}
        actions={<Link href="/legal" target="_blank" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-brand underline"><ExternalLink size={14} aria-hidden /> Public Legal &amp; privacy page</Link>}
      />
      {err && <p role="alert" className="rounded-2xl border border-brand bg-brand-tint p-4 text-sm text-brand">{err}</p>}

      <Card>
        <CardHeader title="Service Agreement & Data Processing Agreement" sub={`Between the app operator and ${CLIENT_COMPANY}`} />
        <div className="p-5 text-sm">
          {!data ? (
            <p className="text-steel">Loading…</p>
          ) : data.agreement ? (
            <p><Badge tone="green" dot>Accepted</Badge> <span className="ml-1">Accepted by {data.agreement.name ?? "the owner"} (owner) for {data.agreement.company} on {fmtDateTime(data.agreement.at)}, version {data.agreement.version}.</span></p>
          ) : (
            <>
              <p className="mb-3"><Badge tone="amber" dot>Not yet accepted</Badge> <span className="ml-1">Version {data.version} needs accepting on behalf of {CLIENT_COMPANY}.</span></p>
              <AgreementForm ownerName={data.ownerName} onDone={(ok) => { if (ok) { void load(); router.refresh(); } }} />
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Privacy requests" sub={open.length ? `${open.length} open: reply within one month` : "Requests from the Legal & privacy page"} />
        {data?.requests.length ? (
          <ul className="divide-y divide-silver">
            {data.requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <Badge tone={r.status === "open" ? "red" : "slate"}>{r.status === "open" ? "Delete my data" : "Done"}</Badge>
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{r.contact}{r.note ? ` · ${r.note}` : ""}</span>
                <span className="text-xs text-steel">{fmtDateTime(r.at)}</span>
                {r.status === "open" && <Button size="sm" variant="secondary" onClick={() => markDone(r.id)}>Mark done</Button>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No requests.</Empty>
        )}
        <p className="border-t border-silver px-5 py-3 text-xs text-steel">To delete someone&apos;s data, open their enquiry under <Link href="/admin/leads" className="underline">Leads and quotes</Link> and use Delete enquiry (photos and messages go too), then mark the request done.</p>
      </Card>

      <Card>
        <CardHeader title="Homeowner consents on each lead" sub="What each customer agreed to in the privacy pop-up, saved with their enquiry" />
        {leads.length ? (
          <Table minWidth={720}>
            <thead><tr><Th>Customer</Th><Th>Enquiry</Th><Th>Version</Th><Th>Privacy notice</Th><Th>Contact</Th><Th>AI photo read</Th><Th>Offers</Th></tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <Td><Link href={`/admin/leads?lead=${l.id}`} className="font-medium underline">{l.name}</Link></Td>
                  <Td className="whitespace-nowrap text-steel">{fmtDateTime(l.createdAt)}</Td>
                  {l.legal ? (
                    <>
                      <Td>{l.legal.version}</Td>
                      <Td>{yesNo(l.legal.consents.privacy)}</Td>
                      <Td>{yesNo(l.legal.consents.contact)}</Td>
                      <Td>{yesNo(l.legal.consents.aiPhotos)}</Td>
                      <Td>{yesNo(l.legal.consents.marketing)}</Td>
                    </>
                  ) : (
                    <td colSpan={5} className="border-b border-silver px-4 py-3 text-steel">Before the pop-up: form consent only ({l.consentVersion ?? "v1"}), contact about this enquiry</td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>No enquiries yet.</Empty>
        )}
      </Card>

      <Card>
        <CardHeader title="Recent pop-up acceptances" sub="Anonymous: one random id per browser, no personal details" />
        {homeowners.length ? (
          <Table minWidth={600}>
            <thead><tr><Th>When</Th><Th>Browser id</Th><Th>Type</Th><Th>Version</Th><Th>AI photos</Th><Th>Offers</Th></tr></thead>
            <tbody>
              {homeowners.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(r.at)}</Td>
                  <Td className="font-mono text-xs">{r.userId.slice(0, 8)}</Td>
                  <Td>{r.kind === "acceptance" ? "Accepted" : "Changed choices"}</Td>
                  <Td>{r.version}</Td>
                  <Td>{yesNo(r.consents.aiPhotos)}</Td>
                  <Td>{yesNo(r.consents.marketing)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Empty>{data ? "None yet." : "Loading…"}</Empty>
        )}
      </Card>

      <Card>
        <CardHeader title="Sub-processors" sub="Services that handle data for this app" />
        <Table minWidth={560}>
          <thead><tr><Th>Service</Th><Th>What for</Th><Th>Where</Th></tr></thead>
          <tbody>
            {SUBPROCESSORS.map((s) => (
              <tr key={s.name}><Td className="font-medium">{s.name}{s.status === "planned" && <span className="ml-1"><Badge tone="amber">planned</Badge></span>}</Td><Td>{s.purpose}</Td><Td>{s.location}</Td></tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <p className="text-xs text-steel">{DRAFT_NOTE}</p>
    </div>
  );
}
