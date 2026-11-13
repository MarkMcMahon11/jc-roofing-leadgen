"use client";

import { useEffect, useState } from "react";
import { Clock3, PauseCircle } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import { durationLabel } from "../_lib/time";

/** Live countdown to an SLA target; turns amber inside 24 hours and red when missed. */
export function SlaCountdown({ label, target, met, metLabel, paused, initialNow }: { label: string; target: string; met?: boolean; metLabel?: string; paused?: boolean; initialNow: number }) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    if (met || paused) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [met, paused]);
  const diff = new Date(target).getTime() - now;
  const tone = met ? "ok" : paused ? "paused" : diff < 0 ? "bad" : diff < 86_400_000 ? "warn" : "fine";
  return (
    <div
      className={cx(
        "flex items-center gap-2 rounded-xl border px-3 py-2",
        tone === "ok" && "border-[#18492f] bg-ok-lo/60",
        tone === "bad" && "border-[#5a1f1d] bg-bad-lo/60",
        tone === "warn" && "border-[#57400f] bg-warn-lo/60",
        tone === "fine" && "border-line bg-raised/60",
        tone === "paused" && "border-line bg-raised/40",
      )}
      data-sla={tone}
    >
      {paused ? <PauseCircle className="size-4 shrink-0 text-muted" aria-hidden /> : <Clock3 className={cx("size-4 shrink-0", tone === "bad" ? "text-[#ff8a87]" : tone === "warn" ? "text-[#ffc56b]" : tone === "ok" ? "text-[#5fdc98]" : "text-subtle")} aria-hidden />}
      <div className="min-w-0 leading-tight">
        <div className="text-[11px] font-medium tracking-wide text-subtle uppercase">{label}</div>
        <div className={cx("text-sm font-semibold tabular", tone === "bad" ? "text-[#ff8a87]" : tone === "warn" ? "text-[#ffc56b]" : tone === "ok" ? "text-[#5fdc98]" : "text-fg")}>
          {met ? (metLabel ?? "Met") : paused ? "SLA paused" : diff < 0 ? `Overdue by ${durationLabel(diff)}` : `Due in ${durationLabel(diff)}`}
        </div>
        <div className="text-[11.5px] text-muted tabular">
          {new Date(target).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}
        </div>
      </div>
    </div>
  );
}
