// Phone numbers as WhatsApp sees them: digits only, with the country code (UK numbers start 44).

/** "07700 900123", "+44 (0)7700 900123", "0044 7700 900123", "7700 900123" -> "447700900123". Takes the first number if two are typed. */
export function toDigits(raw: string | undefined | null): string {
  const first = String(raw ?? "").split(/[\/,;]|\bor\b|\band\b/i)[0].replace(/\(0\)/g, "");
  let d = first.replace(/[^\d]/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 11) d = "44" + d.slice(1);
  else if (/^7\d{9}$/.test(d)) d = "44" + d; // a UK mobile typed without its leading 0
  if (/^440\d{10}$/.test(d)) d = "44" + d.slice(3); // "44 07700..." / "+44 (0)..."
  return d;
}

/** A number we are willing to send WhatsApp messages to: a complete UK number, or a full international one. */
export const validWa = (d: string) => /^44\d{10}$/.test(d) || (/^[1-9]\d{10,14}$/.test(d) && !d.startsWith("44"));

/** "447700900123" -> "+44 7700 900123" */
export function pretty(digits: string): string {
  if (/^44\d{10}$/.test(digits)) return `+44 ${digits.slice(2, 6)} ${digits.slice(6)}`;
  return digits ? `+${digits}` : "";
}

/** "447700900123" -> "+44 •••••• 0123" (for logs and screens that don't need the whole number) */
export function mask(digits: string): string {
  return digits.length > 6 ? `+${digits.slice(0, 2)} ${"•".repeat(Math.max(2, digits.length - 6))} ${digits.slice(-4)}` : "••••";
}
