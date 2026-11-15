"use client";

import { useEffect, useState } from "react";
import { Clock3, PauseCircle } from "lucide-react";
import { cx } from "@/components/ui/primitives";
import { durationLabel } from "../_lib/time";

/**
 * SLA target with a live countdown: amber inside 24 hours, red once missed. When the
 * milestone has happened it shows whether it was on time instead.
 */
export function SlaCountdown({
  label,
  target,
  finishedAt,
  verb,
  paused,
  initialNow,
}: {
  label: string;
  target: string;
  finishedAt?: string | null;
  verb: string;
  paused?: boolean;
  initialNow: number;
}) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    if (finishedAt || paused) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [finishedAt, paused]);
  const t = new Date(target).getTime();
  let tone: "ok" | "bad" | "warn" | "fine" | "paused";
  let text: string;
  if (finishedAt) {
    const late = new Date(finishedAt).getTime() - t;
    tone = late <= 0 ? "ok" : "bad";
    text = late <= 0 ? `${verb} on time` : `${verb} ${durationLabel(late)} late`;
  } else if (paused) {
    tone = "paused";
    text = "SLA paused";
  } else {
    const diff = t - now;
    tone = diff < 0 ? "bad" : diff < 86_400_000 ? "warn" : "fine";
    text = diff < 0 ? `Overdue by ${durationLabel(diff)}` : `Due in ${durationLabel(diff)}`;
  }
  const textTone = tone === "bad" ? "text-[#ff8a87]" : tone === "warn" ? "text-[#ffc56b]" : tone === "ok" ? "text-[#5fe0d2]" : "text-fg";
  return (
    <div
      className={cx(
        "flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2",
        tone === "ok" && "border-[#145049] bg-ok-lo/60",
        tone === "bad" && "border-[#5a1f1d] bg-bad-lo/60",
        tone === "warn" && "border-[#57400f] bg-warn-lo/60",
        tone === "fine" && "border-line bg-raised/60",
        tone === "paused" && "border-line bg-raised/40",
      )}
      data-sla={tone}
    >
      {paused && !finishedAt ? <PauseCircle className="size-4 shrink-0 text-muted" aria-hidden /> : <Clock3 className={cx("size-4 shrink-0", tone === "fine" ? "text-subtle" : textTone)} aria-hidden />}
      <div className="min-w-0 leading-tight">
        <div className="text-[11px] font-medium tracking-wide text-subtle uppercase">{label}</div>
        <div className={cx("text-sm font-semibold tabular", textTone)}>{text}</div>
        <div className="text-[11.5px] text-muted tabular">
          Target {new Date(target).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}
        </div>
      </div>
    </div>
  );
}
