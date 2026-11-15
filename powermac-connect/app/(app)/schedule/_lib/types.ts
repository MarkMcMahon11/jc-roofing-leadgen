// Serialisable shapes passed from the server page to the client planner.

export type WorkingHours = Partial<Record<string, [number, number]>>;

export type Operative = {
  id: string;
  name: string;
  trade: string;
  tradeLabel: string;
  colour: string;
  employmentStatus: string;
  hours: WorkingHours;
  maxDaily: number;
};

export type Sub = { id: string; name: string; reference: string; trades: string[] };

export type BookingJob = {
  id: string;
  reference: string;
  title: string;
  priority: string;
  status: string;
  trade: string;
  postcode: string | null;
  estimatedHours: number | null;
};

export type Booking = {
  id: string;
  workOrderId: string;
  employeeId: string | null;
  subcontractorId: string | null;
  role: string;
  start: string;
  end: string;
  status: string;
  job: BookingJob;
  /** optimistic, not yet confirmed by the server */
  pending?: boolean;
};

export type Absence = {
  id: string;
  employeeId: string;
  type: string;
  label: string;
  status: string;
  start: string;
  end: string;
};

export type QueueJob = {
  id: string;
  reference: string;
  title: string;
  priority: string;
  status: string;
  trade: string;
  tradeLabel: string;
  postcode: string | null;
  town: string | null;
  targetCompletion: string | null;
  estimatedHours: number | null;
  /** booking it will move the job to Scheduled (allowed transition + permission) */
  movesToScheduled: boolean;
};

export type StatusInfo = { label: string; colour: string; category: string };

export type Clash = { kind: string; label: string; start: string; end: string };

export type Recommendation = {
  employeeId: string;
  name: string;
  trade: string;
  colour: string;
  distanceKm: number | null;
  bookedHours: number;
  totalScore: number;
  tradeScore: number;
  availabilityScore: number;
  distanceScore: number;
  workloadScore: number;
  conflicts: number;
  reasons: string[];
};

export type PlannerConfig = {
  view: "week" | "day";
  date: string;
  days: string[];
  weekStart: string;
  today: string;
  nowIso: string;
  canEdit: boolean;
  /** link names to /workforce/[id] and /subcontractors/[id] only when the viewer can open them */
  linkPeople: boolean;
  linkSubs: boolean;
  /** day the recommendation panel and mobile agenda start on */
  focusDay: string;
};

/** A booking the user is about to make (drop, click, recommendation or form). */
export type Proposal =
  | { kind: "create"; jobId: string; employeeId: string | null; subcontractorId: string | null; start: string; end: string }
  | { kind: "move"; bookingId: string; employeeId: string | null; subcontractorId: string | null; start: string; end: string; status?: string };

export const ASSIGNMENT_STATUSES: { value: string; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "accepted", label: "Accepted" },
  { value: "travelling", label: "Travelling" },
  { value: "on_site", label: "On site" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "no_access", label: "No access" },
];

export const PRIORITY_COLOUR: Record<string, string> = { emergency: "#f0524f", urgent: "#f2a93b", routine: "#4aa8ff", planned: "#86918a" };
export const PRIORITY_RANK: Record<string, number> = { emergency: 0, urgent: 1, routine: 2, planned: 3 };
