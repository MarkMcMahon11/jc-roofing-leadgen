"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, TextAreaField, TextField } from "@/components/ui/form";
import { decideQuote } from "../actions";

export function DecisionForm({ quoteId, defaultName }: { quoteId: string; defaultName: string }) {
  const [reject, setReject] = useState(false);
  return (
    <ActionForm action={decideQuote} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
      <input type="hidden" name="quote_id" value={quoteId} />
      <input type="hidden" name="decision" value={reject ? "reject" : "approve"} />
      <TextField name="name" label="Your name (recorded with the decision)" defaultValue={defaultName} required />
      <div className="flex gap-2">
        {!reject ? (
          <>
            <SubmitButton pendingLabel="Approving…">Approve quotation</SubmitButton>
            <button type="button" onClick={() => setReject(true)} className="rounded-[10px] px-3 text-sm text-muted hover:text-fg">Reject…</button>
          </>
        ) : (
          <button type="button" onClick={() => setReject(false)} className="rounded-[10px] px-3 text-sm text-muted hover:text-fg">Cancel</button>
        )}
      </div>
      {reject && (
        <div className="space-y-3 sm:col-span-2">
          <TextAreaField name="reason" label="Why are you rejecting it?" rows={3} required />
          <SubmitButton variant="danger" pendingLabel="Rejecting…">Reject quotation</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
