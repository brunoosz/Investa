import type { AiMode, CreditRatesData, Indicators, Quote, UserDataMap } from "@shared/types";
import { displaySymbol, LIQUID_UNIVERSE } from "@shared/catalog";
import { institutionLabel } from "@shared/banks";
import { addMonthsYm, annualRate, cardsUsage, incomeKindLabel, incomeKindOf, mandatoryTotal, pendingFor, currentYm, monthBudget, projectGoal, ratesFromIndicators, summarizeMonth, ymLabel } from "@shared/finance";
import { getCopom, getIndicators } from "./bcb";
import { asksAboutDebt, creditRatesForAi, userCreditSection } from "./rates";
import { getNews } from "./news";
import { getTesouro, formatTesouroRate } from "./tesouro";
import { getChart, getQuotes } from "./yahoo";
import { fixedHoldingValue, fxFor } from "./portfolio";
import { nowInSaoPaulo } from "./http";
import { LEVELS, TOTAL_LESSONS } from "@shared/learning";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")}%`;
const n2 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const brDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Fonte lenta não segura a resposta da IA: passou do prazo, segue sem ela (o cache a traz na próxima). */
function within<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function money(q: Quote): string {
  if (q.currency === "BRL") return brl(q.price);
  return `${q.currency} ${n2(q.price)}`;
}

const ALIASES: [RegExp, string][] = [
  [/petrobr[aá]s/i, "PETR4.SA"],
  [/\bita[uú]\b/i, "ITUB4.SA"],
  [/bradesco/i, "BBDC4.SA"],
  [/banco do brasil/i, "BBAS3.SA"],
  [/ambev/i, "ABEV3.SA"],
  [/\bweg\b/i, "WEGE3.SA"],
  [/magalu|magazine luiza/i, "MGLU3.SA"],
  [/nubank/i, "ROXO34.SA"],
  [/eletrobr[aá]s|axia/i, "AXIA3.SA"],
  [/sabesp/i, "SBSP3.SA"],
  [/embraer/i, "EMBJ3.SA"],
  [/localiza/i, "RENT3.SA"],
  [/suzano/i, "SUZB3.SA"],
  [/gerdau/i, "GGBR4.SA"],
  [/(a[cç][aã]o|a[cç][oõ]es|pap[eé]is|papel|mineradora)\s+da\s+vale\b/i, "VALE3.SA"],
  [/bitcoin/i, "BTC-USD"],
  [/ethereum/i, "ETH-USD"],
  [/d[oó]lar/i, "USDBRL=X"],
  [/\beuro\b/i, "EURBRL=X"],
  [/\bouro\b/i, "GC=F"],
  [/ibovespa|\bibov\b/i, "^BVSP"],
  [/apple/i, "AAPL"],
  [/tesla/i, "TSLA"],
  [/nvidia/i, "NVDA"],
  [/microsoft/i, "MSFT"],
];

export function detectSymbols(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.toUpperCase().matchAll(/\b([A-Z]{4}\d{1,2})\b/g)) found.add(`${m[1]}.SA`);
  for (const [re, sym] of ALIASES) if (re.test(text)) found.add(sym);
  return [...found].slice(0, 6);
}

function marketStatus(now: Date): string {
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (day === 0 || day === 6) return "fim de semana — B3 fechada";
  if (minutes >= 10 * 60 && minutes < 17 * 60 + 55) return "pregão da B3 aberto";
  if (minutes < 10 * 60) return "antes da abertura da B3 (abre às 10h)";
  return "após o fechamento da B3";
}

async function assetDetail(symbol: string, q?: Quote): Promise<string> {
  if (!q) return `- ${displaySymbol(symbol)}: sem cotação disponível agora.`;
  const parts = [`${displaySymbol(symbol)} (${q.name}): ${money(q)} (${pct(q.changePercent)} hoje)`];
  try {
    const chart = await within(getChart(symbol, "1A"), 5_000);
    const pts = chart.points;
    const lastClose = q.price;
    const at = (days: number) => {
      const target = Date.now() / 1000 - days * 86400;
      const p = pts.find((x) => x.time >= target);
      return p ? ((lastClose - p.close) / p.close) * 100 : undefined;
    };
    const m1 = at(30);
    const m6 = at(182);
    const y1 = pts.length ? ((lastClose - pts[0].close) / pts[0].close) * 100 : undefined;
    const perf = [m1 !== undefined && `1 mês ${pct(m1, 1)}`, m6 !== undefined && `6 meses ${pct(m6, 1)}`, y1 !== undefined && `12 meses ${pct(y1, 1)}`]
      .filter(Boolean)
      .join(", ");
    if (perf) parts.push(`desempenho: ${perf}`);
  } catch {
    // histórico indisponível
  }
  if (q.fiftyTwoWeekLow && q.fiftyTwoWeekHigh) parts.push(`faixa 52 semanas ${n2(q.fiftyTwoWeekLow)}–${n2(q.fiftyTwoWeekHigh)}`);
  if (q.fiftyDayAverage) parts.push(`média 50 dias ${n2(q.fiftyDayAverage)} (${pct(((q.price - q.fiftyDayAverage) / q.fiftyDayAverage) * 100, 1)} vs média)`);
  if (q.pe) parts.push(`P/L ${n2(q.pe)}`);
  if (q.priceToBook) parts.push(`P/VP ${n2(q.priceToBook)}`);
  if (q.dividendYield) parts.push(`dividend yield ${n2(q.dividendYield)}%`);
  if (q.marketCap) parts.push(`valor de mercado ${brl(q.marketCap).replace(/,\d+$/, "")}`);
  return `- ${parts.join("; ")}`;
}

interface ContextInput {
  user: { name: string };
  data: UserDataMap;
  notifications: { title: string; message: string; createdAt: string }[];
  question: string;
  mode: AiMode;
}

function dateTimeSection(lines: string[]): void {
  const now = nowInSaoPaulo();
  const weekday = now.toLocaleDateString("pt-BR", { weekday: "long" });
  lines.push("# Data e hora");
  lines.push(
    `Agora: ${weekday}, ${now.toLocaleDateString("pt-BR")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} (horário de Brasília) — ${marketStatus(now)}.`
  );
}

function indicatorsSection(lines: string[], ind: Indicators | undefined, withFocus = true): void {
  lines.push("\n# Indicadores oficiais (Banco Central do Brasil)");
  if (!ind) {
    lines.push("- Indicadores indisponíveis no momento (sem conexão com o Banco Central).");
    return;
  }
  if (ind.selic) lines.push(`- Selic meta: ${n2(ind.selic.value)}% a.a. (referência ${brDate(ind.selic.date)})`);
  if (ind.cdi) lines.push(`- CDI: ${n2(ind.cdi.value)}% a.a.`);
  if (ind.ipcaMonth) lines.push(`- IPCA de ${ymLabel(ind.ipcaMonth.date.slice(0, 7))}: ${n2(ind.ipcaMonth.value)}%`);
  if (ind.ipca12m) lines.push(`- IPCA acumulado em 12 meses: ${n2(ind.ipca12m.value)}%`);
  if (ind.dollarPtax) lines.push(`- Dólar PTAX: ${brl(ind.dollarPtax.value)} (${brDate(ind.dollarPtax.date)})`);
  if (ind.savingsMonth) lines.push(`- Poupança: ${n2(ind.savingsMonth.value)}% no mês`);
  const f = ind.focus;
  if (withFocus && f) {
    const items = [
      f.ipcaYear && `IPCA ${f.ipcaYear.year}: ${n2(f.ipcaYear.value)}%`,
      f.selicYear && `Selic fim de ${f.selicYear.year}: ${n2(f.selicYear.value)}%`,
      f.pibYear && `PIB ${f.pibYear.year}: ${n2(f.pibYear.value)}%`,
      f.dollarYear && `câmbio fim de ${f.dollarYear.year}: R$ ${n2(f.dollarYear.value)}`,
    ].filter(Boolean);
    if (items.length) lines.push(`- Boletim Focus (${brDate(f.date)}), expectativas do mercado: ${items.join("; ")}`);
  }
}

function creditSection(lines: string[], credit: CreditRatesData | undefined): void {
  if (!credit?.modalities.length) return;
  lines.push(`\n# Juros de crédito para pessoa física (Banco Central${credit.period ? `, período iniciado em ${brDate(credit.period)}` : ""})`);
  for (const m of credit.modalities) {
    const r = m.rates;
    if (!r.length) continue;
    const median = r[Math.floor(r.length / 2)];
    lines.push(
      `- ${m.label}: menores taxas ${r.slice(0, 3).map((x) => `${x.institution} ${n2(x.rateMonth)}% a.m.`).join("; ")}; mediana ${n2(median.rateMonth)}% a.m.; maior ${n2(r[r.length - 1].rateMonth)}% a.m.`
    );
  }
}

function profileSection(lines: string[], input: ContextInput): void {
  const p = input.data.profile;
  lines.push(`\n# Sobre o usuário (${input.user.name})`);
  if (p.onboarded) {
    lines.push(`- Perfil de investidor: ${p.riskProfile}; experiência: ${p.experience}; objetivo principal: ${p.mainGoal}${p.age ? `; idade: ${p.age}` : ""}`);
    lines.push(
      `- Renda fixa mensal: salário ${brl(p.salary)}${p.payDay ? ` (cai dia ${p.payDay}${p.advanceDay && p.advanceAmount ? `, com adiantamento de ${brl(p.advanceAmount)} no dia ${p.advanceDay}` : ""})` : ""}${p.extraIncome ? ` + outra renda fixa ${brl(p.extraIncome)}` : ""}; gastos fixos ${brl(p.fixedExpenses)}; gastos variáveis ${brl(p.variableExpenses)}; pode investir ${brl(p.monthlyInvest)}/mês`
    );
    lines.push(`- Reserva de emergência atual: ${brl(p.emergencyReserve)}; já investido: ${brl(p.invested)}; dívidas: ${brl(p.debts)}`);
  } else {
    lines.push("- O usuário ainda não preencheu os dados financeiros (pode sugerir que preencha em Configurações).");
  }
}

function portfolioSection(lines: string[], data: UserDataMap, quotes: Record<string, Quote>, rates: ReturnType<typeof ratesFromIndicators>): void {
  if (!data.portfolio.length) {
    lines.push("- Carteira: nenhum investimento cadastrado no app.");
    return;
  }
  lines.push("- Carteira:");
  for (const h of data.portfolio.slice(0, 25)) {
    if (h.kind === "variavel" && h.symbol) {
      const q = quotes[h.symbol];
      const fx = fxFor(q?.currency ?? "BRL", quotes);
      const cur = q ? q.price : h.avgPrice ?? 0;
      const ret = h.avgPrice ? ((cur - h.avgPrice) / h.avgPrice) * 100 : 0;
      lines.push(
        `  - ${displaySymbol(h.symbol)}: ${n2(h.quantity ?? 0)} cotas, preço médio ${n2(h.avgPrice ?? 0)}, agora ${q ? n2(q.price) : "?"} (${pct(ret, 1)}), posição ≈ ${brl((h.quantity ?? 0) * cur * fx)} — ${institutionLabel(h.institution)}`
      );
    } else {
      const annual = annualRate(h.rateType ?? "cdi", h.rate ?? 100, rates);
      const rateLabel = h.rateType === "cdi" ? `${n2(h.rate ?? 0)}% do CDI` : h.rateType === "pre" ? `${n2(h.rate ?? 0)}% a.a.` : `${h.rateType?.toUpperCase()} + ${n2(h.rate ?? 0)}%`;
      lines.push(`  - ${h.name} (${rateLabel}) em ${institutionLabel(h.institution)}: aplicado ${brl(h.amount ?? 0)} em ${brDate(h.purchaseDate)}, vale ≈ ${brl(fixedHoldingValue(h, annual))}`);
    }
  }
}

function goalsSection(lines: string[], data: UserDataMap, rates: ReturnType<typeof ratesFromIndicators>): void {
  if (!data.goals.length) return;
  lines.push("- Objetivos:");
  for (const g of data.goals.slice(0, 8)) {
    const proj = projectGoal(g, rates);
    const where = g.allocations.map((a) => `${a.asset || a.type} em ${institutionLabel(a.institution)} (${brl(a.amount)} + ${brl(a.monthly)}/mês)`).join(", ");
    lines.push(
      `  - ${g.name}: ${brl(proj.current)} de ${brl(g.target)} até ${g.deadline.split("-").reverse().join("/")}; projeção no prazo ${brl(proj.valueAtDeadline)} (${proj.reachesTarget ? "atinge" : `não atinge; precisaria de ${brl(proj.requiredMonthly)}/mês`})${where ? `; investido em: ${where}` : ""}`
    );
  }
}

function moneySection(lines: string[], data: UserDataMap, detailed: boolean): void {
  const p = data.profile;
  const ym = currentYm();
  const month = summarizeMonth(data.expenses, ym, p.salary, p.extraIncome);
  if (month.entries.length) {
    lines.push(
      `- Gastos de ${ymLabel(ym)} até agora: ${brl(month.spent)} (${month.byCategory.slice(0, detailed ? 10 : 5).map((c) => `${c.category} ${brl(c.total)}`).join(", ")}); renda fixa do mês ${brl(month.income)}; sobra da renda fixa ${brl(month.balance)}`
    );
    if (month.futureInstallments.length) lines.push(`- Parcelas futuras: ${month.futureInstallments.map((f) => `${ymLabel(f.ym)} ${brl(f.total)}`).join("; ")}`);
  } else {
    lines.push(`- Nenhum gasto lançado em ${ymLabel(ym)}.`);
  }
  if (detailed) {
    const prev = summarizeMonth(data.expenses, addMonthsYm(ym, -1), p.salary, p.extraIncome);
    if (prev.entries.length) lines.push(`- Mês anterior (${ymLabel(prev.ym)}): gastos ${brl(prev.spent)}, saldo ${brl(prev.balance)}`);
    const biggest = [...month.entries].sort((a, b) => b.amount - a.amount).slice(0, 8);
    if (biggest.length) lines.push(`- Maiores lançamentos do mês: ${biggest.map((e) => `${e.expense.description} ${brl(e.amount)} (${e.expense.category})`).join("; ")}`);
  }
  const bills = (data.bills ?? []).filter((b) => b.active);
  const planned = (data.planned ?? []).filter((p) => !p.done);
  const boxes = (data.boxes ?? []).filter((b) => b.active);
  const budget = monthBudget(month, data.invoices ?? [], ym, new Date(), pendingFor(bills, planned, ym, boxes));
  if (boxes.length) {
    lines.push(`- Caixinhas: ${boxes.map((b) => `${b.name} ${brl(b.balance)}${b.target ? ` de ${brl(b.target)}` : ""} (+${brl(b.monthly)}/mês no dia ${b.day})`).join("; ")}`);
  }
  if (planned.length) {
    lines.push(`- Gastos que vão vir: ${planned.map((p) => `${p.description} ${brl(p.amount)} em ${brDate(p.date)}${p.plan ? " (já tem plano)" : ""}`).join("; ")}`);
  }
  if (bills.length) {
    lines.push(`- Contas fixas: ${bills.map((b) => `${b.name} ${brl(b.amount)} (dia ${b.dueDay}${b.mandatory ? ", obrigatória" : ""}${b.paid.includes(ym) ? ", paga este mês" : ""})`).join("; ")}`);
    const mandatory = mandatoryTotal(bills);
    if (mandatory) lines.push(`- Gastos obrigatórios do mês (não dá para cortar): ${brl(mandatory)}.`);
  }
  lines.push(
    `- Disponível para gastar em ${ymLabel(ym)}: ${brl(budget.available)} (renda fixa ${brl(budget.income)} − gastos ${brl(budget.spentDirect)} − faturas ${brl(budget.invoices)} − contas, planejados e caixinhas pendentes ${brl(budget.pendingBills)}; ${n2(budget.ratio * 100)}% da renda comprometida)${budget.perDay !== undefined && budget.available > 0 ? `, cerca de ${brl(budget.perDay)} por dia até o fim do mês` : ""}. O salário não é saldo livre: só o disponível é.`
  );
  const cards = cardsUsage(data.accounts ?? [], data.invoices ?? [], data.expenses);
  if (cards.length) {
    lines.push(
      `- Limite dos cartões: ${cards.map((c) => `${institutionLabel(c.institution)} disponível ${brl(c.available)} de ${brl(c.limit)} (usado ${brl(c.used)}${c.closingDay ? `, fecha dia ${c.closingDay}` : ""}${c.dueDay ? `, vence dia ${c.dueDay}` : ""})`).join("; ")}. Compra no crédito acima do disponível não passa.`
    );
  }
  const accounts = (data.accounts ?? []).filter((a) => !a.cardOnly);
  if (accounts.length) {
    const total = accounts.reduce((s, a) => s + a.balance, 0);
    lines.push(`- Saldo nas contas agora (informado pelo usuário): ${brl(total)} — ${accounts.map((a) => `${institutionLabel(a.institution)} ${brl(a.balance)}`).join("; ")}`);
    const openNow = (data.invoices ?? []).filter((i) => i.ym === ym && !i.paid).reduce((s, i) => s + i.amount, 0);
    if (openNow) lines.push(`- Depois de pagar as faturas em aberto do mês, sobram ${brl(total - openNow)} nas contas.`);
  }
  const extras = month.entries.filter((e) => e.expense.type === "receita");
  if (extras.length)
    lines.push(
      `- Entradas avulsas do mês (NÃO são renda fixa, não conte como salário): ${extras.map((e) => `${e.expense.description} ${brl(e.amount)} (${incomeKindLabel(incomeKindOf(e.expense))})`).join("; ")}`
    );
  const invoices = (data.invoices ?? []).filter((i) => i.ym >= addMonthsYm(ym, -1));
  if (invoices.length) {
    lines.push("- Faturas de cartão informadas pelo usuário:");
    for (const i of invoices) {
      lines.push(
        `  - ${institutionLabel(i.institution)} (${ymLabel(i.ym)}): ${brl(i.amount)}${i.dueDay ? `, vence dia ${i.dueDay}` : ""}${i.minimumPayment ? `, mínimo ${brl(i.minimumPayment)}` : ""} — ${i.paid ? "paga" : "em aberto"}`
      );
    }
    const open = invoices.filter((i) => !i.paid && i.ym === ym).reduce((s, i) => s + i.amount, 0);
    const income = p.salary + p.extraIncome;
    if (open && income) lines.push(`- Faturas em aberto neste mês somam ${brl(open)}, ${n2((open / income) * 100)}% da renda mensal.`);
  }
}

export const APP_GUIDE = `Telas do Investa e como usar:
- Início: patrimônio, divisão da carteira, aulas, objetivos, indicadores do dia e notícias.
- Carteira: botão "Adicionar investimento". Renda variável: buscar o ativo, quantidade e preço médio. Renda fixa: tipo (CDB, LCI, LCA, Tesouro, poupança, debênture), indexador (CDI, Selic, IPCA, prefixado), taxa, valor e data.
- Mercado: abas por categoria (ações, FIIs, ETFs, BDRs, Tesouro Direto, renda fixa bancária, cripto, moedas, índices, commodities, ações dos EUA). "Personalizar" esconde ou adiciona ativos. Clicar num ativo abre o gráfico (1D a Máx, linha ou candles) e os indicadores; ali há "Favoritar", "Criar alerta", "Simular" e "Perguntar à IA".
- Aulas: trilha de 30 aulas em 10 módulos. Cada aula termina com um quiz de 3 perguntas; é preciso acertar as 3 para liberar a próxima. Abas Conquistas e Glossário.
- Assistente: esta conversa. Modos: Conversa livre, Professor, Minhas finanças, Analista de mercado, Vale a pena comprar? e Ajuda com o app.
- Meu plano: questionário de 5 perguntas (objetivo, prazo, quanto por mês — pode ser R$ 1 —, quanto já tem e estilo seguro/equilibrado/crescimento), projeção com juros compostos e marcos, e "Montar meu plano": o Assistente monta um plano de investimento com fases, checklist com datas e PDF, usando livros de finanças e, se ligada, pesquisa na internet.
- Objetivos: "Nova meta" com valor, prazo e onde o dinheiro está aplicado. "Ver projeção" mostra quanto terá no prazo e a comparação entre bancos.
- Gastos: "Novo lançamento" (gasto ou receita, categoria, forma de pagamento, banco/cartão e parcelas). Seção Faturas: informar a fatura de cada cartão no mês e pedir ajuda ao Assistente. "Minhas contas" guarda o saldo de cada banco, o limite do cartão (com dia de fechamento e vencimento) e mostra o limite disponível; "Recebi dinheiro" registra uma entrada avulsa com o tipo (trabalho, presente/família, venda, reembolso, outro) e o motivo — fica à parte do salário e só soma ao saldo se a pessoa ligar. Contas fixas podem ser marcadas como "Obrigatório" (transporte público, aluguel, luz). "Calendário do mês" mostra o dia do salário e os vencimentos. O dia do pagamento fica em Configurações › Dados financeiros. Botões PDF e Excel exportam o mês.
- Vale a pena?: cole o link ou o nome de um produto ou jogo; o app busca o preço e diz se é um bom momento e se cabe no orçamento.
- Bancos: ranking de bancos e corretoras com o motivo de cada nota, rendimento com o CDI do dia e juros de crédito do Banco Central.
- Simulador: R$ 100 mil virtuais para comprar e vender a preços reais.
- Alertas: "Novo alerta" (preço acima/abaixo, variação no dia, queda abaixo da média de 50 dias, lembrete). Aba Inteligentes ajusta os avisos automáticos.
- Usuários (Dono e Administrador): criar, editar, bloquear contas e redefinir senhas.
- Configurações: perfil, dados financeiros, senha, tema claro/escuro, notificações e, para o Dono, a Inteligência Artificial.`;

export async function buildAiContext(input: ContextInput): Promise<string> {
  const { data, question, mode } = input;
  const lines: string[] = [];
  dateTimeSection(lines);
  const memory = data.memory ?? [];
  lines.push("\n# Memória (o que o usuário contou em conversas anteriores; use para personalizar)");
  lines.push(memory.length ? memory.map((m) => `- ${m.text}`).join("\n") : "- Nada guardado ainda.");

  const mentioned = detectSymbols(question);
  const needsMarket = mode === "mercado" || mode === "professor";
  const needsMoney = mode === "financas" || mode === "compras";
  const portfolioSymbols = data.portfolio.filter((h) => h.kind === "variavel" && h.symbol).map((h) => h.symbol!);
  const symbols = needsMarket
    ? [...LIQUID_UNIVERSE, "^BVSP", "USDBRL=X", "EURBRL=X", "BTC-USD", "IFIX.SA", ...mentioned, ...portfolioSymbols]
    : [...mentioned, ...portfolioSymbols, "USDBRL=X"];

  const wait = 6_000;
  const [indR, copomR, newsR, tesouroR, quotesR, creditR] = await Promise.allSettled([
    mode === "geral" || mode === "app" ? Promise.reject(new Error("skip")) : within(getIndicators(), wait),
    needsMarket ? within(getCopom(), wait) : Promise.reject(new Error("skip")),
    mode === "mercado" ? within(getNews(), wait) : Promise.reject(new Error("skip")),
    needsMarket ? within(getTesouro(), wait) : Promise.reject(new Error("skip")),
    symbols.length ? within(getQuotes(symbols, 30_000), 8_000) : Promise.resolve({} as Record<string, Quote>),
    needsMoney || asksAboutDebt(question) ? within(creditRatesForAi(), asksAboutDebt(question) ? 15_000 : wait) : Promise.reject(new Error("skip")),
  ]);
  const ind = indR.status === "fulfilled" ? indR.value : undefined;
  const quotes = quotesR.status === "fulfilled" ? quotesR.value : ({} as Record<string, Quote>);
  const rates = ratesFromIndicators(ind);

  if (mode === "app") {
    lines.push(`\n# Guia do aplicativo\n${APP_GUIDE}`);
    const p = data.profile;
    lines.push(
      `\n# Situação do usuário no app (${input.user.name})\n- ${data.portfolio.length} investimentos na carteira, ${data.goals.length} objetivos, ${data.expenses.length} lançamentos de gastos, ${data.alerts.length} alertas, ${Object.values(data.learning.completed).filter((c) => c.approved).length} aulas concluídas.${p.onboarded ? "" : " Ainda não preencheu os dados financeiros."}`
    );
    return lines.join("\n");
  }

  if (mode !== "geral") indicatorsSection(lines, ind, needsMarket);

  if (copomR.status === "fulfilled") {
    const c = copomR.value;
    lines.push("\n# Copom");
    if (c.lastMeeting) {
      const lm = c.lastMeeting;
      const desc =
        lm.outcome === "aguardando"
          ? "decisão ainda não refletida nos dados"
          : lm.outcome === "manteve"
            ? `manteve a Selic em ${n2(lm.to ?? 0)}%`
            : `${lm.outcome} a Selic de ${n2(lm.from ?? 0)}% para ${n2(lm.to ?? 0)}%`;
      lines.push(`- Última reunião: ${brDate(lm.date)} — ${desc}`);
    }
    if (c.nextMeeting) lines.push(`- Próxima reunião: ${brDate(c.nextMeeting.start)} e ${brDate(c.nextMeeting.decision)} (decisão no segundo dia, após as 18h)`);
    if (c.expectation) lines.push(`- Expectativa do mercado (Focus) para a reunião ${c.expectation.meeting}: Selic em ${n2(c.expectation.value)}%`);
    if (c.history.length) lines.push(`- Mudanças recentes na Selic: ${c.history.slice(0, 4).map((h) => `${brDate(h.date)}: ${n2(h.from)}% → ${n2(h.to)}%`).join("; ")}`);
  }

  if (mode === "mercado") {
    lines.push("\n# Mercado agora (Yahoo Finance; cotações da B3 podem ter atraso de até 15 minutos)");
    const ibov = quotes["^BVSP"];
    if (ibov) lines.push(`- Ibovespa: ${ibov.price.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} pontos (${pct(ibov.changePercent)})`);
    const ifix = quotes["IFIX.SA"];
    if (ifix) lines.push(`- IFIX: ${n2(ifix.price)} pontos (${pct(ifix.changePercent)})`);
    const usd = quotes["USDBRL=X"];
    if (usd) lines.push(`- Dólar comercial agora: ${brl(usd.price)} (${pct(usd.changePercent)})`);
    const btc = quotes["BTC-USD"];
    if (btc && usd) lines.push(`- Bitcoin: US$ ${n2(btc.price)} ≈ ${brl(btc.price * usd.price)} (${pct(btc.changePercent)})`);
    const liquid = LIQUID_UNIVERSE.map((s) => quotes[s]).filter((q): q is Quote => !!q);
    if (liquid.length) {
      const fmt = (q: Quote) =>
        `${displaySymbol(q.symbol)} ${brl(q.price)} (${pct(q.changePercent)}${q.pe ? `, P/L ${n2(q.pe)}` : ""}${q.dividendYield ? `, DY ${n2(q.dividendYield)}%` : ""})`;
      const byChange = [...liquid].sort((a, b) => b.changePercent - a.changePercent);
      lines.push(`- Maiores altas hoje entre as ${liquid.length} ações mais negociadas: ${byChange.slice(0, 5).map(fmt).join("; ")}`);
      lines.push(`- Maiores quedas hoje: ${byChange.slice(-5).reverse().map(fmt).join("; ")}`);
      const dy = liquid.filter((q) => q.dividendYield).sort((a, b) => (b.dividendYield ?? 0) - (a.dividendYield ?? 0));
      if (dy.length) lines.push(`- Maiores dividend yields (12 meses): ${dy.slice(0, 5).map(fmt).join("; ")}`);
      const pe = liquid.filter((q) => q.pe && q.pe > 0).sort((a, b) => (a.pe ?? 0) - (b.pe ?? 0));
      if (pe.length) lines.push(`- Menores P/L (positivos): ${pe.slice(0, 5).map(fmt).join("; ")}`);
      const vsAvg = liquid
        .filter((q) => q.fiftyDayAverage)
        .map((q) => ({ q, d: ((q.price - q.fiftyDayAverage!) / q.fiftyDayAverage!) * 100 }))
        .sort((a, b) => a.d - b.d);
      if (vsAvg.length) {
        lines.push(`- Mais abaixo da média de 50 dias: ${vsAvg.slice(0, 4).map((x) => `${displaySymbol(x.q.symbol)} (${pct(x.d, 1)})`).join("; ")}`);
        lines.push(`- Mais acima da média de 50 dias: ${vsAvg.slice(-4).reverse().map((x) => `${displaySymbol(x.q.symbol)} (${pct(x.d, 1)})`).join("; ")}`);
      }
    } else {
      lines.push("- Cotações indisponíveis no momento.");
    }
  }

  if (tesouroR.status === "fulfilled") {
    const buyable = tesouroR.value.titles.filter((t) => t.canBuy);
    if (buyable.length) {
      lines.push(`\n# Tesouro Direto (taxas de compra, ${tesouroR.value.source})`);
      lines.push(buyable.slice(0, 10).map((t) => `- ${t.name}: ${formatTesouroRate(t)}${t.minInvestment ? `, mínimo ${brl(t.minInvestment)}` : ""}`).join("\n"));
    }
  }

  if (creditR.status === "fulfilled") {
    creditSection(lines, creditR.value);
    userCreditSection(lines, data, creditR.value);
  }

  if (mentioned.length) {
    lines.push("\n# Ativos citados na pergunta");
    lines.push(...(await Promise.all(mentioned.map((sym) => assetDetail(sym, quotes[sym])))));
  }

  if (newsR.status === "fulfilled" && newsR.value.length) {
    lines.push("\n# Notícias recentes do mercado");
    for (const n of newsR.value.slice(0, 6)) {
      const d = new Date(n.publishedAt);
      lines.push(`- [${n.source}, ${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}] ${n.title}`);
    }
  }

  if (mode === "geral") {
    lines.push(`\n# Usuário\n- Nome: ${input.user.name}. Use os dados financeiros dele só se ele perguntar sobre dinheiro.`);
    return lines.join("\n");
  }

  profileSection(lines, input);
  if (mode !== "compras") portfolioSection(lines, data, quotes, rates);
  goalsSection(lines, data, rates);
  moneySection(lines, data, needsMoney);

  if (mode === "professor" || mode === "mercado") {
    const done = Object.values(data.learning.completed).filter((c) => c.approved).length;
    const level = [...LEVELS].reverse().find((l) => data.learning.xp >= l.xp) ?? LEVELS[0];
    lines.push(`- Aulas no app: nível "${level.name}", ${data.learning.xp} XP, ${done} de ${TOTAL_LESSONS} aulas concluídas.`);
  }
  if (mode === "mercado") {
    const activeAlerts = data.alerts.filter((a) => a.active && a.symbol);
    if (activeAlerts.length) lines.push(`- Alertas de preço ativos: ${activeAlerts.slice(0, 8).map((a) => `${displaySymbol(a.symbol!)} ${a.kind} ${a.value ?? ""}`).join("; ")}`);
    if (input.notifications.length) {
      lines.push("- Notificações recentes que o usuário recebeu:");
      for (const n of input.notifications.slice(0, 6)) lines.push(`  - ${n.title}: ${n.message}`);
    }
  }
  return lines.join("\n");
}

const BASE_RULES = `Fale de forma clara e direta, sem rodeios. O tamanho acompanha o pedido: perguntas simples pedem respostas curtas; planos e comparações podem ser completos. Formate em Markdown: parágrafos curtos, listas, **negrito** nos números importantes e tabelas para comparar opções.
Nunca invente cotações, taxas, preços, datas ou notícias. Se um dado não estiver no contexto, diga que não tem esse dado agora.`;

const MODE_PROMPTS: Record<AiMode, string> = {
  geral: `Você é o Assistente do Investa, uma IA de uso geral. Ajude com qualquer assunto: escrita, estudos, ideias, dúvidas do dia a dia, tecnologia, culinária, viagens e o que mais a pessoa pedir. Só traga finanças se ela perguntar.`,
  professor: `Você é o Assistente do Investa no modo Professor. Ensine finanças e investimentos como um professor paciente:
- Comece pelo básico e avance no ritmo da pessoa. Explique cada termo técnico na primeira vez.
- Use exemplos com valores em reais e, quando ajudar, os indicadores reais do contexto (Selic, CDI, IPCA, Tesouro).
- Divida em passos curtos. No fim, ofereça um exemplo prático ou faça 1 a 3 perguntas rápidas para a pessoa testar o que aprendeu.
- Quando o assunto tiver aula na trilha do app, sugira a aula.`,
  mercado: `Você é o Assistente do Investa no modo Analista de mercado. Use os DADOS EM TEMPO REAL do contexto (indicadores do Banco Central, Copom, cotações, Tesouro Direto, notícias, carteira, metas e gastos).
- Cite números e a data/hora quando usar dados de mercado.
- "Por onde começo?": monte um plano em passos numerados baseado na situação da pessoa (quitar dívidas caras → reserva de emergência → objetivos de curto prazo → longo prazo e diversificação), com valores e produtos concretos.
- "Quais as melhores ações/investimentos hoje?": analise com os dados (altas e quedas, P/L, P/VP, dividend yield, distância da média de 50 dias), explique o porquê em linguagem simples e relacione com o perfil. Termine com UMA frase curta lembrando que é uma análise educacional, não uma recomendação individual. Não se recuse a analisar.
- Se a pessoa quiser fazer algo arriscado (colocar a reserva em cripto, pegar empréstimo para investir), alerte com clareza.`,
  financas: `Você é o Assistente do Investa no modo Minhas finanças. Seu trabalho é ajudar a pessoa a sair do aperto e não se endividar, usando os números reais dela (renda, gastos do mês, faturas por banco, parcelas futuras, reserva, dívidas) e os juros oficiais de crédito do Banco Central.
- Comece com um diagnóstico curto: quanto entra, quanto sai, quanto sobra ou falta neste mês.
- Quando a fatura passar do que a pessoa consegue pagar, monte um plano em passos com valores e prazos. Compare as saídas com números: pagar o mínimo (rotativo), parcelar a fatura, empréstimo pessoal ou consignado mais barato, renegociar, vender algo, cortar gastos. Mostre quanto cada uma custa no total. Diga claramente qual é a melhor e por quê. O rotativo quase sempre é a pior opção.
- Dê ideias práticas e específicas para o caso: cortar assinaturas e categorias que mais pesaram, trocar a fatura de banco, usar outro cartão só para o essencial, renda extra, cronograma mês a mês até zerar.
- Nunca sugira pegar um empréstimo caro para pagar outro mais barato.
- Feche com os próximos 3 passos para esta semana.`,
  compras: `Você é o Assistente do Investa no modo Vale a pena comprar?. A pessoa quer saber se deve comprar algo agora.
- Avalie duas coisas: (1) se o preço está bom, usando o histórico e as ofertas do contexto quando houver; (2) se a compra cabe no orçamento dela (saldo do mês, faturas em aberto, parcelas futuras, reserva de emergência e metas).
- Dê um veredito claro no começo: **Vale a pena**, **Espere** ou **Não compre agora**, e explique em poucos tópicos.
- Se o preço atual estiver perto do menor preço histórico, diga. Se costuma ficar mais barato (promoções sazonais, Black Friday, liquidações da Steam), diga quando esperar.
- Se a pessoa estiver apertada, seja direto: mostre quanto faltaria no mês se comprar e sugira alternativas (esperar, juntar por X meses, parcelar sem juros só se couber).
- Se não houver histórico de preço, diga isso e sugira onde conferir.`,
  app: `Você é o Assistente do Investa no modo Ajuda com o app. Responda dúvidas sobre como usar o aplicativo Investa, com passos curtos e o nome exato dos botões e telas do guia. Se algo não existir no app, diga que não existe.`,
};

// Alguns modelos tendem a responder em inglês (os dados e as notícias às vezes vêm em inglês):
// a regra vai no começo e um lembrete curto depois dos dados, que é o que o modelo lê por último.
const LANGUAGE_RULE =
  "IDIOMA: escreva a resposta inteira em português do Brasil, mesmo quando os dados, as notícias ou as fontes estiverem em inglês. Só use outro idioma se o usuário escrever nele ou pedir um texto em outro idioma. Não mostre raciocínio, rascunho ou análise interna: entregue só a resposta final, já organizada.";

export const LANGUAGE_REMINDER = "Lembrete: responda em português do Brasil.";

const MEMORY_RULE = `MEMÓRIA: se o usuário contar algo duradouro sobre ele que ainda não está na seção "Memória" (gostos, hobbies, rotina, objetivos, planos, trabalho ou estudo), termine a resposta com uma linha por fato no formato [[lembrar: fato curto em terceira pessoa]]. Ex.: [[lembrar: gosta de jogar videogame]]. Nada de dados que mudam todo dia, senhas ou documentos. Use a memória para personalizar (numa compra, considere os gostos dele, se parece impulsiva e o impacto nos próximos meses).`;

export function systemPrompt(mode: AiMode): string {
  return `${LANGUAGE_RULE}\n\n${MODE_PROMPTS[mode]}\n\n${BASE_RULES}\n\n${MEMORY_RULE}`;
}
