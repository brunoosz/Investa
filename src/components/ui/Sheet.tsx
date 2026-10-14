import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { TriangleAlert, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "./Button";
import { OverlayFrame, useOverlay } from "./Overlay";

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
}) {
  const presence = useOverlay(open, onClose);
  const max = { sm: "md:max-w-sm", md: "md:max-w-lg", lg: "md:max-w-2xl", xl: "md:max-w-4xl" }[width];

  return createPortal(
    <AnimatePresence key={presence.key} onExitComplete={presence.onExitComplete}>
      {open && (
        <OverlayFrame className="fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-6 no-drag">
          <motion.div
            className="absolute inset-0 bg-black/45"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={clsx("relative w-full max-h-[92dvh] flex flex-col bg-surface border border-separator/10 shadow-2xl rounded-t-sheet md:rounded-sheet", max)}
            initial={{ y: 48, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 36, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          >
            {(title || subtitle) && (
              <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
                <div className="min-w-0">
                  {title && <h2 className="text-title">{title}</h2>}
                  {subtitle && <p className="text-footnote text-muted mt-1">{subtitle}</p>}
                </div>
                <button onClick={onClose} className="pressable h-8 w-8 -mr-2 rounded-full bg-line/10 text-muted hover:text-fg flex items-center justify-center shrink-0" aria-label="Fechar">
                  <X size={16} strokeWidth={2.5} />
                </button>
              </div>
            )}
            <div className="px-6 pb-5 overflow-y-auto overscroll-contain">{children}</div>
            {footer && <div className="px-6 pt-4 border-t border-separator/10 flex items-center justify-end gap-2" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>{footer}</div>}
          </motion.div>
        </OverlayFrame>
      )}
    </AnimatePresence>,
    document.body
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  danger,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Sheet open={open} onClose={onClose} width="sm">
      <div className="pt-6 text-center">
        <div className={clsx("mx-auto h-12 w-12 rounded-card flex items-center justify-center mb-3", danger ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary")}>
          <TriangleAlert size={24} />
        </div>
        <h3 className="text-title">{title}</h3>
        <div className="text-callout text-muted mt-2">{message}</div>
        <div className="grid grid-cols-2 gap-2 mt-6">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
