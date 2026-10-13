/* eslint-disable @typescript-eslint/no-explicit-any */
// Groq de ponta a ponta contra um servidor falso tão rígido quanto o real:
// recusa campos desconhecidos (400), exige "Bearer gsk_…" válida (401) e
// modelos que existem na conta (404). Prova: salvar a chave (com e sem a da
// NVIDIA), o botão de teste, Groq primeiro, reserva nos dois sentidos, nuvem
// sem apagar chaves, e os caminhos de rede do PC e do celular.
// Rodar com: node scripts/test-groq.mjs
import http from "node:http";
import type { AddressInfo } from "node:net";
import { AiService, fillAiKeys, mergeAiCloud } from "../core/ai";
import { fallbackFetch, setStreamFetch } from "../core/http";
import { createStreamFetch } from "../src/mobile/streamFetch";

const ANSWER = "Claro! Para começar, monte a sua reserva de emergência no Tesouro Selic e depois invista um pouco todo mês, sem pressa e com calma.";
const VALID = new Set(["gsk_valida_123", "gsk_outra_456"]);
const GROQ_IDS = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3-32b", "llama-3.1-8b-instant", "whisper-large-v3", "meta-llama/llama-guard-4-12b"];
const MAX_OUT: Record<string, number> = { "llama-3.3-70b-versatile": 32768, "llama-3.1-8b-instant": 131072, "openai/gpt-oss-120b": 65536, "openai/gpt-oss-20b": 65536, "qwen/qwen3-32b": 40960 };
const ALLOWED = new Set([
  "model", "messages", "temperature", "top_p", "max_tokens", "max_completion_tokens", "stream", "stream_options", "stop", "seed", "n", "user",
  "response_format", "tools", "tool_choice", "parallel_tool_calls", "frequency_penalty", "presence_penalty", "reasoning_effort", "reasoning_format", "include_reasoning", "service_tier",
]);

let groqMode: "ok" | "500" = "ok";
let nvMode: "ok" | "down" = "ok";
const hits: { path: string; model?: string; body?: any; status: number }[] = [];

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
const groqError = (res: http.ServerResponse, status: number, message: string, code?: string) =>
  sendJson(res, status, { error: { message, type: "invalid_request_error", ...(code ? { code } : {}) } });

function sse(res: http.ServerResponse, text: string) {
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  for (let i = 0; i < text.length; i += 24) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 24) }, finish_reason: null }], x_groq: {} })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`);
  res.end("data: [DONE]\n\n");
}

function groq(req: http.IncomingMessage, res: http.ServerResponse, raw: string) {
  const path = req.url!.slice("/groq".length);
  const auth = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ""))?.[1];
  const rec = { path: req.url!, status: 0 } as (typeof hits)[number];
  hits.push(rec);
  const fail = (status: number, msg: string, code?: string) => {
    rec.status = status;
    groqError(res, status, msg, code);
  };
  if (!auth || !VALID.has(auth)) return fail(401, "Invalid API Key", "invalid_api_key");
  if (req.method === "GET" && path === "/models") {
    rec.status = 200;
    return sendJson(res, 200, { object: "list", data: GROQ_IDS.map((id) => ({ id, object: "model", owned_by: "x", active: true })) });
  }
  if (req.method !== "POST" || path !== "/chat/completions") return fail(404, "Unknown request URL", "unknown_url");
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "We could not parse the JSON body of your request.");
  }
  rec.body = body;
  rec.model = body.model;
  for (const k of Object.keys(body)) if (!ALLOWED.has(k)) return fail(400, `'${k}' : property '${k}' is unsupported`);
  if (!GROQ_IDS.includes(body.model)) return fail(404, `The model \`${body.model}\` does not exist or you do not have access to it.`, "model_not_found");
  if (body.reasoning_effort !== undefined) {
    const ok = /gpt-oss/.test(body.model) ? ["low", "medium", "high"] : /qwen3/.test(body.model) ? ["none", "default"] : [];
    if (!ok.includes(body.reasoning_effort)) return fail(400, "`reasoning_effort` is not supported with this model");
  }
  if (body.max_tokens > (MAX_OUT[body.model] ?? 8192)) return fail(400, `max_tokens must be less than or equal to ${MAX_OUT[body.model]}`);
  if (!Array.isArray(body.messages) || body.messages.some((m: any) => !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string")) return fail(400, "messages: invalid");
  if (groqMode === "500") return fail(500, "Internal Server Error");
  rec.status = 200;
  sse(res, ANSWER);
}

function nvidia(req: http.IncomingMessage, res: http.ServerResponse, raw: string) {
  const rec = { path: req.url!, status: 0 } as (typeof hits)[number];
  hits.push(rec);
  if (req.headers.authorization !== "Bearer nvapi-teste") {
    rec.status = 401;
    return sendJson(res, 401, { status: 401, title: "Unauthorized" });
  }
  if (req.method === "GET") {
    rec.status = 200;
    return sendJson(res, 200, { data: [{ id: "nv-model" }] });
  }
  const body = JSON.parse(raw);
  rec.body = body;
  rec.model = body.model;
  if (nvMode === "down") {
    rec.status = 503;
    return sendJson(res, 503, { detail: "Service Unavailable" });
  }
  rec.status = 200;
  sse(res, ANSWER);
}

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => (req.url!.startsWith("/groq") ? groq(req, res, raw) : nvidia(req, res, raw)));
});

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "OK  " : "FALHOU"} ${name}${!ok && detail !== undefined ? ` → ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
}
async function rejects(p: Promise<unknown>): Promise<any> {
  try {
    await p;
    return null;
  } catch (err) {
    return err;
  }
}

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const realFetch = globalThis.fetch;
  const redirect = (url: string | URL | Request) => String(url).replace("https://api.groq.com/openai/v1", `${base}/groq`);
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => realFetch(redirect(url), init)) as typeof fetch;

  const store = { app: {} as Record<string, any>, save() {} };
  const platform = { secrets: { encrypt: (p: string) => ({ data: p, mode: "plain" as const }), decrypt: (d: string) => d }, aiFileConfig: () => null };
  const ai = new AiService(store as any, platform as any);
  const reset = (extra: Record<string, unknown> = {}) => {
    store.app.ai = { apiKeyEnc: "nvapi-teste", keyMode: "plain", baseUrl: `${base}/nv`, model: "nv-model", catalog: { ids: ["nv-model"], updatedAt: new Date().toISOString() }, ...extra };
    store.app.aiLog = [];
    hits.length = 0;
    groqMode = "ok";
    nvMode = "ok";
  };
  const ask = [
    { role: "system" as const, content: "Você é o Assistente." },
    { role: "user" as const, content: "Como começo a investir?" },
  ];
  const chat = async () => {
    let text = "";
    let label = "";
    await ai.stream(ask, (d) => (text += d), undefined, 8192, { onModel: (l) => (label = l) });
    return { text, label };
  };

  // 1) Chave errada: o teste diz claramente e não salva nada.
  reset();
  {
    const err = await rejects(ai.test("groq", "gsk_errada"));
    check("teste: chave errada dá AI_AUTH", err?.code === "AI_AUTH", err?.code);
    check("teste: log mostra 'Groq: 401 Invalid API Key'", store.app.aiLog[0]?.message === "Groq: 401 Invalid API Key", store.app.aiLog[0]);
    check("teste: info mostra o erro da Groq", ai.info(true).providers?.groq?.error?.message === "Groq: 401 Invalid API Key");
  }

  // 2) Chave certa com a NVIDIA já salva; restos de falhas antigas não atrapalham.
  reset({ retired: ["groq:llama-3.3-70b-versatile", "groq:moonshotai/kimi-k2-instruct-0905", "groq:openai/gpt-oss-120b"], cooldown: { "groq:qwen/qwen3-32b": Date.now() + 60_000 } });
  {
    const r = await ai.test("groq", " gsk_valida_123 ");
    check("teste: chave certa responde com a Groq", /Conexão OK|Claro/.test(r) && r.includes("Llama 3.3 70B · Groq"), r);
    check("teste: buscou a lista de modelos com a chave nova", hits[0]?.path === "/groq/models" && hits[0].status === 200, hits[0]);
    check("teste: corpo aceito pela Groq rígida", hits.every((h) => h.status === 200), hits);
    ai.setConfig({ groqKey: "gsk_valida_123" });
    check("salvar Groq: chave da NVIDIA continua", store.app.ai.apiKeyEnc === "nvapi-teste" && store.app.ai.groqKeyEnc === "gsk_valida_123", store.app.ai);
    check("salvar Groq: falhas da chave antiga limpas", !(store.app.ai.retired ?? []).some((id: string) => id.startsWith("groq:")) && !Object.keys(store.app.ai.cooldown ?? {}).some((id) => id.startsWith("groq:")));
    const up = ai.cloudConfig({ groqKey: "gsk_valida_123" });
    check("salvar Groq: nuvem recebe só a Groq", up.groqKey === "gsk_valida_123" && !("apiKey" in up) && !("model" in up), up);
    ai.setConfig({ apiKey: "nvapi-teste" });
    check("salvar NVIDIA: chave da Groq continua", store.app.ai.groqKeyEnc === "gsk_valida_123");
    const info = ai.info(true);
    check("info: Groq e NVIDIA ligadas, Groq primeiro", !!info.hasGroq && !!info.hasNvidia && info.primary === "groq" && /Groq/.test(info.modelLabel ?? ""), info);
  }

  // 3) Conversa: Groq primeiro, com corpo que a Groq aceita.
  reset({ groqKeyEnc: "gsk_valida_123", groqKeyMode: "plain" });
  {
    const { text, label } = await chat();
    const first = hits.find((h) => h.body);
    check("chat: Groq responde primeiro", text === ANSWER && label.includes("Groq") && first?.path === "/groq/chat/completions", { label, first });
    check("chat: max_tokens da Groq dentro do limite", first?.body.max_tokens === 4096);
    check("chat: sem campos da NVIDIA no pedido da Groq", !("chat_template_kwargs" in first!.body) && !("top_k" in first!.body));
  }

  // 4) Modelos da conta: os que a Groq não lista ficam de fora; os novos entram.
  reset({ groqKeyEnc: "gsk_valida_123", groqKeyMode: "plain" });
  {
    const cat = await ai.catalog(true);
    const ids = (cat.groq ?? []).map((m) => m.id);
    check("lista: só modelos que existem na conta", ids[0] === "llama-3.3-70b-versatile" && !ids.includes("moonshotai/kimi-k2-instruct-0905") && !ids.some((i) => /whisper|guard/.test(i)), ids);
    ai.setConfig({ groqModel: "qwen/qwen3-32b" });
    hits.length = 0;
    const { label } = await chat();
    const first = hits.find((h) => h.body);
    check("chat: Qwen3 com reasoning_effort aceito", label.includes("Qwen3") && first?.body.reasoning_effort === "none" && first.status === 200, first);
    ai.setConfig({ groqModel: "openai/gpt-oss-120b" });
    hits.length = 0;
    await chat();
    const gpt = hits.find((h) => h.body);
    check("chat: GPT-OSS com reasoning_effort low aceito", gpt?.body.reasoning_effort === "low" && gpt.status === 200, gpt);
  }

  // 5) Groq fora do ar: a NVIDIA responde e o Dono vê o motivo.
  reset({ groqKeyEnc: "gsk_valida_123", groqKeyMode: "plain" });
  groqMode = "500";
  {
    const { text, label } = await chat();
    check("reserva: Groq 500 → NVIDIA responde", text === ANSWER && label.includes("NVIDIA"), label);
    const err = store.app.aiLog.find((l: any) => l.kind === "erro");
    check("reserva: log 'Groq: 500 Internal Server Error'", err?.message === "Groq: 500 Internal Server Error" && err.status === 500, err);
    check("reserva: log da troca", store.app.aiLog.some((l: any) => l.kind === "troca"));
    const h = ai.info(true).providers;
    check("info: último erro da Groq e resposta da NVIDIA", !!h?.groq?.error && !!h?.nvidia?.okAt, h);
  }

  // 6) Chave da Groq revogada no meio do uso: NVIDIA assume, o erro aparece.
  reset({ groqKeyEnc: "gsk_revogada", groqKeyMode: "plain" });
  {
    const { label } = await chat();
    check("reserva: Groq 401 → NVIDIA, sem tentar outros modelos da Groq", label.includes("NVIDIA") && hits.filter((h) => h.path.startsWith("/groq/chat")).length === 1, hits);
    check("reserva: log 'Groq: 401 Invalid API Key'", store.app.aiLog.some((l: any) => l.message === "Groq: 401 Invalid API Key"));
  }

  // 7) NVIDIA primeiro e fora do ar: a Groq responde.
  reset({ groqKeyEnc: "gsk_valida_123", groqKeyMode: "plain", primary: "nvidia" });
  nvMode = "down";
  {
    const { text, label } = await chat();
    check("reserva: NVIDIA 503 → Groq responde", text === ANSWER && label.includes("Groq") && hits.find((h) => h.body)?.path.startsWith("/nv"), { label, hits });
    check("reserva: log 'NVIDIA: 503 Service Unavailable'", store.app.aiLog.some((l: any) => l.message === "NVIDIA: 503 Service Unavailable"));
  }

  // 8) Nuvem: salvar a NVIDIA num aparelho que ainda não recebeu a Groq não apaga a Groq.
  {
    reset({ changedAt: "2026-10-01T00:00:00.000Z" });
    const pc = new AiService({ app: { ai: { groqKeyEnc: "gsk_valida_123", groqKeyMode: "plain", changedAt: "2026-10-02T00:00:00.000Z" } }, save() {} } as any, platform as any);
    let cloud = mergeAiCloud(null, pc.cloudConfig());
    ai.setConfig({ apiKey: "nvapi-teste" }); // o celular ainda não sincronizou
    cloud = mergeAiCloud(cloud, ai.cloudConfig({ apiKey: "nvapi-teste" }));
    check("nuvem: Groq continua depois de salvar a NVIDIA em outro aparelho", cloud.groqKey === "gsk_valida_123" && cloud.apiKey === "nvapi-teste", cloud);
    pc.applyCloud(cloud);
    check("nuvem: o PC continua com a Groq e recebe a NVIDIA", (pc as any).store.app.ai.groqKeyEnc === "gsk_valida_123" && (pc as any).store.app.ai.apiKeyEnc === "nvapi-teste");
    const removed = mergeAiCloud(cloud, ai.cloudConfig({ groqKey: null }));
    check("nuvem: remover a Groq de propósito apaga da nuvem", removed.groqKey === null && removed.apiKey === "nvapi-teste", removed);
    const filled = fillAiKeys({ apiKey: "nvapi-teste", changedAt: "2026-10-03T00:00:00.000Z" }, { groqKey: "gsk_valida_123", apiKey: null });
    check("nuvem: completa só a chave que falta", filled?.groqKey === "gsk_valida_123" && filled.apiKey === "nvapi-teste" && filled.changedAt === "2026-10-03T00:00:00.000Z", filled);
    const fileKeyed = new AiService({ app: { ai: {} }, save() {} } as any, { ...platform, aiFileConfig: () => ({ groqApiKey: "gsk_do_arquivo" }) } as any);
    check("nuvem: chave do arquivo não sobe nem apaga a dos outros", fileKeyed.cloudConfig().groqKey === undefined && fileKeyed.info(true).hasGroq === true);
  }

  // 9) PC: se a rede do Node falhar (proxy, antivírus), tenta pela do Chromium.
  {
    let backupUsed = 0;
    const backup = (u: string, i: RequestInit) => (backupUsed++, realFetch(redirect(u), i));
    const broken = async () => {
      throw new TypeError("fetch failed");
    };
    setStreamFetch(fallbackFetch(broken, backup));
    reset({ groqKeyEnc: "gsk_valida_123", groqKeyMode: "plain" });
    const { label } = await chat();
    check("PC: rede do Node falhou → Chromium, Groq responde", label.includes("Groq") && backupUsed > 0, { label, backupUsed });
    backupUsed = 0;
    const html403 = async () => new Response("<html>Attention Required! | Cloudflare</html>", { status: 403, headers: { "content-type": "text/html" } });
    setStreamFetch(fallbackFetch(html403, backup));
    hits.length = 0;
    const r2 = await chat();
    check("PC: 403 do firewall → Chromium", r2.label.includes("Groq") && backupUsed > 0);
  }

  // 10) Celular: o WebView bloqueia (CORS) → rede nativa, sem streaming; reserva igual.
  {
    let nativeCalls = 0;
    const native = async (req: { url: string; method: string; headers: Record<string, string>; data?: unknown }) => {
      nativeCalls++;
      const res = await realFetch(redirect(req.url), { method: req.method, headers: req.headers, body: req.data === undefined ? undefined : JSON.stringify(req.data) });
      return { status: res.status, data: await res.text(), headers: Object.fromEntries(res.headers.entries()) };
    };
    const corsBlocked = async () => {
      throw new TypeError("Failed to fetch");
    };
    const mobile = createStreamFetch(corsBlocked, native);
    setStreamFetch(mobile.fetch, mobile.buffered);
    reset({ groqKeyEnc: "gsk_valida_123", groqKeyMode: "plain" });
    const { text, label } = await chat();
    check("celular: WebView bloqueado → rede nativa, Groq responde", text === ANSWER && label.includes("Groq") && nativeCalls > 0, { label, nativeCalls });
    check("celular: pedido nativo aceito pela Groq rígida", hits.filter((h) => h.body).every((h) => h.status === 200), hits);
    const t = await ai.test("groq", "gsk_outra_456");
    check("celular: teste da chave nova", t.includes("Groq"), t);
    const bad = await rejects(ai.test("groq", "gsk_errada"));
    check("celular: chave errada dá AI_AUTH", bad?.code === "AI_AUTH");
    groqMode = "500";
    const r = await chat();
    check("celular: Groq 500 → NVIDIA responde", r.label.includes("NVIDIA") && r.text === ANSWER, r.label);

    const streaming = createStreamFetch((u, i) => realFetch(redirect(u), i), native);
    setStreamFetch(streaming.fetch, streaming.buffered);
    reset({ groqKeyEnc: "gsk_valida_123", groqKeyMode: "plain" });
    nativeCalls = 0;
    const s = await chat();
    check("celular: WebView aceito → streaming, sem rede nativa", s.label.includes("Groq") && nativeCalls === 0 && !streaming.buffered("https://api.groq.com/openai/v1/chat/completions"));
  }

  server.close();
  console.log(failures ? `\n${failures} verificação(ões) falharam` : "\nTudo certo");
  process.exit(failures ? 1 : 0);
}

void main();
