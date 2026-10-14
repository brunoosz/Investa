// Contas e dados na nuvem (Supabase). Com a nuvem configurada no build, o login
// é o mesmo no PC e no celular, os dados de cada conta ficam guardados no
// servidor e os cargos são decididos lá (supabase/schema.sql): a primeira conta
// é a do Dono e as outras começam como Usuário. Cada aparelho guarda uma cópia
// local para funcionar sem internet; quando a conexão volta, sincroniza.
import type { PublicUser, Role, UserDataMap, UserStatus } from "@shared/types";
import type { Store, UserRecord } from "./store";
import { AppError } from "./auth";
import { fetchWithTimeout } from "./http";
import { INBOX_KEY, isEmptyInbox, mergeInbox, parseInbox, pruneInbox, sameInbox, sameItems } from "./inbox";

declare const __INVESTA_CLOUD_URL__: string | undefined;
declare const __INVESTA_CLOUD_KEY__: string | undefined;

/** Só o endereço do projeto (https://xxxx.supabase.co), mesmo se o segredo vier com /rest/v1/ ou espaços. */
function projectUrl(raw: string): string {
  const text = raw.trim().replace(/^["']|["']$/g, "");
  if (!text) return "";
  try {
    return new URL(/^https?:\/\//.test(text) ? text : `https://${text}`).origin;
  } catch {
    return "";
  }
}
const CLOUD_URL = projectUrl(typeof __INVESTA_CLOUD_URL__ === "string" ? __INVESTA_CLOUD_URL__ : "");
const CLOUD_KEY = (typeof __INVESTA_CLOUD_KEY__ === "string" ? __INVESTA_CLOUD_KEY__ : "").trim().replace(/^["']|["']$/g, "");

/** O Supabase entra por e-mail; o app usa nome de usuário, então cada usuário vira um e-mail interno. */
const emailOf = (username: string) => `${username.trim().toLowerCase()}@contas.investa.app`;

interface Tokens {
  access: string;
  refresh: string;
  expiresAt: number;
}

export interface CloudProfile {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: Role;
  status: UserStatus;
  avatar_hue: number;
  data: Partial<UserDataMap>;
  data_updated_at: string;
  created_at: string;
  last_login_at: string | null;
}

export interface CloudState {
  sessions?: Record<string, Tokens>;
  /** data_updated_at da nuvem na última sincronização de cada conta. */
  syncedAt?: Record<string, string>;
  /** Contas com mudanças locais ainda não enviadas (legado, antes do controle por chave). */
  dirty?: Record<string, number>;
  /** Por conta: chave dos dados → quando mudou aqui e ainda não subiu. */
  dirtyKeys?: Record<string, Record<string, number>>;
  /** Contas que já foram ligadas à nuvem neste aparelho. */
  linked?: Record<string, boolean>;
  aiUpdatedAt?: string;
  /** Configuração da IA que o Dono mudou e ainda não chegou à nuvem (sem internet). */
  aiPending?: AiCloudConfig;
}

/** Configuração da IA guardada na nuvem (uma para todas as contas). */
export interface AiCloudConfig {
  apiKey?: string | null;
  model?: string;
  baseUrl?: string;
  searchKey?: string | null;
  groqKey?: string | null;
  groqModel?: string;
  primary?: "nvidia" | "groq";
  /** Quando o Dono mudou; a versão mais nova vence. */
  changedAt?: string;
}

class NetworkError extends Error {}

export class CloudService {
  readonly enabled = !!(CLOUD_URL && CLOUD_KEY);
  private pushTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pushing = new Set<string>();
  private pushAgain = new Set<string>();

  constructor(private store: Store) {}

  private get state(): CloudState {
    return (this.store.app.cloud ??= {});
  }

  // ---- HTTP ----

  private async request<T>(path: string, init: { method?: string; body?: unknown; token?: string; prefer?: string } = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${CLOUD_URL}${path}`,
        {
          method: init.method ?? "GET",
          headers: {
            apikey: CLOUD_KEY,
            Authorization: `Bearer ${init.token ?? CLOUD_KEY}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(init.prefer ? { Prefer: init.prefer } : {}),
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        },
        20_000
      );
    } catch {
      throw new NetworkError("Sem conexão com o servidor.");
    }
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      const j = (json ?? {}) as { msg?: string; message?: string; error_description?: string; error?: string; code?: string; error_code?: string };
      const msg = j.msg || j.message || j.error_description || j.error || `HTTP ${res.status}`;
      const code = j.error_code || j.code || (typeof j.error === "string" ? j.error : "");
      if (res.status >= 500) throw new NetworkError(msg);
      throw Object.assign(new AppError("CLOUD", translate(msg)), { status: res.status, cloudCode: code, raw: msg });
    }
    return json as T;
  }

  private saveTokens(userId: string, t: { access_token: string; refresh_token: string; expires_in: number }): Tokens {
    const tokens = { access: t.access_token, refresh: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 };
    this.state.sessions = { ...(this.state.sessions ?? {}), [userId]: tokens };
    this.store.save();
    return tokens;
  }

  /** Token válido da conta, renovando quando está para vencer. */
  private async token(userId: string): Promise<string> {
    const t = this.state.sessions?.[userId];
    if (!t) throw new AppError("CLOUD_SESSION", "Entre novamente para sincronizar com a nuvem.");
    if (t.expiresAt - 60_000 > Date.now()) return t.access;
    try {
      const r = await this.request<{ access_token: string; refresh_token: string; expires_in: number }>("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: { refresh_token: t.refresh },
      });
      return this.saveTokens(userId, r).access;
    } catch (err) {
      if (err instanceof AppError && (err as { status?: number }).status !== 429) {
        delete this.state.sessions?.[userId];
        this.store.save();
        throw new AppError("CLOUD_SESSION", "Sua sessão na nuvem expirou. Entre novamente.");
      }
      throw err;
    }
  }

  // ---- contas ----

  private async signIn(username: string, password: string) {
    return this.request<{ access_token: string; refresh_token: string; expires_in: number; user: { id: string } }>("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: { email: emailOf(username), password },
    });
  }

  private async signUp(input: { username: string; password: string; name: string; email?: string; avatarHue?: number }) {
    const r = await this.request<{ access_token?: string; refresh_token?: string; expires_in?: number; user?: { id: string }; id?: string }>("/auth/v1/signup", {
      method: "POST",
      body: {
        email: emailOf(input.username),
        password: input.password,
        data: { username: input.username.trim(), name: input.name.trim(), contact_email: input.email?.trim() || "", avatar_hue: input.avatarHue ?? Math.floor(Math.random() * 360) },
      },
    });
    if (!r.access_token || !r.refresh_token) {
      throw new AppError(
        "CLOUD_CONFIRM",
        "A nuvem pediu confirmação por e-mail. No Supabase, desative Authentication → Sign In / Providers → Email → Confirm email."
      );
    }
    return { access_token: r.access_token, refresh_token: r.refresh_token, expires_in: r.expires_in ?? 3600, user: r.user ?? { id: r.id! } };
  }

  private async profile(userId: string, token: string): Promise<CloudProfile | null> {
    const rows = await this.request<CloudProfile[]>(`/rest/v1/profiles?id=eq.${uuid(userId)}&select=*`, { token });
    return rows[0] ?? null;
  }

  /** Copia o perfil da nuvem para a conta local (criando ou trocando o id, se preciso). */
  private adopt(p: CloudProfile, password: string | null, hashPassword: (pw: string) => { hash: string; salt: string }): UserRecord {
    let local = this.store.findUser(p.id);
    const sameName = this.store.findUserByUsername(p.username);
    if (!local && sameName) {
      this.store.rekeyUser(sameName.id, p.id);
      local = this.store.findUser(p.id);
    } else if (sameName && sameName.id !== p.id) {
      this.store.removeUser(sameName.id);
    }
    if (!local) {
      local = {
        id: p.id,
        name: p.name,
        username: p.username,
        usernameLower: p.username.toLowerCase(),
        role: p.role,
        status: p.status,
        passwordHash: "",
        salt: "",
        createdAt: p.created_at,
        avatarHue: p.avatar_hue,
      };
      this.store.addUser(local);
    }
    local.name = p.name;
    local.username = p.username;
    local.usernameLower = p.username.toLowerCase();
    local.email = p.email ?? undefined;
    local.role = p.role;
    local.status = p.status;
    local.avatarHue = p.avatar_hue;
    if (password) Object.assign(local, (({ hash, salt }) => ({ passwordHash: hash, salt }))(hashPassword(password)));
    local.lastLoginAt = new Date().toISOString();
    this.state.linked = { ...(this.state.linked ?? {}), [p.id]: true };
    this.store.save();
    return local;
  }

  /**
   * Entra pela nuvem. Se a conta só existe neste aparelho (criada antes da
   * nuvem), ela é enviada para a nuvem com os dados. Sem internet, devolve null
   * e o app usa o login local.
   */
  async login(
    username: string,
    password: string,
    local: { verify: (u: UserRecord, pw: string) => boolean; hash: (pw: string) => { hash: string; salt: string } }
  ): Promise<UserRecord | null> {
    let session: Awaited<ReturnType<CloudService["signIn"]>>;
    let migrated: UserRecord | undefined;
    try {
      session = await this.signIn(username, password);
    } catch (err) {
      if (err instanceof NetworkError) return null;
      const existing = this.store.findUserByUsername(username);
      // Só sobe para a nuvem uma conta que nunca esteve lá. Se ela já esteve e o
      // login falhou, a senha mudou em outro aparelho ou o Dono excluiu a conta.
      if (existing && existing.salt && !this.state.linked?.[existing.id] && local.verify(existing, password)) {
        try {
          session = await this.signUp({ username: existing.username, password, name: existing.name, email: existing.email, avatarHue: existing.avatarHue });
          migrated = existing;
        } catch (e) {
          if (e instanceof NetworkError) return null;
          if ((e as { cloudCode?: string }).cloudCode === "user_already_exists") throw new AppError("WRONG_PASSWORD", "Usuário ou senha incorretos.");
          throw e;
        }
      } else {
        throw new AppError("WRONG_PASSWORD", "Usuário ou senha incorretos.");
      }
    }
    const p = await this.profile(session.user.id, session.access_token);
    if (!p) throw new AppError("USER_NOT_FOUND", "Esta conta foi excluída.");
    if (p.status === "bloqueado") throw new AppError("BLOCKED", "Esta conta está bloqueada ou aguardando liberação. Fale com o Dono do aplicativo.");
    const tokens = this.saveTokens(session.user.id, session);
    const user = this.adopt(p, password, local.hash);
    if (migrated) {
      // Conta criada antes da nuvem: os dados deste aparelho sobem.
      this.markDirty(user.id, [...Object.keys(this.store.rawData(user.id)), INBOX_KEY]);
    }
    await this.pull(user.id, p).catch(() => undefined);
    void this.request(`/rest/v1/profiles?id=eq.${uuid(user.id)}`, { method: "PATCH", token: tokens.access, body: { last_login_at: new Date().toISOString() } }).catch(() => undefined);
    return user;
  }

  async register(
    input: { name: string; username: string; password: string; email?: string },
    hash: (pw: string) => { hash: string; salt: string }
  ): Promise<UserRecord> {
    if (this.store.findUserByUsername(input.username)) {
      throw new AppError("USERNAME_TAKEN", "Esse nome de usuário já está em uso. Escolha outro.");
    }
    let session: Awaited<ReturnType<CloudService["signUp"]>>;
    try {
      session = await this.signUp(input);
    } catch (err) {
      if (err instanceof NetworkError) throw new AppError("OFFLINE", "Sem internet. Para criar uma conta é preciso estar conectado.");
      if ((err as { cloudCode?: string }).cloudCode === "user_already_exists") throw new AppError("USERNAME_TAKEN", "Esse nome de usuário já está em uso. Escolha outro.");
      throw err;
    }
    const p = await this.profile(session.user.id, session.access_token);
    if (!p) throw new AppError("CLOUD", "A conta foi criada, mas o perfil não apareceu. Confira se o supabase/schema.sql foi aplicado.");
    // Contas novas podem precisar da liberação do Dono (supabase/schema.sql).
    if (p.status === "bloqueado") throw new AppError("PENDING", "Conta criada! Agora peça ao Dono do app para liberar seu acesso. Depois é só entrar.");
    this.saveTokens(session.user.id, session);
    return this.adopt(p, input.password, hash);
  }

  get aiPending(): CloudState["aiPending"] {
    return this.state.aiPending;
  }

  set aiPending(v: CloudState["aiPending"]) {
    this.state.aiPending = v;
    this.store.save();
  }

  /** Sair: envia o que falta, encerra a sessão no Supabase e apaga o token deste aparelho. */
  logout(userId: string | null): void {
    if (!userId) return;
    void (async () => {
      await this.push(userId).catch(() => undefined);
      try {
        const token = await this.token(userId);
        await this.request("/auth/v1/logout?scope=local", { method: "POST", token });
      } catch {
        // sem internet: o token some daqui mesmo assim e vence sozinho no servidor
      }
      if (this.state.sessions?.[userId]) {
        delete this.state.sessions[userId];
        this.store.save();
      }
    })();
  }

  // ---- dados ----
  // Os dados de cada conta ficam num documento só na nuvem. Para dois aparelhos
  // não apagarem as mudanças um do outro: cada aparelho marca quais partes
  // (gastos, faturas, metas…) mudou; o envio só vale se a nuvem ainda estiver
  // na versão que o aparelho conhece; se outro aparelho mudou antes, o app
  // junta as duas versões (as partes mudadas aqui + o resto da nuvem) e envia
  // de novo. Os avisos (notificações, o que já foi avisado e o estado dos
  // alertas) vão juntos, em INBOX_KEY, e sempre se somam (core/inbox.ts).

  markDirty(userId: string, keys: string[]): void {
    if (!keys.length) return;
    const now = Date.now();
    const cur = { ...(this.state.dirtyKeys?.[userId] ?? {}) };
    for (const k of keys) cur[k] = now;
    this.state.dirtyKeys = { ...(this.state.dirtyKeys ?? {}), [userId]: cur };
    this.store.save();
  }

  private dirtyOf(userId: string): Record<string, number> {
    // Migra o formato antigo (conta inteira marcada).
    if (this.state.dirty?.[userId]) {
      delete this.state.dirty[userId];
      this.markDirty(userId, Object.keys(this.store.rawData(userId)));
    }
    return this.state.dirtyKeys?.[userId] ?? {};
  }

  /** Envia os dados da conta alguns segundos depois da última mudança. */
  schedulePush(userId: string, keys: string[]): void {
    if (!this.enabled) return;
    this.markDirty(userId, keys);
    clearTimeout(this.pushTimers.get(userId));
    this.pushTimers.set(
      userId,
      setTimeout(() => void this.push(userId).catch(() => undefined), 2000)
    );
  }

  async push(userId: string): Promise<void> {
    if (!this.enabled) return;
    const dirty = this.dirtyOf(userId);
    if (!Object.keys(dirty).length) return;
    if (this.pushing.has(userId)) {
      this.pushAgain.add(userId);
      return;
    }
    this.pushing.add(userId);
    try {
      const synced = this.state.syncedAt?.[userId];
      // Sem saber a versão da nuvem, primeiro busca e junta.
      if (!synced) {
        await this.pull(userId, undefined, true);
        return;
      }
      const sent = { ...dirty };
      const token = await this.token(userId);
      // O documento da nuvem é trocado inteiro, então os avisos vão sempre junto.
      const data = { ...this.store.rawData(userId), [INBOX_KEY]: pruneInbox(this.store.inbox(userId)) };
      const rows = await this.request<CloudProfile[]>(
        `/rest/v1/profiles?id=eq.${uuid(userId)}&data_updated_at=eq.${encodeURIComponent(synced)}&select=data_updated_at`,
        { method: "PATCH", token, prefer: "return=representation", body: { data, data_updated_at: new Date().toISOString() } }
      );
      if (!rows.length) {
        // Outro aparelho mudou a nuvem antes: junta e tenta de novo.
        await this.pull(userId, undefined, true);
        return;
      }
      this.state.syncedAt = { ...(this.state.syncedAt ?? {}), [userId]: rows[0].data_updated_at };
      // Só limpa o que foi enviado; o que mudou durante o envio continua pendente.
      const cur = this.state.dirtyKeys?.[userId] ?? {};
      for (const [k, t] of Object.entries(sent)) if (cur[k] === t) delete cur[k];
      this.store.save();
    } finally {
      this.pushing.delete(userId);
      if (this.pushAgain.delete(userId)) void this.push(userId).catch(() => undefined);
    }
  }

  /** Traz os dados da nuvem e junta com as mudanças locais ainda não enviadas. Devolve true se algo mudou aqui. */
  async pull(userId: string, known?: CloudProfile, fromPush = false): Promise<boolean> {
    if (!this.enabled) return false;
    const token = await this.token(userId);
    const p = known ?? (await this.profile(userId, token));
    if (!p) throw new AppError("USER_NOT_FOUND", "Esta conta foi excluída.");
    const local = this.store.findUser(userId);
    let changed = false;
    if (local && (local.role !== p.role || local.status !== p.status || local.name !== p.name)) {
      local.role = p.role;
      local.status = p.status;
      local.name = p.name;
      changed = true;
    }
    const synced = this.state.syncedAt?.[userId];
    const dirty = this.dirtyOf(userId);
    const localData = { ...this.store.rawData(userId) } as Record<string, unknown>;
    const remote = { ...(p.data ?? {}) } as Record<string, unknown>;
    const remoteInbox = parseInbox(remote[INBOX_KEY]);
    delete localData[INBOX_KEY];
    delete remote[INBOX_KEY];
    if (p.data_updated_at !== synced || !Object.keys(remote).length) {
      // Junta os avisos: o que foi lido ou apagado em qualquer aparelho fica
      // lido ou apagado, e o que já foi avisado não é avisado de novo aqui.
      const mine = this.store.inbox(userId);
      const inbox = remoteInbox ? mergeInbox(mine, remoteInbox) : mine;
      if (!sameInbox(inbox, mine)) {
        this.store.setInbox(userId, inbox);
        if (!sameItems(inbox.items, mine.items)) changed = true;
      }
      if (remoteInbox ? !sameInbox(inbox, remoteInbox) : !isEmptyInbox(inbox)) this.markDirty(userId, [INBOX_KEY]);
    }
    if (!Object.keys(remote).length) {
      // Nuvem vazia (conta nova ou recém-migrada): tudo daqui sobe.
      this.state.syncedAt = { ...(this.state.syncedAt ?? {}), [userId]: p.data_updated_at };
      this.markDirty(userId, Object.keys(localData));
    } else if (p.data_updated_at !== synced) {
      const merged: Record<string, unknown> = { ...remote };
      for (const k of Object.keys(dirty)) if (localData[k] !== undefined) merged[k] = localData[k];
      if (!synced) {
        // Primeira vez deste aparelho com a nuvem: guarda uma cópia do que havia
        // aqui e mantém as partes que a nuvem ainda não tem.
        if (Object.keys(localData).length) this.store.writeExtra(`investa-backup-antes-da-nuvem-${userId}.json`, JSON.stringify(localData));
        const extra = Object.keys(localData).filter((k) => merged[k] === undefined);
        for (const k of extra) merged[k] = localData[k];
        this.markDirty(userId, extra);
      }
      if (JSON.stringify(merged) !== JSON.stringify(localData)) {
        this.store.replaceData(userId, merged);
        changed = true;
      }
      this.state.syncedAt = { ...(this.state.syncedAt ?? {}), [userId]: p.data_updated_at };
    }
    this.store.save();
    if (Object.keys(this.state.dirtyKeys?.[userId] ?? {}).length) {
      if (fromPush) this.pushAgain.add(userId);
      else await this.push(userId);
    }
    return changed;
  }

  // ---- administração ----

  /** Função do schema.sql; se o servidor ainda está na versão antiga, usa o caminho de antes. */
  private async rpcOr<T>(fn: string, token: string, body: Record<string, unknown>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await this.request<T>(`/rest/v1/rpc/${fn}`, { method: "POST", token, body });
    } catch (err) {
      if ((err as { cloudCode?: string }).cloudCode === "PGRST202") return fallback();
      throw err;
    }
  }

  async listUsers(actorId: string): Promise<PublicUser[]> {
    const token = await this.token(actorId);
    type Row = Omit<CloudProfile, "data" | "data_updated_at"> & { onboarded?: boolean };
    const rows = await this.rpcOr<Row[]>("admin_list_users", token, {}, () =>
      this.request<Row[]>("/rest/v1/profiles?select=id,username,name,email,role,status,avatar_hue,created_at,last_login_at,onboarded:data->profile->onboarded&order=created_at", { token })
    );
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      username: p.username,
      email: p.email ?? undefined,
      role: p.role,
      status: p.status,
      createdAt: p.created_at,
      lastLoginAt: p.last_login_at ?? undefined,
      avatarHue: p.avatar_hue,
      onboarded: !!p.onboarded,
    }));
  }

  async createUser(actorId: string, input: { name: string; username: string; password: string; email?: string; role?: Role }): Promise<void> {
    const created = await this.signUp(input).catch((err) => {
      if ((err as { cloudCode?: string }).cloudCode === "user_already_exists") throw new AppError("USERNAME_TAKEN", "Esse nome de usuário já está em uso. Escolha outro.");
      throw err;
    });
    // Conta criada pelo Dono ou Administrador já entra liberada.
    await this.updateUser(actorId, created.user.id, { status: "ativo", role: input.role && input.role !== "usuario" ? input.role : undefined });
  }

  async updateUser(actorId: string, id: string, patch: { name?: string; email?: string; role?: Role; status?: UserStatus }): Promise<void> {
    const token = await this.token(actorId);
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) body.name = patch.name.trim();
    if (patch.email !== undefined) body.email = patch.email.trim() || null;
    if (patch.role) body.role = patch.role;
    if (patch.status) body.status = patch.status;
    const args = { target: id, new_name: body.name ?? null, new_email: patch.email === undefined ? null : patch.email.trim(), new_role: body.role ?? null, new_status: body.status ?? null };
    await this.rpcOr("admin_update_user", token, args, async () => {
      const rows = await this.request<unknown[]>(`/rest/v1/profiles?id=eq.${uuid(id)}`, { method: "PATCH", token, body, prefer: "return=representation" });
      if (!rows.length) throw new AppError("FORBIDDEN", "Você não pode alterar esta conta.");
    });
  }

  async resetPassword(actorId: string, id: string, password: string): Promise<void> {
    await this.request("/rest/v1/rpc/admin_set_password", { method: "POST", token: await this.token(actorId), body: { target: id, new_password: password } });
  }

  async deleteUser(actorId: string, id: string): Promise<void> {
    await this.request("/rest/v1/rpc/admin_delete_user", { method: "POST", token: await this.token(actorId), body: { target: id } });
  }

  async changePassword(userId: string, username: string, current: string, next: string): Promise<void> {
    try {
      await this.signIn(username, current);
    } catch (err) {
      if (err instanceof NetworkError) throw new AppError("OFFLINE", "Sem internet. Para trocar a senha é preciso estar conectado.");
      throw new AppError("WRONG_PASSWORD", "A senha atual está incorreta.");
    }
    await this.request("/auth/v1/user", { method: "PUT", token: await this.token(userId), body: { password: next } });
  }

  // ---- configuração da IA (uma para todas as contas) ----

  async pullAi(userId: string, force = false): Promise<AiCloudConfig | null> {
    const rows = await this.request<{ ai: AiCloudConfig; updated_at: string }[]>("/rest/v1/app_settings?id=eq.1&select=ai,updated_at", {
      token: await this.token(userId),
    });
    const row = rows[0];
    if (!row || (!force && row.updated_at === this.state.aiUpdatedAt)) return null;
    this.state.aiUpdatedAt = row.updated_at;
    this.store.save();
    return row.ai ?? {};
  }

  async pushAi(userId: string, ai: AiCloudConfig): Promise<void> {
    const rows = await this.request<{ updated_at: string }[]>("/rest/v1/app_settings?id=eq.1", {
      method: "PATCH",
      token: await this.token(userId),
      prefer: "return=representation",
      body: { ai, updated_at: new Date().toISOString() },
    });
    if (rows[0]) this.state.aiUpdatedAt = rows[0].updated_at;
    this.store.save();
  }
}

function translate(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Usuário ou senha incorretos.";
  if (m.includes("already registered") || m.includes("already exists")) return "Esse nome de usuário já está em uso. Escolha outro.";
  if (m.includes("password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("signups not allowed")) return "A criação de contas está desativada no servidor.";
  if (m.includes("rate limit")) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  if (m.includes("jwt expired")) return "Sua sessão expirou. Entre novamente.";
  return msg;
}

/** IDs vão na URL da API: só aceita UUID, para ninguém enfiar filtros extras na consulta. */
function uuid(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AppError("INVALID", "Conta inválida.");
  return id;
}
