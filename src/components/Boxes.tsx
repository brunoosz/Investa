import { useState } from "react";
import { Minus, PiggyBank, Plus, Trash } from "lucide-react";
import type { SavingBox } from "@shared/types";
import { localIsoDate } from "@shared/finance";
import { uid } from "@/lib/api";
import { brl, dateBR } from "@/lib/format";
import { useSession, useUserData } from "@/store/session";
import { useUi } from "@/store/ui";
import { Badge, Card, Private, ProgressBar, SectionTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Field, Input, MoneyInput, Toggle } from "@/components/ui/form";
import { Sheet } from "@/components/ui/Sheet";

const round2 = (v: number) => Math.round(v * 100) / 100;

function BoxSheet({ open, initial, onClose }: { open: boolean; initial: SavingBox | null; onClose: () => void }) {
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const empty = (): SavingBox => ({ id: uid(), name: "", target: 0, monthly: 50, day: 5, balance: 0, history: [], active: true, createdAt: new Date().toISOString() });
  const [box, setBox] = useState<SavingBox>(initial ?? empty());
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setBox(initial ? { ...initial } : empty());
  }
  const valid = box.name.trim().length > 1 && box.monthly > 0 && box.day >= 1 && box.day <= 28;
  const save = () => {
    const item = { ...box, name: box.name.trim() };
    update("boxes", (list) => (list.some((b) => b.id === item.id) ? list.map((b) => (b.id === item.id ? item : b)) : [...list, item]));
    toast({ title: initial ? "Caixinha atualizada" : "Caixinha criada", message: `${brl(item.monthly)} todo dia ${item.day}.`, tone: "success" });
    onClose();
  };
  const remove = () => {
    update("boxes", (list) => list.filter((b) => b.id !== box.id));
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? "Editar caixinha" : "Nova caixinha"}
      subtitle="Um valor guardado automaticamente todo mês, até chegar na meta."
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
        <Field label="Nome">
          <Input value={box.name} onChange={(e) => setBox({ ...box, name: e.target.value })} placeholder="Ex.: Viagem, Videogame novo, Reserva" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Guardar por mês">
            <MoneyInput value={box.monthly} onChange={(v) => setBox({ ...box, monthly: v })} />
          </Field>
          <Field label="Todo dia" hint="De 1 a 28.">
            <Input inputMode="numeric" value={box.day || ""} onChange={(e) => setBox({ ...box, day: Math.min(28, Number(e.target.value.replace(/\D/g, "")) || 0) })} />
          </Field>
        </div>
        <Field label="Meta (opcional)" hint={box.target && box.monthly ? `Chega lá em cerca de ${Math.ceil(Math.max(0, box.target - box.balance) / box.monthly)} meses.` : "Deixe em branco para guardar sem limite."}>
          <MoneyInput value={box.target} onChange={(v) => setBox({ ...box, target: v })} />
        </Field>
        {!initial && (
          <Field label="Já tem algum valor guardado para isso?">
            <MoneyInput value={box.balance} onChange={(v) => setBox({ ...box, balance: v })} />
          </Field>
        )}
        <div className="flex items-center justify-between rounded-control bg-line/[0.04] px-4 py-3">
          <div>
            <div className="font-medium text-callout">Ativa</div>
            <div className="text-footnote text-muted">Pausada, ela não guarda o valor do mês.</div>
          </div>
          <Toggle checked={box.active} onChange={(v) => setBox({ ...box, active: v })} label="Ativa" />
        </div>
      </div>
    </Sheet>
  );
}

/** Caixinhas: guardam um valor todo mês, automaticamente, até a meta. */
export function BoxesCard() {
  const boxes = useUserData("boxes");
  const update = useSession((s) => s.update);
  const [sheet, setSheet] = useState<{ open: boolean; item: SavingBox | null }>({ open: false, item: null });
  const total = boxes.reduce((s, b) => s + b.balance, 0);
  const move = (b: SavingBox, amount: number) =>
    update("boxes", (list) =>
      list.map((x) =>
        x.id === b.id
          ? { ...x, balance: round2(Math.max(0, x.balance + amount)), history: [...x.history, { date: localIsoDate(), amount, note: amount > 0 ? "Depósito extra" : "Retirada" }].slice(-120) }
          : x
      )
    );
  return (
    <Card className="mb-4">
      <SectionTitle
        title="Caixinhas"
        subtitle={
          boxes.length ? (
            <>
              <Private>{brl(total)}</Private> guardados · o valor do mês já sai do disponível para gastar
            </>
          ) : (
            "Guarde um pouco todo mês, sem pensar: o app separa no dia certo."
          )
        }
        action={
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => setSheet({ open: true, item: null })}>
            <span className="sm:hidden">Nova</span>
            <span className="hidden sm:inline">Nova caixinha</span>
          </Button>
        }
      />
      {boxes.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {boxes.map((b) => {
            const pct = b.target ? Math.min(1, b.balance / b.target) : 0;
            const last = b.history[b.history.length - 1];
            return (
              <div key={b.id} className="rounded-control bg-line/[0.04] p-4">
                <button type="button" className="pressable w-full text-left" onClick={() => setSheet({ open: true, item: b })}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-headline truncate">{b.name}</div>
                    {!b.active ? <Badge>Pausada</Badge> : b.target && b.balance >= b.target ? <Badge tone="success">Meta batida</Badge> : <Badge tone="primary"><Private>+{brl(b.monthly)}</Private> dia {b.day}</Badge>}
                  </div>
                  <div className="text-[22px] tracking-[-0.02em] font-bold tabular mt-1" data-private="">
                    {brl(b.balance)}
                  </div>
                  {b.target > 0 && (
                    <>
                      <ProgressBar value={pct} height={6} className="mt-1" />
                      <div className="text-footnote text-muted mt-1">
                        {Math.round(pct * 100)}% de <Private>{brl(b.target)}</Private>
                      </div>
                    </>
                  )}
                  {last && <div className="text-footnote text-muted mt-1">Último movimento: <Private>{last.amount > 0 ? "+" : "−"}{brl(Math.abs(last.amount))}</Private> em {dateBR(last.date, { day: "2-digit", month: "short" })}</div>}
                </button>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="secondary" icon={Plus} onClick={() => move(b, b.monthly)}>
                    <Private>{brl(b.monthly)}</Private>
                  </Button>
                  <Button size="sm" variant="ghost" icon={Minus} disabled={b.balance <= 0} onClick={() => move(b, -Math.min(b.balance, b.monthly))}>
                    Retirar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-3 text-footnote text-muted">
          <PiggyBank size={18} className="text-success shrink-0" />
          Ex.: "Viagem", R$ 100 todo dia 5. No dia, o app guarda o valor, avisa você e mostra quanto falta para a meta.
        </div>
      )}
      <BoxSheet open={sheet.open} initial={sheet.item} onClose={() => setSheet({ open: false, item: null })} />
    </Card>
  );
}
