"use client";

import { useState } from "react";
import { Check, FilePlus2, X } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { ActionForm, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { Badge, Button, CardHeader, EmptyState, Mono, Table, TD, TH, THead, TR, cx } from "@/components/ui/primitives";
import { money } from "@/lib/format";
import { ActionButton } from "../../crm/_components/action-button";
import { decideVariation, proposeVariation } from "../actions";
import { VARIATION_TONE } from "../_lib/constants";

export type VariationRow = {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  value: number;
  status: string;
  raised: string;
  raisedBy: string | null;
  decided: string | null;
  decidedBy: string | null;
};

export function Variations({ contractId, rows, canWrite, canApprove }: { contractId: string; rows: VariationRow[]; canWrite: boolean; canApprove: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CardHeader
        title="Variations"
        description={canApprove ? "Changes to scope or price. You can approve or reject proposed variations." : "Changes to scope or price. Approval needs the contracts approval permission."}
        actions={
          canWrite && (
            <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
              <FilePlus2 className="size-4" aria-hidden />
              Propose variation
            </Button>
          )
        }
      />
      {rows.length ? (
        <Table>
          <THead>
            <tr>
              <TH>Variation</TH>
              <TH align="right">Value</TH>
              <TH>Status</TH>
              <TH>Raised</TH>
              <TH>Decision</TH>
              {(canWrite || canApprove) && <TH align="right">Actions</TH>}
            </tr>
          </THead>
          <tbody>
            {rows.map((v) => (
              <TR key={v.id}>
                <TD className="max-w-md">
                  <div className="font-medium">{v.title}</div>
                  <Mono className="text-[11.5px]">{v.reference}</Mono>
                  {v.description && <p className="mt-1 line-clamp-3 text-xs whitespace-pre-line text-muted">{v.description}</p>}
                </TD>
                <TD align="right" className={cx("font-medium", v.value < 0 && "text-[#ffc56b]")}>
                  {v.value > 0 ? "+" : ""}
                  {money(v.value)}
                </TD>
                <TD>
                  <Badge tone={VARIATION_TONE[v.status] ?? "neutral"} dot>
                    {v.status === "proposed" ? "Awaiting approval" : v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                  </Badge>
                </TD>
                <TD className="text-[13px] whitespace-nowrap">
                  {v.raised}
                  {v.raisedBy && <div className="text-xs text-subtle">{v.raisedBy}</div>}
                </TD>
                <TD className="text-[13px] whitespace-nowrap">
                  {v.decided ?? <span className="text-subtle">-</span>}
                  {v.decidedBy && <div className="text-xs text-subtle">{v.decidedBy}</div>}
                </TD>
                {(canWrite || canApprove) && (
                  <TD align="right">
                    {v.status === "proposed" && (
                      <span className="inline-flex flex-wrap items-start justify-end gap-2">
                        {canApprove && (
                          <>
                            <ActionButton variant="primary" confirm={`Approve ${v.reference} (${money(v.value)})? The contract value will be adjusted.`} action={() => decideVariation(v.id, "approved")}>
                              <Check className="size-3.5" aria-hidden />
                              Approve
                            </ActionButton>
                            <ActionButton variant="danger" confirm={`Reject ${v.reference}?`} action={() => decideVariation(v.id, "rejected")}>
                              <X className="size-3.5" aria-hidden />
                              Reject
                            </ActionButton>
                          </>
                        )}
                        {canWrite && (
                          <ActionButton variant="ghost" confirm={`Withdraw ${v.reference}?`} action={() => decideVariation(v.id, "withdrawn")}>
                            Withdraw
                          </ActionButton>
                        )}
                      </span>
                    )}
                  </TD>
                )}
              </TR>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<FilePlus2 className="size-8" />} title="No variations">
          Record instructed changes to scope or price so the contract value stays accurate.
        </EmptyState>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Propose a variation" description="It is added as awaiting approval and does not change the contract value until approved." size="lg">
        {open && (
          <ActionForm action={proposeVariation} onSuccess={() => setOpen(false)} className="grid gap-4 sm:grid-cols-3">
            <input type="hidden" name="contract_id" value={contractId} />
            <TextField name="title" label="Title" required maxLength={200} className="sm:col-span-2" placeholder="e.g. Additional fire door replacements, Block C" />
            <TextField name="value" label="Value (£)" type="number" inputMode="decimal" step="0.01" required hint="Negative for an omission." />
            <TextAreaField name="description" label="Description" maxLength={10000} rows={4} className="sm:col-span-3" placeholder="What changed, who instructed it and how it was priced." />
            <div className="flex gap-2 sm:col-span-3">
              <SubmitButton>Propose variation</SubmitButton>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </ActionForm>
        )}
      </Modal>
    </>
  );
}
