import type { Lead, Settings } from "./types";
import { addMessage, type Message } from "./store";
import { BUSINESS } from "./config";
import { fmtMonth, fmtSlot } from "./dates";
import { detailsText, SERVICE_INFO } from "./services";

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;
const range = (l: Lead) => (l.noPrice ? "no price given" : `${gbp(l.low)}-${gbp(l.high)}`);
const serviceLabel = (l: Lead) => SERVICE_INFO[l.service ?? "roof"].label;
const jobLine = (l: Lead, s: Settings) => {
  const d = detailsText(l, materialLabel(l, s));
  return d ? `${serviceLabel(l)}: ${d}` : serviceLabel(l);
};
const firstName = (l: Lead) => l.name.split(" ")[0].slice(0, 20);
// Address without ", UK"; adds the postcode when a manually typed address left it out.
const shortAddress = (l: Lead) => {
  const a = l.address.replace(/, (UK|United Kingdom)$/, "").trim();
  return a.toUpperCase().includes(l.postcode.toUpperCase()) ? a : `${a}, ${l.postcode}`;
};
const materialLabel = (l: Lead, s: Settings) => s.materials.find((m) => m.id === l.material)?.label ?? l.material ?? "";
const TIMING: Record<Lead["urgency"], string> = { urgent: "URGENT (active leak)", "3-months": "wants it within 3 months", pricing: "just getting a price" };
const mapLink = (l: Lead) =>
  l.lat && l.lng ? `${l.placeId ? "Map" : "Map (postcode area only, address typed by customer)"}: https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}` : "Address typed by customer, please check it";

// Twilio wants +44 numbers.
const e164 = (p: string) => (p.startsWith("0") ? `+44${p.slice(1)}` : p);

type Base = Omit<Message, "id" | "at" | "status" | "error">;

/** Send (or preview) one text, and record what REALLY happened. A failed send is never logged as sent. */
async function sms(to: string, body: string, audience: Message["audience"], leadId: string) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: tok, TWILIO_FROM: from } = process.env;
  const base: Base = { channel: "sms", to: to || "(owner mobile not set)", audience, body, leadId };
  if (!(sid && tok && from && to)) return addMessage({ ...base, status: "preview" });
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: e164(to), From: from, Body: body }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Twilio responded ${r.status}`);
    await addMessage({ ...base, status: "sent" });
  } catch (e) {
    console.error("[sms failed]", (e as Error).message);
    await addMessage({ ...base, status: "failed", error: (e as Error).message });
  }
}

async function email(to: string, subject: string, text: string, audience: Message["audience"], leadId: string) {
  const key = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM;
  const base: Base = { channel: "email", to: to || "(owner email not set)", audience, subject, body: text, leadId };
  if (!(key && from && to)) return addMessage({ ...base, status: "preview" });
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Resend responded ${r.status}`);
    await addMessage({ ...base, status: "sent" });
  } catch (e) {
    console.error("[email failed]", (e as Error).message);
    await addMessage({ ...base, status: "failed", error: (e as Error).message });
  }
}

/** Short, plain-character text for the owner (keeps it to one or two SMS segments). */
export function ownerSummary(l: Lead, s: Settings) {
  const flag = `${l.urgency === "urgent" ? "URGENT " : ""}${l.waitlist ? "WAITLIST " : ""}`;
  return `${flag}${l.score.toUpperCase()}: ${l.name} ${l.phone}. ${shortAddress(l)}. ${jobLine(l, s)}, ${range(l)}. ${TIMING[l.urgency]}.`;
}

function ownerEmailBody(l: Lead, s: Settings) {
  return [
    ownerSummary(l, s), "",
    `Name: ${l.name}`, `Phone: ${l.phone}`, `Email: ${l.email}`, `Address: ${shortAddress(l)}`,
    `Property: ${l.propertyType}, built ${l.homeAge}, listed: ${l.listed}`,
    `Job: ${jobLine(l, s)}${l.notes ? `\nTheir words: ${l.notes}` : ""}`,
    `Estimate shown: ${range(l)}${l.noPrice ? "" : ` (${l.basis})`}. Earliest start shown: ${fmtMonth(l.earliestStart)}`,
    mapLink(l),
  ].join("\n");
}

/** Fire all messages for a new enquiry. Never throws. */
export async function notify(l: Lead, s: Settings) {
  const jobs: Promise<unknown>[] = [];
  const fit = l.score !== "not-a-fit";
  if (fit) {
    const subject = `${l.urgency === "urgent" ? "URGENT " : ""}${l.waitlist ? "Waiting list: " : ""}New ${l.score} lead: ${l.name}`;
    jobs.push(sms(s.ownerPhone, ownerSummary(l, s), "owner", l.id), email(s.ownerEmail, subject, ownerEmailBody(l, s), "owner", l.id));
  }
  const first = firstName(l);
  const text = !fit
    ? `Hi ${first}, thanks for your interest in ${BUSINESS.name}. Sorry, we only cover Dumfries & Galloway so can't help with ${l.postcode} yet.`
    : l.waitlist
      ? `Hi ${first}, thanks for your ${BUSINESS.name} enquiry. We're fully booked right now, so we've put you on our waiting list and will be in touch. Estimate ${range(l)}. Questions? ${BUSINESS.phone}`
      : l.noPrice
        ? `Hi ${first}, thanks for your ${BUSINESS.name} enquiry. We'll be in touch soon to talk through what you need. Questions? ${BUSINESS.phone}`
        : `Hi ${first}, thanks for your ${BUSINESS.name} enquiry. Estimate ${range(l)} (final price after a free inspection). Earliest start: around ${fmtMonth(l.earliestStart)}. Questions? ${BUSINESS.phone}`;
  const emailText = fit
    ? `${text}\n\nProperty: ${shortAddress(l)}\nJob: ${jobLine(l, s)}\n\n${l.noPrice ? "We will confirm the details and price with you." : "This is an estimate only. We confirm the final price at a free inspection."}\n\n${BUSINESS.name}\n${BUSINESS.phone}`
    : `${text}\n\n${BUSINESS.name}`;
  jobs.push(sms(l.phone, text, "customer", l.id), email(l.email, `Your ${BUSINESS.name} estimate`, emailText, "customer", l.id));
  await Promise.allSettled(jobs);
}

/** Booking confirmations to the owner (text + email) and the customer (text + email). Never throws. */
export async function notifyBooking(l: Lead, s: Settings, when: string) {
  const nice = fmtSlot(when);
  const where = shortAddress(l);
  const ownerText = `Inspection booked: ${l.name} ${l.phone}. ${where}. ${nice}.`;
  await Promise.allSettled([
    sms(s.ownerPhone, ownerText, "owner", l.id),
    email(s.ownerEmail, `Inspection booked: ${l.name}, ${nice}`, `${ownerText}\n\n${mapLink(l)}`, "owner", l.id),
    sms(l.phone, `Hi ${firstName(l)}, your free ${BUSINESS.name} roof inspection is booked for ${nice}. Need to change it? Call ${BUSINESS.phone}.`, "customer", l.id),
    email(l.email, `Your ${BUSINESS.name} inspection: ${nice}`, `Hi ${firstName(l)},\n\nYour free roof inspection is booked for ${nice} at ${where}.\n\nIf you can, have your loft hatch and any old roof paperwork to hand. Need to change the time? Call ${BUSINESS.phone}.\n\n${BUSINESS.name}`, "customer", l.id),
  ]);
}
