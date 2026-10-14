import type { ReactNode } from "react";
import { Briefcase, Car, GraduationCap, House, Landmark, Plane, PiggyBank, Shield, TrendingUp } from "lucide-react";
import clsx from "clsx";
import type { Experience, FinancialProfile, RiskProfile } from "@shared/types";
import { brl } from "@/lib/format";
import { DayInput, Field, MoneyInput, SegmentedControl } from "@/components/ui/form";

export const GOAL_OPTIONS = [
  { id: "reserva", label: "Montar minha reserva", icon: Shield },
  { id: "dividas", label: "Quitar dívidas", icon: Landmark },
  { id: "aprender", label: "Aprender a investir", icon: GraduationCap },
  { id: "renda-passiva", label: "Ter renda passiva", icon: TrendingUp },
  { id: "aposentadoria", label: "Aposentadoria", icon: PiggyBank },
  { id: "casa", label: "Comprar uma casa", icon: House },
  { id: "carro", label: "Comprar um carro", icon: Car },
  { id: "viagem", label: "Viajar", icon: Plane },
  { id: "negocio", label: "Abrir um negócio", icon: Briefcase },
];

export const RISK_LABEL: Record<RiskProfile, string> = { conservador: "Conservador", moderado: "Moderado", arrojado: "Arrojado" };
export const EXPERIENCE_LABEL: Record<Experience, string> = { nunca: "Nunca investi", pouco: "Já investi um pouco", experiente: "Tenho experiência" };

export function totalIncome(p: FinancialProfile): number {
  return p.salary + p.extraIncome;
}

export function totalExpenses(p: FinancialProfile): number {
  return p.fixedExpenses + p.variableExpenses;
}

export function IncomeFields({ value, onChange }: { value: FinancialProfile; onChange: (p: FinancialProfile) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Salário / renda líquida mensal" hint="O valor que cai na conta, já com descontos.">
        <MoneyInput value={value.salary} onChange={(v) => onChange({ ...value, salary: v })} />
      </Field>
      <Field label="Outra renda fixa por mês (opcional)" hint="Só o que entra todo mês, como um aluguel. Dinheiro avulso vai em “Recebi dinheiro”.">
        <MoneyInput value={value.extraIncome} onChange={(v) => onChange({ ...value, extraIncome: v })} />
      </Field>
      <Field label="Dia do pagamento" hint="Dia em que o salário cai na conta.">
        <DayInput value={value.payDay} onChange={(v) => onChange({ ...value, payDay: v })} placeholder="Ex.: 5" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Adiantamento: dia" hint="Se recebe em duas vezes.">
          <DayInput value={value.advanceDay} onChange={(v) => onChange({ ...value, advanceDay: v })} placeholder="Ex.: 20" />
        </Field>
        <Field label="Valor do adiantamento">
          <MoneyInput value={value.advanceAmount ?? 0} onChange={(v) => onChange({ ...value, advanceAmount: v || undefined })} />
        </Field>
      </div>
    </div>
  );
}

export function ExpenseFields({ value, onChange }: { value: FinancialProfile; onChange: (p: FinancialProfile) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Gastos fixos por mês" hint="Aluguel, contas, escola, plano de saúde…">
        <MoneyInput value={value.fixedExpenses} onChange={(v) => onChange({ ...value, fixedExpenses: v })} />
      </Field>
      <Field label="Gastos variáveis por mês" hint="Mercado, lazer, transporte, delivery…">
        <MoneyInput value={value.variableExpenses} onChange={(v) => onChange({ ...value, variableExpenses: v })} />
      </Field>
      <Field label="Dívidas em aberto (total)" hint="Cartão, empréstimos, financiamentos." className="sm:col-span-2">
        <MoneyInput value={value.debts} onChange={(v) => onChange({ ...value, debts: v })} />
      </Field>
    </div>
  );
}

export function InvestFields({ value, onChange }: { value: FinancialProfile; onChange: (p: FinancialProfile) => void }) {
  const leftover = Math.max(0, totalIncome(value) - totalExpenses(value));
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        label="Quanto pode investir por mês"
        className="sm:col-span-2"
        hint={
          leftover > 0 ? (
            <span>
              Sobram cerca de <strong className="text-fg">{brl(leftover)}</strong> por mês.{" "}
              <button type="button" className="pressable inline-block text-primary font-semibold" onClick={() => onChange({ ...value, monthlyInvest: Math.round(leftover * 0.8) })}>
                Usar {brl(Math.round(leftover * 0.8))} (80% da sobra)
              </button>
            </span>
          ) : undefined
        }
      >
        <MoneyInput value={value.monthlyInvest} onChange={(v) => onChange({ ...value, monthlyInvest: v })} />
      </Field>
      <Field label="Reserva de emergência atual" hint="Dinheiro guardado para imprevistos.">
        <MoneyInput value={value.emergencyReserve} onChange={(v) => onChange({ ...value, emergencyReserve: v })} />
      </Field>
      <Field label="Já tem investido (fora a reserva)">
        <MoneyInput value={value.invested} onChange={(v) => onChange({ ...value, invested: v })} />
      </Field>
    </div>
  );
}

export function ProfileFields({ value, onChange }: { value: FinancialProfile; onChange: (p: FinancialProfile) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Perfil de investidor">
        <SegmentedControl<RiskProfile>
          block
          value={value.riskProfile}
          onChange={(v) => onChange({ ...value, riskProfile: v })}
          options={[
            { value: "conservador", label: "Conservador" },
            { value: "moderado", label: "Moderado" },
            { value: "arrojado", label: "Arrojado" },
          ]}
        />
      </Field>
      <Field label="Experiência">
        <SegmentedControl<Experience>
          block
          value={value.experience}
          onChange={(v) => onChange({ ...value, experience: v })}
          options={[
            { value: "nunca", label: "Nunca investi" },
            { value: "pouco", label: "Um pouco" },
            { value: "experiente", label: "Experiente" },
          ]}
        />
      </Field>
      <Field label="Objetivo principal">
        <GoalPicker value={value.mainGoal} onChange={(g) => onChange({ ...value, mainGoal: g })} />
      </Field>
    </div>
  );
}

export function GoalPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {GOAL_OPTIONS.map((g) => {
        const active = value === g.id;
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onChange(g.id)}
            className={clsx(
              "pressable flex items-center gap-2.5 rounded-control border px-3 py-3 text-left text-footnote font-medium transition-[background-color,border-color,color,transform] duration-150",
              active ? "border-primary/50 bg-primary/10 text-fg" : "border-separator/10 bg-fg/[0.04] text-muted hover:text-fg hover:bg-fg/[0.07]"
            )}
          >
            <g.icon size={18} className={active ? "text-primary" : ""} />
            {g.label}
          </button>
        );
      })}
    </div>
  );
}

export function SummaryRow({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-separator/10 last:border-0">
      <span className="text-muted text-callout">{label}</span>
      <span className={clsx("tabular text-body", strong ? "font-bold" : "font-semibold")}>{value}</span>
    </div>
  );
}
