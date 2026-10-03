import type { Tone } from "@/components/admin/ui";
import type { CrewRole, ExpenseCategory, FineStatus, FineType, JobKind, JobStatus, MaintStatus, MaintType, PayMethod, VehicleStatus } from "./types";

type LT = { label: string; tone: Tone };

export const vehicleStatus: Record<VehicleStatus, LT> = {
  in_use: { label: "On the road", tone: "green" },
  at_yard: { label: "At the yard", tone: "amber" },
  in_garage: { label: "In the garage", tone: "red" },
  off_road: { label: "Off the road (SORN)", tone: "slate" },
};

export const jobStatus: Record<JobStatus, LT> = {
  scheduled: { label: "Scheduled", tone: "blue" },
  in_progress: { label: "In progress", tone: "amber" },
  done: { label: "Done", tone: "green" },
  cancelled: { label: "Cancelled", tone: "slate" },
};

export const jobKind: Record<JobKind, string> = { inspection: "Inspection", job: "Roofing job" };

export const maintType: Record<MaintType, string> = {
  service: "Service",
  mot: "MOT",
  repair: "Repair",
  tyres: "Tyres",
  bodywork: "Bodywork",
  equipment: "Racking / equipment",
};

export const maintStatus: Record<MaintStatus, LT> = {
  scheduled: { label: "Booked in", tone: "blue" },
  in_progress: { label: "In the garage", tone: "amber" },
  done: { label: "Done", tone: "green" },
};

export const fineType: Record<FineType, string> = {
  parking: "Parking",
  speeding: "Speeding",
  bus_lane: "Bus lane",
  congestion: "Low emission / congestion",
  other: "Other",
};

export const fineStatus: Record<FineStatus, LT> = {
  to_name: { label: "Name the driver", tone: "red" },
  named: { label: "Driver named", tone: "blue" },
  paid: { label: "Paid by company", tone: "slate" },
  recharged: { label: "Taken from driver", tone: "violet" },
  appealed: { label: "Appealing", tone: "amber" },
};

export const expenseCat: Record<ExpenseCategory, string> = {
  fuel: "Fuel",
  repairs: "Repairs and servicing",
  insurance: "Insurance",
  road_tax: "Vehicle tax",
  mot: "MOT",
  tyres: "Tyres",
  parking: "Parking and tolls",
  equipment: "Racking, ladders, tools",
  fines: "Fines",
  cleaning: "Cleaning",
  other: "Other",
};

export const payMethod: Record<PayMethod, string> = { card: "Card", fuel_card: "Fuel card", bank: "Bank transfer", cash: "Cash" };

export const crewRoles: CrewRole[] = ["Foreman", "Roofer", "Labourer", "Apprentice", "Office"];

export const leadStatus: Record<string, LT> = {
  new: { label: "New", tone: "blue" },
  contacted: { label: "Contacted", tone: "amber" },
  quoted: { label: "Quoted", tone: "violet" },
  won: { label: "Won", tone: "green" },
  lost: { label: "Lost", tone: "slate" },
};

export const EQUIPMENT = ["Roof rack", "Ladder rack", "Roof ladders", "Hoist / lift", "Tipper body", "Tool vault", "Tail lift", "Scaffold boards", "Ladder stand-offs"];
