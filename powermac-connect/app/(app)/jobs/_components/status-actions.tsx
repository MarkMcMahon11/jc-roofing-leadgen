"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { buttonClass, ColourBadge, Notice, Textarea } from "@/components/ui/primitives";
import { moveJob } from "../actions";

type Move = { to: string; label: string; colour: string };

export function StatusActions({ jobId, current, moves }: { jobId: string; current: { label: string; colour: string }; moves: Move[] }) {
  const [target, setTarget] = useState<Move | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = (m: Move) => {
    setTarget(m);
    setNote("");
    setError(null);
  };
  const confirm = () => {
    if (!target) return;
    setError(null);
    start(async () => {
      const res = await moveJob(jobId, target.to, note);
      if (!res.ok) setError(res.message ?? "The status could not be changed.");
      else {
        setDone(res.message ?? "Status changed.");
        setTarget(null);
      }
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" data-testid="status-actions">
        {moves.map((m) => (
          <button
            key={m.to}
            type="button"
            onClick={() => open(m)}
            className={buttonClass("secondary", "sm", "gap-2")}
            style={{ borderColor: m.colour + "66" }}
          >
            <span className="size-2 rounded-full" style={{ backgroundColor: m.colour }} aria-hidden />
            {m.label}
          </button>
        ))}
      </div>
      {done && (
        <p role="status" className="mt-2 text-xs text-[#a6efe7]">
          {done}
        </p>
      )}
      <Modal open={Boolean(target)} onClose={() => !pending && setTarget(null)} title={target ? `Move to ${target.label}` : ""} description="The change is checked against your job workflow and recorded on the timeline.">
        {target && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <ColourBadge colour={current.colour}>{current.label}</ColourBadge>
              <ArrowRight className="size-4 text-subtle" aria-hidden />
              <ColourBadge colour={target.colour}>{target.label}</ColourBadge>
            </div>
            <div>
              <label htmlFor="status-note" className="mb-1.5 block text-[13px] font-medium text-muted">
                Note (optional, internal)
              </label>
              <Textarea id="status-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={10000} placeholder="Why is the job moving? Anything the team should know?" />
            </div>
            {error && <Notice tone="bad">{error}</Notice>}
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonClass("ghost")} onClick={() => setTarget(null)} disabled={pending}>
                Cancel
              </button>
              <button type="button" className={buttonClass("primary")} onClick={confirm} disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Move to {target.label}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
