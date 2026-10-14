// Teste da tela do Assistente no app Electron com um servidor de IA falso
// (streaming SSE): resposta aos poucos, parar, trocar de conversa no meio,
// apagar pergunta e resposta, continuação de resposta longa, histórico,
// limpar chat, escolha de modelo e Groq fora do ar.
// Rodar depois de "npm run build":
//   xvfb-run -a -s "-screen 0 1440x900x24" node scripts/e2e-ai.mjs
import { _electron as electron } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.env.SHOTS || path.join(root, "e2e-shots", "assistente");
fs.mkdirSync(shots, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "investa-ai-ui-"));

const PT =
  "Claro! Aqui vai um plano simples para você começar a investir com segurança. Primeiro, monte a sua **reserva de emergência** no Tesouro Selic ou num CDB com liquidez diária. Depois, defina quanto pode guardar por mês e automatize esse valor no dia do salário.\n\n| Opção | Rende | Liquidez |\n|---|---|---|\n| Tesouro Selic | 100% da Selic | Diária |\n| CDB liquidez diária | 100% do CDI | Diária |\n| Poupança | 70% da Selic | Diária |\n\nPor fim, com a reserva pronta, comece a diversificar aos poucos.";
const LONG_FULL = `## Plano completo\n\n${Array.from({ length: 30 }, (_, i) => `${i + 1}. **Passo ${i + 1}**: guarde um pouco por mês e acompanhe a evolução do seu patrimônio com calma.`).join("\n")}\n\nFim do plano.`;
const CUT = LONG_FULL.indexOf("**Passo 18**") + 5;

const requests = [];
const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: ["fast-model", "slow-model", "long-model"].map((id) => ({ id })) }));
      return;
    }
    const body = JSON.parse(raw || "{}");
    requests.push(body.model);
    const last = body.messages.at(-1)?.content ?? "";
    let text = PT;
    let finish = "stop";
    let delay = 25;
    if (body.model === "slow-model") {
      text = PT.repeat(4);
      delay = 120;
    }
    if (body.model === "long-model") {
      if (last.startsWith("Sua resposta foi cortada")) text = LONG_FULL.slice(CUT - 20);
      else [text, finish] = [LONG_FULL.slice(0, CUT), "length"];
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    let i = 0;
    let closed = false;
    res.on("close", () => (closed = true));
    const tick = () => {
      if (closed) return;
      if (i < text.length) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 14) } }] })}\n\n`);
        i += 14;
        setTimeout(tick, delay);
        return;
      }
      res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`);
      res.end();
    };
    tick();
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const mock = `http://127.0.0.1:${server.address().port}/v1`;

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "OK  " : "FALHOU"} ${name}${!ok && detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failures++;
};

const exe = createRequire(import.meta.url)("electron");
const app = await electron.launch({ executablePath: exe, args: [root, "--no-sandbox", "--disable-gpu"], env: { ...process.env, INVESTA_USER_DATA: dataDir } });
const win = await app.firstWindow();
const pageErrors = [];
win.on("pageerror", (e) => pageErrors.push(e.message));
const wait = (ms) => win.waitForTimeout(ms);
const invoke = (channel, args) => win.evaluate(([c, a]) => window.investa.invoke(c, a), [channel, args]);

await wait(2000);
await win.click("text=Criar agora");
await wait(400);
await win.fill('input[placeholder="Como você se chama?"]', "Teste Investa");
await win.fill('input[placeholder="ex.: bruno.silva"]', "Teste");
await win.fill('input[placeholder="Mínimo de 6 caracteres"]', "Senha123!");
await win.fill('input[placeholder="Repita a senha"]', "Senha123!");
await win.click("button[type=submit]");
await wait(1800);
const money = win.locator('input[inputmode="decimal"]');
await win.click("text=Começar");
await wait(400);
await money.nth(0).fill("6500");
await win.click("text=Continuar");
await wait(400);
await money.nth(0).fill("3000");
await money.nth(1).fill("1500");
await win.click("text=Continuar");
await wait(400);
await money.nth(0).fill("1500");
await money.nth(1).fill("5000");
await win.click("text=Continuar");
await wait(400);
await win.click("text=Esperaria o preço se recuperar");
await win.click("text=Entre 2 e 5 anos");
await win.click("text=Equilíbrio entre segurança e retorno");
await win.click("text=Continuar");
await wait(400);
await win.click("text=Aprender a investir");
await win.click("text=Continuar");
await wait(400);
await win.click("text=Entrar no Investa");
await wait(2000);

const cfg = await invoke("ai:setConfig", { apiKey: "nvapi-teste", baseUrl: mock, model: "fast-model" });
check("config: Dono salvou a chave e o modelo", cfg.ok && cfg.data.choice === "fast-model", cfg);

await win.evaluate(() => (location.hash = "#/assistente"));
await wait(1500);
await win.getByRole("button", { name: "Conversa livre" }).click();
await wait(300);
const box = win.locator("textarea");
const assistantText = () =>
  win.evaluate(() => {
    const list = [...document.querySelectorAll(".prose-investa")];
    return list.at(-1)?.textContent ?? "";
  });

// 1) Streaming aparece aos poucos na tela.
await box.fill("Como começo a investir?");
await box.press("Enter");
const sizes = [];
for (let i = 0; i < 12; i++) {
  await wait(150);
  sizes.push((await assistantText()).length);
}
await wait(2500);
const final1 = await assistantText();
check("streaming: texto cresce aos poucos na tela", new Set(sizes.filter((n) => n > 0)).size >= 3, sizes);
check("streaming: resposta completa (com tabela)", final1.includes("Por fim, com a reserva pronta") && (await win.locator(".prose-investa table").count()) === 1);
check("streaming: tabela rola de lado dentro da bolha", await win.evaluate(() => getComputedStyle(document.querySelector(".prose-investa table").parentElement).overflowX === "auto"));
await win.screenshot({ path: path.join(shots, "1-resposta.png") });

// 2) Parar: para na hora, sem "Pensando…" e sem texto chegando depois.
await invoke("ai:setConfig", { model: "slow-model" });
await box.fill("Me explique a reserva de emergência");
await box.press("Enter");
await wait(2600);
await win.getByRole("button", { name: "Parar resposta" }).click();
await wait(250);
const afterStop = await assistantText();
const sendVisible = await win.getByRole("button", { name: "Enviar" }).isVisible();
await wait(1500);
check("parar: botão volta a ser Enviar na hora", sendVisible);
check("parar: nenhum texto chega depois de parar", afterStop.length > 0 && (await assistantText()) === afterStop, { a: afterStop.length });
check("parar: sem 'Pensando…' sobrando", (await win.locator("text=Pensando…").count()) === 0);
const logs = await invoke("ai:logs");
check("parar: backend registrou o cancelamento", logs.ok && logs.data.some((l) => l.kind === "cancelado"), logs.data?.slice(0, 3));

// 3) Trocar de conversa (modo) no meio cancela a resposta anterior.
await box.fill("Outra pergunta demorada");
await box.press("Enter");
await wait(2600);
const reqBefore = requests.length;
await win.getByRole("button", { name: "Professor" }).click();
await wait(1500);
check("trocar de modo: tela do Professor sem resposta pendurada", (await win.locator("text=Pensando…").count()) === 0 && (await win.getByRole("button", { name: "Enviar" }).count()) === 1);
await win.getByRole("button", { name: "Conversa livre" }).click();
await wait(800);
check("trocar de modo: resposta anterior guardada como interrompida", (await win.locator("text=Resposta interrompida.").count()) >= 1);
check("trocar de modo: nenhum pedido novo foi feito", requests.length === reqBefore, { before: reqBefore, after: requests.length });
const logs2 = await invoke("ai:logs");
check("trocar de modo: backend cancelou", logs2.data.filter((l) => l.kind === "cancelado").length >= 2);

// 4) Apagar uma pergunta junto com a resposta.
const countMsgs = () => win.evaluate(() => document.querySelectorAll(".space-y-5 > div").length);
const before = await countMsgs();
await win.locator(".space-y-5 > div").first().hover();
await win.getByRole("button", { name: "Apagar pergunta e resposta" }).first().click();
await wait(500);
check("apagar: pergunta e resposta saem juntas", (await countMsgs()) === before - 2, { before, after: await countMsgs() });

// 5) Resposta longa cortada pelo limite: continua sozinha na mesma mensagem.
await invoke("ai:setConfig", { model: "long-model" });
await box.fill("Monte um plano completo");
await box.press("Enter");
await wait(600);
await win.waitForFunction(() => !document.querySelector('button[aria-label="Parar resposta"]'), null, { timeout: 30000 });
await wait(800);
const longText = await assistantText();
check("continuação: plano chega inteiro na mesma bolha", longText.includes("Passo 30") && longText.includes("Fim do plano.") && !/Passo 18.*Passo 18/s.test(longText), longText.slice(-120));
check("continuação: bolha sem corte (sem altura máxima)", await win.evaluate(() => {
  const el = [...document.querySelectorAll(".prose-investa")].at(-1);
  const box = el.parentElement;
  return box.scrollHeight <= box.clientHeight + 1 && getComputedStyle(box).maxHeight === "none";
}));
await win.screenshot({ path: path.join(shots, "2-plano-longo.png") });

// 6) Nova conversa + histórico.
const settings = await invoke("ai:info");
check("escolha salva continua a do Dono", settings.data.choice === "long-model", settings.data.choice);
await win.getByRole("button", { name: "Nova conversa" }).click();
await wait(500);
check("nova conversa: começa vazia", (await countMsgs()) === 0);
await win.getByRole("button", { name: "Conversas" }).click();
await wait(600);
await win.screenshot({ path: path.join(shots, "3-historico.png") });
await win.locator("text=Me explique a reserva de emergência").first().click();
await wait(700);
check("histórico: reabre a conversa anterior", (await countMsgs()) > 0);

// 7) Limpar chat com confirmação.
await win.getByRole("button", { name: "Limpar chat" }).click();
await wait(500);
await win.getByRole("button", { name: "Limpar", exact: true }).click();
await wait(600);
check("limpar chat: conversa vazia", (await countMsgs()) === 0);

// 8) Configurações: escolher um modelo salva na hora e não volta sozinho.
await win.evaluate(() => (location.hash = "#/configuracoes?secao=ia"));
await wait(2500);
await win.getByRole("button", { name: /^Fast Model/ }).click();
await wait(1200);
const info3 = await invoke("ai:info");
check("configurações: clicar no modelo salva na hora", info3.data.choice === "fast-model", info3.data.choice);
await win.screenshot({ path: path.join(shots, "4-config-ia.png"), fullPage: true });

// 8b) Groq ligada (aqui sem acesso à Groq): a NVIDIA responde e a escolha não muda.
await invoke("ai:setConfig", { groqKey: "gsk_teste_invalida" });
await win.evaluate(() => (location.hash = "#/assistente"));
await wait(6000);
await win.evaluate(() => (location.hash = "#/configuracoes?secao=ia"));
await wait(2500);
await win.screenshot({ path: path.join(shots, "4b-config-groq.png"), fullPage: true });
await win.evaluate(() => (location.hash = "#/assistente"));
await wait(1200);
await box.fill("Teste com a Groq fora do ar");
await box.press("Enter");
await wait(600);
await win.waitForFunction(() => !document.querySelector('button[aria-label="Parar resposta"]'), null, { timeout: 60000 });
await wait(600);
const footer = await win.evaluate(() => [...document.querySelectorAll(".space-y-5 > div")].at(-1)?.textContent ?? "");
check("groq ligada: cabeçalho mostra a Groq primeiro", (await win.locator("text=Llama 3.3 70B · Groq").count()) >= 1);
check("groq fora do ar: NVIDIA responde", (await assistantText()).includes("Por fim") && footer.includes("NVIDIA"), footer.slice(0, 200));
const info4 = await invoke("ai:info");
check("groq fora do ar: escolhas salvas intactas", info4.data.choice === "fast-model" && info4.data.groqChoice === "auto" && info4.data.primary === "groq", info4.data);
await win.screenshot({ path: path.join(shots, "4c-resposta-reserva.png") });

// 9) Celular: tela estreita, bolhas inteiras.
await win.setViewportSize({ width: 390, height: 800 });
await win.evaluate(() => (location.hash = "#/assistente"));
await wait(1200);
await box.fill("Como começo a investir?");
await box.press("Enter");
await wait(600);
await win.waitForFunction(() => !document.querySelector('button[aria-label="Parar resposta"]'), null, { timeout: 20000 });
await wait(600);
check("celular: nada passa da largura da tela", await win.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await win.screenshot({ path: path.join(shots, "5-celular.png") });

check("sem erros de página", pageErrors.length === 0, pageErrors);
await app.close();
server.close();
console.log(failures ? `\n${failures} verificação(ões) falharam` : "\nTudo certo");
process.exit(failures ? 1 : 0);
