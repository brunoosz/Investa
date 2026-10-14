// Gera as imagens do README: prints em 2x, GIFs curtos e a imagem de capa.
// Abre o app compilado com uma conta de demonstração. Cotações, indicadores
// e notícias são os do momento da captura.
//
//   npm run media
//
// No Linux sem interface gráfica (como no CI), rode dentro do Xvfb:
//   npm run build && xvfb-run -a -s "-screen 0 3200x2000x24" node scripts/capture.mjs
//
// Precisa de ffmpeg. gifsicle e pngquant são opcionais (reduzem o tamanho).
// Com NVIDIA_API_KEY definida, também grava o GIF do Professor IA.
import { _electron as electron } from "playwright-core";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.resolve(root, process.env.MEDIA_DIR || "docs/media");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "investa-capture-"));
const dataDir = path.join(tmp, "dados");
const rawDir = path.join(tmp, "prints");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(rawDir, { recursive: true });

const exe = createRequire(import.meta.url)("electron");
const has = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`]).status === 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(`[captura] ${msg}`);
const failures = [];
// Uma tela ou GIF que falha não impede os outros; o script termina com erro no fim.
// Os GIFs dependem de várias respostas das fontes de dados, então tentam de novo.
async function attempt(name, fn, { retries = 0 } = {}) {
  for (let i = 0; ; i++) {
    try {
      await fn();
      return;
    } catch (err) {
      const msg = err.message.split("\n")[0];
      if (i < retries) {
        log(`${name}: tentando de novo (${msg})`);
        await sleep(5000);
        continue;
      }
      failures.push(name);
      log(`FALHOU ${name}: ${msg}`);
      return;
    }
  }
}

const TZ = "America/Sao_Paulo";
const STILL = { width: 1440, height: 900, scale: 2 };
const MOTION = { width: 1280, height: 800, scale: 1 };

// ---------------------------------------------------------------------------
// App

async function launch(size) {
  const app = await electron.launch({
    executablePath: exe,
    args: [root, "--no-sandbox", "--disable-gpu", "--lang=pt-BR", `--force-device-scale-factor=${size.scale}`],
    env: { ...process.env, INVESTA_USER_DATA: dataDir, TZ },
  });
  const win = await app.firstWindow();
  win.on("pageerror", (e) => log(`erro na página: ${e.message}`));
  await app.evaluate(({ BrowserWindow }, s) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setContentSize(s.width, s.height);
    w.center();
  }, size);
  await win.waitForLoadState("domcontentloaded");
  return { app, win };
}

async function resize(app, width, height) {
  await app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0].setContentSize(s.width, s.height), { width, height });
  await sleep(400);
}

async function invoke(win, channel, args) {
  return win.evaluate(
    async ([c, a]) => {
      const r = await window.investa.invoke(c, a);
      if (!r.ok) throw new Error(`${c}: ${r.error.message}`);
      return r.data;
    },
    [channel, args]
  );
}

async function go(win, route) {
  await win.evaluate((r) => {
    location.hash = `#/${r}`;
  }, route);
}

// Espera os dados chegarem: sem skeletons, sem texto de carregamento e com as
// imagens da tela já decodificadas.
async function settle(win, { timeout = Number(process.env.CAPTURE_TIMEOUT_MS) || 25_000, extra = 900 } = {}) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const busy = await win.evaluate(() => {
      const scope = document.querySelector("main") ?? document.body;
      const imgs = [...scope.querySelectorAll("img")].filter((i) => !i.complete).length;
      return scope.querySelectorAll(".skeleton").length + imgs + (/(Carregando|Baixando a base)/.test(scope.innerText) ? 1 : 0);
    });
    if (!busy) break;
    await sleep(400);
  }
  await sleep(extra);
}

// Espera os números animados pararem. O patrimônio, por exemplo, sobe até o
// valor final quando as últimas cotações chegam.
async function steady(win, { quiet = 1500, timeout = 12_000 } = {}) {
  const until = Date.now() + timeout;
  let last = "";
  let since = Date.now();
  while (Date.now() < until) {
    const text = await win.evaluate(() => (document.querySelector("main") ?? document.body).innerText);
    if (text !== last) {
      last = text;
      since = Date.now();
    } else if (Date.now() - since >= quiet) return;
    await sleep(250);
  }
}

async function hideScrollbars(win) {
  await win.evaluate(() => {
    if (document.getElementById("capture-scroll")) return;
    const s = document.createElement("style");
    s.id = "capture-scroll";
    s.textContent = "::-webkit-scrollbar { width: 0 !important; height: 0 !important; }";
    document.head.appendChild(s);
  });
}

// Esconde toasts e o cursor de texto piscando para os prints ficarem limpos.
async function cleanUi(win) {
  await win.evaluate(() => {
    if (document.getElementById("capture-style")) return;
    const s = document.createElement("style");
    s.id = "capture-style";
    s.textContent = `[data-toaster] { display: none !important; }
      * { caret-color: transparent !important; }
      ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }`;
    document.head.appendChild(s);
  });
}

async function shot(win, name) {
  await win.mouse.move(-10, -10).catch(() => undefined);
  const file = path.join(rawDir, `${name}.png`);
  await win.screenshot({ path: file });
  return file;
}

// ---------------------------------------------------------------------------
// Cursor visível nos GIFs (o screencast não captura o ponteiro do sistema)

const CURSOR = `(() => {
  if (document.getElementById("demo-cursor")) return;
  const c = document.createElement("div");
  c.id = "demo-cursor";
  c.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M5.5 3.2v15.6l3.9-3.7 2.6 5.9 2.6-1.1-2.6-5.9h5.5z" fill="#fff" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none",
    transform: "translate(-60px,-60px)", filter: "drop-shadow(0 1px 2px rgba(0,0,0,.35))" });
  const ring = document.createElement("div");
  Object.assign(ring.style, { position: "fixed", left: "0", top: "0", width: "34px", height: "34px", marginLeft: "-17px", marginTop: "-17px",
    borderRadius: "50%", background: "rgba(79,140,255,.28)", border: "1.5px solid rgba(79,140,255,.7)", zIndex: "2147483646",
    pointerEvents: "none", opacity: "0", transform: "scale(.4)" });
  document.documentElement.append(ring, c);
  addEventListener("mousemove", (e) => { c.style.transform = "translate(" + (e.clientX - 5.5) + "px," + (e.clientY - 3.2) + "px)"; }, true);
  addEventListener("mousedown", (e) => {
    ring.style.left = e.clientX + "px"; ring.style.top = e.clientY + "px";
    ring.animate([{ opacity: 1, transform: "scale(.4)" }, { opacity: 0, transform: "scale(1.15)" }], { duration: 450, easing: "ease-out" });
  }, true);
})()`;

function pointer(win) {
  // Começa sobre o título da página, longe de gráficos com tooltip.
  let pos = { x: MOTION.width * 0.55, y: 110 };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // O tempo do movimento é medido no relógio, porque cada mouse.move leva
  // alguns milissegundos de ida e volta até o Electron.
  async function moveTo(x, y, ms) {
    const dist = Math.hypot(x - pos.x, y - pos.y);
    const dur = ms ?? Math.min(700, 220 + dist * 0.45);
    const from = pos;
    const t0 = Date.now();
    for (;;) {
      const t = Math.min(1, (Date.now() - t0) / dur);
      const k = ease(t);
      await win.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
      if (t >= 1) break;
      await sleep(12);
    }
    pos = { x, y };
  }
  async function center(target) {
    const loc = typeof target === "string" ? win.locator(target).first() : target;
    await loc.waitFor({ state: "visible", timeout: 20_000 });
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  return {
    async show() {
      await hideScrollbars(win);
      await win.evaluate(CURSOR);
      await win.mouse.move(pos.x, pos.y);
    },
    moveTo,
    async hover(target, ms) {
      const c = await center(target);
      await moveTo(c.x, c.y, ms);
    },
    async click(target, { pause = 140 } = {}) {
      const c = await center(target);
      await moveTo(c.x, c.y);
      await sleep(pause);
      await win.mouse.down();
      await sleep(80);
      await win.mouse.up();
    },
    async type(text, delay = 55) {
      await win.keyboard.type(text, { delay });
    },
  };
}

// ---------------------------------------------------------------------------
// GIF: grava os quadros com o screencast do Chromium e converte com ffmpeg

async function record(win, name, scene, { hold = 1400, width, speed = 1 } = {}) {
  width ??= await win.evaluate(() => innerWidth);
  const cdp = await win.context().newCDPSession(win);
  const frames = [];
  cdp.on("Page.screencastFrame", (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: MOTION.width, maxHeight: MOTION.height });
  await sleep(400);
  const started = Date.now();
  try {
    await scene();
    await sleep(hold);
  } finally {
    await cdp.send("Page.stopScreencast").catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  }
  const elapsed = (Date.now() - started) / 1000;
  if (frames.length < 2) throw new Error(`GIF ${name}: nenhum quadro gravado`);

  const dir = path.join(tmp, `gif-${name}`);
  fs.mkdirSync(dir, { recursive: true });
  let list = "";
  frames.forEach((f, i) => {
    const file = `f${String(i).padStart(5, "0")}.jpg`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(f.data, "base64"));
    const next = frames[i + 1]?.t ?? f.t + hold / 1000;
    list += `file '${file}'\nduration ${Math.max(0.01, next - f.t).toFixed(4)}\n`;
  });
  list += `file 'f${String(frames.length - 1).padStart(5, "0")}.jpg'\n`;
  fs.writeFileSync(path.join(dir, "list.txt"), list);

  const gif = path.join(OUT, `${name}.gif`);
  const filter = `setpts=PTS/${speed},fps=25,scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt", "-vf", filter, "-loop", "0", gif], { cwd: dir });
  if (has("gifsicle")) execFileSync("gifsicle", ["-b", "-O3", "--lossy=25", gif]);
  log(`${name}.gif: ${frames.length} quadros, ${elapsed.toFixed(1)} s, ${(fs.statSync(gif).size / 1e6).toFixed(1)} MB`);
}

// ---------------------------------------------------------------------------
// Moldura de janela do Windows para a capa e para a galeria

const CAPTION = { dark: { symbol: "#CBD5E1", ring: "rgba(255,255,255,.10)" }, light: { symbol: "#334155", ring: "rgba(15,23,42,.14)" } };

function frameHtml(src, theme, { width, height, pad, zoom, shadow, radius }) {
  const c = CAPTION[theme];
  const shadowCss = shadow ? ", 0 28px 70px -12px rgba(2,6,23,.55), 0 12px 28px -8px rgba(2,6,23,.35)" : "";
  const icon = (d) => `<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="${c.symbol}" stroke-width="1">${d}</svg>`;
  const btn = (d) => `<div style="width:46px;height:44px;display:flex;align-items:center;justify-content:center">${icon(d)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}body{zoom:${zoom}}</style></head><body>
<div style="padding:${pad.join("px ")}px">
  <div style="position:relative;width:${width}px;height:${height}px;border-radius:${radius}px;overflow:hidden;box-shadow:0 0 0 1px ${c.ring}${shadowCss}">
    <img src="${src}" style="display:block;width:${width}px;height:${height}px">
    <div style="position:absolute;top:0;right:0;display:flex">${btn('<path d="M0 5.5h10"/>')}${btn('<rect x=".5" y=".5" width="9" height="9"/>')}${btn('<path d="M.5.5l9 9M9.5.5l-9 9"/>')}</div>
  </div>
</div></body></html>`;
}

async function framed(app, png, dest, theme, { outWidth, pad = [2, 2, 2, 2], shadow = false, radius = 9 } = {}) {
  const { width, height } = STILL;
  const logicalW = width + pad[1] + pad[3];
  const zoom = (outWidth ?? logicalW) / logicalW;
  const html = path.join(tmp, `frame-${path.basename(dest, ".png")}.html`);
  fs.writeFileSync(html, frameHtml(pathToFileURL(png).href, theme, { width, height, pad, zoom, shadow, radius }));
  const W = Math.round(logicalW * zoom);
  const H = Math.round((height + pad[0] + pad[2]) * zoom);
  const b64 = await app.evaluate(
    async ({ BrowserWindow }, { url, W, H }) => {
      const w = new BrowserWindow({ show: false, width: W, height: H, useContentSize: true, transparent: true, frame: false, backgroundColor: "#00000000", webPreferences: { offscreen: true } });
      await w.loadURL(url);
      await w.webContents.executeJavaScript("Promise.all([...document.images].map((i) => i.decode()))");
      await new Promise((r) => setTimeout(r, 250));
      const img = await w.webContents.capturePage();
      w.destroy();
      return img.toPNG().toString("base64");
    },
    { url: pathToFileURL(html).href, W, H }
  );
  fs.writeFileSync(dest, Buffer.from(b64, "base64"));
  if (has("pngquant")) spawnSync("pngquant", ["--force", "--skip-if-larger", "--quality=88-100", "--speed=1", "--output", dest, dest]);
  log(`${path.basename(dest)}: ${(fs.statSync(dest).size / 1e6).toFixed(2)} MB`);
}

/** Três celulares lado a lado, com moldura e fundo transparente. */
async function phones(app, pngs, dest) {
  const w = 390;
  const h = 844;
  const gap = 56;
  const pad = 48;
  const W = pad * 2 + pngs.length * (w + 20) + (pngs.length - 1) * gap;
  const H = pad * 2 + h + 20;
  const zoom = 1600 / W;
  const items = pngs
    .map(
      (p, i) => `<div style="width:${w}px;height:${h}px;border:10px solid #05070d;border-radius:54px;overflow:hidden;box-shadow:0 0 0 1px rgba(148,163,184,.25),0 30px 60px -18px rgba(2,6,23,.55);transform:translateY(${i === 1 ? -16 : 12}px)"><img src="${pathToFileURL(p).href}" style="display:block;width:${w}px;height:${h}px"></div>`
    )
    .join("");
  const html = path.join(tmp, "celulares.html");
  fs.writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}body{zoom:${zoom}}</style></head><body><div style="padding:${pad}px;display:flex;gap:${gap}px;align-items:center">${items}</div></body></html>`
  );
  const b64 = await app.evaluate(
    async ({ BrowserWindow }, { url, W, H }) => {
      const win = new BrowserWindow({ show: false, width: W, height: H, useContentSize: true, transparent: true, frame: false, backgroundColor: "#00000000", webPreferences: { offscreen: true } });
      await win.loadURL(url);
      await win.webContents.executeJavaScript("Promise.all([...document.images].map((i) => i.decode()))");
      await new Promise((r) => setTimeout(r, 250));
      const img = await win.webContents.capturePage();
      win.destroy();
      return img.toPNG().toString("base64");
    },
    { url: pathToFileURL(html).href, W: Math.round(W * zoom), H: Math.round(H * zoom) }
  );
  fs.writeFileSync(dest, Buffer.from(b64, "base64"));
  if (has("pngquant")) spawnSync("pngquant", ["--force", "--skip-if-larger", "--quality=88-100", "--speed=1", "--output", dest, dest]);
  log(`${path.basename(dest)}: ${(fs.statSync(dest).size / 1e6).toFixed(2)} MB`);
}

// ---------------------------------------------------------------------------
// Conta de demonstração

async function loadShared() {
  const { build } = await import("esbuild");
  const out = await build({
    stdin: { contents: 'export * from "./shared/learning.ts"; export { defaultUserData } from "./shared/defaults.ts"; export { CATALOG } from "./shared/catalog.ts";', resolveDir: root, loader: "ts" },
    alias: { "@shared": path.join(root, "shared") },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
}

const ymd = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const daysAgo = (n) => ymd(new Date(Date.now() - n * 86_400_000));
const today = ymd(new Date());
const [Y, M, D] = today.split("-").map(Number);
const ymShift = (n) => {
  const d = new Date(Date.UTC(Y, M - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const iso = (date, hour = 12) => new Date(`${date}T${String(hour).padStart(2, "0")}:00:00-03:00`).toISOString();

// Preço médio de compra = cotação atual × fator, para os resultados ficarem
// realistas qualquer que seja o dia da captura.
const STOCKS = [
  { symbol: "PETR4.SA", category: "acoes", quantity: 200, factor: 0.92, institution: "xp", bought: 420 },
  { symbol: "ITUB4.SA", category: "acoes", quantity: 150, factor: 0.86, institution: "xp", bought: 380 },
  { symbol: "WEGE3.SA", category: "acoes", quantity: 60, factor: 1.07, institution: "btg", bought: 210 },
  { symbol: "BOVA11.SA", category: "etfs", quantity: 40, factor: 0.95, institution: "btg", bought: 300 },
  { symbol: "HGLG11.SA", category: "fiis", quantity: 25, factor: 1.02, institution: "xp", bought: 150 },
  { symbol: "BTC-USD", category: "cripto", quantity: 0.012, factor: 0.93, institution: "mercadopago", bought: 330 },
];

function buildDemo(shared, quotes) {
  const base = shared.defaultUserData();
  const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

  const portfolio = STOCKS.filter((s) => quotes[s.symbol]?.price > 0).map((s, i) => ({
    id: `demo-rv-${i}`,
    kind: "variavel",
    name: shared.CATALOG.find((a) => a.symbol === s.symbol)?.name ?? (quotes[s.symbol].name || s.symbol),
    category: s.category,
    institution: s.institution,
    purchaseDate: daysAgo(s.bought),
    symbol: s.symbol,
    quantity: s.quantity,
    avgPrice: round(quotes[s.symbol].price * s.factor, s.category === "cripto" ? 0 : 2),
  }));
  portfolio.push(
    { id: "demo-rf-1", kind: "fixa", name: "CDB", category: "rendafixa", institution: "inter", purchaseDate: daysAgo(330), fixedType: "cdb", rateType: "cdi", rate: 110, amount: 8000 },
    { id: "demo-rf-2", kind: "fixa", name: "Tesouro Selic", category: "tesouro", institution: "Tesouro Direto", purchaseDate: daysAgo(260), fixedType: "tesouro-selic", rateType: "selic", rate: 0.07, amount: 6500 },
    { id: "demo-rf-3", kind: "fixa", name: "LCI", category: "rendafixa", institution: "btg", purchaseDate: daysAgo(190), fixedType: "lci", rateType: "cdi", rate: 94, amount: 5000 },
    { id: "demo-rf-4", kind: "fixa", name: "Tesouro IPCA+", category: "tesouro", institution: "Tesouro Direto", purchaseDate: daysAgo(120), fixedType: "tesouro-ipca", rateType: "ipca", rate: 7.1, amount: 3000 }
  );

  const goal = (id, name, icon, color, target, monthsAhead, allocations) => ({
    id, name, icon, color, target, deadline: ymShift(monthsAhead), allocations, createdAt: iso(daysAgo(200)),
  });
  const alloc = (id, type, asset, institution, amount, monthly, rateType, rate) => ({ id, type, asset, institution, amount, monthly, rateType, rate });
  const goals = [
    // Aportes somam R$ 2.000 por mês, o valor do perfil. Três metas ficam no
    // caminho certo e a aposentadoria mostra quanto falta por mês.
    goal("demo-g1", "Reserva de emergência", "shield", "#4F8CFF", 24000, 14, [
      alloc("demo-a1", "tesouro-selic", "Tesouro Selic", "Tesouro Direto", 6500, 350, "selic", 0.07),
      alloc("demo-a2", "cdb", "CDB liquidez diária", "inter", 8000, 250, "cdi", 110),
    ]),
    goal("demo-g2", "Viagem para Portugal", "plane", "#A78BFA", 9000, 13, [alloc("demo-a3", "cdb", "CDB", "nubank", 3200, 450, "cdi", 100)]),
    goal("demo-g3", "Entrada do apartamento", "house", "#34D399", 65000, 60, [
      alloc("demo-a4", "lci", "LCI", "btg", 5000, 450, "cdi", 94),
      alloc("demo-a5", "tesouro-ipca", "Tesouro IPCA+ 2032", "Tesouro Direto", 3000, 250, "ipca", 7.1),
    ]),
    goal("demo-g4", "Aposentadoria", "piggy", "#FBBF24", 600000, 300, [alloc("demo-a6", "etf", "BOVA11", "btg", 5200, 250, "variavel", 10)]),
  ];

  // Gastos: mês atual (só até hoje) e o anterior. Compras parceladas de meses
  // passados continuam aparecendo como parcelas.
  const cur = ymShift(0);
  const prev = ymShift(-1);
  const older = ymShift(-3);
  const TEMPLATES = [
    [2, "Aluguel", 1650, "Moradia", "pix", "nubank", 1],
    [3, "Conta de luz", 186.4, "Contas", "debito", "nubank", 1],
    [4, "Internet", 99.9, "Contas", "credito", "nubank", 1],
    [5, "Supermercado", 412.75, "Mercado", "credito", "nubank", 1],
    [6, "Spotify", 21.9, "Assinaturas", "credito", "inter", 1],
    [7, "Academia", 119.9, "Saúde", "debito", "inter", 1],
    [8, "Uber", 38.6, "Transporte", "credito", "nubank", 1],
    [9, "Almoço com a equipe", 74, "Alimentação", "pix", "nubank", 1],
    [11, "Farmácia", 63.2, "Saúde", "credito", "inter", 1],
    [13, "Cinema", 56, "Lazer", "credito", "nubank", 1],
    [15, "Supermercado", 286.3, "Mercado", "credito", "nubank", 1],
    [17, "Combustível", 210, "Transporte", "credito", "itau", 1],
    [19, "Curso de inglês", 249, "Educação", "boleto", "itau", 1],
    [21, "Jantar fora", 132.5, "Alimentação", "credito", "inter", 1],
    [24, "Presente de aniversário", 159.9, "Presentes", "pix", "nubank", 1],
    [27, "Ração do Thor", 189.9, "Pets", "credito", "nubank", 1],
  ];
  const expenses = [];
  const add = (ym, [day, description, amount, category, method, institution, installments], type = "despesa") =>
    expenses.push({ id: `demo-e${expenses.length}`, type, description, amount, date: `${ym}-${String(day).padStart(2, "0")}`, category, method, institution, installments });
  for (const t of TEMPLATES) add(prev, t);
  for (const t of TEMPLATES) if (t[0] <= Math.max(D, 9)) add(cur, [Math.min(t[0], D), ...t.slice(1)]);
  add(prev, [12, "Freela de design", 900, "Freelance", "pix", "nubank", 1], "receita");
  add(older, [14, "Geladeira nova", 3299, "Compras", "credito", "nubank", 10]);
  add(prev, [20, "Passagens para o Rio", 1180, "Viagem", "credito", "inter", 4]);

  const q = (s) => quotes[s]?.price;
  const alerts = [
    q("PETR4.SA") && { id: "demo-al1", kind: "preco-acima", symbol: "PETR4.SA", value: round(q("PETR4.SA") * 1.08), active: true, repeat: false, createdAt: iso(daysAgo(20)) },
    q("ITUB4.SA") && { id: "demo-al2", kind: "preco-abaixo", symbol: "ITUB4.SA", value: round(q("ITUB4.SA") * 0.92), active: true, repeat: false, createdAt: iso(daysAgo(18)) },
    q("WEGE3.SA") && { id: "demo-al3", kind: "abaixo-media", symbol: "WEGE3.SA", value: 6, active: true, repeat: true, createdAt: iso(daysAgo(12)) },
    q("BTC-USD") && { id: "demo-al4", kind: "variacao-dia", symbol: "BTC-USD", value: 7, active: true, repeat: true, createdAt: iso(daysAgo(9)) },
    { id: "demo-al5", kind: "lembrete", title: "Aporte do mês", message: "Separar R$ 2.000 para os investimentos assim que o salário cair.", remindAt: iso(`${ymShift(1)}-05`, 9), active: true, repeat: false, createdAt: iso(daysAgo(5)) },
  ].filter(Boolean);

  // Aulas: as seis primeiras aprovadas (390 XP). A sétima fica para o GIF e
  // leva ao nível Poupador (400 XP).
  let learning = base.learning;
  shared.ALL_LESSONS.slice(0, 6).forEach(({ lesson }, i) => {
    learning = shared.applyLessonResult(learning, lesson.id, lesson.quiz.length, lesson.quiz.length).state;
    learning.completed[lesson.id].completedAt = iso(daysAgo(16 - i * 3), 20);
  });
  learning.streak = { count: 4, lastDate: daysAgo(1) };
  if (!learning.badges.includes("em-chamas")) learning.badges.push("em-chamas");

  const usd = quotes["USDBRL=X"]?.price ?? 5.3;
  const invested = portfolio.reduce((s, h) => s + (h.kind === "fixa" ? h.amount : h.quantity * h.avgPrice * (h.symbol === "BTC-USD" ? usd : 1)), 0);
  const profile = {
    ...base.profile,
    onboarded: true,
    salary: 6800,
    extraIncome: 600,
    fixedExpenses: 2900,
    variableExpenses: 1500,
    monthlyInvest: 2000,
    emergencyReserve: 14500,
    invested: Math.round(invested),
    debts: 0,
    riskProfile: "moderado",
    experience: "pouco",
    mainGoal: "casa",
    age: 29,
    updatedAt: new Date().toISOString(),
  };
  // Desvio da média de 50 dias em 12% para a lista de avisos não repetir o
  // mesmo tipo de alerta para quase todos os ativos.
  const settings = { ...base.settings, theme: "dark", deviationThreshold: 12, favorites: ["^BVSP", "USDBRL=X", "PETR4.SA", "ITUB4.SA", "WEGE3.SA", "BTC-USD"] };

  const sim = (symbol, quantity, factor) => q(symbol) && { symbol, name: shared.CATALOG.find((a) => a.symbol === symbol)?.name ?? quotes[symbol].name, quantity, avgPrice: round(q(symbol) * factor), currency: quotes[symbol].currency || "BRL" };
  const positions = [sim("VALE3.SA", 300, 0.97), sim("BBAS3.SA", 500, 1.04), sim("IVVB11.SA", 50, 0.95)].filter(Boolean);
  const spent = positions.reduce((s, p) => s + p.quantity * p.avgPrice, 0);
  const simulator = {
    cash: round(100_000 - spent),
    startedAt: iso(daysAgo(40)),
    positions,
    history: positions.map((p, i) => ({ id: `demo-t${i}`, side: "compra", symbol: p.symbol, quantity: p.quantity, price: p.avgPrice, date: iso(daysAgo(40 - i * 7), 11) })),
  };

  const invoices = [
    { id: "demo-fat1", institution: "nubank", ym: cur, amount: 1874.3, dueDay: 10, minimumPayment: 281.15, paid: false },
    { id: "demo-fat2", institution: "inter", ym: cur, amount: 642.8, dueDay: 15, paid: false },
    { id: "demo-fat3", institution: "itau", ym: cur, amount: 389.9, dueDay: 5, paid: true },
  ];

  return { profile, settings, portfolio, goals, expenses, alerts, learning, simulator, chat: [], invoices };
}

async function setData(win, data) {
  for (const [key, value] of Object.entries(data)) await invoke(win, "data:set", { key, value });
}

async function reloadApp(win) {
  await win.reload();
  await win.locator("aside").first().waitFor({ state: "visible", timeout: 30_000 });
  await sleep(1200);
}

// ---------------------------------------------------------------------------
// Roteiro

const shared = await loadShared();
log(`saída: ${path.relative(root, OUT) || OUT}`);

// 1. Prints em 2x
let { app, win } = await launch(STILL);
await win.getByText("Criar agora").waitFor({ timeout: 30_000 });
await invoke(win, "auth:register", { name: "Investa", username: "investa", password: "demoInvesta2026", remember: true });
const SYMBOLS = [...STOCKS.map((s) => s.symbol), "VALE3.SA", "BBAS3.SA", "IVVB11.SA", "USDBRL=X"];
const quotes = await invoke(win, "market:quotes", { symbols: SYMBOLS }).catch((e) => {
  log(`sem cotações (${e.message}); a carteira fica só com renda fixa`);
  return {};
});
const demo = buildDemo(shared, quotes);
await setData(win, demo);
await reloadApp(win);
await invoke(win, "notifications:markRead", {});
await cleanUi(win);

const stills = {};
async function still(name, route, { before, wait = 1200, timeout } = {}) {
  await attempt(name, async () => {
    await go(win, route);
    await sleep(500);
    if (before) await before();
    await settle(win, { extra: wait, timeout });
    await steady(win);
    await cleanUi(win);
    stills[name] = await shot(win, name);
    log(`print ${name}`);
  });
}

// Aquece as fontes mais lentas antes dos prints.
await Promise.allSettled([invoke(win, "market:indicators"), invoke(win, "banks:get"), invoke(win, "market:news")]);

// A Carteira vem antes da Início para as cotações já estarem carregadas
// quando o patrimônio da Início aparece (assim o número não precisa animar).
await still("carteira", "carteira", { wait: 2500 });
await still("inicio", "", { wait: 3000 });
await still("mercado", "mercado", {
  before: async () => {
    await win.getByRole("button", { name: "Ações", exact: true }).click();
  },
  wait: 2000,
});
await still("ativo", "mercado/PETR4.SA", {
  before: async () => {
    await settle(win, { extra: 300 });
    await win.getByRole("button", { name: "1A", exact: true }).click();
  },
  wait: 1500,
});
await still("aulas", "aulas", { wait: 1800 });
await still("objetivos", "objetivos", { wait: 2000 });
await still("objetivo-projecao", "objetivos", {
  before: async () => {
    await settle(win, { extra: 300 });
    await win.locator("main .surface", { hasText: "Entrada do apartamento" }).getByRole("button", { name: "Ver projeção" }).click();
  },
  wait: 1500,
});
await win.keyboard.press("Escape");
await still("gastos", "gastos", { wait: 2000 });
await still("bancos", "bancos", { wait: 2000 });
await still("alertas", "alertas", { wait: 1500 });
await still("simulador", "simulador", { wait: 2000 });
await still("vale-a-pena", "vale-a-pena", {
  before: async () => {
    await win.getByPlaceholder(/Link da Steam/).fill("https://store.steampowered.com/app/1091500/");
    await win.getByRole("button", { name: "Verificar" }).click();
    await win.getByText("Seu mês", { exact: true }).waitFor({ timeout: 30_000 });
  },
  wait: 2500,
});

// Tema claro para a capa
await setData(win, { settings: { ...demo.settings, theme: "light" } });
await win.evaluate(() => localStorage.setItem("investa-theme", "light"));
await reloadApp(win);
await cleanUi(win);
await go(win, "carteira");
await settle(win, { extra: 1500 });
await still("inicio-claro", "", { wait: 3000 });
await still("mercado-claro", "mercado", {
  before: async () => {
    await win.getByRole("button", { name: "Ações", exact: true }).click();
  },
  wait: 2000,
});

// Volta ao tema escuro e desliga os avisos automáticos, para nenhum toast
// aparecer no meio dos GIFs.
await setData(win, { settings: { ...demo.settings, theme: "dark", smartAlerts: false, marketEvents: false, dailyTip: false } });
await win.evaluate(() => localStorage.setItem("investa-theme", "dark"));
await app.close();

// 2. Celular: a mesma interface numa tela de 390 x 844
const PHONE = { width: 390, height: 844, scale: 2 };
const phoneShots = [];
({ app, win } = await launch(PHONE));
await attempt("celular", async () => {
  await win.locator("nav").last().waitFor({ state: "visible", timeout: 40_000 });
  await sleep(1500);
  await cleanUi(win);
  // A Carteira primeiro, para as cotações já estarem carregadas quando a Início abrir.
  for (const [name, route] of [["celular-carteira", "carteira"], ["celular-inicio", ""], ["celular-gastos", "gastos"]]) {
    await go(win, route);
    await sleep(500);
    await settle(win, { extra: 1500 });
    await steady(win);
    await cleanUi(win);
    if (name === "celular-gastos") {
      await win.evaluate(() => {
        const title = [...document.querySelectorAll("main *")].find((el) => el.textContent === "Faturas dos cartões");
        title?.closest(".surface")?.scrollIntoView({ block: "start" });
        document.querySelector("main")?.scrollBy(0, -12);
      });
    }
    await sleep(500);
    phoneShots.push(await shot(win, name));
    log(`print ${name}`);
  }
});
await app.close();

// 3. GIFs em 1x
({ app, win } = await launch(MOTION));
// Ordem na imagem: Início, Gastos e Carteira.
if (phoneShots.length === 3) await attempt("celular.png", () => phones(app, [phoneShots[1], phoneShots[2], phoneShots[0]], path.join(OUT, "celular.png")));

// Capa e galeria. A montagem fica nesta etapa porque, em 2x, a janela fora da
// tela é limitada ao tamanho da tela virtual e cortaria a imagem.
const COVER = { outWidth: 2000, pad: [36, 56, 76, 56], shadow: true, radius: 10 };
if (stills.inicio) await framed(app, stills.inicio, path.join(OUT, "capa-escuro.png"), "dark", COVER);
if (stills["inicio-claro"]) await framed(app, stills["inicio-claro"], path.join(OUT, "capa-claro.png"), "light", COVER);
for (const name of ["carteira", "mercado", "ativo", "aulas", "objetivos", "objetivo-projecao", "gastos", "bancos", "alertas", "simulador", "vale-a-pena", "mercado-claro"]) {
  if (stills[name]) await framed(app, stills[name], path.join(OUT, `${name}.png`), name.endsWith("-claro") ? "light" : "dark", { outWidth: 1600 });
}

await win.locator("aside").first().waitFor({ state: "visible", timeout: 40_000 });
await sleep(1500);
await invoke(win, "notifications:markRead", {});
const cursor = pointer(win);

await attempt("mercado.gif", async () => {
  // Pré-carrega os gráficos e a lista para o GIF não mostrar carregamento.
  await go(win, "mercado/PETR4.SA");
  await settle(win, { extra: 300 });
  for (const r of ["1M", "6M", "1A", "1D"]) {
    await win.getByRole("button", { name: r, exact: true }).click();
    await settle(win, { extra: 200 });
  }
  await go(win, "mercado");
  await sleep(500);
  await win.getByRole("button", { name: "Ações", exact: true }).click();
  await settle(win, { extra: 300 });
  await win.getByRole("button", { name: "Favoritos", exact: true }).click();
  await go(win, "");
  await settle(win, { extra: 2500 });
  await cursor.show();

  await record(win, "mercado", async () => {
    await sleep(700);
    await cursor.click(win.locator("aside").getByRole("link", { name: "Mercado", exact: true }));
    await settle(win, { extra: 700 });
    await cursor.click(win.getByRole("button", { name: "Ações", exact: true }));
    await settle(win, { extra: 900 });
    await cursor.click(win.getByPlaceholder("Filtrar nesta lista"));
    await cursor.type("PETR", 110);
    await sleep(700);
    await cursor.click(win.locator("main").getByText("PETR4", { exact: true }).first());
    await settle(win, { extra: 900 });
    const chart = win.locator("main canvas").first();
    const box = await chart
      .waitFor({ state: "visible", timeout: 8000 })
      .then(() => chart.boundingBox())
      .catch(() => null);
    if (box) {
      await cursor.moveTo(box.x + box.width * 0.15, box.y + box.height * 0.55);
      await cursor.moveTo(box.x + box.width * 0.85, box.y + box.height * 0.45, 1300);
    }
    for (const r of ["1M", "6M", "1A"]) {
      await cursor.click(win.getByRole("button", { name: r, exact: true }), { pause: 90 });
      await sleep(700);
    }
    await cursor.click(win.locator("main button:has(svg.lucide-chart-candlestick)"));
    await sleep(1000);
  }, { speed: 1.15 });
}, { retries: 1 });

// Aula: o quiz da sétima aula da trilha até a aprovação. A aula ocupa só o
// centro da tela, então a janela fica menor neste GIF.
await attempt("aula.gif", async () => {
  const next = shared.ALL_LESSONS[6].lesson;
  await resize(app, 1040, 700);
  await go(win, `aula/${next.id}`);
  await win.getByRole("button", { name: "Sair da aula" }).waitFor({ timeout: 15_000 });
  await sleep(800);
  await cursor.show();
  for (let i = 0; i < next.cards.length - 1; i++) {
    await win.getByRole("button", { name: "Continuar", exact: true }).click();
    await sleep(700);
  }
  await win.getByRole("button", { name: "Ir para o quiz" }).click();
  await win.getByText(`Questão 1 de ${next.quiz.length}`).waitFor();
  await sleep(900);
  await record(
    win,
    "aula",
    async () => {
      await sleep(300);
      for (let i = 0; i < next.quiz.length; i++) {
        await win.getByText(`Questão ${i + 1} de ${next.quiz.length}`).waitFor();
        await sleep(650);
        await cursor.click(win.locator("h2 + div > button").nth(next.quiz[i].answer), { pause: 100 });
        await sleep(200);
        await cursor.click(win.getByRole("button", { name: "Verificar" }), { pause: 100 });
        await sleep(750);
        await cursor.click(win.getByRole("button", { name: "Continuar", exact: true }), { pause: 100 });
      }
      await win.getByText("ganhos nesta aula").waitFor();
      await sleep(2300);
    },
    { speed: 1.25 }
  );
  await win.keyboard.press("Escape");
  await sleep(600);
  await resize(app, MOTION.width, MOTION.height);
});

// Gasto parcelado
await attempt("gastos.gif", async () => {
  await go(win, "gastos");
  await settle(win, { extra: 1500 });
  await cursor.show();
  await record(win, "gastos", async () => {
    await sleep(800);
    await cursor.click(win.getByRole("button", { name: "Novo lançamento" }));
    await sleep(500);
    const dlg = win.getByRole("dialog");
    await cursor.click(dlg.getByPlaceholder("Ex.: Tênis novo"));
    await cursor.type("Notebook para estudar");
    await cursor.click(dlg.getByPlaceholder("0,00"));
    await cursor.type("4200", 90);
    await cursor.click(dlg.getByRole("button", { name: "Compras", exact: true }));
    await dlg.locator('input[type="date"]').fill(today);
    await cursor.hover(dlg.locator("select").nth(1));
    await dlg.locator("select").nth(1).selectOption("nubank");
    await sleep(500);
    await cursor.hover(dlg.locator("select").nth(2));
    await dlg.locator("select").nth(2).selectOption("10");
    await sleep(1400);
    await cursor.click(dlg.getByRole("button", { name: "Salvar", exact: true }));
    await sleep(2600);
  });
});

// Professor IA (só com chave da NVIDIA). A resposta chega em streaming e pode
// demorar, então esse GIF é acelerado.
if (process.env.NVIDIA_API_KEY) {
  await attempt("professor-ia.gif", async () => {
    await go(win, "assistente");
    await settle(win, { extra: 1000 });
    await cursor.show();
    await record(
      win,
      "professor-ia",
      async () => {
        await sleep(700);
        await cursor.click(win.locator("main textarea").first());
        await cursor.type("Tenho R$ 2.000 por mês para investir. Por onde começo?", 45);
        await win.keyboard.press("Enter");
        const stop = win.getByRole("button", { name: "Parar" });
        await stop.waitFor({ state: "visible", timeout: 15_000 });
        await stop.waitFor({ state: "hidden", timeout: 120_000 });
        await sleep(2500);
      },
      { hold: 2500, speed: 2 }
    );
  });
} else {
  log("NVIDIA_API_KEY não definida: GIF do Professor IA não foi gravado");
}

await app.close();
fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) {
  log(`terminou com falhas: ${failures.join(", ")}`);
  process.exit(1);
}
log("pronto");
