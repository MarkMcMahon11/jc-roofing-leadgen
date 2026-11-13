"use client";

import { MapView, type MapPoint } from "@/components/ui/map";
import { MAP_COLOURS, MAP_LEGEND } from "../_lib/map-colours";

/** Property map with a text legend (colour is never the only cue: popups state the reason too). */
export function PropertyMap({ points, height = 560, legend = true, emptyLabel }: { points: MapPoint[]; height?: number; legend?: boolean; emptyLabel?: string }) {
  return (
    <div>
      <MapView points={points} height={height} emptyLabel={emptyLabel} />
      {legend && (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted" aria-label="Map legend">
          {MAP_LEGEND.map((l) => (
            <li key={l.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full ring-2 ring-[#0a101e]" style={{ background: MAP_COLOURS[l.key] }} aria-hidden />
              {l.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
