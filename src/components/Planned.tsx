import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CalendarRange, Check, ChevronDown, FileDown, Plus, RotateCcw, Sparkles, Trash } from "lucide-react";
import clsx from "clsx";
import type { Expense, PlannedExpense } from "@shared/types";
import { monthsUntil, localIsoDate } from "@shared/finance";
import { api, uid } from "@/lib/api";
import { brl, dateBR } from "@/lib/format";
import { useSession, useUserData } from "@/store/session";
import { toastError, useUi } from "@/store/ui";
import { useAsync } from "@/hooks/useAsync";
import { Badge, Card, Private, ProgressBar, SectionTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Field, Input, MoneyInput } from "@/components/ui/form";
import { Sheet } from "@/components/ui/Sheet";

const todayIso = () => localIsoDate();

function PlannedSheet({ open, initial, onClose }: { open: boolean; initial: PlannedExpense | null; onClose: () => void }) {
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const empty = (): PlannedExpense => ({ id: uid(), description: "", amount: 0, date: todayIso(), done: false });
  const [item, setItem] = useState<PlannedExpense>(initial ?? empty());
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setItem(initial ? { ...initial } : empty());
  }
  const valid = item.description.trim().length > 1 && item.amount > 0 && !!item.date;
  const save = () => {
    const next = { ...item, description: item.description.trim() };
    update("planned", (list) => (list.some((p) => p.id === next.id) ? list.map((p) => (p.id === next.id ? next : p)) : [...list, next]));
    toast({ title: initial ? "Gasto atualizado" : "Gasto planejado adicionado", tone: "success" });
    onClose();
  };
  const remove = () => {
    update("planned", (list) => list.filter((p) => p.id !== item.id));
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? "Editar gasto planejado" : "Gasto que vai vir"}
      subtitle="Um gasto futuro: projeto da faculdade, viagem, presente, material, conserto…"
      footer={
        <>
          {initial && (
            <Button variant="danger" icon={Trash} className="mr-auto" onClick={remove}>
              Excluir
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={!valid}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="O que é">
          <Input value={item.description} onChange={(e) => setItem({ ...item, description: e.target.value })} placeholder="Ex.: material do projeto da faculdade" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quanto vai custar">
            <MoneyInput value={item.amount} onChange={(v) => setItem({ ...item, amount: v })} />
          </Field>
          <Field label="Quando">
            <Input type="date" value={item.date} onChange={(e) => setItem({ ...item, date: e.target.value })} />
          </Field>
        </div>
        <Field label="Observação (opcional)">
          <Input value={item.notes ?? ""} onChange={(e) => setItem({ ...item, notes: e.target.value || undefined })} placeholder="Ex.: dá para dividir com o grupo" />
        </Field>
      </div>
    </Sheet>
  );
}

function PlanView({ item }: { item: PlannedExpense }) {
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const [showText, setShowText] = useState(false);
  const [exporting, setExporting] = useState(false);
  const plan = item.plan!;
  const done = plan.steps.filter((s) => s.done).length;
  const toggle = (id: string) =>
    update("planned", (list) =>
      list.map((p) => (p.id === item.id && p.plan ? { ...p, plan: { ...p.plan, steps: p.plan.steps.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) } } : p))
    );
  const exportPdf = async () => {
    setExporting(true);
    try {
      const checklist = plan.steps.map((s) => `- [${s.done ? "x" : " "}] ${s.date ? `${dateBR(s.date, { day: "2-digit", month: "2-digit" })}: ` : ""}${s.text}`).join("\n");
      const md = `${plan.text.replace(/^\s*[-*]\s*\[( |x|X)\].*$/gm, "").trim()}\n\n## Checklist\n${checklist}`;
      const res = await api.plans.exportPdf(`Plano: ${item.description}`, md, `${brl(item.amount)} até ${dateBR(item.date)}`);
      if (res) toast({ title: "PDF salvo", message: res.path, tone: "success" });
    } catch (err) {
      toastError(err, "Não foi possível gerar o PDF");
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="mt-3 rounded-control bg-line/[0.04] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-footnote font-semibold">
          Plano do Assistente · {done}/{plan.steps.length} passos
        </div>
        <Button size="sm" variant="ghost" icon={FileDown} loading={exporting} onClick={() => void exportPdf()}>
          PDF
        </Button>
      </div>
      {plan.steps.length > 0 && <ProgressBar value={plan.steps.length ? done / plan.steps.length : 0} className="mt-2" height={5} />}
      <div className="mt-2 space-y-1">
        {plan.steps.map((s) => (
          <label key={s.id} className="flex items-start gap-2.5 py-1 cursor-pointer">
            <input type="checkbox" checked={s.done} onChange={() => toggle(s.id)} className="mt-1 h-4 w-4 accent-[rgb(var(--primary))]" />
            <span className={clsx("text-footnote", s.done && "line-through text-muted")}>
              {s.date && <span className="font-semibold tabular mr-1">{dateBR(s.date, { day: "2-digit", month: "2-digit" })}</span>}
              {s.text}
            </span>
          </label>
        ))}
      </div>
      <button type="button" className="pressable mt-2 text-footnote text-primary font-medium inline-flex items-center gap-1" onClick={() => setShowText((v) => !v)}>
        <ChevronDown size={14} className={clsx("transition-transform duration-200 ease-out-strong", showText && "rotate-180")} /> {showText ? "Esconder" : "Ver"} o plano completo
      </button>
      {showText && (
        <div className="prose-investa mt-2 text-footnote">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{plan.text.replace(/^\s*[-*]\s*\[( |x|X)\].*$/gm, "").trim()}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

/** Gastos futuros: quanto guardar por mês e um plano com datas montado pelo Assistente. */
export function PlannedCard() {
  const planned = useUserData("planned");
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const ai = useAsync("ai-info", () => api.ai.info(), { staleMs: 30_000 });
  const [sheet, setSheet] = useState<{ open: boolean; item: PlannedExpense | null }>({ open: false, item: null });
  const [loading, setLoading] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const active = planned.filter((p) => !p.done).sort((a, b) => a.date.localeCompare(b.date));
  const doneList = planned.filter((p) => p.done);

  const makePlan = async (item: PlannedExpense) => {
    setLoading(item.id);
    try {
      const plan = await api.plans.forExpense(item.id);
      update("planned", (list) => list.map((p) => (p.id === item.id ? { ...p, plan } : p)));
      setExpanded(item.id);
      toast({ title: "Plano pronto", message: plan.steps.length ? `${plan.steps.length} passos com datas.` : "Veja o plano completo.", tone: "success" });
    } catch (err) {
      toastError(err, "O Assistente não conseguiu montar o plano");
    } finally {
      setLoading(null);
    }
  };
  const markDone = (item: PlannedExpense) => {
    const entry: Expense = { id: uid(), type: "despesa", description: item.description, amount: item.amount, date: todayIso(), category: "Outros", method: "pix", institution: "", installments: 1, notes: "Gasto planejado" };
    update("expenses", (list) => [entry, ...list]);
    update("planned", (list) => list.map((p) => (p.id === item.id ? { ...p, done: true } : p)));
    toast({ title: "Gasto registrado", message: `${brl(item.amount)} lançado em Gastos. Pode editar a categoria lá.`, tone: "success" });
  };

  return (
    <Card className="mb-4">
      <SectionTitle
        title="Gastos que vão vir"
        subtitle={
          active.length ? (
            <>
              <Private>{brl(active.reduce((s, p) => s + p.amount, 0))}</Private> planejados · o do mês já sai do disponível
            </>
          ) : (
            "Projeto da faculdade, viagem, presente… O Assistente monta um plano com datas."
          )
        }
        action={
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => setSheet({ open: true, item: null })}>
            <span className="sm:hidden">Adicionar</span>
            <span className="hidden sm:inline">Adicionar gasto futuro</span>
          </Button>
        }
      />
      {active.length > 0 ? (
        <div className="divide-y divide-separator/[0.06]">
          {active.map((p) => {
            const months = monthsUntil(p.date);
            const perMonth = p.amount / months;
            const late = p.date < todayIso();
            return (
              <div key={p.id} className="py-3">
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setSheet({ open: true, item: p })} className="pressable flex items-center gap-3 flex-1 min-w-0 text-left">
                    <div className="h-10 w-10 rounded-chip bg-secondary/15 text-secondary flex items-center justify-center shrink-0">
                      <CalendarRange size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-callout truncate">{p.description}</div>
                      <div className="text-footnote text-muted flex flex-wrap items-center gap-x-2">
                        {late ? <Badge tone="warning">Data passou</Badge> : <span>{dateBR(p.date, { day: "2-digit", month: "short", year: "numeric" })}</span>}
                        {!late && (
                          <span>
                            guardar <Private>{brl(perMonth)}</Private>/mês
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <div className="font-semibold tabular text-body shrink-0" data-private="">
                    {brl(p.amount)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-2.5 sm:pl-[52px]">
                  {p.plan ? (
                    <Button size="sm" variant="secondary" icon={ChevronDown} onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                      {expanded === p.id ? "Esconder plano" : "Ver plano"}
                    </Button>
                  ) : null}
                  {ai.data?.hasKey && (
                    <Button size="sm" variant={p.plan ? "ghost" : "primary"} icon={p.plan ? RotateCcw : Sparkles} loading={loading === p.id} disabled={!!loading} onClick={() => void makePlan(p)}>
                      {p.plan ? "Refazer plano" : "Montar plano com o Assistente"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={Check} onClick={() => markDone(p)}>
                    Já gastei
                  </Button>
                </div>
                {p.plan && expanded === p.id && <PlanView item={p} />}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-3 text-footnote text-muted">
          <CalendarRange size={18} className="text-secondary shrink-0" />
          Anote os gastos que vão chegar. O app mostra quanto guardar por mês, e o Assistente monta um plano com datas que você marca e baixa em PDF.
        </div>
      )}
      {doneList.length > 0 && <div className="mt-3 text-footnote text-muted">{doneList.length} gasto(s) planejado(s) já realizado(s).</div>}
      <PlannedSheet open={sheet.open} initial={sheet.item} onClose={() => setSheet({ open: false, item: null })} />
    </Card>
  );
}
