// Testa a Groq (core/ai.ts, rede do PC e do celular) contra um servidor falso rígido, sem internet.
import { build } from "esbuild";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(os.tmpdir(), `investa-test-groq-${process.pid}.mjs`);
await build({
  entryPoints: [path.join(root, "scripts/test-groq.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: out,
  alias: { "@shared": path.join(root, "shared") },
  logLevel: "warning",
});
process.on("exit", () => fs.rmSync(out, { force: true }));
await import(pathToFileURL(out).href);
