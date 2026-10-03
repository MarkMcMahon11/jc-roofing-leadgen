"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader, Segmented, Stat, Table, Td, Th } from "@/components/admin/ui";
import { LeadDetail } from "@/components/admin/LeadDetail";
import { fmtSlot } from "@/lib/dates";
import { detailsText, SERVICE_INFO } from "@/lib/services";
import { fmtDate, gbp, pct, ukDate } from "@/lib/ops/format";
import { leadStatus } from "@/lib/ops/labels";
import { pipeline } from "@/lib/ops/selectors";
import { useOps } from "@/lib/ops/store";
import type { Lead } from "@/lib/types";

type Filter = "all" | Lead["status"];
const FUNNEL: [string, string][] = [["start", "Opened the form"], ["address", "Confirmed address"], ["service", "Chose what they need"], ["home", "Described their home"], ["details", "Gave job details"], ["timing", "Gave timing"], ["price", "Saw their price"], ["booked", "Booked inspection"]];
const scoreTone = { hot: "red", warm: "amber", "not-a-fit": "slate" } as const;

function Leads() {
  const { biz } = useOps();
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("lead");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [outOfArea, setOutOfArea] = useState(false);
  const [limit, setLimit] = useState(60);

  const mine = useMemo(() => biz.leads.filter((l) => outOfArea || l.score !== "not-a-fit"), [biz.leads, outOfArea]);
  const shown = mine.filter((l) => (filter === "all" || l.status === filter) && (!q || `${l.name} ${l.address} ${l.postcode} ${l.phone} ${l.email}`.toLowerCase().includes(q.toLowerCase())));
  const count = (s: Filter) => (s === "all" ? mine.length : mine.filter((l) => l.status === s).length);
  const pipe = pipeline(biz.leads);
  const funnelTop = Math.max(biz.funnel.start ?? 0, 1);
  const opened = biz.leads.find((l) => l.id === openId);

  function close() {
    router.replace("/admin/leads");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Leads and quotes" sub={`${biz.leads.filter((l) => l.score !== "not-a-fit").length} enquiries from the quote form`} />

      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Stat label="New" value={pipe.new} sub={`${biz.leads.filter((l) => l.status === "new" && l.score === "hot").length} hot`} tone={pipe.new ? "bad" : undefined} />
        <Stat label="Quoted" value={pipe.quoted} sub="Waiting on the customer" />
        <Stat label="Won" value={pipe.won} sub={`about ${gbp(Math.round(pipe.wonValue))}`} tone="good" />
        <Stat label="Win rate" value={pipe.won + pipe.lost ? pct(pipe.won / (pipe.won + pipe.lost)) : "—"} sub={`${pipe.won} won · ${pipe.lost} lost`} />
      </div>

      <div className="flex flex-col gap-3 @3xl:flex-row @3xl:items-center @3xl:justify-between">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[{ value: "all", label: "All", count: count("all") }, ...(["new", "contacted", "quoted", "won", "lost"] as const).map((s) => ({ value: s, label: leadStatus[s].label, count: count(s) }))]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-10 items-center gap-2 text-sm text-steel"><input type="checkbox" checked={outOfArea} onChange={(e) => setOutOfArea(e.target.checked)} className="h-4 w-4 accent-[#b11017]" /> Show out-of-area</label>
          <div className="relative flex-1 @3xl:w-64">
            <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-steel" />
            <input aria-label="Search enquiries" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search enquiries" className="min-h-11 w-full rounded-xl border-[1.5px] border-ctrl bg-white py-2 pl-9 pr-3 text-base outline-none focus:border-night" />
          </div>
        </div>
      </div>

      <Card>
        <Table minWidth={820}>
          <thead>
            <tr>
              <Th>Customer</Th>
              <Th>Job</Th>
              <Th right>Estimate</Th>
              <Th>Score</Th>
              <Th>Status</Th>
              <Th>Inspection</Th>
              <Th>Received</Th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map((l) => {
              const open = () => router.replace(`/admin/leads?lead=${l.id}`);
              const det = detailsText(l, biz.settings.materials.find((m) => m.id === l.material)?.label);
              return (
                <tr key={l.id} onClick={open} className="cursor-pointer hover:bg-silver-soft">
                  <Td>
                    <button type="button" onClick={open} className="min-h-10 text-left">
                      <span className="block font-medium">{l.name}</span>
                      <span className="block max-w-[16rem] truncate text-xs text-steel">{l.address.replace(/, (UK|United Kingdom)$/, "")}</span>
                    </button>
                  </Td>
                  <Td>
                    <div>{SERVICE_INFO[l.service ?? "roof"].label}</div>
                    <div className="max-w-[14rem] truncate text-xs text-steel">{det}</div>
                  </Td>
                  <Td right>{l.noPrice ? <span className="text-steel">No price</span> : `${gbp(l.low)} – ${gbp(l.high)}`}</Td>
                  <Td><Badge tone={scoreTone[l.score]}>{l.score === "not-a-fit" ? "Out of area" : l.score}</Badge>{l.waitlist && <div className="mt-0.5 text-xs text-steel">waiting list</div>}</Td>
                  <Td><Badge tone={leadStatus[l.status].tone}>{leadStatus[l.status].label}</Badge></Td>
                  <Td className="text-xs">{l.inspectionBooked ? fmtSlot(l.inspectionBooked) : <span className="text-steel">—</span>}</Td>
                  <Td className="text-xs text-steel">{fmtDate(ukDate(l.createdAt))}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {shown.length > limit && <div className="p-4 text-center"><button type="button" onClick={() => setLimit(limit + 60)} className="min-h-11 rounded-xl border-[1.5px] border-ctrl bg-white px-4 py-2 text-sm font-semibold hover:bg-silver-soft">Show more ({shown.length - limit} left)</button></div>}
        {shown.length === 0 && <div className="px-5 py-10 text-center text-sm text-steel">{biz.leads.length === 0 ? "No enquiries yet. They'll appear here as customers use the quote form on your website." : "No enquiries match."}</div>}
      </Card>

      <Card>
        <CardHeader title="How the form is performing" sub="People who reached each step (anonymous)" />
        <ul className="grid gap-x-8 gap-y-3 p-5 @3xl:grid-cols-2">
          {FUNNEL.map(([k, label]) => {
            const n = biz.funnel[k] ?? 0;
            return (
              <li key={k} className="text-sm">
                <div className="flex justify-between"><span>{label}</span><b className="tabular-nums">{n}</b></div>
                <div className="h-2 rounded bg-silver-soft" aria-hidden><div className="h-2 rounded bg-brand" style={{ width: `${Math.min(100, (n / funnelTop) * 100)}%` }} /></div>
              </li>
            );
          })}
        </ul>
      </Card>

      {opened && <LeadDetail key={opened.id} lead={opened} onClose={close} />}
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense>
      <Leads />
    </Suspense>
  );
}
