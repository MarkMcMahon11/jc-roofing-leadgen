import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Camera,
  CheckCircle2,
  Cog,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  PenLine,
  Play,
  PlusCircle,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Badge, ColourBadge, EmptyState } from "@/components/ui/primitives";
import { dateTime, relative } from "@/lib/format";

export type UpdateRow = {
  id: string;
  type: string;
  from_status: string | null;
  to_status: string | null;
  body: string | null;
  data: unknown;
  visibility: string;
  created_at: string;
  author: { full_name: string } | null;
};

const ICON: Record<string, LucideIcon> = {
  created: PlusCircle,
  note: MessageSquare,
  status_change: ArrowRight,
  assignment: UserPlus,
  arrival: MapPin,
  start: Play,
  finish: CheckCircle2,
  issue: AlertTriangle,
  approval_request: ShieldQuestion,
  approval: ShieldCheck,
  rejection: ShieldX,
  materials: Package,
  photo: Camera,
  signoff: PenLine,
  client_message: Mail,
  system: Cog,
  ai: Bot,
};
const TITLE: Record<string, string> = {
  created: "Job created",
  note: "Note",
  status_change: "Status changed",
  assignment: "Assignment",
  arrival: "Arrived on site",
  start: "Work started",
  finish: "Work finished",
  issue: "Issue reported",
  approval_request: "Approval requested",
  approval: "Approved",
  rejection: "Rejected",
  materials: "Materials",
  photo: "Photos",
  signoff: "Signed off",
  client_message: "Client message",
  system: "System",
  ai: "AI",
};

const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export function Timeline({
  rows,
  status,
  names,
}: {
  rows: UpdateRow[];
  status: (k: string) => { label: string; colour: string };
  names: Record<string, string>;
}) {
  if (!rows.length) return <EmptyState title="No history yet" />;
  return (
    <ol className="relative px-5 py-4" data-testid="timeline">
      <span className="absolute top-6 bottom-6 left-[37px] w-px bg-line" aria-hidden />
      {rows.map((u) => {
        const Icon = ICON[u.type] ?? Cog;
        const data = (u.data && typeof u.data === "object" ? u.data : {}) as Record<string, unknown>;
        const who = typeof data.employee_id === "string" ? names[data.employee_id] : typeof data.subcontractor_id === "string" ? names[data.subcontractor_id] : undefined;
        return (
          <li key={u.id} className="relative flex gap-3 pb-5 last:pb-0" data-update-type={u.type}>
            <span
              className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-raised"
              style={u.type === "status_change" && u.to_status ? { borderColor: status(u.to_status).colour + "88" } : undefined}
            >
              <Icon className="size-4 text-muted" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-medium text-fg">{TITLE[u.type] ?? u.type}</span>
                {u.type === "status_change" && u.from_status && u.to_status && (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <ColourBadge colour={status(u.from_status).colour}>{status(u.from_status).label}</ColourBadge>
                    <ArrowRight className="size-3.5 text-subtle" aria-label="to" />
                    <ColourBadge colour={status(u.to_status).colour}>{status(u.to_status).label}</ColourBadge>
                  </span>
                )}
                {u.type === "created" && u.to_status && <ColourBadge colour={status(u.to_status).colour}>{status(u.to_status).label}</ColourBadge>}
                {u.visibility !== "internal" ? <Badge tone="info">Client can see</Badge> : <Badge>Internal</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-subtle">
                {u.author?.full_name ?? "System"} · <time dateTime={u.created_at} title={dateTime(u.created_at)}>{relative(u.created_at)}</time>
              </p>
              {u.type === "assignment" && (who || typeof data.start === "string") && (
                <p className="mt-1 text-sm text-muted">
                  {u.body === "Visit cancelled" ? "Cancelled visit" : u.body === "Visit rescheduled" ? "Moved to" : who ? `${who}` : "Booked"}
                  {typeof data.start === "string" && ` · ${fmt(data.start)}`}
                  {typeof data.end === "string" && ` - ${new Date(data.end).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}`}
                </p>
              )}
              {u.body && !(u.type === "assignment" && (who || typeof data.start === "string")) && <p className="mt-1 max-w-3xl text-sm whitespace-pre-wrap text-muted">{u.body}</p>}
              {u.type === "note" && typeof data.status_to === "string" && <p className="mt-1 text-[11.5px] text-subtle">Written when moving the job to {status(data.status_to).label}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
