"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Target } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { Badge, Button, CardHeader, EmptyState, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { ActionButton } from "../../crm/_components/action-button";
import { removeKpi, saveKpi } from "../actions";
import { AUTO_METRICS, METRICS } from "../_lib/constants";

export type KpiRow = {
  id: string;
  name: string;
  metric_key: string;
  target_value: number;
  unit: string;
  direction: string;
  manual_value: number | null;
  actual: number | null;
  auto: boolean;
};

function fmt(v: number | null, unit: string) {
  if (v === null) return "-";
  const n = String(parseFloat(v.toFixed(unit === "/5" ? 2 : 1)));
  return unit === "%" ? `${n}%` : unit ? `${n}${unit.startsWith("/") ? "" : " "}${unit}` : n;
}

export function KpiEditor({ contractId, kpis, canWrite, description }: { contractId: string; kpis: KpiRow[]; canWrite: boolean; description: string }) {
  const [editing, setEditing] = useState<KpiRow | "new" | null>(null);
  return (
    <>
      <CardHeader
        title="Key performance indicators"
        description={description}
        actions={
          canWrite && (
            <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden />
              Add KPI
            </Button>
          )
        }
      />
      {kpis.length ? (
        <Table>
          <THead>
            <tr>
              <TH>KPI</TH>
              <TH align="right">Target</TH>
              <TH align="right">Actual</TH>
              <TH>Result</TH>
              <TH>Source</TH>
              {canWrite && <TH align="right">Actions</TH>}
            </tr>
          </THead>
          <tbody>
            {kpis.map((k) => {
              const met = k.actual === null ? null : k.direction === "lower_better" ? k.actual <= k.target_value : k.actual >= k.target_value;
              return (
                <TR key={k.id}>
                  <TD>
                    <div className="font-medium">{k.name}</div>
                    <div className="text-xs text-subtle">{METRICS.find((m) => m.value === k.metric_key)?.label ?? k.metric_key}</div>
                  </TD>
                  <TD align="right">
                    <span className="inline-flex items-center gap-1">
                      {k.direction === "lower_better" ? <ArrowDown className="size-3.5 text-subtle" aria-label="lower is better" /> : <ArrowUp className="size-3.5 text-subtle" aria-label="higher is better" />}
                      {fmt(Number(k.target_value), k.unit)}
                    </span>
                  </TD>
                  <TD align="right" className="font-medium">{fmt(k.actual, k.unit)}</TD>
                  <TD>{met === null ? <Badge>No data yet</Badge> : met ? <Badge tone="ok" dot>Met</Badge> : <Badge tone="bad" dot>Missed</Badge>}</TD>
                  <TD className="text-xs text-muted">{k.auto ? "Live from jobs" : "Entered manually"}</TD>
                  {canWrite && (
                    <TD align="right">
                      <span className="inline-flex items-start gap-3">
                        <button type="button" onClick={() => setEditing(k)} className="inline-flex items-center gap-1 text-xs font-medium text-accent-hi hover:underline">
                          <Pencil className="size-3" aria-hidden />
                          Edit
                        </button>
                        <ActionButton link className="text-muted hover:text-[#ff8a87]" confirm={`Remove the KPI "${k.name}"?`} action={() => removeKpi(k.id)}>
                          Remove
                        </ActionButton>
                      </span>
                    </TD>
                  )}
                </TR>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<Target className="size-8" />} title="No KPIs on this contract">
          Add the key performance indicators the client measures you against.
        </EmptyState>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add KPI" : "Edit KPI"} size="lg">
        {editing !== null && <KpiForm contractId={contractId} kpi={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function KpiForm({ contractId, kpi, onDone }: { contractId: string; kpi: KpiRow | null; onDone: () => void }) {
  const [metric, setMetric] = useState(kpi?.metric_key ?? "custom");
  const auto = AUTO_METRICS.includes(metric);
  return (
    <ActionForm action={saveKpi} onSuccess={onDone} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="contract_id" value={contractId} />
      {kpi && <input type="hidden" name="id" value={kpi.id} />}
      <TextField name="name" label="Name" required defaultValue={kpi?.name ?? ""} maxLength={120} className="sm:col-span-2" placeholder="e.g. Emergency attendance within 4 hours" />
      <SelectField name="metric_key" label="Measures" required options={METRICS} value={metric} onChange={(e) => setMetric(e.target.value)} hint={auto ? "Calculated automatically from completed jobs on this contract." : "Enter the actual value yourself."} />
      <SelectField
        name="direction"
        label="Better when"
        options={[
          { value: "higher_better", label: "Higher is better" },
          { value: "lower_better", label: "Lower is better" },
        ]}
        defaultValue={kpi?.direction ?? (metric === "cost_variance" ? "lower_better" : "higher_better")}
      />
      <TextField name="target_value" label="Target" type="number" inputMode="decimal" step="any" required defaultValue={kpi ? String(kpi.target_value) : ""} />
      <TextField name="unit" label="Unit" defaultValue={kpi?.unit ?? (metric === "customer_satisfaction" ? "/5" : metric === "jobs_completed" ? "jobs" : "%")} maxLength={10} hint="%, /5, hours, jobs…" />
      {!auto && <TextField name="manual_value" label="Actual (current)" type="number" inputMode="decimal" step="any" defaultValue={kpi?.manual_value ?? ""} hint="Leave blank if not measured yet." className="sm:col-span-2" />}
      <div className="flex gap-2 sm:col-span-2">
        <SubmitButton>{kpi ? "Save KPI" : "Add KPI"}</SubmitButton>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </ActionForm>
  );
}
