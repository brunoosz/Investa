// Testa o catálogo de preços, as sugestões, os totais e o risco automático da lista de compras.
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(os.tmpdir(), `investa-test-shopping-${process.pid}.mjs`);
await build({
  entryPoints: [path.join(root, "scripts/test-shopping.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  alias: { "@shared": path.join(root, "shared") },
  logLevel: "warning",
});
process.on("exit", () => fs.rmSync(out, { force: true }));
await import(pathToFileURL(out).href);
