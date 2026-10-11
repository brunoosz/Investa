import { useState } from "react";
import { HandCoins, Landmark, Plus, Trash } from "lucide-react";
import clsx from "clsx";
import type { BankAccount, Expense } from "@shared/types";
import { bankById, institutionLabel } from "@shared/banks";
import { INCOME_CATEGORIES, type MonthSummary, localIsoDate } from "@shared/finance";
import { uid } from "@/lib/api";
import { brl, dateBR } from "@/lib/format";
import { useSession, useUserData } from "@/store/session";
import { useUi } from "@/store/ui";
import { Card, Private, SectionTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Field, Input, MoneyInput, Select, Toggle } from "@/components/ui/form";
import { Sheet } from "@/components/ui/Sheet";
import { InstitutionSelect } from "@/components/market";

const today = () => localIsoDate();
const round2 = (v: number) => Math.round(v * 100) / 100;

function BankMark({ id }: { id: string }) {
  const b = bankById(id);
  return (
    <div className="h-10 w-10 rounded-xl flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: b?.color ?? "rgb(var(--primary))" }}>
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
    const item = { ...acc, updatedAt: new Date().toISOString() };
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
      title={initial ? "Atualizar saldo" : "Nova conta"}
      subtitle="Quanto tem hoje na conta corrente, poupança ou carteira digital."
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
        <Field label="Saldo atual" hint="O valor que aparece no app do banco. Pode ser negativo se estiver usando o cheque especial.">
          <MoneyInput value={acc.balance} onChange={(v) => setAcc({ ...acc, balance: v })} />
        </Field>
        <Field label="Observação (opcional)">
          <Input value={acc.notes ?? ""} onChange={(e) => setAcc({ ...acc, notes: e.target.value || undefined })} placeholder="Ex.: conta do salário" />
        </Field>
      </div>
    </Sheet>
  );
}

/** Entrada de dinheiro fora da renda fixa (venda, freela, presente…), com opção de somar ao saldo de uma conta. */
function IncomeSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const update = useSession((s) => s.update);
  const accounts = useUserData("accounts");
  const toast = useUi((s) => s.toast);
  const [form, setForm] = useState({ description: "", amount: 0, date: today(), category: "Vendas", accountId: "", addToBalance: true });
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setForm({ description: "", amount: 0, date: today(), category: "Vendas", accountId: accounts[0]?.id ?? "", addToBalance: true });
  }
  const account = accounts.find((a) => a.id === form.accountId);
  const valid = form.description.trim().length > 1 && form.amount > 0;
  const save = () => {
    const entry: Expense = {
      id: uid(),
      type: "receita",
      description: form.description.trim(),
      amount: round2(form.amount),
      date: form.date,
      category: form.category,
      method: "pix",
      institution: account?.institution ?? "",
      installments: 1,
    };
    update("expenses", (list) => [entry, ...list]);
    if (account && form.addToBalance) {
      update("accounts", (list) => list.map((a) => (a.id === account.id ? { ...a, balance: round2(a.balance + entry.amount), updatedAt: new Date().toISOString() } : a)));
    }
    toast({ title: "Entrada registrada", message: `${brl(entry.amount)} em ${form.category.toLowerCase()}`, tone: "success" });
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Recebi dinheiro"
      subtitle="Um valor que entrou fora do salário: venda, freela, presente, reembolso…"
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
        <Field label="O que foi">
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex.: vendi o videogame" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor">
            <MoneyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
          </Field>
          <Field label="Data">
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value || today() })} />
          </Field>
        </div>
        <Field label="Tipo">
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {INCOME_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
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
              <div className="flex items-center justify-between rounded-2xl bg-line/[0.04] px-4 py-3">
                <div>
                  <div className="font-medium text-[14.5px]">Somar ao saldo</div>
                  <div className="text-[12.5px] text-muted">
                    {institutionLabel(account.institution)} passa para <Private>{brl(round2(account.balance + (form.addToBalance ? form.amount : 0)))}</Private>.
                  </div>
                </div>
                <Toggle checked={form.addToBalance} onChange={(v) => setForm({ ...form, addToBalance: v })} label="Somar ao saldo" />
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
  const accounts = useUserData("accounts");
  const invoices = useUserData("invoices");
  const [sheet, setSheet] = useState<{ open: boolean; item: BankAccount | null }>({ open: false, item: null });
  const [income, setIncome] = useState(false);
  const openByBank = new Map<string, number>();
  for (const i of invoices) if (i.ym === ym && !i.paid) openByBank.set(i.institution, (openByBank.get(i.institution) ?? 0) + i.amount);
  const total = accounts.reduce((s, a) => s + a.balance, 0);
  const openTotal = [...openByBank.values()].reduce((s, v) => s + v, 0);
  const free = total - openTotal;
  const extras = summary.entries.filter((e) => e.expense.type === "receita");

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
            "Opcional: informe quanto tem em cada banco para ver o que sobra depois das faturas."
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
          <div className="divide-y divide-line/[0.06]">
            {accounts.map((a) => {
              const inv = openByBank.get(a.institution) ?? 0;
              return (
                <button key={a.id} type="button" className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-line/[0.03] rounded-xl -mx-1 px-1" onClick={() => setSheet({ open: true, item: a })}>
                  <BankMark id={a.institution} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[14.5px] truncate">{institutionLabel(a.institution) || "Conta"}</div>
                    <div className="text-[12.5px] text-muted truncate">
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
                  <div className={clsx("font-semibold tabular text-[15px] text-right shrink-0", a.balance < 0 && "text-danger")} data-private="">
                    {brl(a.balance)}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">
            <div className="rounded-2xl bg-line/[0.04] py-2.5">
              <div className="text-[12px] text-muted">Nas contas</div>
              <Private block className="font-semibold tabular">
                {brl(total)}
              </Private>
            </div>
            <div className="rounded-2xl bg-line/[0.04] py-2.5">
              <div className="text-[12px] text-muted">Faturas em aberto</div>
              <Private block className="font-semibold tabular">
                {brl(openTotal)}
              </Private>
            </div>
            <div className={clsx("rounded-2xl py-2.5", free < 0 ? "bg-danger/10 text-danger" : "bg-success/10")}>
              <div className="text-[12px] text-muted">Livre de verdade</div>
              <Private block className="font-semibold tabular">
                {brl(free)}
              </Private>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-3 text-[13.5px] text-muted">
          <Landmark size={18} className="text-primary shrink-0" />
          Com o saldo de cada banco, o app mostra quanto fica livre depois da fatura e o Assistente usa isso para dizer se uma compra cabe agora.
        </div>
      )}

      {extras.length > 0 && (
        <div className="mt-3 text-[13px] text-muted">
          Entradas extras no mês: <Private className="text-success font-medium">+{brl(extras.reduce((s, e) => s + e.amount, 0))}</Private> ({extras.slice(0, 3).map((e) => e.expense.description).join(", ")}
          {extras.length > 3 ? "…" : ""})
        </div>
      )}

      <AccountSheet open={sheet.open} initial={sheet.item} onClose={() => setSheet({ open: false, item: null })} />
      <IncomeSheet open={income} onClose={() => setIncome(false)} />
    </Card>
  );
}
