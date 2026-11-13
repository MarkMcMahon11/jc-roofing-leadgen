import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/shell/auth-frame";
import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "./update-password-form";

export const metadata: Metadata = { title: "Choose a password" };

export default async function UpdatePasswordPage({ searchParams }: PageProps<"/auth/update-password">) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?reason=link");
  const welcome = (await searchParams).welcome === "1";
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  return (
    <AuthFrame title={welcome ? "Welcome to PowerMac Connect" : "Choose a new password"} subtitle={welcome ? "Set your name and a password to finish setting up your account." : `For ${user.email}`}>
      <UpdatePasswordForm welcome={welcome} defaultName={profile?.full_name ?? ""} />
    </AuthFrame>
  );
}
