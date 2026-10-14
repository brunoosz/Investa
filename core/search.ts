// Pesquisa na internet para o Assistente. A IA da NVIDIA não navega sozinha:
// o app faz a busca e entrega os resultados (com os links) junto da pergunta.
// Sem chave, a busca sai do próprio aparelho (DuckDuckGo e, se ele falhar,
// Wikipédia): cada aparelho tem o seu IP, então não existe cota dividida entre
// as contas. Com chave da Tavily ("tvly-…") ou da Brave, elas vêm primeiro e,
// se a cota acabar ou der erro, o app volta para a busca sem chave.
import { cached, fetchWithTimeout, isPublicUrl, readText } from "./http";
export { isPublicUrl };

export interface SearchResult {
  title: string;
  url: string;
  content: string;
}

export function searchProvider(key: string): "tavily" | "brave" {
  return key.trim().startsWith("tvly-") ? "tavily" : "brave";
}

/** Buscas por resposta (o plano de investimento faz várias). */
export const MAX_SEARCHES_PER_ANSWER = 3;
const CACHE_MS = 10 * 60_000;

class KeyError extends Error {
  constructor(message: string, public quota = false) {
    super(message);
  }
}

async function tavily(key: string, query: string, max: number): Promise<SearchResult[]> {
  const res = await fetchWithTimeout(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, Accept: "application/json" },
      body: JSON.stringify({ query, max_results: max, search_depth: "basic", include_answer: false, country: "brazil" }),
    },
    20_000
  );
  if (res.status === 401 || res.status === 403) throw new KeyError("Chave da pesquisa (Tavily) inválida.");
  // 432: cota do mês acabou; 429: muitas buscas seguidas.
  if (res.status === 429 || res.status === 432 || res.status === 433) throw new KeyError("A cota da Tavily acabou.", true);
  if (!res.ok) throw new Error(`Pesquisa indisponível (HTTP ${res.status}).`);
  const json = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  return (json.results ?? []).filter((r) => r.url).map((r) => ({ title: r.title ?? r.url!, url: r.url!, content: (r.content ?? "").slice(0, 1200) }));
}

async function brave(key: string, query: string, max: number): Promise<SearchResult[]> {
  const res = await fetchWithTimeout(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}&country=BR&search_lang=pt-br`,
    { headers: { Accept: "application/json", "X-Subscription-Token": key } },
    15_000
  );
  if (res.status === 401 || res.status === 403 || res.status === 422) throw new KeyError("Chave da pesquisa (Brave) inválida.");
  if (res.status === 402 || res.status === 429) throw new KeyError("A cota da Brave acabou.", true);
  if (!res.ok) throw new Error(`Pesquisa indisponível (HTTP ${res.status}).`);
  const json = (await res.json()) as { web?: { results?: { title?: string; url?: string; description?: string; extra_snippets?: string[] }[] } };
  const results = (json.web?.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({ title: r.title ?? r.url!, url: r.url!, content: stripTags([r.description, ...(r.extra_snippets ?? [])].filter(Boolean).join(" ")).slice(0, 900) }));
  return enrich(results, 1);
}

// ---- busca sem chave ----

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", middot: "·", bull: "•", ordm: "º", ordf: "ª", deg: "°", euro: "€", copy: "©", reg: "®",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    const named = ENTITIES[code.toLowerCase()];
    if (named) return named;
    // Letras acentuadas (&aacute;, &ccedil;, &atilde;…): o navegador resolve do mesmo jeito.
    const accent = /^([a-z])(acute|grave|circ|tilde|uml|cedil)$/i.exec(code);
    if (accent) {
      const mark = { acute: "́", grave: "̀", circ: "̂", tilde: "̃", uml: "̈", cedil: "̧" }[accent[2].toLowerCase()]!;
      return (accent[1] + mark).normalize("NFC");
    }
    return m;
  });
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** Link de resultado do DuckDuckGo: "//duckduckgo.com/l/?uddg=<url>&rut=…" ou o próprio link. */
export function decodeResultUrl(href: string): string | null {
  let raw = decodeEntities(href.trim());
  if (raw.startsWith("//")) raw = `https:${raw}`;
  else if (raw.startsWith("/")) raw = `https://duckduckgo.com${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (/(^|\.)duckduckgo\.com$/i.test(url.hostname)) {
    const target = url.searchParams.get("uddg");
    if (!target) return null; // anúncios (y.js) e links internos
    try {
      url = new URL(target);
    } catch {
      return null;
    }
    if (/(^|\.)duckduckgo\.com$/i.test(url.hostname)) return null;
  }
  return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
}

class BlockedError extends Error {}

function checkBlocked(status: number, html: string): void {
  // Quando há buscas demais, o DuckDuckGo responde 202/403 com um desafio "anti-robô".
  if (status === 202 || status === 403 || status === 429 || /anomaly-modal|challenge-form|bots use DuckDuckGo/i.test(html)) {
    throw new BlockedError("O DuckDuckGo pediu uma pausa nas buscas.");
  }
}

/** Página https://html.duckduckgo.com/html/ */
export function parseDuckDuckGoHtml(html: string, max: number): SearchResult[] {
  const starts = [...html.matchAll(/<div\b[^>]*\bclass\s*=\s*"([^"]*)"/gi)].filter((m) => /(^|\s)result(\s|$)/.test(m[1]));
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < starts.length && out.length < max; i++) {
    if (/result--ad\b/.test(starts[i][1])) continue;
    const block = html.slice(starts[i].index, starts[i + 1]?.index ?? html.length);
    const a = /<a\b([^>]*\bresult__a\b[^>]*)>([\s\S]*?)<\/a>/i.exec(block);
    const href = a && /\bhref\s*=\s*(["'])(.*?)\1/i.exec(a[1])?.[2];
    const url = href ? decodeResultUrl(href) : null;
    if (!a || !url || seen.has(url)) continue;
    const snippet = /<(a|div|td|span)\b[^>]*\bresult__snippet\b[^>]*>([\s\S]*?)<\/\1>/i.exec(block)?.[2] ?? "";
    seen.add(url);
    out.push({ title: stripTags(a[2]) || url, url, content: stripTags(snippet).slice(0, 600) });
  }
  return out;
}

/** Página https://lite.duckduckgo.com/lite/ (tabela simples, sem JavaScript). */
export function parseDuckDuckGoLite(html: string, max: number): SearchResult[] {
  const links = [...html.matchAll(/<a\b([^>]*\bresult-link\b[^>]*)>([\s\S]*?)<\/a>/gi)];
  const out: SearchResult[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < links.length && out.length < max; i++) {
    const href = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(links[i][1])?.[2];
    const url = href ? decodeResultUrl(href) : null;
    if (!url || seen.has(url)) continue;
    const rest = html.slice(links[i].index! + links[i][0].length, links[i + 1]?.index ?? html.length);
    const snippet = /<td\b[^>]*\bresult-snippet\b[^>]*>([\s\S]*?)<\/td>/i.exec(rest)?.[1] ?? "";
    seen.add(url);
    out.push({ title: stripTags(links[i][2]) || url, url, content: stripTags(snippet).slice(0, 600) });
  }
  return out;
}

const NO_RESULTS = /class\s*=\s*["'][^"']*\bno-results\b|(No\s+(more\s+)?results|Nenhum resultado)\.?\s*</i;

let gate: Promise<unknown> = Promise.resolve();
let lastDdgAt = 0;
const ddgPauseUntil = { html: 0, lite: 0 };

/** As buscas no DuckDuckGo saem uma de cada vez, com um respiro entre elas, para o IP não ser bloqueado. */
function ddgTurn<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(async () => {
    const wait = lastDdgAt + 1_200 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastDdgAt = Date.now();
    }
  });
  gate = run.catch(() => undefined);
  return run;
}

async function duckduckgo(kind: "html" | "lite", query: string, max: number): Promise<SearchResult[]> {
  const url =
    kind === "html"
      ? `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=br-pt`
      : `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}&kl=br-pt`;
  return ddgTurn(async () => {
    const res = await fetchWithTimeout(url, { headers: { Accept: "text/html,application/xhtml+xml" } }, 12_000);
    const html = await readText(res, 12_000);
    checkBlocked(res.status, html);
    if (!res.ok) throw new Error(`DuckDuckGo indisponível (HTTP ${res.status}).`);
    const results = kind === "html" ? parseDuckDuckGoHtml(html, max) : parseDuckDuckGoLite(html, max);
    // Página sem resultados e sem o aviso de "nenhum resultado": o layout mudou.
    if (!results.length && !NO_RESULTS.test(html)) throw new Error("Resposta do DuckDuckGo em formato desconhecido.");
    return results;
  });
}

const STOPWORDS = new Set(
  "a o as os um uma uns umas de do da dos das no na nos nas em por para pra com sem sobre entre que qual quais quanto quanta quantos como quando onde porque por que é e ou se eu me meu minha meus minhas você voce seu sua isso esse essa este esta mais menos muito pouco já ja ainda também tambem ter tem fazer faz vale pena hoje agora melhor melhores são sao ser está esta estão estao foi era fica devo posso quero preciso consigo algum alguma cada bom boa".split(" ")
);

function keywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

interface WikiPage {
  title: string;
  index?: number;
  extract?: string;
  fullurl?: string;
}

/** Último recurso sem chave: a Wikipédia em português (bom para conceitos, fraco para notícias). */
export async function wikipedia(query: string, max: number): Promise<SearchResult[]> {
  const words = keywords(query);
  const tries = [words.slice(0, 6).join(" "), words.slice(0, 3).join(" ")].filter((t, i, all) => t && all.indexOf(t) === i);
  for (const terms of tries) {
    const url =
      "https://pt.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&utf8=1" +
      `&generator=search&gsrsearch=${encodeURIComponent(terms)}&gsrlimit=${Math.min(max, 5)}` +
      "&prop=extracts%7Cinfo&inprop=url&exintro=1&explaintext=1&exlimit=max&exchars=1200";
    const res = await fetchWithTimeout(url, { headers: { Accept: "application/json", "Api-User-Agent": "Investa/1.0 (app de educação financeira)" } }, 10_000);
    if (!res.ok) throw new Error(`Wikipédia indisponível (HTTP ${res.status}).`);
    const json = JSON.parse(await readText(res, 10_000)) as { query?: { pages?: WikiPage[] } };
    const pages = (json.query?.pages ?? []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (pages.length) {
      return pages.map((p) => ({
        title: `${p.title} — Wikipédia`,
        url: p.fullurl ?? `https://pt.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
        content: (p.extract ?? "").replace(/\s+/g, " ").trim().slice(0, 1200),
      }));
    }
  }
  return [];
}

async function keyless(query: string, max: number, deep = true): Promise<SearchResult[]> {
  const errors: unknown[] = [];
  for (const kind of ["html", "lite"] as const) {
    if (Date.now() < ddgPauseUntil[kind]) continue;
    try {
      const results = await duckduckgo(kind, query, max);
      if (results.length) return deep ? enrich(results, 2) : results;
      break; // "nenhum resultado" de verdade: a versão lite diria o mesmo
    } catch (err) {
      errors.push(err);
      // Insistir durante o bloqueio só o prolonga: essa versão fica de lado por 10 minutos.
      if (err instanceof BlockedError) ddgPauseUntil[kind] = Date.now() + 10 * 60_000;
    }
  }
  try {
    return await wikipedia(query, max);
  } catch (err) {
    errors.push(err);
  }
  if (errors.length) throw new Error("Não deu para pesquisar agora. Verifique a conexão e tente de novo em alguns minutos.");
  return [];
}

// ---- texto completo das primeiras páginas ----

/** Texto legível de uma página HTML (sem menus, scripts e rodapés). */
export function htmlToText(html: string): string {
  let body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|form|nav|header|footer|aside|select|button)\b[\s\S]*?<\/\1>/gi, " ");
  const main = /<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(body)?.[2];
  if (main && main.length > 800) body = main;
  return decodeEntities(
    body
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** O app abre a página direto do aparelho: nada de endereços da rede local. */

async function readPage(url: string): Promise<string> {
  // Jina Reader devolve o texto limpo (sem chave, cerca de 20 páginas por minuto por aparelho).
  try {
    const res = await fetchWithTimeout(`https://r.jina.ai/${url}`, { headers: { Accept: "text/plain", "X-Return-Format": "text" } }, 9_000);
    if (res.ok) {
      const text = (await readText(res, 9_000)).replace(/\s+/g, " ").trim();
      if (text.length > 300) return text;
    }
  } catch {
    // tenta a página direto
  }
  if (!isPublicUrl(url)) return "";
  const res = await fetchWithTimeout(url, { headers: { Accept: "text/html,application/xhtml+xml" } }, 8_000);
  if (!res.ok || !/html|text\/plain/i.test(res.headers.get("content-type") ?? "text/html")) return "";
  return htmlToText((await readText(res, 8_000)).slice(0, 1_500_000)).replace(/\s+/g, " ");
}

/** Troca o resumo das primeiras páginas pelo texto delas, sem segurar a resposta mais que alguns segundos. */
async function enrich(results: SearchResult[], count: number): Promise<SearchResult[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((r) => {
    timer = setTimeout(r, 12_000);
  });
  let open = true;
  await Promise.all(
    results.slice(0, count).map((r) =>
      Promise.race([
        readPage(r.url)
          .then((text) => {
            if (open && text.length > r.content.length) r.content = text.slice(0, 2500);
          })
          .catch(() => undefined),
        deadline,
      ])
    )
  );
  open = false;
  clearTimeout(timer);
  return results;
}

// ---- entrada ----

let keyPauseUntil = 0;

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().slice(0, 300);
}

/**
 * Pesquisa com a chave (se houver) e, se ela falhar, sem chave. Buscas iguais
 * nos últimos minutos reaproveitam o resultado. Nunca falha: sem nada, devolve [].
 */
export async function webSearch(key: string | null | undefined, query: string, max = 5): Promise<SearchResult[]> {
  const q = normalizeQuery(query);
  if (!q) return [];
  const k = key?.trim() ?? "";
  return cached(`web:${max}:${q.toLowerCase()}`, CACHE_MS, async () => {
    if (k && Date.now() >= keyPauseUntil) {
      try {
        const results = await (searchProvider(k) === "tavily" ? tavily(k, q, max) : brave(k, q, max));
        if (results.length) return results;
      } catch (err) {
        // Cota acabou: deixa a chave de lado por uma hora; outros erros, por alguns minutos.
        keyPauseUntil = Date.now() + (err instanceof KeyError && err.quota ? 60 : 5) * 60_000;
      }
    }
    const results = await keyless(q, max);
    // Sem resultado não entra no cache: a próxima tentativa busca de novo.
    if (!results.length) throw new Error("sem resultados");
    return results;
  }).catch(() => [] as SearchResult[]);
}

/** Várias buscas para a mesma resposta (no máximo MAX_SEARCHES_PER_ANSWER), sem links repetidos. */
export async function webSearchMany(key: string | null | undefined, queries: string[], perQuery: number, total: number): Promise<SearchResult[]> {
  const all = await Promise.all(queries.slice(0, MAX_SEARCHES_PER_ANSWER).map((q) => webSearch(key, q, perQuery)));
  const seen = new Set<string>();
  return all.flat().filter((r) => !seen.has(r.url) && seen.add(r.url)).slice(0, total);
}

/** Teste das Configurações: com chave, testa só a chave (para mostrar se ela é inválida); sem chave, a busca grátis. */
export async function testSearch(key: string): Promise<number> {
  const k = key.trim();
  const q = "como começar a investir com pouco dinheiro";
  if (k) {
    const results = await (searchProvider(k) === "tavily" ? tavily(k, q, 2) : brave(k, q, 2));
    keyPauseUntil = 0;
    return results.length;
  }
  const results = await keyless(q, 3, false);
  if (!results.length) throw new Error("A pesquisa não trouxe resultados agora. Tente de novo em alguns minutos.");
  return results.length;
}

/** Resultados em texto para o contexto da IA, numerados para ela citar [1], [2]… */
export function resultsToContext(results: SearchResult[]): string {
  if (!results.length) return "";
  return [
    "# Resultados da pesquisa na internet (cite como [1], [2]… e só use o que estiver aqui; não invente links)",
    ...results.map((r, i) => `[${i + 1}] ${r.title} — ${r.url}\n${r.content}`),
  ].join("\n\n");
}

/** Princípios de livros conhecidos de finanças pessoais, resumidos com palavras próprias. */
export const BOOK_PRINCIPLES = `# Princípios de livros de finanças pessoais (base do app, sempre disponível)
- "O Homem Mais Rico da Babilônia" (George S. Clason): guarde pelo menos 10% de tudo o que ganhar antes de gastar; faça o dinheiro guardado trabalhar; proteja o patrimônio de riscos que você não entende.
- "Pai Rico, Pai Pobre" (Robert Kiyosaki): diferencie ativos (colocam dinheiro no bolso) de passivos (tiram); invista em educação financeira; aumente a renda e compre ativos antes de luxos.
- "Os Segredos da Mente Milionária" (T. Harv Eker): separe a renda em potes (necessidades, liberdade financeira, educação, diversão, longo prazo, doação); o hábito importa mais que o valor.
- "Me Poupe!" (Nathalia Arcuri): conheça seus gastos, monte a reserva de emergência antes de investir em renda variável, defina sonhos com valor e prazo.
- "Do Mil ao Milhão" (Thiago Nigro): gaste bem, invista melhor e ganhe mais; juros compostos e aportes constantes; diversificação de acordo com o perfil.
- "A Psicologia Financeira" (Morgan Housel): tempo e constância vencem acertos pontuais; evite decisões por impulso; margem de segurança e liberdade de tempo são o verdadeiro objetivo.
- "Investidor Inteligente" (Benjamin Graham): diferencie investir de especular; margem de segurança; não deixe o humor do mercado ditar suas decisões.
- "O Investidor de Bogle" (John Bogle): custos baixos e fundos/índices diversificados; ficar no mercado por muito tempo.`;
