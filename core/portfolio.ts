import type { ChartRange, Holding, PortfolioHistoryPoint, Quote } from "@shared/types";
import { annualRate, ratesFromIndicators } from "@shared/finance";
import { getChart, getQuotes } from "./yahoo";
import { getIndicators } from "./bcb";

const DAY = 86_400_000;

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function fxFor(currency: string, quotes: Record<string, Quote>): number {
  if (!currency || currency === "BRL") return 1;
  const pair = quotes[`${currency}BRL=X`];
  return pair?.price ?? 1;
}

export function fixedHoldingValue(h: Holding, annualPct: number, at = Date.now()): number {
  const amount = h.amount ?? 0;
  const start = Date.parse(h.purchaseDate);
  if (!Number.isFinite(start) || at < start) return at < start ? 0 : amount;
  const days = (at - start) / DAY;
  return amount * Math.pow(1 + annualPct / 100, days / 365);
}

export async function portfolioHistory(holdings: Holding[], range: ChartRange): Promise<PortfolioHistoryPoint[]> {
  if (!holdings.length) return [];
  const ind = await getIndicators().catch(() => undefined);
  const rates = ratesFromIndicators(ind);
  const variable = holdings.filter((h) => h.kind === "variavel" && h.symbol && h.quantity);
  const fixed = holdings.filter((h) => h.kind === "fixa" && h.amount);
  const symbols = [...new Set(variable.map((h) => h.symbol!))];

  const chartRange: ChartRange = range === "1M" || range === "6M" ? "6M" : range === "5A" || range === "MAX" ? "5A" : "1A";
  const charts = await Promise.all(symbols.map((s) => getChart(s, chartRange).catch(() => null)));
  const quotes = await getQuotes([...symbols, "USDBRL=X", "EURBRL=X"]).catch(() => ({}) as Record<string, Quote>);

  const series = new Map<string, { currency: string; byDay: Map<string, number> }>();
  const allDays = new Set<string>();
  charts.forEach((c, i) => {
    if (!c) return;
    const byDay = new Map<string, number>();
    for (const p of c.points) {
      const k = dayKey(p.time * 1000);
      byDay.set(k, p.close);
      allDays.add(k);
    }
    series.set(symbols[i], { currency: c.currency, byDay });
  });

  const now = Date.now();
  const spanDays = range === "1M" ? 31 : range === "6M" ? 183 : range === "1A" ? 366 : 365 * 5;
  const startMs = now - spanDays * DAY;
  if (!allDays.size) {
    for (let t = startMs; t <= now; t += DAY) allDays.add(dayKey(t));
  }
  const days = [...allDays].filter((d) => Date.parse(d) >= startMs - DAY).sort();

  const last = new Map<string, number>();
  for (const [sym, s] of series) {
    const before = [...s.byDay.entries()].filter(([d]) => Date.parse(d) < startMs).sort(([a], [b]) => a.localeCompare(b));
    if (before.length) last.set(sym, before[before.length - 1][1]);
  }

  const points: PortfolioHistoryPoint[] = [];
  for (const d of days) {
    const t = Date.parse(d);
    let value = 0;
    let invested = 0;
    for (const [sym, s] of series) {
      const close = s.byDay.get(d);
      if (close !== undefined) last.set(sym, close);
    }
    for (const h of variable) {
      if (Date.parse(h.purchaseDate) > t + DAY) continue;
      const s = series.get(h.symbol!);
      const close = last.get(h.symbol!);
      const fx = fxFor(s?.currency ?? "BRL", quotes);
      invested += (h.quantity ?? 0) * (h.avgPrice ?? 0) * fx;
      value += (h.quantity ?? 0) * (close ?? h.avgPrice ?? 0) * fx;
    }
    for (const h of fixed) {
      if (Date.parse(h.purchaseDate) > t + DAY) continue;
      const annual = annualRate(h.rateType ?? "cdi", h.rate ?? 100, rates);
      invested += h.amount ?? 0;
      value += fixedHoldingValue(h, annual, t);
    }
    if (value > 0 || invested > 0) points.push({ time: Math.floor(t / 1000), value, invested });
  }

  let liveValue = 0;
  let liveInvested = 0;
  for (const h of variable) {
    const q = quotes[h.symbol!];
    const fx = fxFor(q?.currency ?? series.get(h.symbol!)?.currency ?? "BRL", quotes);
    liveInvested += (h.quantity ?? 0) * (h.avgPrice ?? 0) * fx;
    liveValue += (h.quantity ?? 0) * (q?.price ?? last.get(h.symbol!) ?? h.avgPrice ?? 0) * fx;
  }
  for (const h of fixed) {
    liveInvested += h.amount ?? 0;
    liveValue += fixedHoldingValue(h, annualRate(h.rateType ?? "cdi", h.rate ?? 100, rates), now);
  }
  const nowSec = Math.floor(now / 1000);
  const lastPoint = points[points.length - 1];
  if (lastPoint && nowSec - lastPoint.time < 86_400) points[points.length - 1] = { time: lastPoint.time, value: liveValue, invested: liveInvested };
  else points.push({ time: nowSec, value: liveValue, invested: liveInvested });
  return points;
}
