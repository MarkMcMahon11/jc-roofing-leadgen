import { z } from "zod";
import { isRealDay } from "@/lib/dates";
import type { Collection } from "./types";

// Server-side shape checks for every record the dashboard saves. Unknown keys are dropped.

const id = z.string().min(1).max(80);
// a real calendar day between 2000 and 2100 (rejects 2026-02-30, 2026-13-45, 0000-00-00 ...)
const date = z.string().refine((s) => isRealDay(s) && s >= "2000-01-01" && s <= "2100-12-31", "Not a real date");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const optDate = date.optional();
const money = z.number().finite().min(0).max(10_000_000).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Money has at most 2 decimal places");
const short = (n = 120) => z.string().max(n);
const optShort = (n = 120) => z.string().max(n).optional();
const int = z.number().int().finite();

const vehicle = z.object({
  id,
  reg: short(12).min(2),
  make: short(40),
  model: short(60),
  year: int.min(1980).max(2100),
  colour: short(30),
  fuel: z.enum(["Diesel", "Petrol", "Electric", "Hybrid"]),
  kind: z.enum(["Van", "Pickup", "Tipper", "Flatbed", "Car"]),
  status: z.enum(["in_use", "at_yard", "in_garage", "off_road"]),
  mileage: int.min(0).max(2_000_000),
  nextServiceMiles: int.min(0).max(2_000_000),
  nextServiceDate: optDate,
  vin: optShort(20),
  purchasePrice: money,
  purchaseDate: date,
  value: money,
  payloadKg: int.min(0).max(20_000).optional(),
  equipment: z.array(short(40)).max(20),
  docs: z.object({ mot: date, roadTax: date, insurance: date, breakdown: optDate }),
  assignedCrewId: id.optional(),
  tracker: z.object({ online: z.boolean(), lastSeen: short(40), area: short(60) }),
  notes: optShort(500),
});

const crew = z.object({
  id,
  name: short(80).min(1),
  phone: short(30),
  email: optShort(120),
  role: z.enum(["Foreman", "Roofer", "Labourer", "Apprentice", "Office"]),
  status: z.enum(["active", "inactive"]),
  startDate: date,
  drives: z.boolean(),
  licenceExpiry: optDate,
  licencePoints: int.min(0).max(36).optional(),
  cscsCard: z.enum(["Green", "Red", "Blue", "Gold", "Black"]).optional(),
  cscsExpiry: optDate,
  heightExpiry: optDate,
  firstAidExpiry: optDate,
  whatsappOk: z.boolean().optional(),
  notes: optShort(500),
});

const job = z.object({
  id,
  kind: z.enum(["inspection", "job"]),
  title: short(120).min(1),
  leadId: id.optional(),
  customer: optShort(80),
  address: short(200),
  postcode: optShort(10),
  lat: z.number().finite().min(49).max(61).optional(),
  lng: z.number().finite().min(-9).max(2.5).optional(),
  date,
  endDate: optDate,
  time: time.optional(),
  status: z.enum(["scheduled", "in_progress", "done", "cancelled"]),
  vanIds: z.array(id).max(10),
  crewIds: z.array(id).max(20),
  value: money.optional(),
  notes: optShort(500),
}).refine((j) => !j.endDate || j.endDate >= j.date, { message: "The last day is before the first day", path: ["endDate"] });

const maintenance = z.object({
  id,
  vehicleId: id,
  type: z.enum(["service", "mot", "repair", "tyres", "bodywork", "equipment"]),
  description: short(200).min(1),
  garage: short(80),
  openedAt: date,
  closedAt: optDate,
  cost: money,
  status: z.enum(["scheduled", "in_progress", "done"]),
  mileage: int.min(0).max(2_000_000),
})
  .refine((m) => !m.closedAt || m.closedAt >= m.openedAt, { message: "Finished before it started", path: ["closedAt"] })
  .refine((m) => m.status !== "done" || !!m.closedAt, { message: "A finished order needs a finish date", path: ["closedAt"] });

const fine = z.object({
  id,
  vehicleId: id,
  crewId: id.optional(),
  date,
  time: time.optional(),
  ref: short(40),
  type: z.enum(["parking", "speeding", "bus_lane", "congestion", "other"]),
  description: short(200),
  location: short(120),
  points: int.min(0).max(12),
  amount: money,
  nameBy: date,
  discountBy: optDate,
  status: z.enum(["to_name", "named", "paid", "appealed", "recharged"]),
}).refine((f) => f.nameBy >= f.date, { message: "The deadline is before the date of the notice", path: ["nameBy"] })
  .refine((f) => !f.discountBy || (f.discountBy >= f.date && f.discountBy <= f.nameBy), { message: "The reduced-payment date is outside the notice period", path: ["discountBy"] });

const expense = z.object({
  id,
  date,
  category: z.enum(["fuel", "repairs", "insurance", "road_tax", "mot", "tyres", "parking", "equipment", "fines", "cleaning", "other"]),
  amount: money,
  description: short(200),
  vehicleId: id.optional(),
  method: z.enum(["card", "fuel_card", "bank", "cash"]).optional(),
});

const activity = z.object({
  id,
  at: short(40),
  kind: z.enum(["van", "crew", "job", "maintenance", "fine", "expense", "lead", "system"]),
  text: short(300),
  href: z.string().max(200).refine((h) => h.startsWith("/admin"), "Links must stay inside the dashboard").optional(),
});

export const SCHEMAS: Record<Collection, z.ZodType<{ id: string }>> = { vehicles: vehicle, crew, jobs: job, maintenance, fines: fine, expenses: expense, activity };
