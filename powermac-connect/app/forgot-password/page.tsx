"use client";

import Link from "next/link";
import { AuthFrame } from "@/components/shell/auth-frame";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { requestPasswordReset } from "../login/actions";

export default function ForgotPasswordPage() {
  return (
    <AuthFrame title="Reset your password" subtitle="We will email you a secure link to choose a new password.">
      <ActionForm action={requestPasswordReset} className="space-y-4">
        <TextField name="email" label="Work email" type="email" autoComplete="email" required autoFocus />
        <SubmitButton size="lg" className="w-full" pendingLabel="Sending…">Send reset link</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-sm"><Link href="/login" className="text-accent-hi hover:underline">Back to sign in</Link></p>
    </AuthFrame>
  );
}
