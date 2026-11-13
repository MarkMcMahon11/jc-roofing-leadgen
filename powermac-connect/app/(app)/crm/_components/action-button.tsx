"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { buttonClass, cx } from "@/components/ui/primitives";
import type { ActionResult } from "@/lib/actions";

/**
 * One-click button bound to a Server Action (pass a bound action from the server component).
 * Optional confirmation; shows the action's error message under the button.
 */
export function ActionButton({
  action,
  children,
  confirm,
  variant = "secondary",
  size = "sm",
  className,
  title,
  link,
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  confirm?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "subtle";
  size?: "sm" | "md";
  className?: string;
  title?: string;
  /** render as a text link instead of a button */
  link?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    if (confirm && !window.confirm(confirm)) return;
    setError(null);
    start(async () => {
      const r = await action();
      if (!r.ok) setError(r.message ?? "That did not work. Please try again.");
    });
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        aria-busy={pending}
        title={title}
        className={link ? cx("inline-flex items-center gap-1 text-xs font-medium text-accent-hi hover:underline disabled:opacity-50", className) : buttonClass(variant, size, className)}
      >
        {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        {children}
      </button>
      {error && (
        <span role="alert" className="max-w-64 text-right text-xs text-[#ff9b98]">
          {error}
        </span>
      )}
    </span>
  );
}
