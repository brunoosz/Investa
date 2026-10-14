import type { Indicators, TesouroData, WealthStyle } from "./types";
import { irRate, savingsAnnual } from "./finance";

/**
 * Conta do "Meu plano": juros compostos mês a mês com as taxas reais de hoje
 * (Banco Central, Boletim Focus e Tesouro Direto), IR de cada depósito e
 * inflação, para mostrar o valor no futuro e em dinheiro de hoje.
 */

export type PlanProduct = "cdi" | "ipca" | "acoes" | "poupanca" | "parado";

export const PLAN_PRODUCTS: Record<PlanProduct, { label: string; short: string }> = {
  cdi: { label: "Tesouro Selic ou CDB 100% do CDI", short: "Tesouro Selic / CDB" },
  ipca: { label: "Tesouro IPCA+", short: "Tesouro IPCA+" },
  acoes: { label: "Ações e fundos imobiliários", short: "Ações e FIIs" },
  poupanca: { label: "Poupança", short: "Poupança" },
  parado: { label: "Dinheiro parado, sem render", short: "Parado na gaveta" },
};

/** Ações e FIIs não têm taxa: a conta supõe este ganho acima da inflação por ano (premissa conservadora). */
export const STOCKS_REAL = 4;
/** Taxa de custódia da B3 no Tesouro Direto (% a.a.), descontada do Tesouro IPCA+. */
export const TESOURO_CUSTODY = 0.2;
/** Sem conexão com o Banco Central ou o Tesouro, para a tela não ficar vazia. */
const FALLBACK = { cdi: 10, ipca: 4, ipcaReal: 6 };
const MARKS = [100, 1_000, 10_000, 50_000, 100_000, 500_000, 1_000_000];

export interface FocusPoint {
  year: number;
  value: number;
}

export interface PlanAssumption {
  label: string;
  value: string;
  source: string;
  /** Data do dado, já formatada (DD/MM/AAAA ou mês/ano). */
  date?: string;
}

export interface PlanMarket {
  /** Taxa anual (%) usada em cada mês do plano; o índice 0 é o mês que começa hoje. */
  cdi: number[];
  ipca: number[];
  poupanca: number[];
  /** Juro acima da inflação do Tesouro IPCA+ escolhido. */
  ipcaReal: number;
  ipcaTitle?: string;
  ipcaTitleDate?: string;
  /** false = sem dados do Banco Central (usa estimativas). */
  live: boolean;
  cdiNow: number;
  cdiDate?: string;
  ipcaNow: number;
  ipcaDate?: string;
  focusDate?: string;
  selicPath: FocusPoint[];
  ipcaPath: FocusPoint[];
  assumptions: PlanAssumption[];
  start: Date;
}

export interface PlanPart {
  product: PlanProduct;
  /** Fração do dinheiro (0 a 1). */
  weight: number;
}

export interface PlanAllocation {
  parts: PlanPart[];
  why: string;
}

export interface PlanPoint {
  month: number;
  invested: number;
  /** Valor no futuro, já descontado o IR se resgatar nesse mês. */
  value: number;
  /** O mesmo valor em dinheiro de hoje (descontada a inflação). */
  real: number;
}

export interface PlanResult {
  months: number;
  invested: number;
  gross: number;
  tax: number;
  net: number;
  real: number;
  /** Taxas equivalentes (% a.a.) para os mesmos depósitos: antes do IR, já sem IR e acima da inflação. */
  grossRate: number;
  netRate: number;
  realRate: number;
  /** Inflação média no período (% a.a.). */
  inflation: number;
  points: PlanPoint[];
  milestones: { value: number; month: number }[];
}

export interface PlanCompareRow {
  product: PlanProduct;
  /** Média anual antes do IR (%). */
  rate: number;
  net: number;
  real: number;
  note: string;
}

export interface PlanWhy {
  title: string;
  /** Pode ter mais de um parágrafo, separados por "\n". */
  text: string;
}

const moneyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moneyRound = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** R$ com centavos até R$ 1.000; acima disso, sem centavos (fica mais fácil de ler). */
export function planMoney(v: number): string {
  return Math.abs(v) >= 1000 ? moneyRound.format(v) : moneyFmt.format(v);
}

export function planPct(v: number, digits = 2): string {
  return `${v.toFixed(digits).replace(".", ",")}%`;
}

function brDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d ? `${d}/${m}/${y}` : undefined;
}

function monthLabel(iso?: string): string | undefined {
  if (!iso) return undefined;
  const [y, m] = iso.split("-").map(Number);
  return m ? `${MONTHS[m - 1]}/${y}` : undefined;
}

/** Mês/ano daqui a n meses ("out/2041"). */
export function planEndLabel(start: Date, months: number): string {
  const d = new Date(start.getFullYear(), start.getMonth() + months, 1);
  return `${MONTHS[d.getMonth()]}/${d.getFullYear()}`;
}

function pathValue(path: FocusPoint[], year: number): number {
  let v = path[0].value;
  for (const p of path) if (p.year <= year) v = p.value;
  return v;
}

function interpolate(anchors: { m: number; v: number }[], m: number): number {
  for (let k = 1; k < anchors.length; k++) {
    const a = anchors[k - 1];
    const b = anchors[k];
    if (m < b.m) return a.v + ((b.v - a.v) * (m - a.m)) / (b.m - a.m);
  }
  return anchors[anchors.length - 1].v;
}

function pickIpcaTitle(td: TesouroData | null | undefined, targetYear: number) {
  const all = (td?.titles ?? []).filter((t) => t.indexer === "IPCA" && (t.buyRate ?? 0) > 0 && (t.buyRate ?? 0) < 20);
  const plain = all.filter((t) => /^Tesouro IPCA\+ \d{4}$/i.test(t.name.trim()));
  const list = plain.length ? plain : all;
  const buyable = list.filter((t) => t.canBuy);
  const pool = buyable.length ? buyable : list;
  const dist = (t: { maturity: string }) => Math.abs(Number(t.maturity.slice(0, 4)) - targetYear);
  return [...pool].sort((a, b) => dist(a) - dist(b))[0];
}

/** Taxas de cada mês do plano, a partir dos dados reais de hoje, com a fonte de cada uma. */
export function planMarket(ind: Indicators | null | undefined, td: TesouroData | null | undefined, years: number, now = new Date()): PlanMarket {
  const n = Math.max(12, Math.round(years * 12));
  const live = !!(ind?.cdi || ind?.selic);
  const cdiNow = ind?.cdi?.value ?? (ind?.selic ? ind.selic.value - 0.1 : FALLBACK.cdi);
  const selicNow = ind?.selic?.value ?? cdiNow + 0.1;
  // O CDI costuma ficar 0,10 ponto abaixo da Selic meta.
  const spread = Math.min(0.5, Math.max(0, selicNow - cdiNow));
  const focus = ind?.focus;
  const selicPath = (focus?.selicPath ?? []).filter((p) => p.value > 0 && p.value < 50).sort((a, b) => a.year - b.year);
  const ipcaPath = (focus?.ipcaPath ?? []).filter((p) => p.value > -5 && p.value < 50).sort((a, b) => a.year - b.year);
  const ipcaNow = ind?.ipca12m?.value ?? ipcaPath[0]?.value ?? FALLBACK.ipca;
  const y0 = now.getFullYear();
  const m0 = now.getMonth();

  // CDI: começa no de hoje e vai, em linha reta, até a Selic que o mercado espera no fim de cada ano.
  const anchors = [{ m: 0, v: cdiNow }];
  for (const p of selicPath) {
    const m = (p.year - y0) * 12 + 12 - m0;
    if (m > anchors[anchors.length - 1].m) anchors.push({ m, v: p.value - spread });
  }
  const cdi: number[] = [];
  const ipca: number[] = [];
  const poupanca: number[] = [];
  for (let m = 0; m < n; m++) {
    const c = interpolate(anchors, m);
    cdi.push(c);
    // Primeiro ano: inflação dos últimos 12 meses; depois, o que o Focus espera para cada ano.
    ipca.push(m < 12 || !ipcaPath.length ? ipcaNow : pathValue(ipcaPath, new Date(y0, m0 + m, 1).getFullYear()));
    // TR de hoje só no primeiro ano; depois, zero (conservador).
    poupanca.push(savingsAnnual(c + spread, m < 12 ? ind?.tr?.value ?? 0 : 0));
  }

  const title = pickIpcaTitle(td, y0 + Math.round(years));
  const ipcaReal = title?.buyRate ?? FALLBACK.ipcaReal;
  const tdDate = brDate(td?.updatedAt);

  const assumptions: PlanAssumption[] = [];
  if (live) {
    if (ind?.selic) assumptions.push({ label: "Selic (meta)", value: `${planPct(ind.selic.value)} a.a.`, source: "Banco Central", date: brDate(ind.selic.date) });
    assumptions.push({ label: "CDI", value: `${planPct(cdiNow)} a.a.`, source: "Banco Central", date: brDate(ind?.cdi?.date ?? ind?.selic?.date) });
  } else {
    assumptions.push({ label: "CDI", value: `${planPct(FALLBACK.cdi, 0)} a.a.`, source: "Estimativa do app (sem conexão com o Banco Central)" });
  }
  if (ind?.ipca12m) assumptions.push({ label: "IPCA em 12 meses", value: planPct(ind.ipca12m.value), source: "IBGE, via Banco Central", date: monthLabel(ind.ipca12m.date) });
  else assumptions.push({ label: "Inflação", value: `${planPct(ipcaNow, 1)} a.a.`, source: ipcaPath.length ? "Boletim Focus" : "Estimativa do app (sem conexão com o Banco Central)" });
  const pathText = (path: FocusPoint[]) => `${path.map((p) => `${p.year}: ${planPct(p.value)}`).join(" · ")}; depois, mantém o último`;
  if (selicPath.length) assumptions.push({ label: "Selic esperada no fim de cada ano", value: pathText(selicPath), source: "Boletim Focus, Banco Central", date: brDate(focus?.date) });
  else if (live) assumptions.push({ label: "Selic nos próximos anos", value: "igual à de hoje", source: "Sem Boletim Focus agora: a conta supõe que não muda" });
  if (ipcaPath.length) assumptions.push({ label: "IPCA esperado para cada ano", value: pathText(ipcaPath), source: "Boletim Focus, Banco Central", date: brDate(focus?.date) });
  assumptions.push(
    title
      ? { label: title.name, value: `IPCA + ${planPct(ipcaReal)} a.a.`, source: "Tesouro Direto, taxa de compra", date: tdDate }
      : { label: "Tesouro IPCA+", value: `IPCA + ${planPct(ipcaReal, 0)} a.a.`, source: "Estimativa do app (Tesouro Direto fora do ar)" }
  );
  assumptions.push({ label: "Taxa da B3 (custódia)", value: `${planPct(TESOURO_CUSTODY)} a.a. no Tesouro IPCA+`, source: "B3. CDB não tem; Tesouro Selic é isento até R$ 10 mil" });
  assumptions.push({
    label: "Poupança",
    value: selicNow > 8.5 ? "0,5% ao mês + TR (Selic acima de 8,5%)" : "70% da Selic + TR",
    source: "Regra oficial da poupança",
  });
  assumptions.push({ label: "Ações e FIIs", value: `IPCA + ${STOCKS_REAL}% a.a.`, source: "Premissa do app: média conservadora para 10 anos ou mais, não é garantia" });
  assumptions.push({ label: "Imposto de Renda", value: "Renda fixa: 22,5% a 15% do lucro, cai com o tempo. Ações: 15% do lucro", source: "Receita Federal" });

  return {
    cdi,
    ipca,
    poupanca,
    ipcaReal,
    ipcaTitle: title?.name,
    ipcaTitleDate: tdDate,
    live,
    cdiNow,
    cdiDate: brDate(ind?.cdi?.date ?? ind?.selic?.date),
    ipcaNow,
    ipcaDate: monthLabel(ind?.ipca12m?.date),
    focusDate: brDate(focus?.date),
    selicPath,
    ipcaPath,
    assumptions,
    start: now,
  };
}

/** Onde o dinheiro fica em cada estilo, e por quê. */
export function planAllocation(style: WealthStyle, years: number, goal = ""): PlanAllocation {
  const styleName = style === "seguro" ? "Seguro" : style === "equilibrado" ? "Equilibrado" : "Crescimento";
  if (/reserva|emerg[êe]ncia/i.test(goal)) {
    return { parts: [{ product: "cdi", weight: 1 }], why: "Reserva de emergência precisa estar à mão a qualquer dia e sem risco de cair: fica toda no Tesouro Selic ou num CDB com liquidez diária que paga 100% do CDI." };
  }
  if (years < 3) {
    return {
      parts: [{ product: "cdi", weight: 1 }],
      why: `Prazo curto (menos de 3 anos): mesmo no estilo ${styleName}, o dinheiro fica no Tesouro Selic ou CDB com liquidez diária. Ações podem estar em queda justo quando você precisar.`,
    };
  }
  if (style === "seguro") return { parts: [{ product: "cdi", weight: 1 }], why: "Estilo Seguro: tudo no Tesouro Selic ou CDB que paga 100% do CDI. Rende um pouco todo dia e quase não oscila." };
  if (style === "equilibrado") {
    return {
      parts: [
        { product: "cdi", weight: 0.5 },
        { product: "ipca", weight: 0.3 },
        { product: "acoes", weight: 0.2 },
      ],
      why: "Estilo Equilibrado: metade no Tesouro Selic ou CDB (segurança e liquidez), 30% no Tesouro IPCA+ (garante um ganho acima da inflação) e 20% em ações e fundos imobiliários (crescem mais em muitos anos, mas oscilam).",
    };
  }
  return {
    parts: [
      { product: "cdi", weight: 0.25 },
      { product: "ipca", weight: 0.25 },
      { product: "acoes", weight: 0.5 },
    ],
    why: "Estilo Crescimento: metade em ações e fundos imobiliários, pensando em muitos anos, e a outra metade dividida entre Tesouro Selic/CDB e Tesouro IPCA+ para segurar as quedas.",
  };
}

function productRates(p: PlanProduct, mk: PlanMarket): number[] {
  const plus = (real: number) => mk.ipca.map((i) => ((1 + i / 100) * (1 + real / 100) - 1) * 100);
  switch (p) {
    case "cdi":
      return mk.cdi;
    case "poupanca":
      return mk.poupanca;
    case "parado":
      return mk.cdi.map(() => 0);
    case "ipca":
      return plus(mk.ipcaReal).map((r) => r - TESOURO_CUSTODY);
    case "acoes":
      return plus(STOCKS_REAL);
  }
}

/** Alíquota de IR (0 a 1) sobre o lucro de um depósito que ficou `age` meses aplicado. */
function taxFor(p: PlanProduct): (age: number) => number {
  if (p === "cdi" || p === "ipca") return (age) => irRate(Math.round((age * 365) / 12)) / 100;
  // Ações: 15% do lucro na venda (conservador; vendas de ações até R$ 20 mil no mês são isentas).
  if (p === "acoes") return () => 0.15;
  return () => 0;
}

function growth(rates: number[]): number[] {
  const g = [1];
  for (const r of rates) g.push(g[g.length - 1] * Math.pow(1 + r / 100, 1 / 12));
  return g;
}

/**
 * `start` entra hoje; `monthly` entra no começo de cada mês (o primeiro hoje).
 * O IR é calculado depósito a depósito, pela idade de cada um no mês do resgate.
 */
function simulate(rates: number[], start: number, monthly: number, tax: (age: number) => number): { gross: number[]; net: number[] } {
  const n = rates.length;
  const g = growth(rates);
  const s = [0];
  for (let j = 0; j < n; j++) s.push(s[j] + 1 / g[j]);
  const longTax = tax(600);
  const gross: number[] = [];
  const net: number[] = [];
  for (let t = 0; t <= n; t++) {
    const value = start * g[t] + monthly * g[t] * s[t];
    let due = tax(t) * start * (g[t] - 1);
    // Depósitos com 24 meses ou mais já estão na menor alíquota: soma todos de uma vez.
    const cut = t - 23;
    if (cut > 0) due += longTax * monthly * (g[t] * s[cut] - cut);
    for (let j = Math.max(0, cut); j < t; j++) due += tax(t - j) * monthly * (g[t] / g[j] - 1);
    gross.push(value);
    net.push(value - Math.max(0, due));
  }
  return { gross, net };
}

function fvConstant(start: number, monthly: number, annual: number, n: number): number {
  const f = Math.pow(1 + annual / 100, 1 / 12);
  if (Math.abs(f - 1) < 1e-12) return start + monthly * n;
  const fn = Math.pow(f, n);
  return start * fn + (monthly * f * (fn - 1)) / (f - 1);
}

/** Taxa anual constante que, com os mesmos depósitos, chega ao mesmo valor. */
function equivalentRate(start: number, monthly: number, n: number, target: number): number {
  if (start + monthly * n <= 0) return 0;
  let lo = -99;
  let hi = 200;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (fvConstant(start, monthly, mid, n) < target) lo = mid;
    else hi = mid;
  }
  const r = (lo + hi) / 2;
  return Math.abs(r) < 1e-6 ? 0 : r;
}

function annualAverage(index: number, n: number): number {
  return (Math.pow(index, 12 / n) - 1) * 100;
}

/** Projeção mês a mês de uma carteira (mistura de produtos) com o mercado de `planMarket`. */
export function projectPlan(start: number, monthly: number, parts: PlanPart[], mk: PlanMarket): PlanResult {
  const n = mk.cdi.length;
  const sims = parts.map((p) => ({ w: p.weight, ...simulate(productRates(p.product, mk), start, monthly, taxFor(p.product)) }));
  const infl = growth(mk.ipca);
  const points: PlanPoint[] = [];
  const milestones: { value: number; month: number }[] = [];
  for (let t = 0; t <= n; t++) {
    const value = sims.reduce((acc, x) => acc + x.w * x.net[t], 0);
    points.push({ month: t, invested: start + monthly * t, value, real: value / infl[t] });
    for (const mark of MARKS) if (value >= mark && start < mark && !milestones.some((x) => x.value === mark)) milestones.push({ value: mark, month: t });
  }
  const gross = sims.reduce((acc, x) => acc + x.w * x.gross[n], 0);
  const net = points[n].value;
  const inflation = annualAverage(infl[n], n);
  const netRate = equivalentRate(start, monthly, n, net);
  return {
    months: n,
    invested: start + monthly * n,
    gross,
    tax: gross - net,
    net,
    real: points[n].real,
    grossRate: equivalentRate(start, monthly, n, gross),
    netRate,
    realRate: ((1 + netRate / 100) / (1 + inflation / 100) - 1) * 100,
    inflation,
    points,
    milestones,
  };
}

/**
 * Rendimento médio anual antes do IR. Com depósitos, é a taxa equivalente para eles
 * (quem deposita mais tarde pega mais os anos de juro menor); sem depósitos, a média simples do período.
 */
function productRate(p: PlanProduct, start: number, monthly: number, mk: PlanMarket): number {
  if (start + monthly > 0) return projectPlan(start, monthly, [{ product: p, weight: 1 }], mk).grossRate;
  return annualAverage(growth(productRates(p, mk))[mk.cdi.length], mk.cdi.length);
}

/** Quanto guardar por mês, começando hoje, para ter `target` daqui a `months` meses no Tesouro Selic ou CDB 100% do CDI, já sem IR. */
export function planMonthlyFor(target: number, months: number, mk: PlanMarket): number {
  const n = Math.max(1, Math.min(mk.cdi.length, Math.round(months)));
  // O valor final é proporcional ao depósito: basta ver quanto R$ 1 por mês vira.
  const perOne = projectPlan(0, 1, [{ product: "cdi", weight: 1 }], mk).points[n].value;
  return target / (perOne > 0 ? perOne : n);
}

/** A conta inteira numa frase: quanto sai do bolso, quanto vira e quanto vale em dinheiro de hoje. */
export function planSummary(start: number, monthly: number, res: PlanResult, mk: PlanMarket): string {
  if (res.invested <= 0) return "Coloque quanto já tem ou quanto vai guardar por mês para ver a conta.";
  const m = planMoney;
  const pocket =
    monthly > 0
      ? `${m(monthly)} por mês × ${res.months} meses${start > 0 ? ` + ${m(start)} de início` : ""} = ${m(res.invested)} do seu bolso.`
      : `${m(start)} uma vez só, sem depósitos mensais.`;
  return `${pocket} Rendendo ~${planPct(res.netRate, 1)} ao ano já sem IR, vira ${m(res.net)} em ${planEndLabel(mk.start, res.months)}. Com a inflação de ~${planPct(res.inflation, 1)} ao ano, isso compra o mesmo que ${m(res.real)} hoje.`;
}

/** O mesmo dinheiro em cada lugar, para comparar. */
export function compareProducts(start: number, monthly: number, mk: PlanMarket): PlanCompareRow[] {
  const notes: Record<PlanProduct, string> = {
    parado: "Não rende nada",
    poupanca: "Isenta de IR",
    cdi: "Liquidez diária, IR de 22,5% a 15%",
    ipca: `${mk.ipcaTitle ? `${mk.ipcaTitle}, IPCA + ${planPct(mk.ipcaReal)}` : `IPCA + ${planPct(mk.ipcaReal, 0)}`}, menos ${planPct(TESOURO_CUSTODY)} da B3`,
    acoes: `Premissa: IPCA + ${STOCKS_REAL}%, oscila`,
  };
  return (["parado", "poupanca", "cdi", "ipca", "acoes"] as PlanProduct[]).map((product) => {
    const r = projectPlan(start, monthly, [{ product, weight: 1 }], mk);
    return { product, rate: start + monthly > 0 ? r.grossRate : productRate(product, 0, 0, mk), net: r.net, real: r.real, note: notes[product] };
  });
}

/** O "por quê" de cada número, em passos curtos. */
export function explainPlan(start: number, monthly: number, alloc: PlanAllocation, mk: PlanMarket, res: PlanResult, compare?: PlanCompareRow[]): PlanWhy[] {
  const n = res.months;
  const years = n / 12;
  const yearsText = Number.isInteger(years) ? `${years} ${years === 1 ? "ano" : "anos"}` : `${years.toFixed(1).replace(".", ",")} anos`;
  const end = planEndLabel(mk.start, n);
  const y0 = mk.start.getFullYear();
  const endYear = new Date(y0, mk.start.getMonth() + n, 1).getFullYear();
  const m = planMoney;
  const out: PlanWhy[] = [];

  let pocket: string;
  if (monthly > 0 && start > 0) pocket = `${m(monthly)} por mês × ${n} meses (${yearsText}) = ${m(monthly * n)}, mais ${m(start)} que você já tem: ${m(res.invested)} no total.`;
  else if (monthly > 0) pocket = `${m(monthly)} por mês × ${n} meses (${yearsText}) = ${m(res.invested)}.`;
  else if (start > 0) pocket = `${m(start)} uma vez só, hoje. Sem depósitos mensais: tudo o que passar disso vem dos juros.`;
  else pocket = "Ainda nada. Coloque quanto já tem ou quanto vai guardar por mês para ver a conta.";
  out.push({ title: "Quanto sai do seu bolso", text: pocket });
  out.push({ title: "Onde o dinheiro fica", text: alloc.why });

  const avg = (p: PlanProduct) => productRate(p, start, monthly, mk);
  const lines: string[] = [];
  for (const part of alloc.parts) {
    if (part.product === "cdi") {
      let t = mk.live ? `O CDI de hoje é ${planPct(mk.cdiNow)} ao ano (Banco Central${mk.cdiDate ? `, ${mk.cdiDate}` : ""}).` : `Sem conexão com o Banco Central, a conta usa CDI de ${planPct(mk.cdiNow, 0)} ao ano.`;
      // O ano corrente costuma repetir a Selic de hoje: mostra do próximo até o fim do prazo.
      const path = mk.selicPath.filter((p) => p.year > y0 && p.year <= endYear);
      if (path.length) {
        const first = path[0];
        const last = path[path.length - 1];
        const exp = last.year !== first.year ? `${planPct(first.value)} no fim de ${first.year} e ${planPct(last.value)} no fim de ${last.year}` : `${planPct(first.value)} no fim de ${first.year}`;
        t += ` O mercado espera a Selic em ${exp} (Boletim Focus${mk.focusDate ? `, ${mk.focusDate}` : ""})${last.year < endYear ? "; depois, a conta mantém esse valor" : ""}.`;
      } else if (mk.live && !mk.selicPath.length) t += " A conta supõe que ele fica assim.";
      t += ` Na média do seu prazo, ~${planPct(avg("cdi"), 1)} ao ano.`;
      lines.push(t);
    } else if (part.product === "ipca") {
      lines.push(
        `${mk.ipcaTitle ? `O ${mk.ipcaTitle} paga hoje` : "O Tesouro IPCA+ paga cerca de"} IPCA + ${planPct(mk.ipcaReal)} ao ano${mk.ipcaTitle ? ` (Tesouro Direto${mk.ipcaTitleDate ? `, ${mk.ipcaTitleDate}` : ""})` : ""}: ganha da inflação por contrato. Somando a inflação esperada e tirando a taxa de ${planPct(TESOURO_CUSTODY)} ao ano da B3, ~${planPct(avg("ipca"), 1)} ao ano.`
      );
    } else if (part.product === "acoes") {
      lines.push(`Ações e FIIs não têm taxa garantida: a conta usa inflação + ${STOCKS_REAL}% ao ano (~${planPct(avg("acoes"), 1)}), uma média conservadora para quem fica 10 anos ou mais. No caminho, sobem e caem bastante.`);
    }
  }
  const stocks = alloc.parts.some((p) => p.product === "acoes");
  if (stocks && avg("acoes") < avg("cdi")) {
    lines.push("Por que a parte em ações não aumenta a conta? Hoje a renda fixa no Brasil paga juros altos, acima dessa média. Ações entram para diversificar e, em muitos anos, podem render mais (ou menos).");
  }
  if (alloc.parts.length > 1) {
    const mix = alloc.parts.map((p) => `${Math.round(p.weight * 100)}% ${PLAN_PRODUCTS[p.product].short}`).join(", ");
    lines.push(`Juntando tudo (${mix}), a carteira rende ~${planPct(res.grossRate, 1)} ao ano antes do IR.`);
  }
  out.push({ title: "Quanto rende por ano", text: lines.join("\n") });

  if (res.tax >= 0.01) {
    const fixed = alloc.parts.some((p) => p.product === "cdi" || p.product === "ipca");
    let t = `O Imposto de Renda fica com ${m(res.tax)} do lucro.`;
    if (fixed) t += " Na renda fixa, a alíquota cai com o tempo que cada depósito fica aplicado: 22,5% até 6 meses, 20% até 1 ano, 17,5% até 2 anos e 15% depois disso.";
    if (stocks) t += " Nas ações, a conta tira 15% do lucro na venda (vendas de até R$ 20 mil por mês são isentas, então pode ser menos).";
    t += ` Já sem IR, rende ~${planPct(res.netRate, 1)} ao ano.`;
    out.push({ title: "Imposto de Renda", text: t });
  }

  if (res.invested > 0) {
    out.push({ title: "Resultado", text: `Os ${m(res.invested)} viram ~${m(res.net)} em ${end}, já sem IR: ${m(Math.max(0, res.net - res.invested))} são juros.` });
    const last = mk.ipcaPath.filter((p) => p.year > y0 && p.year <= endYear).pop();
    let src = mk.ipcaDate ? `A inflação (IPCA) dos últimos 12 meses foi ${planPct(mk.ipcaNow)} (IBGE, ${mk.ipcaDate})` : `A conta usa inflação de ${planPct(mk.ipcaNow, 1)} ao ano`;
    if (last && n > 12) src += ` e o mercado espera ${planPct(last.value)} em ${last.year} (Focus)`;
    out.push({
      title: "Inflação",
      text: `Os preços também sobem, ~${planPct(res.inflation, 1)} ao ano em média. ${src}. Por isso, ${m(res.net)} em ${end} compram o mesmo que ~${m(res.real)} hoje.`,
    });
    const parado = compare?.find((c) => c.product === "parado");
    let t =
      res.realRate >= 0.05
        ? `Seu dinheiro cresce ~${planPct(res.realRate, 1)} ao ano acima da inflação.`
        : res.realRate > -0.05
          ? "Seu dinheiro só empata com a inflação."
          : `Seu dinheiro perde ~${planPct(-res.realRate, 1)} ao ano para a inflação.`;
    if (parado) t += ` Parados na gaveta, os mesmos ${m(res.invested)} valeriam ~${m(parado.real)} de hoje.`;
    t += monthly > 0 ? " O que mais faz diferença é aumentar o valor mensal quando puder." : " Somar um valor por mês, mesmo pequeno, faz muita diferença.";
    out.push({ title: "Em resumo", text: t });
  }
  return out;
}

/** Linhas da evolução (1, 2, 3, 5, 10… anos e o fim do prazo). */
export function planTable(res: PlanResult, start: Date): { label: string; when: string; point: PlanPoint }[] {
  const years = [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50].filter((y) => y * 12 < res.months);
  const months = [...years.map((y) => y * 12), res.months];
  return months.map((mo) => ({
    label: mo % 12 === 0 ? `${mo / 12} ${mo === 12 ? "ano" : "anos"}` : `${mo} meses`,
    when: planEndLabel(start, mo),
    point: res.points[mo],
  }));
}

/** Todos os números do plano em Markdown, para a IA e para o PDF. */
export function planBrief(start: number, monthly: number, alloc: PlanAllocation, mk: PlanMarket, res: PlanResult, compare: PlanCompareRow[], why: PlanWhy[]): string {
  const m = planMoney;
  const rows = planTable(res, mk.start)
    .map((r) => `| ${r.label} (${r.when}) | ${m(r.point.invested)} | ${m(r.point.value)} | ${m(r.point.real)} |`)
    .join("\n");
  const cmp = compare.map((c) => `| ${PLAN_PRODUCTS[c.product].label} | ~${planPct(c.rate, 1)} a.a. | ${m(c.net)} | ${m(c.real)} |`).join("\n");
  const src = mk.assumptions.map((a) => `- **${a.label}:** ${a.value} (${a.source}${a.date ? `, ${a.date}` : ""})`).join("\n");
  return `### Resumo
${planSummary(start, monthly, res, mk)}

- Depósito inicial (uma vez só): ${m(start)}
- Depósito mensal: ${monthly > 0 ? `${m(monthly)} por ${res.months} meses` : "nenhum"}
- Total que sai do bolso: ${m(res.invested)}
- Valor no fim (${planEndLabel(mk.start, res.months)}), já sem IR: ${m(res.net)}
- Em dinheiro de hoje (descontada a inflação): ${m(res.real)}
- Rendimento médio: ~${planPct(res.grossRate, 1)} a.a. antes do IR, ~${planPct(res.netRate, 1)} a.a. sem IR, ~${planPct(res.realRate, 1)} a.a. acima da inflação
- Carteira: ${alloc.parts.map((p) => `${Math.round(p.weight * 100)}% ${PLAN_PRODUCTS[p.product].label}`).join(", ")}

### Por que esses números
${why.map((w, i) => `${i + 1}. **${w.title}:** ${w.text.replace(/\n/g, " ")}`).join("\n")}

### Evolução
| Quando | Você colocou | Valor (sem IR) | Em dinheiro de hoje |
|---|---|---|---|
${rows}

### E se fosse em outro lugar?
| Onde | Rende (média) | Valor (sem IR) | Em dinheiro de hoje |
|---|---|---|---|
${cmp}

### Premissas e fontes
${src}

Estimativa com os dados de hoje, não é garantia de rentabilidade.`;
}
