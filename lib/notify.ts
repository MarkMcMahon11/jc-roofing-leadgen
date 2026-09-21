import type { Lead, Settings } from "./types";
import { addMessage } from "./store";

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

export function ownerSummary(l: Lead) {
  return `${l.score.toUpperCase()} lead: ${l.name}, ${l.address.replace(/, (UK|United Kingdom)$/, "")}${l.address.includes(l.postcode) ? "" : " " + l.postcode}. ${l.material} ~${l.roofAreaM2}m². ${gbp(l.low)}-${gbp(l.high)}. Timing: ${l.urgency}. Tel ${l.phone}${l.lat && l.lng ? ` ${l.placeId ? "Map" : "Map (postcode area only, address typed by customer)"}: https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}` : " (address typed manually, please check)"}`;
}

type Who = "owner" | "customer";

async function sms(to: string, body: string, audience: Who) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: tok, TWILIO_FROM: from } = process.env;
  const live = !!(sid && tok && from && to);
  await addMessage({ channel: "sms", to: to || "(owner mobile not set)", audience, body, sent: live });
  if (!live) return console.log("[sms preview]", to, body);
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
}

async function email(to: string, subject: string, text: string, audience: Who) {
  const key = process.env.RESEND_API_KEY;
  const live = !!(key && to);
  await addMessage({ channel: "email", to: to || "(owner email not set)", audience, subject, body: text, sent: live });
  if (!live) return console.log("[email preview]", to, subject);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM ?? "quotes@example.com", to, subject, text }),
  });
}

export async function notify(l: Lead, s: Settings) {
  const jobs: Promise<unknown>[] = [];
  if (l.score !== "not-a-fit") {
    jobs.push(sms(s.ownerPhone, ownerSummary(l), "owner"), email(s.ownerEmail, `${l.urgency === "urgent" ? "URGENT " : ""}New ${l.score} lead: ${l.name}`, ownerSummary(l), "owner"));
  }
  const msg =
    l.score === "not-a-fit"
      ? `Hi ${l.name}, thanks for your interest in ${s.businessName}. Unfortunately we don't cover ${l.postcode} yet.`
      : `Hi ${l.name}, thanks for your ${s.businessName} enquiry. Estimated ${gbp(l.low)}-${gbp(l.high)}, earliest start ${l.earliestStart}. Book your free inspection any time on the page you were just on.`;
  jobs.push(sms(l.phone, msg, "customer"), email(l.email, `Your ${s.businessName} estimate`, msg, "customer"));
  await Promise.allSettled(jobs);
}

export async function notifyBooking(l: Lead, s: Settings, when: string) {
  const nice = new Date(when).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  await Promise.allSettled([
    sms(s.ownerPhone, `Inspection booked: ${l.name}, ${l.address.replace(/, (UK|United Kingdom)$/, "")}. ${nice}. Tel ${l.phone}`, "owner"),
    sms(l.phone, `Hi ${l.name}, your free ${s.businessName} roof inspection is booked for ${nice}. Need to change it? Call us on 07808 528293.`, "customer"),
    email(l.email, `Your ${s.businessName} inspection: ${nice}`, `Hi ${l.name},\n\nYour free roof inspection is booked for ${nice} at ${l.address}.\n\n${s.businessName}`, "customer"),
  ]);
}
