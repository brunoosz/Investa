// Teste de ponta a ponta: abre o app Electron, cria conta, preenche o perfil,
// cadastra investimentos e percorre todas as telas, registrando erros e prints.
import { _electron as electron } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.env.SHOTS || path.join(root, "e2e-shots");
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "investa-e2e-"));
fs.mkdirSync(shots, { recursive: true });

// O pacote electron baixa o binário na primeira vez em que é requisitado.
const exe = createRequire(import.meta.url)("electron");
const app = await electron.launch({
  executablePath: exe,
  args: [root, "--no-sandbox", "--disable-gpu"],
  env: { ...process.env, INVESTA_USER_DATA: dataDir },
});

const consoleErrors = [];
const pageErrors = [];
const win = await app.firstWindow();
win.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
win.on("pageerror", (e) => pageErrors.push(e.message));

const wait = (ms) => win.waitForTimeout(ms);
const shot = async (name) => {
  await wait(600);
  await win.screenshot({ path: path.join(shots, `${name}.png`) });
};
const report = async (name) => {
  const info = await win.evaluate(() => {
    const text = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.trim()).filter(Boolean);
    return {
      errors: text('[role="alert"], .text-danger').slice(0, 5),
      skeletons: document.querySelectorAll(".skeleton").length,
      charts: document.querySelectorAll("canvas").length,
      heading: document.querySelector("h1")?.textContent?.trim(),
      values: [...document.querySelectorAll("main .tabular")].map((e) => e.textContent.trim()).filter(Boolean).slice(0, 8),
    };
  });
  console.log(`[${name}] ${JSON.stringify(info)}`);
};
const go = async (route, name, waitMs = 4000) => {
  await win.evaluate((r) => {
    location.hash = `#/${r}`;
  }, route);
  await wait(waitMs);
  await report(name);
  await shot(name);
};

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
await wait(2500);

// Carteira: uma ação e um CDB
await go("", "inicio-sem-investimentos", 2500);
await go("carteira", "carteira-vazia", 1500);
await win.click("text=Adicionar o primeiro");
await wait(500);
await win.fill('input[placeholder="Buscar ação, FII, ETF, cripto…"]', "PETR4");
await wait(2500);
await win.locator("button", { hasText: "Petrobras PN" }).first().click();
await wait(2500);
await money.nth(0).fill("100");
await money.nth(1).fill("30");
await win.getByRole("button", { name: "Salvar", exact: true }).click();
await wait(800);
await win.getByRole("button", { name: "Adicionar investimento" }).first().click();
await wait(500);
await win.getByRole("button", { name: "Renda fixa", exact: true }).click();
await wait(300);
await money.nth(0).fill("5000");
await win.locator('input[type="date"]').fill("2026-01-05");
await win.getByRole("button", { name: "Salvar", exact: true }).click();
await wait(1500);

await go("", "inicio", 7000);
// Modo privacidade: borra só os valores pessoais; indicadores e cotações continuam visíveis.
{
  await win.getByRole("button", { name: "Esconder valores" }).click();
  await wait(500);
  const blur = await win.evaluate(() => {
    const blurred = (el) => {
      for (let a = el; a; a = a.parentElement) if (getComputedStyle(a).filter.includes("blur")) return true;
      return false;
    };
    const values = (title) => {
      const card = [...document.querySelectorAll("main .surface")].find((c) => c.textContent.includes(title));
      return card ? [...card.querySelectorAll("*")].filter((e) => !e.children.length && /\d/.test(e.textContent)) : [];
    };
    const mine = values("Seu patrimônio");
    const market = [...values("Indicadores hoje"), ...values("Ativos em destaque")];
    return { mine: mine.length > 0 && blurred(mine[0]), market: market.filter(blurred).map((e) => e.textContent.trim()) };
  });
  console.log(`[privacidade] patrimônio borrado: ${blur.mine ? "sim" : "NÃO"} · mercado borrado: ${blur.market.length ? blur.market.join(", ") : "nada"}`);
  if (!blur.mine) pageErrors.push("Modo privacidade não escondeu o patrimônio");
  if (blur.market.length) pageErrors.push(`Modo privacidade escondeu dados do mercado: ${blur.market.slice(0, 3).join(", ")}`);
  await shot("inicio-privacidade");
  await win.getByRole("button", { name: "Mostrar valores" }).click();
}
await go("carteira", "carteira", 4000);
await go("mercado", "mercado", 6000);
await win.getByRole("button", { name: "Ações", exact: true }).click();
await wait(5000);
await report("mercado-acoes");
await shot("mercado-acoes");
await win.getByRole("button", { name: "Tesouro Direto", exact: true }).click();
await wait(6000);
await report("mercado-tesouro");
await shot("mercado-tesouro");
await win.getByRole("button", { name: "Renda Fixa Bancária", exact: true }).click();
await wait(2000);
await shot("mercado-rendafixa");
await go("mercado/PETR4.SA", "ativo-petr4", 6000);
await win.getByRole("button", { name: "1A", exact: true }).click();
await wait(3000);
await shot("ativo-petr4-1a");
await go("mercado/BTC-USD", "ativo-btc", 6000);
await go("aulas", "aulas", 1500);
await go("assistente", "assistente", 1500);
await go("simulador", "simulador", 2500);
await go("vale-a-pena", "vale-a-pena", 1500);
await go("objetivos", "objetivos", 2500);
await go("gastos", "gastos", 1500);
// Saldo de conta, limite do cartão e entrada extra ("Recebi dinheiro") somando ao saldo sem mexer na renda.
{
  const dialog = win.getByRole("dialog");
  const money = async (testId) => {
    const t = (await win.getByTestId(testId).first().innerText()).replace(/\s/g, "");
    const n = Number(t.replace(/[^\d,-]/g, "").replace(",", "."));
    return t.includes("-") ? -Math.abs(n) : n;
  };
  await win.getByRole("button", { name: "Adicionar conta", exact: true }).click();
  await wait(400);
  await dialog.locator("select").first().selectOption("nubank");
  await dialog.locator('input[inputmode="decimal"]').nth(0).fill("2000");
  await dialog.locator('input[inputmode="decimal"]').nth(1).fill("1500");
  await wait(200);
  await dialog.getByPlaceholder("Ex.: 10").fill("12");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await wait(600);
  const limitOk = /Limite disponível no Nubank: R\$\s?1\.500,00 de R\$\s?1\.500,00/.test(await win.getByTestId("card-limits").innerText());
  console.log(`[gastos-limite] limite disponível: ${limitOk ? "sim" : "NÃO"}`);
  if (!limitOk) pageErrors.push("Limite do cartão não mostrou o disponível");
  const incomeBefore = await money("income-month");
  const availBefore = await money("available-month");
  await win.getByRole("button", { name: "Recebi dinheiro" }).click();
  await wait(400);
  await dialog.getByRole("button", { name: "Presente/família", exact: true }).click();
  await dialog.getByPlaceholder("Ex.: presente da vó no aniversário").fill("Presente dos tios");
  await dialog.locator('input[inputmode="decimal"]').first().fill("800");
  await dialog.getByRole("switch", { name: "Somar ao saldo da conta" }).click();
  await dialog.getByRole("button", { name: "Registrar" }).click();
  await wait(800);
  const ok = /R\$\s?2\.800,00/.test(await win.locator("main").innerText());
  console.log(`[gastos-contas] saldo somado: ${ok ? "sim" : "NÃO"}`);
  if (!ok) pageErrors.push("Saldo da conta não somou a entrada extra");
  const incomeAfter = await money("income-month");
  const availAfter = await money("available-month");
  const extrasOk = (await win.getByTestId("extras-month").innerText()).includes("Presente/família");
  console.log(`[gastos-renda] renda ${incomeBefore} → ${incomeAfter}, disponível ${availBefore} → ${availAfter}, extras à parte: ${extrasOk ? "sim" : "NÃO"}`);
  if (incomeAfter !== incomeBefore || availAfter !== availBefore) pageErrors.push("Entrada extra mudou a renda mensal ou o disponível");
  if (!extrasOk) pageErrors.push("Entrada extra não apareceu em Entradas extras do mês");
  await shot("gastos-contas");
  // Conta fixa: cadastrar e marcar como paga.
  await win.getByRole("button", { name: "Adicionar conta fixa", exact: true }).click();
  await wait(400);
  await dialog.getByPlaceholder("Ex.: Internet").fill("Internet");
  await dialog.locator('input[inputmode="decimal"]').first().fill("120");
  await dialog.getByPlaceholder("Ex.: 10").fill("15");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await wait(600);
  await win.getByRole("button", { name: "Paguei" }).first().click();
  await wait(800);
  const billOk = (await win.locator("main").innerText()).includes("Todas pagas");
  console.log(`[gastos-conta-fixa] paga: ${billOk ? "sim" : "NÃO"}`);
  if (!billOk) pageErrors.push("Conta fixa não ficou paga");
  await shot("gastos-conta-fixa");
  // Gasto obrigatório (Transporte público) tira do disponível.
  const availPre = await money("available-month");
  await win.getByRole("button", { name: "Adicionar conta fixa", exact: true }).click();
  await wait(400);
  await dialog.getByRole("button", { name: "Transporte público", exact: true }).click();
  await dialog.locator('input[inputmode="decimal"]').first().fill("150");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await wait(700);
  const availPost = await money("available-month");
  const mandOk = /Gastos obrigatórios do mês: R\$\s?150,00/.test(await win.getByTestId("mandatory-total").innerText());
  console.log(`[gastos-obrigatorio] disponível ${availPre} → ${availPost}, total obrigatório: ${mandOk ? "sim" : "NÃO"}`);
  if (Math.abs(availPre - 150 - availPost) > 0.01) pageErrors.push("Gasto obrigatório não tirou do disponível");
  if (!mandOk) pageErrors.push("Gastos obrigatórios do mês não apareceu");
  await shot("gastos-obrigatorio");
  // Gasto que vai vir.
  await win.getByRole("button", { name: "Adicionar gasto futuro", exact: true }).click();
  await wait(400);
  await dialog.getByPlaceholder("Ex.: material do projeto da faculdade").fill("Projeto da faculdade");
  await dialog.locator('input[inputmode="decimal"]').first().fill("600");
  await dialog.locator('input[type="date"]').fill(new Date(Date.now() + 75 * 86_400_000).toISOString().slice(0, 10));
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await wait(600);
  const plannedOk = /guardar R\$\s?[\d.,]+\/mês/.test(await win.locator("main").innerText());
  console.log(`[gastos-planejado] quanto guardar por mês: ${plannedOk ? "sim" : "NÃO"}`);
  if (!plannedOk) pageErrors.push("Gasto planejado não mostrou quanto guardar por mês");
  await shot("gastos-planejado");
}
await go("bancos", "bancos", 8000);
await win.getByRole("button", { name: "Juros de crédito", exact: true }).click();
await wait(2000);
await shot("bancos-credito");
await go("alertas", "alertas", 3000);
await go("usuarios", "usuarios", 1500);
// Caixinha com depósito automático (dia 1: o motor guarda o valor do mês na hora).
await go("objetivos", "objetivos-caixinha", 1200);
{
  const dialog = win.getByRole("dialog");
  await win.getByRole("button", { name: "Nova caixinha", exact: true }).click();
  await wait(400);
  await dialog.getByPlaceholder("Ex.: Viagem, Videogame novo, Reserva").fill("Viagem");
  await dialog.locator('input[inputmode="decimal"]').first().fill("100");
  await dialog.locator('input[inputmode="numeric"]').first().fill("1");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await wait(3500);
  const text = await win.locator("main").innerText();
  const boxOk = /R\$\s?100,00 guardados/.test(text);
  console.log(`[caixinha] depósito automático: ${boxOk ? "sim" : "NÃO"}`);
  if (!boxOk) pageErrors.push("Caixinha não guardou o valor do mês");
}
await go("plano", "plano", 2000);
await go("logs", "logs", 1200);
await go("configuracoes", "configuracoes", 1500);
// Memória do Assistente: adicionar um item à mão.
await win.getByPlaceholder("Ex.: gosto de jogar videogame e comer fora").fill("Gosta de jogar videogame");
await win.getByRole("button", { name: "Adicionar", exact: true }).click();
await wait(500);
const memOk = (await win.locator('input[aria-label="Item da memória"]').count()) === 1;
console.log(`[memoria] item salvo: ${memOk ? "sim" : "NÃO"}`);
if (!memOk) pageErrors.push("Memória do Assistente não salvou");
// Trocar ícone: escolher o claro e conferir que ficou marcado.
{
  const light = win.getByRole("button", { name: "Claro" }).last();
  await light.scrollIntoViewIfNeeded();
  await light.click();
  await wait(600);
  const iconOk = (await light.getAttribute("aria-pressed")) === "true";
  console.log(`[trocar-icone] claro ativo: ${iconOk ? "sim" : "NÃO"}`);
  if (!iconOk) pageErrors.push("Trocar ícone não mudou para o claro");
  await win.screenshot({ path: path.join(shots, "configuracoes-icone.png") });
}

const notifications = await win.evaluate(() => document.querySelector('[aria-label="Notificações"]')?.textContent ?? "");
console.log(`[notificacoes-nao-lidas] ${notifications || "0"}`);

// Tela travada: abre e fecha janelas, a busca e o menu muito rápido (com Esc e
// clique no fundo no meio da animação) e confere que nada ficou por cima da tela
// e que um clique comum ainda funciona.
const freezeIssues = [];
const tryStep = async (label, fn) => {
  try {
    await fn();
  } catch (err) {
    freezeIssues.push(`[${label}] ${String(err.message).split("\n")[0]}`);
  }
};
const overlayOpen = () =>
  win.evaluate(
    () =>
      document.documentElement.hasAttribute("data-overlay") ||
      [...document.querySelectorAll('[role="dialog"], input[placeholder^="Busque"]')].some((el) => !el.closest('[aria-hidden="true"]'))
  );
const closeAll = async () => {
  for (let i = 0; i < 4 && (await overlayOpen()); i++) {
    await win.keyboard.press("Escape");
    await wait(80);
  }
};
const assertResponsive = async (label) => {
  await wait(1200);
  const state = await win.evaluate(() => {
    const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return {
      sobras: document.querySelectorAll("[data-overlay-frame]").length,
      aberta: document.documentElement.hasAttribute("data-overlay"),
      centroBloqueado: !!el?.closest("[data-overlay-frame], .fixed.inset-0"),
      centro: el ? `${el.tagName}.${String(el.className).slice(0, 60)}` : "nada",
    };
  });
  if (state.sobras || state.aberta || state.centroBloqueado) freezeIssues.push(`[${label}] camada sobrando na tela: ${JSON.stringify(state)}`);
  // Clique de verdade (na posição do link do menu) para outra tela: a tela tem que responder.
  const box = await win.evaluate(() => {
    const here = location.hash || "#/";
    const links = [...document.querySelectorAll('a[href^="#/"]')].filter((a) => a.getBoundingClientRect().width > 0 && a.getAttribute("href") !== here);
    const link = links.find((a) => a.getAttribute("href") === "#/") ?? links[0];
    const r = link?.getBoundingClientRect();
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, href: link.getAttribute("href") } : null;
  });
  if (!box) return void freezeIssues.push(`[${label}] nenhum link do menu encontrado`);
  await win.mouse.click(box.x, box.y);
  await wait(700);
  const hash = await win.evaluate(() => location.hash || "#/");
  if (hash !== box.href) freezeIssues.push(`[${label}] clique no menu não respondeu (ia para ${box.href}, continua em ${hash})`);
  console.log(`[travamento-${label}] ${JSON.stringify(state)} clique: ${hash === box.href ? "ok" : "NÃO"}`);
};

await tryStep("janela", async () => {
  await win.evaluate(() => (location.hash = "#/carteira"));
  await wait(1500);
  const add = win.getByRole("button", { name: "Adicionar investimento" }).first();
  for (let i = 0; i < 12; i++) {
    if (i % 4 === 3) await add.dblclick({ timeout: 3000 });
    else await add.click({ timeout: 3000 });
    await wait((i * 37) % 130);
    if (i % 3 === 2) await win.mouse.click(300, 60);
    else await win.keyboard.press("Escape");
    await wait((i * 23) % 70);
    await closeAll();
  }
});
await tryStep("busca", async () => {
  for (let i = 0; i < 14; i++) {
    await win.keyboard.press("Control+k");
    await wait((i % 4) * 25);
    if (i % 3 === 0) await win.keyboard.press("Escape");
  }
  await closeAll();
});
await tryStep("confirmar", async () => {
  const out = win.getByRole("button", { name: "Sair da conta" }).first();
  for (let i = 0; i < 6; i++) {
    await out.click({ timeout: 3000 });
    await wait(i * 30);
    if (i % 2) await win.keyboard.press("Escape");
    else await win.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click({ timeout: 3000 });
  }
  await closeAll();
});
await tryStep("janela-escondida", async () => {
  await win.getByRole("button", { name: "Adicionar investimento" }).first().click({ timeout: 3000 }).catch(async () => {
    await win.evaluate(() => (location.hash = "#/carteira"));
    await wait(1200);
    await win.getByRole("button", { name: "Adicionar investimento" }).first().click({ timeout: 3000 });
  });
  await wait(250);
  await win.keyboard.press("Escape");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide());
  await wait(1500);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
});
await tryStep("navegacao", async () => {
  const routes = ["", "carteira", "gastos", "objetivos", "mercado", "alertas", "configuracoes", "plano", "aulas"];
  for (let i = 0; i < 27; i++) {
    await win.evaluate((r) => (location.hash = `#/${r}`), routes[i % routes.length]);
    if (i % 5 === 0) await win.keyboard.press("Control+k");
    await wait((i % 4) * 20);
  }
  await closeAll();
});
await assertResponsive("computador");
// Animação de fechar que não termina (quadros parados, como com a janela coberta
// ou o app em segundo plano): a janela que está saindo não pode segurar os cliques.
await tryStep("animacao-parada", async () => {
  const cdp = await win.context().newCDPSession(win);
  await cdp.send("Animation.enable");
  await win.evaluate(() => (location.hash = "#/carteira"));
  await wait(1200);
  await win.getByRole("button", { name: "Adicionar investimento" }).first().click({ timeout: 3000 });
  await wait(600);
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
  await win.keyboard.press("Escape");
  try {
    await assertResponsive("animacao-parada");
  } finally {
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
    await cdp.detach();
  }
});

// Celular e tablet: nenhuma tela pode ter texto saindo do card nem rolagem para o lado.
const layoutIssues = [];
const ROUTES = ["", "carteira", "mercado", "mercado/PETR4.SA", "aulas", "assistente", "simulador", "vale-a-pena", "plano", "logs", "objetivos", "gastos", "bancos", "alertas", "usuarios", "configuracoes"];
for (const [label, width, height] of [["celular-pequeno", 360, 740], ["celular", 380, 800], ["tablet", 768, 1024]]) {
  await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0].setContentSize(s.w, s.h), { w: width, h: height });
  await wait(600);
  for (const r of ROUTES) {
    await win.evaluate((route) => (location.hash = `#/${route}`), r);
    await wait(r.startsWith("mercado") ? 3500 : 1800);
    const found = await win.evaluate(() => {
      const out = [];
      if (document.documentElement.scrollWidth > innerWidth + 1) out.push(`página rola para o lado (${document.documentElement.scrollWidth}px > ${innerWidth}px)`);
      const main = document.querySelector("main").getBoundingClientRect();
      for (const card of document.querySelectorAll("main .surface")) {
        const box = card.getBoundingClientRect();
        if (!box.width) continue;
        // O main esconde o que passa para o lado: um card mais largo que a tela
        // fica cortado sem gerar rolagem (ex.: variação dos ativos no Início).
        let scroller = false;
        for (let a = card.parentElement; a && a.tagName !== "MAIN"; a = a.parentElement) if (["auto", "scroll"].includes(getComputedStyle(a).overflowX)) scroller = true;
        if (!scroller && (box.right > main.right + 2 || box.left < main.left - 2)) out.push(`card "${card.textContent.trim().slice(0, 40)}" passa da tela`);
        for (const el of card.querySelectorAll("*")) {
          if (el.children.length || !el.textContent.trim()) continue;
          const r = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          // Só conta como cortado de propósito se algum pai dentro do card esconde o excesso.
          let clipped = false;
          for (let a = el; a && a !== card; a = a.parentElement) {
            const cs = getComputedStyle(a);
            if (cs.overflowX !== "visible" || cs.textOverflow === "ellipsis") clipped = true;
          }
          if (r.width && (r.right > box.right + 2 || r.left < box.left - 2) && !clipped && style.position !== "absolute") {
            out.push(`"${el.textContent.trim().slice(0, 40)}" sai do card`);
          }
        }
      }
      // Ativos em destaque: o nome pode encurtar, mas preço e variação aparecem inteiros.
      const fav = [...document.querySelectorAll("main .surface")].find((c) => c.textContent.includes("Ativos em destaque"));
      if (fav) {
        const box = fav.getBoundingClientRect();
        for (const pill of fav.querySelectorAll("button span.rounded-lg")) {
          const p = pill.getBoundingClientRect();
          if (p.right > Math.min(box.right, innerWidth) + 1) out.push(`variação "${pill.textContent.trim()}" cortada nos ativos em destaque`);
        }
      }
      return [...new Set(out)].slice(0, 8);
    });
    for (const f of found) layoutIssues.push(`[${label}] /${r}: ${f}`);
    if (r === "" || r === "gastos" || r === "simulador" || r === "carteira") await win.screenshot({ path: path.join(shots, `${label}-${r || "inicio"}.png`) });
  }
}
// Celular: menu "Mais" aberto e fechado muito rápido, e trocando de tela por ele.
await tryStep("menu-mais", async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(380, 800));
  await win.evaluate(() => (location.hash = "#/"));
  await wait(1200);
  const more = win.getByRole("button", { name: "Mais" });
  for (let i = 0; i < 10; i++) {
    await more.click({ timeout: 3000 });
    await wait((i * 29) % 110);
    if (i % 2) await win.keyboard.press("Escape");
    else await win.mouse.click(190, 40);
    await wait((i * 17) % 60);
    await closeAll();
  }
  await more.click({ timeout: 3000 });
  await wait(350);
  await win.getByRole("dialog").getByRole("button", { name: /Gastos|Carteira|Objetivos/ }).first().click({ timeout: 3000 });
  await wait(60);
  await more.click({ timeout: 3000 });
  await wait(40);
  await win.keyboard.press("Escape");
  await closeAll();
});
await assertResponsive("celular");

// Barra de baixo do celular: trocar Compras por Gastos em Configurações e voltar ao padrão.
{
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(380, 800));
  await win.evaluate(() => (location.hash = "#/configuracoes"));
  await wait(1500);
  const tabs = () => win.locator("nav.sm\\:hidden").innerText();
  await win.getByRole("button", { name: "Tirar Compras da barra" }).click();
  await win.getByRole("button", { name: "Pôr Gastos na barra" }).click();
  await wait(400);
  const changed = await tabs();
  const ok = changed.includes("Gastos") && !changed.includes("Compras") && changed.trim().endsWith("Mais");
  console.log(`[barra-celular] ${changed.replace(/\s+/g, " ")}: ${ok ? "ok" : "NÃO"}`);
  if (!ok) pageErrors.push("Configurações não mudou a barra de baixo do celular");
  await win.getByRole("button", { name: "Padrão", exact: true }).click();
  await wait(300);
}
console.log(`\nProblemas de layout (${layoutIssues.length}):\n${layoutIssues.join("\n")}`);
console.log(`\nTela travada (${freezeIssues.length}):\n${freezeIssues.join("\n")}`);
console.log(`\nErros no console (${consoleErrors.length}):\n${consoleErrors.slice(0, 20).join("\n")}`);
console.log(`Exceções na página (${pageErrors.length}):\n${pageErrors.join("\n")}`);
await app.close();
fs.rmSync(dataDir, { recursive: true, force: true });
process.exit(pageErrors.length || layoutIssues.length || freezeIssues.length ? 1 : 0);
