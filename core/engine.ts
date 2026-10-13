import type { AlertRuntimeState, AppNotification, Holding, PriceAlert, Quote, UserSettings } from "@shared/types";
import { displaySymbol } from "@shared/catalog";
import { institutionLabel } from "@shared/banks";
import { DAILY_TIPS } from "@shared/tips";
import { invoiceDueDate } from "@shared/insight";
import { billDueDate, currentYm, monthBudget, pendingFor, summarizeMonth, weekSummary, ymLabel } from "@shared/finance";
import type { Store } from "./store";
import { getQuotes } from "./yahoo";
import { getCopom, getIndicators } from "./bcb";
import { nowInSaoPaulo, todayIsoSaoPaulo } from "./http";
import { fxFor } from "./portfolio";
import { identity, pruneInbox, sameInbox } from "./inbox";

type NewNotification = Omit<AppNotification, "id" | "key" | "createdAt" | "read">;

const DAY = 86_400_000;
/** Lembrete atrasado mais que isso (app fechado, aparelho novo) já não é avisado. */
const REMINDER_LATE_MAX = 7 * DAY;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number, d = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(d).replace(".", ",")}%`;
const n2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brDate = (iso: string) => iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/");

function priceLabel(q: Quote): string {
  return q.currency === "BRL" ? brl(q.price) : `${q.currency} ${n2(q.price)}`;
}

function valueLabel(q: Quote, v: number): string {
  return q.currency === "BRL" ? brl(v) : `${q.currency} ${n2(v)}`;
}

export class AlertEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private userId: string | null = null;
  private running = false;

  /** Avisado quando o motor muda dados do usuário (para sincronizar e atualizar a tela). */
  onDataChanged?: (userId: string, keys: string[]) => void;
  /** Avisado quando mudam os avisos ou o estado dos alertas (para sincronizar com os outros aparelhos). */
  onInboxChanged?: (userId: string) => void;
  /** Enquanto falso, o motor não avisa nem mexe em dados (espera a primeira sincronização com a nuvem). */
  dataReady = true;
  /** Conta cujo registro de avisos está sendo preenchido em silêncio. */
  private seeding: string | null = null;

  constructor(private store: Store, private emit: (userId: string, n: AppNotification) => void) {}

  start(userId: string): void {
    this.stop();
    this.userId = userId;
    setTimeout(() => void this.tick(), 3_000);
    this.timer = setInterval(() => void this.tick(), 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.userId = null;
  }

  runNow(): void {
    // As checagens locais (lembretes, faturas, contas, caixinhas) rodam na hora,
    // mesmo se a rodada anterior ainda estiver esperando cotações.
    if (this.userId && this.dataReady) this.localChecks(this.userId);
    void this.tick();
  }

  private localChecks(uid: string): void {
    this.reminders(uid, this.store.getData(uid, "alerts"));
    this.invoices(uid);
    this.bills(uid);
    this.boxes(uid);
  }

  /**
   * Cria uma notificação uma única vez por chave. A chave identifica a
   * ocorrência (ex.: conta X vencendo no mês Y) e vai para o registro da conta,
   * que é sincronizado: o mesmo aviso não volta depois de sair e entrar, ao
   * reabrir o app nem em outro aparelho.
   */
  push(userId: string, n: NewNotification, key?: string): boolean {
    const k = key ?? `${n.type}-${n.title}-${todayIsoSaoPaulo()}`;
    const st = this.store.engine(userId);
    if (st.keys[k]) return false;
    const now = new Date().toISOString();
    st.keys[k] = now;
    if (this.seeding === userId) {
      this.store.save();
      this.onInboxChanged?.(userId);
      return false;
    }
    const notification: AppNotification = { ...n, id: globalThis.crypto.randomUUID(), key: k, createdAt: now, read: false };
    this.store.setNotifications(userId, [notification, ...this.store.getNotifications(userId).filter((x) => identity(x) !== k)]);
    this.emit(userId, notification);
    this.onInboxChanged?.(userId);
    return true;
  }

  /**
   * Dispara apenas quando a condição passa de falsa para verdadeira (com rearme).
   * Devolve a chave da ocorrência: o id do alerta mais o momento do último
   * rearme, igual em todos os aparelhos depois de sincronizar.
   */
  private edge(userId: string, id: string, condition: boolean, rearm: boolean): string | null {
    const prev = this.store.engine(userId).alertState[id];
    const now = new Date().toISOString();
    if (condition && !prev?.fired) {
      this.setAlertState(userId, id, { fired: true, firedAt: now, changedAt: now });
      return `${id}@${prev?.changedAt ?? "0"}`;
    }
    if (!condition && prev?.fired && rearm) this.setAlertState(userId, id, { fired: false, changedAt: now });
    return null;
  }

  private setAlertState(userId: string, id: string, state: AlertRuntimeState): void {
    this.store.engine(userId).alertState[id] = state;
    this.store.save();
    this.onInboxChanged?.(userId);
  }

  async tick(): Promise<void> {
    const uid = this.userId;
    if (!uid || this.running || !this.dataReady) return;
    this.running = true;
    try {
      const user = this.store.findUser(uid);
      if (!user) return;
      const st = this.store.engine(uid);
      if (!st.seeded) {
        // Primeira vez desta conta sem registro de avisos (nem aqui, nem na nuvem):
        // numa conta já em uso, o que está acontecendo agora é antigo e fica
        // registrado sem avisar. Conta nova recebe tudo, inclusive as boas-vindas.
        const isNew = !this.store.getData(uid, "profile").onboarded || Date.now() - Date.parse(user.createdAt) < 2 * DAY;
        if (!isNew && !st.keys.welcome) this.seeding = uid;
      }
      const settings = this.store.getData(uid, "settings");
      const alerts = this.store.getData(uid, "alerts");
      const portfolio = this.store.getData(uid, "portfolio");

      this.push(
        uid,
        {
          type: "sistema",
          tone: "info",
          title: `Bem-vindo ao Investa, ${user.name.split(" ")[0]}!`,
          message: "Aqui você aprende a investir, acompanha o mercado em tempo real e planeja seus objetivos. Comece pelas Aulas ou pergunte qualquer coisa ao Assistente.",
        },
        "welcome"
      );

      this.localChecks(uid);

      const variable = portfolio.filter((h) => h.kind === "variavel" && h.symbol);
      const symbols = [
        ...alerts.filter((a) => a.active && a.symbol && a.kind !== "lembrete").map((a) => a.symbol!),
        ...(settings.smartAlerts ? variable.map((h) => h.symbol!) : []),
        "^BVSP",
        "USDBRL=X",
        "EURBRL=X",
      ];
      const quotes = await getQuotes(symbols, 45_000).catch(() => ({}) as Record<string, Quote>);

      this.priceAlerts(uid, alerts, quotes);
      if (settings.smartAlerts) this.smart(uid, variable, quotes, settings);
      if (settings.marketEvents) await this.marketEvents(uid, quotes);
      if (settings.dailyTip) this.tip(uid);
      if (settings.weeklySummary !== false) this.weekly(uid);
      this.prune(uid);
    } finally {
      const st = this.store.engine(uid);
      if (!st.seeded && this.store.findUser(uid)) {
        st.seeded = true;
        this.store.save();
        this.onInboxChanged?.(uid);
      }
      if (this.seeding === uid) this.seeding = null;
      this.running = false;
    }
  }

  /** Avisa uma vez por mês quando as faturas em aberto passam da renda. */
  /** Domingo: resumo da semana (uma vez por domingo). */
  private weekly(userId: string): void {
    const now = nowInSaoPaulo();
    if (now.getDay() !== 0 || now.getHours() < 9) return;
    const today = todayIsoSaoPaulo();
    const expenses = this.store.getData(userId, "expenses");
    const bills = this.store.getData(userId, "bills");
    const profile = this.store.getData(userId, "profile");
    const w = weekSummary(expenses, bills, today);
    const ym = currentYm();
    const budget = monthBudget(
      summarizeMonth(expenses, ym, profile.salary, profile.extraIncome),
      this.store.getData(userId, "invoices"),
      ym,
      now,
      pendingFor(bills, this.store.getData(userId, "planned"), ym, this.store.getData(userId, "boxes"))
    );
    const diff = w.previous ? Math.round(((w.spent - w.previous) / w.previous) * 100) : 0;
    const parts = [
      `Você gastou ${brl(w.spent)} nesta semana${w.previous ? ` (${diff >= 0 ? "+" : ""}${diff}% em relação à anterior)` : ""}${w.topCategory ? `, mais em ${w.topCategory.category}` : ""}.`,
      `Disponível no mês: ${brl(budget.available)}${budget.perDay !== undefined && budget.available > 0 ? ` (${brl(budget.perDay)} por dia)` : ""}.`,
      w.dueSoon.length ? `Vence nesta semana: ${w.dueSoon.map((d) => `${d.name} ${brl(d.amount)}`).join(", ")}.` : "",
    ].filter(Boolean);
    this.push(userId, { type: "sistema", tone: budget.available < 0 ? "negative" : "info", title: "Resumo da sua semana", message: parts.join(" "), link: "/gastos" }, `semana-${today}`);
  }

  /** Caixinhas: no dia marcado, guarda o valor do mês (uma vez por mês). */
  private boxes(userId: string): void {
    if (!this.dataReady) return;
    const today = todayIsoSaoPaulo();
    const ym = today.slice(0, 7);
    const day = Number(today.slice(8, 10));
    const list = this.store.getData(userId, "boxes");
    let changed = false;
    const next = list.map((b) => {
      if (!b.active || b.lastDeposit === ym || day < Math.min(b.day, 28) || b.monthly <= 0) return b;
      if (b.target && b.balance >= b.target) return b;
      const amount = b.target ? Math.min(b.monthly, Math.round((b.target - b.balance) * 100) / 100) : b.monthly;
      changed = true;
      const balance = Math.round((b.balance + amount) * 100) / 100;
      const reached = b.target > 0 && balance >= b.target;
      this.push(
        userId,
        {
          type: "carteira",
          tone: "positive",
          title: reached ? `Caixinha ${b.name} completa!` : `${brl(amount)} na caixinha ${b.name}`,
          message: reached ? `Você chegou a ${brl(balance)}. Meta batida.` : `Agora ela tem ${brl(balance)}${b.target ? ` de ${brl(b.target)}` : ""}. Lembre de transferir no seu banco.`,
          link: "/objetivos",
        },
        `caixinha-${b.id}-${ym}`
      );
      return { ...b, balance, lastDeposit: ym, history: [...b.history, { date: today, amount, note: "Depósito automático" }].slice(-120) };
    });
    if (changed) {
      this.store.setData(userId, "boxes", next);
      this.onDataChanged?.(userId, ["boxes"]);
    }
  }

  /** Contas fixas: aviso 3 dias antes, no dia e quando atrasa. */
  private bills(userId: string): void {
    const today = todayIsoSaoPaulo();
    const ym = today.slice(0, 7);
    for (const b of this.store.getData(userId, "bills")) {
      if (!b.active || b.paid.includes(ym)) continue;
      const due = billDueDate(b, ym);
      const days = Math.round((Date.parse(`${due}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000);
      const value = brl(b.amount);
      if (days === 3 || days === 2) {
        this.push(userId, { type: "carteira", tone: "info", title: `${b.name} vence em ${days} dias`, message: `${value} no dia ${Number(due.slice(8))}. Quando pagar, toque em "Paguei" em Gastos.`, link: "/gastos" }, `conta-${b.id}-${ym}-antes`);
      } else if (days === 0) {
        this.push(userId, { type: "carteira", tone: "info", title: `${b.name} vence hoje`, message: `${value}. Já pagou? Marque em Gastos para o disponível do mês ficar certo.`, link: "/gastos" }, `conta-${b.id}-${ym}-hoje`);
      } else if (days < 0 && days >= -5) {
        this.push(userId, { type: "carteira", tone: "negative", title: `${b.name} está atrasada`, message: `${value} venceu no dia ${Number(due.slice(8))}. Pagar logo evita multa e juros.`, link: "/gastos" }, `conta-${b.id}-${ym}-atrasada`);
      }
    }
  }

  private invoices(userId: string): void {
    const today = todayIsoSaoPaulo();
    const ym = today.slice(0, 7);
    // Vencimento das faturas: 2 dias antes e no dia (as mesmas chaves que o celular agenda).
    const accounts = this.store.getData(userId, "accounts");
    for (const inv of this.store.getData(userId, "invoices")) {
      // Sem dia na fatura, usa o vencimento do cartão daquele banco.
      const due = invoiceDueDate({ ym: inv.ym, dueDay: inv.dueDay ?? accounts.find((a) => a.institution === inv.institution)?.card?.dueDay });
      if (inv.paid || !due) continue;
      const days = Math.round((Date.parse(`${due}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / DAY);
      if (days === 2 || days === 1) {
        this.push(userId, { type: "carteira", tone: "info", title: `Fatura ${institutionLabel(inv.institution)} vence em ${days === 1 ? "1 dia" : "2 dias"}`, message: `${brl(inv.amount)} no dia ${Number(due.slice(8))}. Pague o total para fugir do rotativo.`, link: "/gastos" }, `fatura-${inv.id}-antes`);
      } else if (days === 0) {
        this.push(userId, { type: "carteira", tone: "info", title: `Fatura ${institutionLabel(inv.institution)} vence hoje`, message: `${brl(inv.amount)}. Já pagou? Marque em Gastos.`, link: "/gastos" }, `fatura-${inv.id}-hoje`);
      }
    }
    const profile = this.store.getData(userId, "profile");
    const open = this.store.getData(userId, "invoices").filter((i) => i.ym === ym && !i.paid);
    const total = open.reduce((s, i) => s + i.amount, 0);
    const income = profile.salary + profile.extraIncome;
    if (!total || !income) return;
    if (total > income) {
      this.push(
        userId,
        {
          type: "carteira",
          tone: "negative",
          title: "Faturas acima da sua renda",
          message: `As faturas em aberto de ${ymLabel(ym)} somam ${brl(total)}, mais que a sua renda de ${brl(income)}. Abra Gastos e use "Pedir ajuda ao Assistente" para montar um plano.`,
          link: "/gastos",
        },
        `fatura-renda-${ym}`
      );
    } else if (total > income * 0.6) {
      this.push(
        userId,
        {
          type: "carteira",
          tone: "info",
          title: "Faturas pesando no mês",
          message: `As faturas de ${ymLabel(ym)} somam ${brl(total)}, ${Math.round((total / income) * 100)}% da sua renda. Vale revisar os gastos no cartão.`,
          link: "/gastos",
        },
        `fatura-60-${ym}`
      );
    }
  }

  private reminders(uid: string, alerts: PriceAlert[]): void {
    const now = Date.now();
    for (const a of alerts) {
      if (a.kind !== "lembrete" || !a.active || !a.remindAt) continue;
      const at = Date.parse(a.remindAt);
      if (!Number.isFinite(at)) continue;
      const st = this.store.engine(uid);
      const fired = st.alertState[a.id]?.fired;
      if (at > now) {
        // Horário trocado para o futuro: volta a esperar.
        if (fired) this.setAlertState(uid, a.id, { fired: false, changedAt: new Date().toISOString() });
        continue;
      }
      const key = `rem-${a.id}-${a.remindAt}`;
      if (now - at <= REMINDER_LATE_MAX) {
        this.push(uid, { type: "alerta", tone: "info", title: a.title || "Lembrete", message: a.message || "Você pediu para ser lembrado agora." }, key);
      }
      if (!fired) this.setAlertState(uid, a.id, { fired: true, firedAt: st.keys[key] ?? a.remindAt, changedAt: new Date().toISOString() });
    }
  }

  private priceAlerts(uid: string, alerts: PriceAlert[], quotes: Record<string, Quote>): void {
    for (const a of alerts) {
      if (!a.active || !a.symbol || a.kind === "lembrete") continue;
      const q = quotes[a.symbol];
      if (!q || a.value === undefined) continue;
      const name = displaySymbol(a.symbol);
      let cond = false;
      let title = "";
      let details = "";
      let tone: AppNotification["tone"] = "neutral";
      if (a.kind === "preco-acima") {
        cond = q.price >= a.value;
        title = `${name} passou de ${valueLabel(q, a.value)}`;
        details = `Agora está em ${priceLabel(q)} (${pct(q.changePercent)} hoje).`;
        tone = "positive";
      } else if (a.kind === "preco-abaixo") {
        cond = q.price <= a.value;
        title = `${name} caiu abaixo de ${valueLabel(q, a.value)}`;
        details = `Agora está em ${priceLabel(q)} (${pct(q.changePercent)} hoje).`;
        tone = "negative";
      } else if (a.kind === "variacao-dia") {
        cond = Math.abs(q.changePercent) >= a.value;
        title = `${name} ${q.changePercent >= 0 ? "dispara" : "despenca"} ${pct(q.changePercent)} hoje`;
        details = `Preço atual ${priceLabel(q)}. Seu alerta era para variações a partir de ${n2(a.value)}%.`;
        tone = q.changePercent >= 0 ? "positive" : "negative";
      } else if (a.kind === "abaixo-media" && q.fiftyDayAverage) {
        const diff = ((q.price - q.fiftyDayAverage) / q.fiftyDayAverage) * 100;
        cond = diff <= -a.value;
        title = `${name} está ${n2(Math.abs(diff))}% abaixo da média`;
        details = `Preço ${priceLabel(q)} contra média de 50 dias de ${valueLabel(q, q.fiftyDayAverage)}. Pode ser oportunidade — confira os fundamentos antes.`;
        tone = "info";
      }
      const occurrence = this.edge(uid, a.id, cond, a.repeat);
      if (occurrence) {
        this.push(uid, {
          type: "alerta",
          tone,
          symbol: a.symbol,
          title: a.title?.trim() || title,
          message: a.message?.trim() ? `${a.message.trim()} — ${details}` : details,
          link: `/mercado/${encodeURIComponent(a.symbol)}`,
        }, `alerta-${occurrence}`);
      }
    }
  }

  private smart(uid: string, holdings: Holding[], quotes: Record<string, Quote>, s: UserSettings): void {
    for (const h of holdings) {
      const q = quotes[h.symbol!];
      if (!q || !h.avgPrice || !h.quantity) continue;
      const name = displaySymbol(h.symbol!);
      const fx = fxFor(q.currency, quotes);
      const ret = ((q.price - h.avgPrice) / h.avgPrice) * 100;
      const profit = (q.price - h.avgPrice) * h.quantity * fx;
      const link = `/mercado/${encodeURIComponent(h.symbol!)}`;
      const fire = (id: string, condition: boolean, rearm: boolean, n: Pick<AppNotification, "tone" | "title" | "message">) => {
        const occurrence = this.edge(uid, id, condition, rearm);
        if (occurrence) this.push(uid, { type: "carteira", symbol: h.symbol, link, ...n }, `carteira-${occurrence}`);
      };

      fire(`gain:${h.id}`, ret >= s.gainThreshold, ret < s.gainThreshold - 2, {
        tone: "positive",
        title: `${name} está dando bom: ${pct(ret, 1)}`,
        message: `Sua posição valorizou ${pct(ret, 1)} sobre o preço médio de ${valueLabel(q, h.avgPrice)} (lucro de ${brl(profit)}). Avalie se mantém, conforme seu objetivo, ou se realiza parte do lucro.`,
      });
      fire(`loss:${h.id}`, ret <= -s.lossThreshold, ret > -s.lossThreshold + 2, {
        tone: "negative",
        title: `${name} está ${pct(ret, 1)} abaixo do seu preço médio`,
        message: `Prejuízo momentâneo de ${brl(profit)}. Quedas fazem parte; verifique se algo mudou nos fundamentos antes de decidir vender ou aproveitar para comprar mais barato.`,
      });
      if (q.fiftyDayAverage) {
        const diff = ((q.price - q.fiftyDayAverage) / q.fiftyDayAverage) * 100;
        fire(`low:${h.id}`, diff <= -s.deviationThreshold, diff > -s.deviationThreshold + 1.5, {
          tone: "info",
          title: `${name} está mais barata que o normal`,
          message: `Está ${n2(Math.abs(diff))}% abaixo da média dos últimos 50 dias (${priceLabel(q)} contra ${valueLabel(q, q.fiftyDayAverage)}). Se os fundamentos continuam bons, pode ser um bom momento para aportar.`,
        });
        fire(`high:${h.id}`, diff >= s.deviationThreshold, diff < s.deviationThreshold - 1.5, {
          tone: "positive",
          title: `${name} está acima do normal`,
          message: `Está ${n2(diff)}% acima da média de 50 dias (${priceLabel(q)}). Sua posição está ${pct(ret, 1)} no total. Evite comprar no impulso em momentos de euforia.`,
        });
      }
    }
  }

  private async marketEvents(uid: string, quotes: Record<string, Quote>): Promise<void> {
    const today = todayIsoSaoPaulo();
    const now = nowInSaoPaulo();
    try {
      const copom = await getCopom();
      const next = copom.nextMeeting;
      if (next) {
        const daysTo = (Date.parse(next.start) - Date.parse(today)) / 86_400_000;
        if (daysTo >= 0 && daysTo <= 6) {
          const exp = copom.expectation ? ` O mercado espera a Selic em ${n2(copom.expectation.value)}% (Boletim Focus).` : "";
          this.push(
            uid,
            {
              type: "mercado",
              tone: "info",
              title: "Reunião do Copom esta semana",
              message: `O Copom se reúne em ${brDate(next.start)} e ${brDate(next.decision)} para decidir a taxa Selic, hoje em ${n2(copom.current ?? 0)}%.${exp} A decisão afeta a renda fixa, a bolsa e os juros de empréstimos. Você será avisado do resultado.`,
            },
            `copom-pre-${next.decision}`
          );
        }
      }
      const last = copom.lastMeeting;
      if (last && last.outcome !== "aguardando" && last.to !== undefined) {
        const daysAgo = (Date.parse(today) - Date.parse(last.date)) / 86_400_000;
        if (daysAgo <= 10) {
          const ind = await getIndicators().catch(() => undefined);
          const cdi = ind?.cdi?.value;
          const effect =
            last.outcome === "reduziu"
              ? "A renda fixa pós-fixada (CDI e Tesouro Selic) passa a render um pouco menos; ações e FIIs costumam reagir bem a cortes de juros."
              : last.outcome === "elevou"
                ? "CDBs, Tesouro Selic e outros pós-fixados passam a render mais; crédito fica mais caro e a bolsa pode sentir."
                : `Seus investimentos atrelados ao CDI seguem rendendo cerca de ${n2(cdi ?? last.to)}% ao ano.`;
          const title =
            last.outcome === "manteve"
              ? `Copom manteve a Selic em ${n2(last.to)}%`
              : `Copom ${last.outcome} a Selic para ${n2(last.to)}%`;
          const fromTxt = last.outcome === "manteve" ? "" : ` (antes ${n2(last.from ?? 0)}%)`;
          this.push(uid, { type: "mercado", tone: last.outcome === "elevou" ? "negative" : last.outcome === "reduziu" ? "positive" : "neutral", title, message: `Resultado da reunião de ${brDate(last.date)}: Selic em ${n2(last.to)}%${fromTxt}. ${effect}` }, `copom-res-${last.date}`);
        }
      }
    } catch {
      // sem conexão com o Banco Central
    }

    try {
      const ind = await getIndicators();
      const ipca = ind.ipcaMonth;
      if (ipca) {
        const ref = ipca.date.slice(0, 7);
        const ageMonths = (now.getFullYear() * 12 + now.getMonth()) - (Number(ref.slice(0, 4)) * 12 + Number(ref.slice(5, 7)) - 1);
        if (ageMonths <= 2) {
          const y = ind.ipca12m ? ` Acumulado em 12 meses: ${n2(ind.ipca12m.value)}%.` : "";
          this.push(
            uid,
            {
              type: "mercado",
              tone: ipca.value > 0.5 ? "negative" : "neutral",
              title: `Inflação de ${ymLabel(ref)}: ${n2(ipca.value)}%`,
              message: `O IBGE divulgou o IPCA de ${ymLabel(ref)}.${y} Para não perder poder de compra, seus investimentos precisam render acima disso.`,
            },
            `ipca-${ref}`
          );
        }
      }
    } catch {
      // sem conexão
    }

    const afternoon = now.getHours() >= 15;
    const ibov = quotes["^BVSP"];
    if (ibov && afternoon && Math.abs(ibov.changePercent) >= 1.5) {
      const up = ibov.changePercent > 0;
      this.push(
        uid,
        {
          type: "mercado",
          tone: up ? "positive" : "negative",
          symbol: "^BVSP",
          link: "/mercado/%5EBVSP",
          title: `Ibovespa ${up ? "sobe" : "cai"} ${pct(ibov.changePercent)} hoje`,
          message: `O principal índice da bolsa está em ${ibov.price.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} pontos. ${up ? "Dia positivo para quem tem ações." : "Dias de queda acontecem — mantenha o foco no longo prazo."}`,
        },
        `ibov-${today}`
      );
    }
    const usd = quotes["USDBRL=X"];
    if (usd && Math.abs(usd.changePercent) >= 1) {
      this.push(
        uid,
        {
          type: "mercado",
          tone: "info",
          symbol: "USDBRL=X",
          link: "/mercado/USDBRL%3DX",
          title: `Dólar ${usd.changePercent > 0 ? "sobe" : "cai"} ${pct(usd.changePercent)}: ${brl(usd.price)}`,
          message: usd.changePercent > 0 ? "Dólar mais caro encarece viagens e produtos importados, e valoriza investimentos no exterior." : "Dólar mais barato é bom para viagens e compras importadas.",
        },
        `usd-${today}`
      );
    }
  }

  private tip(uid: string): void {
    const now = nowInSaoPaulo();
    if (now.getHours() < 8) return;
    const start = new Date(now.getFullYear(), 0, 0);
    const day = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
    const tip = DAILY_TIPS[day % DAILY_TIPS.length];
    this.push(uid, { type: "dica", tone: "info", title: `Dica do dia: ${tip.title}`, message: tip.message }, `tip-${todayIsoSaoPaulo()}`);
  }

  /**
   * Limpa o registro com mais de 90 dias. Nenhum aviso volta por isso: cada
   * checagem só vale por pouco tempo (o dia, o mês, a semana do Copom, os dois
   * meses do IPCA, até 7 dias de atraso de um lembrete), e as boas-vindas
   * nunca saem do registro.
   */
  private prune(uid: string): void {
    const before = this.store.inbox(uid);
    const next = pruneInbox(before);
    const alertIds = new Set(this.store.getData(uid, "alerts").map((a) => a.id));
    const holdingIds = new Set(this.store.getData(uid, "portfolio").map((h) => h.id));
    const alertState = { ...next.alertState };
    for (const k of Object.keys(alertState)) {
      const [prefix, id] = k.includes(":") ? k.split(":") : ["", k];
      const keep = prefix ? holdingIds.has(id) : alertIds.has(k);
      if (!keep) delete alertState[k];
    }
    const pruned = { ...next, alertState };
    if (!sameInbox(pruned, before)) this.store.setInbox(uid, pruned);
  }
}
