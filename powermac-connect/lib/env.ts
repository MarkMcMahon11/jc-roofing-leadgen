// Central access to configuration. Public values may reach the browser; everything else
// is read only on the server.
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};

export function isSupabaseConfigured() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

/** Minutes of inactivity after which a session is signed out (proxy.ts). */
export const SESSION_IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES || 480);
