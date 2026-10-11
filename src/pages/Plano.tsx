import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ExternalLink, FileDown, Globe, Rocket, RotateCcw, Sparkles } from "lucide-react";
import clsx from "clsx";
import type { WealthAnswers, WealthStyle } from "@shared/types";
import { PLAN_PRODUCTS, compareProducts, explainPlan, planAllocation, planBrief, planEndLabel, planMarket, planSummary, projectPlan } from "@shared/plan";
import { api } from "@/lib/api";
import { brl, dateBR, num } from "@/lib/format";
import { useSession, useUserData } from "@/store/session";
import { toastError, useUi } from "@/store/ui";
import { useAsync } from "@/hooks/useAsync";
import { useIndicators, useTesouro } from "@/hooks/useMarketData";
import { AnimatedNumber, Badge, Card, PageHeader, Private, PrivateAmounts, ProgressBar, SectionTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Field, Input, MoneyInput, SegmentedControl } from "@/components/ui/form";
import { Chart, type HoverInfo, type SeriesSpec } from "@/components/charts/Chart";

const STYLES: { value: WealthStyle; label: string; hint: string }[] = [
  { value: "seguro", label: "Seguro", hint: "Renda fixa e Tesouro, sem sustos. Cresce devagar e sempre." },
  { value: "equilibrado", label: "Equilibrado", hint: "Base em renda fixa e uma parte em fundos e ações." },
  { value: "crescimento", label: "Crescimento", hint: "Mais ações e fundos imobiliários, pensando em muitos anos." },
];

const GOALS = ["Montar minha reserva de emergência", "Independência financeira", "Ficar rico no longo prazo", "Comprar um carro", "Comprar uma casa", "Aposentadoria"];
const MONTH_SECONDS = 30.44 * 86_400;

export function Plano() {
  const wealth = useUserData("wealth");
  const profile = useUserData("profile");
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const navigate = useNavigate();
  const ai = useAsync("ai-info", () => api.ai.info(), { staleMs: 30_000 });
  const { data: ind, loading: indLoading } = useIndicators();
  const { data: tesouro } = useTesouro();
  const [answers, setAnswers] = useState<WealthAnswers>(
    () =>
      wealth.answers ?? {
        goal: "Ficar rico no longo prazo",
        years: 15,
        monthly: Math.max(1, Math.round(profile.monthlyInvest || 50)),
        start: 0,
        style: profile.riskProfile === "arrojado" ? "crescimento" : profile.riskProfile === "moderado" ? "equilibrado" : "seguro",
      }
  );
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showText, setShowText] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const years = Math.max(1, answers.years || 0);
  const { start, monthly } = answers;
  const market = useMemo(() => planMarket(ind, tesouro, years), [ind, tesouro, years]);
  const alloc = useMemo(() => planAllocation(answers.style, years, answers.goal), [answers.style, years, answers.goal]);
  const proj = useMemo(() => projectPlan(start, monthly, alloc.parts, market), [start, monthly, alloc, market]);
  const compare = useMemo(() => compareProducts(start, monthly, market), [start, monthly, market]);
  const why = useMemo(() => explainPlan(start, monthly, alloc, market, proj, compare), [start, monthly, alloc, market, proj, compare]);
  const summary = planSummary(start, monthly, proj, market);
  const endLabel = planEndLabel(market.start, proj.months);
  const t0 = Math.floor(market.start.getTime() / 1000);
  const series = useMemo<SeriesSpec[]>(() => {
    const t = (m: number) => Math.round(t0 + m * MONTH_SECONDS);
    return [
      { kind: "area", id: "value", color: "#34D399", data: proj.points.map((p) => ({ time: t(p.month), value: p.value })) },
      { kind: "line", id: "real", color: "#4F8CFF", width: 2, data: proj.points.map((p) => ({ time: t(p.month), value: p.real })) },
      { kind: "line", id: "invested", color: "#94A3B8", dashed: true, width: 1, data: proj.points.map((p) => ({ time: t(p.month), value: p.invested })) },
    ];
  }, [proj, t0]);
  const hovered = hover ? proj.points[Math.min(proj.months, Math.max(0, Math.round((hover.time - t0) / MONTH_SECONDS)))] : undefined;

  const headline =
    monthly > 0 && start > 0
      ? `começando com ${brl(start)} e guardando ${brl(monthly)} por mês`
      : monthly > 0
        ? `guardando ${brl(monthly)} por mês`
        : start > 0
          ? `com ${brl(start)} colocados uma vez só`
          : "sem nenhum valor ainda";
  const inParts = alloc.parts.map((p) => p.product);

  const plan = wealth.plan;
  const saved = wealth.answers;
  const changed = !!plan && !!saved && (["goal", "years", "monthly", "start", "style"] as const).some((k) => saved[k] !== answers[k]);
  const done = plan?.steps.filter((s) => s.done).length ?? 0;
  const generate = async () => {
    setLoading(true);
    update("wealth", (w) => ({ ...w, answers }));
    try {
      const result = await api.plans.wealth(answers);
      update("wealth", (w) => ({ ...w, answers, plan: result }));
      toast({ title: "Plano pronto", message: result.searched ? `Com ${result.sources.length} fonte(s) da internet.` : "Feito com a base de livros do app.", tone: "success" });
    } catch (err) {
      toastError(err, "Não foi possível montar o plano");
    } finally {
      setLoading(false);
    }
  };
  const toggle = (id: string) => update("wealth", (w) => (w.plan ? { ...w, plan: { ...w.plan, steps: w.plan.steps.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) } } : w));
  const exportPdf = async () => {
    setExporting(true);
    try {
      const numbers = `## Os números do plano\n${planBrief(start, monthly, alloc, market, proj, compare, why)}`;
      let body = numbers;
      if (plan) {
        const clean = plan.text.replace(/^\s*[-*]\s*\[( |x|X)\].*$/gm, "").trim();
        const checklist = plan.steps.map((s) => `- [${s.done ? "x" : " "}] ${s.date ? `${dateBR(s.date)}: ` : ""}${s.text}`).join("\n");
        const sources = plan.sources.length ? `\n\n## Fontes\n${plan.sources.map((s, i) => `- [${i + 1}] ${s.title} — ${s.url}`).join("\n")}` : "";
        body = `${clean}\n\n${numbers}\n\n## Checklist\n${checklist}${sources}`;
      }
      const subtitle = [start > 0 && `Começa com ${brl(start)}`, monthly > 0 && `${brl(monthly)} por mês`, `${years} ${years === 1 ? "ano" : "anos"}`, `estilo ${answers.style}`].filter(Boolean).join(" · ");
      const res = await api.plans.exportPdf(`Meu plano: ${answers.goal}`, body, subtitle);
      if (res) toast({ title: "PDF salvo", message: res.path, tone: "success" });
    } catch (err) {
      toastError(err, "Não foi possível gerar o PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader title="Meu plano" subtitle="Responda 5 perguntas e veja quanto seu dinheiro pode virar, com dados reais de hoje e a conta explicada passo a passo. Dá para começar com R$ 1." />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <SectionTitle title="Suas respostas" />
          <div className="space-y-4">
            <Field label="1. Qual é o seu objetivo?">
              <Input value={answers.goal} onChange={(e) => setAnswers({ ...answers, goal: e.target.value })} list="wealth-goals" />
              <datalist id="wealth-goals">
                {GOALS.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </Field>
            <Field label="2. Em quantos anos?" hint={answers.years ? `Até ${endLabel}.` : undefined}>
              <Input
                inputMode="numeric"
                value={answers.years || ""}
                onChange={(e) => setAnswers({ ...answers, years: Math.min(50, Number(e.target.value.replace(/\D/g, "")) || 0) })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="3. Valor inicial" hint="Entra uma vez só, hoje.">
                <MoneyInput value={answers.start} onChange={(v) => setAnswers({ ...answers, start: v })} />
              </Field>
              <Field label="4. Guardar por mês" hint="Todo mês. Pode ser R$ 1.">
                <MoneyInput value={answers.monthly} onChange={(v) => setAnswers({ ...answers, monthly: v })} />
              </Field>
            </div>
            <Field label="5. Qual estilo combina com você?" hint={STYLES.find((s) => s.value === answers.style)?.hint}>
              <SegmentedControl<WealthStyle> block value={answers.style} onChange={(v) => setAnswers({ ...answers, style: v })} options={STYLES.map((s) => ({ value: s.value, label: s.label }))} />
            </Field>
            <Field label="Algo mais? (opcional)">
              <Input value={answers.notes ?? ""} onChange={(e) => setAnswers({ ...answers, notes: e.target.value || undefined })} placeholder="Ex.: sou estudante, recebo por freela" />
            </Field>
            {ai.data?.hasKey ? (
              <Button block icon={plan ? RotateCcw : Sparkles} loading={loading} disabled={!answers.goal.trim() || !answers.years} onClick={() => void generate()}>
                {plan ? "Refazer o plano" : "Montar meu plano"}
              </Button>
            ) : (
              <div className="text-[13px] text-muted">O Assistente ainda não foi ativado. A projeção e a explicação ao lado funcionam mesmo assim.</div>
            )}
            {ai.data?.hasKey && (
              <div className="text-[12.5px] text-muted flex items-center gap-1.5">
                <Globe size={14} />
                {ai.data.hasSearch ? "Pesquisa na internet ligada: o plano usa fontes atuais e livros de finanças." : "Sem pesquisa na internet: o plano usa a base de livros de finanças do app."}
              </div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-3" padded={false}>
          <div className="p-5 pb-1">
            <div className="text-[13px] text-muted">
              Em {years} {years === 1 ? "ano" : "anos"} ({endLabel}), <PrivateAmounts text={headline} />
            </div>
            <div className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <div className="min-w-0">
                <div className="text-[12.5px] text-muted">No futuro, já sem IR</div>
                <AnimatedNumber private value={proj.net} format={brl} className="block text-[26px] sm:text-[30px] font-bold tracking-tight text-success leading-tight" />
              </div>
              <div className="min-w-0">
                <div className="text-[12.5px] text-muted">Em dinheiro de hoje</div>
                <AnimatedNumber private value={proj.real} format={brl} className="block text-[26px] sm:text-[30px] font-bold tracking-tight text-primary leading-tight" />
              </div>
            </div>
            <div className="text-[13px] text-muted mt-2">
              {summary}
              {proj.invested > 0 && " Estimativa com os dados de hoje, não é garantia."}
            </div>
          </div>
          <div className="px-5 pt-2 min-h-[20px] text-[12.5px] text-muted tabular">
            {hovered ? (
              <>
                <span className="font-semibold text-fg">{planEndLabel(market.start, hovered.month)}</span> · <Private>{brl(hovered.value)}</Private> · <Private>{brl(hovered.real)}</Private> de hoje · você colocou <Private>{brl(hovered.invested)}</Private>
              </>
            ) : (
              "Passe o mouse ou o dedo no gráfico para ver cada mês."
            )}
          </div>
          <div className="px-2">
            <Chart series={series} height={220} formatter={(v) => brl(v)} onHover={setHover} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pt-1 pb-3 text-[12px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success" /> No futuro
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-primary" /> Em dinheiro de hoje
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-px w-4 border-t border-dashed border-muted" /> Quanto você colocou
            </span>
          </div>
          {proj.milestones.length > 0 && (
            <div className="flex flex-wrap gap-2 px-5 pb-5">
              {proj.milestones.map((m) => (
                <span key={m.value} className="rounded-full bg-success/10 text-success px-3 py-1 text-[12.5px] font-medium">
                  <Private>{brl(m.value).replace(",00", "")}</Private> em {m.month < 12 ? `${m.month} ${m.month === 1 ? "mês" : "meses"}` : `${num(m.month / 12, 1).replace(",0", "")} anos`}
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <SectionTitle
          title="Por que esses números?"
          subtitle={
            market.live
              ? "A conta passo a passo, com os dados de hoje."
              : indLoading
                ? "Buscando os dados de hoje no Banco Central…"
                : "Sem conexão com o Banco Central agora: a conta usa estimativas."
          }
          action={
            !plan && (
              <Button size="sm" variant="secondary" icon={FileDown} loading={exporting} onClick={() => void exportPdf()} className="shrink-0 whitespace-nowrap">
                Baixar PDF
              </Button>
            )
          }
        />
        <ol className="space-y-3.5">
          {why.map((w, i) => (
            <li key={w.title} className="flex gap-3">
              <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-primary/10 text-primary text-[12.5px] font-semibold flex items-center justify-center tabular">{i + 1}</span>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold">{w.title}</div>
                {w.text.split("\n").map((t) => (
                  <p key={t} className="text-[13.5px] leading-relaxed mt-0.5">
                    {t}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 mt-4">
        <Card>
          <SectionTitle title="E se fosse em outro lugar?" subtitle={`O mesmo dinheiro, no mesmo prazo, até ${endLabel}. Valores já sem IR.`} />
          <div className="divide-y divide-line/[0.06]">
            {compare.map((c) => (
              <div key={c.product} className="py-2.5 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium flex flex-wrap items-center gap-1.5">
                    {PLAN_PRODUCTS[c.product].label}
                    {inParts.includes(c.product) && <Badge tone="primary">no seu plano</Badge>}
                  </div>
                  <div className="text-[12.5px] text-muted">
                    {c.product !== "parado" && `~${num(c.rate, 1)}% ao ano · `}
                    {c.note}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[14px] font-semibold tabular">{brl(c.net)}</div>
                  <div className="text-[12.5px] text-muted tabular">{brl(c.real)} de hoje</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle title="De onde vêm os números" subtitle="Dados oficiais de hoje e as premissas da conta." />
          <div className="space-y-2.5">
            {market.assumptions.map((a) => (
              <div key={a.label} className="text-[13px]">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{a.label}</span>
                  <span className="tabular">{a.value}</span>
                </div>
                <div className="text-[12px] text-muted">
                  {a.source}
                  {a.date && ` · ${a.date}`}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {plan && (
        <Card className="mt-4">
          <SectionTitle
            title="Seu plano"
            subtitle={`Feito em ${dateBR(plan.createdAt)} · ${done}/${plan.steps.length} passos concluídos`}
            action={
              <Button size="sm" variant="secondary" icon={FileDown} loading={exporting} onClick={() => void exportPdf()}>
                Baixar PDF
              </Button>
            }
          />
          {changed && (
            <div className="mb-3 rounded-xl bg-warning/10 text-warning px-3 py-2 text-[13px]">
              Você mudou as respostas depois deste plano. Os números acima já estão atualizados{ai.data?.hasKey ? "; refaça o plano para o texto acompanhar." : ", mas o texto abaixo ainda é do plano anterior."}
            </div>
          )}
          {plan.steps.length > 0 && <ProgressBar value={done / plan.steps.length} height={6} className="mb-3" />}
          <div className="space-y-1">
            {plan.steps.map((s) => (
              <label key={s.id} className="flex items-start gap-2.5 py-1 cursor-pointer">
                <input type="checkbox" checked={s.done} onChange={() => toggle(s.id)} className="mt-1 h-4 w-4 accent-[rgb(var(--primary))]" />
                <span className={clsx("text-[14px]", s.done && "line-through text-muted")}>
                  {s.date && <span className="font-semibold tabular mr-1.5">{dateBR(s.date)}</span>}
                  {s.text}
                </span>
              </label>
            ))}
          </div>
          <button type="button" className="mt-3 text-[13px] text-primary font-medium inline-flex items-center gap-1" onClick={() => setShowText((v) => !v)}>
            <ChevronDown size={15} className={clsx("transition", showText && "rotate-180")} /> {showText ? "Esconder" : "Ler"} o plano completo
          </button>
          {showText && (
            <div className="prose-investa mt-3">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      onClick={(e) => {
                        e.preventDefault();
                        if (href) void api.openExternal(href);
                      }}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {plan.text.replace(/^\s*[-*]\s*\[( |x|X)\].*$/gm, "").trim()}
              </ReactMarkdown>
            </div>
          )}
          {plan.sources.length > 0 && (
            <div className="mt-4 pt-3 border-t border-line/10">
              <div className="text-[13px] font-semibold mb-1.5 flex items-center gap-1.5">
                <Globe size={14} /> Fontes da internet
              </div>
              <div className="space-y-1">
                {plan.sources.map((s, i) => (
                  <button key={s.url} type="button" onClick={() => void api.openExternal(s.url)} className="flex items-center gap-1.5 text-[13px] text-primary text-left hover:underline">
                    <Badge>{i + 1}</Badge> <span className="truncate">{s.title}</span> <ExternalLink size={12} className="shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={Rocket} onClick={() => navigate("/carteira?novo=1")}>
              Registrar meu primeiro investimento
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const d = new Date();
                d.setMonth(d.getMonth() + Math.round(years * 12));
                const prazo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                navigate(`/objetivos?novo=1&nome=${encodeURIComponent(answers.goal)}&valor=${Math.round(proj.net)}&prazo=${prazo}`);
              }}
            >
              Criar uma meta com esse objetivo
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
