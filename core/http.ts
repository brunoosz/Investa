import type { FileStore } from "./platform";
export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class HttpError extends Error {
  constructor(public status: number, public url: string, body?: string) {
    super(`HTTP ${status} em ${new URL(url).host}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }
}

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

let browserFetch: FetchImpl | null = null;
let cacheFiles: FileStore | null = null;
let streamFetch: FetchImpl | null = null;

let bufferedCheck: (url: string) => boolean = () => false;

/**
 * No celular, a IA usa o fetch do WebView para receber a resposta em streaming;
 * quando ele não está disponível para aquele servidor, a rede nativa entrega a
 * resposta inteira de uma vez ("buffered"), e a IA espera mais por ela.
 */
export function setStreamFetch(fn: FetchImpl, buffered?: (url: string) => boolean): void {
  streamFetch = fn;
  if (buffered) bufferedCheck = buffered;
}

export function isBufferedStream(url: string): boolean {
  return bufferedCheck(url);
}

export function fetchStream(url: string, init: RequestInit): Promise<Response> {
  return streamFetch ? streamFetch(url, init) : fetch(url, init);
}

/** Arquivos onde ficam as últimas respostas boas das fontes lentas (Tesouro, juros de crédito). */
export function setCacheFiles(files: FileStore): void {
  cacheFiles = files;
}

export function readDiskCache<T>(name: string, maxAgeMs: number): T | null {
  try {
    const raw = cacheFiles?.read(name);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { savedAt: number; data: T };
    return Date.now() - saved.savedAt <= maxAgeMs ? saved.data : null;
  } catch {
    return null;
  }
}

export function writeDiskCache(name: string, data: unknown): void {
  try {
    cacheFiles?.write(name, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // sem disco: segue só com o cache em memória
  }
}
const BROWSER_HOSTS = new Set(["olinda.bcb.gov.br", "www.tesourodireto.com.br", "api.bcb.gov.br", "store.steampowered.com", "html.duckduckgo.com", "lite.duckduckgo.com"]);

/** Lojas: a rede do Chromium passa por mais bloqueios anti-robô do que a do Node. */
const STORE_HOSTS = /(^|\.)(mercadolivre\.com\.br|mercadolibre\.com|meli\.la|amazon\.com\.br|amzn\.to|a\.co|shopee\.com\.br|aliexpress\.com|kabum\.com\.br|magazineluiza\.com\.br|epicgames\.com)$/i;

/** Servidores da IA: no PC, se a rede do Node falhar, tentam de novo pela do Chromium. */
const AI_HOSTS = /(^|\.)(api\.groq\.com|api\.nvidia\.com)$/i;

/**
 * Usa `primary` e, se ele não conseguir conectar (proxy do Windows, antivírus)
 * ou se um firewall devolver a página de bloqueio (403 em HTML), tenta `backup`.
 */
export function fallbackFetch(primary: FetchImpl, backup: FetchImpl): FetchImpl {
  return async (url, init) => {
    let res: Response;
    try {
      res = await primary(url, init);
    } catch (err) {
      if (init.signal?.aborted) throw err;
      return backup(url, init);
    }
    if (res.status === 403 && /text\/html/i.test(res.headers.get("content-type") ?? "")) {
      void res.body?.cancel().catch(() => undefined);
      return backup(url, init);
    }
    return res;
  };
}

/** No app desktop, usa a pilha de rede do Chromium para servidores que bloqueiam clientes que não são navegadores. */
export function setBrowserFetch(fn: FetchImpl): void {
  browserFetch = fn;
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 12_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const host = new URL(url).host;
  const node: FetchImpl = (u, i) => fetch(u, i);
  const impl: FetchImpl = !browserFetch ? node : BROWSER_HOSTS.has(host) || STORE_HOSTS.test(host) ? browserFetch : AI_HOSTS.test(host) ? fallbackFetch(node, browserFetch) : node;
  try {
    return await impl(url, {
      ...init,
      signal: init.signal ?? ctrl.signal,
      headers: { "User-Agent": UA, Accept: "*/*", "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8", ...(init.headers as Record<string, string>) },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Lê o corpo com prazo: o tempo-limite do fetch acaba quando chegam os cabeçalhos. */
export function readText(res: Response, ms = 15_000): Promise<string> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    res.text().finally(() => clearTimeout(timer)),
    new Promise<string>((_, reject) => {
      timer = setTimeout(() => {
        void res.body?.cancel().catch(() => undefined);
        reject(new Error("A resposta demorou demais."));
      }, ms);
    }),
  ]);
}

export async function getJson<T>(url: string, init: RequestInit = {}, timeoutMs?: number): Promise<T> {
  const res = await fetchWithTimeout(url, { ...init, headers: { Accept: "application/json", ...(init.headers as Record<string, string>) } }, timeoutMs);
  if (!res.ok) throw new HttpError(res.status, url, await readText(res, 5_000).catch(() => ""));
  return JSON.parse(await readText(res, timeoutMs ?? 15_000)) as T;
}

export async function getText(url: string, init: RequestInit = {}, timeoutMs?: number): Promise<string> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  if (!res.ok) throw new HttpError(res.status, url);
  return readText(res, timeoutMs ?? 15_000);
}

interface CacheEntry<T> {
  value?: T;
  at: number;
  pending?: Promise<T>;
}

const cache = new Map<string, CacheEntry<unknown>>();

/** Cache com TTL, deduplicação de requisições e retorno do último valor válido em caso de falha. */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();
  if (entry?.value !== undefined && now - entry.at < ttlMs) return entry.value;
  if (entry?.pending) return entry.pending;
  const pending = loader()
    .then((value) => {
      cache.set(key, { value, at: Date.now() });
      return value;
    })
    .catch((err) => {
      const prev = cache.get(key) as CacheEntry<T> | undefined;
      if (prev?.value !== undefined) {
        cache.set(key, { value: prev.value, at: prev.at });
        return prev.value;
      }
      cache.delete(key);
      throw err;
    });
  cache.set(key, { ...(entry ?? { at: 0 }), pending });
  return pending;
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export function brDateToIso(d: string): string {
  const [day, month, year] = d.split("/");
  return `${year}-${month}-${day}`;
}

export function isoToBrDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function nowInSaoPaulo(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

export function todayIsoSaoPaulo(): string {
  const d = nowInSaoPaulo();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Endereço público (https/http na internet), nunca localhost, rede interna ou IP reservado. */
export function isPublicUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase();
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || host.startsWith("[") || !host.includes(".")) return false;
  if (/(^|\.)(localhost|local|internal|lan|home|arpa)$/.test(host)) return false;
  const ip = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host)?.slice(1).map(Number);
  if (!ip) return true;
  const [a, b] = ip;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
}

/**
 * Busca uma URL que veio do usuário: só endereços públicos e confere cada
 * redirecionamento (um link curto não pode levar para a rede interna).
 */
export async function fetchPublic(url: string, init: RequestInit = {}, timeoutMs = 12_000, maxHops = 5): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= maxHops; hop++) {
    if (!isPublicUrl(current)) throw new Error("Endereço não permitido.");
    const res = await fetchWithTimeout(current, { ...init, redirect: "manual" }, timeoutMs);
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) {
      // Onde o redirecionamento manual não existe (rede nativa do celular), confere o destino final.
      if (res.url && !isPublicUrl(res.url)) throw new Error("Endereço não permitido.");
      return res;
    }
    current = new URL(location, current).toString();
  }
  throw new Error("Redirecionamentos demais.");
}
