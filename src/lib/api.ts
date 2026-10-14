import type {
  AiLogEntry,
  DailyInsight,
  SavingPlan,
  WealthAnswers,
  WealthPlan,
  AiCatalog,
  AiConfigInfo,
  AiMode,
  AiProvider,
  DealCheck,
  AiEvent,
  AlertRuntimeState,
  ApiResult,
  AppNotification,
  BanksData,
  ChartData,
  ChartRange,
  CopomInfo,
  Holding,
  Indicators,
  NewsItem,
  PortfolioHistoryPoint,
  PublicUser,
  Quote,
  Role,
  SearchResult,
  SeriesValue,
  TesouroData,
  UserDataKey,
  UserDataMap,
  UserStatus,
} from "@shared/types";
import type { EventChannel, InvokeChannel } from "@shared/ipc";

interface Bridge {
  platform: string;
  invoke(channel: string, args?: unknown): Promise<ApiResult<unknown>>;
  on(event: string, cb: (payload: unknown) => void): () => void;
}

declare global {
  interface Window {
    investa?: Bridge;
  }
}

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const bridge = typeof window !== "undefined" ? window.investa : undefined;
export const isDesktop = !!bridge;
export const platform = bridge?.platform ?? "web";

async function call<T>(channel: InvokeChannel, args?: unknown): Promise<T> {
  if (!bridge) throw new ApiError("NO_BRIDGE", "Abra o Investa pelo aplicativo instalado no computador.");
  const res = (await bridge.invoke(channel, args)) as ApiResult<T>;
  if (!res.ok) throw new ApiError(res.error.code, res.error.message);
  return res.data;
}

export interface AppInfo {
  version: string;
  platform: string;
  kind: "desktop" | "mobile";
  hasUsers: boolean;
  /** Contas e dados guardados na nuvem (mesma conta no PC e no celular). */
  cloud?: boolean;
  dataDir: string;
}

export const api = {
  appInfo: () => call<AppInfo>("app:info"),
  session: () => call<PublicUser | null>("auth:session"),
  register: (input: { name: string; username: string; password: string; email?: string; remember?: boolean }) => call<PublicUser>("auth:register", input),
  login: (input: { username: string; password: string; remember?: boolean }) => call<PublicUser>("auth:login", input),
  logout: () => call<boolean>("auth:logout"),
  changePassword: (current: string, next: string) => call<void>("auth:changePassword", { current, next }),
  updateProfile: (patch: { name?: string; email?: string; username?: string }) => call<PublicUser>("auth:updateProfile", patch),

  users: {
    list: () => call<PublicUser[]>("users:list"),
    create: (input: { name: string; username: string; password: string; email?: string; role: Role }) => call<PublicUser>("users:create", input),
    update: (id: string, patch: { name?: string; username?: string; email?: string; role?: Role; status?: UserStatus }) =>
      call<PublicUser>("users:update", { id, patch }),
    resetPassword: (id: string, password: string) => call<void>("users:resetPassword", { id, password }),
    remove: (id: string) => call<void>("users:delete", { id }),
  },

  data: {
    getAll: () => call<UserDataMap>("data:getAll"),
    set: <K extends UserDataKey>(key: K, value: UserDataMap[K]) => call<boolean>("data:set", { key, value }),
  },

  notifications: {
    list: () => call<AppNotification[]>("notifications:list"),
    markRead: (id?: string) => call<AppNotification[]>("notifications:markRead", { id }),
    remove: (id: string) => call<AppNotification[]>("notifications:remove", { id }),
    clear: () => call<AppNotification[]>("notifications:clear"),
  },

  alerts: {
    state: () => call<Record<string, AlertRuntimeState>>("alerts:state"),
    rearm: (id: string) => call<boolean>("alerts:rearm", { id }),
  },

  market: {
    quotes: (symbols: string[], maxAgeMs?: number) => call<Record<string, Quote>>("market:quotes", { symbols, maxAgeMs }),
    chart: (symbol: string, range: ChartRange) => call<ChartData>("market:chart", { symbol, range }),
    search: (query: string) => call<SearchResult[]>("market:search", { query }),
    indicators: () => call<Indicators>("market:indicators"),
    copom: () => call<CopomInfo>("market:copom"),
    tesouro: () => call<TesouroData>("market:tesouro"),
    news: () => call<NewsItem[]>("market:news"),
    selicHistory: () => call<SeriesValue[]>("market:selicHistory"),
    ipcaHistory: () => call<SeriesValue[]>("market:ipcaHistory"),
  },

  portfolioHistory: (range: ChartRange, holdings?: Holding[]) => call<PortfolioHistoryPoint[]>("portfolio:history", { range, holdings }),
  banks: () => call<BanksData>("banks:get"),

  ai: {
    info: () => call<AiConfigInfo>("ai:info"),
    setConfig: (patch: {
      apiKey?: string | null;
      model?: string;
      baseUrl?: string;
      searchKey?: string | null;
      groqKey?: string | null;
      groqModel?: string;
      primary?: AiProvider;
    }) => call<AiConfigInfo>("ai:setConfig", patch),
    catalog: (force = false) => call<AiCatalog>("ai:catalog", { force }),
    /** Testa a conexão (só com um provedor, se indicado; com `key`, testa a chave antes de salvar). */
    test: (provider?: AiProvider, key?: string) => call<string>("ai:test", { provider, key }),
    chat: (requestId: string, messages: { role: "user" | "assistant"; content: string }[], mode: AiMode, attachment?: string, web?: boolean) =>
      call<boolean>("ai:chat", { requestId, messages, mode, attachment, web }),
    testSearch: (key: string) => call<number>("search:test", { key }),
    logs: () => call<AiLogEntry[]>("ai:logs"),
    clearLogs: () => call<boolean>("ai:logs:clear"),
    insight: () => call<DailyInsight | null>("insight:get"),
    refreshInsight: () => call<DailyInsight | null>("insight:refresh"),
    cancel: (requestId: string) => call<boolean>("ai:cancel", { requestId }),
  },

  exportShopping: (format: "pdf" | "xlsx") => call<{ path: string } | null>("shopping:export", { format }),
  exportReport: (ym: string, format: "pdf" | "xlsx", withAi = false) => call<{ path: string } | null>("reports:export", { ym, format, withAi }),
  backup: {
    export: () => call<{ path: string } | null>("backup:export"),
    import: (json: string) => call<UserDataMap>("backup:import", { json }),
  },
  voice: () => call<{ mode: "text" | "system"; text?: string }>("voice:listen"),
  plans: {
    forExpense: (id: string) => call<SavingPlan>("plans:expense", { id }),
    exportPdf: (title: string, markdown: string, subtitle?: string) => call<{ path: string } | null>("plans:export", { title, markdown, subtitle }),
    wealth: (answers: WealthAnswers) => call<WealthPlan>("plans:wealth", { answers }),
  },
  deals: {
    check: (query: string, price?: number) => call<DealCheck>("deals:check", { query, price }),
    context: (deal: DealCheck, installments?: number) => call<string>("deals:context", { deal, installments }),
  },
  appIcon: (variant?: "dark" | "light") => call<{ variant: "dark" | "light"; supported: boolean }>("app:icon", variant ? { variant } : undefined),
  setTheme: (theme: "dark" | "light") => call<boolean>("window:setTheme", { theme }),
  openExternal: (url: string) => call<boolean>("shell:openExternal", { url }),

  on<T = unknown>(event: EventChannel, cb: (payload: T) => void): () => void {
    return bridge?.on(event, cb as (p: unknown) => void) ?? (() => undefined);
  },
};

export type { AiEvent };

export function uid(): string {
  return crypto.randomUUID();
}
