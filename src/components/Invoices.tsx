import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard, Pencil, Plus, Sparkles, Trash, TriangleAlert } from "lucide-react";
import clsx from "clsx";
import type { Invoice } from "@shared/types";
import { bankById, institutionLabel } from "@shared/banks";
import { ymLabel, type MonthSummary } from "@shared/finance";
import { uid } from "@/lib/api";
import { brl } from "@/lib/format";
import { useSession, useUserData } from "@/store/session";
import { useUi } from "@/store/ui";
import { useAssistant } from "@/store/assistant";
import { Badge, Card, Private, ProgressBar, SectionTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Field, Input, MoneyInput, Toggle } from "@/components/ui/form";
import { Sheet } from "@/components/ui/Sheet";
import { InstitutionSelect } from "@/components/market";

function BankMark({ id }: { id: string }) {
  const b = bankById(id);
  return (
    <div className="h-10 w-10 rounded-xl flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: b?.color ?? "rgb(var(--primary))" }}>
      {b?.short ?? (institutionLabel(id) || "?").slice(0, 3)}
    </div>
  );
}

/** Soma do que foi lançado no crédito de cada banco no mês (sugestão de valor da fatura). */
function creditByBank(summary: MonthSummary): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of summary.entries) {
    if (e.expense.type !== "despesa" || e.expense.method !== "credito" || !e.expense.institution) continue;
    map.set(e.expense.institution, (map.get(e.expense.institution) ?? 0) + e.amount);
  }
  return map;
}

function InvoiceSheet({ open, initial, ym, suggestions, onClose }: { open: boolean; initial: Invoice | null; ym: string; suggestions: Map<string, number>; onClose: () => void }) {
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const empty = (): Invoice => ({ id: uid(), institution: "", ym, amount: 0, paid: false });
  const [inv, setInv] = useState<Invoice>(initial ?? empty());
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setInv(initial ? { ...initial } : empty());
  }
  const suggested = inv.institution ? suggestions.get(inv.institution) : undefined;
  const valid = inv.institution && inv.amount > 0;
  const save = () => {
    update("invoices", (list) => (list.some((x) => x.id === inv.id) ? list.map((x) => (x.id === inv.id ? inv : x)) : [inv, ...list]));
    toast({ title: initial ? "Fatura atualizada" : "Fatura adicionada", tone: "success" });
    onClose();
  };
  const remove = () => {
    update("invoices", (list) => list.filter((x) => x.id !== inv.id));
    toast({ title: "Fatura removida", tone: "success" });
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? "Editar fatura" : "Nova fatura"}
      subtitle={`Fatura do cartão em ${ymLabel(ym)}`}
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
        <Field label="Banco / cartão">
          <InstitutionSelect value={inv.institution} onChange={(v) => setInv({ ...inv, institution: v })} />
        </Field>
        <Field label="Valor da fatura" hint={suggested ? `Pelos seus lançamentos no crédito deste banco: ${brl(suggested)}` : "O valor que aparece no app do banco."}>
          <MoneyInput value={inv.amount} onChange={(v) => setInv({ ...inv, amount: v })} />
        </Field>
        {suggested && suggested !== inv.amount ? (
          <button type="button" className="text-[13px] text-primary font-medium -mt-2" onClick={() => setInv({ ...inv, amount: Math.round(suggested * 100) / 100 })}>
            Usar {brl(suggested)}
          </button>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vence no dia">
            <Input
              inputMode="numeric"
              value={inv.dueDay ?? ""}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, ""));
                setInv({ ...inv, dueDay: n >= 1 && n <= 31 ? n : undefined });
              }}
              placeholder="Ex.: 10"
            />
          </Field>
          <Field label="Pagamento mínimo">
            <MoneyInput value={inv.minimumPayment ?? 0} onChange={(v) => setInv({ ...inv, minimumPayment: v || undefined })} />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-line/[0.04] px-4 py-3">
          <div>
            <div className="font-medium text-[14.5px]">Fatura paga</div>
            <div className="text-[12.5px] text-muted">Faturas pagas não entram no cálculo do aperto do mês.</div>
          </div>
          <Toggle checked={inv.paid} onChange={(v) => setInv({ ...inv, paid: v })} label="Fatura paga" />
        </div>
        <Field label="Observação (opcional)">
          <Input value={inv.notes ?? ""} onChange={(e) => setInv({ ...inv, notes: e.target.value || undefined })} placeholder="Ex.: parcelei a fatura anterior em 6x" />
        </Field>
      </div>
    </Sheet>
  );
}

export function InvoicesCard({ ym, summary }: { ym: string; summary: MonthSummary }) {
  const invoices = useUserData("invoices");
  const profile = useUserData("profile");
  const update = useSession((s) => s.update);
  const ask = useAssistant((s) => s.ask);
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<{ open: boolean; item: Invoice | null }>({ open: false, item: null });
  const list = invoices.filter((i) => i.ym === ym).sort((a, b) => b.amount - a.amount);
  const suggestions = useMemo(() => creditByBank(summary), [summary]);
  const open = list.filter((i) => !i.paid).reduce((s, i) => s + i.amount, 0);
  const total = list.reduce((s, i) => s + i.amount, 0);
  const income = profile.salary + profile.extraIncome + summary.extraIncome;
  const ratio = income ? open / income : 0;
  const tight = income > 0 && open > income;
  const heavy = !tight && ratio > 0.5;

  const askHelp = () => {
    const lines = list.map(
      (i) =>
        `- ${institutionLabel(i.institution)}: ${brl(i.amount)}${i.dueDay ? `, vence dia ${i.dueDay}` : ""}${i.minimumPayment ? `, mínimo ${brl(i.minimumPayment)}` : ""} (${i.paid ? "paga" : "em aberto"})`
    );
    const attachment = `# Faturas de ${ymLabel(ym)}\n${lines.join("\n")}\n- Total em aberto: ${brl(open)}; renda do mês: ${brl(income)}; gastos lançados no mês: ${brl(summary.spent)}.`;
    const question = tight
      ? `Minhas faturas de ${ymLabel(ym)} somam ${brl(open)} e minha renda é ${brl(income)}. Me ajude a montar um plano para pagar sem me endividar.`
      : `Me ajude a organizar as faturas de ${ymLabel(ym)} (${brl(open)} em aberto) para não me apertar nos próximos meses.`;
    ask({ mode: "financas", question, attachment });
    navigate("/assistente");
  };

  return (
    <Card className={clsx("mb-4", tight && "border-danger/30")}>
      <SectionTitle
        title="Faturas dos cartões"
        subtitle={
          list.length ? (
            <>
              <Private>{brl(total)}</Private> em {list.length} {list.length === 1 ? "cartão" : "cartões"} · <Private>{brl(open)}</Private> em aberto
            </>
          ) : (
            "Informe quanto veio a fatura de cada cartão neste mês."
          )
        }
        action={
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => setSheet({ open: true, item: null })}>
            <span className="sm:hidden">Adicionar</span>
            <span className="hidden sm:inline">Adicionar fatura</span>
          </Button>
        }
      />

      {list.length > 0 ? (
        <>
          <div className="divide-y divide-line/[0.06]">
            {list.map((i) => (
              <div key={i.id} className="flex items-center gap-3 py-2.5">
                <BankMark id={i.institution} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[14.5px] truncate">{institutionLabel(i.institution) || "Cartão"}</div>
                  <div className="text-[12.5px] text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>
                      {i.dueDay ? `Vence dia ${i.dueDay}` : "Sem vencimento"}
                      {i.minimumPayment ? (
                        <>
                          {" "}
                          · mínimo <Private>{brl(i.minimumPayment)}</Private>
                        </>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => update("invoices", (l) => l.map((x) => (x.id === i.id ? { ...x, paid: !x.paid } : x)))}
                      title={i.paid ? "Marcar como em aberto" : "Marcar como paga"}
                    >
                      <Badge tone={i.paid ? "success" : "warning"}>{i.paid ? "Paga" : "Em aberto"}</Badge>
                    </button>
                  </div>
                </div>
                <div className="font-semibold tabular text-[15px] text-right shrink-0" data-private="">
                  {brl(i.amount)}
                </div>
                <Button size="icon-sm" variant="ghost" icon={Pencil} aria-label="Editar fatura" onClick={() => setSheet({ open: true, item: i })} />
              </div>
            ))}
          </div>

          {income > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-[12.5px] text-muted mb-1">
                <span>Faturas em aberto x renda do mês</span>
                <span className="tabular">{Math.round(ratio * 100)}%</span>
              </div>
              <ProgressBar value={Math.min(1, ratio)} height={6} color={tight ? "rgb(var(--danger))" : heavy ? "rgb(var(--warning))" : undefined} />
            </div>
          )}
        </>
      ) : (
        suggestions.size > 0 && (
          <div className="text-[13px] text-muted">
            Pelos seus lançamentos no crédito:{" "}
            <Private>{[...suggestions.entries()].map(([bank, v]) => `${institutionLabel(bank)} ${brl(v)}`).join(" · ")}</Private>
          </div>
        )
      )}

      {(tight || heavy || list.length > 0) && (
        <div
          className={clsx(
            "mt-4 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3",
            tight ? "bg-danger/10 text-danger" : heavy ? "bg-warning/10" : "bg-primary/[0.07]"
          )}
        >
          <div className="flex items-start gap-2 flex-1 text-[14px]">
            {tight ? <TriangleAlert size={18} className="shrink-0 mt-0.5" /> : <CreditCard size={18} className="shrink-0 mt-0.5 text-primary" />}
            <span className={tight ? "" : "text-fg"}>
              {tight
                ? <>As faturas em aberto passam da sua renda em <Private>{brl(open - income)}</Private>. O Assistente monta um plano com os juros reais de cada saída.</>
                : heavy
                  ? `As faturas levam ${Math.round(ratio * 100)}% da sua renda. Vale planejar os próximos meses.`
                  : "O Assistente pode revisar suas faturas e sugerir como pagar menos juros."}
            </span>
          </div>
          <Button size="sm" icon={Sparkles} variant={tight ? "danger" : "primary"} onClick={askHelp}>
            Pedir ajuda ao Assistente
          </Button>
        </div>
      )}

      <InvoiceSheet open={sheet.open} initial={sheet.item} ym={ym} suggestions={suggestions} onClose={() => setSheet({ open: false, item: null })} />
    </Card>
  );
}
