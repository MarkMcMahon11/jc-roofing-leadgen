"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

export type Tone = "green" | "amber" | "red" | "blue" | "slate" | "violet";

const toneCls: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-800 ring-emerald-700/25",
  amber: "bg-amber-50 text-amber-900 ring-amber-700/25",
  red: "bg-red-50 text-red-800 ring-red-700/25",
  blue: "bg-sky-50 text-sky-800 ring-sky-700/25",
  slate: "bg-stone-100 text-stone-700 ring-stone-500/25",
  violet: "bg-violet-50 text-violet-800 ring-violet-700/25",
};

export function Badge({ tone = "slate", children, dot }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${toneCls[tone]}`}>
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Card({ children, className = "", href }: { children: React.ReactNode; className?: string; href?: string }) {
  const cls = `elev min-w-0 rounded-2xl ${className}`;
  if (href)
    return (
      <Link href={href} className={`${cls} elev-hover block`}>
        {children}
      </Link>
    );
  return <div className={cls}>{children}</div>;
}

export function CardHeader({ title, sub, action }: { title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-t-2xl border-b border-silver bg-gradient-to-b from-white/60 to-transparent px-5 py-4">
      <div className="min-w-0">
        <h2 className="font-semibold text-night">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-steel">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, sub, href, tone, icon }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; href?: string; tone?: "good" | "bad" | "warn"; icon?: React.ReactNode }) {
  const subCls = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-brand" : tone === "warn" ? "text-amber-700" : "text-steel";
  return (
    <Card href={href} className="relative overflow-hidden p-4 sm:p-5">
      <span aria-hidden className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-brand/80 via-brand/20 to-transparent" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-steel">{label}</span>
        {icon && <span aria-hidden className="chip-3d grid h-8 w-8 shrink-0 place-items-center rounded-lg text-steel">{icon}</span>}
      </div>
      <div className="mt-2 truncate text-2xl font-bold tracking-tight text-night tabular-nums @7xl:text-3xl">{value}</div>
      {sub && <div className={`mt-1 text-xs font-medium ${subCls}`}>{sub}</div>}
    </Card>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-night">{title}</h1>
        {sub && <p className="mt-1 text-sm text-steel">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 print:hidden">{actions}</div>}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" }) {
  const v = {
    primary: "btn-red text-white",
    secondary: "btn-silver border-[1.5px] border-ctrl text-night",
    ghost: "text-steel hover:bg-silver-soft hover:text-night",
    danger: "btn-silver border-[1.5px] border-brand text-brand hover:!bg-brand-tint",
  }[variant];
  const s = size === "sm" ? "min-h-10 px-3 py-1.5 text-sm" : "min-h-11 px-4 py-2 text-sm";
  return (
    <button {...rest} type={type} className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${v} ${s} ${className}`}>
      {children}
    </button>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`elev m-auto w-[calc(100%-1.5rem)] ${wide ? "max-w-2xl" : "max-w-lg"} rounded-3xl p-0 text-night shadow-2xl backdrop:bg-night/45 backdrop:backdrop-blur-md`}
    >
      {open && (
        <div>
          <div className="flex items-center justify-between border-b border-silver px-5 py-4">
            <h2 id={titleId} className="font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-lg text-steel hover:bg-silver-soft hover:text-night" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

const inputCls = "field-3d mt-1 w-full rounded-xl border-[1.5px] border-ctrl bg-white px-3 py-2.5 text-base outline-none focus:border-night";

export function Field({ label, children, hint, className = "" }: { label: React.ReactNode; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-night">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-steel">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function FormError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-brand-tint px-3 py-2 text-sm text-brand sm:col-span-2">
      {children}
    </p>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="group" className="scroll-x chips -mx-1.5 flex gap-1.5 px-1.5 py-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${value === o.value ? "btn-red text-white" : "chip-3d text-night ring-1 ring-edge hover:brightness-95"}`}
        >
          {o.label}
          {o.count !== undefined && <span className={`ml-1.5 text-xs ${value === o.value ? "text-white" : "text-steel"}`}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, tone = "brand" }: { value: number; tone?: "brand" | "green" | "amber" | "slate" }) {
  const c =
    tone === "green" ? "from-emerald-500 to-emerald-700" : tone === "amber" ? "from-amber-400 to-amber-600" : tone === "slate" ? "from-slate-400 to-slate-500" : "from-red-500 to-brand";
  return (
    <div className="well h-2.5 w-full overflow-hidden rounded-full bg-silver" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full bg-gradient-to-r ${c} shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]`} style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-10 text-center text-sm text-steel">{children}</div>;
}

export function Table({ children, minWidth = 640 }: { children: React.ReactNode; minWidth?: number }) {
  return (
    <div className="scroll-x">
      <table className="w-full text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, right, className = "" }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <th scope="col" className={`border-b border-edge/70 bg-gradient-to-b from-white to-silver-soft px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-steel first:rounded-tl-2xl last:rounded-tr-2xl ${right ? "text-right" : "text-left"} ${className}`}>{children}</th>;
}

export function Td({ children, right, className = "" }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`border-b border-silver px-4 py-3 align-middle ${right ? "text-right tabular-nums" : ""} ${className}`}>{children}</td>;
}

/** A number plate chip. */
export function Plate({ children }: { children: React.ReactNode }) {
  return <span className="plate-metal inline-block whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-xs font-bold tracking-wide text-night">{children}</span>;
}
