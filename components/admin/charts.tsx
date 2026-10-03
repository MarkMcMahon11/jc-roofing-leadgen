"use client";

// Small dependency-free SVG charts in JC Roofing colours: red = main series, charcoal = second series, cream = expected.

import { useEffect, useRef, useState } from "react";
import { gbp } from "@/lib/ops/format";

type Series = { key: string; label: string; color: string };
type Row = Record<string, number | string>;

export function BarChart({
  data, series, xLabel, height = 220, format = (n) => String(n),
}: {
  data: Row[]; series: Series[]; xLabel: (row: Row) => string; height?: number; format?: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // draw the chart at its real on-screen width, so the text is the same size on a phone as on a desktop
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(260, Math.floor(el.clientWidth))));
    ro.observe(el);
    setW(Math.max(260, Math.floor(el.clientWidth)));
    return () => ro.disconnect();
  }, []);

  const max = Math.max(1, ...data.flatMap((r) => series.map((s) => Number(r[s.key]) || 0)));
  const { step, top: nice } = niceScale(max);
  const H = height, padL = 46, padB = 26, padT = 8;
  const innerW = W - padL - 8, innerH = H - padB - padT;
  const groupW = innerW / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(18, (groupW * 0.7) / series.length));
  const every = groupW < 24 ? 3 : groupW < 38 ? 2 : 1; // thin out the x labels on narrow screens

  return (
    <div className="relative" ref={box}>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-mute">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={series.map((s) => s.label).join(" and ")} onMouseLeave={() => setHover(null)}>
        {Array.from({ length: Math.round(nice / step) + 1 }, (_, i) => i * step).map((tick) => {
          const y = padT + innerH * (1 - tick / nice);
          return (
            <g key={tick}>
              <line x1={padL} x2={W - 8} y1={y} y2={y} stroke="#e7e5da" />
              <text x={padL - 6} y={y + 4} textAnchor="end" fontSize="11" fill="#5f5f57">{format(tick)}</text>
            </g>
          );
        })}
        {data.map((row, i) => {
          const gx = padL + groupW * i + (groupW - barW * series.length - 2 * (series.length - 1)) / 2;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onClick={() => setHover(hover === i ? null : i)}>
              <rect x={padL + groupW * i} y={padT} width={groupW} height={innerH} fill={hover === i ? "#f4f4eb" : "transparent"} />
              {series.map((s, j) => {
                const v = Number(row[s.key]) || 0;
                const h = (v / nice) * innerH;
                return <rect key={s.key} x={gx + j * (barW + 2)} y={padT + innerH - h} width={barW} height={Math.max(h, v ? 1 : 0)} rx={3} fill={s.color} />;
              })}
              {(data.length - 1 - i) % every === 0 && <text x={padL + groupW * i + groupW / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#5f5f57">{xLabel(row)}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-6 z-10 rounded-lg border border-sand bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: `clamp(0px, ${((padL + groupW * hover + groupW / 2) / W) * 100}% - 70px, calc(100% - 150px))` }}
        >
          <div className="mb-1 font-semibold text-ink">{xLabel(data[hover])}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-mute">
                <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-medium tabular-nums text-ink">{format(Number(data[hover][s.key]) || 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Donut({ parts, size = 140, center }: { parts: { label: string; value: number; color: string }[]; size?: number; center?: React.ReactNode }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const r = 52;
  const C = 2 * Math.PI * r;
  const offsets = parts.map((_, i) => parts.slice(0, i).reduce((s, p) => s + (p.value / total) * C, 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 140 140" width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#f4f4eb" strokeWidth="16" />
        {parts.map((p, i) => {
          const len = (p.value / total) * C;
          return p.value ? <circle key={p.label} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-offsets[i]} /> : null;
        })}
      </svg>
      {center && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>}
    </div>
  );
}

export function HBar({ items, format = gbp }: { items: { label: string; value: number; color?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-2.5">
      {items.map((i) => (
        <div key={i.label}>
          <div className="mb-1 flex justify-between gap-2 text-xs">
            <span className="truncate text-mute">{i.label}</span>
            <span className="font-semibold tabular-nums text-ink">{format(i.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-cream">
            <div className="h-full rounded-full" style={{ width: `${(i.value / max) * 100}%`, background: i.color ?? "#34342b" }} />
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="text-sm text-mute">Nothing to show yet.</p>}
    </div>
  );
}

/** Whole-number gridlines: a step of 1, 2 or 5 (times a power of ten) with at most 5 gaps, and the top rounded up to match. */
function niceScale(max: number) {
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [0.1, 0.2, 0.5, 1, 2, 5, 10]) {
    const step = Math.max(1, m * p);
    if (max / step <= 5) return { step, top: Math.ceil(max / step) * step };
  }
  return { step: 10 * p, top: Math.ceil(max / (10 * p)) * 10 * p };
}
