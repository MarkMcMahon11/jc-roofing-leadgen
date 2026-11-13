import type { ReactNode } from "react";
import { Badge, cx, type Tone } from "@/components/ui/primitives";
import { date, daysUntil } from "@/lib/format";

/** Expiry state of a dated item (certificate, insurance, MOT, qualification). */
export function expiryState(value: string | null | undefined, soonDays = 30): { tone: Tone; label: string; days: number | null } {
  const d = daysUntil(value ?? null);
  if (d === null) return { tone: "neutral", label: "No expiry", days: null };
  if (d < 0) return { tone: "bad", label: `Expired ${Math.abs(d)}d ago`, days: d };
  if (d === 0) return { tone: "bad", label: "Expires today", days: d };
  if (d <= soonDays) return { tone: "warn", label: `${d}d left`, days: d };
  return { tone: "ok", label: "Valid", days: d };
}

/** Date with a warning badge when it is past or within `soonDays`. */
export function ExpiryDate({ value, soonDays = 30, quietWhenValid = true, emptyLabel = "-" }: { value: string | null | undefined; soonDays?: number; quietWhenValid?: boolean; emptyLabel?: string }) {
  if (!value) return <span className="text-subtle">{emptyLabel}</span>;
  const s = expiryState(value, soonDays);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="whitespace-nowrap tabular">{date(value)}</span>
      {(!quietWhenValid || s.tone !== "ok") && <Badge tone={s.tone}>{s.label}</Badge>}
    </span>
  );
}

/** Small pill list (skills, trades) with overflow count. */
export function Chips({ items, max = 3, empty = "-" }: { items: string[]; max?: number; empty?: ReactNode }) {
  if (!items.length) return <span className="text-subtle">{empty}</span>;
  const shown = items.slice(0, max);
  const more = items.length - shown.length;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((s) => (
        <span key={s} className="rounded-md border border-line bg-raised px-1.5 py-0.5 text-[11.5px] whitespace-nowrap text-muted">
          {s}
        </span>
      ))}
      {more > 0 && (
        <span className="rounded-md px-1 py-0.5 text-[11.5px] text-subtle" title={items.slice(max).join(", ")}>
          +{more}
        </span>
      )}
    </span>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cx("mb-3 text-xs font-semibold tracking-[0.12em] text-subtle uppercase", className)}>{children}</h3>;
}

/** Text with preserved line breaks, or a muted placeholder. */
export function Prose({ text, empty = "None recorded" }: { text: string | null | undefined; empty?: string }) {
  if (!text) return <span className="text-subtle">{empty}</span>;
  return <span className="whitespace-pre-line">{text}</span>;
}

export const HAZARDS: { value: string; label: string }[] = [
  { value: "asbestos", label: "Asbestos" },
  { value: "working_at_height", label: "Working at height" },
  { value: "confined_space", label: "Confined space" },
  { value: "lone_working", label: "Lone working" },
  { value: "dog", label: "Dog on premises" },
  { value: "other", label: "Other hazard" },
];
export const hazardLabel = (k: string) => HAZARDS.find((h) => h.value === k)?.label ?? k.replace(/_/g, " ");

/** Removes characters that would break a PostgREST or() filter. */
export function cleanSearch(q: unknown) {
  return typeof q === "string" ? q.replace(/[%,()*\\:"]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

export function param(v: string | string[] | undefined) {
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
}

export const PROPERTY_STATUS: Record<string, { label: string; tone: Tone }> = {
  occupied: { label: "Occupied", tone: "ok" },
  void: { label: "Void", tone: "warn" },
  under_works: { label: "Under works", tone: "info" },
  inactive: { label: "Inactive", tone: "neutral" },
};

export const VULNERABILITY = [
  { value: "mobility", label: "Mobility" },
  { value: "hearing", label: "Hearing" },
  { value: "sight", label: "Sight" },
  { value: "language", label: "Language" },
  { value: "elderly", label: "Elderly" },
  { value: "medical", label: "Medical" },
  { value: "mental_health", label: "Mental health" },
  { value: "safeguarding", label: "Safeguarding" },
  { value: "other", label: "Other" },
];

export const vulnerabilityLabel = (k: string) => VULNERABILITY.find((v) => v.value === k)?.label ?? k.replace(/_/g, " ");

type Opt = { value: string; label: string };
export const INSPECTION_TYPES: Opt[] = [
  { value: "survey", label: "Survey" },
  { value: "pre_works", label: "Pre-works" },
  { value: "post_works", label: "Post-works" },
  { value: "void", label: "Void inspection" },
  { value: "quality", label: "Quality check" },
  { value: "compliance", label: "Compliance" },
  { value: "stock_condition", label: "Stock condition" },
];

export const CERTIFICATE_TYPES: Opt[] = [
  { value: "gas_safety", label: "Gas safety (CP12)" },
  { value: "eicr", label: "EICR (electrical)" },
  { value: "pat", label: "PAT testing" },
  { value: "fire_risk", label: "Fire risk assessment" },
  { value: "asbestos", label: "Asbestos survey" },
  { value: "legionella", label: "Legionella risk assessment" },
  { value: "fensa", label: "FENSA" },
  { value: "building_control", label: "Building control" },
  { value: "completion", label: "Completion certificate" },
  { value: "warranty", label: "Warranty" },
  { value: "other", label: "Other" },
];

export const optLabel = (opts: Opt[], k: string | null | undefined) => (k ? opts.find((o) => o.value === k)?.label ?? k.replace(/_/g, " ") : "-");
