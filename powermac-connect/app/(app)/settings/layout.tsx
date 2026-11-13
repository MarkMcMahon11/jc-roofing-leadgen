import { requireInternal } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/primitives";
import { SettingsNav } from "./settings-nav";

const SECTIONS = [
  { href: "/settings/profile", label: "My profile" },
  { href: "/settings/company", label: "Company", perm: "settings.manage" },
  { href: "/settings/users", label: "Users", perm: "users.manage" },
  { href: "/settings/roles", label: "Roles & permissions", perm: "users.manage" },
  { href: "/settings/workflow", label: "Job workflow", perm: "settings.manage" },
  { href: "/settings/picklists", label: "Picklists", perm: "settings.manage" },
  { href: "/settings/integrations", label: "Integrations", perm: "settings.manage" },
  { href: "/settings/retention", label: "Data retention", perm: "settings.manage" },
  { href: "/settings/audit", label: "Audit log", perm: "audit.view" },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireInternal();
  const sections = SECTIONS.filter((s) => !s.perm || ctx.can(s.perm));
  return (
    <>
      <PageHeader eyebrow="Administration" title="Settings" description="Configure your company, people, permissions and workflow." />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <SettingsNav sections={sections} />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
