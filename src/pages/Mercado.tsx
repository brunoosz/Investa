import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDownWideNarrow, EyeOff, Plus, RefreshCw, Search, SlidersHorizontal, Star, Undo2 } from "lucide-react";
import clsx from "clsx";
import type { AssetCategory, Quote, TesouroTitle } from "@shared/types";
import { CATALOG, CATEGORIES, catalogAsset, displaySymbol } from "@shared/catalog";
import { irRate, netReturn, savingsAnnual } from "@shared/finance";
import { brl, compact, dateBR, num, pct, quotePrice, relativeTime, toneClass } from "@/lib/format";
import { refreshQuotes, useMarket, useQuotes } from "@/store/market";
import { useSession, useUserData } from "@/store/session";
import { useUi } from "@/store/ui";
import { useIndicators, useTesouro } from "@/hooks/useMarketData";
import { Badge, Card, EmptyState, ErrorState, LiveDot, PageHeader, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Chip, Field, MoneyInput, SegmentedControl, Toggle } from "@/components/ui/form";
import { Sheet } from "@/components/ui/Sheet";
import { AssetAvatar, AssetPicker, ChangePill } from "@/components/market";

type Tab = "favoritos" | AssetCategory;
type Sort = "variacao" | "alta" | "queda" | "nome" | "volume";

const STRIP = ["^BVSP", "IFIX.SA", "USDBRL=X", "EURBRL=X", "BTC-USD", "^GSPC", "GC=F", "BZ=F"];

function IndicatorStrip() {
  const quotes = useQuotes(STRIP);
  const { data: ind } = useIndicators();
  const navigate = useNavigate();
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 mb-5">
      {ind?.selic && (
        <div className="surface px-4 py-3 min-w-[132px] shrink-0">
          <div className="text-footnote text-muted">Selic</div>
          <div className="font-semibold tabular mt-0.5">{num(ind.selic.value)}%</div>
          <div className="text-footnote text-muted">CDI {ind.cdi ? num(ind.cdi.value) : "—"}%</div>
        </div>
      )}
      {STRIP.map((s) => {
        const q = quotes[s];
        return (
          <button key={s} onClick={() => navigate(`/mercado/${encodeURIComponent(s)}`)} className="surface px-4 py-3 min-w-[132px] shrink-0 text-left hover:border-separator/20 pressable transition-[border-color,transform] duration-150">
            <div className="flex items-center gap-1.5 text-footnote text-muted">
              <AssetAvatar symbol={s} size={16} />
              <span className="truncate">{catalogAsset(s)?.name ?? displaySymbol(s)}</span>
            </div>
            {q ? (
              <>
                <div className="font-semibold tabular mt-0.5">{s === "BTC-USD" ? `US$ ${num(q.price, 0)}` : quotePrice(q)}</div>
                <div className={clsx("text-footnote tabular font-medium", toneClass(q.changePercent))}>{pct(q.changePercent)}</div>
              </>
            ) : (
              <>
                <Skeleton className="h-4 w-20 mt-1.5" />
                <Skeleton className="h-3 w-10 mt-1.5" />
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

function QuoteRow({ symbol, q, name, favorite, failed, onFavorite, onHide }: { symbol: string; q?: Quote; name: string; favorite: boolean; failed?: boolean; onFavorite: () => void; onHide: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="group flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-line/[0.04] active:bg-line/[0.07] transition-colors duration-150 cursor-pointer" onClick={() => navigate(`/mercado/${encodeURIComponent(symbol)}`)}>
      <AssetAvatar symbol={symbol} size={40} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-body">{displaySymbol(symbol)}</div>
        <div className="text-footnote text-muted truncate">{q?.name && q.name !== symbol ? q.name : name}</div>
      </div>
      <div className="hidden md:block text-right w-[120px]">
        {q?.volume ? (
          <>
            <div className="text-footnote text-muted">Volume</div>
            <div className="text-footnote tabular">{compact(q.volume)}</div>
          </>
        ) : null}
      </div>
      <div className="hidden lg:block text-right w-[100px]">
        {q?.dividendYield ? (
          <>
            <div className="text-footnote text-muted">DY 12m</div>
            <div className="text-footnote tabular">{num(q.dividendYield)}%</div>
          </>
        ) : q?.pe ? (
          <>
            <div className="text-footnote text-muted">P/L</div>
            <div className="text-footnote tabular">{num(q.pe, 1)}</div>
          </>
        ) : null}
      </div>
      <div className="text-right w-[120px]">
        {q ? <div className="font-semibold tabular text-body">{quotePrice(q)}</div> : failed ? <span className="text-muted">—</span> : <Skeleton className="h-4 w-20 ml-auto" />}
      </div>
      <ChangePill value={q?.changePercent} />
      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
        <button onClick={onFavorite} className={clsx("pressable h-8 w-8 rounded-chip flex items-center justify-center transition-[opacity,color,transform] duration-150", favorite ? "text-warning" : "text-muted/50 hover:text-fg opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100")} title={favorite ? "Remover dos favoritos" : "Favoritar"}>
          <Star size={17} fill={favorite ? "currentColor" : "none"} />
        </button>
        <button onClick={onHide} className="h-8 w-8 rounded-chip hidden sm:flex items-center justify-center text-muted/50 hover:text-fg opacity-0 group-hover:opacity-100 pressable transition-[opacity,color,transform] duration-150" title="Ocultar da lista">
          <EyeOff size={16} />
        </button>
      </div>
    </div>
  );
}

function QuoteList({ tab }: { tab: Tab }) {
  const settings = useUserData("settings");
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("variacao");

  const assets = useMemo(() => {
    const base =
      tab === "favoritos"
        ? settings.favorites.map((s) => ({ symbol: s, name: catalogAsset(s)?.name ?? settings.customSymbols.find((c) => c.symbol === s)?.name ?? displaySymbol(s) }))
        : [...CATALOG.filter((a) => a.category === tab), ...settings.customSymbols.filter((c) => c.category === tab && !CATALOG.some((a) => a.symbol === c.symbol))];
    return base.filter((a) => tab === "favoritos" || !settings.hiddenSymbols.includes(a.symbol));
  }, [tab, settings.favorites, settings.customSymbols, settings.hiddenSymbols]);

  const quotes = useQuotes(useMemo(() => assets.map((a) => a.symbol), [assets]));
  const updatedAt = useMarket((s) => s.updatedAt);
  const loading = useMarket((s) => s.loading);
  const error = useMarket((s) => s.error);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = assets.filter((a) => !term || a.symbol.toLowerCase().includes(term) || a.name.toLowerCase().includes(term));
    const anyQuote = list.some((a) => quotes[a.symbol]);
    const withData = anyQuote ? list.filter((a) => quotes[a.symbol] || tab === "favoritos") : list;
    const q = (s: string) => quotes[s];
    return [...withData].sort((a, b) => {
      const qa = q(a.symbol);
      const qb = q(b.symbol);
      if (sort === "nome") return displaySymbol(a.symbol).localeCompare(displaySymbol(b.symbol));
      if (!qa || !qb) return qa ? -1 : qb ? 1 : 0;
      if (sort === "alta") return qb.changePercent - qa.changePercent;
      if (sort === "queda") return qa.changePercent - qb.changePercent;
      if (sort === "volume") return (qb.volume ?? 0) * qb.price - (qa.volume ?? 0) * qa.price;
      return Math.abs(qb.changePercent) - Math.abs(qa.changePercent);
    });
  }, [assets, quotes, query, sort, tab]);

  const toggleFav = (s: string) =>
    update("settings", (st) => ({ ...st, favorites: st.favorites.includes(s) ? st.favorites.filter((x) => x !== s) : [...st.favorites, s] }));
  const hide = (s: string) => {
    if (tab === "favoritos") return toggleFav(s);
    update("settings", (st) => ({ ...st, hiddenSymbols: [...new Set([...st.hiddenSymbols, s])] }));
    toast({ title: `${displaySymbol(s)} ocultado`, message: "Você pode reexibir em Personalizar.", tone: "info" });
  };

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-3 border-b border-separator/10">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar nesta lista" className="field h-9 pl-9 text-callout" />
        </div>
        <div className="flex items-center gap-1.5 text-footnote text-muted">
          <ArrowDownWideNarrow size={15} />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-transparent outline-none font-medium text-fg cursor-pointer">
            <option value="variacao">Maior variação</option>
            <option value="alta">Maiores altas</option>
            <option value="queda">Maiores quedas</option>
            <option value="volume">Mais negociados</option>
            <option value="nome">Nome (A–Z)</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-footnote text-muted ml-auto">
          {error ? <span className="text-danger">Sem conexão</span> : <LiveDot />}
          {updatedAt ? `Atualizado ${relativeTime(updatedAt)}` : "Carregando…"}
          <button onClick={() => void refreshQuotes()} className={clsx("h-7 w-7 rounded-chip flex items-center justify-center hover:bg-line/10 transition-colors", loading && "animate-spin")} aria-label="Atualizar">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
      {error && !Object.keys(quotes).length && (
        <div className="p-4">
          <ErrorState message={error} onRetry={() => void refreshQuotes()} />
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState icon={Star} title={tab === "favoritos" ? "Nenhum favorito ainda" : "Nada por aqui"} description={tab === "favoritos" ? "Toque na estrela de qualquer ativo para acompanhá-lo aqui." : "Ajuste o filtro ou adicione ativos em Personalizar."} />
      ) : (
        <div className="divide-y divide-separator/10">
          {rows.map((a) => (
            <QuoteRow
              key={a.symbol}
              symbol={a.symbol}
              name={a.name}
              q={quotes[a.symbol]}
              failed={!!error}
              favorite={settings.favorites.includes(a.symbol)}
              onFavorite={() => toggleFav(a.symbol)}
              onHide={() => hide(a.symbol)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function tesouroRate(t: TesouroTitle): string {
  if (t.buyRate === undefined) return "—";
  if (t.indexer === "SELIC") return `Selic + ${num(t.buyRate, 4)}%`;
  if (t.indexer === "IPCA") return `IPCA + ${num(t.buyRate)}%`;
  if (t.indexer === "IGPM") return `IGP-M + ${num(t.buyRate)}%`;
  return `${num(t.buyRate)}% a.a.`;
}

function TesouroPanel() {
  const { data, error, loading, reload } = useTesouro();
  const [onlyBuy, setOnlyBuy] = useState(true);
  const titles = (data?.titles ?? []).filter((t) => !onlyBuy || t.canBuy);
  const groups: { key: TesouroTitle["indexer"]; label: string; text: string }[] = [
    { key: "SELIC", label: "Tesouro Selic", text: "Acompanha a Selic. Ideal para reserva de emergência." },
    { key: "PRE", label: "Prefixados", text: "Taxa travada na compra. Bom quando os juros devem cair." },
    { key: "IPCA", label: "IPCA+ (inclui RendA+ e Educa+)", text: "Inflação + juro real. Protege o poder de compra no longo prazo." },
    { key: "IGPM", label: "IGP-M+", text: "Títulos antigos atrelados ao IGP-M." },
  ];
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-separator/10">
        <div>
          <div className="font-semibold">Títulos do Tesouro Direto</div>
          <div className="text-footnote text-muted">{data ? `Fonte: ${data.source} · ${data.updatedAt.length > 10 ? relativeTime(data.updatedAt) : dateBR(data.updatedAt)}` : "Taxas oficiais de compra"}</div>
        </div>
        <label className="flex items-center gap-2 text-footnote text-muted">
          <Toggle checked={onlyBuy} onChange={setOnlyBuy} /> Só disponíveis para compra
        </label>
      </div>
      {loading && !data && (
        <div className="p-5 space-y-2">
          <div className="text-footnote text-muted mb-1">Baixando a base oficial do Tesouro Direto — na primeira vez pode levar alguns segundos.</div>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      )}
      {error && !data && (
        <div className="p-5">
          <ErrorState message={error} onRetry={reload} />
        </div>
      )}
      {groups.map((g) => {
        const list = titles.filter((t) => t.indexer === g.key);
        if (!list.length) return null;
        return (
          <div key={g.key} className="px-5 py-4 border-b border-separator/10 last:border-0">
            <div className="mb-2">
              <div className="font-semibold text-body">{g.label}</div>
              <div className="text-footnote text-muted">{g.text}</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((t) => (
                <div key={t.name} className="rounded-control bg-line/[0.04] border border-separator/10 px-4 py-3">
                  <div className="text-footnote font-semibold">{t.name}</div>
                  <div className="text-title font-bold tabular text-primary mt-0.5">{tesouroRate(t)}</div>
                  <div className="text-footnote text-muted mt-1">
                    Vence em {dateBR(t.maturity)}
                    {t.minInvestment ? ` · mínimo ${brl(t.minInvestment)}` : ""}
                    {t.unitPrice ? ` · título ${brl(t.unitPrice)}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function RendaFixaPanel() {
  const { data: ind, error, reload } = useIndicators();
  const [amount, setAmount] = useState(10_000);
  const [months, setMonths] = useState("12");
  const days = Number(months) * 30.4;
  const cdi = ind?.cdi?.value ?? 0;
  const selic = ind?.selic?.value ?? 0;
  const products = [
    { name: "Poupança", note: "Isenta de IR · liquidez imediata", annual: savingsAnnual(selic, ind?.tr?.value ?? 0), type: "poupanca" as const },
    { name: "Tesouro Selic", note: "Governo federal · liquidez diária", annual: selic + 0.07, type: "tesouro-selic" as const },
    { name: "CDB 100% do CDI", note: "FGC · liquidez diária (bancos digitais)", annual: cdi, type: "cdb" as const },
    { name: "CDB 110% do CDI", note: "FGC · prazo de 1 a 3 anos", annual: cdi * 1.1, type: "cdb" as const },
    { name: "LCI 90% do CDI", note: "Isenta de IR · FGC · carência", annual: cdi * 0.9, type: "lci" as const },
    { name: "LCA 95% do CDI", note: "Isenta de IR · FGC · carência", annual: cdi * 0.95, type: "lca" as const },
  ].map((p) => {
    const net = netReturn(p.annual, days, p.type);
    return { ...p, net, final: amount * (1 + net / 100) };
  });
  const best = Math.max(...products.map((p) => p.final));
  return (
    <div className="space-y-4">
      {error && !ind && <ErrorState message={error} onRetry={reload} />}
      <Card>
        <SectionTitle title="Comparador de renda fixa" subtitle={`Calculado com a Selic de ${num(selic)}% e o CDI de ${num(cdi)}% de hoje (Banco Central). Imposto de renda de ${num(irRate(days), 1)}% para este prazo.`} />
        <div className="grid sm:grid-cols-2 gap-3 mb-5 max-w-xl">
          <Field label="Quanto investir">
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Por quanto tempo">
            <SegmentedControl
              block
              value={months}
              onChange={setMonths}
              options={[
                { value: "6", label: "6m" },
                { value: "12", label: "1 ano" },
                { value: "24", label: "2 anos" },
                { value: "60", label: "5 anos" },
              ]}
            />
          </Field>
        </div>
        <div className="grid gap-2">
          {products
            .sort((a, b) => b.final - a.final)
            .map((p) => (
              <div key={p.name} className={clsx("flex flex-wrap items-center gap-3 rounded-control border px-4 py-3", p.final === best ? "border-success/40 bg-success/[0.06]" : "border-separator/10 bg-line/[0.03]")}>
                <div className="flex-1 min-w-[180px]">
                  <div className="font-semibold flex items-center gap-2">
                    {p.name} {p.final === best && <Badge tone="success">Melhor</Badge>}
                  </div>
                  <div className="text-footnote text-muted">{p.note}</div>
                </div>
                <div className="text-right">
                  <div className="text-footnote text-muted">Bruto ao ano</div>
                  <div className="tabular font-medium">{num(p.annual)}%</div>
                </div>
                <div className="text-right w-[150px]">
                  <div className="text-footnote text-muted">Você terá (líquido)</div>
                  <div className="tabular font-bold text-headline">{brl(p.final)}</div>
                </div>
              </div>
            ))}
        </div>
        <p className="text-footnote text-muted mt-3">Taxas dos CDBs, LCIs e LCAs são exemplos típicos de mercado; veja as taxas de cada banco na aba Bancos.</p>
      </Card>
    </div>
  );
}

function CustomizeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useUserData("settings");
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  return (
    <Sheet open={open} onClose={onClose} title="Personalizar mercado" subtitle="Escolha o que aparece e adicione qualquer ativo que quiser acompanhar." width="lg">
      <div className="space-y-6">
        <div>
          <div className="label">Adicionar ativo</div>
          <AssetPicker
            placeholder="Busque qualquer ação, FII, ETF, BDR, cripto, moeda…"
            onSelect={(r) => {
              update("settings", (s) => ({
                ...s,
                customSymbols: CATALOG.some((a) => a.symbol === r.symbol) || s.customSymbols.some((c) => c.symbol === r.symbol) ? s.customSymbols : [...s.customSymbols, { symbol: r.symbol, name: r.name, category: r.category }],
                hiddenSymbols: s.hiddenSymbols.filter((x) => x !== r.symbol),
                favorites: s.favorites.includes(r.symbol) ? s.favorites : [...s.favorites, r.symbol],
              }));
              toast({ title: `${displaySymbol(r.symbol)} adicionado`, message: "Também foi marcado como favorito.", tone: "success" });
            }}
          />
        </div>
        <div>
          <div className="label">Categorias visíveis</div>
          <div className="surface divide-y divide-separator/10">
            {CATEGORIES.map((c) => {
              const visible = !settings.hiddenCategories.includes(c.id);
              return (
                <div key={c.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="font-medium text-callout">{c.label}</div>
                    <div className="text-footnote text-muted">{c.description}</div>
                  </div>
                  <Toggle
                    checked={visible}
                    onChange={(v) =>
                      update("settings", (s) => ({ ...s, hiddenCategories: v ? s.hiddenCategories.filter((x) => x !== c.id) : [...s.hiddenCategories, c.id] }))
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>
        {settings.hiddenSymbols.length > 0 && (
          <div>
            <div className="label">Ativos ocultos</div>
            <div className="flex flex-wrap gap-2">
              {settings.hiddenSymbols.map((s) => (
                <Chip key={s} icon={Undo2} onClick={() => update("settings", (st) => ({ ...st, hiddenSymbols: st.hiddenSymbols.filter((x) => x !== s) }))}>
                  {displaySymbol(s)}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {settings.customSymbols.length > 0 && (
          <div>
            <div className="label">Ativos que você adicionou</div>
            <div className="flex flex-wrap gap-2">
              {settings.customSymbols.map((c) => (
                <Chip key={c.symbol} onClick={() => update("settings", (st) => ({ ...st, customSymbols: st.customSymbols.filter((x) => x.symbol !== c.symbol), favorites: st.favorites.filter((x) => x !== c.symbol) }))}>
                  {displaySymbol(c.symbol)} · remover
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function Mercado() {
  const settings = useUserData("settings");
  const [tab, setTab] = useState<Tab>("favoritos");
  const [customize, setCustomize] = useState(false);
  const visible = CATEGORIES.filter((c) => !settings.hiddenCategories.includes(c.id));
  const activeTab = tab !== "favoritos" && settings.hiddenCategories.includes(tab) ? "favoritos" : tab;

  return (
    <div>
      <PageHeader
        title="Mercado"
        subtitle={
          <>
            <LiveDot className="mr-2 align-middle" />
            Dados reais do Yahoo Finance, Banco Central e Tesouro Direto. Atualização automática a cada 15 s (B3 com atraso de até 15 min).
          </>
        }
        actions={
          <>
            <Button variant="secondary" icon={SlidersHorizontal} onClick={() => setCustomize(true)}>
              Personalizar
            </Button>
            <Button variant="secondary" icon={Plus} onClick={() => setCustomize(true)}>
              Adicionar ativo
            </Button>
          </>
        }
      />
      <IndicatorStrip />
      <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1 mb-1">
        <Chip active={activeTab === "favoritos"} icon={Star} onClick={() => setTab("favoritos")}>
          Favoritos
        </Chip>
        {visible.map((c) => (
          <Chip key={c.id} active={activeTab === c.id} onClick={() => setTab(c.id)}>
            {c.label}
          </Chip>
        ))}
      </div>
      {activeTab === "tesouro" ? <TesouroPanel /> : activeTab === "rendafixa" ? <RendaFixaPanel /> : <QuoteList key={activeTab} tab={activeTab} />}
      <CustomizeSheet open={customize} onClose={() => setCustomize(false)} />
    </div>
  );
}
