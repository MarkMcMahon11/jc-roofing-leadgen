"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/ui/form";
import { Badge, buttonClass, cx, EmptyState, Notice, Select, Table, TD, TH, THead, TR } from "@/components/ui/primitives";
import { money } from "@/lib/format";
import { addJobMaterial, removeJobMaterial, setJobMaterialStatus } from "../[id]/actions";
import { MATERIAL_STATUS } from "../_lib/constants";

export type MaterialLine = { id: string; description: string; quantity: number; unit: string; unit_cost: number | null; status: string; sku: string | null };
export type CatalogueItem = { id: string; label: string; unit: string; cost: number | null };

const tone: Record<string, "neutral" | "info" | "accent" | "ok" | "warn"> = { required: "warn", ordered: "info", allocated: "accent", used: "ok", returned: "neutral" };

export function MaterialsPanel({ jobId, lines, catalogue, canWrite, showCosts, catalogueAvailable }: { jobId: string; lines: MaterialLine[]; catalogue: CatalogueItem[]; canWrite: boolean; showCosts: boolean; catalogueAvailable: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [material, setMaterial] = useState("");
  const chosen = catalogue.find((c) => c.id === material);
  const total = lines.filter((l) => l.status !== "returned").reduce((s, l) => s + (l.unit_cost ?? 0) * l.quantity, 0);

  const run = (id: string, fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setError(null);
    setBusy(id);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (!res.ok) setError(res.message ?? "That change failed.");
    });
  };

  return (
    <div>
      {error && (
        <div className="px-5 pt-4">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}
      {lines.length === 0 ? (
        <EmptyState title="No materials on this job yet">Add what the job needs from the catalogue so it can be ordered, allocated from stock and costed.</EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Item</TH>
              <TH align="right">Qty</TH>
              {showCosts && <TH align="right">Unit cost</TH>}
              {showCosts && <TH align="right">Line</TH>}
              <TH>Status</TH>
              {canWrite && <TH align="right">Actions</TH>}
            </tr>
          </THead>
          <tbody>
            {lines.map((l) => (
              <TR key={l.id} className={cx(busy === l.id && "opacity-60")}>
                <TD>
                  <span className="font-medium">{l.description}</span>
                  {l.sku && <span className="block font-mono text-[11.5px] text-subtle">{l.sku}</span>}
                </TD>
                <TD align="right">
                  {l.quantity} <span className="text-xs text-subtle">{l.unit}</span>
                </TD>
                {showCosts && <TD align="right">{money(l.unit_cost)}</TD>}
                {showCosts && <TD align="right">{l.unit_cost === null ? "-" : money(l.unit_cost * l.quantity)}</TD>}
                <TD>
                  {canWrite ? (
                    <Select
                      aria-label={`Status of ${l.description}`}
                      value={l.status}
                      disabled={pending}
                      onChange={(e) => run(l.id, () => setJobMaterialStatus(l.id, e.target.value))}
                      className="h-8 w-36 text-[13px]"
                    >
                      {MATERIAL_STATUS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone={tone[l.status] ?? "neutral"}>{l.status}</Badge>
                  )}
                </TD>
                {canWrite && (
                  <TD align="right">
                    <div className="flex justify-end gap-1.5">
                      {l.status !== "used" && (
                        <button type="button" className={buttonClass("subtle", "sm")} disabled={pending} onClick={() => run(l.id, () => setJobMaterialStatus(l.id, "used"))}>
                          Mark used
                        </button>
                      )}
                      {l.status === "used" && (
                        <button type="button" className={buttonClass("secondary", "sm")} disabled={pending} onClick={() => run(l.id, () => setJobMaterialStatus(l.id, "returned"))}>
                          Mark returned
                        </button>
                      )}
                      {(l.status === "required" || l.status === "allocated") && (
                        <button
                          type="button"
                          className={buttonClass("ghost", "sm", "px-2")}
                          disabled={pending}
                          aria-label={`Remove ${l.description}`}
                          onClick={() => window.confirm(`Remove ${l.description}?`) && run(l.id, () => removeJobMaterial(l.id))}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </TD>
                )}
              </TR>
            ))}
          </tbody>
          {showCosts && (
            <tfoot>
              <tr className="border-t border-line">
                <td className="px-4 py-3 text-sm text-muted" colSpan={3}>
                  Materials cost (excluding returned)
                </td>
                <td className="px-4 py-3 text-right text-sm font-semibold tabular">{money(total)}</td>
                <td colSpan={canWrite ? 2 : 1} />
              </tr>
            </tfoot>
          )}
        </Table>
      )}

      {canWrite && (
        <div className="border-t border-line px-5 py-4">
          <h3 className="mb-3 text-sm font-semibold text-fg">Add material</h3>
          {!catalogueAvailable && <p className="mb-3 text-xs text-subtle">The materials catalogue needs the inventory permission; you can still add an item by description.</p>}
          <ActionForm action={addJobMaterial} resetOnSuccess onSuccess={() => setMaterial("")} className="grid gap-3 md:grid-cols-[2fr_1fr_110px_auto] md:items-start">
            <input type="hidden" name="job_id" value={jobId} />
            <SelectField
              name="material_id"
              label="Catalogue item"
              options={catalogue.map((c) => ({ value: c.id, label: c.label }))}
              placeholder={catalogue.length ? "Choose from the catalogue…" : "No catalogue available"}
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              hint={chosen ? `Unit: ${chosen.unit}${showCosts && chosen.cost !== null ? ` · catalogue cost ${money(chosen.cost)}` : ""}` : "Or leave empty and describe the item"}
            />
            <TextField name="description" label={chosen ? "Description (optional)" : "Description"} maxLength={300} placeholder={chosen ? "Defaults to the catalogue name" : "e.g. 15mm compression elbow"} />
            <TextField name="quantity" label="Quantity" type="number" min={0.001} step="any" required defaultValue="1" inputMode="decimal" />
            <div className="md:pt-[26px]">
              <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
            </div>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
