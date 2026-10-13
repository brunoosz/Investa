import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Compass, Newspaper, Sparkles } from "lucide-react";
import type { DailyInsight } from "@shared/types";
import { bestAction, INSIGHT_DISCLAIMER } from "@shared/insight";
import { currentYm, monthBudget, pendingFor, summarizeMonth } from "@shared/finance";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useAsync } from "@/hooks/useAsync";
import { useIndicators } from "@/hooks/useMarketData";
import { useUserData } from "@/store/session";
import { Card, PrivateAmounts, SectionTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";

const TONE = {
  negative: "bg-danger/10 text-danger",
  info: "bg-primary/10 text-primary",
  positive: "bg-success/10 text-success",
} as const;

/** "Sua melhor próxima ação": regras com os seus dados (funciona sem internet) + a análise diária da IA. */
export function BestActionCard() {
  const navigate = useNavigate();
  const profile = useUserData("profile");
  const invoices = useUserData("invoices");
  const goals = useUserData("goals");
  const accounts = useUserData("accounts");
  const expenses = useUserData("expenses");
  const bills = useUserData("bills");
  const planned = useUserData("planned");
  const boxes = useUserData("boxes");
  const { data: ind } = useIndicators();
  const insight = useAsync("daily-insight", () => api.ai.insight(), { staleMs: 5 * 60_000 });
  const [generating, setGenerating] = useState(false);
  const [failed, setFailed] = useState(false);

  const reload = useRef(insight.reload);
  reload.current = insight.reload;
  useEffect(() => api.on("insight:new", () => reload.current()), []);

  const action = useMemo(() => {
    const ym = currentYm();
    const budget = monthBudget(summarizeMonth(expenses, ym, profile.salary, profile.extraIncome), invoices, ym, new Date(), pendingFor(bills, planned, ym, boxes));
    return bestAction({
      profile,
      invoices,
      goals,
      available: budget.available,
      invoicesOpen: budget.invoicesOpen,
      accountsTotal: accounts.reduce((s, a) => s + a.balance, 0),
      invested: profile.invested,
      indicators: ind,
      ym,
    });
  }, [profile, invoices, goals, accounts, expenses, bills, planned, boxes, ind]);

  const generate = async () => {
    setGenerating(true);
    setFailed(false);
    try {
      const r = await api.ai.refreshInsight();
      if (r) insight.reload();
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setGenerating(false);
    }
  };

  const today: DailyInsight | null | undefined = insight.data;
  const ask = (q: string) => navigate(`/assistente?modo=financas&q=${encodeURIComponent(q)}`);

  return (
    <Card>
      <SectionTitle title="Sua melhor próxima ação" subtitle="Pelo seu perfil e pelos seus dados" />
      <div className="flex gap-3">
        <div className={clsx("h-10 w-10 shrink-0 rounded-2xl grid place-items-center", TONE[action.tone])}>
          <Compass size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[15.5px] leading-snug">{action.title}</div>
          <div className="text-[13.5px] mt-1">
            <PrivateAmounts text={action.detail} />
          </div>
          <div className="text-[13px] text-muted mt-1.5">
            <span className="font-medium text-fg/80">Por quê: </span>
            {action.why}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-line/[0.05] p-3.5">
        <div className="flex items-center gap-1.5 text-[12.5px] text-muted font-medium">
          <Newspaper size={14} /> Análise do dia (IA)
          {today && <span className="ml-auto font-normal">{relativeTime(today.at)}</span>}
        </div>
        {today ? (
          <>
            <div className="font-semibold text-[14.5px] mt-1">Hoje: {today.title}</div>
            {today.why && <div className="text-[13px] text-muted mt-0.5">Por quê: {today.why.replace(/^porque\s+/i, "")}</div>}
            <div className="text-[11.5px] text-muted mt-1.5">{INSIGHT_DISCLAIMER}</div>
          </>
        ) : (
          <div className="text-[13px] text-muted mt-1">
            {failed ? "Não deu para gerar agora. Tente de novo mais tarde." : "A IA lê as notícias e manda uma ideia por dia na hora que você escolher em Configurações."}
            <button className="block text-primary font-semibold mt-1.5 disabled:opacity-60" disabled={generating} onClick={() => void generate()}>
              {generating ? "Analisando as notícias…" : "Gerar a análise de hoje"}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <Button size="sm" icon={Sparkles} onClick={() => ask(today ? `${action.prompt} Considere também a análise de hoje: "${today.title}" (${today.why}).` : action.prompt)}>
          Conversar com o Assistente
        </Button>
      </div>
    </Card>
  );
}
