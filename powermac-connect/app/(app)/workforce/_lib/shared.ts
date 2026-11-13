import type { Tone } from "@/components/ui/primitives";

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const DAY_LABEL: Record<(typeof DAYS)[number], string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

export const EMPLOYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "ok" },
  on_leave: { label: "On leave", tone: "info" },
  suspended: { label: "Suspended", tone: "warn" },
  left: { label: "Left", tone: "neutral" },
};
export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "fixed_term", label: "Fixed term" },
  { value: "apprentice", label: "Apprentice" },
  { value: "agency", label: "Agency" },
];
export const VEHICLE_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "ok" },
  maintenance: { label: "In maintenance", tone: "warn" },
  off_road: { label: "Off road", tone: "bad" },
  disposed: { label: "Disposed", tone: "neutral" },
};
export const VEHICLE_TYPES = [
  { value: "van", label: "Van" },
  { value: "pickup", label: "Pickup" },
  { value: "tipper", label: "Tipper" },
  { value: "car", label: "Car" },
  { value: "trailer", label: "Trailer" },
  { value: "plant", label: "Plant" },
  { value: "other", label: "Other" },
];
export const ABSENCE_STATUS: Record<string, { label: string; tone: Tone }> = {
  requested: { label: "Requested", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** 8.5 -> "08:30" */
export function hoursToTime(h: number | undefined | null) {
  if (h === undefined || h === null || !Number.isFinite(h)) return "";
  const mins = Math.round(h * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export type WorkingHours = Partial<Record<(typeof DAYS)[number], [number, number]>>;
export function readWorkingHours(v: unknown): WorkingHours {
  const out: WorkingHours = {};
  if (!v || typeof v !== "object") return out;
  for (const d of DAYS) {
    const x = (v as Record<string, unknown>)[d];
    if (Array.isArray(x) && x.length === 2 && typeof x[0] === "number" && typeof x[1] === "number") out[d] = [x[0], x[1]];
  }
  return out;
}
