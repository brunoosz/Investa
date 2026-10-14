import { useMemo } from "react";
import { CalendarDays, CreditCard, Repeat, Wallet } from "lucide-react";
import clsx from "clsx";
import { monthCalendar, ymLabel, localIsoDate, type CalendarItem } from "@shared/finance";
import { brl } from "@/lib/format";
import { useUserData } from "@/store/session";
import { Card, Private, SectionTitle } from "@/components/ui/primitives";

const ICON = { salario: Wallet, adiantamento: Wallet, conta: Repeat, fatura: CreditCard };

export function useMonthCalendar(ym: string): CalendarItem[] {
  const profile = useUserData("profile");
  const bills = useUserData("bills");
  const accounts = useUserData("accounts");
  const invoices = useUserData("invoices");
  return useMemo(() => monthCalendar(profile, bills, accounts, invoices, ym), [profile, bills, accounts, invoices, ym]);
}

/** Quando o dinheiro entra (salário) e quando cada conta e fatura vence, em ordem. */
export function MonthCalendarCard({ ym }: { ym: string }) {
  const items = useMonthCalendar(ym);
  const profile = useUserData("profile");
  const today = localIsoDate();
  if (!items.length) return null;
  return (
    <Card className="mb-4">
      <SectionTitle
        title="Calendário do mês"
        subtitle={profile.payDay ? `O que entra e o que vence em ${ymLabel(ym)}` : "Informe o dia do pagamento em Configurações › Dados financeiros."}
      />
      <div className="divide-y divide-separator/[0.06]" data-testid="month-calendar">
        {items.map((it, i) => {
          const Icon = ICON[it.kind];
          const isToday = it.date === today;
          return (
            <div key={`${it.kind}-${it.label}-${i}`} className={clsx("flex items-center gap-3 py-2", it.done && "opacity-55")}>
              <div className={clsx("w-11 text-center shrink-0 rounded-chip py-1", isToday ? "bg-primary/15 text-primary" : "bg-line/[0.05]")}>
                <div className="text-body font-bold tabular leading-tight">{Number(it.date.slice(8))}</div>
                <div className="text-caption uppercase text-muted leading-tight">{isToday ? "hoje" : "dia"}</div>
              </div>
              <Icon size={16} className={clsx("shrink-0", it.income ? "text-success" : it.mandatory ? "text-warning" : "text-muted")} />
              <div className="flex-1 min-w-0 text-callout truncate">
                {it.label}
                {it.mandatory && <span className="text-muted"> · obrigatório</span>}
                {it.done && <span className="text-muted"> · {it.income ? "recebido" : "pago"}</span>}
              </div>
              {it.amount > 0 && (
                <Private className={clsx("tabular font-semibold text-callout shrink-0", it.income && "text-success")}>
                  {it.income ? "+" : "−"} {brl(it.amount)}
                </Private>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Uma linha com o próximo dinheiro que entra e a próxima conta/fatura que vence. */
export function NextDatesLine() {
  const ym = localIsoDate().slice(0, 7);
  const items = useMonthCalendar(ym);
  const today = localIsoDate();
  const next = items.filter((i) => !i.done && i.date >= today);
  const inc = next.find((i) => i.income);
  const out = next.find((i) => !i.income);
  if (!inc && !out) return null;
  const day = (d: string) => (d === today ? "hoje" : `dia ${Number(d.slice(8))}`);
  return (
    <div className="mt-3 flex items-start gap-2 text-footnote text-muted">
      <CalendarDays size={15} className="text-primary shrink-0 mt-0.5" />
      <span>
        {inc && (
          <>
            {inc.label} {day(inc.date)}
          </>
        )}
        {inc && out && " · "}
        {out && (
          <>
            {out.label} vence {day(out.date)}
          </>
        )}
      </span>
    </div>
  );
}
