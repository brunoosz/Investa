import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, CircleX, Info, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useUi } from "@/store/ui";

export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismiss);
  const navigate = useNavigate();
  return (
    <div data-toaster className="fixed top-14 right-4 z-[80] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)] pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = t.tone === "success" ? CircleCheck : t.tone === "error" ? CircleX : Info;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 500, damping: 36 }}
              className="pointer-events-auto glass border border-separator/15 rounded-card shadow-2xl px-4 py-3 flex gap-3 items-start no-drag"
            >
              <Icon size={20} className={clsx("mt-0.5 shrink-0", t.tone === "success" ? "text-success" : t.tone === "error" ? "text-danger" : "text-primary")} />
              <div className="flex-1 min-w-0">
                <div className="text-callout font-semibold">{t.title}</div>
                {t.message && <div className="text-footnote text-muted mt-0.5 line-clamp-3">{t.message}</div>}
                {t.action && (
                  <button
                    className="pressable text-footnote font-semibold text-primary mt-1.5"
                    onClick={() => {
                      if (t.action!.onClick) t.action!.onClick();
                      else if (t.action!.to) navigate(t.action!.to);
                      dismiss(t.id);
                    }}
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
              <button onClick={() => dismiss(t.id)} className="text-muted hover:text-fg" aria-label="Fechar">
                <X size={16} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
