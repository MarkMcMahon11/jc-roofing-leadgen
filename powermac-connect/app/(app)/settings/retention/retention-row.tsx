"use client";

import { ActionForm, SubmitButton } from "@/components/ui/form";
import { Badge, Input } from "@/components/ui/primitives";
import { label, relative } from "@/lib/format";
import { updateRetention } from "./actions";

export function RetentionRow({ policy, description }: { policy: { id: string; entity: string; retain_months: number; action: string; is_active: boolean; last_applied_at: string | null }; description: string }) {
  return (
    <ActionForm action={updateRetention} className="grid items-center gap-4 px-5 py-4 md:grid-cols-[1fr_auto]">
      <input type="hidden" name="id" value={policy.id} />
      <div>
        <div className="flex items-center gap-2 text-sm font-medium">{label(policy.entity)} <Badge tone={policy.action === "anonymise" ? "info" : "neutral"}>{policy.action}</Badge></div>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
        <p className="mt-1 text-[11px] text-subtle">Last applied: {policy.last_applied_at ? relative(policy.last_applied_at) : "not yet"}</p>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted">
          <Input name="retain_months" type="number" min={1} max={240} defaultValue={policy.retain_months} className="h-9 w-20" aria-label="Months to keep" /> months
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" name="is_active" defaultChecked={policy.is_active} className="accent-[#5ee000]" /> On</label>
        <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
      </div>
    </ActionForm>
  );
}
