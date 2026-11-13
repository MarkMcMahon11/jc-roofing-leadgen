import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- buttons */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-white shadow-[0_0_0_1px_rgb(102_163_255/0.35),0_8px_24px_-8px_rgb(47_125_255/0.7)] hover:bg-[#468cff] active:bg-[#2468d8]",
  secondary: "bg-raised text-fg border border-line-strong hover:border-[#3d4f74] hover:bg-[#1a2643]",
  ghost: "text-muted hover:text-fg hover:bg-raised",
  subtle: "bg-accent-lo text-accent-hi border border-[#1d3d78] hover:bg-[#15305f]",
  danger: "bg-bad-lo text-[#ff8a87] border border-[#5a1f1d] hover:bg-[#451714]",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-[10px]",
  lg: "h-12 px-5 text-[15px] gap-2 rounded-xl",
};
export const buttonClass = (variant: Variant = "secondary", size: Size = "md", extra?: string) =>
  cx(
    "inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none select-none",
    variants[variant],
    sizes[size],
    extra,
  );

export function Button({ variant, size, className, ...rest }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...rest} />;
}

export function ButtonLink({ variant, size, className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

/* ---------------------------------------------------------------- layout */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-xs font-medium tracking-[0.14em] text-accent-hi uppercase">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ className, children, ...rest }: ComponentProps<"section">) {
  return (
    <section className={cx("pm-card min-w-0", className)} {...rest}>
      {children}
    </section>
  );
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("px-5 py-4", className)}>{children}</div>;
}

/* ---------------------------------------------------------------- badges */
export type Tone = "neutral" | "accent" | "ok" | "warn" | "bad" | "info";
const tones: Record<Tone, string> = {
  neutral: "bg-raised text-muted border-line-strong",
  accent: "bg-accent-lo text-accent-hi border-[#1d3d78]",
  ok: "bg-ok-lo text-[#5fdc98] border-[#18492f]",
  warn: "bg-warn-lo text-[#ffc56b] border-[#57400f]",
  bad: "bg-bad-lo text-[#ff8a87] border-[#5a1f1d]",
  info: "bg-info-lo text-[#7fdcf5] border-[#164556]",
};
export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** Badge coloured by a configurable hex colour (job statuses). */
export function ColourBadge({ colour, children }: { colour: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ color: lighten(colour), borderColor: colour + "55", backgroundColor: colour + "1f" }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: colour }} aria-hidden />
      {children}
    </span>
  );
}
function lighten(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.45);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `rgb(${r} ${g} ${b})`;
}

export const priorityTone: Record<string, Tone> = { emergency: "bad", urgent: "warn", routine: "info", planned: "neutral" };

/* ---------------------------------------------------------------- form fields */
const control =
  "w-full rounded-[10px] border border-line-strong bg-sunken px-3 text-sm text-fg placeholder:text-subtle transition-colors hover:border-[#3d4f74] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60 aria-[invalid=true]:border-bad";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx(control, "h-10", className)} {...rest} />;
}
export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea className={cx(control, "min-h-24 py-2.5 leading-relaxed", className)} {...rest} />;
}
export function Select({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select className={cx(control, "h-10 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9", className)} style={{ backgroundImage: CHEVRON }} {...rest}>
      {children}
    </select>
  );
}
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%238090ab'%3E%3Cpath d='M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z'/%3E%3C/svg%3E")`;

export function Label({ htmlFor, children, required }: { htmlFor?: string; children: ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-muted">
      {children}
      {required && <span className="ml-0.5 text-accent-hi" aria-hidden>*</span>}
    </label>
  );
}

/* ---------------------------------------------------------------- tables */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-sunken/80 text-left text-xs font-medium tracking-wide text-subtle uppercase">{children}</thead>;
}
export function TH({ children, className, align }: { children?: ReactNode; className?: string; align?: "right" | "left" }) {
  return <th className={cx("border-b border-line px-4 py-2.5 font-medium whitespace-nowrap", align === "right" && "text-right", className)}>{children}</th>;
}
export function TR({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cx("border-b border-line/70 transition-colors last:border-0 hover:bg-raised/50", className)}>{children}</tr>;
}
export function TD({ children, className, align }: { children?: ReactNode; className?: string; align?: "right" | "left" }) {
  return <td className={cx("px-4 py-3 align-middle text-fg", align === "right" && "text-right tabular", className)}>{children}</td>;
}

/* ---------------------------------------------------------------- misc */
export function EmptyState({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-subtle">{icon}</div>}
      <p className="text-[15px] font-medium text-fg">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  href,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  href?: string;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const accent: Record<Tone, string> = {
    neutral: "before:bg-line-strong",
    accent: "before:bg-accent",
    ok: "before:bg-ok",
    warn: "before:bg-warn",
    bad: "before:bg-bad",
    info: "before:bg-info",
  };
  const body = (
    <div
      className={cx(
        "pm-card relative h-full overflow-hidden px-4 py-3.5 before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full",
        accent[tone],
        href && "transition-[border-color,transform] hover:-translate-y-px hover:border-line-strong",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[12.5px] font-medium text-muted">{label}</span>
        {icon && <span className="text-subtle">{icon}</span>}
      </div>
      <div className="mt-1.5 text-[26px] leading-none font-semibold tracking-tight text-fg tabular">{value}</div>
      {hint && <div className="mt-2 truncate text-xs text-subtle">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-[14px] focus-visible:outline-offset-4" aria-label={`${label}: open records`}>
      {body}
    </Link>
  ) : (
    body
  );
}

export function DefinitionList({ items, columns = 2 }: { items: { label: string; value: ReactNode }[]; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cx("grid gap-x-6 gap-y-4", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3")}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-medium text-subtle">{i.label}</dt>
          <dd className="mt-0.5 text-sm break-words text-fg">{i.value ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono text-[12.5px] tracking-tight text-accent-hi", className)}>{children}</span>;
}

export function Notice({ tone = "info", title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  const map: Record<Tone, string> = {
    info: "border-[#164556] bg-info-lo/60 text-[#a9e7f8]",
    warn: "border-[#57400f] bg-warn-lo/60 text-[#ffd79a]",
    bad: "border-[#5a1f1d] bg-bad-lo/60 text-[#ffb3b1]",
    ok: "border-[#18492f] bg-ok-lo/60 text-[#9be8bd]",
    accent: "border-[#1d3d78] bg-accent-lo/60 text-[#b5d1ff]",
    neutral: "border-line bg-raised text-muted",
  };
  return (
    <div className={cx("rounded-xl border px-4 py-3 text-sm", map[tone])} role={tone === "bad" ? "alert" : undefined}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}
