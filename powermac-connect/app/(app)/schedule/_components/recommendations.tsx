"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { buttonClass, cx, Select } from "@/components/ui/primitives";
import { getRecommendations } from "../actions";
import { hhmm, londonToMs } from "../_lib/time";
import type { QueueJob, Recommendation } from "../_lib/types";

export type Slot = { date: string; start: number; minutes: number };

export function slotTimes(s: Slot) {
  const start = londonToMs(s.date, s.start);
  return { start: new Date(start).toISOString(), end: new Date(start + s.minutes * 60_000).toISOString() };
}

/** Default visit length: the estimate rounded up to 30 minutes, capped at a working day. */
export function defaultMinutes(estimatedHours: number | null) {
  const m = Math.ceil(((estimatedHours ?? 2) * 60) / 30) * 30;
  return Math.max(30, Math.min(8 * 60, m));
}

const STARTS = Array.from({ length: 24 }, (_, i) => 7 * 60 + i * 30);
const LENGTHS = Array.from({ length: 24 }, (_, i) => (i + 1) * 30);

export function SlotFields({ slot, onChange, idPrefix }: { slot: Slot; onChange: (s: Slot) => void; idPrefix: string }) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2">
      <div className="col-span-2 min-w-0">
        <label htmlFor={`${idPrefix}-date`} className="mb-1 block text-[11.5px] font-medium text-subtle">
          Day
        </label>
        <input
          id={`${idPrefix}-date`}
          type="date"
          value={slot.date}
          onChange={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && onChange({ ...slot, date: e.target.value })}
          className="h-9 w-full rounded-lg border border-line-strong bg-sunken px-2 text-[13px] text-fg [color-scheme:dark] focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
        />
      </div>
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-start`} className="mb-1 block text-[11.5px] font-medium text-subtle">
          Start
        </label>
        <Select id={`${idPrefix}-start`} value={slot.start} onChange={(e) => onChange({ ...slot, start: Number(e.target.value) })} className="h-9 pr-7 text-[13px]">
          {STARTS.map((m) => (
            <option key={m} value={m}>
              {hhmm(m)}
            </option>
          ))}
        </Select>
      </div>
      <div className="min-w-0">
        <label htmlFor={`${idPrefix}-len`} className="mb-1 block text-[11.5px] font-medium text-subtle">
          Length
        </label>
        <Select id={`${idPrefix}-len`} value={slot.minutes} onChange={(e) => onChange({ ...slot, minutes: Number(e.target.value) })} className="h-9 pr-7 text-[13px]">
          {LENGTHS.map((m) => (
            <option key={m} value={m}>
              {m % 60 ? (m / 60).toFixed(1) : m / 60} h
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

type Result = { key: string; items?: Recommendation[]; error?: string };

/** recommend_operatives() for a job and slot: advice with every reason shown. A person decides. */
export function Recommendations({
  job,
  slot,
  canEdit,
  tradeLabel,
  onBook,
  busy,
}: {
  job: QueueJob;
  slot: Slot;
  canEdit: boolean;
  tradeLabel: (k: string) => string;
  onBook: (employeeId: string) => void;
  busy: boolean;
}) {
  const { start, end } = slotTimes(slot);
  const key = `${job.id}|${start}|${end}`;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let live = true;
    getRecommendations({ workOrderId: job.id, start, end })
      .then((res) => live && setResult({ key, items: res.items, error: res.ok ? undefined : res.message }))
      .catch(() => live && setResult({ key, error: "Recommendations could not be loaded. Check your connection and try again." }));
    return () => {
      live = false;
    };
  }, [key, job.id, start, end]);

  const loading = result?.key !== key;
  const items = loading ? [] : (result?.items ?? []);

  return (
    <div data-testid="recommendations">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
          <Sparkles className="size-3.5 text-accent-hi" aria-hidden />
          Recommended — you decide
        </h3>
        {loading && <Loader2 className="size-3.5 animate-spin text-accent-hi" aria-label="Loading recommendations" />}
      </div>
      <p className="mb-2.5 text-[11.5px] leading-snug text-subtle">Ranked by trade match, availability, distance from base and workload that day. These are suggestions, not decisions.</p>
      {!loading && result?.error && <p className="rounded-lg border border-[#5a1f1d] bg-bad-lo/60 px-3 py-2 text-xs text-[#ffb3b1]">{result.error}</p>}
      {!loading && !result?.error && items.length === 0 && <p className="text-xs text-muted">No operatives your role can see are available to rank.</p>}
      <ol className={cx("space-y-2", loading && "opacity-50")} aria-busy={loading}>
        {items.map((r, i) => {
          const score = Math.max(0, Math.min(100, r.totalScore));
          const tone = r.conflicts > 0 ? "#f0524f" : score >= 70 ? "#22c7b8" : score >= 45 ? "#5ee000" : "#f2a93b";
          return (
            <li key={r.employeeId} className="rounded-lg border border-line bg-sunken/70 p-2.5" data-rec={r.name}>
              <div className="flex items-center gap-2">
                <span className="w-3 text-[11px] font-semibold text-subtle tabular">{i + 1}</span>
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.colour }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-fg">{r.name}</div>
                  <div className="truncate text-[11.5px] text-subtle">
                    {tradeLabel(r.trade)}
                    {r.distanceKm !== null && ` · ${r.distanceKm.toFixed(1)} km`} · {r.bookedHours.toFixed(1)} h booked
                  </div>
                </div>
                {canEdit && (
                  <button type="button" disabled={busy} onClick={() => onBook(r.employeeId)} className={buttonClass(i === 0 ? "primary" : "secondary", "sm", "h-7 px-2.5 text-xs")} aria-label={`Book ${job.reference} with ${r.name}`}>
                    Book
                  </button>
                )}
              </div>
              <div
                className="mt-2 flex items-center gap-2"
                title={`Trade ${r.tradeScore} · Availability ${r.availabilityScore} · Distance ${r.distanceScore} · Workload ${r.workloadScore}`}
              >
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-chrome" role="meter" aria-label={`Match score ${r.totalScore} out of 100`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}>
                  <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: tone }} />
                </div>
                <span className="w-7 text-right text-[11px] font-medium text-muted tabular">{r.totalScore}</span>
              </div>
              <ul className="mt-2 flex flex-wrap gap-1" aria-label="Reasons">
                {r.reasons.map((reason) => (
                  <li
                    key={reason}
                    className={cx(
                      "rounded-full border px-1.5 py-px text-[10.5px]",
                      /clash|asbestos/i.test(reason) ? "border-[#5a1f1d] bg-bad-lo text-[#ff8a87]" : /different trade/i.test(reason) ? "border-[#57400f] bg-warn-lo text-[#ffc56b]" : "border-line-strong bg-raised text-muted",
                    )}
                  >
                    {reason}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
