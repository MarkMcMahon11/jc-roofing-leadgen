import type { Tone } from "@/components/ui/primitives";

export const SUB_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending approval", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  suspended: { label: "Suspended", tone: "bad" },
  archived: { label: "Archived", tone: "neutral" },
};

export const CIS_STATUS: Record<string, { label: string; tone: Tone; hint: string }> = {
  gross: { label: "Gross (0%)", tone: "ok", hint: "Paid without CIS deduction" },
  net: { label: "Net (20%)", tone: "info", hint: "20% CIS deduction" },
  higher: { label: "Higher (30%)", tone: "warn", hint: "30% deduction: not verified with HMRC" },
  unverified: { label: "Not verified", tone: "bad", hint: "Verify with HMRC before paying" },
};

/** Live = still to be done on an open job. */
export const LIVE_ASSIGNMENT = ["scheduled", "accepted", "travelling", "on_site", "paused"];
