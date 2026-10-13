import type { AllocationType, BankAccount, Expense, FinancialProfile, FixedType, Goal, GoalAllocation, IncomeKind, Indicators, Invoice, Bill, PlannedExpense, PlanStep, RateType, SavingBox } from "./types";
import { institutionLabel } from "./banks";

export interface Rates {
  cdi: number;
  selic: number;
  ipca12m: number;
}

export const FALLBACK_RATES: Rates = { cdi: 0, selic: 0, ipca12m: 0 };

export function ratesFromIndicators(ind?: Indicators | null): Rates {
  return {
    cdi: ind?.cdi?.value ?? ind?.selic?.value ?? 0,
    selic: ind?.selic?.value ?? ind?.cdi?.value ?? 0,
    ipca12m: ind?.ipca12m?.value ?? 0,
  };
}

/** Taxa anual (em %) de um produto, com base nos indicadores atuais. */
export function annualRate(rateType: RateType, rate: number, r: Rates): number {
  switch (rateType) {
    case "cdi":
      return (rate / 100) * r.cdi;
    case "selic":
      return r.selic + rate;
    case "ipca":
      return ((1 + r.ipca12m / 100) * (1 + rate / 100) - 1) * 100;
    case "pre":
    case "variavel":
      return rate;
  }
}

/** Alíquota de IR regressiva da renda fixa conforme o prazo em dias. */
export function irRate(days: number): number {
  if (days <= 180) return 22.5;
  if (days <= 360) return 20;
  if (days <= 720) return 17.5;
  return 15;
}

const EXEMPT: (AllocationType | FixedType)[] = ["lci", "lca", "poupanca"];
const VARIABLE: AllocationType[] = ["acao", "fii", "etf", "cripto"];

export function isTaxExempt(type: AllocationType | FixedType): boolean {
  return EXEMPT.includes(type);
}

export function isVariable(type: AllocationType): boolean {
  return VARIABLE.includes(type);
}

/** Rendimento líquido (em %) após IR para um prazo em dias. */
export function netReturn(annualPct: number, days: number, type: AllocationType | FixedType): number {
  const gross = Math.pow(1 + annualPct / 100, days / 365) - 1;
  if (isTaxExempt(type) || VARIABLE.includes(type as AllocationType)) return gross * 100;
  return gross * (1 - irRate(days) / 100) * 100;
}

/** Rendimento da poupança ao ano (regra atual: 0,5% a.m. + TR se Selic > 8,5%; senão 70% da Selic + TR). */
export function savingsAnnual(selic: number, trMonthly = 0): number {
  const monthly = selic > 8.5 ? 0.5 + trMonthly : (Math.pow(1 + (selic * 0.7) / 100, 1 / 12) - 1) * 100 + trMonthly;
  return (Math.pow(1 + monthly / 100, 12) - 1) * 100;
}

export function monthsBetween(fromYm: string, toYm: string): number {
  const [fy, fm] = fromYm.split("-").map(Number);
  const [ty, tm] = toYm.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function currentYm(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonthsYm(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return currentYm(d);
}

export interface ProjectionPoint {
  month: number;
  ym: string;
  invested: number;
  value: number;
}

export interface GoalProjection {
  current: number;
  monthlyTotal: number;
  months: number;
  points: ProjectionPoint[];
  valueAtDeadline: number;
  netValueAtDeadline: number;
  investedAtDeadline: number;
  reachesTarget: boolean;
  monthsToTarget: number | null;
  requiredMonthly: number;
  blendedAnnual: number;
  progress: number;
}

function allocationAnnual(a: GoalAllocation, r: Rates): number {
  if (a.type === "poupanca") return savingsAnnual(r.selic);
  return annualRate(a.rateType, a.rate, r);
}

export function projectGoal(goal: Goal, r: Rates, now = new Date()): GoalProjection {
  const start = currentYm(now);
  const months = Math.max(0, monthsBetween(start, goal.deadline));
  const allocs = goal.allocations;
  const current = allocs.reduce((s, a) => s + a.amount, 0);
  const monthlyTotal = allocs.reduce((s, a) => s + a.monthly, 0);

  const weights = allocs.map((a) => a.amount + a.monthly * Math.max(1, months));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const blendedAnnual =
    totalWeight > 0 ? allocs.reduce((s, a, i) => s + allocationAnnual(a, r) * weights[i], 0) / totalWeight : 0;

  const horizon = Math.min(Math.max(months, 1) * 3, 600);
  const values = allocs.map((a) => a.amount);
  const invested = allocs.map((a) => a.amount);
  const monthlyRates = allocs.map((a) => Math.pow(1 + allocationAnnual(a, r) / 100, 1 / 12) - 1);
  const points: ProjectionPoint[] = [{ month: 0, ym: start, invested: current, value: current }];
  let monthsToTarget: number | null = current >= goal.target ? 0 : null;

  for (let m = 1; m <= horizon; m++) {
    for (let i = 0; i < allocs.length; i++) {
      values[i] = values[i] * (1 + monthlyRates[i]) + allocs[i].monthly;
      invested[i] += allocs[i].monthly;
    }
    const total = values.reduce((s, v) => s + v, 0);
    const inv = invested.reduce((s, v) => s + v, 0);
    if (m <= Math.max(months, 1)) points.push({ month: m, ym: addMonthsYm(start, m), invested: inv, value: total });
    if (monthsToTarget === null && total >= goal.target) monthsToTarget = m;
    if (m >= months && monthsToTarget !== null) break;
  }

  const last = points[points.length - 1];
  const days = Math.max(1, months * 30);
  let netValue = 0;
  if (allocs.length) {
    for (let i = 0; i < allocs.length; i++) {
      const a = allocs[i];
      const inv = a.amount + a.monthly * months;
      const val = futureValue(a.amount, a.monthly, monthlyRates[i], months);
      const gain = Math.max(0, val - inv);
      const tax = isTaxExempt(a.type) || isVariable(a.type) ? 0 : gain * (irRate(days) / 100);
      netValue += val - tax;
    }
  }

  const blendedMonthly = Math.pow(1 + blendedAnnual / 100, 1 / 12) - 1;
  const requiredMonthly = requiredContribution(goal.target, current, blendedMonthly, months);

  return {
    current,
    monthlyTotal,
    months,
    points,
    valueAtDeadline: last.value,
    netValueAtDeadline: netValue || last.value,
    investedAtDeadline: last.invested,
    reachesTarget: last.value >= goal.target,
    monthsToTarget,
    requiredMonthly,
    blendedAnnual,
    progress: goal.target > 0 ? Math.min(1, current / goal.target) : 0,
  };
}

export function futureValue(pv: number, pmt: number, i: number, n: number): number {
  if (n <= 0) return pv;
  if (i === 0) return pv + pmt * n;
  const f = Math.pow(1 + i, n);
  return pv * f + pmt * ((f - 1) / i);
}

export function requiredContribution(target: number, pv: number, i: number, n: number): number {
  if (n <= 0) return Math.max(0, target - pv);
  const f = Math.pow(1 + i, n);
  const remaining = target - pv * f;
  if (remaining <= 0) return 0;
  return i === 0 ? remaining / n : remaining / ((f - 1) / i);
}

export interface MonthEntry {
  expense: Expense;
  amount: number;
  installment: number;
  totalInstallments: number;
}

/** Lançamentos que caem em um mês (considera compras parceladas). */
export function entriesForMonth(expenses: Expense[], ym: string): MonthEntry[] {
  const out: MonthEntry[] = [];
  for (const e of expenses) {
    const n = Math.max(1, e.installments || 1);
    const startYm = e.date.slice(0, 7);
    const k = monthsBetween(startYm, ym);
    if (k < 0 || k >= n) continue;
    out.push({ expense: e, amount: round2(e.amount / n), installment: k + 1, totalInstallments: n });
  }
  return out.sort((a, b) => b.expense.date.localeCompare(a.expense.date));
}

/** Data de hoje (AAAA-MM-DD) no fuso do aparelho, e não em UTC (depois das 21h no Brasil o UTC já é amanhã). */
export function localIsoDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export interface MonthSummary {
  ym: string;
  /** Renda fixa do mês (salário + outra renda fixa do perfil). Nunca inclui entradas avulsas. */
  income: number;
  /** Entradas avulsas lançadas no mês (freela, presente, venda…), à parte da renda. */
  extraIncome: number;
  extrasByKind: { kind: IncomeKind; total: number }[];
  spent: number;
  /** Renda fixa − gastos (as entradas avulsas ficam de fora). */
  balance: number;
  byCategory: { category: string; total: number }[];
  byInstitution: { institution: string; total: number }[];
  entries: MonthEntry[];
  futureInstallments: { ym: string; total: number }[];
}

export function summarizeMonth(expenses: Expense[], ym: string, salary: number, extra: number): MonthSummary {
  const entries = entriesForMonth(expenses, ym);
  const spentEntries = entries.filter((e) => e.expense.type === "despesa");
  const incomeEntries = entries.filter((e) => e.expense.type === "receita");
  const spent = round2(spentEntries.reduce((s, e) => s + e.amount, 0));
  const extraIncome = round2(incomeEntries.reduce((s, e) => s + e.amount, 0));
  const income = round2(salary + extra);
  const kinds = new Map<IncomeKind, number>();
  for (const e of incomeEntries) kinds.set(incomeKindOf(e.expense), (kinds.get(incomeKindOf(e.expense)) ?? 0) + e.amount);
  const cat = new Map<string, number>();
  const inst = new Map<string, number>();
  for (const e of spentEntries) {
    cat.set(e.expense.category, (cat.get(e.expense.category) ?? 0) + e.amount);
    inst.set(e.expense.institution || "—", (inst.get(e.expense.institution || "—") ?? 0) + e.amount);
  }
  const futureInstallments: { ym: string; total: number }[] = [];
  for (let k = 1; k <= 6; k++) {
    const fym = addMonthsYm(ym, k);
    const total = entriesForMonth(expenses, fym)
      .filter((e) => e.expense.type === "despesa" && e.totalInstallments > 1)
      .reduce((s, e) => s + e.amount, 0);
    if (total > 0) futureInstallments.push({ ym: fym, total: round2(total) });
  }
  return {
    ym,
    income,
    extraIncome,
    extrasByKind: [...kinds.entries()].map(([kind, total]) => ({ kind, total: round2(total) })).sort((a, b) => b.total - a.total),
    spent,
    balance: round2(income - spent),
    byCategory: [...cat.entries()].map(([category, total]) => ({ category, total: round2(total) })).sort((a, b) => b.total - a.total),
    byInstitution: [...inst.entries()].map(([institution, total]) => ({ institution, total: round2(total) })).sort((a, b) => b.total - a.total),
    entries,
    futureInstallments,
  };
}

export interface MonthBudget {
  /** Salário + outra renda fixa do perfil. Entradas avulsas ficam em `extras`. */
  income: number;
  /** Entradas avulsas do mês: aparecem à parte e não entram no disponível. */
  extras: number;
  /** Gastos no débito, Pix, dinheiro, boleto... e no crédito de bancos sem fatura informada. */
  spentDirect: number;
  /** Soma das faturas do mês (pagas e em aberto). */
  invoices: number;
  invoicesOpen: number;
  /** Contas fixas do mês ainda não pagas. */
  pendingBills: number;
  committed: number;
  available: number;
  /** Fração da renda já comprometida (0 a 1+). */
  ratio: number;
  /** Só no mês atual: dias que faltam (contando hoje) e quanto dá por dia. */
  daysLeft?: number;
  perDay?: number;
}

/**
 * Quanto do mês já está comprometido e quanto sobra de verdade. Compras no
 * crédito de um banco com fatura informada entram pela fatura (não somam duas
 * vezes); as dos outros bancos entram pelo lançamento.
 */
/** Dia do vencimento de uma conta fixa num mês (31 em fevereiro vira 28/29). */
export function billDueDate(bill: Bill, ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${String(Math.min(bill.dueDay, last)).padStart(2, "0")}`;
}

/** Soma das contas fixas ativas ainda não pagas no mês. */
export function billsPending(bills: Bill[], ym: string): number {
  return round2(bills.filter((b) => b.active && !b.paid.includes(ym)).reduce((s, b) => s + b.amount, 0));
}

/** Gastos planejados para o mês que ainda não aconteceram. */
export function plannedPending(planned: PlannedExpense[], ym: string): number {
  return round2(planned.filter((p) => !p.done && p.date.startsWith(ym)).reduce((s, p) => s + p.amount, 0));
}

/**
 * Quanto as caixinhas separam no mês (sai do disponível): o que já foi
 * depositado no mês, ou o que ainda vai ser (limitado ao que falta para a meta).
 */
export function boxesMonthly(boxes: SavingBox[], ym?: string): number {
  return round2(
    boxes.reduce((s, b) => {
      const deposited = ym ? b.history.filter((h) => h.date.startsWith(ym) && h.note === "Depósito automático").reduce((x, h) => x + h.amount, 0) : 0;
      if (deposited > 0) return s + deposited;
      if (!b.active) return s;
      const left = b.target ? Math.max(0, b.target - b.balance) : b.monthly;
      return s + Math.min(b.monthly, left);
    }, 0)
  );
}

/**
 * Contas fixas não pagas + gastos planejados do mês + caixinhas: já
 * comprometidos. Em meses que já passaram, nada fica "pendente" (contas pagas já
 * viraram lançamento e as caixinhas de hoje não existiam lá).
 */
export function pendingFor(bills: Bill[], planned: PlannedExpense[], ym: string, boxes: SavingBox[] = [], today = new Date()): number {
  if (ym < currentYm(today)) return 0;
  return round2(billsPending(bills, ym) + plannedPending(planned, ym) + boxesMonthly(boxes, ym));
}

/** Meses inteiros até uma data (mínimo 1), para dividir quanto guardar por mês. */
export function monthsUntil(date: string, today = new Date()): number {
  const [y, m] = date.split("-").map(Number);
  return Math.max(1, (y - today.getFullYear()) * 12 + (m - 1 - today.getMonth()));
}

/** Lê as linhas "- [ ] 15/11: guardar R$ 100" de um plano em Markdown. */
export function parsePlanSteps(md: string, today = new Date()): PlanStep[] {
  const steps: PlanStep[] = [];
  let i = 0;
  for (const raw of md.split("\n")) {
    const m = raw.match(/^\s*[-*]\s*\[( |x|X)\]\s*(.+)$/);
    if (!m) continue;
    let text = m[2].trim().replace(/\*\*/g, "");
    let date: string | undefined;
    const d = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*[:\-–—]?\s*/);
    if (d) {
      const day = Number(d[1]);
      const month = Number(d[2]);
      let year = d[3] ? Number(d[3].length === 2 ? `20${d[3]}` : d[3]) : today.getFullYear();
      if (!d[3] && month < today.getMonth() + 1) year += 1;
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        text = text.slice(d[0].length).trim();
      }
    }
    steps.push({ id: `s${i++}`, text, date, done: m[1].toLowerCase() === "x" });
  }
  return steps;
}

export interface WeekSummary {
  /** Gasto nos últimos 7 dias (até hoje). */
  spent: number;
  /** Gasto nos 7 dias anteriores. */
  previous: number;
  topCategory?: { category: string; total: number };
  /** Contas fixas que vencem nos próximos 7 dias. */
  dueSoon: { name: string; amount: number; date: string }[];
}

/** Resumo da semana: o que saiu nos últimos 7 dias, comparação e o que vence. */
export function weekSummary(expenses: { type: string; amount: number; date: string; category: string; installments: number }[], bills: Bill[], today: string): WeekSummary {
  const t = Date.parse(`${today}T12:00:00`);
  const day = 86_400_000;
  const inRange = (d: string, from: number, to: number) => {
    const x = Date.parse(`${d.slice(0, 10)}T12:00:00`);
    return x > t - to * day && x <= t - from * day;
  };
  const spentIn = (from: number, to: number) =>
    expenses.filter((e) => e.type === "despesa" && inRange(e.date, from, to)).reduce((s, e) => s + e.amount / Math.max(1, e.installments), 0);
  const cats = new Map<string, number>();
  for (const e of expenses) if (e.type === "despesa" && inRange(e.date, 0, 7)) cats.set(e.category, (cats.get(e.category) ?? 0) + e.amount / Math.max(1, e.installments));
  const top = [...cats.entries()].sort((a, b) => b[1] - a[1])[0];
  const dueSoon: WeekSummary["dueSoon"] = [];
  for (let k = 0; k <= 7; k++) {
    const d = new Date(t + k * day).toISOString().slice(0, 10);
    for (const b of bills) {
      if (!b.active || b.paid.includes(d.slice(0, 7))) continue;
      if (billDueDate(b, d.slice(0, 7)) === d) dueSoon.push({ name: b.name, amount: b.amount, date: d });
    }
  }
  return { spent: round2(spentIn(0, 7)), previous: round2(spentIn(7, 14)), topCategory: top ? { category: top[0], total: round2(top[1]) } : undefined, dueSoon };
}

export function monthBudget(summary: MonthSummary, invoices: Invoice[], ym: string, today = new Date(), pendingBills = 0): MonthBudget {
  const monthInvoices = invoices.filter((i) => i.ym === ym);
  const withInvoice = new Set(monthInvoices.map((i) => i.institution));
  const spentDirect = round2(
    summary.entries
      .filter((e) => e.expense.type === "despesa" && !(e.expense.method === "credito" && withInvoice.has(e.expense.institution)))
      .reduce((s, e) => s + e.amount, 0)
  );
  const invoiceTotal = round2(monthInvoices.reduce((s, i) => s + i.amount, 0));
  const invoicesOpen = round2(monthInvoices.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0));
  const income = round2(summary.income);
  // Contas fixas ainda não pagas já estão comprometidas (as pagas viram lançamento).
  const committed = round2(spentDirect + invoiceTotal + pendingBills);
  const available = round2(income - committed);
  const out: MonthBudget = { income, extras: summary.extraIncome, spentDirect, invoices: invoiceTotal, invoicesOpen, pendingBills: round2(pendingBills), committed, available, ratio: income > 0 ? committed / income : committed > 0 ? 1 : 0 };
  const cur = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  if (ym === cur) {
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    out.daysLeft = last - today.getDate() + 1;
    out.perDay = available > 0 ? round2(available / out.daysLeft) : 0;
  }
  return out;
}

export const MONTHS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function ymLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_PT[m - 1]} de ${y}`;
}

export const EXPENSE_CATEGORIES = [
  "Moradia", "Alimentação", "Mercado", "Transporte", "Saúde", "Educação", "Lazer",
  "Compras", "Assinaturas", "Contas", "Viagem", "Pets", "Presentes", "Outros",
];

/** Tipos de entrada avulsa. A categoria do lançamento é o rótulo do tipo. */
export const INCOME_KINDS: { id: IncomeKind; label: string; hint: string }[] = [
  { id: "trabalho", label: "Trabalho", hint: "Freela, bico, serviço, hora extra" },
  { id: "presente", label: "Presente/família", hint: "Dinheiro de parentes, aniversário" },
  { id: "venda", label: "Venda", hint: "Vendeu algo seu" },
  { id: "reembolso", label: "Reembolso", hint: "Devolveram um valor que você pagou" },
  { id: "outro", label: "Outro", hint: "Qualquer outra entrada" },
];

export const INCOME_CATEGORIES = INCOME_KINDS.map((k) => k.label);

const LEGACY_KIND: Record<string, IncomeKind> = { "Salário extra": "trabalho", Freelance: "trabalho", Vendas: "venda", Reembolso: "reembolso", Presentes: "presente" };

/** Tipo de uma entrada avulsa (lançamentos antigos usam a categoria). */
export function incomeKindOf(e: Pick<Expense, "incomeKind" | "category">): IncomeKind {
  return e.incomeKind ?? INCOME_KINDS.find((k) => k.label === e.category)?.id ?? LEGACY_KIND[e.category] ?? "outro";
}

export function incomeKindLabel(k: IncomeKind): string {
  return INCOME_KINDS.find((x) => x.id === k)?.label ?? "Outro";
}

/** Sugestões de gastos obrigatórios (viram contas fixas marcadas como obrigatórias). */
export const MANDATORY_PRESETS: { name: string; category: string; dueDay: number }[] = [
  { name: "Transporte público", category: "Transporte", dueDay: 1 },
  { name: "Aluguel", category: "Moradia", dueDay: 5 },
  { name: "Luz", category: "Contas", dueDay: 10 },
  { name: "Água", category: "Contas", dueDay: 10 },
  { name: "Internet", category: "Contas", dueDay: 15 },
  { name: "Celular", category: "Contas", dueDay: 15 },
  { name: "Faculdade/escola", category: "Educação", dueDay: 10 },
];

/** Total dos gastos obrigatórios ativos (pagos ou não) num mês. */
export function mandatoryTotal(bills: Bill[]): number {
  return round2(bills.filter((b) => b.active && b.mandatory).reduce((s, b) => s + b.amount, 0));
}

export interface CardUsage {
  accountId: string;
  institution: string;
  limit: number;
  /** Faturas em aberto + parcelas que ainda vão cair (sem fatura informada). */
  used: number;
  available: number;
  closingDay?: number;
  dueDay?: number;
}

/**
 * Quanto do limite de cada cartão está tomado. Em cada mês, a fatura informada
 * vale no lugar dos lançamentos no crédito daquele banco (não soma duas vezes);
 * faturas antigas em aberto também ocupam o limite.
 */
export function cardsUsage(accounts: BankAccount[], invoices: Invoice[], expenses: Expense[], today = new Date()): CardUsage[] {
  const cur = currentYm(today);
  const out: CardUsage[] = [];
  for (const a of accounts) {
    if (!a.card || !(a.card.limit > 0)) continue;
    const inst = a.institution;
    const mine = invoices.filter((i) => i.institution === inst);
    let used = mine.filter((i) => !i.paid && i.ym < cur).reduce((s, i) => s + i.amount, 0);
    const credit = expenses.filter((e) => e.type === "despesa" && e.method === "credito" && e.institution === inst);
    for (let k = 0; k < 24; k++) {
      const ym = addMonthsYm(cur, k);
      const inv = mine.find((i) => i.ym === ym);
      if (inv) used += inv.paid ? 0 : inv.amount;
      else used += entriesForMonth(credit, ym).reduce((s, e) => s + e.amount, 0);
    }
    used = round2(used);
    out.push({ accountId: a.id, institution: inst, limit: a.card.limit, used, available: round2(a.card.limit - used), closingDay: a.card.closingDay, dueDay: a.card.dueDay });
  }
  return out;
}

function dayIn(ym: string, day: number): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${String(Math.min(Math.max(1, day), last)).padStart(2, "0")}`;
}

export interface CalendarItem {
  date: string;
  kind: "salario" | "adiantamento" | "conta" | "fatura";
  label: string;
  amount: number;
  /** Entrada (true) ou saída. */
  income: boolean;
  done: boolean;
  mandatory?: boolean;
}

/** O que entra e o que vence no mês, em ordem de data: salário, contas fixas e faturas. */
export function monthCalendar(
  profile: Pick<FinancialProfile, "salary" | "payDay" | "advanceDay" | "advanceAmount">,
  bills: Bill[],
  accounts: BankAccount[],
  invoices: Invoice[],
  ym: string,
  today = new Date()
): CalendarItem[] {
  const out: CalendarItem[] = [];
  const todayIso = localIsoDate(today);
  const adv = profile.advanceDay && profile.advanceAmount ? Math.min(profile.advanceAmount, profile.salary) : 0;
  if (adv > 0) {
    const date = dayIn(ym, profile.advanceDay!);
    out.push({ date, kind: "adiantamento", label: "Adiantamento do salário", amount: round2(adv), income: true, done: date < todayIso });
  }
  if (profile.payDay && profile.salary > 0) {
    const date = dayIn(ym, profile.payDay);
    out.push({ date, kind: "salario", label: adv > 0 ? "Resto do salário" : "Salário", amount: round2(profile.salary - adv), income: true, done: date < todayIso });
  }
  for (const b of bills) {
    if (!b.active) continue;
    out.push({ date: billDueDate(b, ym), kind: "conta", label: b.name, amount: b.amount, income: false, done: b.paid.includes(ym), mandatory: !!b.mandatory });
  }
  const seen = new Set<string>();
  for (const i of invoices.filter((x) => x.ym === ym)) {
    const day = i.dueDay ?? accounts.find((a) => a.institution === i.institution)?.card?.dueDay;
    seen.add(i.institution);
    if (!day) continue;
    out.push({ date: dayIn(ym, day), kind: "fatura", label: `Fatura ${institutionLabel(i.institution)}`, amount: i.amount, income: false, done: i.paid });
  }
  for (const a of accounts) {
    if (!a.card?.dueDay || seen.has(a.institution)) continue;
    out.push({ date: dayIn(ym, a.card.dueDay), kind: "fatura", label: `Fatura ${institutionLabel(a.institution)}`, amount: 0, income: false, done: false });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date) || Number(y.income) - Number(x.income));
}

export const PAYMENT_LABEL: Record<Expense["method"], string> = {
  pix: "Pix",
  debito: "Débito",
  credito: "Crédito",
  dinheiro: "Dinheiro",
  boleto: "Boleto",
  transferencia: "Transferência",
};
