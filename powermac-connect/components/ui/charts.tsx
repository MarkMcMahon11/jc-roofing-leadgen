"use client";

import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";
import { cx } from "./primitives";
import { count as countFmt, money } from "@/lib/format";

/*
 * Charts follow one system: categorical slots in fixed order (validated for colour-vision
 * deficiency against the dark card surface #0f1729), thin marks with 4px rounded data
 * ends, 2px gaps, recessive grid, legend for 2+ series, hover tooltips and a table view.
 * Text always uses text colours - never the series colour.
 */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"] as const;

type Series = { key: string; label: string; values: number[] };
/** Formats are names so Server Components can pass them (functions cannot cross to the client). */
export type FormatKind = "count" | "money" | "money-whole" | "money-compact" | "percent" | "hours";
type Fmt = (n: number) => string;
type FmtProp = FormatKind | Fmt;
const FORMATS: Record<FormatKind, Fmt> = {
  count: (n) => countFmt(Math.round(n)),
  money: (n) => money(n),
  "money-whole": (n) => money(n, { whole: true }),
  "money-compact": (n) => money(n, { compact: true, whole: true }),
  percent: (n) => `${n.toFixed(0)}%`,
  hours: (n) => `${n.toFixed(1)} h`,
};
const fmt = (f: FmtProp | undefined, fallback: FmtProp = "count"): Fmt => {
  const v = f ?? fallback;
  return typeof v === "function" ? v : FORMATS[v];
};

const W = 640;
const H = 220;
const PAD = { top: 12, right: 12, bottom: 26, left: 52 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: SERIES[i] }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function TableView({ categories, series, format }: { categories: string[]; series: Series[]; format: Fmt }) {
  return (
    <details className="mt-2 text-xs text-muted">
      <summary className="cursor-pointer select-none hover:text-fg">View as table</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left tabular">
          <thead>
            <tr className="text-subtle">
              <th className="py-1 pr-3 font-medium" scope="col">Period</th>
              {series.map((s) => <th key={s.key} className="py-1 pr-3 text-right font-medium" scope="col">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {categories.map((c, i) => (
              <tr key={c} className="border-t border-line/60">
                <th scope="row" className="py-1 pr-3 font-normal text-muted">{c}</th>
                {series.map((s) => <td key={s.key} className="py-1 pr-3 text-right text-fg">{format(s.values[i] ?? 0)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Tooltip({ x, y, title, rows, format }: { x: number; y: number; title: string; rows: { label: string; value: number; colour: string }[]; format: Fmt }) {
  // positioned in % of the SVG box so it scales with the chart
  const left = (x / W) * 100;
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-36 -translate-y-full rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-[var(--shadow-pop)]"
      style={{ left: `${left}%`, top: `${(y / H) * 100}%`, transform: `translate(${left > 60 ? "-100%" : "8px"}, -100%)` }}
      role="status"
    >
      <div className="mb-1 font-medium text-fg">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted"><span className="size-2 rounded-sm" style={{ background: r.colour }} />{r.label}</span>
          <span className="text-fg tabular">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

function YAxis({ max, format }: { max: number; format: Fmt }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const ih = H - PAD.top - PAD.bottom;
  return (
    <g>
      {ticks.map((t) => {
        const y = PAD.top + ih - t * ih;
        return (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#1f2a42" strokeWidth={1} />
            <text x={PAD.left - 8} y={y + 3.5} textAnchor="end" fontSize={10.5} fill="#8090ab" className="tabular">{format(max * t)}</text>
          </g>
        );
      })}
    </g>
  );
}

/** Grouped bars: compare a few measures per period (e.g. revenue vs cost by month). */
export function GroupedBarChart({ title, categories, series, format: formatProp, axisFormat: axisProp }: { title: string; categories: string[]; series: Series[]; format: FmtProp; axisFormat?: FmtProp }) {
  const format = fmt(formatProp);
  const axisFormat = axisProp ? fmt(axisProp) : undefined;
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const band = iw / Math.max(categories.length, 1);
  const groupW = Math.min(band * 0.62, 26 * series.length + 2 * (series.length - 1));
  const barW = (groupW - 2 * (series.length - 1)) / series.length;
  const id = useId();
  return (
    <figure className="relative" aria-labelledby={id}>
      <figcaption id={id} className="sr-only">{title}</figcaption>
      <div className="mb-3"><Legend series={series} /></div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
          <YAxis max={max} format={axisFormat ?? format} />
          {categories.map((c, ci) => {
            const gx = PAD.left + ci * band + (band - groupW) / 2;
            return (
              <g key={c}>
                {hover === ci && <rect x={PAD.left + ci * band} y={PAD.top} width={band} height={ih} fill="#ffffff" opacity={0.035} />}
                {series.map((s, si) => {
                  const v = s.values[ci] ?? 0;
                  const h = Math.max((v / max) * ih, v > 0 ? 2 : 0);
                  const x = gx + si * (barW + 2);
                  const y = PAD.top + ih - h;
                  const r = Math.min(4, barW / 2, h);
                  return <path key={s.key} d={`M${x},${PAD.top + ih}V${y + r}Q${x},${y} ${x + r},${y}H${x + barW - r}Q${x + barW},${y} ${x + barW},${y + r}V${PAD.top + ih}Z`} fill={SERIES[si]} />;
                })}
                <text x={PAD.left + ci * band + band / 2} y={H - 8} textAnchor="middle" fontSize={10.5} fill="#8090ab">{c}</text>
                {/* hit target larger than the marks */}
                <rect x={PAD.left + ci * band} y={PAD.top} width={band} height={ih + 14} fill="transparent" onMouseEnter={() => setHover(ci)} onFocus={() => setHover(ci)} tabIndex={0} aria-label={`${c}: ${series.map((s) => `${s.label} ${format(s.values[ci] ?? 0)}`).join(", ")}`} />
              </g>
            );
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={PAD.top + ih} y2={PAD.top + ih} stroke="#2c3a58" />
        </svg>
        {hover !== null && (
          <Tooltip
            x={PAD.left + hover * band + band / 2}
            y={PAD.top + 10}
            title={categories[hover]!}
            rows={series.map((s, i) => ({ label: s.label, value: s.values[hover] ?? 0, colour: SERIES[i]! }))}
            format={format}
          />
        )}
      </div>
      <TableView categories={categories} series={series} format={format} />
    </figure>
  );
}

/** Lines over time with a crosshair tooltip and end-of-line direct labels. */
export function LineChart({ title, categories, series, format: formatProp, axisFormat: axisProp }: { title: string; categories: string[]; series: Series[]; format: FmtProp; axisFormat?: FmtProp }) {
  const format = fmt(formatProp);
  const axisFormat = axisProp ? fmt(axisProp) : undefined;
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const right = 70;
  const iw = W - PAD.left - right;
  const ih = H - PAD.top - PAD.bottom;
  const step = categories.length > 1 ? iw / (categories.length - 1) : iw;
  const X = (i: number) => PAD.left + i * step;
  const Y = (v: number) => PAD.top + ih - (v / max) * ih;
  const id = useId();
  return (
    <figure className="relative" aria-labelledby={id}>
      <figcaption id={id} className="sr-only">{title}</figcaption>
      <div className="mb-3"><Legend series={series} /></div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
          <YAxis max={max} format={axisFormat ?? format} />
          {categories.map((c, i) =>
            i % Math.ceil(categories.length / 8) === 0 || i === categories.length - 1 ? (
              <text key={c} x={X(i)} y={H - 8} textAnchor="middle" fontSize={10.5} fill="#8090ab">{c}</text>
            ) : null,
          )}
          {hover !== null && <line x1={X(hover)} x2={X(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="#3d4f74" strokeDasharray="3 3" />}
          {series.map((s, si) => {
            const d = s.values.map((v, i) => `${i ? "L" : "M"}${X(i)},${Y(v)}`).join("");
            const last = s.values.length - 1;
            return (
              <g key={s.key}>
                <path d={d} fill="none" stroke={SERIES[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {hover !== null && <circle cx={X(hover)} cy={Y(s.values[hover] ?? 0)} r={4.5} fill={SERIES[si]} stroke="#0f1729" strokeWidth={2} />}
                {last >= 0 && (
                  <text x={X(last) + 8} y={Y(s.values[last] ?? 0) + 4 + si * 2} fontSize={11} fill="#a3aec4">{s.label}</text>
                )}
              </g>
            );
          })}
          {categories.map((c, i) => (
            <rect key={c} x={X(i) - step / 2} y={PAD.top} width={step} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
        {hover !== null && (
          <Tooltip x={X(hover)} y={PAD.top + 10} title={categories[hover]!} rows={series.map((s, i) => ({ label: s.label, value: s.values[hover] ?? 0, colour: SERIES[i]! }))} format={format} />
        )}
      </div>
      <TableView categories={categories} series={series} format={format} />
    </figure>
  );
}

/** Ranked horizontal bars (magnitude, one hue). Each row can link to its records. */
export function BarList({ items, format: formatProp, colour = SERIES[0] }: { items: { label: ReactNode; value: number; href?: string; marker?: string; hint?: string }[]; format: FmtProp; colour?: string }) {
  const format = fmt(formatProp);
  const max = useMemo(() => Math.max(1, ...items.map((i) => i.value)), [items]);
  return (
    <ul className="space-y-1">
      {items.map((it, idx) => {
        const body = (
          <div className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-1.5 hover:bg-raised/60">
            <div className="min-w-0">
              <div className="flex items-center gap-2 truncate text-[13px] text-fg">
                {it.marker && <span className="size-2 shrink-0 rounded-full" style={{ background: it.marker }} aria-hidden />}
                <span className="truncate">{it.label}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full" style={{ width: `${Math.max((it.value / max) * 100, it.value > 0 ? 2 : 0)}%`, background: colour }} />
              </div>
            </div>
            <div className="text-right text-[13px] text-fg tabular">
              {format(it.value)}
              {it.hint && <div className="text-[11px] text-subtle">{it.hint}</div>}
            </div>
          </div>
        );
        return <li key={idx}>{it.href ? <Link href={it.href}>{body}</Link> : body}</li>;
      })}
    </ul>
  );
}

/** Single-value meter (utilisation, budget used). Tone carries status only with a label. */
export function Meter({ value, max, label, tone = "accent" }: { value: number; max: number; label?: string; tone?: "accent" | "ok" | "warn" | "bad" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const colour = { accent: "#3987e5", ok: "#2fbf71", warn: "#f2a93b", bad: "#f0524f" }[tone];
  return (
    <div>
      {label && <div className="mb-1 flex justify-between text-xs text-muted"><span>{label}</span><span className="tabular text-fg">{pct.toFixed(0)}%</span></div>}
      <div className={cx("h-2 overflow-hidden rounded-full bg-sunken")} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colour }} />
      </div>
    </div>
  );
}
