import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/session";
import { crossSite, sameOrigin } from "@/lib/server/auth";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return crossSite();
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
