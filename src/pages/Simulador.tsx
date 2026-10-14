import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Gamepad2, History, RotateCcw } from "lucide-react";
import clsx from "clsx";
import type { SimPosition, SimTrade } from "@shared/types";
import { catalogAsset, displaySymbol } from "@shared/catalog";
import { SIMULATOR_START_CASH } from "@shared/defaults";
import { uid } from "@/lib/api";
import { brl, dateBR, money, num, pct, timeBR, toneClass } from "@/lib/format";
import { fx } from "@/lib/portfolio";
import { refreshQuotes, useMarket, useQuotes } from "@/store/market";
import { useSession, useUserData } from "@/store/session";
import { useUi } from "@/store/ui";
import { AnimatedNumber, Badge, Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Field, NumberInput, SegmentedControl } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/Sheet";
import { AssetAvatar, AssetPicker, ChangePill } from "@/components/market";

export function Simulador() {
  const sim = useUserData("simulator");
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [symbol, setSymbol] = useState<string | undefined>(params.get("ativo") ?? undefined);
  const [side, setSide] = useState<"compra" | "venda">("compra");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const symbols = useMemo(() => [...sim.positions.map((p) => p.symbol), symbol, "USDBRL=X", "EURBRL=X"], [sim.positions, symbol]);
  const quotes = useQuotes(symbols);
  const q = symbol ? quotes[symbol] : undefined;
  const rate = q ? fx(q.currency, quotes) || 1 : 1;
  const position = sim.positions.find((p) => p.symbol === symbol);
  const total = q ? q.price * qty * rate : 0;

  useEffect(() => {
    if (symbol && catalogAsset(symbol)?.category === "cripto") setQty(0.01);
  }, [symbol]);

  const posValue = sim.positions.reduce((s, p) => {
    const pq = quotes[p.symbol];
    return s + p.quantity * (pq?.price ?? p.avgPrice) * (fx(p.currency, quotes) || 1);
  }, 0);
  const equity = sim.cash + posValue;
  const ret = equity - SIMULATOR_START_CASH;

  const execute = async () => {
    if (!symbol || !q || qty <= 0) return;
    setBusy(true);
    await refreshQuotes();
    const fresh = useMarket.getState().quotes[symbol] ?? q;
    const r = fx(fresh.currency, useMarket.getState().quotes) || 1;
    const price = fresh.price;
    const cost = price * qty * r;
    setBusy(false);
    if (side === "compra" && cost > sim.cash + 0.001) {
      toast({ title: "Saldo insuficiente", message: `Você tem ${brl(sim.cash)} disponíveis.`, tone: "error" });
      return;
    }
    if (side === "venda" && (!position || position.quantity < qty - 1e-9)) {
      toast({ title: "Quantidade indisponível", message: `Você tem ${num(position?.quantity ?? 0, 4).replace(/,?0+$/, "")} de ${displaySymbol(symbol)}.`, tone: "error" });
      return;
    }
    const trade: SimTrade = { id: uid(), side, symbol, quantity: qty, price, date: new Date().toISOString() };
    update("simulator", (s) => {
      let positions: SimPosition[] = s.positions;
      const existing = s.positions.find((p) => p.symbol === symbol);
      if (side === "compra") {
        positions = existing
          ? s.positions.map((p) => (p.symbol === symbol ? { ...p, quantity: p.quantity + qty, avgPrice: (p.avgPrice * p.quantity + price * qty) / (p.quantity + qty) } : p))
          : [...s.positions, { symbol, name: fresh.name, quantity: qty, avgPrice: price, currency: fresh.currency }];
      } else {
        positions = s.positions.map((p) => (p.symbol === symbol ? { ...p, quantity: p.quantity - qty } : p)).filter((p) => p.quantity > 1e-9);
      }
      return { ...s, cash: side === "compra" ? s.cash - cost : s.cash + cost, positions, history: [trade, ...s.history].slice(0, 200) };
    });
    toast({ title: side === "compra" ? "Compra executada" : "Venda executada", message: `${num(qty, qty % 1 ? 4 : 0)} × ${displaySymbol(symbol)} a ${money(price, fresh.currency)}`, tone: "success" });
  };

  return (
    <div>
      <PageHeader
        title="Simulador"
        subtitle="Treine com R$ 100 mil virtuais usando preços reais do mercado. Sem risco nenhum."
        actions={
          <Button variant="secondary" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
            Reiniciar
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card>
          <div className="text-footnote text-muted">Patrimônio virtual</div>
          <div className="text-[24px] font-bold tracking-[-0.02em] mt-1 tabular">
            <AnimatedNumber value={equity} format={brl} />
          </div>
        </Card>
        <Card>
          <div className="text-footnote text-muted">Saldo disponível</div>
          <div className="text-[24px] font-bold tracking-[-0.02em] mt-1 tabular">{brl(sim.cash)}</div>
        </Card>
        <Card>
          <div className="text-footnote text-muted">Investido</div>
          <div className="text-[24px] font-bold tracking-[-0.02em] mt-1 tabular">{brl(posValue)}</div>
        </Card>
        <Card>
          <div className="text-footnote text-muted">Resultado</div>
          <div className={clsx("text-[24px] font-bold tracking-[-0.02em] mt-1 tabular", toneClass(ret))}>{pct((ret / SIMULATOR_START_CASH) * 100)}</div>
          <div className={clsx("text-footnote tabular", toneClass(ret))}>
            {ret >= 0 ? "+" : ""}
            {brl(ret)}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2 h-fit">
          <SectionTitle title="Nova ordem" subtitle="Executada pelo preço real do momento" />
          <div className="space-y-4">
            <SegmentedControl
              block
              value={side}
              onChange={setSide}
              options={[
                { value: "compra", label: "Comprar" },
                { value: "venda", label: "Vender" },
              ]}
            />
            <Field label="Ativo">
              <AssetPicker value={symbol} onSelect={(r) => setSymbol(r.symbol)} />
            </Field>
            {symbol && (
              <div className="rounded-control bg-separator/[0.04] border border-separator/10 px-4 py-3 flex items-center gap-3">
                <AssetAvatar symbol={symbol} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-headline">{displaySymbol(symbol)}</div>
                  <div className="text-footnote text-muted truncate">{q?.name ?? "Carregando…"}</div>
                </div>
                <div className="text-right">
                  <div className="text-headline tabular">{q ? money(q.price, q.currency) : "—"}</div>
                  <div className={clsx("text-footnote tabular", toneClass(q?.changePercent))}>{q ? pct(q.changePercent) : ""}</div>
                </div>
              </div>
            )}
            <Field label="Quantidade" hint={position ? `Você tem ${num(position.quantity, position.quantity % 1 ? 4 : 0)} na carteira simulada.` : undefined}>
              <NumberInput value={qty} onChange={setQty} min={0} decimals={catalogAsset(symbol ?? "")?.category === "cripto" ? 6 : 0} />
            </Field>
            <div className="flex items-center justify-between text-callout">
              <span className="text-muted">Total estimado</span>
              <span className="text-title tabular">{brl(total)}</span>
            </div>
            {q && q.currency !== "BRL" && <div className="text-footnote text-muted -mt-2">Convertido pelo câmbio atual ({q.currency}/BRL {num(rate, 4)}).</div>}
            <Button block size="lg" variant={side === "compra" ? "primary" : "danger"} disabled={!symbol || !q || qty <= 0} loading={busy} onClick={() => void execute()}>
              {side === "compra" ? "Comprar" : "Vender"} {symbol ? displaySymbol(symbol) : ""}
            </Button>
          </div>
        </Card>

        <div className="lg:col-span-3 space-y-4">
          <Card padded={false} className="overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <SectionTitle title="Carteira simulada" subtitle={`Desde ${dateBR(sim.startedAt)}`} />
            </div>
            {sim.positions.length === 0 ? (
              <EmptyState icon={Gamepad2} title="Nenhuma posição" description="Escolha um ativo e faça sua primeira compra virtual." />
            ) : (
              <div className="divide-y divide-separator/[0.07]">
                {sim.positions.map((p) => {
                  const pq = quotes[p.symbol];
                  const r = fx(p.currency, quotes) || 1;
                  const value = p.quantity * (pq?.price ?? p.avgPrice) * r;
                  const g = ((pq?.price ?? p.avgPrice) - p.avgPrice) / p.avgPrice;
                  return (
                    <button key={p.symbol} onClick={() => setSymbol(p.symbol)} className="pressable w-full flex items-center gap-3 px-5 py-3 hover:bg-separator/[0.03] text-left">
                      <AssetAvatar symbol={p.symbol} size={38} />
                      <div className="flex-1 min-w-0">
                        <div className="text-headline">{displaySymbol(p.symbol)}</div>
                        <div className="text-footnote text-muted">
                          {num(p.quantity, p.quantity % 1 ? 4 : 0)} × {money(p.avgPrice, p.currency)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-headline tabular">{brl(value)}</div>
                        <div className={clsx("text-footnote tabular", toneClass(g))}>{pct(g * 100)}</div>
                      </div>
                      <ChangePill value={pq?.changePercent} size="sm" />
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card padded={false} className="overflow-hidden">
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <SectionTitle title="Histórico de ordens" />
              <History size={18} className="text-muted" />
            </div>
            {sim.history.length === 0 ? (
              <div className="px-5 pb-5 text-callout text-muted">Suas ordens aparecem aqui.</div>
            ) : (
              <div className="divide-y divide-separator/[0.07] max-h-[360px] overflow-y-auto">
                {sim.history.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                    <Badge tone={t.side === "compra" ? "success" : "danger"}>{t.side === "compra" ? "Compra" : "Venda"}</Badge>
                    <button className="pressable text-headline hover:text-primary transition-[color,transform] duration-150" onClick={() => navigate(`/mercado/${encodeURIComponent(t.symbol)}`)}>
                      {displaySymbol(t.symbol)}
                    </button>
                    <span className="text-footnote text-muted tabular">
                      {num(t.quantity, t.quantity % 1 ? 4 : 0)} × {num(t.price)}
                    </span>
                    <span className="flex-1" />
                    <span className="text-footnote text-muted tabular">
                      {dateBR(t.date, { day: "2-digit", month: "short" })} {timeBR(t.date)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          update("simulator", { cash: SIMULATOR_START_CASH, startedAt: new Date().toISOString(), positions: [], history: [] });
          setConfirmReset(false);
          toast({ title: "Simulador reiniciado", message: "Você tem R$ 100.000 virtuais de novo.", tone: "success" });
        }}
        title="Reiniciar o simulador?"
        message="Todas as posições e o histórico serão apagados e o saldo volta para R$ 100.000."
        confirmLabel="Reiniciar"
        danger
      />
    </div>
  );
}
