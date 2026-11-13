"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Clock, GripVertical, Inbox, MapPin } from "lucide-react";
import { Badge, Card, ColourBadge, cx, priorityTone } from "@/components/ui/primitives";
import { FilterSelect, SearchBox } from "@/components/ui/url-controls";
import { date as fmtDate, daysUntil, label } from "@/lib/format";
import { PRIORITY_COLOUR, type QueueJob, type StatusInfo } from "../_lib/types";
import type { GridApi } from "./blocks";

const PRIORITIES = ["emergency", "urgent", "routine", "planned"].map((p) => ({ value: p, label: label(p) }));

export function QueuePanel({
  queue,
  total,
  statuses,
  tradeOptions,
  api,
  selectedId,
  onSelect,
  renderSelected,
}: {
  queue: QueueJob[];
  total: number;
  statuses: Record<string, StatusInfo>;
  tradeOptions: { value: string; label: string }[];
  api: GridApi;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  renderSelected: (job: QueueJob) => ReactNode;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    listRef.current?.querySelector(`[data-job="${selectedId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden max-h-[480px] lg:max-h-[calc(100dvh-8rem)]" aria-label="Unscheduled jobs">
      <div className="border-b border-line px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-fg">Unscheduled</h2>
          <span className="text-xs text-subtle tabular">
            {queue.length < total ? `${queue.length} of ${total}` : total} {total === 1 ? "job" : "jobs"}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">{api.canEdit ? "Drag onto an operative's day, or select and click a cell." : "Open jobs with nobody booked."}</p>
        <div className="mt-3 grid gap-2">
          <SearchBox placeholder="Search reference or title" />
          <div className="grid grid-cols-2 gap-2">
            <FilterSelect param="qtrade" label="Trade" options={tradeOptions} className="h-9! w-full! min-w-0! text-[13px]" />
            <FilterSelect param="priority" label="Priority" options={PRIORITIES} className="h-9! w-full! min-w-0! text-[13px]" />
          </div>
        </div>
      </div>
      <ul ref={listRef} className="min-h-[200px] flex-1 space-y-1.5 overflow-y-auto overscroll-contain p-2" data-testid="queue">
        {queue.length === 0 && (
          <li className="flex flex-col items-center px-4 py-10 text-center">
            <Inbox className="mb-2 size-6 text-subtle" aria-hidden />
            <p className="text-sm font-medium text-fg">Nothing waiting</p>
            <p className="mt-0.5 text-xs text-muted">Every open job matching these filters has someone booked.</p>
          </li>
        )}
        {queue.map((j) => {
          const selected = selectedId === j.id;
          const due = daysUntil(j.targetCompletion);
          const overdue = due !== null && due < 0;
          const st = statuses[j.status];
          const dragging = api.drag?.type === "job" && api.drag.id === j.id;
          return (
            <li key={j.id} data-job={j.id} data-ref={j.reference}>
              <div
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`${j.reference}, ${j.title}, ${label(j.priority)}${overdue ? ", overdue" : ""}. ${selected ? "Selected" : "Select to book"}`}
                draggable={api.canEdit}
                onDragStart={api.canEdit ? (e) => api.startDrag({ type: "job", id: j.id }, e) : undefined}
                onDragEnd={api.canEdit ? api.endDrag : undefined}
                onClick={() => onSelect(selected ? null : j.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(selected ? null : j.id);
                  }
                }}
                className={cx(
                  "group relative rounded-xl border py-2.5 pr-3 pl-3.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent-hi",
                  api.canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                  selected ? "border-accent bg-accent-lo/50 shadow-[0_0_0_1px_rgb(47_125_255/0.5)]" : "border-line bg-sunken/60 hover:border-line-strong hover:bg-raised/60",
                  dragging && "opacity-50",
                )}
                style={{ boxShadow: `inset 3px 0 0 ${PRIORITY_COLOUR[j.priority] ?? "#8090ab"}${selected ? ", 0 0 0 1px rgb(47 125 255 / 0.5)" : ""}` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1">
                    {api.canEdit && <GripVertical className="-ml-1 size-3.5 shrink-0 text-subtle opacity-60 group-hover:opacity-100" aria-hidden />}
                    <span className="truncate font-mono text-[12px] tracking-tight text-accent-hi">{j.reference}</span>
                  </span>
                  <Badge tone={priorityTone[j.priority] ?? "neutral"} className="px-1.5 py-0 text-[10.5px]">
                    {label(j.priority)}
                  </Badge>
                </div>
                <div className="mt-1 line-clamp-2 text-[13px] leading-snug text-fg">{j.title}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-muted">
                  <span>{j.tradeLabel}</span>
                  {j.postcode && (
                    <span className="inline-flex items-center gap-0.5">
                      <MapPin className="size-3 text-subtle" aria-hidden />
                      {j.postcode}
                    </span>
                  )}
                  {j.estimatedHours !== null && (
                    <span className="inline-flex items-center gap-0.5 tabular">
                      <Clock className="size-3 text-subtle" aria-hidden />
                      {j.estimatedHours.toFixed(1)} h
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
                  <span className={cx("text-[11.5px] tabular", overdue ? "font-medium text-[#ff8a87]" : due !== null && due <= 3 ? "text-[#ffc56b]" : "text-subtle")}>
                    {j.targetCompletion ? (overdue ? `Overdue ${-due!} day${due === -1 ? "" : "s"} · ${fmtDate(j.targetCompletion)}` : `Due ${fmtDate(j.targetCompletion)}`) : "No target date"}
                  </span>
                  {st && <ColourBadge colour={st.colour}>{st.label}</ColourBadge>}
                </div>
              </div>
              {selected && <div className="mt-1.5 mb-2 rounded-xl border border-[#1d3d78] bg-chrome/70 p-3">{renderSelected(j)}</div>}
            </li>
          );
        })}
      </ul>
      {queue.length < total && <p className="border-t border-line px-4 py-2 text-[11.5px] text-subtle">Showing the {queue.length} most pressing. Search or filter to find others.</p>}
    </Card>
  );
}
