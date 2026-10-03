// Sample vans, crew, jobs and costs so the dashboard is full from day one. All made up: names, plates, prices and places.
// The owner clears them from the dashboard banner ("Clear sample data") and enters the real ones. Dates are relative to today.

import { addDays, today, uid } from "./format";
import { AREA_COORDS, hash01 } from "./geo";
import type { Activity, CrewMember, Expense, FleetDB, Fine, Job, MaintenanceOrder, Vehicle } from "./types";

export function emptyFleet(): FleetDB {
  return { rev: 1, sample: false, seededAt: new Date().toISOString(), vehicles: [], crew: [], jobs: [], maintenance: [], fines: [], expenses: [], activity: [] };
}

export function buildSeed(): FleetDB {
  const T = today();
  const d = (n: number) => addDays(T, n);
  const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

  const crew: CrewMember[] = [
    { id: "c1", name: "Callum Wright", phone: "07700 900101", role: "Foreman", status: "active", startDate: d(-2400), drives: true, licenceExpiry: d(420), licencePoints: 0, cscsCard: "Gold", cscsExpiry: d(300), heightExpiry: d(200), firstAidExpiry: d(90) },
    { id: "c2", name: "Ross McKenzie", phone: "07700 900102", role: "Roofer", status: "active", startDate: d(-1500), drives: true, licenceExpiry: d(25), licencePoints: 3, cscsCard: "Blue", cscsExpiry: d(500), heightExpiry: d(45), firstAidExpiry: d(310) },
    { id: "c3", name: "Euan Graham", phone: "07700 900103", role: "Roofer", status: "active", startDate: d(-1100), drives: true, licenceExpiry: d(800), licencePoints: 0, cscsCard: "Blue", cscsExpiry: d(60), heightExpiry: d(-10), firstAidExpiry: d(200) },
    { id: "c4", name: "Kyle Murray", phone: "07700 900104", role: "Roofer", status: "active", startDate: d(-800), drives: true, licenceExpiry: d(1200), licencePoints: 6, cscsCard: "Blue", cscsExpiry: d(14), heightExpiry: d(380) },
    { id: "c5", name: "Aiden Scott", phone: "07700 900105", role: "Apprentice", status: "active", startDate: d(-300), drives: false, cscsCard: "Red", cscsExpiry: d(330), heightExpiry: d(21) },
    { id: "c6", name: "Fraser Kerr", phone: "07700 900106", role: "Labourer", status: "active", startDate: d(-420), drives: true, licenceExpiry: d(600), licencePoints: 0, cscsCard: "Green", cscsExpiry: d(250), heightExpiry: d(180) },
    { id: "c7", name: "Morag Bell", phone: "07700 900107", role: "Office", status: "active", startDate: d(-900), drives: true, licenceExpiry: d(900), licencePoints: 0 },
  ];

  const tracker = (area: string, online = true, hoursAgo = 0.1) => ({ online, lastSeen: ago(hoursAgo), area });
  const insurance = d(160);

  // JC Roofing runs four vehicles. Plates, mileages, prices and dates below are made up: edit each van with the real ones.
  const vehicles: Vehicle[] = [
    { id: "v1", reg: "SN70 XKR", make: "Ford", model: "Transit Custom", year: 2020, colour: "White", fuel: "Diesel", kind: "Van", status: "in_use", mileage: 61240, nextServiceMiles: 65000, nextServiceDate: d(40), purchasePrice: 24500, purchaseDate: d(-1800), value: 14500, payloadKg: 1000, equipment: ["Roof rack", "Ladder rack", "Tool vault"], docs: { mot: d(120), roadTax: d(200), insurance, breakdown: d(75) }, assignedCrewId: "c1", tracker: tracker("Dumfries") },
    { id: "v2", reg: "SH19 JCP", make: "Mercedes-Benz", model: "Sprinter Pick-up", year: 2019, colour: "White", fuel: "Diesel", kind: "Pickup", status: "in_use", mileage: 88410, nextServiceMiles: 90000, nextServiceDate: d(15), purchasePrice: 31200, purchaseDate: d(-2300), value: 15800, payloadKg: 1300, equipment: ["Roof rack", "Scaffold boards", "Hoist / lift"], docs: { mot: d(12), roadTax: d(100), insurance, breakdown: d(75) }, assignedCrewId: "c3", tracker: tracker("Dumfries"), notes: "Hoist thorough examination (LOLER) due with the next service." },
    { id: "v3", reg: "SK22 TRV", make: "Vauxhall", model: "Vivaro", year: 2022, colour: "Grey", fuel: "Diesel", kind: "Van", status: "in_use", mileage: 28900, nextServiceMiles: 30000, nextServiceDate: d(70), purchasePrice: 29900, purchaseDate: d(-1000), value: 21500, payloadKg: 1100, equipment: ["Roof rack", "Ladder rack"], docs: { mot: d(400), roadTax: d(250), insurance, breakdown: d(75) }, assignedCrewId: "c2", tracker: tracker("Lockerbie") },
    { id: "v4", reg: "SV68 LDG", make: "Vauxhall", model: "Vivaro", year: 2018, colour: "White", fuel: "Diesel", kind: "Van", status: "in_garage", mileage: 76300, nextServiceMiles: 75000, nextServiceDate: d(-20), purchasePrice: 22900, purchaseDate: d(-2700), value: 9900, payloadKg: 1000, equipment: ["Roof rack", "Ladder rack"], docs: { mot: d(50), roadTax: d(20), insurance, breakdown: d(75) }, assignedCrewId: "c4", tracker: tracker("Heathhall", false, 20) },
  ];

  // [id, kind, title, customer, address, postcode, area, startOffset, endOffset, time, status, vans, crew, value]
  type J = [string, Job["kind"], string, string, string, string, string, number, number | undefined, string | undefined, Job["status"], string[], string[], number | undefined];
  const jobRows: J[] = [
    ["j1", "job", "Re-roof, natural slate", "Mr and Mrs Carruthers", "14 Maxwelltown Road, Dumfries", "DG2 9LE", "Dumfries", -2, 2, undefined, "in_progress", ["v1", "v2"], ["c1", "c3", "c6"], 8400],
    ["j2", "job", "Gutters and fascias replaced", "Ms Dunlop", "5 High Street, Annan", "DG12 6AG", "Annan", -1, 1, undefined, "in_progress", ["v3"], ["c2", "c5"], 2350],
    ["j3", "job", "Flat roof, GRP", "Mr Rae", "22 King Street, Castle Douglas", "DG7 1AA", "Castle Douglas", 3, 4, undefined, "scheduled", ["v3"], ["c2", "c5"], 3100],
    ["j4", "job", "Re-roof, concrete tile", "Mrs Armstrong", "8 Annan Road, Lockerbie", "DG11 2AA", "Lockerbie", 5, 9, undefined, "scheduled", ["v1", "v2"], ["c1", "c3", "c6", "c5"], 9650],
    ["j5", "job", "Chimney removal", "Mr Johnstone", "3 Well Road, Moffat", "DG10 9AS", "Moffat", 12, 12, undefined, "scheduled", ["v4"], ["c4", "c6"], 1900],
    ["j6", "job", "Roof repair, slipped slates", "Mrs Beattie", "17 Buccleuch Street, Dalbeattie", "DG5 4AG", "Dalbeattie", -9, -9, undefined, "done", ["v3"], ["c2"], 420],
    ["j7", "job", "Re-roof, natural slate", "Mr Crichton", "41 Rotchell Road, Dumfries", "DG2 7RH", "Dumfries", -24, -19, undefined, "done", ["v1", "v2"], ["c1", "c3", "c4", "c6"], 11200],
    ["j8", "job", "Flat roof, GRP", "Ms Hyslop", "9 Victoria Street, Gretna", "DG16 5AA", "Gretna", -33, -32, undefined, "done", ["v3"], ["c2", "c5"], 2780],
    ["j9", "job", "Solar panel installation, 4 kW", "Mr Maxwell", "Mill Cottage, Thornhill", "DG3 5AB", "Thornhill", -45, -43, undefined, "done", ["v1"], ["c1", "c4"], 6000],
    ["j10", "job", "Gutter cleaning and repairs", "Mrs Gibson", "12 Lovers Walk, Dumfries", "DG1 1LP", "Dumfries", -60, -60, undefined, "done", ["v4"], ["c6"], 260],
    ["j11", "inspection", "Free roof inspection", "Mr Laing", "6 Kirkgunzeon Road, Dumfries", "DG2 8JX", "Dumfries", 0, undefined, "14:30", "scheduled", [], [], undefined],
    ["j12", "inspection", "Free roof inspection", "Mrs Paterson", "27 Moffat Road, Lockerbie", "DG11 2PH", "Lockerbie", 1, undefined, "10:00", "scheduled", [], [], undefined],
    ["j13", "inspection", "Free roof inspection", "Mr Thomson", "2 Academy Street, Langholm", "DG13 0AB", "Langholm", 1, undefined, "13:30", "scheduled", [], [], undefined],
    ["j14", "inspection", "Free roof inspection", "Ms Kerr", "58 St Michaels Street, Dumfries", "DG1 2QE", "Dumfries", -4, undefined, "11:00", "done", ["v1"], ["c1"], undefined],
  ];
  const jobs: Job[] = jobRows.map(([id, kind, title, customer, address, postcode, area, s, e, time, status, vanIds, crewIds, value]) => {
    const [la, ln] = AREA_COORDS[area];
    return {
      id, kind, title, customer, address, postcode,
      lat: Math.round((la + (hash01(id + "a") - 0.5) * 0.012) * 1e5) / 1e5,
      lng: Math.round((ln + (hash01(id + "b") - 0.5) * 0.016) * 1e5) / 1e5,
      date: d(s), ...(e !== undefined && e !== s ? { endDate: d(e) } : {}), ...(time ? { time } : {}),
      status, vanIds, crewIds, ...(value ? { value } : {}),
    };
  });

  const m = (id: string, vehicleId: string, type: MaintenanceOrder["type"], description: string, garage: string, openedOffset: number, closedOffset: number | undefined, cost: number, status: MaintenanceOrder["status"], mileage: number): MaintenanceOrder =>
    ({ id, vehicleId, type, description, garage, openedAt: d(openedOffset), ...(closedOffset !== undefined ? { closedAt: d(closedOffset) } : {}), cost, status, mileage });
  const maintenance: MaintenanceOrder[] = [
    m("m1", "v1", "service", "Full service and oil change", "Dumfries Van Centre", -62, -62, 285, "done", 56200),
    m("m2", "v3", "tyres", "Two new rear tyres", "Kwik Tyres Dumfries", -45, -45, 420, "done", 24500),
    m("m3", "v4", "repair", "Clutch replacement", "Galloway Truck & Van", -102, -99, 640, "done", 70200),
    m("m4", "v2", "bodywork", "Pick-up tailgate and side rail repair", "Galloway Truck & Van", -33, -31, 220, "done", 85900),
    m("m5", "v2", "repair", "Alternator replaced", "Galloway Truck & Van", -150, -148, 380, "done", 80000),
    m("m6", "v3", "service", "Annual service", "Dumfries Van Centre", -120, -120, 240, "done", 22200),
    m("m7", "v2", "service", "Service", "Dumfries Van Centre", -85, -85, 310, "done", 82300),
    m("m8", "v4", "repair", "Front brake discs and pads", "Galloway Truck & Van", -3, undefined, 540, "in_progress", 76300),
    m("m9", "v2", "mot", "MOT test", "Dumfries Van Centre", 9, undefined, 55, "scheduled", 88900),
    m("m10", "v1", "service", "Service (65,000 miles)", "Dumfries Van Centre", 30, undefined, 295, "scheduled", 64500),
  ];

  const f = (id: string, vehicleId: string, crewId: string | undefined, dayOffset: number, time: string, ref: string, type: Fine["type"], description: string, location: string, points: number, amount: number, status: Fine["status"], reduced = true): Fine =>
    ({ id, vehicleId, ...(crewId ? { crewId } : {}), date: d(dayOffset), time, ref, type, description, location, points, amount, nameBy: d(dayOffset + 28), ...(reduced ? { discountBy: d(dayOffset + 14) } : {}), status });
  const fines: Fine[] = [
    f("f1", "v2", "c3", -10, "09:12", "DG24881920", "parking", "Parked on double yellow lines", "Church Crescent, Dumfries", 0, 70, "to_name"),
    f("f2", "v1", "c1", -20, "07:48", "SP-554021", "speeding", "40 mph in a 30 limit (fixed penalty)", "A75 near Annan", 3, 100, "named", false),
    f("f3", "v4", "c4", -45, "13:05", "PCN-7710934", "parking", "Private car park, no ticket displayed", "Lochmaben", 0, 100, "recharged"),
    f("f4", "v3", "c2", -5, "16:20", "GCC-30993317", "bus_lane", "Bus lane, Hope Street", "Hope Street, Glasgow", 0, 60, "to_name"),
    f("f5", "v3", undefined, -70, "10:30", "DG24773305", "parking", "Parking beyond paid time", "Buccleuch Street, Dumfries", 0, 50, "paid"),
  ];

  const expenses: Expense[] = [];
  const add = (category: Expense["category"], date: string, amount: number, description: string, vehicleId?: string, method?: Expense["method"]) =>
    expenses.push({ id: uid("e"), date, category, amount: Math.round(amount * 100) / 100, description, ...(vehicleId ? { vehicleId } : {}), ...(method ? { method } : {}) });
  for (const v of vehicles) {
    const weeklyFuel = v.kind === "Pickup" ? 135 : 115;
    for (let w = 0; w < 26; w++) {
      if (v.id === "v4" && w < 1) continue;
      const day = d(-7 * w - Math.floor(hash01(v.id + w) * 5));
      add("fuel", day, weeklyFuel * (0.7 + hash01(v.id + "f" + w) * 0.6), "Diesel and fuel card top-up", v.id, "fuel_card");
    }
    for (let mth = 0; mth < 6; mth++) add("insurance", d(-30 * mth - 3), 168, "Fleet insurance instalment", v.id, "bank");
    if (hash01(v.id + "p") > 0.4) add("parking", d(-14 - Math.floor(hash01(v.id + "pd") * 60)), 6 + Math.floor(hash01(v.id + "pa") * 18), "Parking", v.id, "card");
    add("cleaning", d(-20), 18, "Van wash", v.id, "card");
  }
  add("equipment", d(-50), 480, "Two roof ladders and stand-offs", "v1", "card");
  add("equipment", d(-120), 360, "Hoist thorough examination (LOLER)", "v2", "bank");
  for (const o of maintenance.filter((x) => x.status === "done")) add(o.type === "tyres" ? "tyres" : o.type === "mot" ? "mot" : "repairs", o.closedAt ?? o.openedAt, o.cost, o.description, o.vehicleId, "card");
  add("fines", d(-70), 50, "PCN DG24773305", "v3", "bank");
  expenses.sort((a, b) => (a.date < b.date ? 1 : -1));

  const act = (kind: Activity["kind"], text: string, hoursAgo: number, href?: string): Activity => ({ id: uid("a"), at: ago(hoursAgo), kind, text, ...(href ? { href } : {}) });
  const activity: Activity[] = [
    act("maintenance", "Brake discs and pads started: SV68 LDG", 70, "/admin/vans/v4"),
    act("job", "Job started: Re-roof, natural slate (14 Maxwelltown Road, Dumfries)", 48, "/admin/jobs"),
    act("fine", "Penalty notice recorded: DG24881920 (SH19 JCP)", 240, "/admin/fines"),
    act("job", "Job started: Gutters and fascias replaced (5 High Street, Annan)", 24, "/admin/jobs"),
    act("van", "Mileage updated: SK22 TRV", 30, "/admin/vans/v3"),
    act("system", "Sample vans, crew and jobs loaded. Replace them with your own when you're ready.", 0.5),
  ];
  activity.sort((a, b) => (a.at < b.at ? 1 : -1));

  return { rev: 1, sample: true, seededAt: new Date().toISOString(), vehicles, crew, jobs, maintenance, fines, expenses, activity };
}
