import { CATALOG } from "@shared/catalog";
import { getChart, getQuotes, search } from "../core/yahoo";
import { getCopom, getFocus, getIndicators, sgsProbe } from "../core/bcb";
import { extractProduct } from "../core/deals";
import { fetchWithTimeout } from "../core/http";
import { getTesouro } from "../core/tesouro";
import { getNews } from "../core/news";
import { getBanks, getCreditRates } from "../core/banks";
import { parseDuckDuckGoHtml, parseDuckDuckGoLite, webSearch, wikipedia } from "../core/search";

let failures = 0;

async function step<T>(name: string, fn: () => Promise<T>, summarize: (r: T) => string, critical = false): Promise<T | undefined> {
  const started = Date.now();
  try {
    const r = await fn();
    console.log(`OK   ${name} (${Date.now() - started} ms): ${summarize(r)}`);
    return r;
  } catch (err) {
    console.log(`FAIL ${name} (${Date.now() - started} ms): ${(err as Error).message}`);
    if (critical) failures++;
    return undefined;
  }
}

async function main(): Promise<void> {
  console.log(`Teste de fontes de dados reais — ${new Date().toISOString()}\n`);

  await step(
    "Yahoo: cotações em lote",
    async () => {
      const r = await getQuotes(["PETR4.SA", "VALE3.SA", "^BVSP", "USDBRL=X", "BTC-USD", "BTC-BRL", "IFIX.SA", "HGLG11.SA", "AAPL34.SA", "GC=F", "AAPL"]);
      if (!Object.keys(r).length) throw new Error("nenhuma cotação retornada");
      return r;
    },
    (r) =>
      Object.values(r)
        .map((q) => `${q.symbol}=${q.price.toFixed(2)} ${q.currency} (${q.changePercent.toFixed(2)}%${q.pe ? ` P/L ${q.pe.toFixed(1)}` : ""}${q.dividendYield ? ` DY ${q.dividendYield.toFixed(1)}` : ""}${q.fiftyDayAverage ? ` MM50 ${q.fiftyDayAverage.toFixed(2)}` : ""})`)
        .join(" | "),
    true
  );
  await step("Yahoo: gráfico 1D PETR4", () => getChart("PETR4.SA", "1D"), (r) => `${r.points.length} pontos, fech. anterior ${r.previousClose}`, true);
  await step("Yahoo: gráfico 1A ^BVSP", () => getChart("^BVSP", "1A"), (r) => `${r.points.length} pontos`, true);
  await step("Yahoo: busca 'itau'", () => search("itau"), (r) => r.slice(0, 6).map((x) => x.symbol).join(", "));

  const all = CATALOG.map((a) => a.symbol);
  await step(
    `Yahoo: cobertura do catálogo (${all.length} ativos)`,
    () => getQuotes(all),
    (r) => {
      const missing = all.filter((s) => !r[s]);
      return `${all.length - missing.length}/${all.length} com cotação. Sem dados: ${missing.join(", ") || "nenhum"}`;
    }
  );

  await step(
    "BCB: indicadores",
    () => getIndicators(),
    (r) =>
      `Selic ${r.selic?.value} (${r.selic?.date}) | CDI ${r.cdi?.value?.toFixed(2)} | IPCA mês ${r.ipcaMonth?.value} (${r.ipcaMonth?.date}) | IPCA 12m ${r.ipca12m?.value} | PTAX ${r.dollarPtax?.value} | Poupança ${r.savingsMonth?.value} | TR ${r.tr?.value}`,
    true
  );
  await step("BCB: Focus", () => getFocus(), (r) => JSON.stringify(r));
  await step(
    "BCB: Copom",
    () => getCopom(),
    (r) => `atual ${r.current} | última ${JSON.stringify(r.lastMeeting)} | próxima ${JSON.stringify(r.nextMeeting)} | mudanças ${r.history.length} | expectativa ${JSON.stringify(r.expectation)}`
  );
  await step("Tesouro Direto", () => getTesouro(), (r) => `${r.source}: ${r.titles.length} títulos; ex.: ${r.titles.slice(0, 3).map((t) => `${t.name} ${t.buyRate}`).join(", ")}`);
  await step("Notícias RSS", () => getNews(), (r) => `${r.length} notícias; fontes: ${[...new Set(r.map((n) => n.source))].join(", ")}; 1ª: ${r[0]?.title}`);
  await step(
    "BCB: juros de crédito",
    () => getCreditRates(),
    (r) => `período ${r.period}; ${r.modalities.map((m) => `${m.label}: ${m.rates.length} instituições (menor ${m.rates[0]?.institution} ${m.rates[0]?.rateMonth}% a.m.)`).join(" | ")}`
  );
  await step("Ranking de bancos", () => getBanks(), (r) => r.scores.slice(0, 5).map((s) => `${s.bankId}:${s.score}`).join(", "));

  // Pesquisa sem chave (diagnóstico: o IP do CI pode ser bloqueado pelo DuckDuckGo, o do usuário não).
  for (const url of ["https://html.duckduckgo.com/html/?q=tesouro%20selic&kl=br-pt", "https://lite.duckduckgo.com/lite/?q=tesouro%20selic&kl=br-pt"]) {
    await step(`Pesquisa: ${new URL(url).host}`, async () => {
      const res = await fetchWithTimeout(url, { headers: { Accept: "text/html" } }, 15_000);
      const html = await res.text();
      const found = url.includes("lite") ? parseDuckDuckGoLite(html, 3) : parseDuckDuckGoHtml(html, 3);
      return `HTTP ${res.status}; ${found.length} resultado(s): ${found.map((r) => r.url).join(", ") || html.slice(0, 120)}`;
    }, (r) => r);
  }
  await step("Pesquisa: Wikipédia", () => wikipedia("juros compostos", 2), (r) => r.map((x) => `${x.title} (${x.content.length} car.)`).join(", "));
  await step("Pesquisa sem chave (completa)", () => webSearch(null, "como investir no tesouro direto", 4), (r) => `${r.length} resultado(s): ${r.map((x) => `${x.url} (${x.content.length} car.)`).join(", ")}`);

  await step("Steam: preço do jogo 1091500", async () => {
    const res = await fetchWithTimeout("https://store.steampowered.com/api/appdetails?appids=1091500&cc=br&l=portuguese", {}, 15_000);
    return `HTTP ${res.status} ${(await res.text()).slice(0, 160)}`;
  }, (r) => r);
  await step("CheapShark: histórico do jogo 1091500", async () => {
    const res = await fetchWithTimeout("https://www.cheapshark.com/api/1.0/games?steamAppID=1091500", { headers: { "User-Agent": "Investa/1.0 (+https://github.com/brunoosz/app)" } }, 15_000);
    return `HTTP ${res.status} ${res.headers.get("server") ?? ""} ${(await res.text()).slice(0, 160)}`;
  }, (r) => r);

  // Lojas (diagnóstico): o que a API e as páginas respondem fora do Brasil, no servidor do CI.
  await step("Mercado Livre: API de busca", async () => {
    const res = await fetchWithTimeout("https://api.mercadolibre.com/sites/MLB/search?q=playstation%205&limit=1", {}, 15_000);
    return `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
  }, (r) => r);
  await step("Mercado Livre: API de anúncio", async () => {
    const res = await fetchWithTimeout("https://api.mercadolibre.com/products/MLB1027172677", {}, 15_000);
    return `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`;
  }, (r) => r);
  await step("Mercado Livre: página de produto", async () => {
    const res = await fetchWithTimeout("https://www.mercadolivre.com.br/apple-iphone-15-128-gb-preto/p/MLB1027172677", { headers: { Accept: "text/html" } }, 20_000);
    const html = await res.text();
    const p = extractProduct(html);
    return `HTTP ${res.status} final=${res.url.slice(0, 80)} preço=${p.price ?? "—"} título=${(p.title ?? "—").slice(0, 60)}`;
  }, (r) => r);
  await step("Amazon: página de produto", async () => {
    const res = await fetchWithTimeout("https://www.amazon.com.br/dp/B09B8XJDW5", { headers: { Accept: "text/html" } }, 20_000);
    const p = extractProduct(await res.text());
    return `HTTP ${res.status} preço=${p.price ?? "—"} título=${(p.title ?? "—").slice(0, 60)}`;
  }, (r) => r);

  for (const code of [1, 10813, 21619, 433, 13522, 4389]) {
    await step(`BCB: série SGS ${code}`, () => sgsProbe(code), (r) => JSON.stringify(r));
  }
  for (const url of [
    "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoSelic?$top=1&$orderby=Data%20desc&$format=json",
    "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?$top=1&$filter=Indicador%20eq%20%27IPCA%27&$format=json",
    "https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/TaxasJurosDiariaPorInicioPeriodo?$top=1&$orderby=InicioPeriodo%20desc&$format=json",
  ]) {
    await step(
      `Diagnóstico ${new URL(url).host}`,
      async () => {
        const res = await fetchWithTimeout(url, {}, 15_000);
        const body = await res.text();
        const title = /<title>([^<]*)/i.exec(body)?.[1];
        return `HTTP ${res.status} ${res.headers.get("server") ?? ""} ${title ? `título: ${title}` : body.slice(0, 120)}`;
      },
      (r) => r
    );
  }

  console.log(`\n${failures ? `${failures} verificação(ões) crítica(s) falharam.` : "Todas as verificações críticas passaram."}`);
  process.exit(failures ? 1 : 0);
}

void main();
