import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = await build({ entryPoints: [path.join(root, "shared/brand.ts")], bundle: true, format: "esm", write: false, platform: "node" });
const mod = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));

const executablePath = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
fs.mkdirSync(path.join(root, "build"), { recursive: true });
fs.mkdirSync(path.join(root, "resources"), { recursive: true });
// Ícone principal (escuro) e a variante clara, que o usuário escolhe em Configurações → Trocar ícone.
for (const variant of ["dark", "light"]) {
  await page.setContent(`<html><body style="margin:0;background:transparent">${mod.appIconSvg(1024, variant)}</body></html>`);
  const png = variant === "dark" ? path.join(root, "build/icon.png") : path.join(root, "build/icon-light.png");
  await page.locator("svg").screenshot({ path: png, omitBackground: true });
  execFileSync("convert", [png, "-resize", "256x256", path.join(root, `resources/icon-${variant}.png`)]);
}
await browser.close();
fs.rmSync(path.join(root, "build/icon-light.png"), { force: true });

const png = path.join(root, "build/icon.png");
execFileSync("convert", [png, "-resize", "256x256", path.join(root, "resources/icon.png")]);
execFileSync("convert", [png, "-define", "icon:auto-resize=256,128,64,48,32,24,16", path.join(root, "build/icon.ico")]);
console.log("Ícones gerados: build/icon.png, build/icon.ico, resources/icon{,-dark,-light}.png");
