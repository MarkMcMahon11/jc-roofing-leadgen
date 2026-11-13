import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env, isSupabaseConfigured, SESSION_IDLE_MINUTES } from "@/lib/env";

const PUBLIC_PATHS = ["/login", "/auth", "/forgot-password", "/setup", "/privacy"];
const ACTIVITY_COOKIE = "pmc_last_active";

/**
 * Refreshes the Supabase session cookie on every request, signs out idle sessions and
 * sends signed-out visitors to the login page. Pages and actions re-check the user
 * themselves; this is the first line, not the only one.
 */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" ? false : PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!isSupabaseConfigured()) {
    if (path.startsWith("/setup")) return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // IMPORTANT: getUser() validates the session with Supabase Auth (not just the cookie).
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const last = Number(request.cookies.get(ACTIVITY_COOKIE)?.value || 0);
    const now = Date.now();
    if (last && now - last > SESSION_IDLE_MINUTES * 60_000) {
      await supabase.auth.signOut();
      const url = new URL("/login", request.url);
      url.searchParams.set("reason", "idle");
      const redirect = NextResponse.redirect(url);
      for (const c of response.cookies.getAll()) redirect.cookies.set(c);
      redirect.cookies.delete(ACTIVITY_COOKIE);
      return redirect;
    }
    response.cookies.set(ACTIVITY_COOKIE, String(now), { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/" });
  }

  if (!user && !isPublic) {
    const url = new URL("/login", request.url);
    if (path !== "/") url.searchParams.set("next", path + request.nextUrl.search);
    const redirect = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  if (user && path === "/login") {
    const redirect = NextResponse.redirect(new URL("/", request.url));
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  return response;
}
