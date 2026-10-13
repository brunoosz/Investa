import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowUpRight, Flame, GraduationCap, Plus, Target, Wallet } from "lucide-react";
import type { ChartRange } from "@shared/types";
import { displaySymbol } from "@shared/catalog";
import { pendingFor, currentYm, monthBudget, weekSummary, projectGoal, ratesFromIndicators, summarizeMonth, localIsoDate } from "@shared/finance";
import { institutionLabel } from "@shared/banks";
import clsx from "clsx";
import { levelFor, nextLesson, TOTAL_LESSONS } from "@shared/learning";
import { api } from "@/lib/api";
import { brl, dateBR, firstName, greeting, num, pct, quotePrice, relativeTime, toneClass } from "@/lib/format";
import { CATEGORY_COLORS, summarize } from "@/lib/portfolio";
import { iconFor } from "@/lib/icons";
import { useQuotes } from "@/store/market";
import { useSession, useUserData } from "@/store/session";
import { useAsync } from "@/hooks/useAsync";
import { useIndicators, useNews } from "@/hooks/useMarketData";
import { AnimatedNumber, Card, ErrorState, LiveDot, Private, ProgressBar, ProgressRing, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/form";
import { Chart, type HoverInfo, type SeriesSpec } from "@/components/charts/Chart";
import { Donut, Legend } from "@/components/charts/small";
import { AssetAvatar, ChangePill } from "@/components/market";
import { NextDatesLine } from "@/components/MonthCalendar";
import { BestActionCard } from "@/components/BestActionCard";

function todayLabel(): string {
  const s = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function marketOpen(): boolean {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const d = now.getDay();
  const m = now.getHours() * 60 + now.getMinutes();
  return d > 0 && d < 6 && m >= 600 && m < 1075;
}

/** Resumo dos últimos 7 dias: quanto saiu, comparação e o que vence. */
function WeekCard() {
  const expenses = useUserData("expenses");
  const bills = useUserData("bills");
  const today = localIsoDate();
  const w = useMemo(() => weekSummary(expenses, bills, today), [expenses, bills, today]);
  const diff = w.previous ? Math.round(((w.spent - w.previous) / w.previous) * 100) : null;
  return (
    <Card>
      <SectionTitle title="Sua semana" subtitle="Últimos 7 dias" action={<Link to="/gastos" className="text-[13px] text-primary font-medium">Gastos</Link>} />
      <div className="text-[26px] font-bold tabular" data-private="">
        {brl(w.spent)}
      </div>
      <div className="text-[13px] text-muted">
        {diff === null ? "gastos lançados na semana" : `${diff >= 0 ? "+" : ""}${diff}% em relação à semana anterior`}
        {w.topCategory ? ` · mais em ${w.topCategory.category}` : ""}
      </div>
      {w.dueSoon.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {w.dueSoon.slice(0, 3).map((d) => (
            <div key={d.name + d.date} className="flex justify-between text-[13.5px]">
              <span className="truncate">
                {d.name} <span className="text-muted">· {dateBR(d.date, { day: "2-digit", month: "short" })}</span>
              </span>
              <Private className="tabular font-medium shrink-0 ml-2">{brl(d.amount)}</Private>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-[13px] text-muted">Nenhuma conta fixa vence nos próximos 7 dias.</div>
      )}
      <NextDatesLine />
    </Card>
  );
}

/** Sem investimentos: o dinheiro de hoje vem do saldo dos bancos e do disponível do mês. */
function MoneyTodayCard() {
  const accounts = useUserData("accounts").filter((a) => !a.cardOnly);
  const expenses = useUserData("expenses");
  const invoices = useUserData("invoices");
  const bills = useUserData("bills");
  const planned = useUserData("planned");
  const boxes = useUserData("boxes");
  const profile = useUserData("profile");
  const navigate = useNavigate();
  const ym = currentYm();
  const budget = useMemo(
    () => monthBudget(summarizeMonth(expenses, ym, profile.salary, profile.extraIncome), invoices, ym, new Date(), pendingFor(bills, planned, ym, boxes)),
    [expenses, invoices, bills, planned, boxes, ym, profile.salary, profile.extraIncome]
  );
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  return (
    <Card className="lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[13px] text-muted font-medium">Seu dinheiro hoje</div>
          <div className="text-[34px] font-bold tracking-tight mt-0.5 tabular" data-private="">
            {accounts.length ? brl(total) : "—"}
          </div>
          <div className="text-[13.5px] text-muted mt-0.5">
            {accounts.length ? `em ${accounts.length} ${accounts.length === 1 ? "conta" : "contas"} · ainda sem investimentos` : "Informe o saldo dos seus bancos para acompanhar aqui."}
          </div>
        </div>
        <div className="rounded-2xl bg-line/[0.05] px-4 py-3 min-w-[180px]">
          <div className="text-[12.5px] text-muted">Disponível para gastar no mês</div>
          <div className={clsx("text-[20px] font-bold tabular", budget.available >= 0 ? "text-success" : "text-danger")} data-private="">
            {brl(budget.available)}
          </div>
          {budget.perDay !== undefined && budget.available > 0 && (
            <div className="text-[12px] text-muted">
              <Private>{brl(budget.perDay)}</Private> por dia
            </div>
          )}
        </div>
      </div>
      {accounts.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {accounts.map((a) => (
            <span key={a.id} className="rounded-full bg-line/[0.06] px-3 py-1 text-[13px]">
              {institutionLabel(a.institution)} <Private className="tabular font-medium">{brl(a.balance)}</Private>
            </span>
          ))}
        </div>
      )}
      <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/[0.06] p-4">
        <div className="font-semibold">Comece a investir, nem que seja com R$ 1</div>
        <div className="text-[13.5px] text-muted mt-0.5">O gráfico do patrimônio começa no primeiro investimento. As aulas explicam do zero por onde começar.</div>
        <div className="flex flex-wrap gap-2 mt-3">
          <Button size="sm" icon={Plus} onClick={() => navigate("/carteira?novo=1")}>
            Adicionar investimento
          </Button>
          <Button size="sm" variant="secondary" icon={Wallet} onClick={() => navigate("/carteira")}>
            {accounts.length ? "Atualizar saldos" : "Informar saldo dos bancos"}
          </Button>
          <Button size="sm" variant="secondary" icon={GraduationCap} onClick={() => navigate("/aulas")}>
            Ir para as aulas
          </Button>
        </div>
      </div>
    </Card>
  );
}

function PatrimonyCard() {
  const portfolio = useUserData("portfolio");
  const accountsTotal = useUserData("accounts").reduce((s, a) => s + a.balance, 0);
  const { data: ind } = useIndicators();
  const symbols = useMemo(() => [...portfolio.filter((h) => h.symbol).map((h) => h.symbol!), "USDBRL=X", "EURBRL=X"], [portfolio]);
  const quotes = useQuotes(symbols);
  const summary = useMemo(() => summarize(portfolio, quotes, ind), [portfolio, quotes, ind]);
  const [range, setRange] = useState<ChartRange>("6M");
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const histKey = portfolio.length ? `phist:${range}:${portfolio.map((h) => `${h.id}${h.quantity}${h.amount}${h.avgPrice}`).join(",")}` : null;
  const hist = useAsync(histKey, () => api.portfolioHistory(range, portfolio), { staleMs: 5 * 60_000 });

  const series = useMemo<SeriesSpec[]>(() => {
    const pts = hist.data ?? [];
    return [
      { kind: "area", id: "value", color: "#4F8CFF", data: pts.map((p) => ({ time: p.time, value: p.value })) },
      { kind: "line", id: "invested", color: "#94A3B8", dashed: true, width: 1, data: pts.map((p) => ({ time: p.time, value: p.invested })) },
    ];
  }, [hist.data]);
  const fmt = useCallback((v: number) => brl(v), []);

  if (!portfolio.length) return <MoneyTodayCard />;

  const shown = hover?.values.value ?? summary.value;
  const shownInvested = hover?.values.invested ?? summary.invested;
  const diff = shown - shownInvested;

  return (
    <Card className="lg:col-span-2" padded={false}>
      <div className="p-5 pb-0 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[13px] text-muted font-medium">{hover ? dateBR(hover.time * 1000, { day: "2-digit", month: "short", year: "numeric" }) : "Seu patrimônio"}</div>
          <div className="text-[34px] font-bold tracking-tight mt-0.5">
            <AnimatedNumber value={shown} format={brl} private />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] mt-0.5">
            {!hover && (
              <span className={toneClass(summary.dayChange)}>
                <Private>
                  {summary.dayChange >= 0 ? "+" : ""}
                  {brl(summary.dayChange)} ({pct(summary.dayChangePct)})
                </Private>{" "}
                hoje
              </span>
            )}
            <span className={toneClass(diff)}>
              <Private>
                {diff >= 0 ? "+" : ""}
                {brl(diff)}
                {hover ? "" : ` (${pct(summary.gainPct)})`}
              </Private>{" "}
              {hover ? "sobre o investido" : "no total"}
            </span>
          </div>
          {!hover && accountsTotal !== 0 && (
            <div className="text-[13px] text-muted mt-1">
              + <Private>{brl(accountsTotal)}</Private> nos bancos · total <Private className="text-fg font-semibold tabular">{brl(summary.value + accountsTotal)}</Private>
            </div>
          )}
        </div>
        <SegmentedControl<ChartRange>
          size="sm"
          value={range}
          onChange={setRange}
          options={[
            { value: "1M", label: "1M" },
            { value: "6M", label: "6M" },
            { value: "1A", label: "1A" },
            { value: "5A", label: "5A" },
          ]}
        />
      </div>
      <div className="px-2 pt-2 pb-3">
        {hist.loading && !hist.data ? (
          <Skeleton className="h-[260px] mx-3 my-2" />
        ) : hist.error && !hist.data ? (
          <div className="p-4">
            <ErrorState message={hist.error} onRetry={hist.reload} />
          </div>
        ) : (
          <Private block>
            <Chart series={series} height={260} formatter={fmt} onHover={setHover} />
          </Private>
        )}
      </div>
      <div className="flex items-center gap-4 px-5 pb-4 text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary" /> Valor da carteira
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-px w-4 border-t border-dashed border-muted" /> Total investido
        </span>
      </div>
    </Card>
  );
}

function AllocationCard() {
  const portfolio = useUserData("portfolio");
  const { data: ind } = useIndicators();
  const quotes = useQuotes(useMemo(() => [...portfolio.filter((h) => h.symbol).map((h) => h.symbol!), "USDBRL=X"], [portfolio]));
  const summary = useMemo(() => summarize(portfolio, quotes, ind), [portfolio, quotes, ind]);
  const data = summary.byCategory.map((c) => ({ label: c.label, value: c.value, color: CATEGORY_COLORS[c.category] }));
  return (
    <Card>
      <SectionTitle title="Onde está seu dinheiro" />
      {data.length ? (
        <div className="flex flex-col items-center gap-5">
          <Donut
            data={data}
            size={170}
            center={
              <div>
                <div className="text-[12px] text-muted">{data.length} classes</div>
                <div className="text-[15px] font-bold" data-private="">
                  {brl(summary.value).replace(/,\d+$/, "")}
                </div>
              </div>
            }
          />
          <div className="w-full">
            <Legend data={data} format={(v) => brl(v).replace(/,\d+$/, "")} private />
          </div>
        </div>
      ) : (
        <div className="text-muted text-[14px] py-8 text-center">Adicione investimentos para ver a divisão da sua carteira.</div>
      )}
    </Card>
  );
}

function LearningCard() {
  const learning = useUserData("learning");
  const navigate = useNavigate();
  const lvl = levelFor(learning.xp);
  const next = nextLesson(learning);
  const done = Object.values(learning.completed).filter((c) => c.approved).length;
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[13px] text-muted font-medium">Sua trilha</div>
          <div className="text-[18px] font-semibold mt-0.5">{lvl.current.name}</div>
        </div>
        {learning.streak.count > 0 && (
          <div className="flex items-center gap-1 text-warning font-semibold text-[13px]">
            <Flame size={16} /> {learning.streak.count} {learning.streak.count === 1 ? "dia" : "dias"}
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 mt-4">
        <ProgressRing value={done / TOTAL_LESSONS} size={64}>
          <span className="text-[13px] font-bold">{Math.round((done / TOTAL_LESSONS) * 100)}%</span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-muted">{next ? "Próxima aula" : "Trilha concluída!"}</div>
          <div className="font-semibold truncate">{next ? next.lesson.title : "Você zerou o Investa"}</div>
          <div className="text-[12.5px] text-muted">{num(learning.xp, 0)} XP · {done}/{TOTAL_LESSONS} aulas</div>
        </div>
      </div>
      <Button className="mt-4" block variant="secondary" icon={GraduationCap} onClick={() => navigate(next ? `/aula/${next.lesson.id}` : "/aulas")}>
        {done ? "Continuar" : "Começar a aprender"}
      </Button>
    </Card>
  );
}

function GoalsCard() {
  const goals = useUserData("goals");
  const { data: ind } = useIndicators();
  const rates = ratesFromIndicators(ind);
  const navigate = useNavigate();
  return (
    <Card>
      <SectionTitle
        title="Seus objetivos"
        action={
          <Link to="/objetivos" className="text-[13px] text-primary font-semibold">
            Ver todos
          </Link>
        }
      />
      {goals.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-muted text-[14px]">Defina metas e veja quanto investir por mês.</p>
          <Button className="mt-3" variant="secondary" icon={Target} onClick={() => navigate("/objetivos")}>
            Criar meta
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {goals.slice(0, 3).map((g) => {
            const p = projectGoal(g, rates);
            const Icon = iconFor(g.icon);
            return (
              <div key={g.id}>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: `${g.color}22`, color: g.color }}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold truncate">{g.name}</div>
                    <div className="text-[12px] text-muted" data-private="">
                      {brl(p.current)} de {brl(g.target)}
                    </div>
                  </div>
                  <span className="text-[13px] font-semibold tabular">{Math.round(p.progress * 100)}%</span>
                </div>
                <ProgressBar value={p.progress} color={g.color} height={6} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function IndicatorsCard() {
  const { data, loading, error, reload } = useIndicators();
  const quotes = useQuotes(["USDBRL=X", "^BVSP"]);
  const rows = [
    { label: "Selic", value: data?.selic ? `${num(data.selic.value)}%` : undefined, sub: "ao ano" },
    { label: "CDI", value: data?.cdi ? `${num(data.cdi.value)}%` : undefined, sub: "ao ano" },
    { label: "IPCA 12m", value: data?.ipca12m ? `${num(data.ipca12m.value)}%` : undefined, sub: "inflação" },
    { label: "Dólar", value: quotes["USDBRL=X"] ? brl(quotes["USDBRL=X"].price) : data?.dollarPtax ? brl(data.dollarPtax.value) : undefined, sub: quotes["USDBRL=X"] ? pct(quotes["USDBRL=X"].changePercent) : "PTAX", tone: quotes["USDBRL=X"]?.changePercent },
    { label: "Ibovespa", value: quotes["^BVSP"] ? num(quotes["^BVSP"].price, 0) : undefined, sub: quotes["^BVSP"] ? pct(quotes["^BVSP"].changePercent) : "pontos", tone: quotes["^BVSP"]?.changePercent },
  ];
  return (
    <Card>
      <SectionTitle title="Indicadores hoje" subtitle="Banco Central e mercado" />
      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between">
              <span className="text-[14px] text-muted">{r.label}</span>
              <span className="text-right">
                {r.value === undefined && loading ? <Skeleton className="h-4 w-16" /> : <span className="font-semibold tabular text-[15px]">{r.value ?? "—"}</span>}
                <span className={`ml-2 text-[12px] ${r.tone !== undefined ? toneClass(r.tone) : "text-muted"}`}>{r.sub}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function FavoritesCard() {
  const favorites = useUserData("settings").favorites;
  const quotes = useQuotes(favorites);
  const navigate = useNavigate();
  return (
    <Card padded={false}>
      <div className="p-5 pb-2">
        <SectionTitle
          title="Ativos em destaque"
          subtitle="Seus favoritos, em tempo real"
          action={
            <Link to="/mercado" className="text-[13px] text-primary font-semibold">
              Mercado
            </Link>
          }
        />
      </div>
      <div className="pb-2">
        {favorites.slice(0, 6).map((s) => {
          const q = quotes[s];
          return (
            <button key={s} onClick={() => navigate(`/mercado/${encodeURIComponent(s)}`)} className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-line/[0.04] text-left">
              <AssetAvatar symbol={s} size={36} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[14px] truncate">{displaySymbol(s)}</div>
                <div className="text-[12.5px] text-muted truncate">{q?.name ?? "…"}</div>
              </div>
              {/* No celular a variação fica embaixo do preço para sobrar espaço ao nome. */}
              <div className="shrink-0 flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                <div className="text-[14px] font-semibold tabular whitespace-nowrap">{q ? quotePrice(q) : <Skeleton className="h-4 w-16" />}</div>
                <ChangePill value={q?.changePercent} size="sm" />
              </div>
            </button>
          );
        })}
        {favorites.length === 0 && <div className="px-5 pb-4 text-muted text-[14px]">Marque ativos com a estrela no Mercado.</div>}
      </div>
    </Card>
  );
}

function NewsCard() {
  const { data, error, loading, reload } = useNews();
  return (
    <Card padded={false}>
      <div className="p-5 pb-2">
        <SectionTitle title="Notícias do mercado" subtitle="Atualizadas a cada 10 minutos" />
      </div>
      <div className="pb-2">
        {loading && !data && (
          <div className="px-5 space-y-3 pb-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        )}
        {error && !data && (
          <div className="px-5 pb-4">
            <ErrorState message={error} onRetry={reload} />
          </div>
        )}
        {data?.slice(0, 5).map((n) => (
          <button key={n.id} onClick={() => void api.openExternal(n.link)} className="w-full flex gap-3 px-5 py-2.5 hover:bg-line/[0.04] text-left group">
            {n.image ? (
              <img src={n.image} alt="" className="h-12 w-16 rounded-lg object-cover shrink-0 bg-line/10" loading="lazy" />
            ) : (
              <div className="h-12 w-16 rounded-lg bg-primary/10 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium line-clamp-2 break-words group-hover:text-primary transition">{n.title}</div>
              <div className="text-[12px] text-muted mt-0.5 truncate">
                {n.source} · {relativeTime(n.publishedAt)}
              </div>
            </div>
            <ArrowUpRight size={15} className="hidden sm:block text-muted shrink-0 opacity-0 group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </Card>
  );
}

export function Inicio() {
  const user = useSession((s) => s.user)!;
  const open = marketOpen();
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="text-[13px] text-muted font-medium">{todayLabel()}</div>
          <h1 className="text-[30px] md:text-[34px] font-bold tracking-tight">
            {greeting()}, {firstName(user.name)}
          </h1>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-muted rounded-full bg-line/[0.06] border border-line/10 px-3 py-1.5">
          {open ? <LiveDot /> : <span className="h-2 w-2 rounded-full bg-muted/60" />}
          {open ? "B3 aberta · dados em tempo real" : "B3 fechada · últimos preços"}
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <PatrimonyCard />
        <AllocationCard />
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 mt-4">
        <BestActionCard />
        <WeekCard />
        <LearningCard />
        <GoalsCard />
        <IndicatorsCard />
      </div>

      {/* grid-cols-1 (minmax(0, 1fr)): sem isso a coluna cresce até caber o nome
          inteiro do ativo e a variação some fora da tela no celular. */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 mt-4">
        <FavoritesCard />
        <NewsCard />
      </div>
    </div>
  );
}
