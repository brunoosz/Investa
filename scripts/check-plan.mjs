// Confere a conta do "Meu plano" contra contas feitas à mão.
// Uso: node scripts/check-plan.mjs
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(path.join(os.tmpdir(), "investa-plan-"));
const out = path.join(dir, "plan.mjs");
await build({ entryPoints: [path.join(root, "shared/plan.ts")], outfile: out, bundle: true, format: "esm", platform: "node", logLevel: "warning" });
const plan = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

let failed = 0;
function check(name, got, want, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FALHOU"} ${name}: ${got.toFixed(4)} (esperado ${want.toFixed(4)})`);
}

// Sem dados do Banco Central a conta usa CDI de 10% a.a. e IPCA de 4% a.a. constantes,
// o que deixa a conta à mão simples:
//   i = 1,10^(1/12) - 1 por mês; depósito mensal no começo de cada mês (o primeiro hoje);
//   IR de cada depósito pela idade: até 5 meses 22,5%, 6-11 20%, 12-23 17,5%, 24+ 15%;
//   em dinheiro de hoje = valor ÷ 1,04^anos.
const seguro = (years) => {
  const mk = plan.planMarket(undefined, undefined, years);
  return { mk, alloc: plan.planAllocation("seguro", years, "Aposentadoria") };
};
const handRate = (age) => (age <= 5 ? 0.225 : age <= 11 ? 0.2 : age <= 23 ? 0.175 : 0.15);
function hand(start, monthly, years) {
  const n = years * 12;
  const i = Math.pow(1.1, 1 / 12) - 1;
  // Bruto: valor inicial a juros compostos + série de depósitos antecipados (fórmula fechada).
  const gross = start * Math.pow(1 + i, n) + monthly * (1 + i) * ((Math.pow(1 + i, n) - 1) / i);
  let tax = handRate(n) * start * (Math.pow(1.1, years) - 1);
  for (let j = 0; j < n; j++) tax += handRate(n - j) * monthly * (Math.pow(1.1, (n - j) / 12) - 1);
  const net = gross - tax;
  return { invested: start + monthly * n, gross, tax, net, real: net / Math.pow(1.04, years) };
}
// A mesma conta de outro jeito: cada depósito vira um lote que rende mês a mês.
function handLoop(start, monthly, years) {
  const n = years * 12;
  const i = Math.pow(1.1, 1 / 12) - 1;
  const lots = start > 0 ? [{ put: start, value: start, age: 0 }] : [];
  for (let m = 0; m < n; m++) {
    if (monthly > 0) lots.push({ put: monthly, value: monthly, age: 0 });
    for (const lot of lots) {
      lot.value *= 1 + i;
      lot.age++;
    }
  }
  const gross = lots.reduce((s, l) => s + l.value, 0);
  const net = lots.reduce((s, l) => s + l.value - handRate(l.age) * (l.value - l.put), 0);
  return { gross, net };
}

const cases = [
  // Conta à parte, lote a lote: bruto 401,62 · IR 33,32 · líquido 368,30 · hoje 204,51.
  { name: "R$ 1 por mês, 15 anos", start: 0, monthly: 1, years: 15, want: { invested: 180, gross: 401.6212, net: 368.3031, real: 204.5056 } },
  // 1,10^15 = 4,1772 · lucro 3,1772 × 85% = 2,7007 · líquido 3,7007 · ÷ 1,04^15 = 2,0548.
  { name: "R$ 1 uma vez só, 15 anos", start: 1, monthly: 0, years: 15, want: { invested: 1, gross: 4.1772, net: 3.7007, real: 2.0548 } },
  { name: "R$ 500 por mês, 10 anos", start: 0, monthly: 500, years: 10, want: { invested: 60000, gross: 100728.7996, net: 94582.0227, real: 63896.2256 } },
];

for (const c of cases) {
  const { mk, alloc } = seguro(c.years);
  const r = plan.projectPlan(c.start, c.monthly, alloc.parts, mk);
  const h = hand(c.start, c.monthly, c.years);
  console.log(`\n${c.name}`);
  check("guardado", r.invested, h.invested);
  check("bruto (fórmula)", r.gross, h.gross);
  check("bruto (conta à parte)", r.gross, c.want.gross, 0.01);
  check("bruto (lote a lote)", r.gross, handLoop(c.start, c.monthly, c.years).gross);
  check("líquido (lote a lote)", r.net, handLoop(c.start, c.monthly, c.years).net);
  check("IR", r.tax, h.tax);
  check("líquido (fórmula)", r.net, h.net);
  check("líquido (conta à parte)", r.net, c.want.net, 0.01);
  check("em dinheiro de hoje", r.real, c.want.real, 0.01);
  check("taxa bruta equivalente (% a.a.)", r.grossRate, 10, 0.0001);
  check("inflação média (% a.a.)", r.inflation, 4, 0.0001);
}

// Uma carteira misturada é a soma ponderada de cada produto.
{
  const mk = plan.planMarket(undefined, undefined, 20);
  const alloc = plan.planAllocation("equilibrado", 20);
  const mix = plan.projectPlan(100, 300, alloc.parts, mk);
  const sum = alloc.parts.reduce((s, p) => s + p.weight * plan.projectPlan(100, 300, [{ product: p.product, weight: 1 }], mk).net, 0);
  console.log("\nCarteira Equilibrada, 20 anos");
  check("mistura = soma ponderada", mix.net, sum);
  // Tesouro IPCA+ sem dados: IPCA 4% + 6% = 10,24% a.a., menos 0,20% da B3 = 10,04%; ações: IPCA 4% + 4% = 8,16% a.a.
  const rows = Object.fromEntries(plan.compareProducts(1, 0, mk).map((x) => [x.product, x]));
  check("Tesouro IPCA+ (% a.a.)", rows.ipca.rate, 10.04, 0.0001);
  check("ações (% a.a.)", rows.acoes.rate, 8.16, 0.0001);
  check("poupança (0,5% ao mês, % a.a.)", rows.poupanca.rate, (Math.pow(1.005, 12) - 1) * 100, 0.0001);
  check("dinheiro parado mantém o valor", rows.parado.net, 1, 1e-9);
  check("dinheiro parado perde para a inflação", rows.parado.real, 1 / Math.pow(1.04, 20), 1e-9);
}

// Quanto guardar por mês para um gasto: o inverso da projeção.
{
  const mk = plan.planMarket(undefined, undefined, 1.5);
  const target = plan.projectPlan(0, 250, [{ product: "cdi", weight: 1 }], mk).points[18].value;
  console.log("\nGasto planejado em 18 meses");
  check("R$ 250 por mês voltam da meta", plan.planMonthlyFor(target, 18, mk), 250, 1e-9);
  check("com juros, guarda menos que a divisão simples", plan.planMonthlyFor(4500, 18, mk) < 4500 / 18 ? 1 : 0, 1, 0);
}

// Caminho do Focus: CDI de hoje no mês 0 e Selic esperada (menos 0,10) no fim de cada ano.
{
  const now = new Date(2026, 9, 10);
  const ind = {
    selic: { value: 15, date: "2026-10-09" },
    cdi: { value: 14.9, date: "2026-10-09" },
    ipca12m: { value: 5, date: "2026-09-01" },
    focus: { date: "2026-10-03", selicPath: [{ year: 2026, value: 15 }, { year: 2027, value: 12 }, { year: 2028, value: 10 }], ipcaPath: [{ year: 2026, value: 4.8 }, { year: 2027, value: 4 }, { year: 2028, value: 3.5 }] },
    updatedAt: "2026-10-10T12:00:00Z",
  };
  const mk = plan.planMarket(ind, undefined, 5, now);
  console.log("\nTaxas com o Boletim Focus");
  check("CDI no mês 0 = CDI de hoje", mk.cdi[0], 14.9);
  check("CDI no fim de 2027 = 12 - 0,10", mk.cdi[15], 11.9);
  check("CDI no meio do caminho (jun/2027)", mk.cdi[8], 14.9 + ((11.9 - 14.9) * 5) / 12);
  check("CDI depois de 2028 mantém 10 - 0,10", mk.cdi[50], 9.9);
  check("IPCA no 1º ano = 12 meses", mk.ipca[11], 5);
  check("IPCA em 2028", mk.ipca[20], 3.5);
  check("IPCA depois do Focus mantém o último", mk.ipca[55], 3.5);
}

console.log(failed ? `\n${failed} conferência(s) falharam.` : "\nTudo certo.");
process.exit(failed ? 1 : 0);
