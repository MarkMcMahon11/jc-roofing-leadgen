import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type Session } from "@/lib/session";

/** The signed-in owner, or null. Real check (the proxy in front of /admin is only an optimistic gate). */
export async function ownerSession(): Promise<Session | null> {
  try {
    return await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  } catch {
    return null;
  }
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });

/** Browsers send Origin on cross-site writes; refuse any whose host isn't ours. Requests without Origin (curl, tests) pass. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

export const crossSite = () => Response.json({ error: "Cross-site request refused" }, { status: 403 });
