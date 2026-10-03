// What the assistant knows about the business right now, and who a verified phone number belongs to.

import { BUSINESS } from "@/lib/config";
import { SERVICE_INFO } from "@/lib/services";
import { getLeads, getSettings } from "@/lib/store";
import { loadFleet } from "@/lib/server/fleet";
import { today } from "@/lib/ops/format";
import type { CrewMember, FleetDB } from "@/lib/ops/types";
import type { Lead, Settings } from "@/lib/types";
import { toDigits, validWa } from "./phone";
import type { Role } from "./types";

export type Ctx = { settings: Settings; fleet: FleetDB; leads: Lead[]; ownerDigits: string; today: string };

// the leads list can be large and is only read for matching and reporting, so a few seconds old is fine
let leadsCache: { at: number; leads: Lead[] } | null = null;
async function recentLeads(): Promise<Lead[]> {
  if (leadsCache && Date.now() - leadsCache.at < 15_000) return leadsCache.leads;
  const leads = await getLeads().catch(() => [] as Lead[]);
  leadsCache = { at: Date.now(), leads };
  return leads;
}

export async function loadCtx(): Promise<Ctx> {
  const [settings, fleet, leads] = await Promise.all([getSettings(), loadFleet(), recentLeads()]);
  const ownerDigits = toDigits(process.env.OWNER_WHATSAPP?.trim() || settings.ownerPhone);
  return { settings, fleet, leads, ownerDigits, today: today() };
}

/** Role comes only from the sender's number, which WhatsApp (via Meta's signed webhook) has already verified. */
export function resolveRole(ctx: Ctx, from: string): { role: Role; crew?: CrewMember } {
  if (ctx.ownerDigits && from === ctx.ownerDigits) return { role: "owner" };
  const crew = ctx.fleet.crew.find((c) => c.status === "active" && toDigits(c.phone) === from && validWa(from));
  return crew ? { role: "staff", crew } : { role: "public" };
}

export const SITE_URL = (process.env.SITE_URL?.trim() || "https://www.jcroofingdumfries.com").replace(/\/+$/, "");

/** Everything the public-facing assistant is allowed to say about the business. It is given nothing else. */
export function publicFacts(ctx: Ctx): string {
  const services = Object.values(SERVICE_INFO).map((s) => `${s.label} (${s.blurb})`).join("; ");
  return [
    `Business: ${BUSINESS.name}, ${BUSINESS.address}.`,
    `Phone: ${BUSINESS.phone}. Email: ${BUSINESS.email}.`,
    `Services we quote online: ${services}.`,
    `Areas covered (postcode areas): ${ctx.settings.serviceAreaPrefixes.join(", ")}.`,
    `Instant online quote and free inspection booking: ${SITE_URL}`,
    `How quoting works: the online form gives a price RANGE in about two minutes (address, home details, job details); the final price is confirmed at a free inspection.`,
    ctx.settings.paused ? "We are currently not taking on new work promptly: new enquiries join a waiting list." : "",
  ]
    .filter(Boolean)
    .join("\n");
}
