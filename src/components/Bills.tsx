import { useState } from "react";
import { CalendarClock, Check, Plus, Repeat, Trash } from "lucide-react";
import clsx from "clsx";
import type { Bill, Expense } from "@shared/types";
import { billDueDate, EXPENSE_CATEGORIES, MANDATORY_PRESETS, mandatoryTotal, ymLabel, localIsoDate } from "@shared/finance";
import { uid } from "@/lib/api";
import { brl } from "@/lib/format";
import { useSession, useUserData } from "@/store/session";
import { useUi } from "@/store/ui";
import { Badge, Card, Private, SectionTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Chip, Field, Input, MoneyInput, Select, Toggle } from "@/components/ui/form";
import { Sheet } from "@/components/ui/Sheet";

const todayIso = () => localIsoDate();

function daysUntil(date: string): number {
  return Math.round((Date.parse(`${date}T12:00:00`) - Date.parse(`${todayIso()}T12:00:00`)) / 86_400_000);
}

function BillSheet({ open, initial, onClose }: { open: boolean; initial: Bill | null; onClose: () => void }) {
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const empty = (): Bill => ({ id: uid(), name: "", amount: 0, dueDay: 10, category: "Contas", paid: [], active: true });
  const [bill, setBill] = useState<Bill>(initial ?? empty());
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setBill(initial ? { ...initial } : empty());
  }
  const valid = bill.name.trim().length > 1 && bill.amount > 0 && bill.dueDay >= 1 && bill.dueDay <= 31;
  const save = () => {
    const item = { ...bill, name: bill.name.trim() };
    update("bills", (list) => (list.some((b) => b.id === item.id) ? list.map((b) => (b.id === item.id ? item : b)) : [...list, item]));
    toast({ title: initial ? "Conta atualizada" : "Conta fixa adicionada", message: `Aviso 3 dias antes do dia ${item.dueDay}.`, tone: "success" });
    onClose();
  };
  const remove = () => {
    update("bills", (list) => list.filter((b) => b.id !== bill.id));
    toast({ title: "Conta removida", tone: "success" });
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? "Editar conta fixa" : "Nova conta fixa"}
      subtitle="Contas que se repetem todo mês: aluguel, internet, luz, streaming, academia…"
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
        {!initial && (
          <Field label="Sugestões de gastos obrigatórios">
            <div className="flex flex-wrap gap-1.5">
              {MANDATORY_PRESETS.map((p) => (
                <Chip key={p.name} active={bill.name === p.name} onClick={() => setBill({ ...bill, name: p.name, category: p.category, dueDay: bill.dueDay || p.dueDay, mandatory: true })}>
                  {p.name}
                </Chip>
              ))}
            </div>
          </Field>
        )}
        <Field label="Nome">
          <Input value={bill.name} onChange={(e) => setBill({ ...bill, name: e.target.value })} placeholder="Ex.: Internet" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor">
            <MoneyInput value={bill.amount} onChange={(v) => setBill({ ...bill, amount: v })} />
          </Field>
          <Field label="Vence no dia">
            <Input
              inputMode="numeric"
              value={bill.dueDay || ""}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, ""));
                setBill({ ...bill, dueDay: Math.min(31, n) });
              }}
              placeholder="Ex.: 10"
            />
          </Field>
        </div>
        <Field label="Categoria">
          <Select value={bill.category} onChange={(e) => setBill({ ...bill, category: e.target.value })}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <div className="flex items-center justify-between rounded-2xl bg-line/[0.04] px-4 py-3">
          <div>
            <div className="font-medium text-[14.5px]">Obrigatório</div>
            <div className="text-[12.5px] text-muted">Gasto que não dá para cortar no mês (transporte, aluguel, luz). Sai do salário antes de tudo.</div>
          </div>
          <Toggle checked={!!bill.mandatory} onChange={(v) => setBill({ ...bill, mandatory: v })} label="Obrigatório" />
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-line/[0.04] px-4 py-3">
          <div>
            <div className="font-medium text-[14.5px]">Ativa</div>
            <div className="text-[12.5px] text-muted">Desligue para pausar sem apagar (ex.: assinatura cancelada por um tempo).</div>
          </div>
          <Toggle checked={bill.active} onChange={(v) => setBill({ ...bill, active: v })} label="Ativa" />
        </div>
      </div>
    </Sheet>
  );
}

/** Contas fixas do mês: quanto falta pagar, o que vence logo e o botão "Paguei". */
export function BillsCard({ ym }: { ym: string }) {
  const bills = useUserData("bills");
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const [sheet, setSheet] = useState<{ open: boolean; item: Bill | null }>({ open: false, item: null });
  const active = bills.filter((b) => b.active).sort((a, b) => a.dueDay - b.dueDay);
  const pending = active.filter((b) => !b.paid.includes(ym));
  const pendingTotal = pending.reduce((s, b) => s + b.amount, 0);
  const mandatory = mandatoryTotal(bills);
  const groups = [
    { title: "Gastos obrigatórios", list: active.filter((b) => b.mandatory) },
    { title: "Outras contas fixas", list: active.filter((b) => !b.mandatory) },
  ].filter((g) => g.list.length);

  const pay = (b: Bill) => {
    const due = billDueDate(b, ym);
    const date = ym === todayIso().slice(0, 7) ? todayIso() : due;
    const entry: Expense = { id: uid(), type: "despesa", description: b.name, amount: b.amount, date, category: b.category, method: "pix", institution: b.institution ?? "", installments: 1, notes: "Conta fixa", billId: b.id };
    update("expenses", (list) => [entry, ...list]);
    update("bills", (list) => list.map((x) => (x.id === b.id ? { ...x, paid: [...new Set([...x.paid, ym])] } : x)));
    toast({ title: `${b.name} paga`, message: `${brl(b.amount)} lançado em Gastos.`, tone: "success" });
  };
  const unpay = (b: Bill) => {
    update("bills", (list) => list.map((x) => (x.id === b.id ? { ...x, paid: x.paid.filter((m) => m !== ym) } : x)));
    update("expenses", (list) => {
      const i = list.findIndex((e) => (e.billId ? e.billId === b.id : e.description === b.name && e.notes === "Conta fixa") && e.date.startsWith(ym));
      return i < 0 ? list : list.filter((_, j) => j !== i);
    });
  };

  return (
    <Card className="mb-4">
      <SectionTitle
        title="Contas fixas"
        subtitle={
          active.length
            ? pending.length
              ? <><Private>{brl(pendingTotal)}</Private> a pagar em {ymLabel(ym)} · já entra no disponível</>
              : `Todas pagas em ${ymLabel(ym)}`
            : "Aluguel, transporte, internet… Marque os obrigatórios. O app avisa antes de vencer."
        }
        action={
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => setSheet({ open: true, item: null })}>
            <span className="sm:hidden">Adicionar</span>
            <span className="hidden sm:inline">Adicionar conta fixa</span>
          </Button>
        }
      />
      {mandatory > 0 && (
        <div className="mb-2 rounded-2xl bg-warning/[0.08] px-4 py-2.5 text-[13.5px]" data-testid="mandatory-total">
          Gastos obrigatórios do mês: <Private className="font-semibold tabular">{brl(mandatory)}</Private>
          <span className="text-muted"> · saem do salário antes de qualquer outra coisa</span>
        </div>
      )}
      {active.length > 0 ? (
        groups.map((g) => (
          <div key={g.title}>
            {groups.length > 1 && <div className="text-[12.5px] font-semibold text-muted pt-2">{g.title}</div>}
            <div className="divide-y divide-line/[0.06]">
              {g.list.map((b) => {
                const paid = b.paid.includes(ym);
                const due = billDueDate(b, ym);
                const days = daysUntil(due);
                const current = ym === todayIso().slice(0, 7);
                const status = paid ? (
                  <Badge tone="success">Paga</Badge>
                ) : !current ? (
                  <Badge tone="neutral">Dia {Number(due.slice(8))}</Badge>
                ) : days < 0 ? (
                  <Badge tone="danger">Atrasada</Badge>
                ) : days === 0 ? (
                  <Badge tone="warning">Vence hoje</Badge>
                ) : days <= 3 ? (
                  <Badge tone="warning">Vence em {days} {days === 1 ? "dia" : "dias"}</Badge>
                ) : (
                  <Badge tone="neutral">Dia {Number(due.slice(8))}</Badge>
                );
                return (
                  <div key={b.id} className="flex items-center gap-3 py-2.5">
                    <button type="button" onClick={() => setSheet({ open: true, item: b })} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <div className={clsx("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", paid ? "bg-success/15 text-success" : "bg-primary/12 text-primary")}>
                        {paid ? <Check size={18} /> : <Repeat size={18} />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-[14.5px] truncate">{b.name}</div>
                        <div className="text-[12.5px] text-muted flex items-center gap-2">
                          {status} {b.mandatory && <Badge tone="warning">Obrigatório</Badge>} <span className="truncate">{b.category}</span>
                        </div>
                      </div>
                    </button>
                    <div className="font-semibold tabular text-[15px] shrink-0" data-private="">
                      {brl(b.amount)}
                    </div>
                    {paid ? (
                      <Button size="sm" variant="ghost" onClick={() => unpay(b)} title="Desfazer pagamento">
                        Desfazer
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" icon={Check} onClick={() => pay(b)}>
                        Paguei
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <div className="flex items-center gap-3 text-[13.5px] text-muted">
          <CalendarClock size={18} className="text-primary shrink-0" />
          Cadastre uma vez e o app lembra 3 dias antes e no dia. O valor já sai do "disponível para gastar" até você marcar como paga.
        </div>
      )}
      <BillSheet open={sheet.open} initial={sheet.item} onClose={() => setSheet({ open: false, item: null })} />
    </Card>
  );
}
