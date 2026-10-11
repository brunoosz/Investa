import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarClock, ChartLine, Landmark, Pencil, Plus, Target, Trash, TrendingUp } from "lucide-react";
import clsx from "clsx";
import type { AllocationType, Goal, GoalAllocation, RateType } from "@shared/types";
import { addMonthsYm, currentYm, monthsBetween, projectGoal, ratesFromIndicators, type Rates } from "@shared/finance";
import { BANKS, bankById, institutionLabel } from "@shared/banks";
import { uid } from "@/lib/api";
import { brl, num, pct } from "@/lib/format";
import { GOAL_COLORS, GOAL_ICONS, iconFor } from "@/lib/icons";
import { useSession, useUserData } from "@/store/session";
import { useUi } from "@/store/ui";
import { useIndicators } from "@/hooks/useMarketData";
import { Badge, Card, EmptyState, PageHeader, Private, ProgressBar, SectionTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { BoxesCard } from "@/components/Boxes";
import { Field, Input, MoneyInput, NumberInput, Select } from "@/components/ui/form";
import { ConfirmDialog, Sheet } from "@/components/ui/Sheet";
import { Chart, type SeriesSpec } from "@/components/charts/Chart";
import { InstitutionSelect } from "@/components/market";

const ALLOC_TYPES: { value: AllocationType; label: string; rateType: RateType; rate: number }[] = [
  { value: "cdb", label: "CDB", rateType: "cdi", rate: 100 },
  { value: "lci", label: "LCI", rateType: "cdi", rate: 90 },
  { value: "lca", label: "LCA", rateType: "cdi", rate: 92 },
  { value: "tesouro-selic", label: "Tesouro Selic", rateType: "selic", rate: 0.07 },
  { value: "tesouro-ipca", label: "Tesouro IPCA+", rateType: "ipca", rate: 7 },
  { value: "tesouro-pre", label: "Tesouro Prefixado", rateType: "pre", rate: 13 },
  { value: "poupanca", label: "Poupança", rateType: "pre", rate: 0 },
  { value: "acao", label: "Ações", rateType: "variavel", rate: 10 },
  { value: "fii", label: "Fundos imobiliários", rateType: "variavel", rate: 9 },
  { value: "etf", label: "ETF", rateType: "variavel", rate: 10 },
  { value: "cripto", label: "Criptomoedas", rateType: "variavel", rate: 15 },
  { value: "debenture", label: "Debênture", rateType: "ipca", rate: 7 },
  { value: "outro", label: "Outro", rateType: "cdi", rate: 100 },
];

const typeLabel = (t: AllocationType) => ALLOC_TYPES.find((a) => a.value === t)?.label ?? t;

function rateText(a: GoalAllocation): string {
  if (a.type === "poupanca") return "Poupança";
  if (a.rateType === "cdi") return `${num(a.rate, 0)}% do CDI`;
  if (a.rateType === "selic") return `Selic + ${num(a.rate)}%`;
  if (a.rateType === "ipca") return `IPCA + ${num(a.rate)}%`;
  if (a.rateType === "variavel") return `~${num(a.rate, 0)}% a.a. (estimado)`;
  return `${num(a.rate)}% a.a.`;
}

function ymLabelShort(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "");
}

function newAllocation(): GoalAllocation {
  return { id: uid(), type: "cdb", asset: "CDB", institution: "", amount: 0, monthly: 0, rateType: "cdi", rate: 100 };
}

function newGoal(): Goal {
  return { id: uid(), name: "", icon: "target", color: GOAL_COLORS[0], target: 0, deadline: addMonthsYm(currentYm(), 12), allocations: [newAllocation()], createdAt: new Date().toISOString() };
}

function AllocationEditor({ a, onChange, onRemove }: { a: GoalAllocation; onChange: (a: GoalAllocation) => void; onRemove?: () => void }) {
  const variable = a.rateType === "variavel";
  return (
    <div className="rounded-2xl border border-line/10 bg-line/[0.03] p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Onde vai investir">
          <Select
            value={a.type}
            onChange={(e) => {
              const t = ALLOC_TYPES.find((x) => x.value === e.target.value)!;
              const bank = bankById(a.institution);
              const rate = t.value === "cdb" && bank ? bank.liquidProduct.pctCDI : t.rate;
              onChange({ ...a, type: t.value, rateType: t.rateType, rate, asset: t.rateType === "variavel" ? "" : t.label, institution: t.value.startsWith("tesouro") ? "Tesouro Direto" : a.institution });
            }}
          >
            {ALLOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Banco / corretora">
          <InstitutionSelect
            value={a.institution}
            includeTesouro
            onChange={(v) => {
              const bank = bankById(v);
              onChange({ ...a, institution: v, rate: a.type === "cdb" && bank ? bank.liquidProduct.pctCDI : a.rate });
            }}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={variable ? "Ativo (ticker)" : "Produto"}>
          <Input value={a.asset} onChange={(e) => onChange({ ...a, asset: variable ? e.target.value.toUpperCase() : e.target.value })} placeholder={variable ? "Ex.: PETR4, HGLG11, BOVA11" : "Ex.: CDB liquidez diária"} />
        </Field>
        <Field label={a.type === "poupanca" ? "Rendimento" : variable ? "Retorno esperado ao ano" : "Taxa"}>
          {a.type === "poupanca" ? (
            <div className="field flex items-center text-muted">Regra oficial da poupança</div>
          ) : (
            <NumberInput value={a.rate} onChange={(v) => onChange({ ...a, rate: v })} suffix={a.rateType === "cdi" ? "% CDI" : a.rateType === "selic" ? "+ Selic" : a.rateType === "ipca" ? "+ IPCA" : "% a.a."} min={0} />
          )}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Já tem aplicado">
          <MoneyInput value={a.amount} onChange={(v) => onChange({ ...a, amount: v })} />
        </Field>
        <Field label="Vai aplicar por mês">
          <MoneyInput value={a.monthly} onChange={(v) => onChange({ ...a, monthly: v })} />
        </Field>
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-[13px] text-danger font-semibold inline-flex items-center gap-1">
          <Trash size={14} /> Remover este investimento
        </button>
      )}
    </div>
  );
}

function GoalSheet({ open, initial, preset, onClose }: { open: boolean; initial: Goal | null; preset?: Partial<Goal>; onClose: () => void }) {
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const [g, setG] = useState<Goal>(initial ?? newGoal());
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setG(initial ? structuredClone(initial) : { ...newGoal(), ...preset });
  }
  const valid = g.name.trim() && g.target > 0 && g.deadline >= currentYm();
  const save = () => {
    const goal = { ...g, name: g.name.trim() };
    update("goals", (list) => (list.some((x) => x.id === goal.id) ? list.map((x) => (x.id === goal.id ? goal : x)) : [...list, goal]));
    toast({ title: initial ? "Meta atualizada" : "Meta criada", tone: "success" });
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? "Editar meta" : "Nova meta"}
      subtitle="Diga quanto quer juntar, até quando, e onde vai investir. O Investa projeta com as taxas reais de hoje."
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={!valid}>
            Salvar meta
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Nome da meta" className="sm:col-span-3">
            <Input value={g.name} autoFocus onChange={(e) => setG({ ...g, name: e.target.value })} placeholder="Ex.: Viagem para o Japão" />
          </Field>
          <Field label="Valor da meta">
            <MoneyInput value={g.target} onChange={(v) => setG({ ...g, target: v })} />
          </Field>
          <Field label="Até quando">
            <Input type="month" value={g.deadline} min={currentYm()} onChange={(e) => setG({ ...g, deadline: e.target.value })} />
          </Field>
          <Field label="Cor">
            <div className="flex gap-1.5 h-11 items-center">
              {GOAL_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setG({ ...g, color: c })} className={clsx("h-7 w-7 rounded-full transition", g.color === c && "ring-2 ring-offset-2 ring-offset-surface")} style={{ background: c, ["--tw-ring-color" as string]: c }} />
              ))}
            </div>
          </Field>
        </div>
        <Field label="Ícone">
          <div className="flex flex-wrap gap-2">
            {GOAL_ICONS.map((key) => {
              const I = iconFor(key);
              return (
                <button key={key} type="button" onClick={() => setG({ ...g, icon: key })} className={clsx("h-10 w-10 rounded-xl flex items-center justify-center border transition", g.icon === key ? "border-transparent text-white" : "border-line/10 text-muted hover:text-fg")} style={g.icon === key ? { background: g.color } : undefined}>
                  <I size={18} />
                </button>
              );
            })}
          </div>
        </Field>
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="label mb-0">Onde você está investindo</div>
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => setG({ ...g, allocations: [...g.allocations, newAllocation()] })}>
              Adicionar
            </Button>
          </div>
          <div className="space-y-3">
            {g.allocations.map((a) => (
              <AllocationEditor
                key={a.id}
                a={a}
                onChange={(na) => setG({ ...g, allocations: g.allocations.map((x) => (x.id === a.id ? na : x)) })}
                onRemove={g.allocations.length > 1 ? () => setG({ ...g, allocations: g.allocations.filter((x) => x.id !== a.id) }) : undefined}
              />
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function GoalDetail({ goal, rates, onClose }: { goal: Goal; rates: Rates; onClose: () => void }) {
  const p = useMemo(() => projectGoal(goal, rates), [goal, rates]);
  const series = useMemo<SeriesSpec[]>(() => {
    const toTime = (ym: string) => Math.floor(new Date(`${ym}-01T12:00:00`).getTime() / 1000);
    return [
      { kind: "area", id: "valor", color: goal.color, data: p.points.map((x) => ({ time: toTime(x.ym), value: x.value })) },
      { kind: "line", id: "aplicado", color: "#94A3B8", dashed: true, width: 1, data: p.points.map((x) => ({ time: toTime(x.ym), value: x.invested })) },
      { kind: "line", id: "meta", color: "#FBBF24", dashed: true, width: 1, data: p.points.map((x) => ({ time: toTime(x.ym), value: goal.target })) },
    ];
  }, [p, goal]);
  const fmt = useCallback((v: number) => brl(v).replace(/,\d+$/, ""), []);

  const cdiAllocs = goal.allocations.filter((a) => a.rateType === "cdi" && ["cdb", "lci", "lca", "outro"].includes(a.type));
  const comparison = useMemo(() => {
    if (!cdiAllocs.length) return [];
    return BANKS.map((b) => {
      const alt: Goal = { ...goal, allocations: goal.allocations.map((a) => (cdiAllocs.includes(a) ? { ...a, type: "cdb", institution: b.id, rate: p.months > 24 ? b.cdbTop.pctCDI : b.liquidProduct.pctCDI } : a)) };
      const r = projectGoal(alt, rates);
      return { bank: b, pctCDI: p.months > 24 ? b.cdbTop.pctCDI : b.liquidProduct.pctCDI, net: r.netValueAtDeadline, diff: r.netValueAtDeadline - p.netValueAtDeadline };
    }).sort((a, b) => b.net - a.net);
  }, [goal, rates, p, cdiAllocs]);

  const Icon = iconFor(goal.icon);
  return (
    <Sheet
      open
      onClose={onClose}
      width="xl"
      title={goal.name}
      subtitle={
        <>
          Meta de <Private>{brl(goal.target)}</Private> até {ymLabelShort(goal.deadline)} · {p.months} meses
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-3 mb-4">
        <div className="rounded-2xl bg-line/[0.04] p-4">
          <div className="text-[12.5px] text-muted">No prazo você terá</div>
          <div className="text-[22px] font-bold tabular" data-private="">
            {brl(p.valueAtDeadline)}
          </div>
          <div className="text-[12.5px] text-muted">
            líquido de IR ≈ <Private>{brl(p.netValueAtDeadline)}</Private>
          </div>
        </div>
        <div className="rounded-2xl bg-line/[0.04] p-4">
          <div className="text-[12.5px] text-muted">Rendimento médio estimado</div>
          <div className="text-[22px] font-bold tabular">{num(p.blendedAnnual)}% a.a.</div>
          <div className="text-[12.5px] text-muted">com CDI {num(rates.cdi)}% · IPCA {num(rates.ipca12m)}%</div>
        </div>
        <div className={clsx("rounded-2xl p-4", p.reachesTarget ? "bg-success/10" : "bg-warning/10")}>
          <div className="text-[12.5px] text-muted">{p.reachesTarget ? "Você chega lá" : "Para chegar no prazo"}</div>
          <div className={clsx("text-[22px] font-bold tabular", p.reachesTarget ? "text-success" : "text-warning")}>
            {p.reachesTarget ? (p.monthsToTarget !== null ? ymLabelShort(addMonthsYm(currentYm(), p.monthsToTarget)) : "no prazo") : <Private>{brl(p.requiredMonthly)}/mês</Private>}
          </div>
          <div className="text-[12.5px] text-muted">
            {p.reachesTarget ? (
              "mantendo os aportes atuais"
            ) : (
              <>
                hoje você aplica <Private>{brl(p.monthlyTotal)}/mês</Private>
              </>
            )}
          </div>
        </div>
      </div>
      <Private block className="rounded-2xl border border-line/10 p-2 mb-2">
        <Chart series={series} height={260} formatter={fmt} />
      </Private>
      <div className="flex items-center gap-4 text-[12px] text-muted mb-5 px-1">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: goal.color }} /> Projeção
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-muted" /> Total aplicado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-warning" /> Meta
        </span>
      </div>

      <SectionTitle title="Seus investimentos nesta meta" />
      <div className="surface divide-y divide-line/10 mb-5">
        {goal.allocations.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ background: `${goal.color}22`, color: goal.color }}>
              <Icon size={17} />
            </div>
            <div className="flex-1 min-w-[160px]">
              <div className="font-semibold text-[14.5px]">
                {a.asset || typeLabel(a.type)} <span className="text-muted font-normal">· {institutionLabel(a.institution) || "sem banco"}</span>
              </div>
              <div className="text-[12.5px] text-muted">
                {typeLabel(a.type)} · {rateText(a)}
              </div>
            </div>
            <div className="text-right text-[13px]" data-private="">
              <div className="tabular">{brl(a.amount)} aplicado</div>
              <div className="text-muted tabular">+ {brl(a.monthly)}/mês</div>
            </div>
          </div>
        ))}
      </div>

      {comparison.length > 0 && (
        <>
          <SectionTitle title="Faz diferença o banco?" subtitle="Simulação trocando a parte em CDB/LCI/LCA pelo CDB de cada banco (taxas de referência)." />
          <div className="surface divide-y divide-line/10">
            {comparison.slice(0, 8).map((c) => (
              <div key={c.bank.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold tracking-tight" style={{ background: c.bank.color, fontSize: c.bank.short.length <= 3 ? 11 : 8 }}>
                  {c.bank.short}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-[14px]">{c.bank.name}</div>
                  <div className="text-[12px] text-muted">{c.pctCDI}% do CDI</div>
                </div>
                <div className="text-right" data-private="">
                  <div className="font-semibold tabular text-[14px]">{brl(c.net)}</div>
                  <div className={clsx("text-[12px] tabular", c.diff > 1 ? "text-success" : c.diff < -1 ? "text-danger" : "text-muted")}>
                    {Math.abs(c.diff) < 1 ? "igual ao seu plano" : `${c.diff > 0 ? "+" : ""}${brl(c.diff)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

export function Objetivos() {
  const goals = useUserData("goals");
  const profile = useUserData("profile");
  const update = useSession((s) => s.update);
  const { data: ind } = useIndicators();
  const rates = useMemo(() => ratesFromIndicators(ind), [ind]);
  // Vindo do "Meu plano": /objetivos?novo=1&nome=…&valor=…&prazo=AAAA-MM abre uma meta já preenchida.
  const [params, setParams] = useSearchParams();
  const [preset] = useState<Partial<Goal> | undefined>(() =>
    params.get("novo")
      ? { name: params.get("nome") ?? "", target: Number(params.get("valor")) || 0, ...(params.get("prazo") ? { deadline: params.get("prazo")! } : {}) }
      : undefined
  );
  const [sheet, setSheet] = useState<{ open: boolean; goal: Goal | null }>({ open: !!preset, goal: null });
  useEffect(() => {
    if (params.get("novo")) setParams({}, { replace: true });
  }, [params, setParams]);
  const [detail, setDetail] = useState<Goal | null>(null);
  const [toDelete, setToDelete] = useState<Goal | null>(null);
  const projections = useMemo(() => new Map(goals.map((g) => [g.id, projectGoal(g, rates)])), [goals, rates]);
  const totalSaved = goals.reduce((s, g) => s + (projections.get(g.id)?.current ?? 0), 0);
  const totalMonthly = goals.reduce((s, g) => s + (projections.get(g.id)?.monthlyTotal ?? 0), 0);
  const onTrack = goals.filter((g) => projections.get(g.id)?.reachesTarget).length;

  return (
    <div>
      <PageHeader
        title="Objetivos"
        subtitle="Planeje suas metas: quanto investir, em quê e em qual banco. Projeções com Selic, CDI e IPCA reais."
        actions={
          <Button icon={Plus} onClick={() => setSheet({ open: true, goal: null })}>
            Nova meta
          </Button>
        }
      />

      <BoxesCard />

      {goals.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Card>
            <div className="text-[13px] text-muted">Guardado nas metas</div>
            <div className="text-[22px] font-bold tabular mt-1" data-private="">
              {brl(totalSaved)}
            </div>
          </Card>
          <Card>
            <div className="text-[13px] text-muted">Aportes por mês</div>
            <div className="text-[22px] font-bold tabular mt-1" data-private="">
              {brl(totalMonthly)}
            </div>
            {profile.monthlyInvest > 0 && (
              <div className={clsx("text-[12.5px]", totalMonthly > profile.monthlyInvest ? "text-warning" : "text-muted")}>
                {pct((totalMonthly / profile.monthlyInvest) * 100, 0, false)} do que você pode investir
              </div>
            )}
          </Card>
          <Card>
            <div className="text-[13px] text-muted">Metas no caminho certo</div>
            <div className="text-[22px] font-bold tabular mt-1">
              {onTrack}/{goals.length}
            </div>
          </Card>
          <Card>
            <div className="text-[13px] text-muted">CDI hoje</div>
            <div className="text-[22px] font-bold tabular mt-1">{rates.cdi ? `${num(rates.cdi)}%` : "—"}</div>
            <div className="text-[12.5px] text-muted">Banco Central</div>
          </Card>
        </div>
      )}

      {goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={Target}
            title="Crie sua primeira meta"
            description="Reserva de emergência, viagem, carro, casa, aposentadoria… Diga quanto quer juntar e onde vai investir, e o Investa mostra se você chega lá."
            action={
              <Button icon={Plus} onClick={() => setSheet({ open: true, goal: null })}>
                Nova meta
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => {
            const p = projections.get(g.id)!;
            const Icon = iconFor(g.icon);
            const left = monthsBetween(currentYm(), g.deadline);
            return (
              <Card key={g.id} className="flex flex-col">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 text-white" style={{ background: g.color, boxShadow: `0 10px 24px -12px ${g.color}` }}>
                    <Icon size={22} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[16px] truncate">{g.name}</div>
                    <div className="text-[12.5px] text-muted flex items-center gap-1">
                      <CalendarClock size={13} /> até {ymLabelShort(g.deadline)} · {left} {left === 1 ? "mês" : "meses"}
                    </div>
                  </div>
                  <div className="flex">
                    <Button size="icon-sm" variant="ghost" icon={Pencil} onClick={() => setSheet({ open: true, goal: g })} aria-label="Editar" />
                    <Button size="icon-sm" variant="ghost" icon={Trash} onClick={() => setToDelete(g)} aria-label="Excluir" />
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <div className="text-[22px] font-bold tabular" data-private="">
                      {brl(p.current)}
                    </div>
                    <div className="text-[12.5px] text-muted">
                      de <Private>{brl(g.target)}</Private>
                    </div>
                  </div>
                  <div className="text-[15px] font-bold tabular" style={{ color: g.color }}>
                    {Math.round(p.progress * 100)}%
                  </div>
                </div>
                <ProgressBar value={p.progress} color={g.color} className="mt-2" />
                <div className="mt-3">
                  {p.reachesTarget ? (
                    <Badge tone="success" icon={TrendingUp}>
                      No caminho certo · <Private>{brl(p.valueAtDeadline).replace(/,\d+$/, "")}</Private> no prazo
                    </Badge>
                  ) : (
                    <Badge tone="warning">
                      Precisa de <Private>{brl(p.requiredMonthly).replace(/,\d+$/, "")}</Private>/mês para chegar
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {g.allocations.map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-line/[0.07] px-2.5 py-1 text-[12px]">
                      <Landmark size={12} className="text-muted" />
                      {a.asset || typeLabel(a.type)} · {institutionLabel(a.institution) || "—"} · <Private>{brl(a.monthly).replace(/,\d+$/, "")}/mês</Private>
                    </span>
                  ))}
                </div>
                <div className="flex-1" />
                <Button className="mt-4" variant="secondary" block icon={ChartLine} onClick={() => setDetail(g)}>
                  Ver projeção
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <GoalSheet open={sheet.open} initial={sheet.goal} preset={sheet.goal ? undefined : preset} onClose={() => setSheet({ open: false, goal: null })} />
      {detail && <GoalDetail goal={goals.find((g) => g.id === detail.id) ?? detail} rates={rates} onClose={() => setDetail(null)} />}
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) update("goals", (l) => l.filter((x) => x.id !== toDelete.id));
          setToDelete(null);
        }}
        title="Excluir meta?"
        message={`A meta “${toDelete?.name}” será removida.`}
        confirmLabel="Excluir"
        danger
      />
    </div>
  );
}
