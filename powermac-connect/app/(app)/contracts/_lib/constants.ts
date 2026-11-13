// Contract-module constants (server and client safe).
import type { Tone } from "@/components/ui/primitives";
import { daysUntil } from "@/lib/format";
import type { Opt } from "../../crm/_lib/shared";

export const CONTRACT_STATUSES: Opt[] = [
  { value: "draft", label: "Draft" },
  { value: "tender", label: "Tender" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "expired", label: "Expired" },
  { value: "terminated", label: "Terminated" },
  { value: "completed", label: "Completed" },
];
export const CONTRACT_STATUS_KEYS = ["draft", "tender", "active", "on_hold", "expired", "terminated", "completed"] as const;
export const contractStatusTone: Record<string, Tone> = { draft: "neutral", tender: "info", active: "ok", on_hold: "warn", expired: "bad", terminated: "bad", completed: "accent" };
export const contractStatusLabel = (k: string) => CONTRACT_STATUSES.find((s) => s.value === k)?.label ?? k;

export const PRICING_BASIS: Opt[] = [
  { value: "schedule_of_rates", label: "Schedule of rates" },
  { value: "fixed_price", label: "Fixed price" },
  { value: "cost_plus", label: "Cost plus" },
  { value: "day_rate", label: "Day rate" },
  { value: "mixed", label: "Mixed" },
];
export const PRICING_KEYS = ["schedule_of_rates", "fixed_price", "cost_plus", "day_rate", "mixed"] as const;

export const PRIORITIES = [
  { key: "emergency", label: "Emergency" },
  { key: "urgent", label: "Urgent" },
  { key: "routine", label: "Routine" },
  { key: "planned", label: "Planned" },
] as const;
export const PRIORITY_KEYS = ["emergency", "urgent", "routine", "planned"] as const;

/** Defaults inserted with every new contract so it is usable immediately (hours). */
export const DEFAULT_SLAS = [
  { priority: "emergency", response_hours: 1, attend_hours: 4, complete_hours: 24, description: "Make safe: risk to health, safety or security of the property" },
  { priority: "urgent", response_hours: 4, attend_hours: 24, complete_hours: 120, description: "Significant inconvenience or risk of further damage" },
  { priority: "routine", response_hours: 24, attend_hours: 168, complete_hours: 672, description: "Day-to-day repairs" },
  { priority: "planned", response_hours: 72, attend_hours: 720, complete_hours: 2160, description: "Programmed and non-urgent works" },
] as const;

export const METRICS: Opt[] = [
  { value: "on_time_completion", label: "On-time completion" },
  { value: "first_time_fix", label: "First-time fix" },
  { value: "customer_satisfaction", label: "Customer satisfaction" },
  { value: "jobs_completed", label: "Jobs completed" },
  { value: "sla_response", label: "SLA response" },
  { value: "cost_variance", label: "Cost variance" },
  { value: "custom", label: "Custom" },
];
export const METRIC_KEYS = ["on_time_completion", "first_time_fix", "sla_response", "customer_satisfaction", "jobs_completed", "cost_variance", "custom"] as const;
/** Metrics measured automatically from job records (v_contract_performance); the rest are entered by hand. */
export const AUTO_METRICS = ["on_time_completion", "first_time_fix", "customer_satisfaction", "jobs_completed"];

export const DEFAULT_KPIS = [
  { name: "On-time completion", metric_key: "on_time_completion", target_value: 95, unit: "%", direction: "higher_better" },
  { name: "First-time fix rate", metric_key: "first_time_fix", target_value: 85, unit: "%", direction: "higher_better" },
  { name: "Customer satisfaction", metric_key: "customer_satisfaction", target_value: 4.5, unit: "/5", direction: "higher_better" },
] as const;

export const VARIATION_TONE: Record<string, Tone> = { proposed: "warn", approved: "ok", rejected: "bad", withdrawn: "neutral" };

/** Expiry badge data: warn within 90 days, critical within 30. */
export function expiry(endDate: string | null | undefined, status: string) {
  const d = daysUntil(endDate ?? null);
  if (d === null) return { days: null, tone: "neutral" as Tone, text: "No end date" };
  if (d < 0) return { days: d, tone: (status === "active" ? "bad" : "neutral") as Tone, text: status === "active" ? `Ended ${-d}d ago` : "Ended" };
  if (d === 0) return { days: d, tone: "bad" as Tone, text: "Ends today" };
  const tone: Tone = status !== "active" && status !== "on_hold" ? "neutral" : d <= 30 ? "bad" : d <= 90 ? "warn" : "neutral";
  return { days: d, tone, text: `${d} day${d === 1 ? "" : "s"}` };
}

/** 24 -> "24h", 168 -> "7 days", 2160 -> "90 days". */
export function hours(h: number | string | null | undefined) {
  if (h === null || h === undefined || h === "") return "-";
  const n = Number(h);
  if (n >= 48 && n % 24 === 0) return `${n / 24} days`;
  return `${n}h`;
}
