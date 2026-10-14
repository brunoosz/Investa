// Juros de crédito nos bancos do próprio usuário (cartão, cheque especial e
// empréstimo pessoal), com os dados do Banco Central, e a simulação das faturas
// em aberto. Assim a IA monta a saída da dívida com números reais.
import type { CreditRate, CreditRatesData, UserDataMap } from "@shared/types";
import { bankById, institutionLabel, matchBankId } from "@shared/banks";
import { addMonthsYm, currentYm, ymLabel } from "@shared/finance";
import { CREDIT_CACHE, getCreditRates } from "./banks";
import { readDiskCache } from "./http";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n2 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const n0 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const DEBT_QUESTION =
  /d[íi]vida|endivid|devendo|rotativo|cheque especial|fatura|cart[ãa]o de cr[ée]dito|empr[ée]stimo|consignado|negativad|nome sujo|serasa|renegoci|quitar|pagar o m[íi]nimo|juros (do|da|de) (cart|banc|cheque|fatura|empr)/i;

/** Pergunta sobre dívida, cartão ou cheque especial (em qualquer modo do Assistente). */
export function asksAboutDebt(question: string): boolean {
  return DEBT_QUESTION.test(question);
}

/**
 * Taxas para a IA sem segurar a resposta: a consulta ao Banco Central é grande
 * e pode demorar; nesse caso usa a última salva e a nova fica pronta para a próxima pergunta.
 */
export async function creditRatesForAi(waitMs = 15_000): Promise<CreditRatesData> {
  const fresh = getCreditRates();
  fresh.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), waitMs);
  });
  try {
    const got = await Promise.race([fresh, late]);
    if (got) return got;
  } finally {
    clearTimeout(timer);
  }
  const saved = readDiskCache<CreditRatesData>(CREDIT_CACHE, 30 * 86400_000);
  if (saved) return saved;
  throw new Error("Juros de crédito ainda carregando");
}

interface UserInstitution {
  key: string;
  label: string;
  name: string;
  bankId?: string;
}

const GENERIC = new Set(["BCO", "BANK", "S", "A", "SA", "DO", "DA", "DE", "DIGITAL", "FINANCEIRA", "PAGAMENTOS"]);

function tokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\bBANCO\b/g, "BCO")
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

/** Bancos que aparecem nas faturas, nos gastos no crédito e nas contas do usuário. */
export function userInstitutions(data: UserDataMap, ym = currentYm()): UserInstitution[] {
  const from = addMonthsYm(ym, -2);
  const names = [
    ...(data.invoices ?? []).filter((i) => i.ym >= from || !i.paid).map((i) => i.institution),
    ...(data.expenses ?? []).filter((e) => e.method === "credito" && e.date.slice(0, 7) >= from).map((e) => e.institution),
    ...(data.accounts ?? []).map((a) => a.institution),
  ];
  const out = new Map<string, UserInstitution>();
  for (const raw of names) {
    const name = raw?.trim();
    if (!name || /^(outra|tesouro direto)$/i.test(name)) continue;
    const bankId = bankById(name) ? name : matchBankId(name);
    const key = bankId ?? tokens(name).join(" ");
    if (key && !out.has(key)) out.set(key, { key, label: institutionLabel(bankId ?? name), name, bankId });
  }
  return [...out.values()].slice(0, 6);
}

function ratesOf(inst: UserInstitution, rates: CreditRate[]): CreditRate[] {
  if (inst.bankId) return rates.filter((r) => r.bankId === inst.bankId);
  const wanted = tokens(inst.name).filter((t) => !GENERIC.has(t));
  if (!wanted.length) return [];
  return rates.filter((r) => {
    const have = new Set(tokens(r.institution));
    return wanted.every((t) => have.has(t));
  });
}

/** Parcela fixa (tabela Price). */
function installment(principal: number, monthlyPct: number, n: number): number {
  const i = monthlyPct / 100;
  return i > 0 ? (principal * i) / (1 - Math.pow(1 + i, -n)) : principal / n;
}

const LABELS: Record<string, string> = {
  rotativo: "rotativo do cartão",
  "cartao-parcelado": "parcelamento da fatura",
  cheque: "cheque especial",
  pessoal: "empréstimo pessoal",
};

/** Seção do contexto da IA: juros dos bancos do usuário e quanto custa cada saída para as faturas em aberto. */
export function userCreditSection(lines: string[], data: UserDataMap, credit: CreditRatesData | undefined): void {
  if (!credit?.modalities.length) return;
  const ym = currentYm();
  const insts = userInstitutions(data, ym);
  const open = (data.invoices ?? []).filter((i) => !i.paid && i.amount > 0 && i.ym >= addMonthsYm(ym, -1)).slice(0, 6);
  const negative = (data.accounts ?? []).filter((a) => a.balance < 0);
  if (!insts.length && !open.length && !negative.length) return;

  const modality = (key: string) => credit.modalities.find((m) => m.key === key)?.rates ?? [];
  const median = (key: string) => {
    const r = modality(key);
    return r.length ? r[Math.floor(r.length / 2)].rateMonth : undefined;
  };
  /** Taxa do banco do usuário (a maior, se o banco tiver mais de uma empresa na lista) ou, sem ela, a mediana. */
  const rateFor = (inst: UserInstitution | undefined, key: string): { rate: number; own: boolean } | undefined => {
    const own = inst ? ratesOf(inst, modality(key)) : [];
    if (own.length) return { rate: Math.max(...own.map((r) => r.rateMonth)), own: true };
    const m = median(key);
    return m !== undefined ? { rate: m, own: false } : undefined;
  };
  const findInst = (name: string) => {
    const bankId = bankById(name) ? name : matchBankId(name);
    return insts.find((i) => (bankId ? i.bankId === bankId : i.key === tokens(name).join(" ")));
  };

  if (insts.length) {
    lines.push(`\n# Juros nos bancos do usuário (Banco Central, pessoa física${credit.period ? `, semana iniciada em ${credit.period.slice(0, 10).split("-").reverse().join("/")}` : ""}; 1º = mais barato)`);
    for (const inst of insts) {
      const parts: string[] = [];
      for (const key of Object.keys(LABELS)) {
        const all = modality(key);
        const own = ratesOf(inst, all).slice(0, 2);
        for (const r of own) {
          const who = own.length > 1 ? ` (${r.institution})` : "";
          parts.push(`${LABELS[key]}${who} ${n2(r.rateMonth)}% a.m. (≈ ${n0(r.rateYear)}% a.a.; ${all.indexOf(r) + 1}º de ${all.length})`);
        }
      }
      lines.push(
        parts.length
          ? `- ${inst.label}: ${parts.join("; ")}`
          : `- ${inst.label}: o Banco Central não publicou taxas desse banco nesta semana; use a mediana do mercado como referência.`
      );
    }
    const medians = Object.keys(LABELS)
      .map((key) => [LABELS[key], median(key)] as const)
      .filter(([, v]) => v !== undefined)
      .map(([label, v]) => `${label} ${n2(v!)}% a.m.`);
    if (medians.length) lines.push(`- Mediana do mercado: ${medians.join("; ")}`);
    lines.push(
      "- Regras que valem para todos os bancos: desde 2024, os juros e encargos do rotativo e do parcelamento da fatura não podem passar de 100% do valor original da dívida; o rotativo só pode ser usado até a fatura seguinte, depois o banco tem que oferecer parcelamento; o cheque especial tem teto de 8% ao mês."
    );
  }

  if (open.length || negative.length) {
    lines.push("\n# Quanto custa cada saída (calculado pelo app com os juros acima; sem IOF e tarifas, valores aproximados)");
    let cheapestLoan: { rate: number; label: string } | undefined;
    for (const inst of insts) {
      const own = ratesOf(inst, modality("pessoal"));
      for (const r of own) if (!cheapestLoan || r.rateMonth < cheapestLoan.rate) cheapestLoan = { rate: r.rateMonth, label: inst.label };
    }
    const loanMedian = median("pessoal");
    const loan = cheapestLoan ?? (loanMedian !== undefined ? { rate: loanMedian, label: "mediana do mercado" } : undefined);

    for (const inv of open) {
      const inst = findInst(inv.institution);
      const bank = institutionLabel(inv.institution);
      const rot = rateFor(inst, "rotativo");
      const parc = rateFor(inst, "cartao-parcelado");
      const tag = (r: { own: boolean }) => (r.own ? bank : "mediana do mercado");
      lines.push(`- Fatura ${bank} de ${ymLabel(inv.ym)}: ${brl(inv.amount)} em aberto${inv.dueDay ? `, vence dia ${inv.dueDay}` : ""}`);
      if (rot) {
        const rest = inv.minimumPayment && inv.minimumPayment < inv.amount ? inv.amount - inv.minimumPayment : inv.amount;
        const interest = Math.min(rest * (rot.rate / 100), rest);
        lines.push(
          inv.minimumPayment && inv.minimumPayment < inv.amount
            ? `  - Pagar só o mínimo (${brl(inv.minimumPayment)}) e deixar ${brl(rest)} no rotativo (${n2(rot.rate)}% a.m., ${tag(rot)}): ≈ ${brl(interest)} de juros em 1 mês.`
            : `  - Deixar a fatura no rotativo (${n2(rot.rate)}% a.m., ${tag(rot)}): ≈ ${brl(interest)} de juros em 1 mês.`
        );
      }
      if (parc) {
        const plans = [3, 6, 12].map((n) => {
          const pmt = installment(inv.amount, parc.rate, n);
          // Teto legal: os juros do parcelamento não passam do valor original.
          const total = Math.min(pmt * n, inv.amount * 2);
          return `${n}x de ${brl(total / n)} (total ${brl(total)})`;
        });
        lines.push(`  - Parcelar a fatura (${n2(parc.rate)}% a.m., ${tag(parc)}): ${plans.join("; ")}.`);
      }
      if (loan && (!parc || loan.rate < parc.rate)) {
        const pmt = installment(inv.amount, loan.rate, 12);
        lines.push(`  - Empréstimo pessoal para quitar a fatura (${n2(loan.rate)}% a.m., ${loan.label}) em 12x: ${brl(pmt)} por mês (total ${brl(pmt * 12)}).`);
      }
    }
    for (const acc of negative.slice(0, 4)) {
      const inst = findInst(acc.institution);
      const cheque = rateFor(inst, "cheque");
      if (!cheque) continue;
      const bank = institutionLabel(acc.institution);
      lines.push(
        `- Conta ${bank} negativa em ${brl(-acc.balance)}: no cheque especial (${n2(cheque.rate)}% a.m., ${cheque.own ? bank : "mediana do mercado"}) custa ≈ ${brl(-acc.balance * (cheque.rate / 100))} por mês.`
      );
    }
  }
}
