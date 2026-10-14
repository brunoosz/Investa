import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useIsPresent } from "framer-motion";
import clsx from "clsx";
import { pushOverlay } from "@/lib/overlays";

// Tempo máximo para a animação de fechar. Passou disso (quadros pausados com a
// janela escondida, saída interrompida no meio), a camada sai da tela assim mesmo.
const EXIT_LIMIT_MS = 900;

/**
 * Registra a camada (janela, paleta) enquanto está aberta, para o Esc e o
 * voltar do Android fecharem só a de cima. Devolve as props do AnimatePresence.
 */
export function useOverlay(open: boolean, onClose: () => void): { key: number; onExitComplete: () => void } {
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useLayoutEffect(() => {
    if (!open) return;
    return pushOverlay(() => close.current());
  }, [open]);

  const [epoch, setEpoch] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [prev, setPrev] = useState(open);
  if (prev !== open) {
    setPrev(open);
    setExiting(!open);
  }
  useEffect(() => {
    if (!exiting) return;
    // Trocar a key do AnimatePresence descarta o que ainda estiver saindo.
    const t = setTimeout(() => {
      setExiting(false);
      setEpoch((n) => n + 1);
    }, EXIT_LIMIT_MS);
    return () => clearTimeout(t);
  }, [exiting]);
  return { key: epoch, onExitComplete: () => setExiting(false) };
}

/** Fundo fixo da camada. Enquanto ela fecha, não recebe cliques nem foco. */
export function OverlayFrame({ className, children }: { className: string; children: ReactNode }) {
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.inert = !present;
  }, [present]);
  return (
    <div ref={ref} data-overlay-frame={present ? "open" : "closing"} aria-hidden={present ? undefined : true} className={clsx(className, !present && "pointer-events-none")}>
      {children}
    </div>
  );
}
