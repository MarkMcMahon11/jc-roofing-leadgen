// Constants and small helpers shared by the CRM and Contracts modules (server and client safe).
import type { Tone } from "@/components/ui/primitives";

export type Opt = { value: string; label: string };

export const ORG_STATUSES: Opt[] = [
  { value: "prospect", label: "Prospect" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];
export const orgStatusTone: Record<string, Tone> = { prospect: "info", active: "ok", inactive: "neutral" };

export const STAGES = [
  { key: "lead", label: "Lead", tone: "neutral" },
  { key: "qualified", label: "Qualified", tone: "info" },
  { key: "tender", label: "Tender", tone: "accent" },
  { key: "proposal", label: "Proposal", tone: "accent" },
  { key: "negotiation", label: "Negotiation", tone: "warn" },
  { key: "won", label: "Won", tone: "ok" },
  { key: "lost", label: "Lost", tone: "bad" },
] as const satisfies readonly { key: string; label: string; tone: Tone }[];
export type StageKey = (typeof STAGES)[number]["key"];
export const STAGE_KEYS = STAGES.map((s) => s.key) as [StageKey, ...StageKey[]];
export const OPEN_STAGES: StageKey[] = ["lead", "qualified", "tender", "proposal", "negotiation"];
export const stageLabel = (k: string) => STAGES.find((s) => s.key === k)?.label ?? k;

export const ACTIVITY_TYPES = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "email", label: "Email" },
  { value: "follow_up", label: "Follow-up" },
  { value: "task", label: "Task" },
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];
export const ACTIVITY_KEYS = ACTIVITY_TYPES.map((a) => a.value) as [ActivityType, ...ActivityType[]];
export const activityLabel = (k: string) => ACTIVITY_TYPES.find((a) => a.value === k)?.label ?? k;

export const PREFERRED_CHANNELS: Opt[] = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "sms", label: "SMS" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "post", label: "Post" },
];

/** Strip characters that would break a PostgREST `or=(...)` filter. */
export function searchTerm(v: unknown) {
  return typeof v === "string" ? v.replace(/[%,()*\\:"']/g, " ").trim().slice(0, 80) : "";
}

export function str(v: unknown) {
  return typeof v === "string" && v ? v : undefined;
}

export function pageNo(v: unknown) {
  return Math.max(1, Number(typeof v === "string" ? v : 1) || 1);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** "2026-11-20T09:30" typed in a datetime-local field (London wall clock) -> ISO instant. */
export function londonToISO(local: string) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(local);
  if (!m) return null;
  const asUtc = new Date(`${m[1]}T${m[2] ?? "09:00"}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  const shown = asUtc.toLocaleString("sv-SE", { timeZone: "Europe/London" }).replace(" ", "T") + "Z";
  const offset = new Date(shown).getTime() - asUtc.getTime();
  return new Date(asUtc.getTime() - offset).toISOString();
}

/** ISO instant -> "YYYY-MM-DDTHH:mm" in London, for datetime-local default values. */
export function isoToLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/London" }).replace(" ", "T").slice(0, 16);
}

export function fullName(c: { first_name: string; last_name?: string | null } | null | undefined) {
  if (!c) return "";
  return `${c.first_name} ${c.last_name ?? ""}`.trim();
}

export function fileSize(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** ISO instant `days` from now (negative = in the past). */
export function isoDaysFromNow(days: number) {
  return new Date(new Date().getTime() + days * 86_400_000).toISOString();
}

/** Deterministic short GBP (same output on server and in the browser, unlike Intl compact). */
export function gbpShort(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const one = (x: number) => x.toFixed(1).replace(/\.0$/, "");
  if (abs >= 1_000_000) return `${sign}£${one(abs / 1_000_000)}m`;
  if (abs >= 10_000) return `${sign}£${one(abs / 1_000)}k`;
  return `${sign}£${Math.round(abs).toLocaleString("en-GB")}`;
}
