// UK vehicle identifiers.

/** Normalise a number plate for storage: upper case, single space before the last 3 characters of a current-style plate. */
export function normalisePlate(input: string): string {
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(c)) return `${c.slice(0, 4)} ${c.slice(4)}`; // AB12 CDE
  return c;
}

/** Accepts current (AB12 CDE), prefix (A123 BCD), suffix (ABC 123D) and dateless/private plates loosely (2-8 letters/digits). */
export function isValidPlate(input: string): boolean {
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{2,8}$/.test(c) && /[A-Z0-9]/.test(c);
}

export function normaliseVin(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** 17 characters, no I, O or Q. */
export function isValidVin(input: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(input);
}
