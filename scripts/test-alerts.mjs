// Monta e roda o teste dos avisos (electron/alerts-test.ts) com uma nuvem falsa.
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "dist-electron/alerts-test.js");

await build({
  entryPoints: [path.join(root, "electron/alerts-test.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  logLevel: "warning",
  packages: "external",
  alias: { "@shared": path.join(root, "shared") },
  define: {
    __INVESTA_CLOUD_URL__: JSON.stringify("https://nuvem.teste"),
    __INVESTA_CLOUD_KEY__: JSON.stringify("chave-de-teste"),
  },
});

const r = spawnSync(process.execPath, [outfile], { stdio: "inherit" });
process.exit(r.status ?? 1);
