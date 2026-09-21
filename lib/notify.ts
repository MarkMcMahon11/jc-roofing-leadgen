import type { Lead, Settings } from "./types";

const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

export function ownerSummary(l: Lead) {
  return `${l.score.toUpperCase()} lead: ${l.name}, ${l.address} ${l.postcode}. ${l.material} ~${l.roofAreaM2}m². ${gbp(l.low)}-${gbp(l.high)}. Timing: ${l.urgency}. Tel ${l.phone}`;
}

async function sms(to: string, body: string) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: tok, TWILIO_FROM: from } = process.env;
  if (!sid || !tok || !from || !to) return console.log("[sms skipped]", to, body);
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
}

async function email(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return console.log("[email skipped]", to, subject);
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM ?? "quotes@example.com", to, subject, text }),
  });
}

export async function notify(l: Lead, s: Settings) {
  const jobs: Promise<unknown>[] = [];
  if (l.score !== "not-a-fit") {
    jobs.push(sms(s.ownerPhone, ownerSummary(l)), email(s.ownerEmail, `New ${l.score} lead: ${l.name}`, ownerSummary(l)));
  }
  const msg =
    l.score === "not-a-fit"
      ? `Hi ${l.name}, thanks for your interest in ${s.businessName}. Unfortunately we don't cover ${l.postcode} yet.`
      : `Hi ${l.name}, thanks for your ${s.businessName} enquiry. Estimated ${gbp(l.low)}-${gbp(l.high)}, earliest start ${l.earliestStart}. Book your free inspection on the page you were just on.`;
  jobs.push(sms(l.phone, msg), email(l.email, `Your ${s.businessName} estimate`, msg));
  await Promise.allSettled(jobs);
}
