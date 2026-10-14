// Lista de compras com dados extremos: vazia, um item, pior caso (nome enorme,
// emoji, acentos, sem preço, preço gigante, quantidade máxima) e 500 itens.
// Mede estouro de layout no computador e no celular e o tempo para desenhar.
//   npm run build && xvfb-run -a node scripts/stress-compras.mjs
import { _electron as electron } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.env.SHOTS || path.join(root, "e2e-shots");
fs.mkdirSync(shots, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "investa-stress-"));
const app = await electron.launch({ executablePath: createRequire(import.meta.url)("electron"), args: [root, "--no-sandbox", "--disable-gpu"], env: { ...process.env, INVESTA_USER_DATA: dataDir } });
const win = await app.firstWindow();
const errors = [];
win.on("pageerror", (e) => errors.push(e.message));
const wait = (ms) => win.waitForTimeout(ms);

await wait(2000);
await win.click("text=Criar agora");
await wait(400);
await win.fill('input[placeholder="Como você se chama?"]', "Aleksandra Wiśniewska-Kowalczyk");
await win.fill('input[placeholder="ex.: bruno.silva"]', "aleksandra");
await win.fill('input[placeholder="Mínimo de 6 caracteres"]', "Senha123!");
await win.fill('input[placeholder="Repita a senha"]', "Senha123!");
await win.click("button[type=submit]");
await wait(1800);
await win.click("text=Começar");
await wait(400);
await win.locator('input[inputmode="decimal"]').nth(0).fill("1412");
await win.click("text=Continuar");
await wait(400);
await win.click("text=Continuar");
await wait(400);

const now = new Date().toISOString();
const item = (id, name, extra = {}) => ({ id: String(id), name, quantity: 1, category: "outros", status: "pendente", createdAt: now, ...extra });
const WORST = [
  item(1, "Kit de limpeza multiuso concentrado com refil econômico para cozinha, banheiro e área de serviço — embalagem família 5 L", { category: "limpeza" }),
  item(2, "🍕 Pizza congelada sabor calabresa", { category: "alimentos", quantity: 3 }),
  item(3, "Pão de açúcar, maçã, feijão e açaí", { category: "alimentos" }),
  item(4, "Parafuso sextavado M8", { category: "casa" }),
  item(5, "Notebook gamer para o escritório", { category: "eletronicos", price: 10_000_000, quantity: 999 }),
  item(6, "Fone de ouvido", { category: "eletronicos", status: "comprado", paid: 79.9, boughtAt: "2026-10-14" }),
  item(7, "Leite integral", { category: "alimentos", quantity: 999 }),
  item(8, "Supercalifragilisticexpialidocious-limpa-tudo-ultra", { category: "limpeza" }),
  item(9, "Jogo 🎮🎮🎮 edição de colecionador com DLCs", { category: "jogos", price: 0.01 }),
];
const MANY = Array.from({ length: 500 }, (_, i) => item(1000 + i, ["Leite", "Arroz", "Detergente", "Sabonete", "Camiseta", "Fone", "Coisa sem preço", "Café", "Cerveja"][i % 9] + ` ${i + 1}`, { category: ["alimentos", "alimentos", "limpeza", "higiene", "roupas", "eletronicos", "outros", "alimentos", "bebidas"][i % 9], status: i % 4 === 0 ? "comprado" : "pendente" }));

const seed = async (list) => {
  await win.evaluate(async (v) => {
    const profile = (await window.investa.invoke("data:getAll"))?.data?.profile ?? {};
    await window.investa.invoke("data:set", { key: "profile", value: { ...profile, onboarded: true, salary: 1412 } });
    await window.investa.invoke("data:set", { key: "shopping", value: v });
  }, list);
  await win.reload();
  await wait(2500);
};
const measure = async (name) => {
  const t0 = Date.now();
  await win.evaluate(() => (location.hash = "#/compras"));
  await win.waitForSelector("h1:has-text('Lista de compras')", { timeout: 8000 }).catch(async () => { await win.screenshot({ path: path.join(shots, `stress-falhou-${name}.png`) }); throw new Error("tela não abriu: " + name); });
  await wait(900);
  const ms = Date.now() - t0;
  const r = await win.evaluate(() => {
    const main = document.querySelector("main");
    const over = [];
    for (const el of main.querySelectorAll("*")) {
      const b = el.getBoundingClientRect();
      if (b.width && (b.right > main.clientWidth + 1 || el.scrollWidth > el.clientWidth + 1) && getComputedStyle(el).overflowX !== "auto" && !el.closest("[aria-label='Filtrar por categoria']") && !el.matches(".truncate, .truncate *")) over.push(`${el.tagName}.${String(el.className).slice(0, 40)} ${el.textContent.trim().slice(0, 30)}`);
    }
    return { hscroll: main.scrollWidth > main.clientWidth, over: over.slice(0, 6), rows: document.querySelectorAll("main li").length };
  });
  console.log(`[${name}] ${ms}ms`, JSON.stringify(r));
  await win.screenshot({ path: path.join(shots, `stress-${name}.png`) });
  await win.evaluate(() => document.querySelector("main").scrollTo(0, 560));
  await wait(300);
  await win.screenshot({ path: path.join(shots, `stress-${name}-lista.png`) });
  await win.evaluate(() => document.querySelector("main").scrollTo(0, 0));
  return r;
};

let bad = 0;
for (const [label, data] of [["vazia", []], ["um", [item(1, "Leite", { category: "alimentos" })]], ["pior", WORST], ["500", MANY]]) {
  await seed(data);
  for (const [w, h, tag] of [[1440, 900, "pc"], [360, 780, "celular"]]) {
    await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [w, h]);
    await wait(500);
    const r = await measure(`${label}-${tag}`);
    if (r.hscroll || r.over.length) bad++;
  }
}
console.log(errors.length ? `Erros: ${errors.join(" | ")}` : "Sem erros de página");
await app.close();
fs.rmSync(dataDir, { recursive: true, force: true });
process.exit(bad || errors.length ? 1 : 0);
