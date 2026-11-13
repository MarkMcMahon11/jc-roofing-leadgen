"use client";

import { MapView, type MapPoint } from "@/components/ui/map";

export function DashboardMap({ points }: { points: MapPoint[] }) {
  return <MapView points={points} height={430} emptyLabel="No open jobs with a mapped address" />;
}
