"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition, type DragEvent } from "react";
import { CalendarClock, GripVertical, Lock, X } from "lucide-react";
import { Badge, cx, Notice, priorityTone } from "@/components/ui/primitives";
import { label } from "@/lib/format";
import { moveJob } from "../actions";
import type { BoardCard, BoardColumn, BoardMove } from "../_lib/types";

type Drag = { id: string; from: string } | null;

export function Board({
  columns,
  moves,
  canWrite,
  listHref,
}: {
  columns: BoardColumn[];
  moves: Record<string, BoardMove[]>;
  canWrite: boolean;
  listHref: Record<string, string>;
}) {
  const [optimistic, applyMove] = useOptimistic(columns, (state: BoardColumn[], m: { id: string; to: string }) => {
    let card: BoardCard | undefined;
    const without = state.map((c) => {
      const found = c.cards.find((x) => x.id === m.id);
      if (!found) return c;
      card = found;
      return { ...c, total: c.total - 1, cards: c.cards.filter((x) => x.id !== m.id) };
    });
    if (!card) return state;
    return without.map((c) => (c.key === m.to ? { ...c, total: c.total + 1, cards: [{ ...card!, status: m.to }, ...c.cards] } : c));
  });
  const [, start] = useTransition();
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  const targetFor = (from: string, to: string) => moves[from]?.find((m) => m.to === to);

  const move = (card: BoardCard, to: string) => {
    if (card.status === to) return;
    setError(null);
    setBusy(card.id);
    start(async () => {
      applyMove({ id: card.id, to });
      const res = await moveJob(card.id, to);
      setBusy(null);
      if (!res.ok) {
        setError(`${card.reference}: ${res.message ?? "The move was refused."}`);
        setStatus(`Move refused for ${card.reference}.`);
      } else setStatus(res.message ?? "Moved.");
    });
  };

  const onDragStart = (e: DragEvent, card: BoardCard) => {
    e.dataTransfer.setData("text/plain", card.id);
    e.dataTransfer.effectAllowed = "move";
    setDrag({ id: card.id, from: card.status });
  };
  const onDragEnd = () => {
    setDrag(null);
    setOver(null);
  };
  const onDragOver = (e: DragEvent, to: string) => {
    if (!drag || drag.from === to || !targetFor(drag.from, to)) return; // not a drop target: browser shows "not allowed"
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (over !== to) setOver(to);
  };
  const onDrop = (e: DragEvent, to: string) => {
    e.preventDefault();
    const current = drag;
    onDragEnd();
    if (!current || !targetFor(current.from, to)) return;
    const card = optimistic.flatMap((c) => c.cards).find((c) => c.id === current.id);
    if (card) move(card, to);
  };

  return (
    <div>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <div className="mb-3 flex items-start gap-2">
          <div className="flex-1">
            <Notice tone="bad" title="Status change refused">
              {error}
            </Notice>
          </div>
          <button onClick={() => setError(null)} className="mt-2 rounded-lg p-1.5 text-subtle hover:bg-raised hover:text-fg" aria-label="Dismiss message">
            <X className="size-4" />
          </button>
        </div>
      )}
      {canWrite && (
        <p className="mb-2 hidden text-xs text-subtle md:block">
          Drag a card to another column to change its status. Only moves allowed by your job workflow accept a drop; columns marked with a lock need a permission your role does not have.
        </p>
      )}
      <div className="-mx-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0" role="region" aria-label="Job board" tabIndex={0}>
        <div className="flex w-max gap-3">
          {optimistic.map((col) => {
            const target = drag ? targetFor(drag.from, col.key) : undefined;
            const isSource = drag?.from === col.key;
            return (
              <section
                key={col.key}
                aria-label={`${col.label}: ${col.total} jobs`}
                onDragOver={(e) => onDragOver(e, col.key)}
                onDragLeave={() => over === col.key && setOver(null)}
                onDrop={(e) => onDrop(e, col.key)}
                className={cx(
                  "flex w-[272px] shrink-0 flex-col rounded-[14px] border bg-surface/70 transition-[opacity,border-color,box-shadow]",
                  drag && !target && !isSource && "opacity-40",
                  target && !target.locked && "border-dashed border-accent/70",
                  target?.locked && "border-dashed border-[#57400f]",
                  over === col.key && !target?.locked && "shadow-[0_0_0_2px_rgb(47_125_255/0.6)]",
                  over === col.key && target?.locked && "shadow-[0_0_0_2px_rgb(242_169_59/0.6)]",
                  !drag && "border-line",
                )}
              >
                <header className="flex items-center gap-2 border-b border-line px-3 py-2.5">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: col.colour }} aria-hidden />
                  <h3 className="truncate text-[13px] font-semibold text-fg">{col.label}</h3>
                  <span className="ml-auto rounded-full bg-raised px-1.5 text-[11px] text-muted tabular">{col.total}</span>
                </header>
                {target?.locked && (
                  <div className="flex items-center gap-1.5 border-b border-[#57400f] bg-warn-lo/50 px-3 py-1.5 text-[11.5px] text-[#ffd79a]">
                    <Lock className="size-3" aria-hidden /> Needs “{target.locked}”
                  </div>
                )}
                <div className="flex max-h-[68vh] min-h-24 flex-col gap-2 overflow-y-auto p-2">
                  {col.cards.length === 0 && <p className="px-1 py-6 text-center text-xs text-subtle">{drag && target ? "Drop here" : "No jobs"}</p>}
                  {col.cards.map((card) => (
                    <Card
                      key={card.id}
                      card={card}
                      moves={moves[card.status] ?? []}
                      canWrite={canWrite}
                      busy={busy === card.id}
                      dragging={drag?.id === card.id}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onMove={(to) => move(card, to)}
                    />
                  ))}
                  {col.total > col.cards.length && (
                    <Link href={listHref[col.key] ?? "/jobs?view=list"} className="rounded-lg px-2 py-2 text-center text-xs font-medium text-accent-hi hover:bg-raised">
                      View all {col.total} in list →
                    </Link>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Card({
  card,
  moves,
  canWrite,
  busy,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  card: BoardCard;
  moves: BoardMove[];
  canWrite: boolean;
  busy: boolean;
  dragging: boolean;
  onDragStart: (e: DragEvent, c: BoardCard) => void;
  onDragEnd: () => void;
  onMove: (to: string) => void;
}) {
  const draggable = canWrite && moves.length > 0;
  return (
    <article
      draggable={draggable}
      onDragStart={(e) => onDragStart(e, card)}
      onDragEnd={onDragEnd}
      data-job={card.reference}
      className={cx(
        "group rounded-xl border border-line bg-raised/60 p-2.5 text-left transition-[border-color,opacity] hover:border-line-strong",
        draggable && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-50",
        busy && "animate-pulse",
      )}
    >
      <div className="flex items-center gap-1.5">
        {draggable && <GripVertical className="-ml-1 size-3.5 shrink-0 text-subtle opacity-60 group-hover:opacity-100" aria-hidden />}
        <Link href={`/jobs/${card.id}`} draggable={false} className="font-mono text-[12px] tracking-tight text-accent-hi hover:underline">
          {card.reference}
        </Link>
        <Badge tone={priorityTone[card.priority] ?? "neutral"} className="ml-auto !px-1.5 !py-0 text-[10.5px]">
          {label(card.priority)}
        </Badge>
      </div>
      <Link href={`/jobs/${card.id}`} draggable={false} className="mt-1 line-clamp-2 block text-[13px] leading-snug font-medium text-fg hover:text-accent-hi">
        {card.title}
      </Link>
      {card.property && <p className="mt-1 truncate text-[11.5px] text-muted">{card.property}</p>}
      {card.client && <p className="truncate text-[11px] text-subtle">{card.client}</p>}
      <div className="mt-2 flex items-center gap-2">
        {card.targetLabel ? (
          <span
            className={cx(
              "inline-flex items-center gap-1 text-[11px] tabular",
              card.targetState === "overdue" ? "font-semibold text-[#ff8a87]" : card.targetState === "soon" ? "text-[#ffc56b]" : "text-subtle",
            )}
            title="Target completion"
          >
            <CalendarClock className="size-3" aria-hidden />
            {card.targetState === "overdue" ? `Overdue · ${card.targetLabel}` : card.targetLabel}
          </span>
        ) : (
          <span className="text-[11px] text-subtle">No target</span>
        )}
        <div className="ml-auto flex -space-x-1.5">
          {card.assignees.slice(0, 3).map((a) => (
            <span
              key={a.name}
              title={a.name}
              className="flex size-6 items-center justify-center rounded-full border-2 border-surface text-[9.5px] font-semibold text-white"
              style={{ backgroundColor: a.colour }}
            >
              {a.initials}
            </span>
          ))}
          {card.assignees.length > 3 && <span className="flex size-6 items-center justify-center rounded-full border-2 border-surface bg-raised text-[9.5px] text-muted">+{card.assignees.length - 3}</span>}
        </div>
      </div>
      {canWrite && moves.length > 0 && (
        <select
          aria-label={`Change status of ${card.reference}`}
          value=""
          disabled={busy}
          onChange={(e) => e.target.value && onMove(e.target.value)}
          className="mt-2 h-7 w-full rounded-lg border border-line bg-sunken px-2 text-[11.5px] text-muted hover:border-line-strong focus:border-accent focus:outline-none"
        >
          <option value="">Move to…</option>
          {moves.map((m) => (
            <option key={m.to} value={m.to}>
              {m.label}
              {m.locked ? ` (needs ${m.locked})` : ""}
            </option>
          ))}
        </select>
      )}
    </article>
  );
}
