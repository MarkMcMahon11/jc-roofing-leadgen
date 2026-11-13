"use client";

import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { updatePassword } from "./actions";

export function UpdatePasswordForm({ welcome, defaultName }: { welcome: boolean; defaultName: string }) {
  return (
    <ActionForm action={updatePassword} className="space-y-4">
      {welcome && <TextField name="fullName" label="Your full name" defaultValue={defaultName} autoComplete="name" required />}
      <TextField name="password" label="New password" type="password" autoComplete="new-password" required hint="At least 12 characters with upper and lower case letters and a number." />
      <TextField name="confirm" label="Confirm password" type="password" autoComplete="new-password" required />
      <SubmitButton size="lg" className="w-full">{welcome ? "Finish setting up" : "Change password"}</SubmitButton>
    </ActionForm>
  );
}
