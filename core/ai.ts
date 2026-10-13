import type { AiCatalog, AiConfigInfo, AiLogEntry, AiProvider, AiProviderHealth } from "@shared/types";
import type { Store } from "./store";
import type { Platform } from "./platform";
import type { AiCloudConfig } from "./cloud";
import { AppError } from "./auth";
import { fetchStream, fetchWithTimeout, isBufferedStream } from "./http";
import { searchProvider } from "./search";
import { describeGroq, describeModels, directAnswerTweaks, FALLBACK_MODELS, groqChatModels, groqLabel, isReasoning, modelLabel, pickBest } from "./models";

export const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const CATALOG_TTL = 24 * 3600_000;
/** Quanto tempo um modelo que falhou fica de fora (a escolha salva não muda). */
const COOLDOWN_MS = 15 * 60_000;
/** Limite por minuto (429): na Groq o limite é por modelo, então outro modelo pode responder já. */
const RATE_COOLDOWN_MS = 90_000;
/** Prazo para o servidor aceitar o pedido e começar a enviar. */
const CONNECT_MS = 20_000;
/** Prazo até a primeira palavra da resposta (modelos de raciocínio pensam antes). */
const FIRST_TEXT_MS = 60_000;
const FIRST_TEXT_REASONING_MS = 150_000;
/** Sem streaming (rede nativa do celular) a resposta inteira chega de uma vez. */
const BUFFERED_MS = 180_000;
/** Silêncio máximo entre um trecho e outro. */
const IDLE_MS = 30_000;
const MAX_TARGETS = 5;
/** Quantas vezes pedir a continuação de uma resposta cortada pelo limite de tamanho. */
const MAX_CONTINUATIONS = 3;
export const CHAT_MAX_TOKENS = 8192;
/** A conta grátis da Groq conta o max_tokens no limite por minuto; o resto vem por continuação. */
const GROQ_MAX_TOKENS = 4096;

const NO_KEY_MESSAGE = "A IA ainda não foi configurada. O Dono do app precisa colocar a chave da Groq ou da NVIDIA em Configurações → Inteligência Artificial.";
const OFFLINE_MESSAGE = "Sem conexão com o serviço de IA. Verifique sua internet.";
const TRANSLATE_PROMPT =
  "Você traduz textos para o português do Brasil. Mantenha a formatação Markdown, os números, os nomes próprios e os links. Responda só com a tradução, sem comentários.";
const CONTINUE_PROMPT =
  "Sua resposta foi cortada pelo limite de tamanho. Continue exatamente do ponto onde parou, em português do Brasil, sem repetir o que já escreveu e sem introdução. Se parou no meio de uma frase, palavra ou tabela, complete a partir dali.";
const STRICT_PT = "IMPORTANTE: escreva a resposta inteira em português do Brasil. Não use inglês em nenhuma parte.";

interface ResolvedConfig {
  key: string | null;
  /** "auto" ou o id escolhido pelo Dono. */
  choice: string;
  model: string;
  baseUrl: string;
  source: AiConfigInfo["source"];
}

/** Um modelo de um provedor, pronto para receber o pedido. */
interface Target {
  provider: AiProvider;
  model: string;
  key: string;
  baseUrl: string;
  /** Identifica o modelo nas pausas, nos logs e na lista de aposentados ("groq:" na frente para a Groq). */
  id: string;
}

export interface AiConfigPatch {
  apiKey?: string | null;
  model?: string;
  baseUrl?: string;
  searchKey?: string | null;
  groqKey?: string | null;
  groqModel?: string;
  primary?: AiProvider;
}

export interface StreamOptions {
  /** Avisado com o nome do modelo quando ele começa a responder. */
  onModel?: (label: string) => void;
  /** Recebe o texto inteiro corrigido quando um trecho em inglês foi traduzido no fim. */
  onReplace?: (text: string) => void;
  /** Usa só este provedor (teste da chave). */
  only?: AiProvider;
  /** false: não confere se a resposta veio em português. */
  language?: boolean;
}

export type ChatMessageIn = { role: "system" | "user" | "assistant"; content: string };

/** Nome para mostrar: "Llama 3.3 70B · Groq", "DeepSeek V4 Flash · NVIDIA". */
export function targetLabel(id: string): string {
  return id.startsWith("groq:") ? `${groqLabel(id.slice(5))} · Groq` : `${modelLabel(id)} · NVIDIA`;
}

const EN_WORDS = new Set(
  "the and of to is are was were be been you your it its this that these those for with on at by from but not have has had will would can could should what which how why when if or than then there their they we our i my he she his her them an".split(" ")
);
const PT_WORDS = new Set(
  "de que o os e é um uma para com não na nas nos da das dos por se mais seu sua seus suas você vocês como mas ou já está estão são isso esse essa este esta muito também pode quando ao aos às pelo pela foi ser ter tem até sobre ele ela eles elas meu minha nosso nossa".split(" ")
);

/** Conta palavras muito comuns de cada idioma, ignorando código e links. */
function languageScore(text: string): { en: number; pt: number; words: number } {
  const words =
    text
      .replace(/```[\s\S]*?(```|$)/g, " ")
      .replace(/`[^`]*`/g, " ")
      .replace(/https?:\/\/[^\s)]+/g, " ")
      .toLowerCase()
      .match(/[a-zà-öø-ÿ']+/g) ?? [];
  let en = 0;
  let pt = 0;
  for (const w of words) {
    if (EN_WORDS.has(w)) en++;
    else if (PT_WORDS.has(w)) pt++;
  }
  return { en, pt, words: words.length };
}

export function looksEnglish(text: string): boolean {
  const { en, pt, words } = languageScore(text);
  return words >= 8 && en >= 4 && en >= pt * 3 + 2;
}

/**
 * Onde a resposta passa a ser inglês (alguns modelos "esquecem" o português no
 * meio de respostas longas). -1 quando ela segue em português até o fim.
 */
export function englishFrom(text: string): number {
  const starts = [0, ...[...text.matchAll(/\n{2,}/g)].map((m) => m.index! + m[0].length)];
  for (let i = 1; i < starts.length; i++) {
    const para = text.slice(starts[i], starts[i + 1] ?? text.length);
    if (looksEnglish(para) && looksEnglish(text.slice(starts[i]))) return starts[i];
  }
  return -1;
}

const MEMORY_TAGS = /\[\[\s*lembrar\s*:[^\]]*\]\]/gi;

/** A pessoa escreveu em outro idioma ou pediu um texto em outro idioma: aí o português não é forçado. */
export function wantsOtherLanguage(text: string): boolean {
  const { en, pt, words } = languageScore(text);
  if (looksEnglish(text) || (words >= 3 && en >= 2 && pt === 0)) return true;
  return /\b(ingl[eê]s|english|espanhol|spanish|franc[eê]s|french|alem[aã]o|italiano|japon[eê]s|chin[eê]s|traduz|tradu[cç])/i.test(text);
}

/** Segura o começo da resposta até dar para saber o idioma (cerca de 140 letras, menos de um segundo). */
class LanguageGate {
  private held = "";
  private open = false;

  /** Texto liberado ("" enquanto segura) ou null se a resposta está em inglês. */
  push(d: string): string | null {
    if (this.open) return d;
    this.held += d;
    return this.held.length < 140 ? "" : this.decide();
  }

  end(): string | null {
    return this.open ? "" : this.decide();
  }

  private decide(): string | null {
    if (looksEnglish(this.held)) return null;
    this.open = true;
    const out = this.held;
    this.held = "";
    return out;
  }
}

/**
 * Junta a continuação de uma resposta cortada. Alguns modelos reescrevem o
 * trecho final antes de seguir; essa repetição é descartada.
 */
export function joinContinuation(prev: string, next: string): string {
  const tail = prev.slice(-500);
  for (let k = Math.min(tail.length, next.length); k >= 8; k--) {
    if (tail.endsWith(next.slice(0, k))) return next.slice(k);
  }
  if (!prev || /\s$/.test(prev) || /^[\s.,;:!?)\]}]/.test(next)) return next;
  if (/^#{1,6}\s/.test(next)) return `\n\n${next}`;
  if (/^([-*+]\s|\d+[.)]\s|\|)/.test(next)) return `\n${next}`;
  if (/[\p{L}\p{N}*]$/u.test(prev) && /^\p{Lu}/u.test(next)) return ` ${next}`;
  return next;
}

class ContinuationJoin {
  private buf = "";
  private done = false;
  constructor(private prev: string) {}

  push(d: string): string {
    if (this.done) return d;
    this.buf += d;
    // Enquanto o começo ainda pode ser a repetição do final anterior, espera.
    const tail = this.prev.slice(-500);
    if (this.buf.length < tail.length && tail.includes(this.buf)) return "";
    return this.flush();
  }

  flush(): string {
    if (this.done) return "";
    this.done = true;
    const out = joinContinuation(this.prev, this.buf);
    this.buf = "";
    return out;
  }
}

function continuationMessages(base: ChatMessageIn[], written: string, provider: AiProvider): ChatMessageIn[] {
  const limit = provider === "groq" ? 6000 : 16000;
  const shown = written.length > limit ? `…${written.slice(-limit)}` : written;
  return [...base, { role: "assistant", content: shown }, { role: "user", content: CONTINUE_PROMPT }];
}

/** Reforça o português na mensagem de sistema e na última pergunta. */
function strictMessages(messages: ChatMessageIn[]): ChatMessageIn[] {
  const out = messages.map((m) => ({ ...m }));
  const sys = out.find((m) => m.role === "system");
  if (sys) sys.content = `${STRICT_PT}\n\n${sys.content}\n\n${STRICT_PT}`;
  else out.unshift({ role: "system", content: STRICT_PT });
  const last = [...out].reverse().find((m) => m.role === "user");
  if (last) last.content = `${last.content}\n\n(Responda em português do Brasil.)`;
  return out;
}

const isAbort = (err: unknown) => (err as Error | undefined)?.name === "AbortError";
const preview = (key: string, head: number) => `${key.slice(0, head)}••••${key.slice(-4)}`;

/** Começos típicos de modelos que escrevem o raciocínio como texto, sem as tags <think>. */
const THINKING_START =
  /^\s*(\*\*)?(here'?s (a|my) (thinking|thought) process|thinking process|thought process|okay[,.!]\s+(so|let|the|i|we|here)\b|alright[,.]\s|let me |let's |we need to |the user |i need to |i will |i'll |first,? i |\d\.\s+\*\*analy[sz]e)/i;

export class ThinkFilter {
  private buf = "";
  private inThink = false;
  private started = false;
  /** Início da resposta guardado até saber se é raciocínio ou resposta. */
  private lead: string | null = "";

  push(s: string): string {
    if (this.lead !== null) {
      this.lead += s;
      const close = this.lead.indexOf("</think>");
      if (close >= 0) {
        // Raciocínio sem a tag de abertura: descarta tudo até o fechamento.
        const rest = this.lead.slice(close + "</think>".length);
        this.lead = null;
        return this.process(rest);
      }
      if (this.lead.trimStart().length < 60) return "";
      if (THINKING_START.test(this.lead) && !this.lead.includes("<think>")) return "";
      const all = this.lead;
      this.lead = null;
      return this.process(all);
    }
    return this.process(s);
  }

  private process(s: string): string {
    this.buf += s;
    let out = "";
    for (;;) {
      const tag = this.inThink ? "</think>" : "<think>";
      const i = this.buf.indexOf(tag);
      if (i >= 0) {
        if (!this.inThink) out += this.buf.slice(0, i);
        this.buf = this.buf.slice(i + tag.length);
        this.inThink = !this.inThink;
        continue;
      }
      let keep = 0;
      for (let k = Math.min(tag.length - 1, this.buf.length); k > 0; k--) {
        if (tag.startsWith(this.buf.slice(-k))) {
          keep = k;
          break;
        }
      }
      if (!this.inThink) out += this.buf.slice(0, this.buf.length - keep);
      this.buf = this.buf.slice(this.buf.length - keep);
      break;
    }
    if (!this.started) {
      out = out.replace(/^\s+/, "");
      if (out) this.started = true;
    }
    return out;
  }

  flush(): string {
    if (this.lead !== null) {
      const lead = this.lead;
      this.lead = null;
      // Só raciocínio, sem resposta: devolve vazio para o app tentar outro modelo.
      if (THINKING_START.test(lead)) return "";
      return this.process(lead) + this.flush();
    }
    const rest = this.inThink ? "" : this.buf;
    this.buf = "";
    return rest;
  }
}

export const providerName = (provider: AiProvider) => (provider === "groq" ? "Groq" : "NVIDIA");
const providerOf = (id: string): AiProvider => (id.startsWith("groq:") ? "groq" : "nvidia");

/** O que o provedor disse, numa linha: "Groq: 401 Invalid API Key". */
export function providerLine(provider: AiProvider, status: number, body: string): string {
  let msg = body;
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string; message?: string; detail?: string };
    msg = (typeof j.error === "string" ? j.error : j.error?.message) ?? j.message ?? j.detail ?? body;
  } catch {
    // corpo em texto ou HTML
  }
  msg = msg.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  return `${providerName(provider)}: ${status}${msg ? ` ${msg}` : ""}`;
}

type ProviderError = AppError & { status?: number; detail?: string; line?: string };

function friendlyError(status: number, body: string, provider: AiProvider): ProviderError {
  return Object.assign(friendlyBase(status, body, provider), { status, detail: body.slice(0, 400), line: providerLine(provider, status, body) });
}

function friendlyBase(status: number, body: string, provider: AiProvider): AppError {
  const name = providerName(provider);
  // 403 em HTML vem do firewall (Cloudflare) na frente da API, não da chave.
  if (status === 403 && /<html|error code: 10\d\d|cloudflare/i.test(body)) {
    return new AppError("AI_BLOCKED", `A ${name} recusou a conexão desta rede (403). Tente outra internet ou use o outro provedor.`);
  }
  if (status === 401 || status === 403) return new AppError("AI_AUTH", `Chave da ${name} inválida ou sem permissão. Confira em Configurações → Inteligência Artificial.`);
  if (status === 404 || status === 410 || /model_decommissioned|model_not_found|does not exist/i.test(body)) {
    return new AppError("AI_MODEL", "Nenhum modelo de IA disponível respondeu. Atualize a lista em Configurações → Inteligência Artificial.");
  }
  if (status === 413) return new AppError("AI_BIG", "A conversa ficou grande demais para este modelo.");
  if (status === 429) return new AppError("AI_RATE", "Limite de uso da API atingido. Aguarde alguns instantes e tente de novo.");
  if (status >= 500) return new AppError("AI_DOWN", "O serviço de IA está instável agora. Tente novamente em instantes.");
  // 400/422: o modelo não aceitou algo do pedido; trata como fora do ar e tenta outro.
  const said = providerLine(provider, status, body);
  if (status === 400 || status === 422) return new AppError("AI_DOWN", `Erro da IA (${said})`);
  return new AppError("AI_ERROR", `Erro da IA (${said})`);
}

export class AiService {
  /** Chamado quando o modelo escolhido pelo Dono sumiu da lista do provedor. */
  onModelChange?: (from: string, to: string, reason: string) => void;
  /** Muda a cada alteração feita neste aparelho: a sincronização não aplica por cima uma versão buscada antes. */
  version = 0;
  /** Modelos que recusaram os ajustes de "responder direto" (erro 400): seguem sem eles. */
  private plain = new Set<string>();

  constructor(private store: Store, private platform: Platform) {}

  private get stored() {
    return this.store.app.ai ?? {};
  }

  private patch(p: Partial<NonNullable<Store["app"]["ai"]>>): void {
    this.store.app.ai = { ...this.stored, ...p };
    this.store.save();
  }

  private decrypt(data: string | undefined, mode: "safe" | "plain" | undefined): string | null {
    if (!data) return null;
    try {
      return this.platform.secrets.decrypt(data, mode ?? "plain");
    } catch {
      return null;
    }
  }

  resolve(): ResolvedConfig {
    const stored = this.stored;
    const file = this.platform.aiFileConfig?.() ?? null;
    const baseUrl = (stored.baseUrl || file?.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    const choice = stored.model || file?.model || "auto";

    let key = this.decrypt(stored.apiKeyEnc, stored.keyMode);
    let source: AiConfigInfo["source"] = key ? "app" : null;
    const fileKey = file?.nvidiaApiKey || file?.apiKey;
    if (!key && fileKey && !fileKey.includes("COLE")) {
      key = fileKey.trim();
      source = "arquivo";
    }
    const envKey = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NVIDIA_API_KEY;
    if (!key && envKey) {
      key = envKey.trim();
      source = "ambiente";
    }
    return { key, choice, model: this.nvidiaModels(choice)[0] ?? FALLBACK_MODELS[0], baseUrl, source };
  }

  /** Chave da Groq salva no app (a que vai para a nuvem). */
  private storedGroqKey(): string | null {
    return this.decrypt(this.stored.groqKeyEnc, this.stored.groqKeyMode);
  }

  groqKey(): string | null {
    const stored = this.storedGroqKey();
    if (stored) return stored;
    const fileKey = this.platform.aiFileConfig?.()?.groqApiKey;
    if (fileKey && fileKey.startsWith("gsk_")) return fileKey.trim();
    const envKey = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.GROQ_API_KEY;
    return envKey?.trim() || null;
  }

  /** Chave da pesquisa na internet, se o Dono configurou. */
  searchKey(): string | null {
    return this.decrypt(this.stored.searchKeyEnc, this.stored.searchKeyMode);
  }

  private primary(): AiProvider {
    return this.stored.primary ?? "groq";
  }

  /**
   * Ordem dos modelos da NVIDIA: o escolhido pelo Dono primeiro; no automático,
   * o ranking (rápidos primeiro). Modelos que falharam há pouco ficam de fora só
   * desta vez: a escolha salva nunca muda sozinha.
   */
  private nvidiaModels(choice: string): string[] {
    const retired = new Set(this.stored.retired ?? []);
    const cooling = new Set(this.cooling());
    const ids = this.stored.catalog?.ids;
    const ranked = ids?.length ? describeModels(ids).map((m) => m.id) : FALLBACK_MODELS;
    const list = (skip: (id: string) => boolean) => [...new Set([...(choice !== "auto" ? [choice] : []), ...ranked])].filter((id) => !skip(id));
    const ready = list((id) => retired.has(id) || cooling.has(id));
    return ready.length ? ready : list((id) => retired.has(id));
  }

  /** Com `health` false (teste de uma chave nova), ignora as falhas da chave anterior. */
  private groqModels(ids = this.stored.groqCatalog?.ids, health = true): string[] {
    const retired = new Set(health ? this.stored.retired ?? [] : []);
    const cooling = new Set(health ? this.cooling() : []);
    const choice = this.stored.groqModel || "auto";
    const known = groqChatModels(ids);
    const list = (skip: (id: string) => boolean) => [...new Set([...(choice !== "auto" ? [choice] : []), ...known])].filter((id) => !skip(`groq:${id}`));
    const ready = list((id) => retired.has(id) || cooling.has(id));
    return ready.length ? ready : list((id) => retired.has(id));
  }

  /** Quem tenta responder, em ordem: o provedor preferido primeiro, o outro como reserva. */
  private targets(only?: AiProvider): Target[] {
    const r = this.resolve();
    const groq = this.groqKey();
    const nvidia: Target[] =
      r.key && only !== "groq" ? this.nvidiaModels(r.choice).slice(0, 3).map((model) => ({ provider: "nvidia", model, key: r.key!, baseUrl: r.baseUrl, id: model })) : [];
    const fast: Target[] =
      groq && only !== "nvidia" ? this.groqModels().slice(0, 3).map((model) => ({ provider: "groq", model, key: groq, baseUrl: GROQ_BASE_URL, id: `groq:${model}` })) : [];
    return (this.primary() === "nvidia" ? [...nvidia, ...fast] : [...fast, ...nvidia]).slice(0, MAX_TARGETS);
  }

  info(canManage: boolean): AiConfigInfo {
    const r = this.resolve();
    const groq = this.groqKey();
    const search = this.searchKey();
    const hasKey = !!r.key || !!groq;
    if (!canManage) return { hasKey, canManage, hasSearch: true };
    const first = this.targets()[0];
    return {
      hasKey,
      canManage,
      choice: r.choice,
      model: first?.model ?? r.model,
      modelLabel: first ? targetLabel(first.id) : modelLabel(r.model),
      hasNvidia: !!r.key,
      keyPreview: r.key ? preview(r.key, 6) : undefined,
      baseUrl: r.baseUrl,
      source: r.source,
      catalogUpdatedAt: this.stored.catalog?.updatedAt,
      hasGroq: !!groq,
      groqPreview: groq ? preview(groq, 4) : undefined,
      groqChoice: this.stored.groqModel || "auto",
      primary: this.primary(),
      lastUsedLabel: this.stored.lastUsed ? targetLabel(this.stored.lastUsed) : undefined,
      providers: { groq: this.health("groq"), nvidia: this.health("nvidia") },
      hasSearch: true,
      searchProvider: search ? searchProvider(search) : undefined,
      searchPreview: search ? preview(search, 5) : undefined,
    };
  }

  /** Última resposta boa e último erro de cada provedor, tirados do log deste aparelho. */
  private health(provider: AiProvider): AiProviderHealth {
    const log = (this.store.app.aiLog ?? []).filter((l) => l.model !== "-" && providerOf(l.model) === provider);
    const ok = log.find((l) => l.kind === "ok");
    const err = log.find((l) => l.kind === "erro");
    return { okAt: ok?.at, error: err ? { at: err.at, message: err.message ?? err.code ?? "Falhou" } : undefined };
  }

  /** Mudança feita pelo Dono (ou trazida da nuvem, com a data de lá). */
  setConfig(patch: AiConfigPatch, opts: { changedAt?: string; fromCloud?: boolean } = {}): void {
    const current = { ...this.stored };
    if (patch.apiKey === null || patch.apiKey === "") {
      delete current.apiKeyEnc;
      delete current.keyMode;
    } else if (patch.apiKey) {
      const { data, mode } = this.platform.secrets.encrypt(patch.apiKey.trim());
      current.apiKeyEnc = data;
      current.keyMode = mode;
      // Chave nova: a lista de modelos pode ser outra.
      delete current.catalog;
      current.retired = (current.retired ?? []).filter((id) => id.startsWith("groq:"));
      current.cooldown = Object.fromEntries(Object.entries(current.cooldown ?? {}).filter(([id]) => id.startsWith("groq:")));
    }
    if (patch.groqKey === null || patch.groqKey === "") {
      delete current.groqKeyEnc;
      delete current.groqKeyMode;
    } else if (patch.groqKey) {
      const { data, mode } = this.platform.secrets.encrypt(patch.groqKey.trim());
      current.groqKeyEnc = data;
      current.groqKeyMode = mode;
      delete current.groqCatalog;
      // As falhas da chave anterior não valem para a nova.
      current.retired = (current.retired ?? []).filter((id) => !id.startsWith("groq:"));
      current.cooldown = Object.fromEntries(Object.entries(current.cooldown ?? {}).filter(([id]) => !id.startsWith("groq:")));
      for (const id of [...this.plain]) if (id.startsWith("groq:")) this.plain.delete(id);
    }
    if (patch.searchKey === null || patch.searchKey === "") {
      delete current.searchKeyEnc;
      delete current.searchKeyMode;
    } else if (patch.searchKey) {
      const { data, mode } = this.platform.secrets.encrypt(patch.searchKey.trim());
      current.searchKeyEnc = data;
      current.searchKeyMode = mode;
    }
    if (patch.model !== undefined) current.model = patch.model.trim() || "auto";
    if (patch.groqModel !== undefined) current.groqModel = patch.groqModel.trim() || "auto";
    if (patch.primary === "groq" || patch.primary === "nvidia") current.primary = patch.primary;
    if (patch.baseUrl !== undefined) current.baseUrl = patch.baseUrl.trim() || undefined;
    current.changedAt = opts.changedAt ?? (opts.fromCloud ? current.changedAt : new Date().toISOString());
    if (!opts.fromCloud) this.version++;
    this.store.app.ai = current;
    this.store.save();
  }

  /**
   * O que sobe para a nuvem. Com `patch`, só o que o Dono acabou de mudar: um
   * aparelho que ainda não recebeu a chave da Groq não pode apagá-la da nuvem
   * ao salvar a da NVIDIA (e vice-versa). As chaves vindas de arquivo ou
   * variável de ambiente ficam só neste aparelho.
   */
  cloudConfig(patch?: AiConfigPatch): AiCloudConfig {
    const r = this.resolve();
    const s = this.stored;
    const groq = this.storedGroqKey();
    const full: AiCloudConfig = {
      apiKey: r.source === "app" ? r.key : r.key ? undefined : null,
      model: r.choice,
      baseUrl: s.baseUrl ?? "",
      searchKey: this.searchKey(),
      groqKey: groq ?? (this.groqKey() ? undefined : null),
      groqModel: s.groqModel || "auto",
      primary: s.primary,
      changedAt: s.changedAt,
    };
    if (!patch) return full;
    const out: AiCloudConfig = { changedAt: s.changedAt };
    for (const k of ["apiKey", "model", "baseUrl", "searchKey", "groqKey", "groqModel", "primary"] as const) {
      if (patch[k] === null || (patch[k] === "" && k.endsWith("Key"))) Object.assign(out, { [k]: null });
      else if (patch[k] !== undefined && full[k] !== undefined) Object.assign(out, { [k]: full[k] });
    }
    return out;
  }

  /**
   * Aplica a configuração da nuvem só se ela for mais nova que a deste
   * aparelho. Uma versão mais antiga não desfaz a escolha do Dono; dela só se
   * recuperam as chaves que este aparelho perdeu.
   */
  applyCloud(ai: AiCloudConfig): void {
    const s = this.stored;
    const r = this.resolve();
    const localAt = s.changedAt;
    const newer = !localAt || (!!ai.changedAt && ai.changedAt > localAt);
    const groq = this.storedGroqKey();
    const search = this.searchKey();
    const patch: AiConfigPatch = {};
    if (newer) {
      if (ai.apiKey !== undefined && (ai.apiKey || null) !== (r.source === "app" ? r.key : null)) patch.apiKey = ai.apiKey || null;
      if (ai.groqKey !== undefined && (ai.groqKey || null) !== groq) patch.groqKey = ai.groqKey || null;
      if (ai.searchKey !== undefined && (ai.searchKey || null) !== search) patch.searchKey = ai.searchKey || null;
      if (ai.model !== undefined && ai.model !== r.choice) patch.model = ai.model;
      if (ai.groqModel !== undefined && ai.groqModel !== (s.groqModel || "auto")) patch.groqModel = ai.groqModel;
      if (ai.primary !== undefined && ai.primary !== s.primary) patch.primary = ai.primary;
      if (ai.baseUrl !== undefined && (ai.baseUrl || undefined) !== (s.baseUrl || undefined)) patch.baseUrl = ai.baseUrl ?? "";
    } else {
      if (ai.apiKey && !r.key) patch.apiKey = ai.apiKey;
      if (ai.groqKey && !groq) patch.groqKey = ai.groqKey;
      if (ai.searchKey && !search) patch.searchKey = ai.searchKey;
    }
    const stamp = newer && ai.changedAt && ai.changedAt !== localAt;
    if (Object.keys(patch).length || stamp) this.setConfig(patch, { fromCloud: true, changedAt: newer ? ai.changedAt ?? localAt : localAt });
  }

  private async listModels(baseUrl: string, key: string, provider: AiProvider): Promise<string[]> {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } }, 20_000);
    } catch {
      throw Object.assign(new AppError("AI_OFFLINE", OFFLINE_MESSAGE), { line: `${providerName(provider)}: sem conexão` });
    }
    if (!res.ok) throw friendlyError(res.status, await res.text().catch(() => ""), provider);
    const json = (await res.json()) as { data?: { id: string }[] };
    return (json.data ?? []).map((m) => m.id);
  }

  /** Lista os modelos das contas (uma vez por dia, ou quando pedido). */
  async catalog(force = false): Promise<AiCatalog> {
    const r = this.resolve();
    const groq = this.groqKey();
    const fresh = (c?: { updatedAt: string }) => !!c && Date.now() - Date.parse(c.updatedAt) < CATALOG_TTL;
    const errors: unknown[] = [];
    let tried = 0;
    if (r.key && (force || !fresh(this.stored.catalog))) {
      tried++;
      try {
        const ids = await this.listModels(r.baseUrl, r.key, "nvidia");
        if (ids.length) {
          // Modelos que voltaram a aparecer saem da lista de aposentados.
          this.patch({ catalog: { ids, updatedAt: new Date().toISOString() }, retired: (this.stored.retired ?? []).filter((m) => m.startsWith("groq:") || !ids.includes(m)) });
          if (r.choice !== "auto" && !ids.includes(r.choice)) {
            this.onModelChange?.(r.choice, this.resolve().model, "o modelo escolhido não aparece mais na sua conta da NVIDIA");
          }
        }
      } catch (err) {
        errors.push(err);
        this.logFailure("lista de modelos", "nvidia", err);
      }
    }
    if (groq && (force || !fresh(this.stored.groqCatalog))) {
      tried++;
      try {
        const ids = await this.listModels(GROQ_BASE_URL, groq, "groq");
        if (ids.length) {
          this.patch({ groqCatalog: { ids, updatedAt: new Date().toISOString() }, retired: (this.stored.retired ?? []).filter((m) => !m.startsWith("groq:") || !ids.includes(m.slice(5))) });
        }
      } catch (err) {
        errors.push(err);
        this.logFailure("groq:lista de modelos", "groq", err);
      }
    }
    // Pedido do Dono ("Atualizar lista"): mostra o erro. Nas buscas automáticas, segue com a lista guardada.
    if (force && tried && errors.length === tried) throw errors[0];
    const ids = this.stored.catalog?.ids ?? [];
    return {
      models: describeModels(ids),
      best: ids.length ? pickBest(ids, this.stored.retired ?? []) : undefined,
      updatedAt: this.stored.catalog?.updatedAt,
      groq: groq ? describeGroq(this.stored.groqCatalog?.ids) : undefined,
    };
  }

  /**
   * Testa a conexão. Com `key`, testa uma chave nova antes de salvar: primeiro
   * pede a lista de modelos com ela (confere a chave e mostra quais existem na
   * conta) e depois uma resposta curta. Tudo vai para o log do Dono.
   */
  async test(provider?: AiProvider, key?: string): Promise<string> {
    const ask: ChatMessageIn[] = [{ role: "user", content: "Responda apenas: Conexão OK" }];
    let text = "";
    if (key && provider) {
      const k = key.trim();
      const r = this.resolve();
      const baseUrl = provider === "groq" ? GROQ_BASE_URL : r.baseUrl;
      let ids: string[] | undefined;
      try {
        ids = await this.listModels(baseUrl, k, provider);
      } catch (err) {
        this.logFailure(provider === "groq" ? "groq:lista de modelos" : "lista de modelos", provider, err);
        const code = (err as AppError).code;
        if (code === "AI_AUTH" || code === "AI_BLOCKED" || code === "AI_OFFLINE") throw err;
      }
      const models = provider === "groq" ? this.groqModels(ids?.length ? ids : undefined, false).slice(0, 3) : this.nvidiaModels(r.choice).slice(0, 2);
      let last: unknown;
      for (const model of models) {
        const t: Target = { provider, model, key: k, baseUrl, id: provider === "groq" ? `groq:${model}` : model };
        const started = Date.now();
        try {
          text = "";
          await this.request(t, ask, (d) => (text += d), undefined, 300);
          this.log({ kind: "ok", model: t.id, ms: Date.now() - started, message: "Teste da chave: funcionou." });
          return `${text.trim().slice(0, 80) || "Conexão OK"} (${targetLabel(t.id)})`;
        } catch (err) {
          last = err;
          this.logFailure(t.id, provider, err, Date.now() - started);
          if ((err as AppError).code === "AI_AUTH" || (err as AppError).code === "AI_OFFLINE") break;
        }
      }
      throw last ?? new AppError("AI_DOWN", "O serviço de IA está instável agora. Tente novamente em instantes.");
    }
    let label = "";
    await this.stream(ask, (d) => (text += d), undefined, 300, { only: provider, language: false, onModel: (l) => (label = l) });
    return `${text.trim().slice(0, 80) || "Conexão OK"} (${label || targetLabel(this.stored.lastUsed ?? this.resolve().model)})`;
  }

  /** Resposta completa, sem streaming (relatórios e planos). Respostas longas continuam sozinhas. */
  async complete(messages: ChatMessageIn[], signal?: AbortSignal, maxTokens = 2048): Promise<string> {
    let text = "";
    await this.stream(messages, (d) => (text += d), signal, maxTokens, { onReplace: (full) => (text = full) });
    return text.trim();
  }

  /** Modelos em pausa por terem falhado há pouco. */
  private cooling(): string[] {
    const now = Date.now();
    return Object.entries(this.stored.cooldown ?? {})
      .filter(([, until]) => until > now)
      .map(([id]) => id);
  }

  private coolDown(id: string, ms = COOLDOWN_MS): void {
    const now = Date.now();
    const cooldown = Object.fromEntries(Object.entries(this.stored.cooldown ?? {}).filter(([, until]) => until > now));
    cooldown[id] = now + ms;
    this.patch({ cooldown });
  }

  /** Registro para a aba de Logs do Dono (últimos 300 eventos, neste aparelho). */
  private log(entry: Omit<AiLogEntry, "at">): void {
    const list = this.store.app.aiLog ?? [];
    list.unshift({ at: new Date().toISOString(), ...entry });
    this.store.app.aiLog = list.slice(0, 300);
    this.store.save();
  }

  private logFailure(model: string, provider: AiProvider, err: unknown, ms?: number): void {
    const e = err as ProviderError;
    this.log({ kind: "erro", model, code: e.code ?? "AI_OFFLINE", status: e.status, message: e.line ?? `${providerName(provider)}: ${e.message}`, detail: e.detail, ms });
  }

  /**
   * Envia a conversa e entrega a resposta em pedaços, assim que chegam.
   * Tenta os modelos em ordem e só passa para o próximo quando um falha; se a
   * resposta já tinha começado, o próximo continua do ponto onde parou. Uma
   * resposta em inglês é pedida de novo em português antes de aparecer. Nada
   * disso muda a escolha salva. Tudo vai para o log do Dono.
   */
  async stream(messages: ChatMessageIn[], onDelta: (text: string) => void, signal?: AbortSignal, maxTokens = CHAT_MAX_TOKENS, opts: StreamOptions = {}): Promise<void> {
    const list = this.targets(opts.only);
    if (!list.length) {
      this.log({ kind: "erro", model: "-", code: "AI_NO_KEY", message: "Nenhuma chave de IA configurada." });
      throw new AppError("AI_NO_KEY", NO_KEY_MESSAGE);
    }
    if ((this.resolve().key && !this.stored.catalog) || (this.groqKey() && !this.stored.groqCatalog)) void this.catalog().catch(() => undefined);
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const checkLanguage = opts.language !== false && !wantsOtherLanguage(lastUser);
    let written = "";
    const emit = (d: string) => {
      written += d;
      onDelta(d);
    };
    let strict = false;
    let langTries = 0;
    let lastError: AppError | undefined;
    const skip = new Set<AiProvider>();
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (signal?.aborted) return;
      if (skip.has(t.provider)) continue;
      const started = Date.now();
      const resumed = written;
      try {
        const parts = await this.answer(t, messages, emit, signal, { maxTokens, strict, checkLanguage: checkLanguage && langTries < 2, resume: written, onModel: opts.onModel });
        if (signal?.aborted) {
          this.log({ kind: "cancelado", model: t.id, ms: Date.now() - started });
          return;
        }
        if (!written.trim()) throw new AppError("AI_EMPTY", "O modelo de IA não devolveu nenhuma resposta.");
        if (checkLanguage && opts.onReplace) {
          const fixed = await this.fixLanguage(t, written, signal);
          if (fixed && !signal?.aborted) opts.onReplace(fixed);
        }
        if (this.stored.lastUsed !== t.id) this.patch({ lastUsed: t.id });
        this.log({ kind: "ok", model: t.id, ms: Date.now() - started, message: parts > 1 ? `Resposta longa, entregue em ${parts} partes.` : undefined });
        if (i > 0 && list[0].id !== t.id) {
          this.log({
            kind: "troca",
            model: t.id,
            message: `${resumed ? "Terminou" : "Respondeu"} com ${targetLabel(t.id)} porque ${targetLabel(list[0].id)} falhou. A escolha salva continua a mesma.`,
          });
        }
        return;
      } catch (err) {
        if (signal?.aborted || isAbort(err)) {
          this.log({ kind: "cancelado", model: t.id, ms: Date.now() - started });
          return;
        }
        const e = err instanceof AppError ? err : new AppError("AI_OFFLINE", OFFLINE_MESSAGE);
        if (e.code === "AI_LANG") {
          langTries++;
          strict = true;
          this.log({ kind: "aviso", model: t.id, code: "AI_LANG", message: "Começou a responder em inglês; pedi de novo em português.", ms: Date.now() - started });
          // Primeiro tenta o mesmo modelo com a instrução reforçada; se não houver outro, aceita o que vier.
          if (langTries === 1 || i === list.length - 1) i--;
          continue;
        }
        this.logFailure(t.id, t.provider, e, Date.now() - started);
        // Chave recusada ou sem conexão com o provedor: os outros modelos dele também vão falhar.
        if (e.code === "AI_AUTH" || e.code === "AI_OFFLINE" || e.code === "AI_BLOCKED") skip.add(t.provider);
        else if (e.code === "AI_RATE") {
          this.coolDown(t.id, RATE_COOLDOWN_MS);
          // Na NVIDIA o limite é da conta inteira.
          if (t.provider === "nvidia") skip.add("nvidia");
        } else if (e.code === "AI_MODEL") this.patch({ retired: [...new Set([...(this.stored.retired ?? []), t.id])] });
        else if (e.code !== "AI_BIG") this.coolDown(t.id);
        lastError = e;
      }
    }
    throw lastError ?? new AppError("AI_DOWN", "O serviço de IA está instável agora. Tente novamente em instantes.");
  }

  /** Traduz o trecho final que veio em inglês. Devolve o texto inteiro corrigido, ou null se não precisou (ou não deu). */
  private async fixLanguage(t: Target, text: string, signal?: AbortSignal): Promise<string | null> {
    const cut = englishFrom(text);
    if (cut <= 0) return null;
    const tail = text.slice(cut);
    const tags = tail.match(MEMORY_TAGS) ?? [];
    let out = "";
    try {
      await this.request(t, [{ role: "system", content: TRANSLATE_PROMPT }, { role: "user", content: tail.replace(MEMORY_TAGS, "").trim() }], (d) => (out += d), signal, t.provider === "groq" ? GROQ_MAX_TOKENS : CHAT_MAX_TOKENS);
    } catch {
      return null;
    }
    out = out.trim();
    if (!out || looksEnglish(out)) return null;
    this.log({ kind: "aviso", model: t.id, code: "AI_LANG", message: "O fim da resposta veio em inglês; foi traduzido para o português." });
    return `${text.slice(0, cut)}${out}${tags.length ? `\n\n${tags.join("\n")}` : ""}`;
  }

  /** Uma resposta completa de um modelo: confere o idioma no começo e pede a continuação se for cortada. Devolve em quantas partes veio. */
  private async answer(
    t: Target,
    messages: ChatMessageIn[],
    emit: (d: string) => void,
    signal: AbortSignal | undefined,
    o: { maxTokens: number; strict: boolean; checkLanguage: boolean; resume: string; onModel?: (label: string) => void }
  ): Promise<number> {
    const base = o.strict ? strictMessages(messages) : messages;
    const maxTokens = t.provider === "groq" ? Math.min(o.maxTokens, GROQ_MAX_TOKENS) : o.maxTokens;
    let written = o.resume;
    const out = (d: string) => {
      written += d;
      emit(d);
    };
    let announced = false;
    const announce = () => {
      if (announced) return;
      announced = true;
      o.onModel?.(targetLabel(t.id));
    };
    let finish: string | null = "length";
    let parts = 0;
    if (!written) {
      const gate = o.checkLanguage ? new LanguageGate() : null;
      const local = new AbortController();
      const onAbort = () => local.abort();
      if (signal?.aborted) local.abort();
      signal?.addEventListener("abort", onAbort);
      let english = false;
      try {
        finish = await this.request(t, base, (d) => {
          if (english) return;
          announce();
          const free = gate ? gate.push(d) : d;
          if (free === null) {
            english = true;
            local.abort();
          } else if (free) out(free);
        }, local.signal, maxTokens);
      } catch (err) {
        if (english && !signal?.aborted) throw new AppError("AI_LANG", "Resposta em inglês.");
        throw err;
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
      if (gate) {
        const rest = gate.end();
        if (rest === null) throw new AppError("AI_LANG", "Resposta em inglês.");
        if (rest) out(rest);
      }
      parts = 1;
    }
    for (let round = 0; finish === "length" && round < MAX_CONTINUATIONS && written.trim(); round++) {
      if (signal?.aborted) break;
      if (parts > 0) this.log({ kind: "aviso", model: t.id, code: "AI_CONTINUE", message: `Resposta longa: pedindo a parte ${parts + 1}.` });
      const join = new ContinuationJoin(written);
      announce();
      finish = await this.request(t, continuationMessages(base, written, t.provider), (d) => {
        const x = join.push(d);
        if (x) out(x);
      }, signal, maxTokens);
      const rest = join.flush();
      if (rest) out(rest);
      parts++;
    }
    return parts;
  }

  /** Um pedido; se o modelo recusar os ajustes ou o tamanho (400/413/422), tenta de novo uma vez sem eles. */
  private async request(t: Target, messages: ChatMessageIn[], onText: (d: string) => void, signal: AbortSignal | undefined, maxTokens: number): Promise<string | null> {
    let sent = false;
    const track = (d: string) => {
      sent = true;
      onText(d);
    };
    try {
      return await this.requestOnce(t, messages, track, signal, maxTokens);
    } catch (err) {
      const status = (err as { status?: number }).status;
      const code = (err as AppError).code;
      if (sent || signal?.aborted || code === "AI_MODEL" || !(status === 400 || status === 413 || status === 422)) throw err;
      if (status === 413 && maxTokens <= 2048) throw err;
      if (status !== 413) this.plain.add(t.id);
      return this.requestOnce(t, messages, onText, signal, Math.min(maxTokens, status === 413 ? 2048 : 4096));
    }
  }

  private async requestOnce(t: Target, messages: ChatMessageIn[], onText: (d: string) => void, signal: AbortSignal | undefined, maxTokens: number): Promise<string | null> {
    const buffered = isBufferedStream(t.baseUrl);
    const tweak = this.plain.has(t.id) ? {} : directAnswerTweaks(t.provider, t.model);
    let list = messages;
    if (tweak.system) {
      const sys = list.find((m) => m.role === "system");
      list = sys ? list.map((m) => (m === sys ? { ...m, content: `${tweak.system}\n\n${m.content}` } : m)) : [{ role: "system", content: tweak.system }, ...list];
    }
    const ctrl = new AbortController();
    let timedOut = false;
    const expire = () => {
      timedOut = true;
      ctrl.abort();
    };
    const connect = setTimeout(expire, buffered ? BUFFERED_MS : CONNECT_MS);
    let firstText: ReturnType<typeof setTimeout> | undefined = buffered ? undefined : setTimeout(expire, isReasoning(t.model) ? FIRST_TEXT_REASONING_MS : FIRST_TEXT_MS);
    let idle: ReturnType<typeof setTimeout> | undefined;
    const alive = () => {
      clearTimeout(idle);
      idle = setTimeout(expire, buffered ? BUFFERED_MS : IDLE_MS);
    };
    const onAbort = () => ctrl.abort();
    if (signal?.aborted) ctrl.abort();
    signal?.addEventListener("abort", onAbort);
    const fail = (err: unknown): never => {
      if (signal?.aborted) throw err;
      if (timedOut) throw new AppError("AI_SLOW", "O modelo de IA demorou demais para responder.");
      if (err instanceof AppError) throw err;
      throw new AppError("AI_OFFLINE", OFFLINE_MESSAGE);
    };
    const filter = new ThinkFilter();
    const deliver = (s: string) => {
      if (!s) return;
      clearTimeout(firstText);
      firstText = undefined;
      onText(s);
    };
    try {
      let res: Response;
      try {
        res = await fetchStream(`${t.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${t.key}`, "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({ model: t.model, messages: list, temperature: 0.4, top_p: 0.9, max_tokens: maxTokens, stream: true, ...tweak.body }),
          signal: ctrl.signal,
        });
      } catch (err) {
        return fail(err);
      }
      clearTimeout(connect);
      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => "");
        throw friendlyError(res.status, body, t.provider);
      }
      alive();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finish: string | null = null;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          alive();
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") {
              deliver(filter.flush());
              void reader.cancel().catch(() => undefined);
              return finish;
            }
            let json: { choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[]; error?: { message?: string } };
            try {
              json = JSON.parse(payload);
            } catch {
              continue; // linha parcial ou keep-alive
            }
            if (json.error) throw Object.assign(new AppError("AI_DOWN", `Erro da IA: ${json.error.message ?? "falha no modelo"}`), { detail: JSON.stringify(json.error).slice(0, 400) });
            const choice = json.choices?.[0];
            if (choice?.delta?.content) deliver(filter.push(choice.delta.content));
            if (choice?.finish_reason) finish = choice.finish_reason;
          }
        }
      } catch (err) {
        // A conexão caiu no meio da resposta: é falha do servidor, não falta de internet.
        if (!timedOut && !signal?.aborted && !(err instanceof AppError)) throw new AppError("AI_DOWN", "A conexão com o modelo caiu no meio da resposta.");
        return fail(err);
      }
      deliver(filter.flush());
      return finish;
    } finally {
      clearTimeout(connect);
      clearTimeout(firstText);
      clearTimeout(idle);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

/** Junta uma mudança à configuração da nuvem: só os campos que vieram na mudança são trocados. */
export function mergeAiCloud(base: AiCloudConfig | null | undefined, change: AiCloudConfig): AiCloudConfig {
  const out: AiCloudConfig = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(change)) if (v !== undefined) Object.assign(out, { [k]: v });
  return out;
}

/** Completa a nuvem com as chaves que só este aparelho tem; null quando não falta nenhuma. */
export function fillAiKeys(cloud: AiCloudConfig | null | undefined, mine: AiCloudConfig): AiCloudConfig | null {
  const missing = (["apiKey", "groqKey", "searchKey"] as const).filter((k) => mine[k] && !cloud?.[k]);
  if (!missing.length) return null;
  const out: AiCloudConfig = { ...(cloud ?? {}) };
  for (const k of missing) out[k] = mine[k];
  if (!out.changedAt) out.changedAt = mine.changedAt;
  return out;
}
