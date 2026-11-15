"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  colour: string;
  title: string;
  subtitle?: string;
  meta?: string;
  href?: string;
  size?: number;
};

/**
 * Interactive map (OpenStreetMap tiles, no API key). Points are clickable and link to the
 * underlying record. Popup content is built from text nodes, never HTML strings.
 */
export function MapView({ points, height = 420, className, emptyLabel = "No locations to show" }: { points: MapPoint[]; height?: number; className?: string; emptyLabel?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([55.9, -3.9], 8);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map.current);
      }
      const m = map.current;
      m.eachLayer((layer) => {
        if ((layer as unknown as { options?: { pmc?: boolean } }).options?.pmc) m.removeLayer(layer);
      });
      const bounds: [number, number][] = [];
      for (const p of points) {
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
        bounds.push([p.lat, p.lng]);
        const marker = L.circleMarker([p.lat, p.lng], {
          radius: p.size ?? 7,
          color: "#060907",
          weight: 2,
          fillColor: p.colour,
          fillOpacity: 0.95,
          pmc: true,
        } as L.CircleMarkerOptions);
        const box = document.createElement("div");
        const t = document.createElement("div");
        t.style.fontWeight = "600";
        t.textContent = p.title;
        box.appendChild(t);
        if (p.subtitle) {
          const s = document.createElement("div");
          s.style.color = "#a8b3aa";
          s.textContent = p.subtitle;
          box.appendChild(s);
        }
        if (p.meta) {
          const s = document.createElement("div");
          s.style.cssText = "color:#86918a;font-size:12px;margin-top:2px";
          s.textContent = p.meta;
          box.appendChild(s);
        }
        if (p.href) {
          const a = document.createElement("a");
          a.href = p.href;
          a.textContent = "Open record →";
          a.style.cssText = "display:inline-block;margin-top:6px;color:#8af04a;font-weight:500";
          box.appendChild(a);
        }
        marker.bindPopup(box);
        marker.addTo(m);
      }
      if (bounds.length === 1) m.setView(bounds[0]!, 13);
      else if (bounds.length > 1) m.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
    })();
    return () => {
      cancelled = true;
    };
  }, [points]);

  useEffect(() => () => {
    map.current?.remove();
    map.current = null;
  }, []);

  return (
    <div className={className} style={{ position: "relative" }}>
      <div ref={el} style={{ height }} className="z-0 overflow-hidden rounded-xl border border-line" role="region" aria-label="Map" />
      {points.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted">{emptyLabel}</div>
      )}
    </div>
  );
}
