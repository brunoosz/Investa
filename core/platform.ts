// O motor do app (contas, dados, IA, alertas e fontes de mercado) roda igual no
// desktop (processo principal do Electron) e no celular (dentro do WebView do
// Capacitor). Tudo o que depende do sistema passa por esta interface.
import type { AppNotification, UserSettings } from "@shared/types";
import type { ScheduledNotice } from "@shared/insight";

/** Arquivos pequenos do app. A leitura é síncrona: no celular os arquivos são carregados antes de abrir o motor. */
export interface FileStore {
  read(name: string): string | null;
  write(name: string, data: string): void;
}

export interface Secrets {
  encrypt(plain: string): { data: string; mode: "safe" | "plain" };
  decrypt(data: string, mode: "safe" | "plain"): string;
}

export interface AiFileConfig {
  nvidiaApiKey?: string;
  apiKey?: string;
  groqApiKey?: string;
  model?: string;
  baseUrl?: string;
}

/** O que o trabalho em segundo plano do Android precisa para a análise diária. */
export interface BackgroundConfig {
  enabled: boolean;
  /** Notificações do sistema ligadas. */
  notify: boolean;
  hour: number;
  owner: boolean;
  groqKey?: string;
  groqModels: string[];
  nvidiaKey?: string;
  nvidiaModels: string[];
  nvidiaBaseUrl: string;
  systemPrompt: string;
  profile: string;
  /** Dia (AAAA-MM-DD) cuja análise já foi feita em outro lugar. */
  doneDate?: string;
}

export interface ReportFile {
  ym: string;
  format: "pdf" | "xlsx" | "json";
  fileName: string;
  /** Relatório em HTML (usado para gerar o PDF no desktop). */
  html: () => string;
  /** Planilha pronta. */
  xlsx: () => Promise<Uint8Array>;
  /** PDF montado sem navegador (usado no celular). */
  pdf: () => Promise<Uint8Array>;
  /** Conteúdo em texto (backup em JSON). */
  json?: () => string;
}

export interface Platform {
  kind: "desktop" | "mobile";
  os: string;
  version: string;
  dataDir: string;
  files: FileStore;
  secrets: Secrets;
  /** scrypt(senha, salt, 64 bytes) em hexadecimal. */
  hashPassword(password: string, salt: string): string;
  randomHex(bytes: number): string;
  /** Envia um evento para a interface (ai:event, notifications:new, navigate). */
  emit(channel: string, payload: unknown): void;
  /** Mostra a notificação do sistema, se fizer sentido na plataforma. */
  notify?(n: AppNotification, settings: UserSettings): void;
  aiFileConfig?(): AiFileConfig | null;
  /** Celular: agenda no sistema os avisos com hora marcada (chegam com o app fechado). */
  scheduleNotices?(items: ScheduledNotice[]): void;
  /** Celular: configura a análise diária que o Android faz em segundo plano. */
  configureBackground?(cfg: BackgroundConfig): void;
  saveReport(report: ReportFile): Promise<{ path: string } | null>;
  openExternal(url: string): void;
  setTheme?(theme: "dark" | "light"): void;
  /** Troca o ícone do app (janela/barra de tarefas no PC, ícone da tela inicial no Android). */
  setAppIcon?(variant: "dark" | "light"): Promise<void> | void;
  /**
   * Ditado por voz. "text": o texto já veio (celular). "system": o sistema
   * vai digitar no campo focado (digitação por voz do Windows).
   */
  voiceInput?(): Promise<{ mode: "text" | "system"; text?: string }>;
}

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function randomHexWeb(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return toHex(buf);
}

/** Comparação que não para no primeiro caractere diferente. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
