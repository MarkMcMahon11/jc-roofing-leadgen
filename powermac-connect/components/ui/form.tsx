"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { ActionResult } from "@/lib/actions";
import { buttonClass, cx, Input, Label, Select, Textarea } from "./primitives";

const ErrorsContext = createContext<ActionResult["fieldErrors"]>(undefined);
const PendingContext = createContext(false);

/**
 * A form bound to a Server Action. Shows the action's message, highlights field errors,
 * and works without JavaScript (progressive enhancement).
 */
export function ActionForm<R extends ActionResult = ActionResult>({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  id,
}: {
  action: (state: R, formData: FormData) => Promise<R>;
  children: ReactNode | ((state: R) => ReactNode);
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (r: R) => void;
  id?: string;
}) {
  const [state, formAction, pending] = useActionState(action as unknown as (s: Awaited<R>, fd: FormData) => Promise<Awaited<R>>, { ok: false } as Awaited<R>);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
  }, [state, resetOnSuccess, onSuccess]);
  // With JavaScript: dispatch ourselves so React does not clear the fields after every
  // submission (a failed save keeps what the user typed). Without JavaScript the native
  // form still posts to the Server Action.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  };
  return (
    <ErrorsContext.Provider value={state.fieldErrors}>
      <PendingContext.Provider value={pending}>
        <form ref={ref} action={formAction} onSubmit={onSubmit} className={className} id={id}>
          {state.message && (
            <div
              role={state.ok ? "status" : "alert"}
              className={cx(
                "mb-4 rounded-xl border px-4 py-2.5 text-sm",
                state.ok ? "border-[#145049] bg-ok-lo/70 text-[#a6efe7]" : "border-[#5a1f1d] bg-bad-lo/70 text-[#ffb3b1]",
              )}
            >
              {state.message}
            </div>
          )}
          {typeof children === "function" ? children(state) : children}
        </form>
      </PendingContext.Provider>
    </ErrorsContext.Provider>
  );
}

export function SubmitButton({ children, variant = "primary", size = "md", className, pendingLabel }: { children: ReactNode; variant?: "primary" | "secondary" | "danger" | "subtle"; size?: "sm" | "md" | "lg"; className?: string; pendingLabel?: string }) {
  const status = useFormStatus();
  const pending = useContext(PendingContext) || status.pending;
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass(variant, size, className)}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {pending ? (pendingLabel ?? "Saving…") : children}
    </button>
  );
}

/** Submit button that asks for confirmation first (deletes, irreversible actions). */
export function ConfirmButton({ children, message, variant = "danger", size = "sm", name, value }: { children: ReactNode; message: string; variant?: "danger" | "secondary" | "primary"; size?: "sm" | "md"; name?: string; value?: string }) {
  const status = useFormStatus();
  const pending = useContext(PendingContext) || status.pending;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={buttonClass(variant, size)}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

type FieldBase = { name: string; label: string; required?: boolean; hint?: ReactNode; className?: string };

function useField(name: string) {
  const errors = useContext(ErrorsContext);
  const id = useId();
  const error = errors?.[name]?.[0];
  return { id, error, describedBy: error ? `${id}-err` : undefined };
}

function FieldShell({ id, label, required, hint, error, className, children }: { id: string; label: string; required?: boolean; hint?: ReactNode; error?: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-xs text-[#ff9b98]">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function TextField({ name, label, required, hint, className, ...rest }: FieldBase & Omit<React.ComponentProps<"input">, "name">) {
  const f = useField(name);
  return (
    <FieldShell id={f.id} label={label} required={required} hint={hint} error={f.error} className={className}>
      <Input id={f.id} name={name} required={required} aria-invalid={Boolean(f.error)} aria-describedby={f.describedBy} {...rest} />
    </FieldShell>
  );
}

export function TextAreaField({ name, label, required, hint, className, ...rest }: FieldBase & Omit<React.ComponentProps<"textarea">, "name">) {
  const f = useField(name);
  return (
    <FieldShell id={f.id} label={label} required={required} hint={hint} error={f.error} className={className}>
      <Textarea id={f.id} name={name} required={required} aria-invalid={Boolean(f.error)} aria-describedby={f.describedBy} {...rest} />
    </FieldShell>
  );
}

export function SelectField({
  name,
  label,
  required,
  hint,
  className,
  options,
  placeholder,
  ...rest
}: FieldBase & Omit<React.ComponentProps<"select">, "name"> & { options: { value: string; label: string }[]; placeholder?: string }) {
  const f = useField(name);
  return (
    <FieldShell id={f.id} label={label} required={required} hint={hint} error={f.error} className={className}>
      <Select id={f.id} name={name} required={required} aria-invalid={Boolean(f.error)} aria-describedby={f.describedBy} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </FieldShell>
  );
}

export function CheckboxField({ name, label, defaultChecked, hint, value = "on" }: { name: string; label: ReactNode; defaultChecked?: boolean; hint?: ReactNode; value?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="mt-0.5 size-4 rounded border-line-strong bg-sunken accent-[#5ee000]" />
      <div>
        <label htmlFor={id} className="text-sm text-fg">
          {label}
        </label>
        {hint && <p className="text-xs text-subtle">{hint}</p>}
      </div>
    </div>
  );
}
