import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// Gate in front of the owner dashboard and its APIs (optimistic: the routes check the session themselves too).
// The customer quote form and its APIs are not matched here and stay public.
const PUBLIC = ["/admin/login", "/api/admin/login", "/api/admin/logout"];

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  let session = null;
  try {
    session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  } catch {
    // no ADMIN_PASSWORD / SESSION_SECRET configured: nobody can be signed in
  }

  if (PUBLIC.includes(path)) {
    if (path === "/admin/login" && session) return NextResponse.redirect(new URL("/admin", req.url));
    return NextResponse.next();
  }
  if (session) return NextResponse.next();

  if (path.startsWith("/api/")) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL("/admin/login", req.url);
  if (path !== "/admin") url.searchParams.set("next", path + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/fleet/:path*"],
};
