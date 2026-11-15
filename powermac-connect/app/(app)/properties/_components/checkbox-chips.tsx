"use client";

import { useId, type ReactNode } from "react";
import { cx } from "@/components/ui/primitives";

/** Multi-select as toggle chips (native checkboxes, so it posts with the form). */
export function CheckboxChips({
  name,
  label,
  options,
  defaultValues = [],
  error,
  hint,
  className,
  tone = "accent",
}: {
  name: string;
  label: string;
  options: { value: string; label: ReactNode }[];
  defaultValues?: string[];
  error?: string;
  hint?: ReactNode;
  className?: string;
  tone?: "accent" | "warn";
}) {
  const id = useId();
  return (
    <fieldset className={className} aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="mb-1.5 block text-[13px] font-medium text-muted">{label}</legend>
      {options.length === 0 ? (
        <p className="text-xs text-subtle">No options are configured.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((o) => (
            <label key={o.value} className="cursor-pointer">
              <input type="checkbox" name={name} value={o.value} defaultChecked={defaultValues.includes(o.value)} className="peer sr-only" />
              <span
                className={cx(
                  "inline-flex h-8 items-center rounded-full border border-line-strong bg-sunken px-3 text-[13px] text-muted transition-colors select-none hover:border-[#3d4b41] hover:text-fg",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-hi",
                  tone === "warn"
                    ? "peer-checked:border-[#57400f] peer-checked:bg-warn-lo peer-checked:text-[#ffc56b]"
                    : "peer-checked:border-[#2f5a12] peer-checked:bg-accent-lo peer-checked:text-accent-hi",
                )}
              >
                {o.label}
              </span>
            </label>
          ))}
        </div>
      )}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-xs text-[#ff9b98]">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-subtle">{hint}</p>
      ) : null}
    </fieldset>
  );
}
