import type { AiLogEntry, DailyInsight, FinancialProfile, Indicators, NewsItem } from "@shared/types";
import { INSIGHT_SYSTEM_PROMPT, insightUserMessage, parseInsight } from "@shared/insight";

type Msg = { role: "system" | "user" | "assistant"; content: string };

/** Gera a análise diária: manchetes + indicadores + perfil → "Hoje: … porque …". */
export async function generateDailyInsight(o: {
  complete: (messages: Msg[]) => Promise<string>;
  news: () => Promise<NewsItem[]>;
  indicators: () => Promise<Indicators | undefined>;
  profile: Partial<FinancialProfile>;
  date: string;
  model?: () => string | undefined;
}): Promise<DailyInsight> {
  const [news, indicators] = await Promise.all([o.news().catch(() => [] as NewsItem[]), o.indicators().catch(() => undefined)]);
  if (!news.length && !indicators) throw new Error("Sem notícias e sem indicadores agora.");
  const raw = await o.complete([
    { role: "system", content: INSIGHT_SYSTEM_PROMPT },
    { role: "user", content: insightUserMessage({ date: o.date, profile: o.profile, indicators, news }) },
  ]);
  const insight = parseInsight(raw, o.date, new Date().toISOString(), o.model?.());
  if (!insight) throw new Error("A IA não devolveu uma análise válida.");
  return insight;
}

/** Erros da IA desde `since`, resumidos para o aviso do Dono. */
export function aiErrorSummary(log: AiLogEntry[], since: string): { count: number; newest: string; message: string } | null {
  const errors = log.filter((e) => e.kind === "erro" && e.at > since);
  if (!errors.length) return null;
  const last = errors.reduce((a, b) => (b.at > a.at ? b : a));
  const what = [last.code, last.status ? `HTTP ${last.status}` : "", last.model !== "-" ? last.model : ""].filter(Boolean).join(" · ");
  return {
    count: errors.length,
    newest: last.at,
    message: `${errors.length === 1 ? "1 erro" : `${errors.length} erros`} da IA. Último: ${what}${last.message ? ` — ${last.message}` : ""}. Veja em Logs.`,
  };
}
