"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { buttonClass, cx } from "./primitives";

/** Accessible modal built on <dialog> (focus trap, Esc to close, backdrop). */
export function Modal({ open, onClose, title, description, children, size = "md" }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; size?: "md" | "lg" | "xl" }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cx(
        "m-auto w-[calc(100%-24px)] rounded-2xl border border-line bg-surface p-0 text-fg shadow-[var(--shadow-pop)] backdrop:bg-[#02050c]/75 backdrop:backdrop-blur-sm",
        size === "md" && "max-w-lg",
        size === "lg" && "max-w-2xl",
        size === "xl" && "max-w-4xl",
      )}
    >
      {open && (
        <div className="flex max-h-[88vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button onClick={onClose} className={buttonClass("ghost", "sm", "-mr-2 px-2")} aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
