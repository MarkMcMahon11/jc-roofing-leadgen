// Navigation map. Items only appear for users holding the permission, and only for
// modules that are built (no dead links).
export type NavItem = { href: string; label: string; icon: string; perm?: string; anyPerm?: string[]; match?: string };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Command centre", icon: "gauge", perm: "dashboard.view" }],
  },
  {
    label: "Clients",
    items: [
      { href: "/crm", label: "Clients & CRM", icon: "building", perm: "crm.read", match: "/crm" },
      { href: "/contracts", label: "Contracts", icon: "file-signature", perm: "contracts.read" },
      { href: "/properties", label: "Properties", icon: "home", perm: "properties.read" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/jobs", label: "Jobs", icon: "clipboard", perm: "work_orders.read" },
      { href: "/schedule", label: "Schedule", icon: "calendar", perm: "schedule.read" },
      { href: "/workforce", label: "Workforce", icon: "hard-hat", perm: "workforce.read" },
      { href: "/subcontractors", label: "Subcontractors", icon: "handshake", perm: "subcontractors.read" },
    ],
  },
  {
    label: "Administration",
    items: [{ href: "/settings", label: "Settings", icon: "settings", anyPerm: ["settings.manage", "users.manage", "audit.view"] }],
  },
];

export function visibleNav(can: (p: string) => boolean): NavGroup[] {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => (i.perm ? can(i.perm) : i.anyPerm ? i.anyPerm.some(can) : true)),
  })).filter((g) => g.items.length > 0);
}
