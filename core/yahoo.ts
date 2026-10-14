import type { ChartData, ChartPoint, ChartRange, Quote, SearchResult } from "@shared/types";
import { CATALOG, guessCategory } from "@shared/catalog";
import { cached, fetchWithTimeout, getJson, HttpError, mapLimit } from "./http";

const Q1 = "https://query1.finance.yahoo.com";
const Q2 = "https://query2.finance.yahoo.com";

interface YahooSession {
  cookie: string;
  crumb: string;
  at: number;
}

let session: YahooSession | null = null;
let sessionPromise: Promise<YahooSession> | null = null;

async function getSession(force = false): Promise<YahooSession> {
  if (!force && session && Date.now() - session.at < 45 * 60_000) return session;
  if (sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    let cookie = "";
    for (const url of ["https://fc.yahoo.com/", "https://finance.yahoo.com/"]) {
      try {
        const res = await fetchWithTimeout(url, { redirect: "manual" }, 10_000);
        const setCookies = res.headers.getSetCookie?.() ?? (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []);
        cookie = setCookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
        if (cookie) break;
      } catch {
        // tenta a próxima origem
      }
    }
    // No celular os cookies ficam na rede nativa e não aparecem aqui; o crumb
    // funciona mesmo assim, porque a rede nativa envia o cookie sozinha.
    const res = await fetchWithTimeout(`${Q2}/v1/test/getcrumb`, cookie ? { headers: { Cookie: cookie } } : {}, 10_000);
    const crumb = (await res.text()).trim();
    if (!res.ok || !crumb || crumb.length > 40 || crumb.includes("<")) throw new Error("Yahoo Finance: crumb inválido");
    session = { cookie, crumb, at: Date.now() };
    return session;
  })().finally(() => {
    sessionPromise = null;
  });
  return sessionPromise;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function num(v: any): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && typeof v.raw === "number") return v.raw;
  return undefined;
}

function positive(v: any): number | undefined {
  const n = num(v);
  return n !== undefined && n > 0 ? n : undefined;
}

// Grãos, café, açúcar, algodão e boi vêm do Yahoo em centavos (USX); o resto
// do app espera a moeda cheia para converter em reais.
const CENTS: Record<string, string> = { USX: "USD", GBp: "GBP", GBX: "GBP", ZAc: "ZAR", ILA: "ILS" };

const PRICE_FIELDS = ["price", "change", "previousClose", "open", "dayHigh", "dayLow", "fiftyTwoWeekHigh", "fiftyTwoWeekLow", "fiftyDayAverage", "twoHundredDayAverage", "eps"] as const;

function fromCents(q: Quote): Quote {
  const unit = CENTS[q.currency];
  if (!unit) return q;
  const out: Quote = { ...q, currency: unit };
  for (const f of PRICE_FIELDS) if (out[f] !== undefined) out[f] = out[f]! / 100;
  return out;
}

function mapQuote(q: any): Quote | null {
  const price = num(q.regularMarketPrice);
  if (price === undefined || price <= 0) return null;
  const prev = num(q.regularMarketPreviousClose);
  const change = num(q.regularMarketChange) ?? (prev ? price - prev : 0);
  const changePercent = num(q.regularMarketChangePercent) ?? (prev ? ((price - prev) / prev) * 100 : 0);
  const dy = num(q.dividendYield) ?? (num(q.trailingAnnualDividendYield) !== undefined ? num(q.trailingAnnualDividendYield)! * 100 : undefined);
  const time = num(q.regularMarketTime);
  return fromCents({
    symbol: q.symbol,
    name: q.longName || q.shortName || q.displayName || q.symbol,
    price,
    change,
    changePercent,
    previousClose: prev,
    open: positive(q.regularMarketOpen),
    dayHigh: positive(q.regularMarketDayHigh),
    dayLow: positive(q.regularMarketDayLow),
    volume: positive(q.regularMarketVolume),
    fiftyTwoWeekHigh: num(q.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(q.fiftyTwoWeekLow),
    fiftyDayAverage: num(q.fiftyDayAverage),
    twoHundredDayAverage: num(q.twoHundredDayAverage),
    marketCap: num(q.marketCap),
    pe: num(q.trailingPE),
    priceToBook: num(q.priceToBook),
    dividendYield: dy !== undefined && dy > 0 ? dy : undefined,
    eps: num(q.epsTrailingTwelveMonths),
    currency: q.currency || "BRL",
    marketState: q.marketState,
    exchange: q.fullExchangeName || q.exchange,
    delayMinutes: num(q.exchangeDataDelayedBy),
    time: time ? time * 1000 : Date.now(),
  });
}

async function fetchQuoteBatch(symbols: string[]): Promise<Quote[]> {
  const run = async (s: YahooSession) =>
    fetchWithTimeout(
      `${Q2}/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}&crumb=${encodeURIComponent(s.crumb)}&lang=pt-BR&region=BR`,
      { headers: { ...(s.cookie ? { Cookie: s.cookie } : {}), Accept: "application/json" } },
      12_000
    );
  let res = await run(await getSession());
  if (res.status === 401 || res.status === 403) res = await run(await getSession(true));
  if (!res.ok) throw new HttpError(res.status, `${Q2}/v7/finance/quote`);
  const json: any = await res.json();
  const list: any[] = json?.quoteResponse?.result ?? [];
  return list.map(mapQuote).filter((q): q is Quote => q !== null);
}

async function quoteFromChart(symbol: string): Promise<Quote | null> {
  const json: any = await getJson(`${Q1}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m&includePrePost=false`);
  const m = json?.chart?.result?.[0]?.meta;
  if (!m || !m.regularMarketPrice) return null;
  const prev = num(m.chartPreviousClose) ?? num(m.previousClose);
  const price = m.regularMarketPrice as number;
  return fromCents({
    symbol,
    name: m.longName || m.shortName || symbol,
    price,
    change: prev ? price - prev : 0,
    changePercent: prev ? ((price - prev) / prev) * 100 : 0,
    previousClose: prev,
    dayHigh: num(m.regularMarketDayHigh),
    dayLow: num(m.regularMarketDayLow),
    volume: num(m.regularMarketVolume),
    fiftyTwoWeekHigh: num(m.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: num(m.fiftyTwoWeekLow),
    currency: m.currency || "BRL",
    exchange: m.fullExchangeName || m.exchangeName,
    time: m.regularMarketTime ? m.regularMarketTime * 1000 : Date.now(),
  });
}

const quoteCache = new Map<string, { q: Quote; at: number }>();
let batchFailures = 0;

export async function getQuotes(symbols: string[], maxAgeMs = 10_000): Promise<Record<string, Quote>> {
  const unique = [...new Set(symbols.filter(Boolean))];
  const result: Record<string, Quote> = {};
  const missing: string[] = [];
  const now = Date.now();
  for (const s of unique) {
    const c = quoteCache.get(s);
    if (c && now - c.at < maxAgeMs) result[s] = c.q;
    else missing.push(s);
  }
  if (!missing.length) return result;

  let fetched: Quote[] = [];
  const useBatch = batchFailures < 3 || now % 5 === 0;
  if (useBatch) {
    try {
      for (let i = 0; i < missing.length; i += 50) fetched.push(...(await fetchQuoteBatch(missing.slice(i, i + 50))));
      batchFailures = 0;
    } catch {
      batchFailures++;
      fetched = [];
    }
  }
  if (!fetched.length) {
    const viaChart = await mapLimit(missing.slice(0, 80), 6, (s) => quoteFromChart(s).catch(() => null));
    fetched = viaChart.filter((q): q is Quote => q !== null);
  }
  for (const q of fetched) {
    quoteCache.set(q.symbol, { q, at: Date.now() });
    result[q.symbol] = q;
  }
  for (const s of missing) {
    if (!result[s]) {
      const c = quoteCache.get(s);
      if (c) result[s] = c.q;
    }
  }
  if (!Object.keys(result).length) throw new Error("Não foi possível obter cotações agora. Verifique sua conexão com a internet.");
  return result;
}

const RANGES: Record<ChartRange, { range: string; interval: string; ttl: number }> = {
  "1D": { range: "1d", interval: "5m", ttl: 30_000 },
  "5D": { range: "5d", interval: "15m", ttl: 60_000 },
  "1M": { range: "1mo", interval: "60m", ttl: 5 * 60_000 },
  "6M": { range: "6mo", interval: "1d", ttl: 30 * 60_000 },
  "1A": { range: "1y", interval: "1d", ttl: 60 * 60_000 },
  "5A": { range: "5y", interval: "1wk", ttl: 6 * 3600_000 },
  MAX: { range: "max", interval: "1mo", ttl: 12 * 3600_000 },
};

function chartPoints(r: any): ChartPoint[] {
  const ts: number[] = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0] ?? {};
  const byTime = new Map<number, ChartPoint>();
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    if (close == null || !Number.isFinite(close)) continue;
    byTime.set(ts[i], {
      time: ts[i],
      open: q.open?.[i] ?? close,
      high: q.high?.[i] ?? close,
      low: q.low?.[i] ?? close,
      close,
      volume: q.volume?.[i] ?? undefined,
    });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

async function chartResult(symbol: string, range: string, interval: string): Promise<any> {
  const json: any = await getJson(`${Q1}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`);
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(json?.chart?.error?.description || "Sem dados de gráfico");
  return r;
}

export async function getChart(symbol: string, range: ChartRange): Promise<ChartData> {
  const cfg = RANGES[range] ?? RANGES["1M"];
  return cached(`chart:${symbol}:${range}`, cfg.ttl, async () => {
    const r = await chartResult(symbol, cfg.range, cfg.interval);
    const data: ChartData = {
      symbol,
      range,
      currency: r.meta?.currency ?? "BRL",
      previousClose: num(r.meta?.chartPreviousClose) ?? num(r.meta?.previousClose),
      intraday: range === "1D" || range === "5D" || range === "1M",
      points: chartPoints(r),
    };
    // Logo depois da abertura (e com o atraso de 15 min da B3) o pregão do dia
    // ainda não tem pontos: mostra o último pregão completo.
    if (range === "1D" && data.points.length < 2) {
      const week = await chartResult(symbol, "5d", cfg.interval).catch(() => null);
      const offset = num(week?.meta?.gmtoffset) ?? 0;
      const day = (t: number) => Math.floor((t + offset) / 86_400);
      const all = week ? chartPoints(week) : [];
      const last = all.length ? day(all[all.length - 1].time) : undefined;
      const session = all.filter((p) => day(p.time) === last);
      if (session.length >= 2) {
        const before = all.filter((p) => day(p.time) < last!);
        data.points = session;
        data.previousClose = before[before.length - 1]?.close ?? data.previousClose;
        data.lastSession = true;
      }
    }
    const unit = CENTS[data.currency];
    if (unit) {
      data.currency = unit;
      data.previousClose = data.previousClose !== undefined ? data.previousClose / 100 : undefined;
      data.points = data.points.map((p) => ({ ...p, open: p.open / 100, high: p.high / 100, low: p.low / 100, close: p.close / 100 }));
    }
    return data;
  });
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function searchCatalog(query: string): SearchResult[] {
  const q = normalize(query.trim());
  if (!q) return [];
  return CATALOG.filter((a) => normalize(a.symbol).includes(q) || normalize(a.name).includes(q) || (a.label && normalize(a.label).includes(q)))
    .slice(0, 12)
    .map((a) => ({ symbol: a.symbol, name: a.name, type: "CATALOG", exchange: a.symbol.endsWith(".SA") ? "B3" : "", category: a.category }));
}

export async function search(query: string): Promise<SearchResult[]> {
  const local = searchCatalog(query);
  let remote: SearchResult[] = [];
  try {
    const json: any = await getJson(
      `${Q2}/v1/finance/search?q=${encodeURIComponent(query)}&lang=pt-BR&region=BR&quotesCount=15&newsCount=0&listsCount=0&enableFuzzyQuery=false`
    );
    remote = (json?.quotes ?? [])
      .filter((q: any) => q.symbol && !["OPTION", "MUTUALFUND", "MONEYMARKET"].includes(q.quoteType))
      .map((q: any) => ({
        symbol: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        type: q.quoteType,
        exchange: q.exchDisp || q.exchange || "",
        category: guessCategory(q.symbol, q.quoteType),
      }));
  } catch {
    // busca local continua funcionando sem internet
  }
  const seen = new Set<string>();
  const merged = [...local, ...remote.sort((a, b) => Number(b.symbol.endsWith(".SA")) - Number(a.symbol.endsWith(".SA")))];
  return merged.filter((r) => (seen.has(r.symbol) ? false : (seen.add(r.symbol), true))).slice(0, 20);
}
