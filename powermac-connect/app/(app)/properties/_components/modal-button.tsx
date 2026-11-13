"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/dialog";
import { buttonClass } from "@/components/ui/primitives";

/** A button that opens a modal; the body gets a `close` callback (e.g. for ActionForm onSuccess). */
export function ModalButton({
  label,
  title,
  description,
  icon,
  variant = "secondary",
  size = "sm",
  modalSize = "lg",
  children,
}: {
  label: ReactNode;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "subtle" | "danger";
  size?: "sm" | "md";
  modalSize?: "md" | "lg" | "xl";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={buttonClass(variant, size)} onClick={() => setOpen(true)}>
        {icon}
        {label}
      </button>
      <Modal open={open} onClose={close} title={title} description={description} size={modalSize}>
        {children(close)}
      </Modal>
    </>
  );
}
