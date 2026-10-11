import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BadgePercent, ExternalLink, Gamepad2, Link2, ShoppingBag, Sparkles, TrendingDown, TriangleAlert, Wallet } from "lucide-react";
import clsx from "clsx";
import type { DealCheck } from "@shared/types";
import { api } from "@/lib/api";
import { brl } from "@/lib/format";
import { toastError } from "@/store/ui";
import { useAssistant } from "@/store/assistant";
import { useAsync } from "@/hooks/useAsync";
import { Badge, Card, PageHeader, Private } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Field, Input, MoneyInput, Select } from "@/components/ui/form";

const EXAMPLES = [
  "https://store.steampowered.com/app/1091500/",
  "jogo Elden Ring",
  "https://www.mercadolivre.com.br/…",
  "iPhone 15 128GB",
];

// Saldo, renda e o que sobra no mês ficam borrados no modo privacidade; o preço da loja não.
const mine = (v: number) => <Private>{brl(v)}</Private>;

/** Leitura rápida sem IA: o preço está bom e cabe no mês? */
function quickVerdict(d: DealCheck, installments: number): { tone: "success" | "warning" | "danger"; title: string; lines: ReactNode[] } {
  const lines: ReactNode[] = [];
  // O orçamento é em reais: usa o preço convertido quando a loja cobra em outra moeda.
  const price = d.currentPriceBrl ?? (d.currency === "BRL" ? d.currentPrice : undefined);
  const perMonth = price ? price / Math.max(1, installments) : undefined;
  const free = d.budget.available ?? d.budget.monthBalance - d.budget.invoicesOpen;
  let tone: "success" | "warning" | "danger" = "success";

  if (perMonth !== undefined) {
    if (perMonth > free) {
      tone = "danger";
      lines.push(
        <>
          {installments > 1 ? `A parcela de ${brl(perMonth)}` : `O valor de ${brl(perMonth)}`} passa do que sobra no seu mês ({mine(Math.max(0, free))}, já descontando faturas em aberto).
        </>
      );
    } else if (perMonth > free * 0.5) {
      tone = "warning";
      lines.push(
        <>
          {installments > 1 ? "A parcela" : "A compra"} usa mais da metade do que sobra no mês ({mine(free)}).
        </>
      );
    } else {
      lines.push(<>Cabe no orçamento: sobram {mine(free - perMonth)} no mês depois da compra.</>);
    }
  } else if (d.currentPrice) {
    lines.push(`O preço está em ${d.currency}. Informe quanto fica em reais para eu calcular se cabe no seu mês.`);
  } else {
    lines.push("Informe o preço para eu calcular se cabe no seu mês.");
  }
  if (price !== undefined && d.budget.accountsBalance !== undefined) {
    const afterInvoices = d.budget.accountsBalance - d.budget.invoicesOpen;
    if (installments <= 1 && price > afterInvoices) {
      tone = "danger";
      lines.push(
        <>
          Hoje você tem {mine(d.budget.accountsBalance)} nas contas; pagando as faturas, sobram {mine(afterInvoices)}. Não dá para pagar à vista sem faltar dinheiro.
        </>
      );
    }
  }

  if (d.lowestPrice?.priceBrl && price && d.currency === "BRL") {
    const diff = price / d.lowestPrice.priceBrl - 1;
    if (diff > 0.25) {
      if (tone === "success") tone = "warning";
      lines.push(`Já esteve bem mais barato: o menor preço registrado equivale a ${brl(d.lowestPrice.priceBrl)}.`);
    } else {
      lines.push("O preço está perto do menor já registrado.");
    }
  } else if (d.discountPercent) {
    lines.push(`Está com ${d.discountPercent}% de desconto na ${d.source ?? "loja"} agora.`);
  }

  const title = tone === "danger" ? "Agora não cabe no bolso" : tone === "warning" ? "Pense antes de comprar" : "Pode valer a pena";
  return { tone, title, lines };
}

export function ValeAPena() {
  const navigate = useNavigate();
  const ask = useAssistant((s) => s.ask);
  const ai = useAsync("ai-info", () => api.ai.info(), { staleMs: 30_000 });
  const [query, setQuery] = useState("");
  const [price, setPrice] = useState(0);
  const [installments, setInstallments] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DealCheck | null>(null);

  const check = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      setResult(await api.deals.check(query.trim(), price || undefined));
    } catch (err) {
      toastError(err, "Não foi possível consultar");
    } finally {
      setLoading(false);
    }
  };

  const askAssistant = async () => {
    if (!result) return;
    const attachment = await api.deals.context(result, installments);
    ask({ mode: "compras", question: `Vale a pena comprar ${result.title ?? result.query} agora${installments > 1 ? ` em ${installments}x` : ""}?`, attachment });
    navigate("/assistente");
  };

  const verdict = result ? quickVerdict({ ...result, currentPrice: result.currentPrice ?? (price || undefined) }, installments) : null;
  const VerdictIcon = verdict?.tone === "danger" ? TriangleAlert : verdict?.tone === "warning" ? TrendingDown : BadgePercent;

  return (
    <div>
      <PageHeader title="Vale a pena?" subtitle="Cole o link ou escreva o nome de um produto ou jogo. O app busca o preço, o histórico quando existe, e diz se cabe no seu bolso agora." />

      <Card>
        <form
          className="grid gap-4 md:grid-cols-[1fr_180px_140px_auto] md:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void check();
          }}
        >
          <Field label="Link ou nome">
            <Input icon={Link2} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Link da Steam, Mercado Livre, Amazon, Shopee… ou o nome" autoFocus />
          </Field>
          <Field label="Preço (opcional)">
            <MoneyInput value={price} onChange={setPrice} />
          </Field>
          <Field label="Pagamento">
            <Select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
              <option value={1}>À vista</option>
              {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n}x
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" loading={loading} disabled={!query.trim()} icon={BadgePercent}>
            Verificar
          </Button>
        </form>
        {!result && (
          <div className="mt-4 flex flex-wrap gap-2 text-[12.5px] text-muted">
            Exemplos:
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="rounded-full bg-line/[0.06] px-2.5 py-0.5 hover:text-fg" onClick={() => !ex.includes("…") && setQuery(ex)}>
                {ex}
              </button>
            ))}
          </div>
        )}
      </Card>

      {result && verdict && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4 lg:grid-cols-3 mt-4">
          <Card className="lg:col-span-2">
            <div className="flex gap-4">
              {result.image ? (
                <img src={result.image} alt="" className="h-20 w-20 sm:h-24 sm:w-40 rounded-xl object-cover bg-line/10 shrink-0" />
              ) : (
                <div className="h-20 w-20 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  {result.kind === "jogo" ? <Gamepad2 size={30} /> : <ShoppingBag size={30} />}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge>{result.kind === "jogo" ? "Jogo" : "Produto"}</Badge>
                  {result.source && <span className="text-[12.5px] text-muted">{result.source}</span>}
                </div>
                <div className="font-semibold text-[17px] mt-1 line-clamp-2">{result.title ?? result.query}</div>
                <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                  {result.currentPrice ? (
                    <span className="text-[24px] font-bold tabular">{result.currency === "BRL" ? brl(result.currentPrice) : `${result.currency} ${result.currentPrice}`}</span>
                  ) : (
                    <span className="text-muted">Preço não encontrado</span>
                  )}
                  {result.regularPrice && result.currentPrice && result.regularPrice > result.currentPrice && (
                    <span className="text-muted line-through tabular">{result.currency === "BRL" ? brl(result.regularPrice) : result.regularPrice}</span>
                  )}
                  {result.discountPercent ? <Badge tone="success">-{result.discountPercent}%</Badge> : null}
                </div>
                {installments > 1 && result.currentPrice && <div className="text-[13px] text-muted">{installments}x de {brl(result.currentPrice / installments)}</div>}
              </div>
            </div>

            {result.lowestPrice && (
              <div className="mt-4 rounded-2xl bg-line/[0.04] px-4 py-3">
                <div className="text-[13px] font-semibold">Menor preço já registrado</div>
                <div className="text-[14px] mt-0.5">
                  US$ {result.lowestPrice.price.toFixed(2)}
                  {result.lowestPrice.priceBrl ? ` (≈ ${brl(result.lowestPrice.priceBrl)})` : ""}
                  {result.lowestPrice.date ? ` em ${result.lowestPrice.date.split("-").reverse().join("/")}` : ""}
                </div>
                <div className="text-[12px] text-muted mt-1">{result.lowestPrice.note}</div>
              </div>
            )}

            {result.offers.length > 1 && (
              <div className="mt-4">
                <div className="text-[13px] font-semibold mb-2">Ofertas agora</div>
                <div className="divide-y divide-line/[0.06]">
                  {result.offers.slice(0, 7).map((o, i) => (
                    <button
                      key={`${o.store}-${i}`}
                      type="button"
                      onClick={() => o.url && void api.openExternal(o.url)}
                      className="w-full flex items-center justify-between gap-3 py-2 text-[14px] hover:text-primary text-left"
                    >
                      <span className="truncate">{o.store}</span>
                      <span className="tabular shrink-0">
                        {o.currency === "BRL" ? brl(o.price) : `US$ ${o.price.toFixed(2)}`}
                        {o.currency !== "BRL" && o.priceBrl ? <span className="text-muted"> ≈ {brl(o.priceBrl)}</span> : null}
                        {o.discountPercent ? <span className="text-success"> -{o.discountPercent}%</span> : null}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {result.notes.length > 0 && (
              <ul className="mt-4 space-y-1 text-[12.5px] text-muted list-disc pl-5">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}

            {result.historyLinks.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {result.historyLinks.map((l) => (
                  <Button key={l.url} size="sm" variant="secondary" icon={ExternalLink} onClick={() => void api.openExternal(l.url)}>
                    {l.label}
                  </Button>
                ))}
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <Card className={clsx(verdict.tone === "danger" ? "border-danger/30" : verdict.tone === "warning" ? "border-warning/30" : "border-success/30")}>
              <div className="flex items-center gap-3">
                <div
                  className={clsx(
                    "h-10 w-10 rounded-xl flex items-center justify-center",
                    verdict.tone === "danger" ? "bg-danger/15 text-danger" : verdict.tone === "warning" ? "bg-warning/15 text-warning" : "bg-success/15 text-success"
                  )}
                >
                  <VerdictIcon size={20} />
                </div>
                <div className="font-semibold text-[16px]">{verdict.title}</div>
              </div>
              <ul className="mt-3 space-y-2 text-[14px]">
                {verdict.lines.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </Card>

            <Card>
              <div className="flex items-center gap-2 font-semibold">
                <Wallet size={17} className="text-primary" /> Seu mês
              </div>
              <div className="mt-3 space-y-1.5 text-[14px]">
                <div className="flex justify-between">
                  <span className="text-muted">Renda</span>
                  <span className="tabular" data-private="">{brl(result.budget.monthlyIncome)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Disponível no mês</span>
                  <span className="tabular" data-private="">{brl(result.budget.available ?? result.budget.monthBalance)}</span>
                </div>
                {result.budget.accountsBalance !== undefined && (
                  <div className="flex justify-between">
                    <span className="text-muted">Saldo nas contas</span>
                    <span className="tabular" data-private="">{brl(result.budget.accountsBalance)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted">Faturas em aberto</span>
                  <span className="tabular" data-private="">{brl(result.budget.invoicesOpen)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Reserva de emergência</span>
                  <span className="tabular" data-private="">{brl(result.budget.emergencyReserve)}</span>
                </div>
              </div>
            </Card>

            <Button className="w-full" icon={Sparkles} disabled={!ai.data?.hasKey} onClick={() => void askAssistant()}>
              Pedir a opinião do Assistente
            </Button>
            {ai.data && !ai.data.hasKey && <div className="text-[12px] text-muted text-center">O Assistente ainda não foi ativado neste app.</div>}
          </div>
        </motion.div>
      )}
    </div>
  );
}
