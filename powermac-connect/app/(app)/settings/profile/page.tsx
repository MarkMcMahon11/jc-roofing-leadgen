import type { Metadata } from "next";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { ProfileForms } from "./profile-forms";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const ctx = await requireInternal();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("full_name, phone, email").eq("id", ctx.userId).single();
  return (
    <div className="grid gap-6">
      <ProfileForms fullName={profile?.full_name ?? ""} phone={profile?.phone ?? ""} email={profile?.email ?? ctx.email} />
      <Card>
        <CardHeader title="My access" description="Companies you belong to and your role in each." />
        <CardBody className="space-y-3">
          {ctx.memberships.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-sunken px-4 py-3">
              <div>
                <div className="text-sm font-medium">{m.tenant.name}</div>
                <div className="text-xs text-subtle">{m.permissions.length} permissions</div>
              </div>
              <div className="flex gap-2">
                {m.tenant.is_demo && <Badge tone="warn">Demo</Badge>}
                <Badge tone="accent">{m.role.name}</Badge>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
