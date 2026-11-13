import type { Metadata } from "next";
import { requireInternal } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, Notice } from "@/components/ui/primitives";
import { RetentionRow } from "./retention-row";

export const metadata: Metadata = { title: "Data retention" };

const DESCRIPTIONS: Record<string, string> = {
  former_occupants: "Personal details of residents who have moved out are anonymised (name replaced, contact details removed).",
  ai_activity: "Record of AI requests, outputs and the human decisions on them.",
  audit_logs: "The security audit trail. Seven years supports typical contract and tax record requirements.",
  communications: "Emails, texts and messages logged against clients and jobs.",
  inbound_messages: "Raw work-request emails and API submissions after processing.",
  notifications: "In-app notifications.",
  automation_runs: "Execution history of automation workflows.",
};

export default async function RetentionPage() {
  const ctx = await requireInternal("settings.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("retention_policies").select("id, entity, retain_months, action, is_active, last_applied_at").eq("tenant_id", ctx.tenantId).order("entity");
  return (
    <div className="grid gap-4">
      <Notice tone="info" title="UK GDPR storage limitation">Personal data is kept only as long as needed. A daily job applies these rules; each run is written to the audit log.</Notice>
      <Card>
        <CardHeader title="Retention rules" />
        <div className="divide-y divide-line">
          {(data ?? []).map((p) => <RetentionRow key={p.id} policy={p} description={DESCRIPTIONS[p.entity] ?? ""} />)}
        </div>
      </Card>
    </div>
  );
}
