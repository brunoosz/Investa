/* eslint-disable @typescript-eslint/no-explicit-any */
// Teste do AiService contra um servidor falso compatível com a API da OpenAI
// (streaming SSE): streaming, continuação de resposta cortada, cancelamento,
// resposta em inglês, troca de modelo sem mudar a escolha salva, Groq e nuvem.
// Rodar com: node scripts/test-ai.mjs
import http from "node:http";
import type { AddressInfo } from "node:net";
import { AiService, joinContinuation, looksEnglish, wantsOtherLanguage } from "../core/ai";

const PT_ANSWER =
  "Claro! Aqui vai um plano simples para você começar a investir com segurança. Primeiro, monte a sua reserva de emergência no Tesouro Selic ou num CDB com liquidez diária que pague pelo menos 100% do CDI. Depois, defina quanto pode guardar por mês e automatize esse valor logo no dia do salário. Por fim, com a reserva pronta, comece a diversificar aos poucos.";
const EN_ANSWER =
  "Sure! Here is a simple plan for you to start investing safely. First, you should build an emergency fund with the money you have, and then you can think about other investments that are a good fit for your goals and your risk profile over time.";
const LONG_FULL =
  "## Plano de investimento\n\n1. **Reserva de emergência**: junte seis meses de gastos no Tesouro Selic.\n2. **Metas de curto prazo**: use CDBs de bancos sólidos com vencimento próximo da data da meta.\n3. **Longo prazo**: invista todo mês em um fundo de índice amplo e reavalie a carteira uma vez por ano, sem pressa e sem tentar adivinhar o mercado.";
const CUT = LONG_FULL.indexOf("CDBs de ba") + "CDBs de ba".length; // corta no meio da palavra "bancos"
const LONG_PART1 = LONG_FULL.slice(0, CUT);
// A continuação repete o fim da primeira parte (como alguns modelos fazem).
const LONG_PART2 = LONG_FULL.slice(CUT - 30);

interface Seen {
  path: string;
  model: string;
  body: Record<string, unknown>;
  closedEarly: boolean;
}
const seen: Seen[] = [];

function sse(res: http.ServerResponse, text: string, opts: { chunk?: number; delay?: number; finish?: string } = {}, rec?: Seen): void {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  const size = opts.chunk ?? 20;
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  let i = 0;
  let closed = false;
  res.on("close", () => {
    closed = true;
    if (rec && !res.writableFinished) rec.closedEarly = true;
  });
  const tick = () => {
    if (closed) return;
    if (i < parts.length) {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: parts[i] }, finish_reason: null }] })}\n\n`);
      i++;
      setTimeout(tick, opts.delay ?? 10);
      return;
    }
    res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: opts.finish ?? "stop" }] })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  };
  tick();
}

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (req.method === "GET" && req.url?.endsWith("/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      const ids = req.url.startsWith("/groq") ? ["llama-3.3-70b-versatile", "moonshotai/kimi-k2-instruct-0905"] : ["fast-model", "long-model", "english-model", "slow-model", "fail-model", "gone-model"];
      res.end(JSON.stringify({ data: ids.map((id) => ({ id })) }));
      return;
    }
    const body = JSON.parse(raw || "{}") as { model: string; messages: { role: string; content: string }[] };
    const rec: Seen = { path: req.url ?? "", model: body.model, body, closedEarly: false };
    seen.push(rec);
    const last = body.messages[body.messages.length - 1]?.content ?? "";
    const system = body.messages.find((m) => m.role === "system")?.content ?? "";
    const isContinuation = last.startsWith("Sua resposta foi cortada");
    if (req.url?.startsWith("/groq")) {
      if (process.env.GROQ_MODE === "rate") {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Rate limit reached" } }));
        return;
      }
      return sse(res, PT_ANSWER, { chunk: 40, delay: 2 }, rec);
    }
    switch (body.model) {
      case "fast-model":
        return sse(res, PT_ANSWER, { chunk: 12, delay: 15 }, rec);
      case "long-model":
        return isContinuation ? sse(res, LONG_PART2, {}, rec) : sse(res, LONG_PART1, { finish: "length" }, rec);
      case "english-model":
        return system.includes("IMPORTANTE: escreva a resposta inteira em português") ? sse(res, PT_ANSWER, {}, rec) : sse(res, EN_ANSWER, {}, rec);
      case "slow-model":
        return sse(res, PT_ANSWER.repeat(3), { chunk: 10, delay: 50 }, rec);
      case "deepseek-ai/deepseek-v3.2":
        if ((body as Record<string, unknown>).chat_template_kwargs) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "unexpected field chat_template_kwargs" } }));
          return;
        }
        return sse(res, PT_ANSWER, {}, rec);
      case "break-model": {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: LONG_PART1 } }] })}\n\n`);
        setTimeout(() => res.destroy(), 80);
        return;
      }
      case "drift-model":
        if (system.startsWith("Você traduz textos")) return sse(res, "Depois, invista todo mês um valor fixo e acompanhe os resultados com calma.", {}, rec);
        return sse(res, `${PT_ANSWER}\n\nThen you should invest a fixed amount every month and keep track of the results with patience, because this is how it works.\n\n[[lembrar: quer investir todo mês]]`, {}, rec);
      case "fail-model":
        res.writeHead(500);
        res.end("erro interno");
        return;
      case "gone-model":
        res.writeHead(404);
        res.end(JSON.stringify({ error: "Function not found" }));
        return;
      default:
        res.writeHead(404);
        res.end("?");
    }
  });
});

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "OK  " : "FALHOU"} ${name}${!ok && detail !== undefined ? ` → ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  // A Groq tem endereço fixo no app: aqui ele é desviado para o servidor falso.
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const u = String(url).replace("https://api.groq.com/openai/v1", `${base}/groq`);
    return realFetch(u, init);
  }) as typeof fetch;

  const store = { app: {} as Record<string, any>, save() {} };
  const platform = { secrets: { encrypt: (p: string) => ({ data: p, mode: "plain" as const }), decrypt: (d: string) => d }, aiFileConfig: () => null };
  const ai = new AiService(store as any, platform as any);
  const now = new Date().toISOString();
  const reset = (model: string, extra: Record<string, unknown> = {}) => {
    store.app.ai = {
      apiKeyEnc: "nvapi-teste",
      keyMode: "plain",
      baseUrl: `${base}/nv`,
      model,
      catalog: { ids: ["fast-model", "long-model", "english-model", "slow-model", "fail-model", "gone-model"], updatedAt: now },
      changedAt: "2026-10-01T00:00:00.000Z",
      ...extra,
    };
    store.app.aiLog = [];
    seen.length = 0;
  };
  const ask = [
    { role: "system" as const, content: "Você é o Assistente." },
    { role: "user" as const, content: "Como começo a investir?" },
  ];

  // 1) Streaming: os trechos chegam aos poucos, não tudo no fim.
  reset("fast-model");
  {
    const times: number[] = [];
    let text = "";
    const t0 = Date.now();
    await ai.stream(ask, (d) => {
      times.push(Date.now() - t0);
      text += d;
    });
    const total = Date.now() - t0;
    check("streaming: resposta completa", text === PT_ANSWER, text.slice(0, 80));
    check("streaming: vários trechos", times.length > 5, times.length);
    check("streaming: primeiro trecho bem antes do fim", times[0] < total * 0.75, { first: times[0], total });
    check("streaming: pede max_tokens 8192", seen[0].body.max_tokens === 8192, seen[0].body);
    check("streaming: modelo escolhido continua salvo", store.app.ai.model === "fast-model");
  }

  // 2) Resposta cortada pelo limite (finish_reason = length): continua sozinha, sem repetir.
  reset("long-model");
  {
    let text = "";
    let label = "";
    await ai.stream(ask, (d) => (text += d), undefined, 8192, { onModel: (l) => (label = l) });
    check("continuação: texto final idêntico ao completo", text === LONG_FULL, text);
    check("continuação: fez 2 pedidos", seen.length === 2, seen.length);
    check("continuação: segundo pedido leva a parte já escrita", seen[1]?.body && JSON.stringify(seen[1].body).includes("Reserva de emergência"));
    check("continuação: registrada no log", (store.app.aiLog ?? []).some((l: any) => l.code === "AI_CONTINUE"));
    check("continuação: avisa o nome do modelo", label.includes("NVIDIA"), label);
  }

  // 3) Cancelar: a resposta para na hora e a conexão é fechada.
  reset("slow-model");
  {
    const ctrl = new AbortController();
    let text = "";
    let atAbort = -1;
    const t0 = Date.now();
    setTimeout(() => {
      atAbort = text.length;
      ctrl.abort();
    }, 1500);
    await ai.stream(ask, (d) => (text += d), ctrl.signal);
    const took = Date.now() - t0;
    await new Promise((r) => setTimeout(r, 400));
    check("cancelar: termina logo depois de parar", took < 1600, took);
    check("cancelar: já tinha texto e nada chega depois de parar", atAbort > 0 && text.length === atAbort, { atAbort, now: text.length });
    check("cancelar: servidor viu a conexão fechada", seen[0]?.closedEarly === true, seen[0]?.closedEarly);
    check("cancelar: log 'cancelado'", (store.app.aiLog ?? []).some((l: any) => l.kind === "cancelado"));
    check("cancelar: não tentou outro modelo", seen.length === 1, seen.length);
  }

  // 4) Inglês: descartado antes de aparecer e pedido de novo em português.
  reset("english-model");
  {
    let text = "";
    await ai.stream(ask, (d) => (text += d));
    check("idioma: resposta final em português", text === PT_ANSWER, text.slice(0, 80));
    check("idioma: nada em inglês chegou à tela", !/Sure! Here/.test(text));
    check("idioma: repetiu no mesmo modelo com instrução reforçada", seen.length === 2 && seen[1].model === "english-model", seen.map((s) => s.model));
    check("idioma: registrado no log", (store.app.aiLog ?? []).some((l: any) => l.code === "AI_LANG"));
    check("idioma: escolha salva intacta", store.app.ai.model === "english-model");
  }
  // Se a pessoa escreve em inglês, a resposta em inglês vale.
  reset("english-model");
  {
    let text = "";
    await ai.stream([{ role: "user", content: "How do I start investing my money?" }], (d) => (text += d));
    check("idioma: pergunta em inglês aceita resposta em inglês", text === EN_ANSWER && seen.length === 1, seen.length);
  }

  // Inglês só no fim: o trecho é traduzido e o texto inteiro é trocado.
  reset("drift-model", { catalog: { ids: ["drift-model"], updatedAt: now } });
  {
    let text = "";
    let replaced = "";
    await ai.stream(ask, (d) => (text += d), undefined, 8192, { onReplace: (full) => (replaced = full) });
    check("idioma no fim: troca pelo texto traduzido", replaced.startsWith(PT_ANSWER) && replaced.includes("Depois, invista todo mês") && !replaced.includes("Then you should"), replaced);
    check("idioma no fim: mantém o marcador de memória", replaced.includes("[[lembrar: quer investir todo mês]]"));
    const full = await ai.complete(ask);
    check("idioma no fim: complete() já devolve corrigido", full.includes("Depois, invista") && !full.includes("Then you"), full.slice(-120));
  }

  // 5) A escolha salva nunca muda sozinha: modelo fora do ar (404) e com erro (500).
  reset("gone-model");
  {
    let text = "";
    await ai.stream(ask, (d) => (text += d));
    check("escolha: 404 responde com outro modelo", text === PT_ANSWER, text.slice(0, 60));
    check("escolha: 404 não troca a escolha salva", store.app.ai.model === "gone-model", store.app.ai.model);
    check("escolha: info ainda mostra a escolha do Dono", ai.info(true).choice === "gone-model", ai.info(true).choice);
  }
  reset("fail-model");
  {
    let text = "";
    await ai.stream(ask, (d) => (text += d));
    check("escolha: 500 responde com outro modelo", text === PT_ANSWER);
    check("escolha: 500 não troca a escolha salva", store.app.ai.model === "fail-model", store.app.ai.model);
    check("escolha: troca registrada no log", (store.app.aiLog ?? []).some((l: any) => l.kind === "troca"));
  }
  // Automático: começa pelo mais bem colocado (rápido), não pelo último que respondeu.
  reset("auto", { lastUsed: "slow-model", catalog: { ids: ["meta/llama-3.1-405b-instruct", "deepseek-ai/deepseek-v4-pro", "deepseek-ai/deepseek-v4-flash"], updatedAt: now } });
  check("automático: começa pelo rápido (V4 Flash), não pelo de raciocínio", ai.resolve().model === "deepseek-ai/deepseek-v4-flash", ai.resolve().model);

  // Ajuste de "responder direto" recusado (400): repete sem ele e lembra disso.
  reset("deepseek-ai/deepseek-v3.2", { catalog: { ids: ["deepseek-ai/deepseek-v3.2", "fast-model"], updatedAt: now } });
  {
    let text = "";
    await ai.stream(ask, (d) => (text += d));
    check("ajustes: primeiro pedido desliga o raciocínio", !!seen[0]?.body.chat_template_kwargs, seen[0]?.body);
    check("ajustes: 400 → repete sem o ajuste no mesmo modelo", seen.length === 2 && seen[1].model === "deepseek-ai/deepseek-v3.2" && !seen[1].body.chat_template_kwargs && text === PT_ANSWER, seen.map((x) => x.model));
  }
  // Conexão caiu no meio: outro modelo continua do ponto onde parou.
  reset("break-model", { catalog: { ids: ["break-model", "long-model"], updatedAt: now } });
  {
    let text = "";
    await ai.stream(ask, (d) => (text += d));
    check("queda no meio: continua com outro modelo sem repetir", text === LONG_FULL, text);
    check("queda no meio: escolha salva intacta", store.app.ai.model === "break-model");
  }

  // 6) Groq primeiro; se der limite (429), a NVIDIA responde.
  reset("fast-model", { groqKeyEnc: "gsk_teste", groqKeyMode: "plain", groqModel: "auto" });
  {
    let text = "";
    let label = "";
    await ai.stream(ask, (d) => (text += d), undefined, 8192, { onModel: (l) => (label = l) });
    check("groq: responde primeiro", label.includes("Groq") && seen[0].path.startsWith("/groq"), { label, path: seen[0]?.path });
    check("groq: max_tokens limitado a 4096", seen[0].body.max_tokens === 4096, seen[0].body.max_tokens);
    check("groq: texto completo", text === PT_ANSWER);
  }
  process.env.GROQ_MODE = "rate";
  reset("fast-model", { groqKeyEnc: "gsk_teste", groqKeyMode: "plain" });
  {
    let text = "";
    let label = "";
    await ai.stream(ask, (d) => (text += d), undefined, 8192, { onModel: (l) => (label = l) });
    check("groq 429: NVIDIA assume", text === PT_ANSWER && label.includes("NVIDIA"), label);
    check("groq 429: escolha salva intacta", store.app.ai.groqModel === undefined && store.app.ai.model === "fast-model");
  }
  delete process.env.GROQ_MODE;
  reset("fast-model", { groqKeyEnc: "gsk_teste", groqKeyMode: "plain", primary: "nvidia" });
  {
    let label = "";
    await ai.stream(ask, () => undefined, undefined, 8192, { onModel: (l) => (label = l) });
    check("ordem: Dono escolheu NVIDIA primeiro", label.includes("NVIDIA"), label);
  }

  // 7) Nuvem: uma cópia mais antiga não desfaz a escolha; uma mais nova vale.
  reset("fast-model", { changedAt: "2026-10-05T00:00:00.000Z" });
  ai.applyCloud({ model: "auto", apiKey: "nvapi-teste", changedAt: "2026-10-01T00:00:00.000Z" });
  check("nuvem: versão antiga não troca o modelo", store.app.ai.model === "fast-model", store.app.ai.model);
  ai.applyCloud({ model: "long-model", apiKey: "nvapi-teste", groqKey: "gsk_nova", changedAt: "2026-10-06T00:00:00.000Z" });
  check("nuvem: versão nova é aplicada", store.app.ai.model === "long-model" && store.app.ai.groqKeyEnc === "gsk_nova", store.app.ai);
  check("nuvem: guarda a data da versão aplicada", store.app.ai.changedAt === "2026-10-06T00:00:00.000Z", store.app.ai.changedAt);
  reset("fast-model", { changedAt: "2026-10-05T00:00:00.000Z", apiKeyEnc: undefined });
  ai.applyCloud({ model: "auto", apiKey: "nvapi-recuperada", changedAt: "2026-10-01T00:00:00.000Z" });
  check("nuvem: versão antiga ainda recupera a chave perdida", store.app.ai.apiKeyEnc === "nvapi-recuperada" && store.app.ai.model === "fast-model", store.app.ai);
  const v = ai.version;
  ai.setConfig({ model: "slow-model" });
  check("config: mudança local marca versão e data", ai.version === v + 1 && store.app.ai.changedAt > "2026-10-05", store.app.ai.changedAt);

  // 8) Funções puras.
  check("join: remove a repetição", joinContinuation("abc de bancos sólidos com ve", "bancos sólidos com vencimento") === "ncimento");
  check("join: sem repetição, emenda direto no meio da palavra", joinContinuation("investi", "mento mensal") === "mento mensal");
  check("join: título começa em parágrafo novo", joinContinuation("fim do texto.", "## Fase 2") === "\n\n## Fase 2", joinContinuation("fim do texto.", "## Fase 2"));
  check("join: frase nova ganha espaço", joinContinuation("Fim da frase", "Outra frase") === " Outra frase");
  check("inglês: detecta", looksEnglish(EN_ANSWER.slice(0, 200)));
  check("inglês: português não é inglês", !looksEnglish(PT_ANSWER.slice(0, 200)));
  check("inglês: e-mail em inglês pedido pelo usuário é liberado", wantsOtherLanguage("Escreva um e-mail em inglês pedindo aumento"));
  check("inglês: pergunta em português força português", !wantsOtherLanguage("Como eu faço para investir R$ 200 por mês?"));
  check("inglês: termos em inglês numa resposta em português", !looksEnglish("O ETF (Exchange Traded Fund) é um fundo de índice. O stop loss é uma ordem para vender se o preço cair. Day trade não é para iniciantes."));

  server.close();
  console.log(failures ? `\n${failures} verificação(ões) falharam` : "\nTudo certo");
  process.exit(failures ? 1 : 0);
}

void main();
