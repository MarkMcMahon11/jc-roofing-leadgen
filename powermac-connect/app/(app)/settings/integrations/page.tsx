import type { Metadata } from "next";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { requireInternal } from "@/lib/auth/context";
import { integrationStatus } from "@/lib/integrations";
import { Badge, Card, CardHeader } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Integrations" };

export default async function IntegrationsPage() {
  await requireInternal("settings.manage");
  const items = integrationStatus();
  return (
    <Card>
      <CardHeader title="Integrations" description="Connections are configured on the server by environment variables. Secret values are never shown here." />
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.key} className="flex flex-col gap-2 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3">
              {i.configured ? <CheckCircle2 className="mt-0.5 size-5 text-ok" aria-hidden /> : <CircleDashed className="mt-0.5 size-5 text-subtle" aria-hidden />}
              <div>
                <div className="text-sm font-medium">{i.name}</div>
                <div className="text-xs text-muted">{i.purpose}</div>
                {!i.configured && i.env.length > 0 && <div className="mt-1 font-mono text-[11px] text-subtle">Set: {i.env.join(", ")}</div>}
              </div>
            </div>
            <div className="flex items-center gap-2 md:text-right">
              {i.configured ? <Badge tone="ok">Connected</Badge> : <Badge tone="neutral">{i.fallback}</Badge>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
