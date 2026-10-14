import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import clsx from "clsx";
import type { AssetCategory, Quote, SearchResult } from "@shared/types";
import { CATEGORIES, catalogAsset, displaySymbol, guessCategory } from "@shared/catalog";
import { BANKS, OTHER_INSTITUTIONS } from "@shared/banks";
import { api } from "@/lib/api";
import { pct, quotePrice } from "@/lib/format";
import { CATEGORY_COLORS } from "@/lib/portfolio";
import { Spinner } from "@/components/ui/primitives";
import { Select } from "@/components/ui/form";
import { LocalLogo, logoSource, RemoteLogo } from "@/components/AssetLogo";

function InitialsBadge({ symbol, category, size }: { symbol: string; category: AssetCategory; size: number }) {
  const color = CATEGORY_COLORS[category];
  const label = displaySymbol(symbol).replace(/[^A-Z0-9]/gi, "").slice(0, 4);
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold shrink-0 tracking-tight"
      style={{ width: size, height: size, background: `${color}1f`, color, fontSize: size * (label.length > 3 ? 0.26 : 0.3) }}
    >
      {label}
    </div>
  );
}

export function AssetAvatar({ symbol, category, size = 40 }: { symbol: string; category?: AssetCategory; size?: number }) {
  const cat = category ?? catalogAsset(symbol)?.category ?? guessCategory(symbol);
  const source = useMemo(() => logoSource(symbol, cat), [symbol, cat]);
  const fallback = <InitialsBadge symbol={symbol} category={cat} size={size} />;
  if (!source) return fallback;
  if (source.kind === "img") return <RemoteLogo src={source.src} plate={source.plate} size={size} fallback={fallback} />;
  return <LocalLogo source={source} size={size} />;
}

export function ChangePill({ value, className, size = "md" }: { value: number | undefined; className?: string; size?: "sm" | "md" }) {
  const v = value ?? 0;
  const up = v > 0.004;
  const down = v < -0.004;
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center rounded-chip font-semibold tabular text-white",
        size === "sm" ? "h-6 min-w-[64px] px-1.5 text-caption tracking-normal" : "h-7 min-w-[78px] px-2 text-footnote",
        up ? "bg-success" : down ? "bg-danger" : "bg-line/30",
        className
      )}
    >
      {value === undefined ? "—" : pct(v)}
    </span>
  );
}

export function QuoteLine({ q, symbol }: { q?: Quote; symbol: string }) {
  if (!q) return <span className="skeleton inline-block h-4 w-20 rounded-chip" />;
  return <span className="tabular font-semibold">{quotePrice({ ...q, symbol })}</span>;
}

export function categoryLabel(c: AssetCategory): string {
  return CATEGORIES.find((x) => x.id === c)?.label ?? c;
}

export function AssetPicker({
  value,
  onSelect,
  placeholder = "Buscar ação, FII, ETF, cripto…",
  autoFocus,
  allowCategories,
}: {
  value?: string;
  onSelect: (r: SearchResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
  allowCategories?: AssetCategory[];
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 1) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      api.market
        .search(q.trim())
        .then((r) => setResults(allowCategories ? r.filter((x) => allowCategories.includes(x.category)) : r))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(t);
  }, [q, allowCategories]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      {value && !open ? (
        <button type="button" onClick={() => setOpen(true)} className="field flex items-center gap-2.5 text-left">
          <AssetAvatar symbol={value} size={26} />
          <span className="font-semibold">{displaySymbol(value)}</span>
          <span className="text-muted truncate text-footnote">{catalogAsset(value)?.name}</span>
          <span className="flex-1" />
          <span className="text-footnote text-primary font-semibold">Trocar</span>
        </button>
      ) : (
        <div className="relative">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            autoFocus={autoFocus || open}
            className="field pl-10 pr-10"
            placeholder={placeholder}
            value={q}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
          />
          {loading ? (
            <Spinner size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2" />
          ) : q ? (
            <button type="button" onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg transition-colors duration-150">
              <X size={16} />
            </button>
          ) : null}
        </div>
      )}
      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            className="absolute left-0 right-0 top-[calc(100%+6px)] z-[90] max-h-[300px] overflow-y-auto overscroll-contain origin-top rounded-card border border-separator/15 material-regular shadow-2xl py-1.5"
          >
            {results.map((r) => (
              <button
                type="button"
                key={r.symbol}
                onClick={() => {
                  onSelect(r);
                  setQ("");
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2 hover:bg-primary/10 transition-colors duration-150 text-left"
              >
                <AssetAvatar symbol={r.symbol} category={r.category} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="text-callout font-semibold">{displaySymbol(r.symbol)}</div>
                  <div className="text-footnote text-muted truncate">{r.name}</div>
                </div>
                <span className="text-caption uppercase text-muted whitespace-nowrap">{categoryLabel(r.category)}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function InstitutionSelect({ value, onChange, includeTesouro }: { value: string; onChange: (v: string) => void; includeTesouro?: boolean }) {
  const known = BANKS.some((b) => b.id === value) || OTHER_INSTITUTIONS.includes(value) || value === "Tesouro Direto" || !value;
  return (
    <Select value={known ? value : "__custom"} onChange={(e) => onChange(e.target.value === "__custom" ? value : e.target.value)}>
      <option value="">Selecione…</option>
      <optgroup label="Bancos e corretoras">
        {BANKS.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </optgroup>
      <optgroup label="Outras">
        {includeTesouro && <option value="Tesouro Direto">Tesouro Direto</option>}
        {OTHER_INSTITUTIONS.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {!known && <option value="__custom">{value}</option>}
      </optgroup>
    </Select>
  );
}
