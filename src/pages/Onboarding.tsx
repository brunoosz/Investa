import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import clsx from "clsx";
import type { FinancialProfile, Goal, RiskProfile } from "@shared/types";
import { addMonthsYm, currentYm } from "@shared/finance";
import { platform, uid } from "@/lib/api";
import { brl, firstName, pct } from "@/lib/format";
import { useSession } from "@/store/session";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/form";
import { AppIcon } from "@/components/Logo";
import { ExpenseFields, GoalPicker, IncomeFields, InvestFields, RISK_LABEL, SummaryRow, totalExpenses, totalIncome } from "@/components/ProfileForm";
import { Toaster } from "@/components/ui/Toaster";

const RISK_QUESTIONS = [
  {
    q: "Se seus investimentos caíssem 20% em um mês, o que você faria?",
    options: ["Venderia tudo para não perder mais", "Esperaria o preço se recuperar", "Aproveitaria para comprar mais"],
  },
  {
    q: "Quando você vai precisar da maior parte desse dinheiro?",
    options: ["Em menos de 2 anos", "Entre 2 e 5 anos", "Daqui a mais de 5 anos"],
  },
  {
    q: "O que é mais importante para você?",
    options: ["Não perder dinheiro", "Equilíbrio entre segurança e retorno", "Buscar o maior retorno, aceitando riscos"],
  },
];

function riskFromAnswers(answers: number[]): RiskProfile {
  const score = answers.reduce((s, a) => s + Math.max(0, a), 0);
  if (score <= 2) return "conservador";
  if (score <= 4) return "moderado";
  return "arrojado";
}

const STEPS = ["Boas-vindas", "Renda", "Gastos", "Investimentos", "Perfil", "Objetivo", "Resumo"];

export function Onboarding() {
  const user = useSession((s) => s.user)!;
  const current = useSession((s) => s.data.profile);
  const update = useSession((s) => s.update);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [p, setP] = useState<FinancialProfile>({ ...current });
  const [answers, setAnswers] = useState<number[]>([-1, -1, -1]);
  const [experience, setExperience] = useState<FinancialProfile["experience"]>(current.experience);

  const income = totalIncome(p);
  const expenses = totalExpenses(p);
  const idealReserve = Math.round(expenses * (p.extraIncome > p.salary ? 9 : 6));
  const risk = answers.every((a) => a >= 0) ? riskFromAnswers(answers) : p.riskProfile;

  const canNext =
    step === 1 ? p.salary + p.extraIncome > 0 : step === 4 ? answers.every((a) => a >= 0) : step === 5 ? !!p.mainGoal : true;

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(n);
  };

  const finish = () => {
    const profile: FinancialProfile = { ...p, riskProfile: risk, experience, onboarded: true, updatedAt: new Date().toISOString() };
    update("profile", profile);
    if (profile.emergencyReserve < idealReserve && idealReserve > 0) {
      const months = profile.monthlyInvest > 0 ? Math.min(36, Math.max(3, Math.ceil((idealReserve - profile.emergencyReserve) / profile.monthlyInvest))) : 12;
      const goal: Goal = {
        id: uid(),
        name: "Reserva de emergência",
        icon: "shield",
        color: "#4F8CFF",
        target: idealReserve,
        deadline: addMonthsYm(currentYm(), months),
        createdAt: new Date().toISOString(),
        allocations: [
          {
            id: uid(),
            type: "tesouro-selic",
            asset: "Tesouro Selic",
            institution: "Tesouro Direto",
            amount: profile.emergencyReserve,
            monthly: Math.min(profile.monthlyInvest, Math.max(0, idealReserve - profile.emergencyReserve)),
            rateType: "selic",
            rate: 0,
          },
        ],
      };
      update("goals", (g) => (g.some((x) => x.name === goal.name) ? g : [goal, ...g]));
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className={clsx("drag h-12 shrink-0", (platform === "win32" || platform === "linux") && "mr-[150px]")} />
      <div className="pointer-events-none absolute -top-40 right-0 h-[460px] w-[680px] rounded-full bg-primary/[0.08] blur-3xl" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[640px] mx-auto px-6 pb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="text-footnote text-muted font-medium whitespace-nowrap tabular">
              {step + 1} de {STEPS.length} · {STEPS[step]}
            </div>
            <ProgressBar value={(step + 1) / STEPS.length} height={6} />
          </div>

          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: 40 * dir }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 * dir }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            >
              {step === 0 && (
                <div className="text-center pt-6">
                  <div className="flex justify-center mb-6">
                    <AppIcon size={88} />
                  </div>
                  <h1 className="text-[34px] font-bold tracking-[-0.022em] leading-[1.1]">Olá, {firstName(user.name)}!</h1>
                  <p className="text-muted text-body mt-3 max-w-md mx-auto leading-relaxed">
                    Vamos conhecer sua vida financeira em poucos passos. Com isso, o Assistente monta o melhor plano para você e o Investa personaliza alertas,
                    metas e aulas.
                  </p>
                  <div className="mt-6 inline-flex items-center gap-2 text-footnote text-muted bg-fg/[0.06] rounded-full px-3 py-1.5">
                    <Sparkles size={14} className="text-primary" /> Seus dados ficam salvos só neste aparelho. Você pode alterar tudo depois em Configurações.
                  </div>
                </div>
              )}

              {step === 1 && (
                <StepCard title="Quanto você ganha?" subtitle="Considere o valor líquido que entra todo mês.">
                  <IncomeFields value={p} onChange={setP} />
                </StepCard>
              )}

              {step === 2 && (
                <StepCard title="Quanto você gasta?" subtitle="Uma estimativa já ajuda. Depois você pode registrar cada gasto na aba Gastos.">
                  <ExpenseFields value={p} onChange={setP} />
                </StepCard>
              )}

              {step === 3 && (
                <StepCard title="Quanto dá para investir?" subtitle="Seja realista: é melhor investir pouco todo mês do que muito uma vez só.">
                  <InvestFields value={p} onChange={setP} />
                </StepCard>
              )}

              {step === 4 && (
                <StepCard title="Seu perfil de investidor" subtitle="Responda com sinceridade, não existe resposta certa.">
                  <div className="space-y-5">
                    {RISK_QUESTIONS.map((rq, qi) => (
                      <div key={qi}>
                        <div className="text-headline mb-2">{rq.q}</div>
                        <div className="grid gap-2">
                          {rq.options.map((o, oi) => (
                            <button
                              key={oi}
                              type="button"
                              onClick={() => setAnswers((a) => a.map((x, i) => (i === qi ? oi : x)))}
                              className={clsx(
                                "pressable flex items-center justify-between rounded-control border px-4 py-3 text-left text-callout transition-[background-color,border-color,transform] duration-150",
                                answers[qi] === oi ? "border-primary/50 bg-primary/10 font-semibold" : "border-separator/10 bg-fg/[0.04] hover:bg-fg/[0.07]"
                              )}
                            >
                              {o}
                              {answers[qi] === oi && <Check size={18} className="text-primary" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div>
                      <div className="text-headline mb-2">Qual sua experiência com investimentos?</div>
                      <div className="grid grid-cols-3 gap-2">
                        {(["nunca", "pouco", "experiente"] as const).map((e) => (
                          <button
                            key={e}
                            type="button"
                            onClick={() => setExperience(e)}
                            className={clsx(
                              "pressable rounded-control border px-3 py-3 text-footnote font-medium transition-[background-color,border-color,color,transform] duration-150",
                              experience === e ? "border-primary/50 bg-primary/10" : "border-separator/10 bg-fg/[0.04] text-muted hover:text-fg"
                            )}
                          >
                            {e === "nunca" ? "Nunca investi" : e === "pouco" ? "Um pouco" : "Experiente"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </StepCard>
              )}

              {step === 5 && (
                <StepCard title="Qual seu principal objetivo agora?" subtitle="Isso orienta as sugestões do Assistente.">
                  <GoalPicker value={p.mainGoal} onChange={(g) => setP({ ...p, mainGoal: g })} />
                  <Field label="Sua idade (opcional)" className="mt-5 max-w-[160px]">
                    <Input inputMode="numeric" value={p.age ?? ""} onChange={(e) => setP({ ...p, age: Number(e.target.value.replace(/\D/g, "")) || undefined })} />
                  </Field>
                </StepCard>
              )}

              {step === 6 && (
                <StepCard title="Tudo pronto!" subtitle="Confira o resumo. A partir dele, o Investa monta seu plano.">
                  <div className="rounded-card bg-fg/[0.04] border border-separator/10 px-4">
                    <SummaryRow label="Renda mensal" value={brl(income)} />
                    <SummaryRow label="Gastos mensais" value={brl(expenses)} />
                    <SummaryRow label="Sobra" value={<span className={income - expenses >= 0 ? "text-success" : "text-danger"}>{brl(income - expenses)}</span>} />
                    <SummaryRow label="Vai investir por mês" value={`${brl(p.monthlyInvest)}${income ? ` (${pct((p.monthlyInvest / income) * 100, 0, false)} da renda)` : ""}`} />
                    <SummaryRow label="Reserva ideal" value={brl(idealReserve)} />
                    <SummaryRow label="Perfil" value={RISK_LABEL[risk]} strong />
                  </div>
                  <div className="mt-4 space-y-2 text-callout">
                    {p.debts > 0 && <Tip>Você tem {brl(p.debts)} em dívidas. Priorize quitar as de juros mais altos antes de investir em renda variável.</Tip>}
                    {p.emergencyReserve < idealReserve && (
                      <Tip>Vamos criar a meta “Reserva de emergência” de {brl(idealReserve)} para você acompanhar na aba Objetivos.</Tip>
                    )}
                    {income - expenses < 0 && <Tip>Seus gastos estão maiores que a renda. A aba Gastos vai ajudar a descobrir onde cortar.</Tip>}
                    <Tip>Comece pelas Aulas: a trilha vai do zero ao avançado e você ganha pontos a cada aula.</Tip>
                  </div>
                </StepCard>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between mt-8">
            {step > 0 ? (
              <Button variant="ghost" icon={ArrowLeft} onClick={() => go(step - 1)}>
                Voltar
              </Button>
            ) : (
              <span />
            )}
            {step < STEPS.length - 1 ? (
              <Button size="lg" iconRight={ArrowRight} disabled={!canNext} onClick={() => go(step + 1)}>
                {step === 0 ? "Começar" : "Continuar"}
              </Button>
            ) : (
              <Button size="lg" icon={Check} onClick={finish}>
                Entrar no Investa
              </Button>
            )}
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  );
}

function StepCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-large-title">{title}</h1>
      {subtitle && <p className="text-body text-muted mt-1.5 mb-6">{subtitle}</p>}
      {children}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-control bg-primary/[0.07] px-4 py-3">
      <Sparkles size={16} className="text-primary shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
