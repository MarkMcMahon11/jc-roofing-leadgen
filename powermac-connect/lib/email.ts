import "server-only";

/**
 * Outbound email. Uses Resend's HTTP API when RESEND_API_KEY + EMAIL_FROM are set.
 * Without them, nothing is sent and callers must show the content to the user instead
 * ("preview" mode) - nothing pretends to have been delivered.
 */
export type EmailResult = { status: "sent"; id: string } | { status: "preview"; reason: string } | { status: "failed"; error: string };

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(msg: { to: string; subject: string; html: string; text: string; replyTo?: string }): Promise<EmailResult> {
  if (!isEmailConfigured()) return { status: "preview", reason: "Email provider not configured (RESEND_API_KEY, EMAIL_FROM)" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, reply_to: msg.replyTo }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) return { status: "failed", error: body.message ?? `HTTP ${res.status}` };
    return { status: "sent", id: body.id };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : "network error" };
  }
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
