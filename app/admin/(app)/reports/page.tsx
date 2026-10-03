"use client";

import Image from "next/image";
import { useState } from "react";
import { Printer } from "lucide-react";
import { Button, PageHeader, Segmented, Select } from "@/components/admin/ui";
import { fmtSlot } from "@/lib/dates";
import { detailsText, SERVICE_INFO } from "@/lib/services";
import { addDays, daysBetween, fmtDate, fmtDay, gbp, inLastDays, num, sum, today, ukDate } from "@/lib/ops/format";
import { expenseCat, jobKind, leadStatus, vehicleStatus } from "@/lib/ops/labels";
import { allDocuments, crewName, leadValue, scheduleItems, vanReg } from "@/lib/ops/selectors";
import { useOps } from "@/lib/ops/store";
import type { ExpenseCategory } from "@/lib/ops/types";

type Report = "vans" | "costs" | "leads" | "week" | "team";

const th = "border-b-2 border-ink px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide";
const td = "border-b border-sand px-2 py-1.5 align-top";

function Sheet({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <article className="rounded-2xl border border-sand bg-white p-6 print:border-0 print:p-0">
      <header className="mb-5 flex items-start justify-between gap-4 border-b-2 border-brand pb-3">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-mute">{sub}</p>
        </div>
        <div className="text-right text-xs text-mute">
          <Image src="/logo.png" alt="JC Roofing Dumfries" width={512} height={198} className="ml-auto h-10 w-auto" />
          Printed {fmtDate(today())}
        </div>
      </header>
      <div className="scroll-x">{children}</div>
    </article>
  );
}

export default function ReportsPage() {
  const { db, biz } = useOps();
  const [tab, setTab] = useState<Report>("vans");
  const [days, setDays] = useState(90);
  const t = today();

  return (
    <div className="space-y-5">
      <PageHeader title="Reports" sub="Pick a report, check it, then print it or save it as a PDF" actions={<Button onClick={() => window.print()}><Printer size={16} /> Print / save PDF</Button>} />
      <div className="print:hidden">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "vans", label: "Van register" },
            { value: "costs", label: "Running costs" },
            { value: "leads", label: "Enquiries and pipeline" },
            { value: "week", label: "Weekly plan" },
            { value: "team", label: "Team checks" },
          ]}
        />
        {(tab === "costs" || tab === "leads") && (
          <div className="mt-3 max-w-xs">
            <Select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))} className="!mt-0">
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 6 months</option>
              <option value={365}>Last 12 months</option>
            </Select>
          </div>
        )}
      </div>

      {tab === "vans" && (
        <Sheet title="Van register" sub={`${db.vehicles.length} vehicles · for insurance renewals, MOT and tax checks`}>
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Plate</th><th className={th}>Vehicle</th><th className={th}>Status</th><th className={th}>MOT</th><th className={th}>Tax</th><th className={th}>Insurance</th><th className={th}>Mileage</th><th className={th}>Service at</th></tr></thead>
            <tbody>
              {db.vehicles.map((v) => (
                <tr key={v.id}>
                  <td className={`${td} font-mono font-semibold`}>{v.reg}</td>
                  <td className={td}>{v.make} {v.model} {v.year}<div className="text-xs text-mute">{v.colour} · {v.fuel}{v.vin ? ` · VIN ${v.vin}` : ""}</div></td>
                  <td className={td}>{vehicleStatus[v.status].label}</td>
                  <td className={td}>{v.status === "off_road" ? "SORN" : fmtDate(v.docs.mot)}</td>
                  <td className={td}>{v.status === "off_road" ? "SORN" : fmtDate(v.docs.roadTax)}</td>
                  <td className={td}>{fmtDate(v.docs.insurance)}</td>
                  <td className={td}>{num(v.mileage)}</td>
                  <td className={td}>{num(v.nextServiceMiles)}{v.nextServiceDate ? ` / ${fmtDate(v.nextServiceDate)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {db.vehicles.length === 0 && <p className="py-6 text-center text-sm text-mute">No vans yet.</p>}
        </Sheet>
      )}

      {tab === "costs" && (() => {
        const from = addDays(t, -(days - 1));
        const rows = db.expenses.filter((e) => inLastDays(e.date, days, t));
        const cats = (Object.keys(expenseCat) as ExpenseCategory[]).filter((k) => rows.some((e) => e.category === k));
        return (
          <Sheet title="Running costs" sub={`${fmtDate(from)} to ${fmtDate(t)} · ${gbp(sum(rows.map((e) => e.amount)))} in total`}>
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Van</th>{cats.map((k) => <th key={k} className={`${th} text-right`}>{expenseCat[k]}</th>)}<th className={`${th} text-right`}>Total</th></tr></thead>
              <tbody>
                {[...db.vehicles.map((v) => ({ id: v.id as string | undefined, label: v.reg })), { id: undefined, label: "General" }].map((r) => {
                  const mine = rows.filter((e) => e.vehicleId === r.id);
                  if (!mine.length) return null;
                  return (
                    <tr key={r.label}>
                      <td className={`${td} font-mono font-semibold`}>{r.label}</td>
                      {cats.map((k) => <td key={k} className={`${td} text-right tabular-nums`}>{gbp(sum(mine.filter((e) => e.category === k).map((e) => e.amount)))}</td>)}
                      <td className={`${td} text-right font-semibold tabular-nums`}>{gbp(sum(mine.map((e) => e.amount)))}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td className={`${td} font-semibold`}>Total</td>
                  {cats.map((k) => <td key={k} className={`${td} text-right font-semibold tabular-nums`}>{gbp(sum(rows.filter((e) => e.category === k).map((e) => e.amount)))}</td>)}
                  <td className={`${td} text-right font-bold tabular-nums`}>{gbp(sum(rows.map((e) => e.amount)))}</td>
                </tr>
              </tbody>
            </table>
            {rows.length === 0 && <p className="py-6 text-center text-sm text-mute">No costs in this period.</p>}
          </Sheet>
        );
      })()}

      {tab === "leads" && (() => {
        const from = addDays(t, -(days - 1));
        const list = biz.leads.filter((l) => l.score !== "not-a-fit" && ukDate(l.createdAt) >= from).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        const by = (s: string) => list.filter((l) => l.status === s);
        return (
          <Sheet title="Enquiries and pipeline" sub={`${fmtDate(from)} to ${fmtDate(t)} · ${list.length} enquiries · values use the middle of each quote range`}>
            <table className="mb-6 w-full max-w-xl text-sm">
              <thead><tr><th className={th}>Stage</th><th className={`${th} text-right`}>Enquiries</th><th className={`${th} text-right`}>Value</th></tr></thead>
              <tbody>
                {(["new", "contacted", "quoted", "won", "lost"] as const).map((s) => (
                  <tr key={s}><td className={td}>{leadStatus[s].label}</td><td className={`${td} text-right`}>{by(s).length}</td><td className={`${td} text-right tabular-nums`}>{gbp(Math.round(sum(by(s).map(leadValue))))}</td></tr>
                ))}
              </tbody>
            </table>
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Received</th><th className={th}>Customer</th><th className={th}>Job</th><th className={`${th} text-right`}>Estimate</th><th className={th}>Score</th><th className={th}>Status</th><th className={th}>Inspection</th></tr></thead>
              <tbody>
                {list.map((l) => (
                  <tr key={l.id}>
                    <td className={`${td} whitespace-nowrap`}>{fmtDate(ukDate(l.createdAt))}</td>
                    <td className={td}>{l.name}<div className="text-xs text-mute">{l.postcode}</div></td>
                    <td className={td}>{SERVICE_INFO[l.service ?? "roof"].label}<div className="text-xs text-mute">{detailsText(l, biz.settings.materials.find((m) => m.id === l.material)?.label)}</div></td>
                    <td className={`${td} text-right tabular-nums`}>{l.noPrice ? "—" : `${gbp(l.low)}–${gbp(l.high)}`}</td>
                    <td className={`${td} capitalize`}>{l.score}</td>
                    <td className={td}>{leadStatus[l.status].label}</td>
                    <td className={td}>{l.inspectionBooked ? fmtSlot(l.inspectionBooked) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length === 0 && <p className="py-6 text-center text-sm text-mute">No enquiries in this period.</p>}
          </Sheet>
        );
      })()}

      {tab === "week" && (() => {
        const items = scheduleItems(db, biz.leads, t, addDays(t, 6));
        return (
          <Sheet title="Weekly plan" sub={`${fmtDay(t)} to ${fmtDay(addDays(t, 6))} · ${items.length} booking${items.length === 1 ? "" : "s"}`}>
            <table className="w-full text-sm">
              <thead><tr><th className={th}>When</th><th className={th}>What</th><th className={th}>Where</th><th className={th}>Vans</th><th className={th}>Crew</th></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.key}>
                    <td className={`${td} whitespace-nowrap`}>{fmtDay(it.date)}{it.time ? ` ${it.time}` : ""}{it.endDate ? <div className="text-xs text-mute">to {fmtDay(it.endDate)}</div> : null}</td>
                    <td className={td}>{it.title}<div className="text-xs text-mute">{jobKind[it.kind]}{it.customer ? ` · ${it.customer}` : ""}</div></td>
                    <td className={td}>{it.address}</td>
                    <td className={`${td} font-mono`}>{it.vanIds.map((id) => vanReg(db, id)).join(", ") || "—"}</td>
                    <td className={td}>{it.crewIds.map((id) => crewName(db, id)).join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && <p className="py-6 text-center text-sm text-mute">Nothing booked this week.</p>}
          </Sheet>
        );
      })()}

      {tab === "team" && (
        <Sheet title="Team checks" sub="Licences, site cards and training, soonest first">
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Who</th><th className={th}>What</th><th className={th}>Date</th><th className={th}>Days left</th></tr></thead>
            <tbody>
              {allDocuments(db).filter((r) => r.kind === "crew").map((r) => {
                const d = daysBetween(t, r.date);
                return (
                  <tr key={r.key}><td className={td}>{r.who}</td><td className={td}>{r.label}</td><td className={td}>{fmtDate(r.date)}</td><td className={`${td} ${d < 0 ? "font-bold" : ""}`}>{d < 0 ? `${-d} days overdue` : d}</td></tr>
                );
              })}
            </tbody>
          </table>
        </Sheet>
      )}
    </div>
  );
}
