// Domain model for the owner's operations dashboard: the company's vans, crew, jobs, servicing, penalty notices and costs.
// Enquiries/quotes (leads) and the quote-form settings live in lib/types.ts and are shown alongside this data.

export type VehicleStatus = "in_use" | "at_yard" | "in_garage" | "off_road";
export type Fuel = "Diesel" | "Petrol" | "Electric" | "Hybrid";
export type VehicleKind = "Van" | "Pickup" | "Tipper" | "Flatbed" | "Car";

/** Dates are "YYYY-MM-DD" (UK calendar days). */
export type VehicleDocs = {
  mot: string; // MOT expiry (new vehicles: the date the first MOT is due)
  roadTax: string; // vehicle tax (VED) expiry
  insurance: string; // fleet / van insurance renewal
  breakdown?: string; // breakdown cover renewal
};

export type Vehicle = {
  id: string;
  reg: string; // registration number plate, e.g. "SN70 XKR"
  make: string;
  model: string;
  year: number;
  colour: string;
  fuel: Fuel;
  kind: VehicleKind;
  status: VehicleStatus;
  mileage: number;
  nextServiceMiles: number;
  nextServiceDate?: string;
  vin?: string; // 17 characters
  purchasePrice: number;
  purchaseDate: string;
  value: number; // rough current value
  payloadKg?: number;
  equipment: string[]; // roof rack, ladders, hoist, tipper body ...
  docs: VehicleDocs;
  assignedCrewId?: string; // usual driver
  tracker: { online: boolean; lastSeen: string; area: string };
  notes?: string;
};

export type CrewRole = "Foreman" | "Roofer" | "Labourer" | "Apprentice" | "Office";
export type CscsCard = "Green" | "Red" | "Blue" | "Gold" | "Black";

export type CrewMember = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  role: CrewRole;
  status: "active" | "inactive";
  startDate: string;
  drives: boolean; // allowed to drive company vans
  licenceExpiry?: string; // photocard driving licence
  licencePoints?: number; // penalty points on the licence (from the DVLA check)
  cscsCard?: CscsCard;
  cscsExpiry?: string;
  heightExpiry?: string; // working-at-height training
  firstAidExpiry?: string;
  whatsappOk?: boolean; // agreed to get work reminders on WhatsApp
  notes?: string;
};

export type JobKind = "inspection" | "job";
export type JobStatus = "scheduled" | "in_progress" | "done" | "cancelled";

/** An inspection visit or a roofing job on the schedule, with the vans and crew sent. */
export type Job = {
  id: string;
  kind: JobKind;
  title: string;
  leadId?: string; // the enquiry this came from
  customer?: string;
  address: string;
  postcode?: string;
  lat?: number; // for the project map
  lng?: number;
  date: string; // first day
  endDate?: string; // last day for multi-day jobs
  time?: string; // "HH:MM" (inspections)
  status: JobStatus;
  vanIds: string[];
  crewIds: string[];
  value?: number; // agreed price in GBP (jobs)
  notes?: string;
};

export type MaintType = "service" | "mot" | "repair" | "tyres" | "bodywork" | "equipment";
export type MaintStatus = "scheduled" | "in_progress" | "done";

export type MaintenanceOrder = {
  id: string;
  vehicleId: string;
  type: MaintType;
  description: string;
  garage: string;
  openedAt: string; // scheduled day, or the day the van went in
  closedAt?: string;
  cost: number;
  status: MaintStatus;
  mileage: number;
};

export type FineType = "parking" | "speeding" | "bus_lane" | "congestion" | "other";
export type FineStatus = "to_name" | "named" | "paid" | "appealed" | "recharged";

/** A penalty charge notice, parking charge or speeding notice sent to the registered keeper (the company). */
export type Fine = {
  id: string;
  vehicleId: string;
  crewId?: string; // who was driving
  date: string;
  time?: string;
  ref: string; // notice reference
  type: FineType;
  description: string;
  location: string;
  points: number;
  amount: number;
  nameBy: string; // deadline to name the driver (28 days)
  discountBy?: string; // deadline for the reduced amount (usually 14 days)
  status: FineStatus;
};

export type ExpenseCategory = "fuel" | "repairs" | "insurance" | "road_tax" | "mot" | "tyres" | "parking" | "equipment" | "fines" | "cleaning" | "other";
export type PayMethod = "card" | "fuel_card" | "bank" | "cash";

export type Expense = {
  id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  description: string;
  vehicleId?: string;
  method?: PayMethod;
};

export type Activity = {
  id: string;
  at: string; // ISO datetime
  kind: "van" | "crew" | "job" | "maintenance" | "fine" | "expense" | "lead" | "system";
  text: string;
  href?: string;
};

export type FleetDB = {
  rev: number; // bumped by the server on every save, so other devices know to reload
  sample: boolean; // true while the dashboard still holds the sample vans/crew
  seededAt: string;
  vehicles: Vehicle[];
  crew: CrewMember[];
  jobs: Job[];
  maintenance: MaintenanceOrder[];
  fines: Fine[];
  expenses: Expense[];
  activity: Activity[];
};

export const COLLECTIONS = ["vehicles", "crew", "jobs", "maintenance", "fines", "expenses", "activity"] as const;
export type Collection = (typeof COLLECTIONS)[number];
