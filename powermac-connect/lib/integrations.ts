import "server-only";

// Integration status is derived from server configuration (never shows secret values).
export type IntegrationStatus = { key: string; name: string; purpose: string; configured: boolean; env: string[]; fallback: string; stage: number };

export function integrationStatus(): IntegrationStatus[] {
  const has = (...k: string[]) => k.every((x) => Boolean(process.env[x]));
  return [
    { key: "supabase", name: "Supabase (database, auth, storage)", purpose: "System of record, sign-in, documents and photos", configured: has("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"), env: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"], fallback: "Required", stage: 1 },
    { key: "supabase_admin", name: "Supabase service role", purpose: "Sending invitations, scheduled jobs (server only)", configured: has("SUPABASE_SERVICE_ROLE_KEY"), env: ["SUPABASE_SERVICE_ROLE_KEY"], fallback: "Invitations unavailable", stage: 1 },
    { key: "email", name: "Email (Resend)", purpose: "Invitations, notifications, client updates", configured: has("RESEND_API_KEY", "EMAIL_FROM"), env: ["RESEND_API_KEY", "EMAIL_FROM"], fallback: "Preview mode: links are shown to the sender instead of emailed", stage: 1 },
    { key: "maps", name: "Maps (OpenStreetMap)", purpose: "Job and property maps", configured: true, env: [], fallback: "Free OpenStreetMap tiles; postcodes.io for UK geocoding", stage: 2 },
    { key: "openai", name: "OpenAI", purpose: "PowerMac AI: email-to-job, classification, quotes, reporting", configured: has("OPENAI_API_KEY"), env: ["OPENAI_API_KEY", "OPENAI_MODEL"], fallback: "AI features switched off", stage: 6 },
    { key: "sms", name: "SMS / WhatsApp (Twilio or Meta)", purpose: "Operative and tenant messaging", configured: has("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN") || has("WHATSAPP_TOKEN"), env: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM", "WHATSAPP_TOKEN"], fallback: "Messages logged in preview", stage: 7 },
    { key: "accounting", name: "Accounting (Xero / QuickBooks / Sage)", purpose: "Invoice and payment sync; PowerMac Connect does not replace the ledger", configured: has("XERO_CLIENT_ID") || has("QUICKBOOKS_CLIENT_ID") || has("SAGE_CLIENT_ID"), env: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"], fallback: "Export only", stage: 7 },
  ];
}
