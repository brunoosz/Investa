// Testa a "melhor próxima ação", a análise diária da IA (com notícias e IA falsas)
// e os avisos que o celular agenda no sistema. Uso: npm run test:insight
import type { AiLogEntry, FinancialProfile, Goal, Indicators, Invoice, NewsItem } from "@shared/types";
import { defaultUserData } from "@shared/defaults";
import { bestAction, insightHour, insightNotification, isQuietHour, parseInsight, upcomingNotices, type BestActionInput } from "@shared/insight";
import { aiErrorSummary, generateDailyInsight } from "../core/insight";

let failed = 0;
function check(name: string, ok: boolean, extra = ""): void {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FALHOU"} ${name}${!ok && extra ? ` — ${extra}` : ""}`);
}

const ind: Indicators = { selic: { date: "2026-10-01", value: 15 }, ipca12m: { date: "2026-09-01", value: 5 }, updatedAt: "2026-10-13" };
const profile = (p: Partial<FinancialProfile> = {}): FinancialProfile => ({
  ...defaultUserData().profile,
  onboarded: true,
  salary: 3000,
  fixedExpenses: 1500,
  variableExpenses: 500,
  monthlyInvest: 300,
  emergencyReserve: 20000,
  riskProfile: "moderado",
  ...p,
});
const input = (o: Partial<BestActionInput> = {}): BestActionInput => ({
  profile: profile(),
  invoices: [],
  goals: [],
  available: 800,
  invoicesOpen: 0,
  accountsTotal: 1000,
  invested: 0,
  indicators: ind,
  ym: "2026-10",
  ...o,
});
const inv = (o: Partial<Invoice>): Invoice => ({ id: "i1", institution: "nubank", ym: "2026-10", amount: 900, paid: false, ...o });

// ---- regras da melhor próxima ação, na ordem de prioridade ----
check("mês no vermelho vem primeiro", bestAction(input({ available: -200, profile: profile({ debts: 5000 }) })).id === "equilibrar");
check("fatura atrasada antes de dívida", bestAction(input({ invoices: [inv({ ym: "2026-09" })], profile: profile({ debts: 5000 }) })).id === "fatura");
const fat = bestAction(input({ invoices: [inv({ ym: "2026-09" })] }));
check("fatura fala do rotativo", /rotativo/i.test(fat.title + fat.why));
check("dívidas antes da reserva", bestAction(input({ profile: profile({ debts: 5000, emergencyReserve: 0 }) })).id === "divida");
const res = bestAction(input({ profile: profile({ emergencyReserve: 2000 }) }));
check("reserva curta → reserva", res.id === "reserva", res.id);
check("reserva sugere Tesouro Selic/CDB com liquidez", /Tesouro Selic/.test(res.detail) && /liquidez diária/.test(res.detail));
check("reserva cita meses e valor que falta", /R\$\s?10\.000/.test(res.detail), res.detail);
check("reserva cita a Selic", /15,00%/.test(res.why), res.why);
check("sem aporte definido → aporte", bestAction(input({ profile: profile({ monthlyInvest: 0 }) })).id === "aporte");
const goal: Goal = {
  id: "g1",
  name: "Viagem",
  icon: "plane",
  color: "#fff",
  target: 12000,
  deadline: "2027-10-15",
  createdAt: "2026-01-01",
  allocations: [{ id: "a", type: "cdb", asset: "CDB", institution: "x", amount: 0, monthly: 100, rateType: "cdi", rate: 100 } as Goal["allocations"][number]],
};
const g = bestAction(input({ goals: [goal] }));
check("objetivo atrasado → objetivo", g.id === "objetivo" && g.title.includes("Viagem"), g.id);
const ok = bestAction(input());
check("tudo em dia → investir pelo perfil", ok.id === "investir" && /70% em renda fixa/.test(ok.detail), ok.detail);
check("juro real calculado", /10,00%/.test(ok.why), ok.why);
check("arrojado → ETFs", /ETF/.test(bestAction(input({ profile: profile({ riskProfile: "arrojado" }) })).detail));
check("sem indicadores ainda funciona", bestAction(input({ indicators: undefined })).id === "investir");
check("toda ação tem pergunta para o Assistente", [res, fat, ok, g].every((a) => a.prompt.length > 10));

// ---- leitura da resposta da IA ----
const p1 = parseInsight("HOJE: Tesouro Selic para a reserva\nPORQUE: o Copom manteve a Selic em 15%.", "2026-10-13", "x");
check("lê HOJE/PORQUE", p1?.title === "Tesouro Selic para a reserva" && p1.why.startsWith("o Copom"));
const p2 = parseInsight("<think>pensando…</think>**Hoje:** CDB pós-fixado.\n**Por quê:** juros altos.", "d", "x");
check("aceita markdown, <think> e 'Por quê'", p2?.title === "CDB pós-fixado" && p2.why === "juros altos.", JSON.stringify(p2));
const p3 = parseInsight("Aproveite o Tesouro IPCA+. A inflação subiu.", "d", "x");
check("sem formato: usa a primeira frase", p3?.title === "Aproveite o Tesouro IPCA+" && p3.why === "A inflação subiu.", JSON.stringify(p3));
check("resposta vazia → null", parseInsight("  ", "d", "x") === null);
const n = insightNotification(p1!);
check("notificação: título e aviso educativo", n.title.startsWith("Hoje: ") && /educativo/.test(n.message) && /^Porque o Copom/.test(n.message), n.message);

// ---- horário ----
check("silêncio 22h–8h", isQuietHour(22) && isQuietHour(3) && isQuietHour(7) && !isQuietHour(8) && !isQuietHour(21));
check("hora da análise dentro da janela", insightHour({ aiInsightHour: 3 }) === 8 && insightHour({ aiInsightHour: 23 }) === 21 && insightHour({}) === 9);

// ---- análise diária com notícias e IA falsas ----
const news: NewsItem[] = [
  { id: "1", title: "Copom mantém Selic em 15%", link: "https://x/1", source: "InfoMoney", publishedAt: "2026-10-13T10:00:00Z" },
  { id: "2", title: "Inflação desacelera em setembro", link: "https://x/2", source: "g1 Economia", publishedAt: "2026-10-13T09:00:00Z" },
];
let sent: { role: string; content: string }[] = [];
const insight = await generateDailyInsight({
  complete: async (m) => {
    sent = m;
    return "HOJE: Tesouro Selic segue atrativo\nPORQUE: o Copom manteve a Selic em 15% e a inflação desacelerou.";
  },
  news: async () => news,
  indicators: async () => ind,
  profile: profile({ salary: 7777, riskProfile: "conservador" }),
  date: "2026-10-13",
});
check("gera a análise", insight.title === "Tesouro Selic segue atrativo" && insight.date === "2026-10-13");
const userMsg = sent.find((m) => m.role === "user")?.content ?? "";
check("pedido leva as manchetes", userMsg.includes("Copom mantém Selic em 15% (InfoMoney)") && userMsg.includes("Inflação desacelera"));
check("pedido leva Selic e IPCA", /Selic 15,00%/.test(userMsg) && /IPCA 12 meses 5,00%/.test(userMsg), userMsg);
check("pedido leva o perfil, sem valores pessoais", /conservador/.test(userMsg) && !userMsg.includes("7777") && !/R\$/.test(userMsg));
check("pedido proíbe promessa de ganho", /garantida/.test(sent[0].content));
const noNews = await generateDailyInsight({ complete: async () => "HOJE: CDB de liquidez diária\nPORQUE: juros altos.", news: async () => Promise.reject(new Error("offline")), indicators: async () => ind, profile: profile(), date: "d" }).catch(() => null);
check("sem notícias, usa só os indicadores", noNews?.title === "CDB de liquidez diária");
const nothing = await generateDailyInsight({ complete: async () => "HOJE: x", news: async () => [], indicators: async () => undefined, profile: profile(), date: "d" }).then(
  () => "gerou",
  (e: Error) => e.message
);
check("sem notícias e sem indicadores: erro claro", /Sem notícias/.test(nothing), nothing);
const bad = await generateDailyInsight({ complete: async () => "", news: async () => news, indicators: async () => ind, profile: profile(), date: "d" }).then(
  () => "gerou",
  () => "erro"
);
check("resposta vazia da IA vira erro", bad === "erro");

// ---- aviso de erros da IA para o Dono ----
const log: AiLogEntry[] = [
  { at: "2026-10-13T10:05:00Z", kind: "erro", model: "groq:llama", code: "AI_RATE", status: 429, message: "Limite" },
  { at: "2026-10-13T10:01:00Z", kind: "ok", model: "groq:llama" },
  { at: "2026-10-13T09:59:00Z", kind: "erro", model: "-", code: "AI_NO_KEY" },
  { at: "2026-10-13T08:00:00Z", kind: "erro", model: "x", code: "AI_DOWN" },
];
const sum = aiErrorSummary(log, "2026-10-13T09:00:00Z");
check("resumo conta só os erros novos", sum?.count === 2 && sum.newest === "2026-10-13T10:05:00Z");
check("resumo cita o último código", /AI_RATE · HTTP 429 · groq:llama/.test(sum?.message ?? ""), sum?.message);
check("sem erros novos → nada", aiErrorSummary(log, "2026-10-13T10:05:00Z") === null);

// ---- avisos agendados no celular ----
const now = new Date("2026-10-13T12:00:00"); // terça
const data = {
  settings: { ...defaultUserData().settings, dailyTip: true },
  alerts: [
    { id: "r1", kind: "lembrete" as const, title: "Pagar aluguel", remindAt: new Date("2026-10-20T18:30:00").toISOString(), active: true, repeat: false, createdAt: "x" },
    { id: "r2", kind: "lembrete" as const, remindAt: new Date("2026-10-01T08:00:00").toISOString(), active: true, repeat: false, createdAt: "x" },
  ],
  bills: [{ id: "b1", name: "Internet", amount: 100, dueDay: 20, category: "Casa", paid: [], active: true }],
  invoices: [inv({ id: "f1", dueDay: 25 }), inv({ id: "f2", dueDay: 10, paid: true })],
};
const list = upcomingNotices(data, now);
const keys = list.map((x) => x.key);
check("lembrete futuro agendado na hora", list.some((x) => x.key.startsWith("rem-r1-") && x.at.getHours() === 18 && x.at.getMinutes() === 30));
check("lembrete passado fica de fora", !keys.some((k) => k.startsWith("rem-r2")));
check("conta: 3 dias antes, no dia e atrasada (chaves do motor)", ["conta-b1-2026-10-antes", "conta-b1-2026-10-hoje", "conta-b1-2026-10-atrasada"].every((k) => keys.includes(k)), keys.join(","));
check("conta do mês seguinte também", keys.includes("conta-b1-2026-11-hoje"));
const before = list.find((x) => x.key === "conta-b1-2026-10-antes")!;
check("conta antes: dia 17 às 9h", before.at.getDate() === 17 && before.at.getHours() === 9);
check("fatura em aberto: 2 dias antes e no dia", keys.includes("fatura-f1-antes") && keys.includes("fatura-f1-hoje"));
check("fatura paga fica de fora", !keys.some((k) => k.startsWith("fatura-f2")));
check("dica do dia nos próximos dias (hoje já passou das 9h)", keys.includes("tip-2026-10-14") && !keys.includes("tip-2026-10-13"));
check("resumo de domingo", keys.includes("semana-2026-10-18"));
check("em ordem de horário", list.every((x, i) => i === 0 || list[i - 1].at <= x.at));
const done = upcomingNotices(data, now, { "conta-b1-2026-10-antes": "x" });
check("aviso já entregue não é agendado de novo", !done.some((x) => x.key === "conta-b1-2026-10-antes"));
check("notificações desligadas → nada agendado", upcomingNotices({ ...data, settings: { ...data.settings, desktopNotifications: false } }, now).length === 0);
const paid = upcomingNotices({ ...data, bills: [{ ...data.bills[0], paid: ["2026-10"] }] }, now).map((x) => x.key);
check("conta paga no mês não avisa", !paid.some((k) => k.includes("b1-2026-10")) && paid.includes("conta-b1-2026-11-hoje"));
check("sem horário entre 22h e 8h (exceto lembretes)", list.filter((x) => !x.key.startsWith("rem-")).every((x) => !isQuietHour(x.at.getHours())));

console.log(failed ? `\n${failed} teste(s) falharam` : "\nTodos os testes passaram");
process.exit(failed ? 1 : 0);
