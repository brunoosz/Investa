import { useState } from "react";
import { CreditCard, HandCoins, Landmark, Plus, Trash } from "lucide-react";
import clsx from "clsx";
import type { BankAccount, Expense, IncomeKind } from "@shared/types";
import { bankById, institutionLabel } from "@shared/banks";
import { cardsUsage, INCOME_KINDS, incomeKindLabel, type MonthSummary, localIsoDate } from "@shared/finance";
import { uid } from "@/lib/api";
import { brl, dateBR } from "@/lib/format";
import { useSession, useUserData } from "@/store/session";
import { useUi } from "@/store/ui";
import { Card, Private, ProgressBar, SectionTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Chip, DayInput, Field, Input, MoneyInput, Select, Toggle } from "@/components/ui/form";
import { Sheet } from "@/components/ui/Sheet";
import { InstitutionSelect } from "@/components/market";

const today = () => localIsoDate();
const round2 = (v: number) => Math.round(v * 100) / 100;

function BankMark({ id }: { id: string }) {
  const b = bankById(id);
  return (
    <div className="h-10 w-10 rounded-chip flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: b?.color ?? "rgb(var(--primary))" }}>
      {b?.short ?? (institutionLabel(id) || "?").slice(0, 3)}
    </div>
  );
}

function AccountSheet({ open, initial, onClose }: { open: boolean; initial: BankAccount | null; onClose: () => void }) {
  const update = useSession((s) => s.update);
  const accounts = useUserData("accounts");
  const toast = useUi((s) => s.toast);
  const empty = (): BankAccount => ({ id: uid(), institution: "", balance: 0, updatedAt: new Date().toISOString() });
  const [acc, setAcc] = useState<BankAccount>(initial ?? empty());
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setAcc(initial ? { ...initial } : empty());
  }
  const duplicate = !initial && accounts.some((a) => a.institution === acc.institution);
  const save = () => {
    const item = { ...acc, balance: acc.cardOnly ? 0 : acc.balance, card: acc.card && acc.card.limit > 0 ? acc.card : undefined, updatedAt: new Date().toISOString() };
    update("accounts", (list) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]));
    toast({ title: initial ? "Saldo atualizado" : "Conta adicionada", tone: "success" });
    onClose();
  };
  const remove = () => {
    update("accounts", (list) => list.filter((x) => x.id !== acc.id));
    toast({ title: "Conta removida", tone: "success" });
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? "Atualizar conta" : "Nova conta ou cartão"}
      subtitle="Saldo da conta e, se tiver, o limite do cartão desse banco."
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
          <Button onClick={save} disabled={!acc.institution || duplicate}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Banco" error={duplicate ? "Esse banco já está na lista. Toque nele para atualizar o saldo." : null}>
          <InstitutionSelect value={acc.institution} onChange={(v) => setAcc({ ...acc, institution: v })} />
        </Field>
        <div className="flex items-center justify-between rounded-control bg-line/[0.04] px-4 py-3">
          <div>
            <div className="font-medium text-callout">Só tenho o cartão aqui</div>
            <div className="text-footnote text-muted">Sem conta com saldo neste banco.</div>
          </div>
          <Toggle checked={!!acc.cardOnly} onChange={(v) => setAcc({ ...acc, cardOnly: v || undefined, card: v ? acc.card ?? { limit: 0 } : acc.card })} label="Só tenho o cartão aqui" />
        </div>
        {!acc.cardOnly && (
          <Field label="Saldo atual" hint="O valor que aparece no app do banco. Pode ser negativo se estiver usando o cheque especial.">
            <MoneyInput allowNegative value={acc.balance} onChange={(v) => setAcc({ ...acc, balance: v })} />
          </Field>
        )}
        <Field label="Limite do cartão de crédito (opcional)" hint="O limite total. O app desconta faturas e parcelas e mostra quanto ainda dá para usar.">
          <MoneyInput value={acc.card?.limit ?? 0} onChange={(v) => setAcc({ ...acc, card: { ...acc.card, limit: v } })} />
        </Field>
        {(acc.card?.limit ?? 0) > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fatura fecha no dia">
              <DayInput value={acc.card?.closingDay} onChange={(v) => setAcc({ ...acc, card: { limit: 0, ...acc.card, closingDay: v } })} placeholder="Ex.: 3" />
            </Field>
            <Field label="Fatura vence no dia">
              <DayInput value={acc.card?.dueDay} onChange={(v) => setAcc({ ...acc, card: { limit: 0, ...acc.card, dueDay: v } })} placeholder="Ex.: 10" />
            </Field>
          </div>
        )}
        <Field label="Observação (opcional)">
          <Input value={acc.notes ?? ""} onChange={(e) => setAcc({ ...acc, notes: e.target.value || undefined })} placeholder="Ex.: conta do salário" />
        </Field>
      </div>
    </Sheet>
  );
}

/** Entrada avulsa (freela, presente, venda…): fica à parte do salário e só soma ao saldo se a pessoa pedir. */
function IncomeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const update = useSession((s) => s.update);
  const accounts = useUserData("accounts").filter((a) => !a.cardOnly);
  const toast = useUi((s) => s.toast);
  const blank = () => ({ description: "", amount: 0, date: today(), kind: "" as IncomeKind | "", accountId: accounts[0]?.id ?? "", addToBalance: false });
  const [form, setForm] = useState(blank);
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setForm(blank());
  }
  const account = accounts.find((a) => a.id === form.accountId);
  const valid = form.description.trim().length > 1 && form.amount > 0 && !!form.kind;
  const save = () => {
    if (!form.kind) return;
    const entry: Expense = {
      id: uid(),
      type: "receita",
      description: form.description.trim(),
      amount: round2(form.amount),
      date: form.date,
      category: incomeKindLabel(form.kind),
      incomeKind: form.kind,
      method: "pix",
      institution: account?.institution ?? "",
      installments: 1,
    };
    update("expenses", (list) => [entry, ...list]);
    if (account && form.addToBalance) {
      update("accounts", (list) => list.map((a) => (a.id === account.id ? { ...a, balance: round2(a.balance + entry.amount), updatedAt: new Date().toISOString() } : a)));
    }
    toast({ title: "Entrada registrada", message: `${brl(entry.amount)} · ${incomeKindLabel(form.kind)}. Seu salário continua o mesmo.`, tone: "success" });
    onClose();
  };
  const kind = INCOME_KINDS.find((k) => k.id === form.kind);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Recebi dinheiro"
      subtitle="Um valor avulso, fora do salário. Fica em “Entradas extras” e não aumenta sua renda do mês."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={!valid}>
            Registrar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="De onde veio?" hint={kind?.hint ?? "Escolha um tipo."}>
          <div className="flex flex-wrap gap-1.5">
            {INCOME_KINDS.map((k) => (
              <Chip key={k.id} active={form.kind === k.id} onClick={() => setForm({ ...form, kind: k.id })}>
                {k.label}
              </Chip>
            ))}
          </div>
        </Field>
        <Field label="Motivo">
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={form.kind === "trabalho" ? "Ex.: freela de design para a loja" : form.kind === "presente" ? "Ex.: presente da vó no aniversário" : "Ex.: vendi o videogame"}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor">
            <MoneyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
          </Field>
          <Field label="Data">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value || today() })} />
          </Field>
        </div>
        {accounts.length > 0 && (
          <>
            <Field label="Caiu em qual conta?">
              <Select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
                <option value="">Nenhuma (dinheiro vivo ou outro lugar)</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {institutionLabel(a.institution)} · {brl(a.balance)}
                  </option>
                ))}
              </Select>
            </Field>
            {account && (
              <div className="flex items-center justify-between rounded-control bg-line/[0.04] px-4 py-3">
                <div>
                  <div className="font-medium text-callout">Somar ao saldo da conta</div>
                  <div className="text-footnote text-muted">
                    {form.addToBalance ? (
                      <>
                        {institutionLabel(account.institution)} passa para <Private>{brl(round2(account.balance + form.amount))}</Private>.
                      </>
                    ) : (
                      "Desligado: fica só registrado, para você lembrar."
                    )}
                  </div>
                </div>
                <Toggle checked={form.addToBalance} onChange={(v) => setForm({ ...form, addToBalance: v })} label="Somar ao saldo da conta" />
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

/** Saldo de cada banco junto com a fatura do mês daquele banco. */
export function AccountsCard({ ym, summary }: { ym: string; summary: MonthSummary }) {
  const all = useUserData("accounts");
  const invoices = useUserData("invoices");
  const expenses = useUserData("expenses");
  const accounts = all.filter((a) => !a.cardOnly);
  const cards = cardsUsage(all, invoices, expenses);
  const [sheet, setSheet] = useState<{ open: boolean; item: BankAccount | null }>({ open: false, item: null });
  const [income, setIncome] = useState(false);
  const openByBank = new Map<string, number>();
  for (const i of invoices) if (i.ym === ym && !i.paid) openByBank.set(i.institution, (openByBank.get(i.institution) ?? 0) + i.amount);
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const openTotal = [...openByBank.values()].reduce((s, v) => s + v, 0);
  const free = total - openTotal;

  return (
    <Card className="mb-4">
      <SectionTitle
        title="Minhas contas"
        subtitle={
          accounts.length ? (
            <>
              <Private>{brl(total)}</Private> em {accounts.length} {accounts.length === 1 ? "conta" : "contas"}
            </>
          ) : (
            "Opcional: informe quanto tem em cada banco e o limite dos cartões."
          )
        }
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={HandCoins} onClick={() => setIncome(true)}>
              Recebi dinheiro
            </Button>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setSheet({ open: true, item: null })} aria-label="Adicionar conta">
              <span className="hidden sm:inline">Adicionar conta</span>
            </Button>
          </div>
        }
      />

      {accounts.length > 0 ? (
        <>
          <div className="divide-y divide-separator/[0.06]">
            {accounts.map((a) => {
              const inv = openByBank.get(a.institution) ?? 0;
              return (
                <button key={a.id} type="button" className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-line/[0.04] active:bg-line/[0.07] transition-colors rounded-chip -mx-1 px-1" onClick={() => setSheet({ open: true, item: a })}>
                  <BankMark id={a.institution} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-callout truncate">{institutionLabel(a.institution) || "Conta"}</div>
                    <div className="text-footnote text-muted truncate">
                      {inv ? (
                        <>
                          Fatura em aberto <Private>{brl(inv)}</Private> · sobra <Private>{brl(a.balance - inv)}</Private>
                        </>
                      ) : (
                        "Sem fatura em aberto neste mês"
                      )}
                      {` · atualizado ${dateBR(a.updatedAt, { day: "2-digit", month: "short" })}`}
                    </div>
                  </div>
                  <div className={clsx("font-semibold tabular text-body text-right shrink-0", a.balance < 0 && "text-danger")} data-private="">
                    {brl(a.balance)}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="rounded-control bg-line/[0.04] py-2.5">
              <div className="text-footnote text-muted">Nas contas</div>
              <Private block className="font-semibold tabular">
                {brl(total)}
              </Private>
            </div>
            <div className="rounded-control bg-line/[0.04] py-2.5">
              <div className="text-footnote text-muted">Faturas em aberto</div>
              <Private block className="font-semibold tabular">
                {brl(openTotal)}
              </Private>
            </div>
            <div className={clsx("rounded-control py-2.5", free < 0 ? "bg-danger/10 text-danger" : "bg-success/10")}>
              <div className="text-footnote text-muted">Livre de verdade</div>
              <Private block className="font-semibold tabular">
                {brl(free)}
              </Private>
            </div>
          </div>
        </>
      ) : cards.length ? null : (
        <div className="flex items-center gap-3 text-footnote text-muted">
          <Landmark size={18} className="text-primary shrink-0" />
          Com o saldo de cada banco, o app mostra quanto fica livre depois da fatura e o Assistente usa isso para dizer se uma compra cabe agora.
        </div>
      )}

      {cards.length > 0 && (
        <div className="mt-4 space-y-3" data-testid="card-limits">
          {cards.map((c) => {
            const acc = all.find((a) => a.id === c.accountId);
            const ratio = c.limit > 0 ? c.used / c.limit : 0;
            return (
              <button key={c.accountId} type="button" className="pressable w-full text-left" onClick={() => setSheet({ open: true, item: acc ?? null })}>
                <div className="flex items-center gap-2 text-footnote">
                  <CreditCard size={16} className="text-primary shrink-0" />
                  <span className="flex-1 min-w-0">
                    Limite disponível no {institutionLabel(c.institution)}: <Private className={clsx("font-semibold tabular", c.available < 0 && "text-danger")}>{brl(c.available)}</Private> de{" "}
                    <Private className="tabular">{brl(c.limit)}</Private>
                  </span>
                </div>
                <ProgressBar value={Math.min(1, ratio)} height={5} className="mt-1.5" color={ratio > 1 ? "rgb(var(--danger))" : ratio > 0.8 ? "rgb(var(--warning))" : undefined} />
                <div className="text-footnote text-muted mt-1">
                  Usado <Private>{brl(c.used)}</Private> em faturas abertas e parcelas
                  {c.closingDay ? ` · fecha dia ${c.closingDay}` : ""}
                  {c.dueDay ? ` · vence dia ${c.dueDay}` : ""}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {summary.extraIncome > 0 && (
        <div className="mt-4 rounded-control bg-success/[0.07] px-4 py-3 text-footnote" data-testid="extras-month">
          <div className="font-medium">
            Entradas extras do mês: <Private className="text-success">+{brl(summary.extraIncome)}</Private>
          </div>
          <div className="text-muted mt-0.5">
            {summary.extrasByKind.map((k, i) => (
              <span key={k.kind}>
                {i ? " · " : ""}
                {incomeKindLabel(k.kind)} <Private>{brl(k.total)}</Private>
              </span>
            ))}
            . Ficam à parte: não mudam seu salário nem o disponível do mês.
          </div>
        </div>
      )}

      <AccountSheet open={sheet.open} initial={sheet.item} onClose={() => setSheet({ open: false, item: null })} />
      <IncomeSheet open={income} onClose={() => setIncome(false)} />
    </Card>
  );
}
