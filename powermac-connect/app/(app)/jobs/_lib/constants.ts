// Values fixed by database CHECK constraints (not tenant-configurable). Statuses, trades and
// work categories are configurable per tenant and always come from the database instead.

export const PRIORITIES = [
  { value: "emergency", label: "Emergency" },
  { value: "urgent", label: "Urgent" },
  { value: "routine", label: "Routine" },
  { value: "planned", label: "Planned" },
] as const;
export type Priority = (typeof PRIORITIES)[number]["value"];
export const PRIORITY_RANK: Record<string, number> = { emergency: 0, urgent: 1, routine: 2, planned: 3 };

export const SOURCES = [
  { value: "manual", label: "Entered by staff" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "portal", label: "Client portal" },
  { value: "api", label: "API" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "inspection", label: "Inspection" },
  { value: "bulk", label: "Bulk upload" },
  { value: "ai", label: "AI intake" },
] as const;
export const sourceLabel = (v: string | null | undefined) => SOURCES.find((s) => s.value === v)?.label ?? v ?? "-";

export const DUE_FILTERS = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "week", label: "Due in 7 days" },
] as const;

export const ASSIGNMENT_STATUS: Record<string, { label: string; tone: "neutral" | "accent" | "ok" | "warn" | "bad" | "info" }> = {
  scheduled: { label: "Scheduled", tone: "info" },
  accepted: { label: "Accepted", tone: "accent" },
  travelling: { label: "Travelling", tone: "accent" },
  on_site: { label: "On site", tone: "ok" },
  paused: { label: "Paused", tone: "warn" },
  completed: { label: "Completed", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  no_access: { label: "No access", tone: "bad" },
};

export const MATERIAL_STATUS = [
  { value: "required", label: "Required" },
  { value: "ordered", label: "Ordered" },
  { value: "allocated", label: "Allocated" },
  { value: "used", label: "Used" },
  { value: "returned", label: "Returned" },
] as const;

export const PHOTO_STAGES = [
  { value: "before", label: "Before" },
  { value: "during", label: "During" },
  { value: "after", label: "After" },
  { value: "issue", label: "Issue" },
] as const;

export const MAX_DAY_HOURS = 8;
