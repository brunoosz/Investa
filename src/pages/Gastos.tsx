import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Briefcase,
  Bus,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  PawPrint,
  Plane,
  Plus,
  Receipt,
  Repeat,
  ShoppingBag,
  Sparkles,
  ShoppingCart,
  Ticket,
  Trash,
  Utensils,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import type { Expense, PaymentMethod } from "@shared/types";
import { addMonthsYm, cardsUsage, pendingFor, currentYm, mandatoryTotal, monthBudget, EXPENSE_CATEGORIES, INCOME_CATEGORIES, INCOME_KINDS, incomeKindLabel, PAYMENT_LABEL, summarizeMonth, ymLabel, type MonthEntry, localIsoDate } from "@shared/finance";
import { institutionLabel } from "@shared/banks";
import { api, uid } from "@/lib/api";
import { brl, dateBR, pct } from "@/lib/format";
import { useSession, useUserData } from "@/store/session";
import { toastError, useUi } from "@/store/ui";
import { Card, EmptyState, PageHeader, Private, ProgressBar, SectionTitle, toneColor } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Chip, Field, Input, MoneyInput, SegmentedControl, Select, Toggle } from "@/components/ui/form";
import { ConfirmDialog, Sheet } from "@/components/ui/Sheet";
import { BarList, Donut, Legend, PALETTE } from "@/components/charts/small";
import { InstitutionSelect } from "@/components/market";
import { InvoicesCard } from "@/components/Invoices";
import { AccountsCard } from "@/components/Accounts";
import { BillsCard } from "@/components/Bills";
import { PlannedCard } from "@/components/Planned";
import { MonthCalendarCard } from "@/components/MonthCalendar";
import { useAssistant } from "@/store/assistant";
import { useAsync } from "@/hooks/useAsync";

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Moradia: House,
  Alimentação: Utensils,
  Mercado: ShoppingCart,
  Transporte: Bus,
  Saúde: HeartPulse,
  Educação: GraduationCap,
  Lazer: Ticket,
  Compras: ShoppingBag,
  Assinaturas: Repeat,
  Contas: Zap,
  Viagem: Plane,
  Pets: PawPrint,
  Presentes: Gift,
  "Salário extra": Briefcase,
  Freelance: Briefcase,
  Trabalho: Briefcase,
  "Presente/família": Gift,
};

function catColor(category: string): string {
  const all = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
  return PALETTE[Math.max(0, all.indexOf(category)) % PALETTE.length];
}

function emptyExpense(type: Expense["type"] = "despesa"): Expense {
  return {
    id: uid(),
    type,
    description: "",
    amount: 0,
    date: localIsoDate(),
    category: type === "despesa" ? "Alimentação" : "Trabalho",
    incomeKind: type === "receita" ? "trabalho" : undefined,
    method: type === "despesa" ? "credito" : "pix",
    institution: "",
    installments: 1,
  };
}

function ExpenseSheet({ open, initial, onClose, onDelete }: { open: boolean; initial: Expense | null; onClose: () => void; onDelete: (e: Expense) => void }) {
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const accounts = useUserData("accounts");
  const invoices = useUserData("invoices");
  const expenses = useUserData("expenses");
  const [e, setE] = useState<Expense>(initial ?? emptyExpense());
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setE(initial ? { ...initial } : emptyExpense());
  }
  const cats = e.type === "despesa" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  // Limite do cartão sem contar a própria compra (ao editar).
  const card =
    e.type === "despesa" && e.method === "credito" && e.institution
      ? cardsUsage(accounts.filter((a) => a.institution === e.institution), invoices, expenses.filter((x) => x.id !== e.id))[0]
      : undefined;
  const overLimit = !!card && e.amount > card.available;
  const valid = e.description.trim() && e.amount > 0 && e.date;
  const save = () => {
    const item = { ...e, description: e.description.trim(), installments: e.method === "credito" ? e.installments : 1 };
    update("expenses", (list) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list]));
    toast({ title: initial ? "Lançamento atualizado" : "Lançamento adicionado", tone: "success" });
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? "Editar lançamento" : "Novo lançamento"}
      footer={
        <>
          {initial && (
            <Button variant="danger" icon={Trash} className="mr-auto" onClick={() => onDelete(initial)}>
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
        <SegmentedControl<Expense["type"]>
          block
          value={e.type}
          onChange={(t) => setE({ ...emptyExpense(t), id: e.id, description: e.description, amount: e.amount, date: e.date })}
          options={[
            { value: "despesa", label: "Gasto" },
            { value: "receita", label: "Entrada extra" },
          ]}
        />
        {e.type === "receita" && (
          <div className="text-footnote text-muted -mt-1">Dinheiro avulso, fora do salário. Aparece à parte e não aumenta sua renda do mês.</div>
        )}
        <Field label={e.type === "despesa" ? "Descrição" : "Motivo"}>
          <Input autoFocus value={e.description} onChange={(ev) => setE({ ...e, description: ev.target.value })} placeholder={e.type === "despesa" ? "Ex.: Tênis novo" : "Ex.: presente da vó, freela de design…"} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={e.installments > 1 ? "Valor total da compra" : "Valor"}>
            <MoneyInput value={e.amount} onChange={(v) => setE({ ...e, amount: v })} />
          </Field>
          <Field label="Data">
            <Input type="date" value={e.date} onChange={(ev) => setE({ ...e, date: ev.target.value })} />
          </Field>
        </div>
        <Field label={e.type === "despesa" ? "Categoria" : "De onde veio?"}>
          <div className="flex flex-wrap gap-1.5">
            {e.type === "despesa"
              ? cats.map((c) => (
                  <Chip key={c} active={e.category === c} icon={CATEGORY_ICON[c]} onClick={() => setE({ ...e, category: c })}>
                    {c}
                  </Chip>
                ))
              : INCOME_KINDS.map((k) => (
                  <Chip key={k.id} active={e.category === k.label || e.incomeKind === k.id} icon={CATEGORY_ICON[k.label]} onClick={() => setE({ ...e, category: incomeKindLabel(k.id), incomeKind: k.id })}>
                    {k.label}
                  </Chip>
                ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={e.type === "despesa" ? "Forma de pagamento" : "Como recebeu"}>
            <Select value={e.method} onChange={(ev) => setE({ ...e, method: ev.target.value as PaymentMethod, installments: ev.target.value === "credito" ? e.installments : 1 })}>
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_LABEL[m]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Banco / cartão">
            <InstitutionSelect value={e.institution} onChange={(v) => setE({ ...e, institution: v })} />
          </Field>
        </div>
        {e.type === "despesa" && e.method === "credito" && (
          <Field label="Parcelamento" hint={e.installments > 1 && e.amount > 0 ? `${e.installments}x de ${brl(e.amount / e.installments)} — a primeira parcela entra no mês da compra.` : "À vista no cartão."}>
            <Select value={e.installments} onChange={(ev) => setE({ ...e, installments: Number(ev.target.value) })}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "À vista" : `${n}x`}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {card && (
          <div className={clsx("rounded-control px-4 py-3 text-footnote", overLimit ? "bg-danger/10 text-danger" : "bg-line/[0.04] text-muted")} data-testid="limit-hint">
            {overLimit ? "Passa do limite! " : ""}Limite disponível no {institutionLabel(card.institution)}: <Private>{brl(card.available)}</Private> de <Private>{brl(card.limit)}</Private>.
          </div>
        )}
      </div>
    </Sheet>
  );
}

function EntryRow({ entry, onClick }: { entry: MonthEntry; onClick: () => void }) {
  const e = entry.expense;
  const Icon = CATEGORY_ICON[e.category] ?? (e.type === "receita" ? Wallet : Receipt);
  const color = catColor(e.category);
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-5 py-3 min-h-[56px] hover:bg-line/[0.04] active:bg-line/[0.07] transition-colors text-left">
      <div className="h-10 w-10 rounded-chip flex items-center justify-center shrink-0" style={{ background: toneColor(color, 0.14), color }}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-body font-medium truncate">{e.description}</div>
        <div className="text-footnote text-muted truncate">
          {e.category} · {PAYMENT_LABEL[e.method]}
          {e.institution ? ` · ${institutionLabel(e.institution)}` : ""}
          {entry.totalInstallments > 1 ? ` · parcela ${entry.installment}/${entry.totalInstallments}` : ""}
        </div>
      </div>
      <div className={clsx("font-semibold tabular", e.type === "receita" ? "text-success" : "")} data-private="">
        {e.type === "receita" ? "+" : "−"} {brl(entry.amount)}
      </div>
    </button>
  );
}

export function Gastos() {
  const expenses = useUserData("expenses");
  const profile = useUserData("profile");
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const [ym, setYm] = useState(currentYm());
  const [sheet, setSheet] = useState<{ open: boolean; item: Expense | null }>({ open: false, item: null });
  const [toDelete, setToDelete] = useState<Expense | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const [withAi, setWithAi] = useState(false);
  const ai = useAsync("ai-info", () => api.ai.info(), { staleMs: 30_000 });
  const ask = useAssistant((s) => s.ask);
  const navigate = useNavigate();
  const summary = useMemo(() => summarizeMonth(expenses, ym, profile.salary, profile.extraIncome), [expenses, ym, profile.salary, profile.extraIncome]);
  const planned = profile.fixedExpenses + profile.variableExpenses;
  const invoices = useUserData("invoices");
  const bills = useUserData("bills");
  const plannedList = useUserData("planned");
  const boxes = useUserData("boxes");
  const budget = useMemo(() => monthBudget(summary, invoices, ym, new Date(), pendingFor(bills, plannedList, ym, boxes)), [summary, invoices, bills, plannedList, boxes, ym]);
  const mandatory = mandatoryTotal(bills);
  const donut = summary.byCategory.map((c) => ({ label: c.category, value: c.total, color: catColor(c.category) }));

  const grouped = useMemo(() => {
    const map = new Map<string, MonthEntry[]>();
    for (const e of summary.entries) {
      const key = e.totalInstallments > 1 && e.installment > 1 ? "Parcelas de compras anteriores" : dateBR(e.expense.date, { weekday: "long", day: "numeric", month: "long" });
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()];
  }, [summary.entries]);

  const doExport = async (format: "pdf" | "xlsx") => {
    setExporting(format);
    try {
      const res = await api.exportReport(ym, format, withAi && !!ai.data?.hasKey);
      if (res) toast({ title: "Relatório salvo", message: res.path, tone: "success" });
    } catch (err) {
      toastError(err, "Não foi possível exportar");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Gastos"
        subtitle="Registre compras (inclusive parceladas), veja para onde vai seu dinheiro e baixe o relatório do mês."
        actions={
          <>
            {ai.data?.hasKey && (
              <label className="flex items-center gap-2 text-footnote text-muted mr-1" title="O Assistente escreve um resumo do mês com pontos de atenção e sugestões dentro do PDF ou da planilha.">
                <Toggle checked={withAi} onChange={setWithAi} label="Incluir análise do Assistente" /> Com análise da IA
              </label>
            )}
            <Button variant="secondary" icon={FileText} loading={exporting === "pdf"} onClick={() => void doExport("pdf")}>
              PDF
            </Button>
            <Button variant="secondary" icon={FileSpreadsheet} loading={exporting === "xlsx"} onClick={() => void doExport("xlsx")}>
              Excel
            </Button>
            <Button icon={Plus} onClick={() => setSheet({ open: true, item: null })}>
              Novo lançamento
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-2 mb-4">
        <Button size="icon" variant="secondary" onClick={() => setYm(addMonthsYm(ym, -1))} aria-label="Mês anterior">
          <ChevronLeft size={18} />
        </Button>
        <div className="min-w-[180px] text-center font-semibold text-headline first-letter:uppercase">{ymLabel(ym)}</div>
        <Button size="icon" variant="secondary" onClick={() => setYm(addMonthsYm(ym, 1))} aria-label="Próximo mês">
          <ChevronRight size={18} />
        </Button>
        {ym !== currentYm() && (
          <Button size="sm" variant="ghost" onClick={() => setYm(currentYm())}>
            Hoje
          </Button>
        )}
        {ai.data?.hasKey && summary.entries.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={Sparkles}
            className="ml-auto"
            onClick={() => {
              ask({ mode: "financas", question: `Analise meus gastos de ${ymLabel(ym)}: onde estou gastando demais e o que posso cortar?` });
              navigate("/assistente");
            }}
          >
            Analisar com IA
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card>
          <div className="text-footnote text-muted">Renda do mês</div>
          <div className="text-[22px] tracking-[-0.02em] font-bold tabular mt-1" data-private="" data-testid="income-month">
            {brl(summary.income)}
          </div>
          <div className="text-footnote text-muted">
            {summary.extraIncome > 0 ? (
              <>
                salário · <Private className="text-success">+ {brl(summary.extraIncome)}</Private> extras à parte
              </>
            ) : (
              "salário e renda fixa"
            )}
          </div>
        </Card>
        <Card>
          <div className="text-footnote text-muted">Comprometido</div>
          <div className="text-[22px] tracking-[-0.02em] font-bold tabular mt-1" data-private="">
            {brl(budget.committed)}
          </div>
          <ProgressBar
            value={Math.min(1, budget.ratio)}
            className="mt-2"
            height={6}
            color={budget.ratio > 1 ? toneColor("danger") : budget.ratio > 0.8 ? toneColor("warning") : undefined}
          />
          <div className="text-footnote text-muted mt-1">
            {pct(budget.ratio * 100, 0, false)} da renda · gastos <Private>{brl(budget.spentDirect)}</Private>
            {budget.invoices > 0 && (
              <>
                {" "}
                + faturas <Private>{brl(budget.invoices)}</Private>
              </>
            )}
            {budget.pendingBills > 0 && (
              <>
                {" "}
                + contas, planejados e caixinhas <Private>{brl(budget.pendingBills)}</Private>
              </>
            )}
          </div>
        </Card>
        <Card className="sticker sticker-sun">
          <div className="text-footnote text-muted">Disponível para gastar</div>
          <div className={clsx("text-[22px] tracking-[-0.02em] font-bold tabular mt-1", budget.available >= 0 ? "text-success" : "text-danger")} data-private="" data-testid="available-month">
            {brl(budget.available)}
          </div>
          <div className="text-footnote text-muted">
            {budget.available < 0
              ? <>passou da renda em <Private>{brl(-budget.available)}</Private></>
              : budget.perDay !== undefined
                ? <><Private>{brl(budget.perDay)}</Private> por dia até o fim do mês</>
                : planned > 0 && summary.spent > planned
                  ? "acima do planejado"
                  : "depois de gastos e faturas"}
          </div>
        </Card>
        <Card>
          <div className="text-footnote text-muted">Parcelas futuras</div>
          <div className="text-[22px] tracking-[-0.02em] font-bold tabular mt-1" data-private="">
            {brl(summary.futureInstallments.reduce((s, f) => s + f.total, 0))}
          </div>
          <div className="text-footnote text-muted">nos próximos 6 meses</div>
        </Card>
      </div>

      <div className="mb-4 rounded-control bg-primary/[0.06] px-4 py-3 text-footnote text-muted">
        <span className="text-fg font-medium">Salário não é saldo livre.</span> Disponível = salário − gastos obrigatórios
        {mandatory > 0 && (
          <>
            {" "}
            (<Private>{brl(mandatory)}</Private>)
          </>
        )}{" "}
        − contas − faturas − caixinhas − o que já gastou. Entradas extras ficam à parte.
      </div>

      <MonthCalendarCard ym={ym} />
      <AccountsCard ym={ym} summary={summary} />
      <InvoicesCard ym={ym} summary={summary} />
      <BillsCard ym={ym} />
      <PlannedCard />

      {summary.entries.length === 0 ? (
        <Card>
          <EmptyState
            icon={Receipt}
            title="Nenhum lançamento neste mês"
            description="Registre o que você gasta — por exemplo: “comprei um celular em 10x no cartão do Nubank”. O Investa distribui as parcelas nos próximos meses."
            action={
              <Button icon={Plus} onClick={() => setSheet({ open: true, item: null })}>
                Adicionar gasto
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card padded={false} className="lg:col-span-2 overflow-hidden">
            {grouped.map(([day, list]) => (
              <div key={day}>
                <div className="px-5 pt-4 pb-1 text-footnote font-semibold text-muted first-letter:uppercase">{day}</div>
                <div className="divide-y divide-separator/[0.06]">
                  {list.map((entry) => (
                    <EntryRow key={`${entry.expense.id}-${entry.installment}`} entry={entry} onClick={() => setSheet({ open: true, item: entry.expense })} />
                  ))}
                </div>
              </div>
            ))}
          </Card>
          <div className="space-y-4">
            <Card>
              <SectionTitle title="Por categoria" />
              {donut.length ? (
                <div className="flex flex-col items-center gap-4">
                  <Donut data={donut} size={160} center={<Private block className="text-callout font-bold">{brl(summary.spent).replace(/,\d+$/, "")}</Private>} />
                  <div className="w-full">
                    <Legend data={donut} format={(v) => brl(v).replace(/,\d+$/, "")} private />
                  </div>
                </div>
              ) : (
                <div className="text-callout text-muted">Sem gastos neste mês.</div>
              )}
            </Card>
            {summary.byInstitution.length > 0 && (
              <Card>
                <SectionTitle title="Por banco / cartão" />
                <BarList data={summary.byInstitution.map((b) => ({ key: b.institution, label: institutionLabel(b.institution) || "Não informado", value: b.total }))} format={(v) => brl(v)} private />
              </Card>
            )}
            {summary.futureInstallments.length > 0 && (
              <Card>
                <SectionTitle title="Próximas faturas (parcelas)" />
                <div className="space-y-2">
                  {summary.futureInstallments.map((f) => (
                    <div key={f.ym} className="flex justify-between text-callout">
                      <span className="inline-block first-letter:uppercase text-muted">{ymLabel(f.ym)}</span>
                      <Private className="font-semibold tabular">{brl(f.total)}</Private>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      <ExpenseSheet
        open={sheet.open}
        initial={sheet.item}
        onClose={() => setSheet({ open: false, item: null })}
        onDelete={(e) => {
          setSheet({ open: false, item: null });
          setToDelete(e);
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) update("expenses", (l) => l.filter((x) => x.id !== toDelete.id));
          setToDelete(null);
          toast({ title: "Lançamento excluído", tone: "success" });
        }}
        title="Excluir lançamento?"
        message={toDelete ? `“${toDelete.description}”${toDelete.installments > 1 ? ` e todas as ${toDelete.installments} parcelas` : ""} será removido.` : ""}
        confirmLabel="Excluir"
        danger
      />
    </div>
  );
}
