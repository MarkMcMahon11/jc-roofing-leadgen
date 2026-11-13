import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // everything except static assets, images, the service worker and API webhooks that authenticate themselves
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sw.js|manifest.webmanifest|api/public|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
