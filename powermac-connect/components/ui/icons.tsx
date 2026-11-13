import {
  Gauge, Building2, FileSignature, Home, ClipboardList, CalendarDays, HardHat, Handshake, Settings, Users, ShieldCheck, ScrollText, Workflow, ListChecks,
  Database, Building, Bell, LogOut, Sparkles, Map, type LucideIcon,
} from "lucide-react";

export const ICONS: Record<string, LucideIcon> = {
  gauge: Gauge,
  building: Building2,
  "file-signature": FileSignature,
  home: Home,
  clipboard: ClipboardList,
  calendar: CalendarDays,
  "hard-hat": HardHat,
  handshake: Handshake,
  settings: Settings,
  users: Users,
  shield: ShieldCheck,
  scroll: ScrollText,
  workflow: Workflow,
  list: ListChecks,
  database: Database,
  company: Building,
  bell: Bell,
  logout: LogOut,
  sparkles: Sparkles,
  map: Map,
};

export function Icon({ name, className }: { name: string; className?: string }) {
  const C = ICONS[name] ?? Gauge;
  return <C className={className} aria-hidden />;
}
