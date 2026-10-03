// Derived numbers the dashboard shows. Pure functions over the dashboard document and the enquiries.

import { detailsText, SERVICE_INFO } from "@/lib/services";
import type { Lead } from "@/lib/types";
import { addDays, addMonths, daysBetween, eachDay, inLastDays, monthKey, parseDate, sum, today, ukDate, weekStart } from "./format";
import type { CrewMember, FleetDB, Job, Vehicle } from "./types";

// ---------- documents and deadlines ----------

const plural = (n: number, w: string) => `${n.toLocaleString("en-GB")} ${w}${n === 1 ? "" : "s"}`;

/** A service is flagged when fewer than this many miles are left. */
export const SERVICE_MILES_WARN = 1000;

export type AlertGroup = "vans" | "crew" | "service" | "fines" | "leads" | "jobs";
export type Alert = { id: string; severity: "high" | "medium" | "low"; text: string; href: string; days?: number; group: AlertGroup };

export const sev = (days: number): Alert["severity"] => (days <= 7 ? "high" : days <= 15 ? "medium" : "low");

export type DocRow = { key: string; label: string; date: string; who: string; href: string; kind: "van" | "crew" };

/** Every dated document in the business, soonest first. */
export function allDocuments(db: FleetDB): DocRow[] {
  const rows: DocRow[] = [];
  for (const v of db.vehicles) {
    const href = `/admin/vans/${v.id}`;
    if (v.status !== "off_road") {
      rows.push({ key: `${v.id}-mot`, label: "MOT", date: v.docs.mot, who: v.reg, href, kind: "van" });
      rows.push({ key: `${v.id}-tax`, label: "Vehicle tax", date: v.docs.roadTax, who: v.reg, href, kind: "van" });
    }
    rows.push({ key: `${v.id}-ins`, label: "Insurance", date: v.docs.insurance, who: v.reg, href, kind: "van" });
    if (v.docs.breakdown) rows.push({ key: `${v.id}-bd`, label: "Breakdown cover", date: v.docs.breakdown, who: v.reg, href, kind: "van" });
    if (v.nextServiceDate && v.status !== "off_road") rows.push({ key: `${v.id}-svc`, label: "Service due", date: v.nextServiceDate, who: v.reg, href, kind: "van" });
  }
  for (const c of db.crew.filter((x) => x.status === "active")) {
    const href = `/admin/crew/${c.id}`;
    const first = c.name.split(" ")[0];
    if (c.drives && c.licenceExpiry) rows.push({ key: `${c.id}-lic`, label: "Driving licence check", date: c.licenceExpiry, who: first, href, kind: "crew" });
    if (c.cscsExpiry) rows.push({ key: `${c.id}-cscs`, label: `CSCS card${c.cscsCard ? ` (${c.cscsCard})` : ""}`, date: c.cscsExpiry, who: first, href, kind: "crew" });
    if (c.heightExpiry) rows.push({ key: `${c.id}-h`, label: "Working at height training", date: c.heightExpiry, who: first, href, kind: "crew" });
    if (c.firstAidExpiry) rows.push({ key: `${c.id}-fa`, label: "First aid certificate", date: c.firstAidExpiry, who: first, href, kind: "crew" });
  }
  return rows.sort((a, b) => (a.date < b.date ? -1 : 1));
}

const hotNew = (l: Lead) => l.status === "new" && l.score === "hot";

export function buildAlerts(db: FleetDB, leads: Lead[]): Alert[] {
  const t = today();
  const out: Alert[] = [];

  for (const r of allDocuments(db)) {
    const days = daysBetween(t, r.date);
    if (days > 30) continue;
    const isService = r.label === "Service due";
    const when = days < 0 ? `${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`;
    out.push({
      id: `doc-${r.key}`,
      severity: sev(days),
      text: isService ? `Service ${days < 0 ? "was due" : "due"} ${when}: ${r.who}` : `${r.label} ${days < 0 ? "expired" : "runs out"} ${when}: ${r.who}`,
      href: r.href,
      days,
      group: isService ? "service" : r.kind === "van" ? "vans" : "crew",
    });
  }

  for (const v of db.vehicles.filter((x) => x.status !== "off_road")) {
    const left = v.nextServiceMiles - v.mileage;
    if (left < SERVICE_MILES_WARN)
      out.push({ id: `mi-${v.id}`, severity: left < 0 ? "high" : "medium", text: left < 0 ? `Service overdue by ${plural(Math.abs(left), "mile")}: ${v.reg}` : left === 0 ? `Service due now: ${v.reg}` : `Service due in ${plural(left, "mile")}: ${v.reg}`, href: `/admin/vans/${v.id}`, group: "service" });
  }

  for (const c of db.crew.filter((x) => x.status === "active" && x.drives && (x.licencePoints ?? 0) >= 6))
    out.push({ id: `pts-${c.id}`, severity: "medium", text: `${c.name} has ${c.licencePoints} points on their licence: tell your insurer if needed`, href: `/admin/crew/${c.id}`, group: "crew" });

  for (const f of db.fines) {
    const v = db.vehicles.find((x) => x.id === f.vehicleId);
    if (f.status === "to_name") {
      const days = daysBetween(t, f.nameBy);
      if (days <= 20) out.push({ id: `fine-${f.id}`, severity: sev(days), text: `Name the driver for notice ${f.ref}${v ? `: ${v.reg}` : ""}`, href: "/admin/fines", days, group: "fines" });
    }
    if (f.discountBy && (f.status === "to_name" || f.status === "named")) {
      const days = daysBetween(t, f.discountBy);
      if (days >= 0 && days <= 7) out.push({ id: `disc-${f.id}`, severity: "medium", text: `Reduced amount for notice ${f.ref} ends ${days === 0 ? "today" : `in ${plural(days, "day")}`}`, href: "/admin/fines", days, group: "fines" });
    }
  }

  for (const l of leads.filter(hotNew))
    out.push({ id: `lead-${l.id}`, severity: "high", text: `New hot lead, not contacted: ${l.name} (${SERVICE_INFO[l.service ?? "roof"].label})`, href: `/admin/leads?lead=${l.id}`, group: "leads" });
  for (const l of leads.filter((x) => x.status === "new" && x.score === "warm" && !x.waitlist))
    out.push({ id: `lead-${l.id}`, severity: "low", text: `New enquiry waiting: ${l.name} (${SERVICE_INFO[l.service ?? "roof"].label})`, href: `/admin/leads?lead=${l.id}`, group: "leads" });

  for (const j of db.jobs.filter((x) => x.status !== "done" && x.status !== "cancelled" && lastDay(x) >= t && x.date <= addDays(t, 7))) {
    const issues = jobIssues(db, j);
    for (const [i, text] of issues.entries()) out.push({ id: `jobiss-${j.id}-${i}`, severity: "high", text: `${text} (${j.title}, ${j.date})`, href: "/admin/jobs", days: Math.max(0, daysBetween(t, j.date)), group: "jobs" });
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.days ?? 99) - (b.days ?? 99));
}

// ---------- jobs, schedule, conflicts ----------

const lastDay = (j: Job) => j.endDate ?? j.date;
const overlaps = (a: Job, b: Job) => a.date <= lastDay(b) && b.date <= lastDay(a);
const active = (j: Job) => j.status !== "cancelled" && j.status !== "done";

const minutes = (t?: string) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);

/** Two bookings clash if they overlap in dates. Two inspections on one day only clash if they are less than an hour apart (or have no time). */
function clash(a: Job, b: Job): boolean {
  if (!overlaps(a, b)) return false;
  if (a.kind === "inspection" && b.kind === "inspection") {
    const x = minutes(a.time);
    const y = minutes(b.time);
    return x === null || y === null || Math.abs(x - y) < 60;
  }
  return true;
}

export function vanClashes(db: FleetDB, job: Job, vanId: string): Job[] {
  return db.jobs.filter((o) => o.id !== job.id && active(o) && o.vanIds.includes(vanId) && clash(job, o));
}
export function crewClashes(db: FleetDB, job: Job, crewId: string): Job[] {
  return db.jobs.filter((o) => o.id !== job.id && active(o) && o.crewIds.includes(crewId) && clash(job, o));
}

/** Problems with who/what is sent to a job: double-booked vans and crew, vans in the garage, and MOT, insurance, CSCS or height training that runs out before the job ends. */
export function jobIssues(db: FleetDB, job: Job): string[] {
  if (!active(job)) return [];
  const out: string[] = [];
  const last = lastDay(job);
  for (const id of job.vanIds) {
    const v = db.vehicles.find((x) => x.id === id);
    if (!v) continue;
    const clashing = vanClashes(db, job, id);
    if (clashing.length) out.push(`${v.reg} is also booked on ${clashing[0].title}`);
    if (v.status === "off_road") out.push(`${v.reg} is off the road`);
    else if (v.status === "in_garage" && job.date <= addDays(today(), 7)) out.push(`${v.reg} is in the garage`);
    if (v.docs.mot < last && v.status !== "off_road") out.push(`${v.reg}'s MOT runs out before the job ends`);
    if (v.docs.insurance < last) out.push(`${v.reg}'s insurance runs out before the job ends`);
  }
  for (const id of job.crewIds) {
    const c = db.crew.find((x) => x.id === id);
    if (!c) continue;
    if (crewClashes(db, job, id).length) out.push(`${c.name} is double-booked`);
    if (job.kind === "job" && c.heightExpiry && c.heightExpiry < last) out.push(`${c.name}'s working-at-height training runs out before the job ends`);
    if (job.kind === "job" && c.cscsExpiry && c.cscsExpiry < last) out.push(`${c.name}'s CSCS card runs out before the job ends`);
  }
  return out;
}

export type ScheduleItem = {
  key: string;
  date: string;
  endDate?: string;
  time?: string;
  kind: "job" | "inspection";
  title: string;
  customer?: string;
  address: string;
  status: Job["status"];
  vanIds: string[];
  crewIds: string[];
  value?: number;
  jobId?: string;
  leadId?: string;
};

/** Jobs and booked inspections in a date range. An inspection a customer booked online shows here even before a van is assigned. */
export function scheduleItems(db: FleetDB, leads: Lead[], from: string, to: string): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  const covered = new Set(db.jobs.filter((j) => j.kind === "inspection" && j.leadId).map((j) => j.leadId));
  for (const j of db.jobs) {
    if (j.status === "cancelled" || j.date > to || lastDay(j) < from) continue;
    items.push({ key: j.id, date: j.date, endDate: j.endDate, time: j.time, kind: j.kind, title: j.title, customer: j.customer, address: j.address, status: j.status, vanIds: j.vanIds, crewIds: j.crewIds, value: j.value, jobId: j.id, leadId: j.leadId });
  }
  for (const l of leads) {
    if (!l.inspectionBooked || covered.has(l.id) || l.status === "lost") continue;
    const date = l.inspectionBooked.slice(0, 10);
    if (date < from || date > to) continue;
    items.push({ key: `lead-${l.id}`, date, time: l.inspectionBooked.slice(11, 16), kind: "inspection", title: "Free roof inspection", customer: l.name, address: `${l.address}${l.address.includes(l.postcode) ? "" : `, ${l.postcode}`}`, status: "scheduled", vanIds: [], crewIds: [], leadId: l.id });
  }
  return items.sort((a, b) => (a.date === b.date ? (a.time ?? "99") .localeCompare(b.time ?? "99") : a.date < b.date ? -1 : 1));
}

/** Share of the next `days` working days (Mon to Fri) on which a van has a job or inspection. */
export function vanUtilisation(db: FleetDB, vanId: string, from = today(), days = 14): number {
  const working = eachDay(from, addDays(from, days - 1)).filter((d) => ![0, 6].includes(parseDate(d).getDay()));
  if (!working.length) return 0;
  const busy = working.filter((d) => db.jobs.some((j) => active(j) && j.vanIds.includes(vanId) && j.date <= d && lastDay(j) >= d));
  return busy.length / working.length;
}

// ---------- costs ----------

export function vehicleCosts(db: FleetDB, v: Vehicle, sinceDays = 90) {
  const rows = db.expenses.filter((e) => e.vehicleId === v.id && inLastDays(e.date, sinceDays));
  return { total: sum(rows.map((e) => e.amount)), fuel: sum(rows.filter((e) => e.category === "fuel").map((e) => e.amount)), rows };
}

export function monthlyCosts(db: FleetDB, months = 6) {
  const out: { month: string; costs: number; fuel: number; won: number }[] = [];
  const first = today().slice(0, 7) + "-01";
  for (let i = months - 1; i >= 0; i--) {
    const k = monthKey(addMonths(first, -i));
    const exp = db.expenses.filter((e) => e.date.startsWith(k));
    out.push({
      month: k,
      costs: sum(exp.map((e) => e.amount)),
      fuel: sum(exp.filter((e) => e.category === "fuel").map((e) => e.amount)),
      won: sum(db.jobs.filter((j) => j.kind === "job" && j.status !== "cancelled" && j.date.startsWith(k)).map((j) => j.value ?? 0)),
    });
  }
  return out;
}

// ---------- enquiries ----------

export const leadValue = (l: Lead) => (l.noPrice ? 0 : (l.low + l.high) / 2);

export function weeklyLeads(leads: Lead[], weeks = 12) {
  const cur = weekStart(today());
  const first = addDays(cur, -7 * (weeks - 1));
  const buckets = new Map<string, { total: number; hot: number }>();
  for (let i = 0; i < weeks; i++) buckets.set(addDays(first, 7 * i), { total: 0, hot: 0 });
  for (const l of leads) {
    if (l.score === "not-a-fit") continue;
    const b = buckets.get(weekStart(ukDate(l.createdAt)));
    if (!b) continue;
    b.total++;
    if (l.score === "hot") b.hot++;
  }
  return [...buckets].map(([week, v]) => ({ week, ...v }));
}

export function pipeline(leads: Lead[]) {
  const real = leads.filter((l) => l.score !== "not-a-fit");
  const by = (s: Lead["status"]) => real.filter((l) => l.status === s);
  const val = (list: Lead[]) => sum(list.map(leadValue));
  return {
    new: by("new").length,
    contacted: by("contacted").length,
    quoted: by("quoted").length,
    won: by("won").length,
    lost: by("lost").length,
    openValue: val([...by("new"), ...by("contacted"), ...by("quoted")]),
    wonValue: val(by("won")),
  };
}

// ---------- project map ----------

export type Stage = "enquiry" | "inspection" | "quoted" | "won" | "scheduled" | "in_progress" | "complete" | "lost";

/** `color` is for dots and map pins; `text` is a darker shade of the same hue that is readable as small text on white. */
export const STAGES: Record<Stage, { label: string; color: string; text: string; tone: "blue" | "amber" | "violet" | "green" | "slate" | "red" }> = {
  enquiry: { label: "New enquiry", color: "#0ea5e9", text: "#0369a1", tone: "blue" },
  inspection: { label: "Inspection booked", color: "#f59e0b", text: "#92400e", tone: "amber" },
  quoted: { label: "Quoted", color: "#8b5cf6", text: "#6d28d9", tone: "violet" },
  won: { label: "Won, to schedule", color: "#14b8a6", text: "#0f766e", tone: "green" },
  scheduled: { label: "Job scheduled", color: "#2563eb", text: "#1d4ed8", tone: "blue" },
  in_progress: { label: "Work in progress", color: "#ea580c", text: "#c2410c", tone: "amber" },
  complete: { label: "Complete", color: "#16a34a", text: "#15803d", tone: "green" },
  lost: { label: "Lost", color: "#94a3b8", text: "#475569", tone: "slate" },
};

export type Pin = {
  key: string;
  stage: Stage;
  name: string;
  address: string;
  title: string;
  lat: number;
  lng: number;
  value?: number;
  date?: string;
  vanIds: string[];
  crewIds: string[];
  leadId?: string;
  jobId?: string;
};

const midValue = (l: Lead) => (l.noPrice ? undefined : Math.round(leadValue(l)));

/** Every customer project with a known location, with where it has got to. */
export function projectPins(db: FleetDB, leads: Lead[], materialLabel: (id?: string) => string | undefined = () => undefined): Pin[] {
  const pins: Pin[] = [];
  const usedJobs = new Set<string>();
  for (const l of leads) {
    if (l.score === "not-a-fit" || typeof l.lat !== "number" || typeof l.lng !== "number") continue;
    const mine = db.jobs.filter((j) => j.leadId === l.id && j.status !== "cancelled");
    const work = mine.find((j) => j.kind === "job");
    const visit = mine.find((j) => j.kind === "inspection");
    mine.forEach((j) => usedJobs.add(j.id));
    let stage: Stage;
    if (work) stage = work.status === "done" ? "complete" : work.status === "in_progress" ? "in_progress" : "scheduled";
    else if (l.status === "lost") stage = "lost";
    else if (l.status === "won") stage = "won";
    else if (l.status === "quoted") stage = "quoted";
    else stage = l.inspectionBooked || visit ? "inspection" : "enquiry";
    const svc = SERVICE_INFO[l.service ?? "roof"].label;
    const detail = detailsText(l, materialLabel(l.material));
    pins.push({
      key: `lead-${l.id}`, stage, name: l.name, address: l.address.replace(/, (UK|United Kingdom)$/, ""), title: detail ? `${svc}: ${detail}` : svc,
      lat: l.lat, lng: l.lng, value: work?.value ?? midValue(l), date: (work ?? visit)?.date ?? l.inspectionBooked?.slice(0, 10),
      vanIds: (work ?? visit)?.vanIds ?? [], crewIds: (work ?? visit)?.crewIds ?? [], leadId: l.id, jobId: work?.id,
    });
  }
  for (const j of db.jobs) {
    if (usedJobs.has(j.id) || j.status === "cancelled" || typeof j.lat !== "number" || typeof j.lng !== "number") continue;
    if (j.kind === "inspection" && j.status === "done") continue;
    const stage: Stage = j.kind === "inspection" ? "inspection" : j.status === "done" ? "complete" : j.status === "in_progress" ? "in_progress" : "scheduled";
    pins.push({ key: j.id, stage, name: j.customer ?? j.title, address: j.address, title: j.title, lat: j.lat, lng: j.lng, value: j.value, date: j.date, vanIds: j.vanIds, crewIds: j.crewIds, jobId: j.id });
  }
  return pins;
}

export function crewName(db: FleetDB, id: string) {
  return db.crew.find((c) => c.id === id)?.name ?? "—";
}
export function vanReg(db: FleetDB, id: string) {
  return db.vehicles.find((v) => v.id === id)?.reg ?? "—";
}
export const firstName = (c: CrewMember) => c.name.split(" ")[0];
