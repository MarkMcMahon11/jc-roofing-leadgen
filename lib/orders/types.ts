// Materials orders: Jamie picks a customer site, chooses a supplier and the materials, and the supplier is asked to
// deliver them to that site. The supplier gets an email/text with a one-tap page to confirm the delivery date.

export type Supplier = {
  id: string;
  name: string;
  email?: string;
  phone?: string; // mobile for texts
  contact?: string; // who to address it to
  account?: string; // JC Roofing's account number with them
  notes?: string;
  active: boolean;
};

export type OrderItem = { description: string; qty: number; unit: string };
export type OrderStatus = "sent" | "confirmed" | "declined" | "delivered" | "cancelled" | "failed";
export type DeliveryWindow = "morning" | "afternoon" | "any";

export type OrderSite = {
  name: string; // what the supplier sees as the site reference (e.g. "Carruthers re-roof")
  address: string;
  postcode?: string;
  lat?: number;
  lng?: number;
  jobId?: string;
  leadId?: string;
};

export type Order = {
  id: string;
  ref: string; // JC-0007
  clientId?: string; // makes a double-click harmless
  createdAt: string;
  by: "dashboard" | "whatsapp";
  resends?: string[]; // when it was sent again (limits repeat sends)
  msgLeadId?: string; // the enquiry this order came from (via its job), so the supplier messages are erased with it
  token: string; // the supplier's private link
  supplierId: string;
  supplierName: string;
  site: OrderSite;
  items: OrderItem[];
  deliverBy: string; // YYYY-MM-DD
  window: DeliveryWindow;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
  status: OrderStatus;
  sends: { at: string; channel: "email" | "sms"; to: string; result: "sent" | "preview" | "failed" }[];
  reply?: { at: string; action: "confirm" | "decline"; date?: string; note?: string };
  log: { at: string; text: string }[];
};

export type Procurement = { rev: number; seq: number; suppliers: Supplier[]; orders: Order[] };
export const emptyProcurement = (): Procurement => ({ rev: 1, seq: 0, suppliers: [], orders: [] });

/** What the supplier calls the site: just the customer's surname ("Mr and Mrs Carruthers" becomes "Carruthers"). */
export const siteRef = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[parts.length - 1] : name).slice(0, 80);
};

export const CAPS = { orders: 500, suppliers: 60, log: 40, perHour: 40 };
export const WINDOW_LABEL: Record<DeliveryWindow, string> = { morning: "Morning (7am to 12)", afternoon: "Afternoon (12 to 5pm)", any: "Any time that day" };
