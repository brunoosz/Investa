import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Pencil, Plus, Trash, Wallet } from "lucide-react";
import clsx from "clsx";
import type { FixedType, Holding } from "@shared/types";
import { catalogAsset, displaySymbol, guessCategory } from "@shared/catalog";
import { institutionLabel } from "@shared/banks";
import { uid } from "@/lib/api";
import { brl, dateBR, money, num, pct, toneClass } from "@/lib/format";
import { CATEGORY_COLORS, summarize, type HoldingView } from "@/lib/portfolio";
import { useQuotes } from "@/store/market";
import { useSession, useUserData } from "@/store/session";
import { useUi } from "@/store/ui";
import { useIndicators } from "@/hooks/useMarketData";
import { AnimatedNumber, Badge, Card, EmptyState, PageHeader, Private, SectionTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Field, Input, MoneyInput, NumberInput, SegmentedControl, Select } from "@/components/ui/form";
import { ConfirmDialog, Sheet } from "@/components/ui/Sheet";
import { BarList, Donut, Legend } from "@/components/charts/small";
import { AccountsCard } from "@/components/Accounts";
import { currentYm, summarizeMonth, localIsoDate } from "@shared/finance";
import { AssetAvatar, AssetPicker, categoryLabel, InstitutionSelect } from "@/components/market";

const FIXED_TYPES: { value: FixedType; label: string; rateType: Holding["rateType"]; rate: number }[] = [
  { value: "cdb", label: "CDB", rateType: "cdi", rate: 100 },
  { value: "lci", label: "LCI", rateType: "cdi", rate: 90 },
  { value: "lca", label: "LCA", rateType: "cdi", rate: 92 },
  { value: "tesouro-selic", label: "Tesouro Selic", rateType: "selic", rate: 0.07 },
  { value: "tesouro-ipca", label: "Tesouro IPCA+", rateType: "ipca", rate: 7 },
  { value: "tesouro-pre", label: "Tesouro Prefixado", rateType: "pre", rate: 13 },
  { value: "poupanca", label: "Poupança", rateType: "pre", rate: 6.17 },
  { value: "debenture", label: "Debênture", rateType: "ipca", rate: 7 },
  { value: "outro", label: "Outro", rateType: "cdi", rate: 100 },
];

function rateLabel(h: Holding): string {
  if (h.fixedType === "poupanca") return "Poupança";
  if (h.rateType === "cdi") return `${num(h.rate ?? 0, 0)}% do CDI`;
  if (h.rateType === "selic") return `Selic + ${num(h.rate ?? 0)}%`;
  if (h.rateType === "ipca") return `IPCA + ${num(h.rate ?? 0)}%`;
  return `${num(h.rate ?? 0)}% a.a.`;
}

function today(): string {
  return localIsoDate();
}

function emptyHolding(kind: Holding["kind"]): Holding {
  return kind === "variavel"
    ? { id: uid(), kind, name: "", category: "acoes", institution: "", purchaseDate: today(), quantity: 0, avgPrice: 0 }
    : { id: uid(), kind, name: "CDB", category: "rendafixa", institution: "", purchaseDate: today(), fixedType: "cdb", rateType: "cdi", rate: 100, amount: 0 };
}

function HoldingSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: Holding | null }) {
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const [h, setH] = useState<Holding>(initial ?? emptyHolding("variavel"));
  const quotes = useQuotes(h.symbol ? [h.symbol, "USDBRL=X"] : []);
  const q = h.symbol ? quotes[h.symbol] : undefined;

  useEffect(() => {
    if (open) setH(initial ?? emptyHolding("variavel"));
  }, [open, initial]);

  useEffect(() => {
    if (q && h.kind === "variavel" && !h.avgPrice && !initial) setH((x) => ({ ...x, avgPrice: Math.round(q.price * 100) / 100 }));
  }, [q, h.kind, h.avgPrice, initial]);

  const valid = h.kind === "variavel" ? !!h.symbol && (h.quantity ?? 0) > 0 && (h.avgPrice ?? 0) > 0 : (h.amount ?? 0) > 0 && !!h.name.trim();

  const save = () => {
    const item: Holding = { ...h, name: h.kind === "variavel" ? q?.name ?? catalogAsset(h.symbol!)?.name ?? displaySymbol(h.symbol!) : h.name.trim() };
    update("portfolio", (list) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]));
    toast({ title: initial ? "Investimento atualizado" : "Investimento adicionado", tone: "success" });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? "Editar investimento" : "Adicionar investimento"}
      subtitle="Os valores são atualizados com cotações e taxas reais."
      footer={
        <>
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
          <SegmentedControl<Holding["kind"]>
            block
            value={h.kind}
            onChange={(k) => setH(emptyHolding(k))}
            options={[
              { value: "variavel", label: "Ações, FIIs, ETFs, cripto…" },
              { value: "fixa", label: "Renda fixa" },
            ]}
          />
        )}

        {h.kind === "variavel" ? (
          <>
            <Field label="Ativo">
              <AssetPicker
                value={h.symbol}
                autoFocus={!h.symbol}
                onSelect={(r) => setH({ ...h, symbol: r.symbol, category: r.category ?? guessCategory(r.symbol), avgPrice: 0 })}
              />
            </Field>
            {q && (
              <div className="text-footnote text-muted -mt-2">
                Cotação agora: <strong className="text-fg">{money(q.price, q.currency)}</strong> <span className={toneClass(q.changePercent)}>({pct(q.changePercent)})</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantidade">
                <NumberInput value={h.quantity ?? 0} onChange={(v) => setH({ ...h, quantity: v })} decimals={h.category === "cripto" ? 6 : 0} min={0} />
              </Field>
              <Field label={`Preço médio${q && q.currency !== "BRL" ? ` (${q.currency})` : ""}`}>
                <MoneyInput value={h.avgPrice ?? 0} onChange={(v) => setH({ ...h, avgPrice: v })} prefix={q && q.currency !== "BRL" ? q.currency : "R$"} />
              </Field>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo">
                <Select
                  value={h.fixedType}
                  onChange={(e) => {
                    const t = FIXED_TYPES.find((f) => f.value === e.target.value)!;
                    setH({ ...h, fixedType: t.value, rateType: t.rateType, rate: t.rate, name: t.label, category: t.value.startsWith("tesouro") ? "tesouro" : "rendafixa" });
                  }}
                >
                  {FIXED_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Nome do produto">
                <Input value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} placeholder="Ex.: CDB Inter 2028" />
              </Field>
            </div>
            <Field label="Valor aplicado">
              <MoneyInput value={h.amount ?? 0} onChange={(v) => setH({ ...h, amount: v })} />
            </Field>
            {h.fixedType !== "poupanca" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Indexador">
                  <Select value={h.rateType} onChange={(e) => setH({ ...h, rateType: e.target.value as Holding["rateType"] })}>
                    <option value="cdi">% do CDI</option>
                    <option value="selic">Selic +</option>
                    <option value="ipca">IPCA +</option>
                    <option value="pre">Prefixado</option>
                  </Select>
                </Field>
                <Field label="Taxa">
                  <NumberInput value={h.rate ?? 0} onChange={(v) => setH({ ...h, rate: v })} suffix={h.rateType === "cdi" ? "% CDI" : "% a.a."} min={0} />
                </Field>
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={h.kind === "variavel" ? "Corretora / banco" : "Banco / instituição"}>
            <InstitutionSelect value={h.institution} onChange={(v) => setH({ ...h, institution: v })} includeTesouro />
          </Field>
          <Field label="Data da compra">
            <Input type="date" value={h.purchaseDate} max={today()} onChange={(e) => setH({ ...h, purchaseDate: e.target.value })} />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

function VariableRow({ v, onEdit, onDelete }: { v: HoldingView; onEdit: () => void; onDelete: () => void }) {
  const h = v.holding;
  const navigate = useNavigate();
  return (
    <div className="group grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] items-center gap-3 px-5 py-3.5 hover:bg-line/[0.04] transition-colors duration-150">
      <button className="pressable flex items-center gap-3 min-w-0 text-left" onClick={() => navigate(`/mercado/${encodeURIComponent(h.symbol!)}`)}>
        <AssetAvatar symbol={h.symbol!} category={h.category} size={38} />
        <div className="min-w-0">
          <div className="font-semibold">{displaySymbol(h.symbol!)}</div>
          <div className="text-footnote text-muted truncate">
            <Private>
              {num(h.quantity, h.category === "cripto" ? 4 : 0)} × {money(h.avgPrice, v.currency)}
            </Private>{" "}
            · {institutionLabel(h.institution) || "—"}
          </div>
        </div>
      </button>
      <div className="hidden md:block text-right">
        <div className="text-footnote text-muted">Preço atual</div>
        <div className="tabular font-medium">{v.price !== undefined ? money(v.price, v.currency) : "—"}</div>
      </div>
      <div className="hidden md:block text-right">
        <div className="text-footnote text-muted">Hoje</div>
        <div className={clsx("tabular font-medium", toneClass(v.dayChangePct))}>{pct(v.dayChangePct)}</div>
      </div>
      <div className="hidden md:block text-right">
        <div className="text-footnote text-muted">Rentabilidade</div>
        <div className={clsx("tabular font-medium", toneClass(v.gain))} data-private="">
          {pct(v.gainPct)}
        </div>
      </div>
      <div className="text-right" data-private="">
        <div className="tabular font-semibold">{brl(v.value)}</div>
        <div className={clsx("text-footnote tabular md:hidden", toneClass(v.gain))}>{pct(v.gainPct)}</div>
        <div className={clsx("text-footnote tabular hidden md:block", toneClass(v.gain))}>
          {v.gain >= 0 ? "+" : ""}
          {brl(v.gain)}
        </div>
      </div>
      <div className="flex gap-1 shrink-0 md:opacity-0 md:group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition">
        <Button size="icon-sm" variant="ghost" icon={Pencil} onClick={onEdit} aria-label="Editar" />
        <Button size="icon-sm" variant="ghost" icon={Trash} onClick={onDelete} aria-label="Excluir" />
      </div>
    </div>
  );
}

function FixedRow({ v, onEdit, onDelete }: { v: HoldingView; onEdit: () => void; onDelete: () => void }) {
  const h = v.holding;
  return (
    <div className="group grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-3 px-5 py-3.5 hover:bg-line/[0.04] transition-colors duration-150">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-[38px] w-[38px] rounded-chip flex items-center justify-center shrink-0 text-caption font-bold" style={{ background: `${CATEGORY_COLORS[h.category]}1f`, color: CATEGORY_COLORS[h.category] }}>
          {h.category === "tesouro" ? "TD" : (h.fixedType ?? "RF").slice(0, 3).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-semibold truncate">{h.name}</div>
          <div className="text-footnote text-muted truncate">
            {rateLabel(h)} · {institutionLabel(h.institution) || "—"} · desde {dateBR(h.purchaseDate)}
          </div>
        </div>
      </div>
      <div className="hidden md:block text-right">
        <div className="text-footnote text-muted">Aplicado</div>
        <Private block className="tabular font-medium">
          {brl(v.invested)}
        </Private>
      </div>
      <div className="hidden md:block text-right">
        <div className="text-footnote text-muted">Taxa hoje</div>
        <div className="tabular font-medium">{v.annualRate !== undefined ? `${num(v.annualRate)}% a.a.` : "—"}</div>
      </div>
      <div className="text-right" data-private="">
        <div className="tabular font-semibold">{brl(v.value)}</div>
        <div className={clsx("text-footnote tabular", toneClass(v.gain))}>
          +{brl(v.gain)} · líquido {brl(v.netValue)}
        </div>
      </div>
      <div className="flex gap-1 shrink-0 md:opacity-0 md:group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition">
        <Button size="icon-sm" variant="ghost" icon={Pencil} onClick={onEdit} aria-label="Editar" />
        <Button size="icon-sm" variant="ghost" icon={Trash} onClick={onDelete} aria-label="Excluir" />
      </div>
    </div>
  );
}

export function Carteira() {
  const portfolio = useUserData("portfolio");
  const expenses = useUserData("expenses");
  const profile = useUserData("profile");
  const ym = currentYm();
  const month = useMemo(() => summarizeMonth(expenses, ym, profile.salary, profile.extraIncome), [expenses, ym, profile.salary, profile.extraIncome]);
  const update = useSession((s) => s.update);
  const { data: ind } = useIndicators();
  const symbols = useMemo(() => [...portfolio.filter((h) => h.symbol).map((h) => h.symbol!), "USDBRL=X", "EURBRL=X"], [portfolio]);
  const quotes = useQuotes(symbols);
  const summary = useMemo(() => summarize(portfolio, quotes, ind), [portfolio, quotes, ind]);
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState<{ open: boolean; item: Holding | null }>({ open: params.get("novo") === "1", item: null });
  const [toDelete, setToDelete] = useState<Holding | null>(null);

  useEffect(() => {
    if (params.get("novo")) setParams({}, { replace: true });
  }, [params, setParams]);

  const variable = summary.views.filter((v) => v.holding.kind === "variavel").sort((a, b) => b.value - a.value);
  const fixed = summary.views.filter((v) => v.holding.kind === "fixa").sort((a, b) => b.value - a.value);
  const donut = summary.byCategory.map((c) => ({ label: c.label, value: c.value, color: CATEGORY_COLORS[c.category] }));

  return (
    <div>
      <PageHeader
        title="Carteira"
        subtitle="Seus investimentos de verdade, atualizados com cotações e taxas reais."
        actions={
          <Button icon={Plus} onClick={() => setSheet({ open: true, item: null })}>
            Adicionar investimento
          </Button>
        }
      />

      {/* Saldo nos bancos: dá para guardar mesmo antes de ter investimentos. */}
      <AccountsCard ym={ym} summary={month} />

      {portfolio.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wallet}
            title="Nenhum investimento cadastrado"
            description="Adicione ações, FIIs, ETFs, criptomoedas, CDBs, Tesouro Direto e outros. O Investa calcula sua rentabilidade e avisa quando algo importante acontecer."
            action={
              <Button icon={Plus} onClick={() => setSheet({ open: true, item: null })}>
                Adicionar o primeiro
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Card>
              <div className="text-footnote text-muted">Patrimônio</div>
              <div className="text-[24px] tracking-[-0.02em] font-bold mt-1 tabular">
                <AnimatedNumber value={summary.value} format={brl} private />
              </div>
            </Card>
            <Card>
              <div className="text-footnote text-muted">Total investido</div>
              <div className="text-[24px] tracking-[-0.02em] font-bold mt-1 tabular" data-private="">
                {brl(summary.invested)}
              </div>
            </Card>
            <Card>
              <div className="text-footnote text-muted">Rentabilidade</div>
              <div className={clsx("text-[24px] tracking-[-0.02em] font-bold mt-1 tabular", toneClass(summary.gain))} data-private="">
                {pct(summary.gainPct)}
              </div>
              <div className={clsx("text-footnote tabular", toneClass(summary.gain))} data-private="">
                {summary.gain >= 0 ? "+" : ""}
                {brl(summary.gain)}
              </div>
            </Card>
            <Card>
              <div className="text-footnote text-muted">Variação hoje</div>
              <div className={clsx("text-[24px] tracking-[-0.02em] font-bold mt-1 tabular", toneClass(summary.dayChange))} data-private="">
                {pct(summary.dayChangePct)}
              </div>
              <div className={clsx("text-footnote tabular", toneClass(summary.dayChange))} data-private="">
                {summary.dayChange >= 0 ? "+" : ""}
                {brl(summary.dayChange)}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3 mb-4">
            <Card className="lg:col-span-2">
              <SectionTitle title="Por classe de ativo" />
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <Donut data={donut} size={180} center={<div className="text-footnote text-muted">{portfolio.length} ativos</div>} />
                <div className="flex-1 w-full">
                  <Legend data={donut} format={(v) => brl(v)} private />
                </div>
              </div>
            </Card>
            <Card>
              <SectionTitle title="Por banco / corretora" />
              <BarList
                data={summary.byInstitution.map((b) => ({ key: b.institution, label: institutionLabel(b.institution) || "Não informado", value: b.value }))}
                format={(v) => brl(v).replace(/,\d+$/, "")}
                private
              />
            </Card>
          </div>

          {variable.length > 0 && (
            <Card padded={false} className="mb-4 overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <SectionTitle title="Renda variável" subtitle="Cotações reais (B3 com atraso de até 15 min)" />
                <Badge tone="primary">
                  <Private>{brl(variable.reduce((s, v) => s + v.value, 0))}</Private>
                </Badge>
              </div>
              <div className="divide-y divide-separator/10">
                {variable.map((v) => (
                  <VariableRow key={v.holding.id} v={v} onEdit={() => setSheet({ open: true, item: v.holding })} onDelete={() => setToDelete(v.holding)} />
                ))}
              </div>
            </Card>
          )}

          {fixed.length > 0 && (
            <Card padded={false} className="overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <SectionTitle title="Renda fixa" subtitle={`Rendimento estimado com CDI ${ind?.cdi ? num(ind.cdi.value) + "%" : "—"} e IPCA ${ind?.ipca12m ? num(ind.ipca12m.value) + "%" : "—"} (Banco Central)`} />
                <Badge tone="warning">
                  <Private>{brl(fixed.reduce((s, v) => s + v.value, 0))}</Private>
                </Badge>
              </div>
              <div className="divide-y divide-separator/10">
                {fixed.map((v) => (
                  <FixedRow key={v.holding.id} v={v} onEdit={() => setSheet({ open: true, item: v.holding })} onDelete={() => setToDelete(v.holding)} />
                ))}
              </div>
            </Card>
          )}
          <p className="text-footnote text-muted mt-4">
            Ativos em dólar são convertidos pela cotação atual. Valores líquidos de renda fixa consideram a tabela regressiva de IR. {categoryLabel("acoes")} e FIIs: o IR só é devido na venda com lucro.
          </p>
        </>
      )}

      <HoldingSheet open={sheet.open} initial={sheet.item} onClose={() => setSheet({ open: false, item: null })} />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) update("portfolio", (l) => l.filter((x) => x.id !== toDelete.id));
          setToDelete(null);
        }}
        title="Remover investimento?"
        message={toDelete ? `${toDelete.symbol ? displaySymbol(toDelete.symbol) : toDelete.name} será removido da sua carteira.` : ""}
        confirmLabel="Remover"
        danger
      />
    </div>
  );
}
