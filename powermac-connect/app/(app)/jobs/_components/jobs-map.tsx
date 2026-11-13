"use client";

import { MapView, type MapPoint } from "@/components/ui/map";
import { Card } from "@/components/ui/primitives";

export function JobsMap({ points, legend, missing, capped }: { points: MapPoint[]; legend: { label: string; colour: string; count: number }[]; missing: number; capped: boolean }) {
  return (
    <Card className="overflow-hidden">
      <div className="p-3">
        <MapView points={points} height={560} emptyLabel="No open jobs with a mapped property match these filters" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-3 text-xs text-muted">
        {legend.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: l.colour }} aria-hidden />
            {l.label} <span className="text-subtle tabular">{l.count}</span>
          </span>
        ))}
        <span className="ml-auto text-subtle">
          {points.length} job{points.length === 1 ? "" : "s"} on the map
          {missing > 0 && ` · ${missing} without coordinates`}
          {capped && " · showing the first 2,000"}
        </span>
      </div>
    </Card>
  );
}
