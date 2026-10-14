// Análise diária da IA ("Hoje: … porque …"), a "melhor próxima ação" da Início
// e os avisos com hora marcada que o celular agenda no sistema (chegam com o app
// fechado). Tudo aqui é puro: roda no PC, no celular e nos testes.
import type { Bill, DailyInsight, FinancialProfile, Goal, Indicators, Invoice, NewsItem, PriceAlert, UserSettings } from "./types";
import { DAILY_TIPS } from "./tips";
import { billDueDate } from "./finance";
import { institutionLabel } from "./banks";

/** Sem avisos automáticos das 22h às 8h. */
export const QUIET_START = 22;
export const QUIET_END = 8;
export const DEFAULT_INSIGHT_HOUR = 9;
export const INSIGHT_DISCLAIMER = "Conteúdo educativo, não é recomendação de investimento.";

export function isQuietHour(hour: number): boolean {
  return hour >= QUIET_START || hour < QUIET_END;
}

/** Hora da análise diária escolhida pela pessoa, dentro da janela permitida. */
export function insightHour(s: Partial<UserSettings>): number {
  const h = Math.round(Number(s.aiInsightHour ?? DEFAULT_INSIGHT_HOUR));
  return Number.isFinite(h) ? Math.min(QUIET_START - 1, Math.max(QUIET_END, h)) : DEFAULT_INSIGHT_HOUR;
}

// O mesmo texto vai para o Android (o trabalho em segundo plano monta o pedido com ele).
export const INSIGHT_SYSTEM_PROMPT = [
  "Você é o analista do Investa, um app brasileiro de educação financeira.",
  "Leia as manchetes e os indicadores de hoje e escreva UMA ideia curta para um investidor pessoa física, de acordo com o perfil dele.",
  "Responda em português do Brasil, exatamente em duas linhas, sem markdown:",
  "HOJE: <a ação ou o tipo de investimento que faz mais sentido hoje, até 70 caracteres>",
  "PORQUE: <o motivo, citando a notícia ou o indicador, até 220 caracteres>",
  "Regras: tom educativo; nada de promessa de ganho ou rentabilidade garantida; não cite valores do usuário; prefira classes de investimento (Tesouro Selic, CDB, Tesouro IPCA+, FIIs, ETFs) a ações específicas.",
].join("\n");

const RISK_LABEL: Record<FinancialProfile["riskProfile"], string> = { conservador: "conservador", moderado: "moderado", arrojado: "arrojado" };

/** Resumo do perfil sem valores em dinheiro (vai para a IA e para o Android). */
export function profileLine(p: Partial<FinancialProfile>): string {
  const parts = [`Perfil de risco: ${RISK_LABEL[p.riskProfile ?? "conservador"]}`];
  if (p.experience) parts.push(`experiência: ${p.experience === "nunca" ? "iniciante" : p.experience === "pouco" ? "pouca" : "experiente"}`);
  if (p.mainGoal) parts.push(`objetivo principal: ${p.mainGoal}`);
  if (p.debts && p.debts > 0) parts.push("tem dívidas");
  return `${parts.join("; ")}.`;
}

const n2 = (v: number) => v.toFixed(2).replace(".", ",");

export function indicatorsLine(ind?: Indicators | null): string {
  if (!ind) return "";
  const parts: string[] = [];
  if (ind.selic) parts.push(`Selic ${n2(ind.selic.value)}% a.a.`);
  if (ind.ipca12m) parts.push(`IPCA 12 meses ${n2(ind.ipca12m.value)}%`);
  if (ind.dollarPtax) parts.push(`dólar R$ ${n2(ind.dollarPtax.value)}`);
  return parts.join(", ");
}

export function insightUserMessage(o: { date: string; profile: Partial<FinancialProfile>; indicators?: Indicators | null; news: Pick<NewsItem, "title" | "source">[] }): string {
  const ind = indicatorsLine(o.indicators);
  return [
    `Data: ${o.date}`,
    profileLine(o.profile),
    ind ? `Indicadores: ${ind}` : "",
    "Manchetes de hoje:",
    ...o.news.slice(0, 15).map((n) => `- ${n.title} (${n.source})`),
  ]
    .filter(Boolean)
    .join("\n");
}

const clean = (s: string) => s.replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();

/** Lê a resposta da IA. Aceita variações (minúsculas, markdown, "Por quê:"). */
export function parseInsight(raw: string, date: string, at: string, model?: string): DailyInsight | null {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!text) return null;
  const hoje = /^\W*hoje\s*[:\-–]\s*(.+)$/im.exec(text)?.[1];
  const porque = /^\W*(?:porque|por qu[eê]|motivo)\s*[:\-–]\s*(.+)$/im.exec(text)?.[1];
  let title = hoje ? clean(hoje) : "";
  let why = porque ? clean(porque) : "";
  if (!title) {
    const sentences = clean(text).split(/(?<=[.!?])\s+/);
    title = sentences[0] ?? "";
    why = why || sentences.slice(1).join(" ");
  }
  title = title.replace(/[.;]+$/, "");
  if (title.length < 4) return null;
  return { date, at, title: title.slice(0, 120), why: why.slice(0, 400), model };
}

/** Texto da notificação da análise diária. */
export function insightNotification(i: DailyInsight): { title: string; message: string } {
  return { title: `Hoje: ${i.title}`, message: `${i.why ? `Porque ${i.why.replace(/^porque\s+/i, "")} ` : ""}${INSIGHT_DISCLAIMER}`.trim() };
}

// ---- melhor próxima ação (regras, funciona sem internet) ----

export interface BestActionInput {
  profile: FinancialProfile;
  invoices: Invoice[];
  goals: Goal[];
  /** Disponível para gastar no mês (já descontadas contas e faturas). */
  available: number;
  /** Faturas do mês em aberto. */
  invoicesOpen: number;
  accountsTotal: number;
  /** Total já investido (carteira). */
  invested: number;
  indicators?: Indicators | null;
  ym: string;
}

export interface BestAction {
  id: "equilibrar" | "divida" | "fatura" | "reserva" | "aporte" | "objetivo" | "investir";
  tone: "negative" | "info" | "positive";
  title: string;
  detail: string;
  why: string;
  /** Pergunta pronta para o Assistente. */
  prompt: string;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Meses de gastos que a reserva de emergência deve cobrir. */
export function reserveMonths(p: Pick<FinancialProfile, "riskProfile">): number {
  return p.riskProfile === "arrojado" ? 4 : 6;
}

export function bestAction(i: BestActionInput): BestAction {
  const p = i.profile;
  const income = p.salary + p.extraIncome;
  const monthlyCost = p.fixedExpenses + p.variableExpenses || income * 0.7;
  const selic = i.indicators?.selic?.value;
  const ipca = i.indicators?.ipca12m?.value;
  const selicTxt = selic ? ` (Selic em ${n2(selic)}% a.a.)` : "";

  if (i.available < 0) {
    return {
      id: "equilibrar",
      tone: "negative",
      title: "Equilibre o mês antes de investir",
      detail: `O mês está ${brl(-i.available)} no vermelho. Corte um gasto que não é essencial e adie compras parceladas.`,
      why: "Investir com o mês negativo vira dívida no cartão, que custa muito mais do que qualquer investimento rende.",
      prompt: "Meu mês está no vermelho. Me ajude a cortar gastos e equilibrar as contas com base nos meus dados.",
    };
  }
  const openInvoices = i.invoices.filter((v) => v.ym <= i.ym && !v.paid);
  const late = openInvoices.filter((v) => v.ym < i.ym);
  if (late.length || i.invoicesOpen > i.available + i.accountsTotal + income * 0.5) {
    const total = (late.length ? late : openInvoices).reduce((s, v) => s + v.amount, 0);
    return {
      id: "fatura",
      tone: "negative",
      title: "Pague a fatura inteira, nada de rotativo",
      detail: `Faturas em aberto somam ${brl(total)}. Se não der para pagar tudo, parcele a fatura com o banco em vez de pagar o mínimo.`,
      why: "O rotativo do cartão cobra mais de 400% ao ano. Nenhum investimento chega perto disso.",
      prompt: "Tenho faturas em aberto. Como pago sem cair no rotativo do cartão?",
    };
  }
  if (p.debts > 0) {
    return {
      id: "divida",
      tone: "negative",
      title: "Quite as dívidas caras primeiro",
      detail: `Você tem ${brl(p.debts)} em dívidas. Comece pela de juros mais altos (cartão, cheque especial) e tente renegociar.`,
      why: `Pagar uma dívida de juros altos é um "investimento" com retorno garantido, maior que a renda fixa${selicTxt}.`,
      prompt: "Quero quitar minhas dívidas. Qual pago primeiro e como negocio?",
    };
  }
  const target = Math.round(monthlyCost * reserveMonths(p));
  if (target > 0 && p.emergencyReserve < target) {
    const missing = target - p.emergencyReserve;
    const monthly = Math.max(0, Math.min(missing, p.monthlyInvest || i.available * 0.3));
    return {
      id: "reserva",
      tone: "info",
      title: "Monte sua reserva de emergência",
      detail: `Faltam ${brl(missing)} para ${reserveMonths(p)} meses de gastos${monthly > 0 ? `. Guardando ${brl(monthly)} por mês, chega lá em ${Math.ceil(missing / monthly)} meses` : ""}. Use Tesouro Selic ou CDB com liquidez diária (100% do CDI).`,
      why: `A reserva cobre imprevistos sem dívida, e esses investimentos rendem perto da Selic${selicTxt} com resgate a qualquer hora.`,
      prompt: "Quero montar minha reserva de emergência. Onde guardo e quanto por mês, pelo meu perfil?",
    };
  }
  if (!p.monthlyInvest && i.available > 50) {
    const suggestion = Math.round((i.available * 0.5) / 10) * 10;
    return {
      id: "aporte",
      tone: "info",
      title: "Defina um valor para investir todo mês",
      detail: `Sobram ${brl(i.available)} no mês. Que tal separar ${brl(suggestion)} assim que receber?`,
      why: "Investir no começo do mês, sempre o mesmo valor, funciona melhor do que investir o que sobra.",
      prompt: "Quanto devo investir por mês com a minha renda e meus gastos?",
    };
  }
  const now = new Date(`${i.ym}-15T12:00:00`);
  const late2 = i.goals
    .map((g) => {
      const saved = g.allocations.reduce((s, a) => s + a.amount, 0);
      const monthlyNow = g.allocations.reduce((s, a) => s + a.monthly, 0);
      const months = Math.max(1, Math.round((Date.parse(g.deadline) - now.getTime()) / (30.4 * 86_400_000)));
      const need = (g.target - saved) / months;
      return { g, need, monthlyNow, saved };
    })
    .filter((x) => x.saved < x.g.target && x.need > x.monthlyNow * 1.1 && Number.isFinite(x.need))
    .sort((a, b) => b.need - b.monthlyNow - (a.need - a.monthlyNow))[0];
  if (late2) {
    return {
      id: "objetivo",
      tone: "info",
      title: `Reforce o objetivo "${late2.g.name}"`,
      detail: `Para chegar no prazo, são ${brl(late2.need)} por mês (hoje ${brl(late2.monthlyNow)}). Aumente o aporte ou ajuste o prazo.`,
      why: "Ajustar cedo é mais fácil do que correr atrás no fim.",
      prompt: `Meu objetivo "${late2.g.name}" está atrasado. Como coloco ele em dia?`,
    };
  }
  const realRate = selic !== undefined && ipca !== undefined ? selic - ipca : undefined;
  const highReal = realRate !== undefined && realRate >= 5;
  const byProfile =
    p.riskProfile === "conservador"
      ? `Tesouro IPCA+ ou CDB/LCI de bancos sólidos${highReal ? ", aproveitando os juros altos" : ""}.`
      : p.riskProfile === "moderado"
        ? "uns 70% em renda fixa (Tesouro IPCA+, CDB) e 30% em FIIs e ETFs de ações."
        : "ETFs de ações do Brasil e do exterior (como BOVA11 e IVVB11), com aporte todo mês, sem tentar acertar o momento.";
  return {
    id: "investir",
    tone: "positive",
    title: "Siga investindo pelo seu perfil",
    detail: `Reserva em dia. Com perfil ${RISK_LABEL[p.riskProfile]}, o aporte de ${brl(p.monthlyInvest || i.available * 0.5)} pode ir para ${byProfile}`,
    why: realRate !== undefined ? `O juro real (Selic menos inflação) está em ${n2(realRate)}% ao ano: ${highReal ? "renda fixa paga bem acima da inflação" : "vale diversificar além da renda fixa"}.` : "Diversificar pelo seu perfil equilibra risco e retorno no longo prazo.",
    prompt: "Minha reserva está em dia. Onde invisto o aporte deste mês pelo meu perfil?",
  };
}

// ---- avisos com hora marcada (agendados no sistema do celular) ----

export interface ScheduledNotice {
  /** A mesma chave que o motor de avisos usa: o aviso não chega duas vezes. */
  key: string;
  at: Date;
  title: string;
  message: string;
  link?: string;
}

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at9 = (iso: string, days = 0) => {
  const d = new Date(`${iso}T09:00:00`);
  d.setDate(d.getDate() + days);
  return d;
};
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function tipFor(d: Date): { title: string; message: string } {
  const start = new Date(d.getFullYear(), 0, 0);
  const day = Math.floor((d.getTime() - start.getTime()) / DAY);
  const tip = DAILY_TIPS[day % DAILY_TIPS.length];
  return { title: `Dica do dia: ${tip.title}`, message: tip.message };
}

function nextYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

/** Vencimento de uma fatura (dia ajustado aos meses curtos). */
export function invoiceDueDate(inv: Pick<Invoice, "ym" | "dueDay">): string | null {
  if (!inv.dueDay) return null;
  const [y, m] = inv.ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${inv.ym}-${pad(Math.min(Math.max(1, inv.dueDay), last))}`;
}

/**
 * Avisos que já se sabe quando vão acontecer: lembretes, contas fixas,
 * faturas, dica do dia e resumo de domingo. `done` são as chaves já avisadas.
 */
export function upcomingNotices(
  d: { settings: Partial<UserSettings>; alerts: PriceAlert[]; bills: Bill[]; invoices: Invoice[] },
  now = new Date(),
  done: Record<string, unknown> = {},
  limit = 60
): ScheduledNotice[] {
  if (d.settings.desktopNotifications === false) return [];
  const out: ScheduledNotice[] = [];
  const horizon = now.getTime() + 45 * DAY;
  const add = (n: ScheduledNotice) => {
    const t = n.at.getTime();
    if (t > now.getTime() && t <= horizon && !done[n.key]) out.push(n);
  };
  for (const a of d.alerts) {
    if (a.kind !== "lembrete" || !a.active || !a.remindAt) continue;
    const at = new Date(a.remindAt);
    if (!Number.isNaN(at.getTime())) add({ key: `rem-${a.id}-${a.remindAt}`, at, title: a.title || "Lembrete", message: a.message || "Você pediu para ser lembrado agora." });
  }
  const ym = isoDate(now).slice(0, 7);
  for (const month of [ym, nextYm(ym)]) {
    for (const b of d.bills) {
      if (!b.active || b.paid.includes(month)) continue;
      const due = billDueDate(b, month);
      const value = money(b.amount);
      const day = Number(due.slice(8));
      add({ key: `conta-${b.id}-${month}-antes`, at: at9(due, -3), title: `${b.name} vence em 3 dias`, message: `${value} no dia ${day}. Quando pagar, toque em "Paguei" em Gastos.`, link: "/gastos" });
      add({ key: `conta-${b.id}-${month}-hoje`, at: at9(due), title: `${b.name} vence hoje`, message: `${value}. Já pagou? Marque em Gastos para o disponível do mês ficar certo.`, link: "/gastos" });
      add({ key: `conta-${b.id}-${month}-atrasada`, at: at9(due, 1), title: `${b.name} está atrasada`, message: `${value} venceu no dia ${day}. Pagar logo evita multa e juros.`, link: "/gastos" });
    }
  }
  for (const inv of d.invoices) {
    const due = invoiceDueDate(inv);
    if (inv.paid || !due) continue;
    add({ key: `fatura-${inv.id}-antes`, at: at9(due, -2), title: `Fatura ${institutionLabel(inv.institution)} vence em 2 dias`, message: `${money(inv.amount)} no dia ${Number(due.slice(8))}. Pague o total para fugir do rotativo.`, link: "/gastos" });
    add({ key: `fatura-${inv.id}-hoje`, at: at9(due), title: `Fatura ${institutionLabel(inv.institution)} vence hoje`, message: `${money(inv.amount)}. Já pagou? Marque em Gastos.`, link: "/gastos" });
  }
  const today = isoDate(now);
  for (let i = 0; i < 7; i++) {
    const at = at9(today, i);
    const date = isoDate(at);
    if (d.settings.dailyTip) add({ key: `tip-${date}`, at, ...tipFor(at) });
    if (d.settings.weeklySummary !== false && at.getDay() === 0) {
      add({ key: `semana-${date}`, at, title: "Resumo da sua semana", message: "Veja quanto você gastou, o que vence nesta semana e o disponível do mês.", link: "/gastos" });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, limit);
}
