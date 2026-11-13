"use client";

import { ActionForm, SubmitButton, TextField } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { changePassword, updateProfile } from "./actions";

export function ProfileForms({ fullName, phone, email }: { fullName: string; phone: string; email: string }) {
  return (
    <>
      <Card>
        <CardHeader title="Personal details" description={`Signed in as ${email}`} />
        <CardBody>
          <ActionForm action={updateProfile} className="grid gap-4 sm:grid-cols-2">
            <TextField name="full_name" label="Full name" defaultValue={fullName} required autoComplete="name" />
            <TextField name="phone" label="Phone" defaultValue={phone} autoComplete="tel" />
            <div className="sm:col-span-2"><SubmitButton>Save profile</SubmitButton></div>
          </ActionForm>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Password" description="At least 12 characters with upper and lower case letters and a number." />
        <CardBody>
          <ActionForm action={changePassword} resetOnSuccess className="grid gap-4 sm:grid-cols-2">
            <TextField name="password" label="New password" type="password" autoComplete="new-password" required />
            <TextField name="confirm" label="Confirm password" type="password" autoComplete="new-password" required />
            <div className="sm:col-span-2"><SubmitButton variant="secondary">Change password</SubmitButton></div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
