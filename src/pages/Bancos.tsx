import { useMemo, useState } from "react";
import { ChevronDown, CircleCheck, CircleMinus, Landmark, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { BANKS, bankById } from "@shared/banks";
import { netReturn } from "@shared/finance";
import { api } from "@/lib/api";
import { brl, dateBR, num, relativeTime } from "@/lib/format";
import { useAsync } from "@/hooks/useAsync";
import { Badge, Card, ErrorState, PageHeader, ProgressRing, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Field, MoneyInput, SegmentedControl } from "@/components/ui/form";

type Tab = "ranking" | "investir" | "credito";

function BankLogo({ id, size = 44 }: { id: string; size?: number }) {
  const b = bankById(id);
  const label = b?.short ?? id;
  const scale = label.length <= 2 ? 0.36 : label.length === 3 ? 0.3 : label.length === 4 ? 0.25 : label.length === 5 ? 0.22 : 0.19;
  return (
    <div className="rounded-control flex items-center justify-center text-white font-bold shrink-0 tracking-tight" style={{ width: size, height: size, background: b?.color ?? "rgb(var(--primary))", fontSize: size * scale }}>
      {label}
    </div>
  );
}

const TYPE_LABEL = { digital: "Banco digital", tradicional: "Banco tradicional", corretora: "Corretora" };

function Ranking() {
  const { data, error, loading, reload, updatedAt } = useAsync("banks", () => api.banks(), { refreshMs: 60 * 60_000, staleMs: 30 * 60_000 });
  const [open, setOpen] = useState<string | null>(null);
  if (loading && !data)
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-footnote text-muted">
        <span>
          Nota calculada com o CDI de hoje ({data?.cdi ? `${num(data.cdi)}%` : "—"}), tarifas, variedade de investimentos e juros de crédito oficiais do Banco Central
          {data?.credit.period ? ` (semana de ${dateBR(data.credit.period)})` : ""}.
        </span>
        <button onClick={reload} className="pressable inline-flex items-center gap-1.5 hover:text-fg transition-colors">
          <RefreshCw size={13} /> {updatedAt ? relativeTime(updatedAt) : ""}
        </button>
      </div>
      {data?.scores.map((s, i) => {
        const b = bankById(s.bankId)!;
        const expanded = open === b.id;
        return (
          <Card key={b.id} padded={false} className="overflow-hidden">
            <button className="w-full flex items-center gap-4 p-4 sm:p-5 text-left hover:bg-line/[0.03] transition-colors" onClick={() => setOpen(expanded ? null : b.id)}>
              <div className={clsx("w-7 text-center text-title tabular", i < 3 ? "text-warning" : "text-muted")}>{i + 1}</div>
              <BankLogo id={b.id} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-headline">{b.name}</span>
                  <Badge tone={b.type === "digital" ? "primary" : b.type === "corretora" ? "secondary" : "neutral"}>{TYPE_LABEL[b.type]}</Badge>
                </div>
                <div className="text-footnote text-muted mt-0.5 line-clamp-1">{s.reasons[0]}</div>
                <div className="text-footnote mt-1">
                  <span className="text-muted">Melhor para:</span> {b.bestFor}
                </div>
              </div>
              <ProgressRing value={s.score / 100} size={54} stroke={5}>
                <span className="text-callout font-bold tabular">{s.score}</span>
              </ProgressRing>
              <ChevronDown size={18} className={clsx("text-muted transition-transform duration-300 ease-out-strong", expanded && "rotate-180")} />
            </button>
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: "spring", bounce: 0, duration: 0.3 }} className="overflow-hidden">
                  <div className="px-5 pb-5 grid gap-4 md:grid-cols-3 border-t border-separator/10 pt-4">
                    <div className="md:col-span-1">
                      <div className="text-footnote font-semibold mb-2">Por que está nessa posição</div>
                      <ul className="space-y-1.5 text-footnote">
                        {s.reasons.map((r, j) => (
                          <li key={j} className="flex gap-2">
                            <span className="text-primary">•</span>
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-footnote font-semibold mb-2">Pontos fortes</div>
                      <ul className="space-y-1.5 text-footnote">
                        {b.pros.map((p) => (
                          <li key={p} className="flex gap-2">
                            <CircleCheck size={16} className="text-success shrink-0 mt-0.5" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-footnote font-semibold mb-2">Atenção</div>
                      <ul className="space-y-1.5 text-footnote">
                        {b.cons.map((c) => (
                          <li key={c} className="flex gap-2">
                            <CircleMinus size={16} className="text-warning shrink-0 mt-0.5" />
                            {c}
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap gap-1 mt-3">
                        {b.invest.map((x) => (
                          <Badge key={x}>{x}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        );
      })}
      <p className="text-footnote text-muted">
        As taxas dos produtos de cada banco são referências típicas e podem variar por cliente e promoção — confirme no app do banco antes de investir. CDI e juros de crédito são dados oficiais do Banco Central, atualizados automaticamente.
      </p>
    </div>
  );
}

function Investir() {
  const { data, error, reload } = useAsync("banks", () => api.banks(), { staleMs: 30 * 60_000 });
  const [amount, setAmount] = useState(5_000);
  const [months, setMonths] = useState("12");
  const days = Number(months) * 30.4;
  const cdi = data?.cdi ?? 0;
  const rows = useMemo(
    () =>
      BANKS.map((b) => {
        const liquidAnnual = (b.liquidProduct.pctCDI / 100) * cdi;
        const topAnnual = (b.cdbTop.pctCDI / 100) * cdi;
        const liquid = amount * (1 + netReturn(liquidAnnual, days, "cdb") / 100);
        const top = amount * (1 + netReturn(topAnnual, days, "cdb") / 100);
        return { b, liquid, top, liquidAnnual, topAnnual };
      }).sort((a, z) => z.liquid - a.liquid),
    [amount, days, cdi]
  );
  const best = rows[0]?.liquid ?? 0;
  return (
    <Card>
      <SectionTitle title="Quanto seu dinheiro rende em cada banco" subtitle={`Com o CDI de hoje: ${cdi ? `${num(cdi)}% ao ano` : "carregando…"} (Banco Central). Valores líquidos de IR.`} />
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      <div className="grid sm:grid-cols-2 gap-3 mb-5 max-w-xl">
        <Field label="Valor">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Prazo">
          <SegmentedControl
            block
            value={months}
            onChange={setMonths}
            options={[
              { value: "6", label: "6m" },
              { value: "12", label: "1 ano" },
              { value: "24", label: "2 anos" },
              { value: "36", label: "3 anos" },
            ]}
          />
        </Field>
      </div>
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-callout min-w-[620px]">
          <thead>
            <tr className="text-left text-footnote text-muted">
              <th className="px-5 py-2 font-semibold">Banco</th>
              <th className="px-3 py-2 font-semibold">Com liquidez diária</th>
              <th className="px-3 py-2 font-semibold text-right">Você terá</th>
              <th className="px-3 py-2 font-semibold">Melhor CDB (prazo)</th>
              <th className="px-5 py-2 font-semibold text-right">Você terá</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ b, liquid, top }) => (
              <tr key={b.id} className="border-t border-separator/[0.07]">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <BankLogo id={b.id} size={30} />
                    <span className="font-medium">{b.name}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted">
                  {b.liquidProduct.name} · {b.liquidProduct.pctCDI}% CDI
                </td>
                <td className={clsx("px-3 py-3 text-right font-semibold tabular", liquid === best && "text-success")}>{brl(liquid)}</td>
                <td className="px-3 py-3 text-muted">
                  {b.cdbTop.pctCDI}% CDI · {b.cdbTop.term}
                </td>
                <td className="px-5 py-3 text-right font-semibold tabular">{brl(top)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-footnote text-muted mt-3">Todos os bancos listados são cobertos pelo FGC (até R$ 250 mil por CPF por instituição) nos CDBs, LCIs e LCAs.</p>
    </Card>
  );
}

function Credito() {
  const { data, error, loading, reload } = useAsync("banks", () => api.banks(), { staleMs: 30 * 60_000 });
  const modalities = data?.credit.modalities ?? [];
  const [key, setKey] = useState<string | null>(null);
  const current = modalities.find((m) => m.key === key) ?? modalities[0];
  if (loading && !data) return <Skeleton className="h-64" />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!current)
    return (
      <Card>
        <div className="text-muted text-callout">As taxas de crédito do Banco Central não estão disponíveis agora. Tente novamente mais tarde.</div>
        <Button className="mt-3" variant="secondary" onClick={reload}>
          Tentar de novo
        </Button>
      </Card>
    );
  return (
    <Card padded={false}>
      <div className="p-5 pb-3">
        <SectionTitle title="Quem cobra menos juros" subtitle={`Dados oficiais do Banco Central${data?.credit.period ? ` · período iniciado em ${dateBR(data.credit.period)}` : ""}. Útil para fugir de dívidas caras.`} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {modalities.map((m) => (
            <button
              key={m.key}
              onClick={() => setKey(m.key)}
              className={clsx("pressable h-8 px-3 rounded-full text-footnote font-semibold border whitespace-nowrap transition-colors", current.key === m.key ? "bg-primary/15 border-primary/40 text-primary" : "border-separator/15 text-muted hover:text-fg hover:bg-line/[0.06]")}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-separator/[0.07]">
        {current.rates.slice(0, 25).map((r, i) => (
          <div key={`${r.institution}-${i}`} className={clsx("flex items-center gap-3 px-5 py-2.5", r.bankId && "bg-primary/[0.04]")}>
            <div className="w-7 text-footnote text-muted tabular">{i + 1}º</div>
            {r.bankId ? <BankLogo id={r.bankId} size={28} /> : <div className="h-7 w-7 rounded-chip bg-line/10 flex items-center justify-center"><Landmark size={14} className="text-muted" /></div>}
            <div className="flex-1 min-w-0 text-callout truncate">{r.institution}</div>
            <div className="text-right">
              <div className="font-semibold tabular text-callout">{num(r.rateMonth)}% a.m.</div>
              <div className="text-footnote text-muted tabular">{num(r.rateYear)}% a.a.</div>
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 py-3 text-footnote text-muted">
        Mostrando as 25 menores taxas de {current.rates.length} instituições. Bancos destacados fazem parte da lista do Investa.
      </div>
    </Card>
  );
}

export function Bancos() {
  const [tab, setTab] = useState<Tab>("ranking");
  return (
    <div>
      <PageHeader title="Bancos" subtitle="Os melhores bancos para você, com o porquê — atualizado todos os dias com dados oficiais." />
      <SegmentedControl<Tab>
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: "ranking", label: "Ranking" },
          { value: "investir", label: "Para investir" },
          { value: "credito", label: "Juros de crédito" },
        ]}
      />
      {tab === "ranking" && <Ranking />}
      {tab === "investir" && <Investir />}
      {tab === "credito" && <Credito />}
    </div>
  );
}
