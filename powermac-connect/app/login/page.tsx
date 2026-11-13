import type { Metadata } from "next";
import { AuthFrame } from "@/components/shell/auth-frame";
import { Notice } from "@/components/ui/primitives";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const reasons: Record<string, string> = {
  idle: "You were signed out after a period of inactivity.",
  reset: "Your password has been changed. Please sign in.",
  link: "That link has expired or was already used. Please request a new one.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const reason = typeof sp.reason === "string" ? reasons[sp.reason] : undefined;
  return (
    <AuthFrame title="Sign in" subtitle="Use the email address your company invited.">
      {reason && <div className="mb-5"><Notice tone="info">{reason}</Notice></div>}
      <LoginForm next={next} />
      <p className="mt-10 text-xs leading-relaxed text-subtle">
        Access is by invitation only. Activity is logged for security. See the <a className="underline hover:text-muted" href="/privacy">privacy notice</a>.
      </p>
    </AuthFrame>
  );
}
