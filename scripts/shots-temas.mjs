// Prints de todas as telas no modo claro e escuro, no computador e no celular,
// para conferir o visual. Gera também uma folha de contato por tema/tamanho.
//   npm run build && xvfb-run -a node scripts/shots-temas.mjs
import { _electron as electron } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = process.env.SHOTS || path.join(root, "e2e-shots", "temas");
fs.mkdirSync(out, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "investa-temas-"));
const app = await electron.launch({ executablePath: createRequire(import.meta.url)("electron"), args: [root, "--no-sandbox", "--disable-gpu"], env: { ...process.env, INVESTA_USER_DATA: dataDir } });
const win = await app.firstWindow();
const errors = [];
win.on("pageerror", (e) => errors.push(e.message));
const wait = (ms) => win.waitForTimeout(ms);

await wait(2000);
await win.screenshot({ path: path.join(out, "login-escuro-pc.png") });
await win.click("text=Criar agora");
await wait(500);
await win.screenshot({ path: path.join(out, "cadastro-escuro-pc.png") });
await win.fill('input[placeholder="Como você se chama?"]', "Teste Investa");
await win.fill('input[placeholder="ex.: bruno.silva"]', "teste");
await win.fill('input[placeholder="Mínimo de 6 caracteres"]', "Senha123!");
await win.fill('input[placeholder="Repita a senha"]', "Senha123!");
await win.click("button[type=submit]");
await wait(1800);
await win.screenshot({ path: path.join(out, "questionario-escuro-pc.png") });
await win.evaluate(async () => {
  const all = (await window.investa.invoke("data:getAll"))?.data ?? {};
  const now = new Date().toISOString();
  await window.investa.invoke("data:set", { key: "profile", value: { ...all.profile, onboarded: true, salary: 3500, monthlyInvest: 300, emergencyReserve: 2000 } });
  await window.investa.invoke("data:set", { key: "portfolio", value: [{ id: "h1", symbol: "PETR4.SA", name: "Petrobras", category: "acoes", quantity: 50, avgPrice: 32, buyDate: "2026-01-10", createdAt: now }] });
  await window.investa.invoke("data:set", { key: "goals", value: [{ id: "g1", name: "Viagem", icon: "plane", color: "#4F8CFF", target: 5000, deadline: "2027-06-01", allocations: [], createdAt: now }] });
  await window.investa.invoke("data:set", { key: "expenses", value: [{ id: "e1", type: "despesa", description: "Mercado", amount: 320.5, date: now.slice(0, 10), category: "Alimentação", method: "pix", institution: "nubank", installments: 1 }] });
  await window.investa.invoke("data:set", { key: "shopping", value: [{ id: "s1", name: "Leite integral", quantity: 2, category: "alimentos", status: "pendente", createdAt: now }, { id: "s2", name: "Detergente", quantity: 1, category: "limpeza", status: "comprado", createdAt: now }] });
});
await win.reload();
await wait(3000);

const ROUTES = ["", "carteira", "mercado", "mercado/PETR4.SA", "aulas", "aula/o-que-e-investir", "assistente", "plano", "objetivos", "gastos", "compras", "vale-a-pena", "bancos", "simulador", "alertas", "usuarios", "logs", "configuracoes"];
const SIZES = [["pc", 1440, 900], ["celular", 390, 844]];
for (const theme of ["escuro", "claro"]) {
  for (const [size, w, h] of SIZES) {
    await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [w, h]);
    for (const r of ROUTES) {
      await win.evaluate(([route, t]) => {
        document.documentElement.dataset.theme = t === "claro" ? "light" : "dark";
        location.hash = `#/${route}`;
      }, [r, theme]);
      await wait(r.startsWith("mercado") || r === "" ? 2500 : 1300);
      await win.screenshot({ path: path.join(out, `${(r || "inicio").replace(/\//g, "_")}-${theme}-${size}.png`) });
    }
  }
}
// Login no claro.
await win.evaluate(() => (document.documentElement.dataset.theme = "light"));
for (const theme of ["escuro", "claro"]) {
  for (const [size] of SIZES) {
    const files = fs.readdirSync(out).filter((f) => f.endsWith(`-${theme}-${size}.png`)).sort().map((f) => path.join(out, f));
    try {
      execFileSync("montage", [...files, "-tile", size === "pc" ? "4x" : "6x", "-geometry", size === "pc" ? "480x300+4+4" : "195x422+4+4", "-background", "#888", path.join(out, `_folha-${theme}-${size}.png`)]);
    } catch {
      // sem ImageMagick: fica só com os prints soltos
    }
  }
}
console.log(errors.length ? `Erros: ${errors.join(" | ")}` : "Sem erros de página");
await app.close();
fs.rmSync(dataDir, { recursive: true, force: true });
