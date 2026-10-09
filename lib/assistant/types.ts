// The WhatsApp assistant: one number that customers, suppliers, the team and the owner all message.
// Who is talking is decided by the verified sender's phone number, never by anything they write.

export type Role = "owner" | "staff" | "public";

export type Contact = {
  phone: string; // digits with country code, e.g. 447700900123
  name?: string;
  kind: "customer" | "supplier" | "staff" | "unknown";
  crewId?: string; // set for team members
  leadId?: string; // set when the number matches a quote-form enquiry
  bot: boolean; // false = the owner has taken the conversation over: the assistant stays quiet
  blocked?: boolean;
  createdAt: string;
  lastInboundAt?: string;
};

export type Msg = {
  id: string;
  phone: string;
  dir: "in" | "out";
  by: "contact" | "bot" | "owner";
  text: string;
  at: string;
  waId?: string;
  delivery?: "sent" | "failed" | "demo" | "skipped";
};

export type TaskKind = "enquiry" | "supplier" | "reschedule" | "complaint" | "urgent" | "van_issue" | "safety" | "late_or_off" | "time_off" | "materials" | "expense" | "question" | "other";

/** Something the assistant heard that the owner needs to know about or decide. */
export type Task = {
  id: string;
  at: string;
  phone: string;
  who: string; // display name
  role: "public" | "staff";
  crewId?: string;
  kind: TaskKind;
  urgent: boolean;
  summary: string;
  detail?: Record<string, string>;
  status: "open" | "done" | "dismissed";
  resolvedAt?: string;
  /** Staff expense claims wait here until the owner approves them. */
  expense?: { amount: number; description: string; vehicleId?: string };
};

/** Changes the owner can ask for by message. Nothing here runs until the owner replies YES. */
export type OwnerAction =
  | { type: "lead_status"; leadId: string; status: "new" | "contacted" | "quoted" | "won" | "lost" }
  | { type: "add_expense"; amount: number; category: string; description: string; vehicleId?: string; date?: string }
  | { type: "mileage"; vehicleId: string; mileage: number }
  | { type: "schedule"; kind: "inspection" | "job"; title: string; customer?: string; address: string; postcode?: string; date: string; endDate?: string; time?: string; vanIds: string[]; crewIds: string[]; value?: number; leadId?: string; confirmToPhone?: string }
  | { type: "job_status"; jobId: string; status: "scheduled" | "in_progress" | "done" | "cancelled" }
  | { type: "task"; taskId: string; status: "done" | "dismissed" }
  | { type: "approve_expense"; taskId: string }
  | { type: "reply"; phone: string; text: string }
  | { type: "message_staff"; crewIds: string[]; text: string }
  | { type: "contact_bot"; phone: string; bot: boolean }
  | { type: "order_materials"; supplierId: string; supplierName: string; via: string; site: { name: string; address: string; postcode?: string; lat?: number; lng?: number; jobId?: string; leadId?: string }; items: { description: string; qty: number; unit: string }[]; deliverBy: string; window: "morning" | "afternoon" | "any"; notes?: string }
  | { type: "order_status"; orderId: string; ref: string; status: "delivered" | "cancelled" }
  | { type: "book_service"; vehicleId: string; maintType: string; description: string; garage?: string; date: string; cost?: number };

export type Pending = { id: string; at: string; actions: OwnerAction[]; summary: string[] };

export type AssistantDoc = {
  rev: number;
  enabled: boolean; // master switch: off = nothing is answered automatically
  contacts: Contact[];
  messages: Msg[];
  tasks: Task[];
  pending?: Pending;
  seen: string[]; // recent WhatsApp message ids, so Meta's retries are ignored
  reminded: string[]; // reminders already sent ("owner:2026-10-05"), so a repeat run never double-sends
  ai: { day: string; n: number }; // how many AI calls today (cost cap)
  ownerLastInboundAt?: string; // WhatsApp only lets us message freely within 24 h of this
  settings: { staffAutoUpdates: boolean };
};

export const emptyAssistant = (): AssistantDoc => ({
  rev: 1,
  enabled: true,
  contacts: [],
  messages: [],
  tasks: [],
  seen: [],
  reminded: [],
  ai: { day: "", n: 0 },
  settings: { staffAutoUpdates: true },
});

export const CAPS = { messages: 800, perPhone: 60, tasks: 400, contacts: 600, seen: 1000, reminded: 200 };
export const KEEP_DAYS = 90; // conversations and finished tasks older than this are deleted
