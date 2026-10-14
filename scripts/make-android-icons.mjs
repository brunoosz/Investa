// Gera os ícones e a tela de abertura do app Android a partir da marca
// (shared/brand.ts). Precisa do Chromium (CHROMIUM_PATH) e do ImageMagick.
//   node scripts/make-android-icons.mjs
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = path.join(root, "android/app/src/main/res");
const out = await build({ entryPoints: [path.join(root, "shared/brand.ts")], bundle: true, format: "esm", write: false, platform: "node" });
const brand = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));

const BG = "#0B0F1A";
const BG_LIGHT = brand.ICON_BG.light[1];
const executablePath = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });

async function render(html, file, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent;width:${size}px;height:${size}px;overflow:hidden">${html}</body></html>`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

const tmp = fs.mkdtempSync(path.join(root, ".icons-"));
const full = path.join(tmp, "full.png");
const fullLight = path.join(tmp, "full-light.png");
const fg = path.join(tmp, "foreground.png");
const mono = path.join(tmp, "mono.png");
const splash = path.join(tmp, "splash.png");

// Ícone completo (quadrado arredondado), igual ao do desktop.
await render(brand.appIconSvg(1024, "dark"), full, 1024);
await render(brand.appIconSvg(1024, "light"), fullLight, 1024);
// Primeiro plano do ícone adaptativo: só as barras, dentro da área segura (66%).
await render(`<div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center">${brand.logoMarkSvg(600, "fg")}</div>`, fg, 1024);
// Ícone da notificação: silhueta branca.
await render(`<div style="width:256px;height:256px;display:flex;align-items:center;justify-content:center">${brand.logoMarkSvg(200, "mono", "#FFFFFF")}</div>`, mono, 256);
// Tela de abertura: logo no fundo da marca.
await render(`<div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center;background:${BG}">${brand.logoMarkSvg(420, "sp")}</div>`, splash, 1024);
await browser.close();

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const im = (...args) => execFileSync("convert", args);
for (const [d, k] of Object.entries(DENSITIES)) {
  const dir = path.join(res, `mipmap-${d}`);
  fs.mkdirSync(dir, { recursive: true });
  const legacy = Math.round(48 * k);
  for (const [src, name] of [[full, "ic_launcher"], [fullLight, "ic_launcher_light"]]) {
    im(src, "-resize", `${legacy}x${legacy}`, path.join(dir, `${name}.png`));
    im(src, "-resize", `${legacy}x${legacy}`, "(", "+clone", "-alpha", "extract", "-fill", "black", "-colorize", "100", "-fill", "white", "-draw", `circle ${legacy / 2},${legacy / 2} ${legacy / 2},0`, ")", "-alpha", "off", "-compose", "CopyOpacity", "-composite", path.join(dir, `${name}_round.png`));
  }
  const adaptive = Math.round(108 * k);
  im(fg, "-resize", `${adaptive}x${adaptive}`, path.join(dir, "ic_launcher_foreground.png"));
  const notif = path.join(res, `drawable-${d}`);
  fs.mkdirSync(notif, { recursive: true });
  im(mono, "-resize", `${Math.round(24 * k)}x${Math.round(24 * k)}`, path.join(notif, "ic_stat_investa.png"));
}

// Fundo do ícone adaptativo.
fs.writeFileSync(
  path.join(res, "values/ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n    <color name="ic_launcher_background_light">${BG_LIGHT}</color>\n</resources>\n`
);

// Ícone adaptativo claro (Configurações → Trocar ícone): mesmas barras, fundo claro.
const adaptiveXml = (bg) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/${bg}"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n`;
const anydpi = path.join(res, "mipmap-anydpi-v26");
fs.writeFileSync(path.join(anydpi, "ic_launcher.xml"), adaptiveXml("ic_launcher_background"));
fs.writeFileSync(path.join(anydpi, "ic_launcher_round.xml"), adaptiveXml("ic_launcher_background"));
fs.writeFileSync(path.join(anydpi, "ic_launcher_light.xml"), adaptiveXml("ic_launcher_background_light"));
fs.writeFileSync(path.join(anydpi, "ic_launcher_light_round.xml"), adaptiveXml("ic_launcher_background_light"));

// Tela de abertura em todas as orientações e densidades que o Capacitor criou.
for (const dir of fs.readdirSync(res).filter((d) => d.startsWith("drawable"))) {
  const file = path.join(res, dir, "splash.png");
  if (!fs.existsSync(file)) continue;
  const [w, h] = execFileSync("identify", ["-format", "%w %h", file]).toString().split(" ").map(Number);
  const logo = Math.round(Math.min(w, h) * 0.5);
  im("-size", `${w}x${h}`, `xc:${BG}`, "(", splash, "-resize", `${logo}x${logo}`, ")", "-gravity", "center", "-composite", file);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log("Ícones e tela de abertura do Android gerados em android/app/src/main/res");
