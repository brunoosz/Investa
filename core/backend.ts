// Todos os canais que a interface chama (window.investa.invoke). O Electron e
// o app do celular criam este backend com o adaptador da sua plataforma.
import type { AiChatRequest, AiEvent, AiMode, WealthAnswers, AppNotification, DailyInsight, ApiResult, ChartRange, DealCheck, Holding, Role, UserDataKey, UserDataMap, UserStatus } from "@shared/types";
import { USER_DATA_KEYS } from "@shared/types";
import { pendingFor, currentYm, monthBudget, monthsUntil, parsePlanSteps, summarizeMonth } from "@shared/finance";
import { compareProducts, explainPlan, planAllocation, planBrief, planMarket, planMonthlyFor, planPct, projectPlan } from "@shared/plan";
import { modeInfo } from "@shared/ai";
import { INSIGHT_SYSTEM_PROMPT, insightHour, insightNotification, isQuietHour, profileLine, upcomingNotices } from "@shared/insight";
import type { Platform } from "./platform";
import { Store } from "./store";
import { AppError, AuthService, type NewUserInput } from "./auth";
import { AiService, CHAT_MAX_TOKENS, fillAiKeys, mergeAiCloud, targetLabel, type AiConfigPatch } from "./ai";
import { AlertEngine } from "./engine";
import { aiErrorSummary, generateDailyInsight } from "./insight";
import { GROQ_MODELS } from "./models";
import { getChart, getQuotes, search } from "./yahoo";
import { getCopom, getIndicators, getIpcaHistory, getSelicHistory } from "./bcb";
import { getTesouro } from "./tesouro";
import { nowInSaoPaulo, setCacheFiles, todayIsoSaoPaulo } from "./http";
import { getNews } from "./news";
import { getBanks } from "./banks";
import { portfolioHistory } from "./portfolio";
import { buildAiContext, LANGUAGE_REMINDER, systemPrompt } from "./context";
import { buildDocHtml, buildDocPdf, buildExcel, buildPdf, buildReportHtml, type ReportInput } from "./reports";
import { checkDeal, dealToText } from "./deals";
import { CloudService } from "./cloud";
import { clearItems, INBOX_KEY, markRead, removeItem, type Inbox } from "./inbox";
import { BOOK_PRINCIPLES, resultsToContext, testSearch, webSearch, webSearchMany } from "./search";

const VALID_RANGES: ChartRange[] = ["1D", "5D", "1M", "6M", "1A", "5A", "MAX"];
const MODES: AiMode[] = ["geral", "professor", "app", "financas", "mercado", "compras"];
const PUBLIC_CHANNELS = new Set(["app:info", "auth:session", "auth:register", "auth:login", "auth:logout", "window:setTheme", "app:icon", "shell:openExternal"]);
const SYNC_EVERY = 45_000;
/** No máximo um aviso de erros da IA para o Dono a cada 30 minutos. */
const AI_ALERT_EVERY = 30 * 60_000;

/** Mensagem que quem não é Dono vê quando a IA falha. */
const AI_UNAVAILABLE = "O Assistente não está disponível agora. Tente de novo em alguns minutos.";

/**
 * Só as últimas mensagens vão para a IA, e as respostas antigas resumidas:
 * menos texto para ler, resposta mais rápida. A última resposta vai inteira
 * (é a que a pessoa costuma comentar).
 */
function trimHistory(list: AiChatRequest["messages"]): { role: "user" | "assistant"; content: string }[] {
  const valid = (list ?? []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()).slice(-8);
  return valid.map((m, i) => {
    const recent = i >= valid.length - 2;
    const max = m.role === "user" ? 6000 : recent ? 6000 : 1200;
    return { role: m.role, content: m.content.length > max ? `${m.content.slice(0, max)}…` : m.content };
  });
}

export function errorMessage(err: unknown): { code: string; message: string } {
  if (err instanceof AppError) return { code: err.code, message: err.message };
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch failed|failed to fetch|ENOTFOUND|ECONN|ETIMEDOUT|aborted|network|HTTP 5\d\d/i.test(msg)) {
    return { code: "NETWORK", message: "Não foi possível buscar os dados agora. Verifique sua conexão com a internet." };
  }
  return { code: "ERROR", message: msg || "Algo deu errado." };
}

/** Só abre fora do app endereços https comuns (sem usuário e senha embutidos). */
export function safeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler = (args: any) => unknown;

export class Backend {
  readonly store: Store;
  readonly auth: AuthService;
  readonly ai: AiService;
  readonly engine: AlertEngine;
  readonly cloud: CloudService;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private currentUserId: string | null = null;
  private aiControllers = new Map<string, AbortController>();
  private handlers = new Map<string, Handler>();
  private catalogTimer: ReturnType<typeof setInterval> | null = null;
  private choresTimer: ReturnType<typeof setInterval> | null = null;
  private deviceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Erros da IA anteriores a isto já foram avisados (ou são de antes de abrir o app). */
  private aiErrorsSince = new Date().toISOString();
  private aiAlertAt = 0;
  private insightTriedAt = 0;

  constructor(private platform: Platform) {
    setCacheFiles(platform.files);
    this.store = new Store(platform.files);
    this.auth = new AuthService(this.store, platform);
    this.ai = new AiService(this.store, platform);
    this.cloud = new CloudService(this.store);
    this.engine = new AlertEngine(this.store, (userId, n) => this.onNotification(userId, n));
    // O motor mexeu nos dados (ex.: depósito automático das caixinhas): sobe para a nuvem e atualiza a tela.
    this.engine.onDataChanged = (userId, keys) => {
      this.cloud.schedulePush(userId, keys);
      this.refreshDevice();
      if (userId === this.currentUserId) {
        const u = this.store.findUser(userId);
        this.platform.emit("data:changed", u ? this.store.toPublic(u) : null);
      }
    };
    // Avisos de outra conta deste aparelho (ex.: aviso aos Donos) sobem quando ela entrar.
    this.engine.onInboxChanged = (userId) => {
      if (userId === this.currentUserId) {
        this.cloud.schedulePush(userId, [INBOX_KEY]);
        this.refreshDevice();
      } else if (this.cloud.enabled) this.cloud.markDirty(userId, [INBOX_KEY]);
    };
    this.ai.onModelChange = (from, to, reason) => this.notifyOwners(from, to, reason);
    this.register();
  }

  /** Pré-carrega os dados oficiais mais lentos e atualiza a lista de modelos da IA uma vez por dia. */
  start(): void {
    setTimeout(() => {
      void Promise.allSettled([getIndicators(), getCopom(), getNews(), getTesouro(), getBanks()]);
      void this.ai.catalog().catch(() => undefined);
    }, 2500);
    this.catalogTimer = setInterval(() => void this.ai.catalog().catch(() => undefined), 6 * 3600_000);
    if (this.cloud.enabled) this.syncTimer = setInterval(() => void this.sync(), SYNC_EVERY);
    this.choresTimer = setInterval(() => {
      this.checkAiErrors();
      void this.dailyInsight();
    }, 60_000);
  }

  /**
   * Celular: reagenda no sistema os avisos com hora marcada e passa ao Android
   * o que a análise diária em segundo plano precisa. Espera as mudanças pararem.
   */
  refreshDevice(): void {
    if (!this.platform.scheduleNotices && !this.platform.configureBackground) return;
    if (this.deviceTimer) clearTimeout(this.deviceTimer);
    this.deviceTimer = setTimeout(() => {
      this.deviceTimer = null;
      const uid = this.currentUserId;
      if (!uid) {
        this.platform.scheduleNotices?.([]);
        this.platform.configureBackground?.({ enabled: false, notify: false, hour: 9, owner: false, groqModels: [], nvidiaModels: [], nvidiaBaseUrl: "", systemPrompt: "", profile: "" });
        return;
      }
      const settings = this.store.getData(uid, "settings");
      const keys = this.store.engine(uid).keys;
      this.platform.scheduleNotices?.(
        upcomingNotices({ settings, alerts: this.store.getData(uid, "alerts"), bills: this.store.getData(uid, "bills"), invoices: this.store.getData(uid, "invoices") }, new Date(), keys)
      );
      const r = this.ai.resolve();
      const today = todayIsoSaoPaulo();
      this.platform.configureBackground?.({
        enabled: settings.aiInsight !== false,
        notify: settings.desktopNotifications !== false,
        hour: insightHour(settings),
        owner: this.isOwner(uid) && settings.ownerAiAlerts !== false,
        groqKey: this.ai.groqKey() ?? undefined,
        groqModels: GROQ_MODELS.map((m) => m.id).slice(0, 2),
        nvidiaKey: r.key ?? undefined,
        nvidiaModels: [r.model],
        nvidiaBaseUrl: r.baseUrl,
        systemPrompt: INSIGHT_SYSTEM_PROMPT,
        profile: profileLine(this.store.getData(uid, "profile")),
        doneDate: keys[`insight-${today}`] ? today : undefined,
      });
    }, 1500);
  }

  /** Dono: avisa quando a IA registra erros (resumo, no máximo a cada 30 minutos). */
  private checkAiErrors(): void {
    const uid = this.currentUserId;
    if (!uid || !this.isOwner(uid) || this.store.getData(uid, "settings").ownerAiAlerts === false) return;
    if (Date.now() - this.aiAlertAt < AI_ALERT_EVERY) return;
    const summary = aiErrorSummary(this.store.app.aiLog ?? [], this.aiErrorsSince);
    if (!summary) return;
    this.aiErrorsSince = summary.newest;
    this.aiAlertAt = Date.now();
    this.engine.push(uid, { type: "sistema", tone: "negative", title: "A IA registrou erros", message: summary.message, link: "/logs" }, `ia-log-${summary.newest}`);
  }

  /** Análise diária da IA (uma por dia, depois da hora escolhida e fora das 22h–8h). */
  private async dailyInsight(force = false): Promise<DailyInsight | null> {
    const uid = this.currentUserId;
    if (!uid || !this.engine.dataReady) return null;
    const settings = this.store.getData(uid, "settings");
    const hour = nowInSaoPaulo().getHours();
    const today = todayIsoSaoPaulo();
    const key = `insight-${today}`;
    if (!force) {
      if (settings.aiInsight === false || isQuietHour(hour) || hour < insightHour(settings)) return null;
      if (this.store.engine(uid).keys[key] || this.store.app.insights?.[uid]?.date === today) return null;
      if (Date.now() - this.insightTriedAt < 60 * 60_000) return null;
    }
    if (!this.ai.info(false).hasKey) return null;
    this.insightTriedAt = Date.now();
    try {
      const insight = await generateDailyInsight({
        complete: (messages) => this.ai.complete(messages, undefined, 400),
        news: () => getNews(),
        indicators: () => getIndicators(),
        profile: this.store.getData(uid, "profile"),
        date: today,
      });
      this.saveInsight(uid, insight);
      return insight;
    } catch {
      return null;
    }
  }

  private saveInsight(uid: string, insight: DailyInsight): void {
    const current = this.store.app.insights?.[uid];
    if (current && current.at >= insight.at) return;
    this.store.app.insights = { ...this.store.app.insights, [uid]: insight };
    this.store.save();
    const n = insightNotification(insight);
    // Vinda do Android, chega com o app aberto: entra na lista de avisos sem repetir na barra do sistema.
    this.engine.push(uid, { type: "mercado", tone: "info", title: n.title, message: n.message, link: "/" }, `insight-${insight.date}`);
    if (uid === this.currentUserId) this.platform.emit("insight:new", insight);
  }

  /** Celular: traz a análise e os erros do trabalho em segundo plano do Android. */
  importBackground(r: { insight?: DailyInsight | null; error?: { at: string; code: string; message: string; model?: string } | null }): void {
    const uid = this.currentUserId;
    if (!uid) return;
    if (r.insight?.date && r.insight.title) this.saveInsight(uid, r.insight);
    const e = r.error;
    if (e?.at && !(this.store.app.aiLog ?? []).some((x) => x.at === e.at && x.code === e.code)) {
      const list = this.store.app.aiLog ?? [];
      this.store.app.aiLog = [{ at: e.at, kind: "erro" as const, model: e.model ?? "segundo plano", code: e.code, message: `Análise diária: ${e.message}` }, ...list]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 300);
      this.store.save();
    }
  }

  /** Sincroniza a conta aberta com a nuvem (dados, cargo e configuração da IA). */
  async sync(): Promise<void> {
    const userId = this.currentUserId;
    if (!this.cloud.enabled || !userId) return;
    try {
      const changed = await this.cloud.pull(userId);
      await this.syncAiKey(userId);
      const u = this.store.findUser(userId);
      if (u?.status === "bloqueado") {
        this.endSession();
        this.platform.emit("session:ended", "Esta conta foi bloqueada pelo Dono do aplicativo.");
      } else if (changed && userId === this.currentUserId) {
        this.platform.emit("data:changed", u ? this.store.toPublic(u) : null);
        this.refreshDevice();
      }
    } catch (err) {
      if (err instanceof AppError && err.code === "USER_NOT_FOUND") {
        this.endSession();
        this.platform.emit("session:ended", "Esta conta foi excluída.");
        return;
      }
      if (err instanceof AppError && err.code === "CLOUD_SESSION") {
        this.endSession();
        this.platform.emit("session:ended", "Sua sessão na nuvem expirou. Entre de novo para continuar sincronizando entre os aparelhos.");
        return;
      }
      // sem internet: tenta de novo no próximo ciclo
    } finally {
      if (userId === this.currentUserId && !this.engine.dataReady) {
        this.engine.dataReady = true;
        this.engine.runNow();
      }
    }
  }

  /**
   * A configuração da IA fica guardada na nuvem: se este aparelho perdeu a
   * chave (app reinstalado, atualização que trocou a criptografia), busca de
   * novo; se a nuvem ainda não tem, o Dono envia a dele. A versão mais nova
   * vence, para uma cópia antiga nunca desfazer a escolha do Dono.
   */
  private async syncAiKey(userId: string): Promise<void> {
    const pending = this.cloud.aiPending;
    if (pending && this.isOwner(userId)) {
      // Mudança do Dono feita sem internet: sobe, a não ser que outro aparelho tenha mudado depois.
      const cloud = await this.cloud.pullAi(userId, true);
      if (this.cloud.aiPending !== pending) return;
      if (cloud?.changedAt && (!pending.changedAt || cloud.changedAt > pending.changedAt)) {
        this.ai.applyCloud(cloud);
        const keys = fillAiKeys(cloud, pending);
        if (keys) await this.cloud.pushAi(userId, keys);
      } else await this.cloud.pushAi(userId, mergeAiCloud(cloud, pending));
      if (this.cloud.aiPending === pending) this.cloud.aiPending = undefined;
      return;
    }
    const version = this.ai.version;
    const local = this.ai.info(true);
    const ai = await this.cloud.pullAi(userId, !local.hasKey);
    // O Dono mudou algo aqui enquanto a busca acontecia: vale a mudança local.
    if (this.ai.version !== version || this.cloud.aiPending) return;
    if (ai) this.ai.applyCloud(ai);
    // A nuvem ainda não tem a chave (colocada antes da nuvem ou por uma versão antiga do app): o Dono envia a dele.
    const keys = ai !== null && this.isOwner(userId) ? fillAiKeys(ai, this.ai.cloudConfig()) : null;
    if (keys) await this.cloud.pushAi(userId, keys);
  }

  private endSession(): void {
    this.cloud.logout(this.currentUserId);
    this.currentUserId = null;
    delete this.store.app.session;
    this.store.save();
    this.engine.stop();
    for (const c of this.aiControllers.values()) c.abort();
    this.aiControllers.clear();
    this.refreshDevice();
  }

  stop(): void {
    if (this.catalogTimer) clearInterval(this.catalogTimer);
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.choresTimer) clearInterval(this.choresTimer);
    if (this.currentUserId) void this.cloud.push(this.currentUserId).catch(() => undefined);
    this.engine.stop();
    this.store.flush();
  }

  get userId(): string | null {
    return this.currentUserId;
  }

  settingsOfCurrentUser() {
    return this.currentUserId ? this.store.getData(this.currentUserId, "settings") : null;
  }

  async invoke(channel: string, args: unknown): Promise<ApiResult<unknown>> {
    try {
      const fn = this.handlers.get(channel);
      if (!fn) throw new AppError("NOT_FOUND", "Função desconhecida.");
      if (!PUBLIC_CHANNELS.has(channel) && !this.currentUserId) throw new AppError("UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.");
      return { ok: true, data: await fn(args ?? {}) };
    } catch (err) {
      return { ok: false, error: errorMessage(err) };
    }
  }

  private on(channel: string, fn: Handler): void {
    this.handlers.set(channel, fn);
  }

  private uid(): string {
    if (!this.currentUserId) throw new AppError("UNAUTHENTICATED", "Sua sessão expirou. Entre novamente.");
    return this.currentUserId;
  }

  private isOwner(userId = this.currentUserId): boolean {
    return !!userId && this.store.findUser(userId)?.role === "dono";
  }

  private requireOwner(): void {
    if (!this.isOwner()) throw new AppError("FORBIDDEN", "Só o Dono do app pode mudar a Inteligência Artificial.");
  }

  private startSession(userId: string, remember: boolean): void {
    this.currentUserId = userId;
    if (remember) {
      this.store.app.session = { userId, token: this.platform.randomHex(24), expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() };
    } else {
      delete this.store.app.session;
    }
    this.store.save();
    // Com a nuvem, o motor só mexe em dados (caixinhas) depois da primeira sincronização.
    this.engine.dataReady = !this.cloud.enabled;
    this.engine.start(userId);
    this.refreshDevice();
  }

  private onNotification(userId: string, n: AppNotification): void {
    if (userId !== this.currentUserId) return;
    this.platform.emit("notifications:new", n);
    this.platform.notify?.(n, this.store.getData(userId, "settings"));
  }

  /** Avisa os Donos que o modelo da IA mudou sozinho. */
  private notifyOwners(from: string, to: string, reason: string): void {
    for (const u of this.store.users.filter((x) => x.role === "dono")) {
      this.engine.push(
        u.id,
        {
          type: "sistema",
          tone: "info",
          title: "O modelo escolhido para a IA saiu do ar",
          message: `${targetLabel(from)}: ${reason}. Enquanto isso, o Assistente usa ${targetLabel(to)}. Sua escolha continua salva; dá para trocar em Configurações → Inteligência Artificial.`,
          link: "/configuracoes",
        },
        `modelo-${from}-${to}`
      );
    }
  }

  /** Erro técnico da IA: quem não é Dono vê uma mensagem simples e o Dono recebe o detalhe. */
  private aiError(err: unknown): string {
    const { code, message } = errorMessage(err);
    if (this.isOwner()) return message;
    if (code !== "NETWORK" && code !== "AI_OFFLINE") {
      for (const u of this.store.users.filter((x) => x.role === "dono")) {
        this.engine.push(
          u.id,
          { type: "sistema", tone: "negative", title: "O Assistente falhou para um usuário", message, link: "/configuracoes" },
          `ia-erro-${code}-${new Date().toISOString().slice(0, 13)}`
        );
      }
    }
    if (code === "AI_NO_KEY") return "O Assistente ainda não foi ativado. Peça ao Dono do app para ativá-lo.";
    if (code === "NETWORK" || code === "AI_OFFLINE") return "Sem conexão com a internet. Verifique e tente de novo.";
    return AI_UNAVAILABLE;
  }

  private budgetOf(userId: string): DealCheck["budget"] {
    const profile = this.store.getData(userId, "profile");
    const ym = currentYm();
    const month = summarizeMonth(this.store.getData(userId, "expenses"), ym, profile.salary, profile.extraIncome);
    const budget = monthBudget(month, this.store.getData(userId, "invoices"), ym, new Date(), pendingFor(this.store.getData(userId, "bills"), this.store.getData(userId, "planned"), ym, this.store.getData(userId, "boxes")));
    const invoicesOpen = budget.invoicesOpen;
    const accounts = this.store.getData(userId, "accounts");
    return {
      monthBalance: month.balance,
      invoicesOpen,
      available: budget.available,
      emergencyReserve: profile.emergencyReserve,
      monthlyIncome: profile.salary + profile.extraIncome,
      accountsBalance: accounts.length ? accounts.reduce((s, a) => s + a.balance, 0) : undefined,
    };
  }

  private async aiMessages(userId: string, mode: AiMode, messages: { role: "user" | "assistant"; content: string }[], attachment?: string) {
    const user = this.store.findUser(userId)!;
    const question = messages.filter((m) => m.role === "user").pop()?.content ?? "";
    const context = await buildAiContext({
      user: { name: user.name },
      data: this.store.getAllData(userId),
      notifications: this.store.getNotifications(userId).slice(0, 8),
      question,
      mode,
    });
    const extra = attachment ? `\n\n${attachment.slice(0, 12000)}` : "";
    return [{ role: "system" as const, content: `${systemPrompt(mode)}\n\n=== DADOS EM TEMPO REAL ===\n${context}${extra}\n\n${LANGUAGE_REMINDER}` }, ...messages];
  }

  private register(): void {
    const p = this.platform;
    this.on("app:info", () => ({ version: p.version, platform: p.os, kind: p.kind, hasUsers: this.cloud.enabled || this.auth.hasUsers(), cloud: this.cloud.enabled, dataDir: p.dataDir }));

    // ---- autenticação ----
    this.on("auth:session", () => {
      if (this.currentUserId) {
        const u = this.store.findUser(this.currentUserId);
        return u ? this.store.toPublic(u) : null;
      }
      const s = this.store.app.session;
      if (!s || Date.parse(s.expiresAt) < Date.now()) return null;
      const u = this.store.findUser(s.userId);
      if (!u || u.status !== "ativo") return null;
      this.startSession(u.id, true);
      void this.sync();
      return this.store.toPublic(u);
    });
    this.on("auth:register", async (a: NewUserInput & { remember?: boolean }) => {
      const input = { name: String(a.name ?? ""), username: String(a.username ?? ""), password: String(a.password ?? ""), email: a.email };
      let user;
      if (this.cloud.enabled) {
        this.auth.validateNew(input);
        user = this.store.toPublic(await this.cloud.register(input, this.auth.localPassword.hash));
      } else {
        user = this.auth.register(input);
      }
      this.startSession(user.id, !!a.remember);
      this.engine.dataReady = true;
      return user;
    });
    this.on("auth:login", async (a: { username: string; password: string; remember?: boolean }) => {
      const username = String(a.username ?? "");
      const password = String(a.password ?? "");
      // Com a nuvem, a conta vale em qualquer aparelho; sem internet, entra com a cópia local.
      const cloudUser = this.cloud.enabled ? await this.cloud.login(username, password, this.auth.localPassword) : null;
      const user = cloudUser ? this.store.toPublic(cloudUser) : this.auth.login(username, password);
      this.startSession(user.id, !!a.remember);
      if (cloudUser) {
        this.engine.dataReady = true;
        void this.syncAiKey(user.id).catch(() => undefined);
      } else if (this.cloud.enabled) {
        // Entrou sem internet: tenta sincronizar já; se falhar, o motor segue com o que há aqui.
        void this.sync();
      }
      return user;
    });
    this.on("auth:logout", () => {
      this.endSession();
      return true;
    });
    this.on("auth:changePassword", async (a: { current: string; next: string }) => {
      const me = this.store.findUser(this.uid())!;
      if (this.cloud.enabled) {
        this.auth.validatePasswordOnly(a.next);
        await this.cloud.changePassword(me.id, me.username, a.current, a.next);
        Object.assign(me, (({ hash, salt }) => ({ passwordHash: hash, salt }))(this.auth.localPassword.hash(a.next)));
        this.store.save();
        return true;
      }
      return this.auth.changePassword(me.id, a.current, a.next);
    });
    this.on("auth:updateProfile", async (a: { name?: string; email?: string; username?: string }) => {
      if (this.cloud.enabled) {
        const me = this.store.findUser(this.uid())!;
        if (a.username !== undefined && a.username.trim() !== me.username) throw new AppError("FORBIDDEN", "O nome de usuário não pode ser trocado.");
        await this.cloud.updateUser(me.id, me.id, { name: a.name, email: a.email });
      }
      return this.auth.updateOwnProfile(this.uid(), { name: a.name, email: a.email, username: this.cloud.enabled ? undefined : a.username });
    });

    // ---- usuários (Dono/Administrador) ----
    // Com a nuvem, as regras de cargo também são conferidas no servidor.
    this.on("users:list", async () => {
      this.auth.requireManager(this.uid());
      return this.cloud.enabled ? this.cloud.listUsers(this.uid()) : this.auth.listUsers(this.uid());
    });
    this.on("users:create", async (a: NewUserInput) => {
      if (!this.cloud.enabled) return this.auth.createUser(this.uid(), a);
      const actor = this.auth.requireManager(this.uid());
      if (actor.role === "adm" && a.role && a.role !== "usuario") throw new AppError("FORBIDDEN", "Administradores só podem criar contas de Usuário.");
      this.auth.validateNew(a);
      await this.cloud.createUser(actor.id, a);
      return true;
    });
    this.on("users:update", async (a: { id: string; patch: { name?: string; username?: string; email?: string; role?: Role; status?: UserStatus } }) => {
      if (!this.cloud.enabled) return this.auth.updateUser(this.uid(), a.id, a.patch);
      const actor = this.auth.requireManager(this.uid());
      if (a.patch.role && actor.role !== "dono") throw new AppError("FORBIDDEN", "Apenas o Dono pode mudar cargos.");
      await this.cloud.updateUser(actor.id, a.id, { name: a.patch.name, email: a.patch.email, role: a.patch.role, status: a.patch.status });
      const local = this.store.findUser(a.id);
      if (local) Object.assign(local, a.patch.role ? { role: a.patch.role } : {}, a.patch.status ? { status: a.patch.status } : {});
      return true;
    });
    this.on("users:resetPassword", async (a: { id: string; password: string }) => {
      if (!this.cloud.enabled) return this.auth.resetPassword(this.uid(), a.id, a.password);
      this.auth.validatePasswordOnly(String(a.password ?? ""));
      return this.cloud.resetPassword(this.auth.requireManager(this.uid()).id, a.id, a.password);
    });
    this.on("users:delete", async (a: { id: string }) => {
      if (!this.cloud.enabled) return this.auth.deleteUser(this.uid(), a.id);
      await this.cloud.deleteUser(this.auth.requireManager(this.uid()).id, a.id);
      if (this.store.findUser(a.id)) this.store.removeUser(a.id);
      return true;
    });
    this.on("cloud:sync", async () => {
      await this.sync();
      return this.cloud.enabled;
    });

    // ---- dados do usuário ----
    this.on("data:getAll", () => this.store.getAllData(this.uid()));
    this.on("data:set", (a: { key: UserDataKey; value: UserDataMap[UserDataKey] }) => {
      if (!USER_DATA_KEYS.includes(a.key)) throw new AppError("INVALID", "Dado inválido.");
      const isArray = ["portfolio", "goals", "expenses", "alerts", "chat", "invoices", "accounts", "bills", "memory", "planned", "boxes"].includes(a.key);
      if (isArray !== Array.isArray(a.value) || a.value === null || typeof a.value !== "object") throw new AppError("INVALID", "Formato inválido.");
      this.store.setData(this.uid(), a.key, a.value);
      this.cloud.schedulePush(this.uid(), [a.key]);
      if (a.key === "alerts" || a.key === "portfolio" || a.key === "settings" || a.key === "invoices" || a.key === "bills" || a.key === "boxes") this.engine.runNow();
      if (a.key === "alerts" || a.key === "settings" || a.key === "invoices" || a.key === "bills" || a.key === "profile") this.refreshDevice();
      return true;
    });

    // ---- notificações ----
    // Lidas e apagadas valem para todos os aparelhos da conta.
    const editInbox = (fn: (x: Inbox) => Inbox) => {
      const list = this.store.updateInbox(this.uid(), fn);
      this.cloud.schedulePush(this.uid(), [INBOX_KEY]);
      return list;
    };
    this.on("notifications:list", () => this.store.getNotifications(this.uid()));
    this.on("notifications:markRead", (a: { id?: string }) => editInbox((x) => markRead(x, typeof a?.id === "string" ? a.id : undefined)));
    this.on("notifications:remove", (a: { id: string }) => editInbox((x) => removeItem(x, String(a?.id ?? ""))));
    this.on("notifications:clear", () => editInbox((x) => clearItems(x)));
    this.on("alerts:state", () => this.store.engine(this.uid()).alertState);
    this.on("alerts:rearm", (a: { id: string }) => {
      // Rearme marcado com horário (e não apagado) para valer também nos outros aparelhos.
      const st = this.store.engine(this.uid()).alertState;
      if (st[a.id]) st[a.id] = { fired: false, changedAt: new Date().toISOString() };
      this.store.save();
      this.cloud.schedulePush(this.uid(), [INBOX_KEY]);
      this.engine.runNow();
      return true;
    });

    // ---- mercado (dados reais) ----
    this.on("market:quotes", (a: { symbols: string[]; maxAgeMs?: number }) =>
      getQuotes((a.symbols ?? []).slice(0, 400).map(String), Math.max(5_000, a.maxAgeMs ?? 10_000))
    );
    this.on("market:chart", (a: { symbol: string; range: ChartRange }) => getChart(String(a.symbol), VALID_RANGES.includes(a.range) ? a.range : "1M"));
    this.on("market:search", (a: { query: string }) => search(String(a.query ?? "").slice(0, 60)));
    this.on("market:indicators", () => getIndicators());
    this.on("market:copom", () => getCopom());
    this.on("market:tesouro", () => getTesouro());
    this.on("market:news", () => getNews());
    this.on("market:selicHistory", () => getSelicHistory());
    this.on("market:ipcaHistory", () => getIpcaHistory(25));
    this.on("portfolio:history", (a: { range: ChartRange; holdings?: Holding[] }) =>
      portfolioHistory(a.holdings ?? this.store.getData(this.uid(), "portfolio"), VALID_RANGES.includes(a.range) ? a.range : "6M")
    );
    this.on("banks:get", () => getBanks());

    // ---- inteligência artificial ----
    this.on("ai:info", () => this.ai.info(this.isOwner()));
    this.on("ai:setConfig", (a: AiConfigPatch) => {
      this.requireOwner();
      this.ai.setConfig(a);
      if (this.cloud.enabled) {
        // A configuração vale para todas as contas, em qualquer aparelho. Se estiver sem
        // internet, fica pendente e sobe na próxima sincronização.
        // Sobe só o que mudou, por cima da versão da nuvem: a chave da Groq salva em
        // outro aparelho não some quando este salva a da NVIDIA.
        const payload = mergeAiCloud(this.cloud.aiPending, this.ai.cloudConfig(a));
        const userId = this.uid();
        this.cloud.aiPending = payload;
        void this.cloud
          .pullAi(userId, true)
          .then((cloud) => this.cloud.pushAi(userId, mergeAiCloud(cloud, payload)))
          .then(() => {
            if (this.cloud.aiPending === payload) this.cloud.aiPending = undefined;
          })
          .catch(() => undefined);
      }
      this.refreshDevice();
      return this.ai.info(true);
    });
    this.on("insight:get", () => this.store.app.insights?.[this.uid()] ?? null);
    this.on("insight:refresh", () => this.dailyInsight(true));
    this.on("ai:logs", () => {
      this.requireOwner();
      return this.store.app.aiLog ?? [];
    });
    this.on("ai:logs:clear", () => {
      this.requireOwner();
      this.store.app.aiLog = [];
      this.store.save();
      return true;
    });
    this.on("ai:catalog", (a: { force?: boolean }) => {
      this.requireOwner();
      return this.ai.catalog(!!a.force);
    });
    this.on("ai:test", (a: { provider?: "groq" | "nvidia"; key?: string } | undefined) => {
      this.requireOwner();
      const provider = a?.provider === "groq" || a?.provider === "nvidia" ? a.provider : undefined;
      return this.ai.test(provider, typeof a?.key === "string" && a.key.trim() ? a.key : undefined);
    });
    this.on("ai:chat", (a: AiChatRequest) => {
      const userId = this.uid();
      const owner = this.isOwner();
      const mode = MODES.includes(a.mode as AiMode) ? (a.mode as AiMode) : "mercado";
      const messages = trimHistory(a.messages);
      const controller = new AbortController();
      this.aiControllers.set(a.requestId, controller);
      const emit = (type: AiEvent["type"], data?: string) => {
        if (!controller.signal.aborted) p.emit("ai:event", { requestId: a.requestId, type, data });
      };
      void (async () => {
        try {
          if (!this.ai.info(true).hasKey) {
            throw new AppError("AI_NO_KEY", "A IA ainda não foi configurada. Coloque a chave da Groq ou da NVIDIA em Configurações → Inteligência Artificial.");
          }
          let attachment = a.attachment;
          if (a.web) {
            emit("context", "Pesquisando na internet…");
            const q = messages.filter((m) => m.role === "user").pop()?.content ?? "";
            const results = await webSearch(this.ai.searchKey(), q.slice(0, 300), 5);
            const ctx = resultsToContext(results);
            if (ctx) attachment = `${attachment ?? ""}\n\n${ctx}\n\nNo fim da resposta, liste as fontes usadas como links Markdown.`;
          }
          const full = await this.aiMessages(userId, mode, messages, attachment);
          if (controller.signal.aborted) return;
          emit("context", modeInfo(mode).label);
          await this.ai.stream(full, (delta) => emit("chunk", delta), controller.signal, CHAT_MAX_TOKENS, {
            onModel: owner ? (label) => emit("model", label) : undefined,
            onReplace: (text) => emit("replace", text),
          });
          emit("done");
        } catch (err) {
          emit("error", this.aiError(err));
        } finally {
          this.aiControllers.delete(a.requestId);
        }
      })();
      return true;
    });
    this.on("ai:cancel", (a: { requestId: string }) => {
      this.aiControllers.get(a.requestId)?.abort();
      this.aiControllers.delete(a.requestId);
      return true;
    });

    // ---- vale a pena comprar? ----
    this.on("deals:check", async (a: { query: string; price?: number }) => {
      const userId = this.uid();
      const query = String(a.query ?? "").trim().slice(0, 500);
      if (!query) throw new AppError("INVALID", "Cole o link ou escreva o nome do produto.");
      return checkDeal({ query, price: Number(a.price) || undefined }, this.budgetOf(userId));
    });
    this.on("deals:context", (a: { deal: DealCheck; installments?: number }) => dealToText(a.deal, a.installments));

    // ---- relatórios ----
    this.on("reports:export", async (a: { ym: string; format: "pdf" | "xlsx"; withAi?: boolean }) => {
      const userId = this.uid();
      const user = this.store.findUser(userId)!;
      const profile = this.store.getData(userId, "profile");
      const ym = String(a.ym);
      const summary = summarizeMonth(this.store.getData(userId, "expenses"), ym, profile.salary, profile.extraIncome);
      const input: ReportInput = { userName: user.name, summary, salary: profile.salary, extraIncomeProfile: profile.extraIncome, invoices: this.store.getData(userId, "invoices") };
      if (a.withAi && this.ai.info(true).hasKey) {
        try {
          const ask = `Escreva a análise do relatório de gastos de ${ym} para colocar no PDF: diagnóstico do mês em 2 ou 3 frases, os 3 pontos de atenção com valores, e 3 ações concretas para o próximo mês. Use no máximo 220 palavras e Markdown simples (sem tabelas).`;
          input.aiAnalysis = await this.ai.complete(await this.aiMessages(userId, "financas", [{ role: "user", content: ask }]));
        } catch (err) {
          if (this.isOwner()) throw err;
        }
      }
      const format = a.format === "xlsx" ? "xlsx" : "pdf";
      return p.saveReport({
        ym,
        format,
        fileName: `Investa-Gastos-${ym}.${format}`,
        html: () => buildReportHtml(input),
        xlsx: () => buildExcel(input),
        pdf: () => buildPdf(input),
      });
    });

    // ---- planos do Assistente (gastos que vão vir) ----
    this.on("plans:expense", async (a: { id: string }) => {
      const userId = this.uid();
      const item = this.store.getData(userId, "planned").find((p) => p.id === a.id);
      if (!item) throw new AppError("NOT_FOUND", "Gasto planejado não encontrado.");
      const months = monthsUntil(item.date);
      const date = item.date.split("-").reverse().join("/");
      const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const weeks = Math.max(1, Math.floor((Date.parse(`${item.date}T12:00:00`) - Date.now()) / (7 * 86_400_000)));
      let numbers = `${money(item.amount)} ÷ ${months} ${months === 1 ? "mês" : "meses"} = ${money(item.amount / months)} por mês (ou ${money(item.amount / weeks)} por semana, em ${weeks} ${weeks === 1 ? "semana" : "semanas"}).`;
      const market = planMarket(await getIndicators().catch(() => undefined), undefined, months / 12);
      if (market.live && months > 1) {
        numbers += ` Deixando no Tesouro Selic ou num CDB de 100% do CDI (CDI de hoje: ${planPct(market.cdiNow)} a.a., Banco Central${market.cdiDate ? `, ${market.cdiDate}` : ""}), os juros ajudam: bastam ${money(planMonthlyFor(item.amount, months, market))} por mês, começando agora, já descontado o IR.`;
      }
      const ask = `Monte um plano para eu conseguir pagar "${item.description}" de ${money(item.amount)} em ${date} (faltam cerca de ${months} ${months === 1 ? "mês" : "meses"}) sem me endividar.${item.notes ? ` Observação: ${item.notes}.` : ""}
Números calculados pelo app (use estes valores, não invente outros): ${numbers}
Use meus dados reais (renda, disponível do mês, faturas, contas fixas, saldos, outros gastos planejados). Estrutura:
1. Diagnóstico em 2 frases: dá ou não dá com o que sobra hoje.
2. Quanto guardar por semana ou por mês e onde deixar o dinheiro até a data (algo com liquidez diária).
3. O que cortar ou ajustar, com valores.
4. Um checklist com datas, uma linha por passo, exatamente no formato "- [ ] DD/MM: ação com valor" (de hoje até a data do gasto).
5. Um plano B se apertar.
Máximo de 350 palavras.`;
      let text: string;
      try {
        text = await this.ai.complete(await this.aiMessages(userId, "financas", [{ role: "user", content: ask }]), undefined, 1800);
      } catch (err) {
        throw new AppError("AI_ERROR", this.aiError(err));
      }
      return { createdAt: new Date().toISOString(), text, steps: parsePlanSteps(text) };
    });
    // ---- plano de investimento e de riqueza ----
    this.on("plans:wealth", async (a: { answers: WealthAnswers }) => {
      const userId = this.uid();
      const ans = a.answers;
      const style = (["seguro", "equilibrado", "crescimento"] as const).includes(ans?.style) ? ans.style : "equilibrado";
      const years = Math.min(50, Math.max(1, Math.round(Number(ans?.years) || 10)));
      const monthly = Math.min(1e8, Math.max(0, Number(ans?.monthly) || 0));
      const start = Math.min(1e10, Math.max(0, Number(ans?.start) || 0));
      const goal = String(ans?.goal ?? "").slice(0, 300) || "construir patrimônio";
      const [ind, tesouro] = await Promise.all([
        getIndicators().catch(() => undefined),
        Promise.race([getTesouro(), new Promise<undefined>((r) => setTimeout(r, 8_000, undefined))]).catch(() => undefined),
      ]);
      // Mesma conta da tela, para a IA não inventar valores.
      const market = planMarket(ind, tesouro, years);
      const alloc = planAllocation(style, years, goal);
      const proj = projectPlan(start, monthly, alloc.parts, market);
      const compare = compareProducts(start, monthly, market);
      const brief = planBrief(start, monthly, alloc, market, proj, compare, explainPlan(start, monthly, alloc, market, proj, compare));
      const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

      // Pesquisa na internet (com a chave do Dono, se houver; senão, a busca grátis). Se nada vier, usa só a base de livros.
      const styleWord = style === "seguro" ? "conservador renda fixa" : style === "equilibrado" ? "moderado diversificado" : "longo prazo ações e fundos imobiliários";
      const results = await webSearchMany(
        this.ai.searchKey(),
        [
          `plano para enriquecer investindo ${money(monthly)} por mês ${styleWord} passo a passo Brasil`,
          `como investir com pouco dinheiro começando do zero ${goal}`,
          `estratégias de milionários e livros de finanças para ${goal} investidor ${styleWord}`,
        ],
        4,
        8
      );
      const ask = `Monte meu PLANO DE INVESTIMENTO E DE RIQUEZA personalizado e explique o porquê de cada escolha.
Objetivo: ${goal}. Prazo: ${years} anos. Estilo: ${style}. Já tenho ${money(start)} para começar (valor único, colocado uma vez) e ${monthly > 0 ? `consigo guardar ${money(monthly)} por mês` : "por enquanto não vou guardar nada por mês"}.${ans?.notes ? ` Observações: ${String(ans.notes).slice(0, 300)}.` : ""}

Os números abaixo foram calculados pelo app com dados reais de hoje (Banco Central, Boletim Focus e Tesouro Direto).
REGRAS: use exatamente esses valores. Não calcule nem invente outras rentabilidades, taxas ou valores finais; se precisar de um número que não está aqui, fale de forma geral. Sempre diga se um valor é "no futuro" ou "em dinheiro de hoje".

${brief}

Use também meus dados reais (renda, disponível do mês, faturas, contas fixas, reserva, perfil), os princípios dos livros abaixo${results.length ? " e os resultados da pesquisa na internet (cite [1], [2]…)" : ""}.
Estrutura:
## Onde você está — 2 a 3 frases com números.
## Por que este plano — em linguagem simples: por que essa carteira combina com o estilo "${style}", com o prazo e com o objetivo, e por que o resultado é esse (quanto sai do bolso, quanto vem de juros, quanto a inflação come).
## Fases — 1) organizar e montar a reserva de emergência; 2) primeiros investimentos (mesmo com centavos ou R$ 1: Tesouro Selic, CDB com liquidez diária e garantia do FGC); 3) diversificar conforme a carteira acima; 4) acelerar (aumentar a renda e os aportes). Para cada fase: o que fazer, onde investir, quanto, até quando e por quê.
## Marcos — copie a tabela "Evolução" acima, sem mudar os valores.
## Hábitos — 5 hábitos dos livros aplicados à minha realidade.
## Checklist — uma linha por passo, exatamente no formato "- [ ] DD/MM/AAAA: ação com valor", dos próximos 12 meses.
${results.length ? "## Fontes — liste as fontes da internet que você usou, com o número e o link." : ""}
Seja realista, não prometa rentabilidade e não indique ativos específicos de risco como certeza. Máximo de 800 palavras, sem contar a tabela.

${BOOK_PRINCIPLES}

${resultsToContext(results)}`;
      let text: string;
      try {
        text = await this.ai.complete(await this.aiMessages(userId, "financas", [{ role: "user", content: ask }]), undefined, 3000);
      } catch (err) {
        throw new AppError("AI_ERROR", this.aiError(err));
      }
      return { createdAt: new Date().toISOString(), text, steps: parsePlanSteps(text), sources: results.map((r) => ({ title: r.title, url: r.url })), searched: results.length > 0 };
    });
    this.on("search:test", async (a: { key: string }) => {
      this.requireOwner();
      return testSearch(String(a.key ?? ""));
    });

    this.on("plans:export", async (a: { title: string; subtitle?: string; markdown: string; fileName?: string }) => {
      const title = String(a.title ?? "Plano").slice(0, 120);
      const subtitle = String(a.subtitle ?? `Gerado em ${new Date().toLocaleDateString("pt-BR")}`).slice(0, 200);
      const markdown = String(a.markdown ?? "");
      const safe = (a.fileName ?? title).normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "Plano";
      return p.saveReport({
        ym: currentYm(),
        format: "pdf",
        fileName: `Investa-${safe}.pdf`,
        html: () => buildDocHtml(title, subtitle, markdown),
        xlsx: () => Promise.reject(new AppError("INVALID", "Este documento só sai em PDF.")),
        pdf: () => buildDocPdf(title, subtitle, markdown),
      });
    });

    // ---- backup em arquivo ----
    this.on("backup:export", async () => {
      const userId = this.uid();
      const user = this.store.findUser(userId)!;
      const data = this.store.getAllData(userId);
      const payload = JSON.stringify({ app: "Investa", version: 1, exportedAt: new Date().toISOString(), user: { name: user.name, username: user.username }, data }, null, 2);
      const day = new Date().toISOString().slice(0, 10);
      return p.saveReport({
        ym: currentYm(),
        format: "json",
        fileName: `Investa-backup-${user.username}-${day}.json`,
        html: () => "",
        xlsx: () => Promise.reject(new AppError("INVALID", "Formato inválido.")),
        pdf: () => Promise.reject(new AppError("INVALID", "Formato inválido.")),
        json: () => payload,
      });
    });
    this.on("backup:import", async (a: { json: string }) => {
      const userId = this.uid();
      let parsed: { app?: string; data?: Record<string, unknown> };
      try {
        parsed = JSON.parse(String(a.json ?? ""));
      } catch {
        throw new AppError("INVALID", "Arquivo inválido: não é um backup do Investa.");
      }
      if (parsed.app !== "Investa" || !parsed.data || typeof parsed.data !== "object") throw new AppError("INVALID", "Arquivo inválido: não é um backup do Investa.");
      const clean: Record<string, unknown> = {};
      for (const key of USER_DATA_KEYS) {
        const v = parsed.data[key];
        if (v === undefined || v === null || typeof v !== "object") continue;
        const isArray = Array.isArray(this.store.getData(userId, key));
        if (Array.isArray(v) !== isArray) continue;
        clean[key] = v;
      }
      if (!Object.keys(clean).length) throw new AppError("INVALID", "O backup não tem dados para restaurar.");
      this.store.replaceData(userId, { ...this.store.rawData(userId), ...clean });
      this.cloud.schedulePush(userId, Object.keys(clean));
      this.engine.runNow();
      return this.store.getAllData(userId);
    });

    this.on("voice:listen", async () => {
      if (!p.voiceInput) throw new AppError("UNSUPPORTED", "Ditado por voz não disponível neste aparelho.");
      return p.voiceInput();
    });

    // ---- janela e sistema ----
    this.on("window:setTheme", (a: { theme: "dark" | "light" }) => {
      const theme = a.theme === "light" ? "light" : "dark";
      this.store.app.lastTheme = theme;
      this.store.save();
      p.setTheme?.(theme);
      return true;
    });
    this.on("app:icon", async (a?: { variant?: "dark" | "light" }) => {
      if (a?.variant) {
        const variant = a.variant === "light" ? "light" : "dark";
        if (variant !== (this.store.app.appIcon ?? "dark")) await p.setAppIcon?.(variant);
        this.store.app.appIcon = variant;
        this.store.save();
      }
      return { variant: this.store.app.appIcon ?? "dark", supported: !!p.setAppIcon };
    });
    this.on("shell:openExternal", (a: { url: string }) => {
      const url = safeExternalUrl(a?.url);
      if (url) p.openExternal(url);
      return true;
    });
  }
}
