"use client";

import { useState, useTransition } from "react";
import { Ban, Loader2 } from "lucide-react";
import { buttonClass } from "@/components/ui/primitives";
import { rejectRequest } from "../actions";

export function RejectRequestButton({ id, sender }: { id: string; sender: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        className={buttonClass("danger", "sm")}
        onClick={() => {
          if (!window.confirm(`Reject the request from ${sender}? It will not become a job.`)) return;
          setError(null);
          start(async () => {
            const res = await rejectRequest(id);
            if (!res.ok) setError(res.message ?? "Could not reject.");
          });
        }}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Ban className="size-3.5" aria-hidden />}
        Reject
      </button>
      {error && (
        <span role="alert" className="text-xs text-[#ff9b98]">
          {error}
        </span>
      )}
    </span>
  );
}
