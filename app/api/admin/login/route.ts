import { cookies } from "next/headers";
import { BUSINESS } from "@/lib/config";
import { bad, isObj, readJson } from "@/lib/http";
import { clientIp, isBlocked, limited } from "@/lib/limits";
import { SESSION_COOKIE, SESSION_DAYS, loginConfigured, passwordMatches, signSession } from "@/lib/session";
import { crossSite, sameOrigin } from "@/lib/server/auth";
import { getSettings } from "@/lib/store";

const MAX_WRONG = 10;
const WINDOW = 10 * 60_000;

/** Emails that may sign in: OWNER_EMAIL (comma separated), the owner email saved in settings, and the business email. */
async function allowedEmails(): Promise<string[]> {
  const list = [...(process.env.OWNER_EMAIL ?? "").split(","), BUSINESS.email];
  try {
    list.push((await getSettings()).ownerEmail);
  } catch {}
  return list.map((e) => e.trim().toLowerCase()).filter(Boolean);
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return crossSite();
  if (!loginConfigured()) return bad("Sign-in isn't set up yet: the ADMIN_PASSWORD setting is missing on this site.", 503);

  const fail = `admin:fail:${clientIp(req)}`;
  // After 10 wrong tries even the right password is refused for 10 minutes.
  if (isBlocked(fail, MAX_WRONG, WINDOW)) return bad("Too many wrong attempts. Try again in 10 minutes.", 429);

  const body = await readJson(req, 2_000);
  if (!body.ok) return body.res;
  if (!isObj(body.data)) return bad("Invalid request");
  const email = typeof body.data.email === "string" ? body.data.email.trim().toLowerCase() : "";
  const password = typeof body.data.password === "string" ? body.data.password.trim() : "";
  const expected = process.env.ADMIN_PASSWORD?.trim() ?? "";

  const emailOk = email.length > 0 && (await allowedEmails()).includes(email);
  const passOk = expected.length > 0 && (await passwordMatches(password, expected));
  if (!emailOk || !passOk) {
    limited(fail, MAX_WRONG, WINDOW);
    return bad("Incorrect email or password.", 401);
  }

  const token = await signSession({ email, name: "Owner" });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  return Response.json({ ok: true });
}
