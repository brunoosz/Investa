import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, BookOpen, ChartCandlestick, Search } from "lucide-react";
import clsx from "clsx";
import type { AssetCategory, SearchResult } from "@shared/types";
import { CATEGORIES, displaySymbol } from "@shared/catalog";
import { ALL_LESSONS } from "@shared/learning";
import { api } from "@/lib/api";
import { AssetAvatar } from "@/components/market";
import { isManager, useSession } from "@/store/session";
import { OverlayFrame, useOverlay } from "@/components/ui/Overlay";
import { ALL_NAV } from "./nav";

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  to: string;
  group: string;
  asset?: { symbol: string; category: AssetCategory };
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [assets, setAssets] = useState<SearchResult[]>([]);
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const inputRef = useRef<HTMLInputElement>(null);
  const presence = useOverlay(open, onClose);

  useEffect(() => {
    if (open) {
      setQ("");
      setAssets([]);
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setAssets([]);
      return;
    }
    const t = setTimeout(() => {
      api.market.search(q.trim()).then(setAssets).catch(() => setAssets([]));
    }, 220);
    return () => clearTimeout(t);
  }, [q, open]);

  const items = useMemo<Item[]>(() => {
    const term = norm(q.trim());
    const pages = ALL_NAV.filter((n) => (!n.managerOnly || isManager(user)) && (!n.ownerOnly || user?.role === "dono"))
      .filter((n) => !term || norm(n.label).includes(term))
      .map((n) => ({ id: `p-${n.to}`, label: n.label, icon: n.icon, to: n.to, group: "Páginas" }));
    const lessons = term
      ? ALL_LESSONS.filter((l) => norm(l.lesson.title).includes(term) || norm(l.module.title).includes(term))
          .slice(0, 4)
          .map((l) => ({ id: `l-${l.lesson.id}`, label: l.lesson.title, hint: l.module.title, icon: BookOpen, to: `/aula/${l.lesson.id}`, group: "Aulas" }))
      : [];
    const assetItems = assets.slice(0, 8).map((a) => ({
      id: `a-${a.symbol}`,
      label: displaySymbol(a.symbol),
      hint: `${a.name} · ${CATEGORIES.find((c) => c.id === a.category)?.label ?? a.exchange}`,
      icon: ChartCandlestick,
      to: `/mercado/${encodeURIComponent(a.symbol)}`,
      group: "Ativos",
      asset: { symbol: a.symbol, category: a.category },
    }));
    return [...assetItems, ...pages, ...lessons];
  }, [q, assets, user]);

  useEffect(() => setIndex(0), [items.length]);

  const go = (item: Item | undefined) => {
    if (!item) return;
    navigate(item.to);
    onClose();
  };

  return createPortal(
    <AnimatePresence key={presence.key} onExitComplete={presence.onExitComplete}>
      {open && (
        <OverlayFrame className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] px-4 no-drag">
          <motion.div className="absolute inset-0 bg-black/40" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="relative w-full max-w-[620px] material-regular border border-separator/15 rounded-sheet shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-3 px-5 h-[60px] border-b border-separator/10">
              <Search size={20} className="text-muted" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setIndex((i) => Math.min(items.length - 1, i + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setIndex((i) => Math.max(0, i - 1));
                  } else if (e.key === "Enter") {
                    go(items[index]);
                  }
                }}
                placeholder="Busque ações, FIIs, cripto, páginas ou aulas…"
                className="flex-1 bg-transparent outline-none text-headline placeholder:text-muted/70"
              />
              <kbd className="text-caption px-1.5 py-0.5 rounded-[6px] bg-fg/[0.06] text-muted">Esc</kbd>
            </div>
            <div className="max-h-[420px] overflow-y-auto py-2">
              {items.length === 0 && <div className="px-5 py-8 text-center text-muted text-callout">Nada encontrado para “{q}”.</div>}
              {items.map((item, i) => {
                const prev = items[i - 1];
                const Icon = item.icon;
                return (
                  <div key={item.id}>
                    {(!prev || prev.group !== item.group) && <div className="px-5 pt-2 pb-1 text-caption uppercase text-muted">{item.group}</div>}
                    <button
                      onMouseEnter={() => setIndex(i)}
                      onClick={() => go(item)}
                      className={clsx("w-full flex items-center gap-3 px-5 py-2.5 text-left rounded-none transition-colors duration-100", i === index && "bg-primary/10")}
                    >
                      {item.asset ? <AssetAvatar symbol={item.asset.symbol} category={item.asset.category} size={22} /> : <Icon size={18} className={i === index ? "text-primary" : "text-muted"} />}
                      <span className="font-medium text-callout">{item.label}</span>
                      {item.hint && <span className="text-footnote text-muted truncate">{item.hint}</span>}
                      <span className="flex-1" />
                      {i === index && <ArrowRight size={16} className="text-primary" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </OverlayFrame>
      )}
    </AnimatePresence>,
    document.body
  );
}
