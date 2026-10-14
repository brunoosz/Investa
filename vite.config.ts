import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Endereços que o app acessa. No PC as buscas saem do processo principal e no
// celular pela rede nativa (CapacitorHttp), fora do CSP; o WebView só busca
// direto a resposta da IA em streaming. IA fora da lista cai na rede nativa.
const API_HOSTS = [
  // IA e pesquisa
  "https://integrate.api.nvidia.com",
  "https://api.groq.com",
  "https://api.tavily.com",
  "https://api.search.brave.com",
  "https://r.jina.ai",
  "https://html.duckduckgo.com",
  "https://lite.duckduckgo.com",
  "https://duckduckgo.com",
  "https://pt.wikipedia.org",
  // Mercado, Banco Central e Tesouro
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
  "https://finance.yahoo.com",
  "https://fc.yahoo.com",
  "https://olinda.bcb.gov.br",
  "https://api.bcb.gov.br",
  "https://www.tesourotransparente.gov.br",
  "https://www.tesourodireto.com.br",
  "https://brapi.dev",
  "https://icons.brapi.dev",
  "https://cdn.jsdelivr.net",
  // Notícias
  "https://www.infomoney.com.br",
  "https://www.moneytimes.com.br",
  "https://g1.globo.com",
  "https://exame.com",
  "https://www.cnnbrasil.com.br",
  // Vale a pena?
  "https://api.mercadolibre.com",
  "https://www.cheapshark.com",
  "https://store.steampowered.com",
];

function cloudOrigin(): string {
  const raw = (process.env.INVESTA_CLOUD_URL ?? "").trim().replace(/^["']|["']$/g, "");
  if (!raw) return "";
  try {
    return new URL(/^https?:\/\//.test(raw) ? raw : `https://${raw}`).origin;
  } catch {
    return "";
  }
}

const csp: Plugin = {
  name: "investa-csp",
  apply: "build",
  transformIndexHtml(html) {
    const connect = ["'self'", cloudOrigin() || "https://*.supabase.co", ...API_HOSTS];
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      // Fotos das notícias e dos produtos vêm de muitos sites; imagem não executa código.
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      `connect-src ${connect.join(" ")}`,
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; ");
    return html.replace(
      "<head>",
      `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`
    );
  },
};

export default defineConfig({
  plugins: [react(), csp],
  base: "./",
  // Endereço da nuvem (Supabase) usado pelo app do celular; vem dos segredos do build.
  define: {
    __INVESTA_CLOUD_URL__: JSON.stringify(process.env.INVESTA_CLOUD_URL ?? ""),
    __INVESTA_CLOUD_KEY__: JSON.stringify(process.env.INVESTA_CLOUD_KEY ?? ""),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  server: { port: 5173, strictPort: true },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500,
  },
});
