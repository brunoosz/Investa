import type { AssetCategory, Holding, Indicators, Quote } from "@shared/types";
import { annualRate, irRate, isTaxExempt, ratesFromIndicators, type Rates } from "@shared/finance";
import { CATEGORIES } from "@shared/catalog";

export function fx(currency: string | undefined, quotes: Record<string, Quote>): number {
  if (!currency || currency === "BRL") return 1;
  return quotes[`${currency}BRL=X`]?.price ?? (currency === "USD" ? quotes["USDBRL=X"]?.price ?? 0 : 0);
}

export interface HoldingView {
  holding: Holding;
  price?: number;
  currency: string;
  value: number;
  invested: number;
  gain: number;
  gainPct: number;
  dayChange: number;
  dayChangePct: number;
  annualRate?: number;
  netValue?: number;
}

export function viewHolding(h: Holding, quotes: Record<string, Quote>, rates: Rates, now = Date.now()): HoldingView {
  if (h.kind === "variavel" && h.symbol) {
    const q = quotes[h.symbol];
    const currency = q?.currency ?? (h.symbol.endsWith(".SA") ? "BRL" : "USD");
    const rate = fx(currency, quotes) || 1;
    const qty = h.quantity ?? 0;
    const price = q?.price ?? h.avgPrice ?? 0;
    const invested = qty * (h.avgPrice ?? 0) * rate;
    const value = qty * price * rate;
    const dayChange = q ? qty * q.change * rate : 0;
    return {
      holding: h,
      price: q?.price,
      currency,
      value,
      invested,
      gain: value - invested,
      gainPct: invested ? ((value - invested) / invested) * 100 : 0,
      dayChange,
      dayChangePct: q?.changePercent ?? 0,
    };
  }
  const amount = h.amount ?? 0;
  const start = Date.parse(h.purchaseDate);
  const days = Number.isFinite(start) ? Math.max(0, (now - start) / 86_400_000) : 0;
  const annual = h.fixedType === "poupanca" ? 0 : annualRate(h.rateType ?? "cdi", h.rate ?? 100, rates);
  const value = amount * Math.pow(1 + annual / 100, days / 365);
  const gain = value - amount;
  const tax = h.fixedType && isTaxExempt(h.fixedType) ? 0 : Math.max(0, gain) * (irRate(days) / 100);
  const daily = amount ? value * (Math.pow(1 + annual / 100, 1 / 365) - 1) : 0;
  return {
    holding: h,
    currency: "BRL",
    value,
    invested: amount,
    gain,
    gainPct: amount ? (gain / amount) * 100 : 0,
    dayChange: daily,
    dayChangePct: value ? (daily / value) * 100 : 0,
    annualRate: annual,
    netValue: value - tax,
  };
}

export interface PortfolioSummary {
  views: HoldingView[];
  value: number;
  invested: number;
  gain: number;
  gainPct: number;
  dayChange: number;
  dayChangePct: number;
  byCategory: { category: AssetCategory; label: string; value: number }[];
  byInstitution: { institution: string; value: number }[];
}

export function summarize(holdings: Holding[], quotes: Record<string, Quote>, indicators?: Indicators | null): PortfolioSummary {
  const rates = ratesFromIndicators(indicators);
  const views = holdings.map((h) => viewHolding(h, quotes, rates));
  const value = views.reduce((s, v) => s + v.value, 0);
  const invested = views.reduce((s, v) => s + v.invested, 0);
  const dayChange = views.reduce((s, v) => s + v.dayChange, 0);
  const cat = new Map<AssetCategory, number>();
  const inst = new Map<string, number>();
  for (const v of views) {
    cat.set(v.holding.category, (cat.get(v.holding.category) ?? 0) + v.value);
    const key = v.holding.institution || "Não informado";
    inst.set(key, (inst.get(key) ?? 0) + v.value);
  }
  return {
    views,
    value,
    invested,
    gain: value - invested,
    gainPct: invested ? ((value - invested) / invested) * 100 : 0,
    dayChange,
    dayChangePct: value - dayChange ? (dayChange / (value - dayChange)) * 100 : 0,
    byCategory: [...cat.entries()]
      .map(([category, v]) => ({ category, label: CATEGORIES.find((c) => c.id === category)?.label ?? category, value: v }))
      .sort((a, b) => b.value - a.value),
    byInstitution: [...inst.entries()].map(([institution, v]) => ({ institution, value: v })).sort((a, b) => b.value - a.value),
  };
}

export const CATEGORY_COLORS: Record<AssetCategory, string> = {
  acoes: "#4F8CFF",
  fiis: "#34D399",
  etfs: "#A78BFA",
  bdrs: "#22D3EE",
  rendafixa: "#FBBF24",
  tesouro: "#F59E0B",
  cripto: "#F472B6",
  moedas: "#94A3B8",
  indices: "#6366F1",
  commodities: "#FB923C",
  exterior: "#0EA5E9",
};
