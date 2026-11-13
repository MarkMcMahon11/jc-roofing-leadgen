"use client";

import Link from "next/link";
import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { signIn } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  return (
    <ActionForm action={signIn} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <TextField name="email" label="Work email" type="email" autoComplete="email" required autoFocus />
      <TextField name="password" label="Password" type="password" autoComplete="current-password" required />
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-[13px] text-accent-hi hover:underline">
          Forgotten your password?
        </Link>
      </div>
      <SubmitButton size="lg" className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </ActionForm>
  );
}
