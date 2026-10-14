import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: false,
  logLevel: "warning",
  packages: "external",
  alias: { "@shared": path.join(root, "shared") },
  // Endereço da nuvem (Supabase); vazio = só contas locais.
  define: {
    __INVESTA_CLOUD_URL__: JSON.stringify(process.env.INVESTA_CLOUD_URL ?? ""),
    __INVESTA_CLOUD_KEY__: JSON.stringify(process.env.INVESTA_CLOUD_KEY ?? ""),
  },
};

await Promise.all([
  build({
    ...common,
    entryPoints: [path.join(root, "electron/main.ts")],
    outfile: path.join(root, "dist-electron/main.js"),
    external: ["electron"],
  }),
  build({
    ...common,
    entryPoints: [path.join(root, "electron/preload.ts")],
    outfile: path.join(root, "dist-electron/preload.js"),
    external: ["electron"],
  }),
  build({
    ...common,
    entryPoints: [path.join(root, "electron/smoke.ts")],
    outfile: path.join(root, "dist-electron/smoke.js"),
  }),
]);

console.log("Electron main/preload compilados em dist-electron/");
