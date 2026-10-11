import { useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Smartphone, X } from "lucide-react";
import { useSession } from "@/store/session";
import { Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import type { NavItem } from "@/components/layout/nav";
import { DEFAULT_TABS, navFor, setTabs, TAB_SLOTS, tabItems, useTabs } from "@/components/layout/tabBar";

const PHONE = "(max-width: 639px)";

/** No app do celular ou numa janela estreita aparece a barra de baixo. */
export function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(PHONE);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => document.documentElement.classList.contains("native-app") || window.matchMedia(PHONE).matches
  );
}

/** Escolhe quais telas ficam na barra de baixo e em que ordem. */
export function TabBarSettings() {
  const user = useSession((s) => s.user);
  const chosen = tabItems(useTabs(), user);
  const others = navFor(user).filter((i) => !chosen.includes(i));
  const full = chosen.length >= TAB_SLOTS;
  const isDefault = chosen.map((i) => i.to).join() === DEFAULT_TABS.join();
  const save = (list: NavItem[]) => setTabs(list.map((i) => i.to));
  const move = (from: number, to: number) => {
    const next = [...chosen];
    next.splice(to, 0, ...next.splice(from, 1));
    save(next);
  };

  return (
    <Card>
      <div className="flex items-center gap-3 mb-1">
        <Smartphone size={20} className="text-primary" />
        <div className="font-medium flex-1">Barra de baixo</div>
        {!isDefault && (
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setTabs(DEFAULT_TABS)}>
            Padrão
          </Button>
        )}
      </div>
      <div className="text-[13px] text-muted mb-4">Escolha até {TAB_SLOTS} telas para abrir com um toque. O último botão é sempre “Mais”, com o resto.</div>

      <div className="text-[12.5px] font-semibold text-muted mb-1.5 px-1">Na barra</div>
      <div className="rounded-2xl bg-line/[0.04] divide-y divide-line/[0.07] overflow-hidden">
        {chosen.map((item, idx) => {
          const Icon = item.icon;
          return (
            <motion.div layout transition={{ type: "spring", stiffness: 500, damping: 40 }} key={item.to} className="flex items-center gap-2 pl-3.5 pr-1.5 py-1.5">
              <Icon size={18} className="text-primary shrink-0" />
              <span className="flex-1 min-w-0 truncate text-[14.5px] font-medium ml-1">{item.label}</span>
              <Button size="icon-sm" variant="ghost" icon={ArrowUp} disabled={idx === 0} onClick={() => move(idx, idx - 1)} aria-label={`Subir ${item.label}`} />
              <Button size="icon-sm" variant="ghost" icon={ArrowDown} disabled={idx === chosen.length - 1} onClick={() => move(idx, idx + 1)} aria-label={`Descer ${item.label}`} />
              <Button size="icon-sm" variant="ghost" icon={X} disabled={chosen.length === 1} onClick={() => save(chosen.filter((i) => i !== item))} aria-label={`Tirar ${item.label} da barra`} />
            </motion.div>
          );
        })}
      </div>

      {others.length > 0 && (
        <>
          <div className="text-[12.5px] font-semibold text-muted mt-4 mb-2 px-1">{full ? "Para trocar, tire uma tela da barra" : "Toque para adicionar"}</div>
          <div className="flex flex-wrap gap-2">
            {others.map((item) => (
              <button
                key={item.to}
                type="button"
                disabled={full}
                onClick={() => save([...chosen, item])}
                aria-label={`Pôr ${item.label} na barra`}
                className="inline-flex items-center gap-1.5 rounded-full bg-line/[0.06] px-3 py-1.5 text-[13px] font-medium transition enabled:hover:bg-line/[0.1] disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <Plus size={14} className="text-primary" />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
