// Signed session cookie for the owner (HMAC-SHA256 via Web Crypto, so it works in the proxy and in route handlers).
// One owner login, no user table. The password is ADMIN_PASSWORD; the cookie is signed with SESSION_SECRET if set,
// otherwise with a key derived from ADMIN_PASSWORD (so existing deployments keep working, and changing the
// password signs everyone out).

export const SESSION_COOKIE = "jc_session";
export const SESSION_DAYS = 7;

const enc = new TextEncoder();

function secret(): string {
  const s = process.env.SESSION_SECRET?.trim();
  if (s && s.length >= 32) return s;
  const pw = process.env.ADMIN_PASSWORD?.trim();
  if (pw) return `jc-session-v1:${pw}`;
  throw new Error("ADMIN_PASSWORD is not set");
}

export const loginConfigured = () => !!(process.env.ADMIN_PASSWORD?.trim() || (process.env.SESSION_SECRET?.trim() ?? "").length >= 32);

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type Session = { email: string; name: string; exp: number };

export async function signSession(s: Omit<Session, "exp">, exp = Date.now() + SESSION_DAYS * 86_400_000): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ ...s, exp } satisfies Session)));
  return `${body}.${await hmac(body)}`;
}

export async function verifySession(token?: string | null): Promise<Session | null> {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  try {
    if (!safeEqual(sig, await hmac(body))) return null;
    const s = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    return typeof s.exp === "number" && s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

/** Compare digests so timing doesn't leak the length or a prefix of the password. */
export async function passwordMatches(input: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([hmac(`pw:${input}`), hmac(`pw:${expected}`)]);
  return safeEqual(a, b);
}
