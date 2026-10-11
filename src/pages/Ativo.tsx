import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Bell, ChartCandlestick, ChartLine, CircleHelp, Gamepad2, Lightbulb, Sparkles, Star } from "lucide-react";
import clsx from "clsx";
import type { AssetCategory, ChartRange, Quote } from "@shared/types";
import { catalogAsset, displaySymbol, guessCategory } from "@shared/catalog";
import { explainAsset, statHelp, type StatKey } from "@shared/assetInfo";
import { api } from "@/lib/api";
import { brl, brlCompact, compact, dateBR, isIndex, money, num, pct, quotePrice, relativeTime, timeBR, toneClass } from "@/lib/format";
import { useQuotes } from "@/store/market";
import { useSession, useUserData } from "@/store/session";
import { useAsync } from "@/hooks/useAsync";
import { useNews } from "@/hooks/useMarketData";
import { Badge, Card, ErrorState, LiveDot, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/form";
import { Chart, type HoverInfo, type SeriesSpec } from "@/components/charts/Chart";
import { AssetAvatar, categoryLabel } from "@/components/market";

const RANGES: { value: ChartRange; label: string }[] = [
  { value: "1D", label: "1D" },
  { value: "5D", label: "5D" },
  { value: "1M", label: "1M" },
  { value: "6M", label: "6M" },
  { value: "1A", label: "1A" },
  { value: "5A", label: "5A" },
  { value: "MAX", label: "Máx" },
];

function HelpLabel({ label, help, open, onToggle, className }: { label: string; help: string; open: boolean; onToggle: () => void; className?: string }) {
  return (
    <button type="button" onClick={onToggle} title={help} aria-expanded={open} className={clsx("inline-flex items-center gap-1 text-left text-muted hover:text-fg transition", className)}>
      {label}
      <CircleHelp size={13} className={clsx("shrink-0 transition", open ? "text-primary" : "opacity-50")} />
    </button>
  );
}

function HelpText({ open, text }: { open: boolean; text: string }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
          <div className="pt-1.5 text-[12.5px] leading-snug text-muted">{text}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StatItem({ label, value, help }: { label: string; value: React.ReactNode; help: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-2.5 border-b border-line/[0.07]">
      <div className="flex items-center justify-between gap-3">
        <HelpLabel label={label} help={help} open={open} onToggle={() => setOpen((o) => !o)} className="text-[13.5px]" />
        <span className="font-semibold tabular text-[14px] text-right">{value}</span>
      </div>
      <HelpText open={open} text={help} />
    </div>
  );
}

function RangeBar({ low, high, value, label, help, format }: { low: number; high: number; value: number; label: string; help: string; format: (v: number) => string }) {
  const [open, setOpen] = useState(false);
  const pos = high > low ? Math.max(0, Math.min(1, (value - low) / (high - low))) : 0.5;
  return (
    <div className="py-3">
      <div className="flex justify-between gap-3 text-[12.5px] text-muted">
        <HelpLabel label={label} help={help} open={open} onToggle={() => setOpen((o) => !o)} />
        <span className="tabular">
          {format(low)} – {format(high)}
        </span>
      </div>
      <HelpText open={open} text={help} />
      <div className="relative mt-2 h-1.5 rounded-full bg-gradient-to-r from-danger/50 via-warning/50 to-success/50">
        <motion.div className="absolute -top-[5px] h-4 w-4 rounded-full bg-white shadow ring-2 ring-primary" initial={{ left: "50%" }} animate={{ left: `calc(${pos * 100}% - 8px)` }} />
      </div>
    </div>
  );
}

function insights(q: Quote): string[] {
  const out: string[] = [];
  if (q.fiftyDayAverage) {
    const d = ((q.price - q.fiftyDayAverage) / q.fiftyDayAverage) * 100;
    if (d <= -5) out.push(`Está ${num(Math.abs(d), 1)}% abaixo da média dos últimos 50 dias — mais barato que o normal recente. Pode ser oportunidade se os fundamentos continuam bons.`);
    else if (d >= 5) out.push(`Está ${num(d, 1)}% acima da média de 50 dias — subiu bastante recentemente. Cuidado para não comprar no impulso.`);
    else out.push(`Está perto da média dos últimos 50 dias (${pct(d, 1)}), sem distorções fortes de preço.`);
  }
  if (q.fiftyTwoWeekHigh && q.fiftyTwoWeekLow) {
    const pos = (q.price - q.fiftyTwoWeekLow) / (q.fiftyTwoWeekHigh - q.fiftyTwoWeekLow || 1);
    if (pos > 0.9) out.push("Negocia perto da máxima das últimas 52 semanas.");
    else if (pos < 0.1) out.push("Negocia perto da mínima das últimas 52 semanas.");
  }
  if (q.pe) {
    if (q.pe < 0) out.push("A empresa teve prejuízo nos últimos 12 meses (P/L negativo).");
    else if (q.pe < 8) out.push(`P/L de ${num(q.pe, 1)}: o preço equivale a cerca de ${num(q.pe, 0)} anos de lucro — baixo. Pode indicar ação barata ou desconfiança do mercado.`);
    else if (q.pe > 25) out.push(`P/L de ${num(q.pe, 1)}: o mercado paga caro pelo lucro atual, apostando em crescimento.`);
  }
  if (q.dividendYield && q.dividendYield >= 6) out.push(`Dividend yield de ${num(q.dividendYield, 1)}% nos últimos 12 meses — bom pagador de proventos. Confira se é recorrente.`);
  if (q.priceToBook && q.priceToBook < 1) out.push(`P/VP de ${num(q.priceToBook)}: o mercado avalia abaixo do patrimônio contábil.`);
  return out;
}

function AboutAsset({ symbol, category, name, currency, price, usdBrl }: { symbol: string; category: AssetCategory; name?: string; currency: string; price?: number; usdBrl?: number }) {
  const info = explainAsset(symbol, category, name, currency);
  const rate = currency === "USD" && category !== "indices" ? usdBrl : undefined;
  const conversions = info.conversions ?? (rate ? [{ label: info.unit ?? "em reais", factor: 1 }] : []);
  return (
    <Card>
      <SectionTitle title="O que é isso?" subtitle={`${displaySymbol(symbol)} · ${categoryLabel(category)}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-[14px] leading-relaxed">{info.what}</p>
          {info.tips.length > 0 && (
            <ul className="mt-3 space-y-2">
              {info.tips.map((t) => (
                <li key={t} className="flex gap-2 text-[13.5px] text-muted">
                  <Lightbulb size={15} className="text-warning shrink-0 mt-0.5" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl bg-line/[0.05] p-4">
          <div className="text-[11.5px] font-semibold uppercase tracking-wider text-muted mb-1.5">Como ler o preço</div>
          <p className="text-[14px] leading-relaxed">{info.price}</p>
          {rate && price !== undefined && conversions.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2 mt-3">
                {conversions.map((c) => (
                  <span key={c.label} className="rounded-xl bg-surface border border-line/10 px-3 py-1.5 text-[13px]">
                    <span className="font-semibold tabular">≈ {brl(price * rate * c.factor)}</span> <span className="text-muted">{c.label}</span>
                  </span>
                ))}
              </div>
              <div className="text-[12px] text-muted mt-2">Convertido com o dólar a {brl(rate)}.</div>
            </>
          )}
          <p className="text-[13px] text-muted mt-3 leading-snug">
            <span className="font-semibold text-fg">Variação:</span> quanto o preço subiu ou caiu desde o último fechamento (no 1D) ou desde o começo do período escolhido no gráfico.
          </p>
        </div>
      </div>
    </Card>
  );
}

export function Ativo() {
  const { symbol: raw } = useParams();
  const symbol = decodeURIComponent(raw ?? "");
  const navigate = useNavigate();
  const settings = useUserData("settings");
  const portfolio = useUserData("portfolio");
  const update = useSession((s) => s.update);
  const quotes = useQuotes([symbol, "USDBRL=X"]);
  const q = quotes[symbol];
  const [range, setRange] = useState<ChartRange>("1D");
  const [mode, setMode] = useState<"linha" | "candles">("linha");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const chart = useAsync(`chart:${symbol}:${range}`, () => api.market.chart(symbol, range), { refreshMs: range === "1D" ? 30_000 : range === "5D" ? 120_000 : undefined, staleMs: range === "1D" ? 25_000 : 120_000 });
  const news = useNews();
  const category = catalogAsset(symbol)?.category ?? guessCategory(symbol);
  const favorite = settings.favorites.includes(symbol);
  const holding = portfolio.find((h) => h.symbol === symbol);
  const currency = q?.currency ?? chart.data?.currency ?? "BRL";

  const pts = useMemo(() => {
    const p = chart.data?.points ?? [];
    if (!q || !p.length || range !== "1D" || chart.data?.lastSession) return p;
    const last = p[p.length - 1];
    return last.close === q.price ? p : [...p.slice(0, -1), { ...last, close: q.price, high: Math.max(last.high, q.price), low: Math.min(last.low, q.price) }];
  }, [chart.data, q, range]);

  const base = range === "1D" ? chart.data?.previousClose ?? q?.previousClose : pts[0]?.close;
  const lastPrice = q?.price ?? pts[pts.length - 1]?.close;
  const up = base !== undefined && lastPrice !== undefined ? lastPrice >= base : true;
  const color = up ? "#34D399" : "#F87171";

  const series = useMemo<SeriesSpec[]>(() => {
    if (!pts.length) return [];
    const main: SeriesSpec = mode === "candles" ? { kind: "candles", id: "price", data: pts } : { kind: "area", id: "price", color, data: pts.map((p) => ({ time: p.time, value: p.close })) };
    return isIndex(symbol) || symbol.endsWith("=X") ? [main] : [main, { kind: "volume", data: pts }];
  }, [pts, mode, color, symbol]);

  const fmt = useCallback((v: number) => (isIndex(symbol) ? num(v, 0) : num(v, symbol.endsWith("=X") ? 4 : 2)), [symbol]);

  const shownPrice = hover?.values.price ?? lastPrice;
  const change = shownPrice !== undefined && base ? shownPrice - base : q?.change ?? 0;
  const changePct = shownPrice !== undefined && base ? (change / base) * 100 : q?.changePercent ?? 0;
  const relatedNews = (news.data ?? []).filter((n) => {
    const name = (q?.name ?? catalogAsset(symbol)?.name ?? "").split(/[\s(]/)[0];
    const ticker = displaySymbol(symbol);
    return n.title.includes(ticker) || (name.length >= 4 && n.title.toLowerCase().includes(name.toLowerCase()));
  });
  const fx = currency !== "BRL" && !isIndex(symbol) ? quotes[`${currency}BRL=X`]?.price : undefined;
  const unit = category === "indices" ? undefined : explainAsset(symbol, category, q?.name, currency).unit;
  const priceText = (v: number | undefined) => (v === undefined ? "—" : quotePrice({ symbol, price: v, currency }));
  const help = (k: StatKey) => statHelp(k, category);

  return (
    <div>
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-[14px] text-muted hover:text-fg mb-4">
        <ArrowLeft size={16} /> Voltar
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-4 min-w-0">
          <AssetAvatar symbol={symbol} category={category} size={56} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-[28px] font-bold tracking-tight">{displaySymbol(symbol)}</h1>
              <Badge tone="primary">{categoryLabel(category)}</Badge>
              {q?.exchange && <Badge>{q.exchange}</Badge>}
            </div>
            <div className="text-muted truncate">{q?.name ?? catalogAsset(symbol)?.name ?? "Carregando…"}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={favorite ? "secondary" : "outline"}
            icon={Star}
            onClick={() => update("settings", (s) => ({ ...s, favorites: favorite ? s.favorites.filter((x) => x !== symbol) : [...s.favorites, symbol] }))}
            className={favorite ? "text-warning" : ""}
          >
            {favorite ? "Favorito" : "Favoritar"}
          </Button>
          <Button variant="secondary" icon={Bell} onClick={() => navigate(`/alertas?novo=${encodeURIComponent(symbol)}`)}>
            Criar alerta
          </Button>
          <Button variant="secondary" icon={Gamepad2} onClick={() => navigate(`/simulador?ativo=${encodeURIComponent(symbol)}`)}>
            Simular
          </Button>
          <Button icon={Sparkles} onClick={() => navigate(`/assistente?modo=mercado&q=${encodeURIComponent(`Analise ${displaySymbol(symbol)} para mim com os dados de hoje. Vale a pena investir considerando meu perfil?`)}`)}>
            Perguntar à IA
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card padded={false} className="lg:col-span-2 overflow-hidden">
          <div className="p-5 pb-2 flex flex-wrap items-end justify-between gap-3">
            <div>
              {shownPrice !== undefined ? (
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-[36px] font-bold tracking-tight tabular leading-none">{quotePrice({ symbol, price: shownPrice, currency })}</span>
                  {unit && <span className="text-[14px] font-medium text-muted">{unit}</span>}
                </div>
              ) : (
                <Skeleton className="h-9 w-48" />
              )}
              <div className="flex flex-wrap items-center gap-2 mt-2 text-[14px]">
                <span className={clsx("font-semibold tabular", toneClass(changePct))}>
                  {change >= 0 ? "+" : ""}
                  {fmt(change)} ({pct(changePct)})
                </span>
                <span className="text-muted">
                  {hover
                    ? chart.data?.intraday
                      ? `${dateBR(hover.time * 1000, { day: "2-digit", month: "short" })} ${timeBR(hover.time * 1000)}`
                      : dateBR(hover.time * 1000, { day: "2-digit", month: "short", year: "numeric" })
                    : range === "1D"
                      ? chart.data?.lastSession
                        ? "no último pregão"
                        : "hoje"
                      : `em ${RANGES.find((r) => r.value === range)?.label}`}
                </span>
                {fx && shownPrice !== undefined && !hover && <span className="text-muted">≈ {brl(shownPrice * fx)}</span>}
              </div>
              {q && !hover && (
                <div className="flex items-center gap-1.5 text-[12px] text-muted mt-1.5">
                  <LiveDot /> {q.marketState === "REGULAR" ? "Mercado aberto" : "Último preço"} · {relativeTime(q.time)}
                  {q.delayMinutes ? ` · atraso de ${q.delayMinutes} min` : ""}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "linha", label: "", icon: ChartLine },
                  { value: "candles", label: "", icon: ChartCandlestick },
                ]}
              />
              <SegmentedControl size="sm" value={range} onChange={setRange} options={RANGES} />
            </div>
          </div>
          <div className="px-2 pb-3">
            {chart.loading && !chart.data ? (
              <Skeleton className="h-[360px] mx-3" />
            ) : chart.error && !chart.data ? (
              <div className="p-4">
                <ErrorState message={chart.error} onRetry={chart.reload} />
              </div>
            ) : series.length ? (
              <Chart series={series} height={360} intraday={chart.data?.intraday} baseline={range === "1D" ? base : undefined} formatter={fmt} onHover={setHover} />
            ) : (
              <div className="h-[360px] flex items-center justify-center text-muted">Sem dados para este período.</div>
            )}
          </div>
        </Card>

        <Card>
          <SectionTitle title="Estatísticas" />
          {q ? (
            <div>
              {q.open ? <StatItem label="Abertura" value={priceText(q.open)} help={help("open")} /> : null}
              <StatItem label="Fechamento anterior" value={priceText(q.previousClose)} help={help("prevClose")} />
              {q.dayLow && q.dayHigh ? <StatItem label="Mínima / máxima do dia" value={`${fmt(q.dayLow)} – ${fmt(q.dayHigh)}`} help={help("dayRange")} /> : null}
              {q.volume ? <StatItem label="Volume" value={category === "cripto" ? `US$ ${compact(q.volume)}` : compact(q.volume)} help={help("volume")} /> : null}
              {q.fiftyTwoWeekLow && q.fiftyTwoWeekHigh ? <RangeBar low={q.fiftyTwoWeekLow} high={q.fiftyTwoWeekHigh} value={q.price} label="Faixa de 52 semanas" help={help("range52")} format={fmt} /> : null}
              {q.fiftyDayAverage ? <StatItem label="Média de 50 dias" value={priceText(q.fiftyDayAverage)} help={help("ma50")} /> : null}
              {q.twoHundredDayAverage ? <StatItem label="Média de 200 dias" value={priceText(q.twoHundredDayAverage)} help={help("ma200")} /> : null}
              {q.pe ? <StatItem label="P/L" value={num(q.pe, 2)} help={help("pe")} /> : null}
              {q.priceToBook ? <StatItem label="P/VP" value={num(q.priceToBook, 2)} help={help("pb")} /> : null}
              {q.dividendYield ? <StatItem label="Dividend yield (12m)" value={`${num(q.dividendYield)}%`} help={help("dy")} /> : null}
              {q.eps ? <StatItem label="Lucro por ação" value={money(q.eps, currency)} help={help("eps")} /> : null}
              {q.marketCap ? <StatItem label="Valor de mercado" value={currency === "BRL" ? brlCompact(q.marketCap) : `${currency} ${compact(q.marketCap)}`} help={help("mcap")} /> : null}
            </div>
          ) : (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-6" />
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <AboutAsset symbol={symbol} category={category} name={catalogAsset(symbol)?.name ?? q?.name} currency={currency} price={lastPrice} usdBrl={quotes["USDBRL=X"]?.price} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mt-4">
        <Card className="lg:col-span-2">
          <SectionTitle title="O que os números dizem" subtitle="Leitura educativa com os dados de agora" />
          {q ? (
            <ul className="space-y-2.5">
              {insights(q).map((t, i) => (
                <li key={i} className="flex gap-2.5 text-[14px]">
                  <Sparkles size={16} className="text-primary shrink-0 mt-0.5" />
                  <span>{t}</span>
                </li>
              ))}
              {insights(q).length === 0 && <li className="text-muted text-[14px]">Sem destaques especiais neste momento.</li>}
            </ul>
          ) : (
            <Skeleton className="h-20" />
          )}
          {relatedNews.length > 0 && (
            <div className="mt-5">
              <div className="text-[13px] font-semibold text-muted mb-2">Notícias relacionadas</div>
              {relatedNews.slice(0, 4).map((n) => (
                <button key={n.id} onClick={() => void api.openExternal(n.link)} className="block w-full text-left py-2 border-t border-line/[0.07] hover:text-primary">
                  <div className="text-[14px] font-medium">{n.title}</div>
                  <div className="text-[12px] text-muted">
                    {n.source} · {relativeTime(n.publishedAt)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <SectionTitle title="Na sua carteira" />
          {holding && q ? (
            (() => {
              const rate = currency === "BRL" ? 1 : fx ?? 1;
              const value = (holding.quantity ?? 0) * q.price * rate;
              const invested = (holding.quantity ?? 0) * (holding.avgPrice ?? 0) * rate;
              const g = value - invested;
              return (
                <div data-private="">
                  <div className="text-[28px] font-bold tabular">{brl(value)}</div>
                  <div className={clsx("tabular font-semibold", toneClass(g))}>
                    {g >= 0 ? "+" : ""}
                    {brl(g)} ({pct(invested ? (g / invested) * 100 : 0)})
                  </div>
                  <div className="text-[13px] text-muted mt-2">
                    {num(holding.quantity, 0)} cotas · preço médio {money(holding.avgPrice, currency)}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="text-[14px] text-muted">
              Você não tem {displaySymbol(symbol)} na carteira.
              <Button className="mt-3" block variant="secondary" onClick={() => navigate("/carteira?novo=1")}>
                Adicionar à carteira
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
