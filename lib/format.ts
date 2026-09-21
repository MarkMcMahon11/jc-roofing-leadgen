// Pure helpers shared by the browser and the server (no Node-only code in here).

export const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;

export function formatPostcode(pc: string) {
  const c = pc.replace(/\s+/g, "").toUpperCase();
  return c.length > 3 ? `${c.slice(0, -3)} ${c.slice(-3)}` : c;
}

/** UK phone -> digits like "07700900123", or null. Accepts +44 / 0044 / spaces / dashes / brackets. */
export function normalisePhone(v: unknown): string | null {
  if (typeof v !== "string") return null;
  let p = v.replace(/[\s\-().]/g, "");
  if (p.startsWith("+44")) p = "0" + p.slice(3);
  else if (p.startsWith("0044")) p = "0" + p.slice(4);
  return /^0(?:7\d{9}|[1238]\d{8,9})$/.test(p) ? p : null;
}

export const validEmail = (e: string) => e.length <= 254 && /^[^\s@<>,;:"]{1,64}@[^\s@<>,;:"]{1,190}\.[A-Za-z]{2,}$/.test(e);
