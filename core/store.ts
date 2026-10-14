import type { AiLogEntry, AlertRuntimeState, DailyInsight, AppNotification, PublicUser, Role, UserDataKey, UserDataMap, UserStatus } from "@shared/types";
import { defaultUserData } from "@shared/defaults";
import type { FileStore } from "./platform";
import type { CloudState } from "./cloud";
import { INBOX_KEY, mergeInbox, parseInbox, pruneInbox, type Inbox } from "./inbox";

const DB_FILE = "investa-data.json";
const BACKUP_FILE = "investa-data.bak.json";

export interface UserRecord {
  id: string;
  name: string;
  username: string;
  usernameLower: string;
  email?: string;
  role: Role;
  status: UserStatus;
  passwordHash: string;
  salt: string;
  createdAt: string;
  lastLoginAt?: string;
  avatarHue: number;
}

export interface EngineState {
  keys: Record<string, string>;
  alertState: Record<string, AlertRuntimeState>;
  removed?: Record<string, number>;
  seeded?: boolean;
}

export interface AiStoredConfig {
  /** "auto" (padrão) ou o id de um modelo escolhido pelo Dono. */
  model?: string;
  baseUrl?: string;
  apiKeyEnc?: string;
  keyMode?: "safe" | "plain";
  /** Modelos de conversa disponíveis na conta, atualizados uma vez por dia. */
  catalog?: { ids: string[]; updatedAt: string };
  /** Modelos que responderam 404/410 e foram retirados da escolha automática. */
  retired?: string[];
  /** Último modelo que respondeu (só para mostrar; não muda a escolha). */
  lastUsed?: string;
  /** Modelos que falharam há pouco (erro 5xx, sem resposta): ficam de fora até o horário indicado. */
  cooldown?: Record<string, number>;
  /** Tempo médio (ms) até a primeira palavra de cada modelo, para preferir os rápidos. */
  latency?: Record<string, number>;
  /** Chave da pesquisa na internet (Tavily "tvly-…" ou Brave). */
  searchKeyEnc?: string;
  searchKeyMode?: "safe" | "plain";
  /** Chave da Groq ("gsk_…"), opcional e mais rápida. */
  groqKeyEnc?: string;
  groqKeyMode?: "safe" | "plain";
  /** "auto" (padrão) ou o id de um modelo da Groq. */
  groqModel?: string;
  groqCatalog?: { ids: string[]; updatedAt: string };
  /** Qual provedor tenta primeiro quando os dois têm chave (padrão: Groq). */
  primary?: "nvidia" | "groq";
  /** Quando o Dono mudou a configuração pela última vez (para a nuvem não trazer uma versão mais antiga). */
  changedAt?: string;
}

interface DBShape {
  version: 1;
  users: UserRecord[];
  data: Record<string, Partial<UserDataMap>>;
  notifications: Record<string, AppNotification[]>;
  engine: Record<string, EngineState>;
  app: {
    ai?: AiStoredConfig;
    session?: { userId: string; token: string; expiresAt: string };
    lastTheme?: "dark" | "light";
    /** Ícone do app escolhido neste aparelho (Configurações → Aparência). */
    appIcon?: "dark" | "light";
    cloud?: CloudState;
    aiLog?: AiLogEntry[];
    /** Última análise diária da IA de cada conta, neste aparelho. */
    insights?: Record<string, DailyInsight>;
  };
}

function emptyDb(): DBShape {
  return { version: 1, users: [], data: {}, notifications: {}, engine: {}, app: {} };
}

export class Store {
  private db: DBShape;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private files: FileStore) {
    this.db = this.load();
    // Versões antigas guardavam a caixa de avisos da nuvem junto com os dados.
    for (const [userId, data] of Object.entries(this.db.data)) {
      const raw = data as Record<string, unknown>;
      if (raw[INBOX_KEY] === undefined) continue;
      const legacy = parseInbox(raw[INBOX_KEY]);
      delete raw[INBOX_KEY];
      if (legacy) this.setInbox(userId, mergeInbox(this.inbox(userId), legacy));
    }
  }

  private load(): DBShape {
    const raw = this.files.read(DB_FILE);
    if (raw === null) return emptyDb();
    try {
      const parsed = JSON.parse(raw) as Partial<DBShape>;
      const db = { ...emptyDb(), ...parsed, app: { ...(parsed.app ?? {}) } } as DBShape;
      this.files.write(BACKUP_FILE, raw);
      return db;
    } catch {
      // Arquivo corrompido: guarda uma cópia e tenta o backup da última abertura.
      this.files.write(`investa-data.corrompido-${Date.now()}.json`, raw);
      const backup = this.files.read(BACKUP_FILE);
      if (backup) {
        try {
          return { ...emptyDb(), ...JSON.parse(backup) } as DBShape;
        } catch {
          return emptyDb();
        }
      }
      return emptyDb();
    }
  }

  get app(): DBShape["app"] {
    return this.db.app;
  }

  save(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 250);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.files.write(DB_FILE, JSON.stringify(this.db));
  }

  // ---- usuários ----
  get users(): UserRecord[] {
    return this.db.users;
  }

  findUserByUsername(username: string): UserRecord | undefined {
    const lower = username.trim().toLowerCase();
    return this.db.users.find((u) => u.usernameLower === lower);
  }

  findUser(id: string): UserRecord | undefined {
    return this.db.users.find((u) => u.id === id);
  }

  addUser(u: UserRecord): void {
    this.db.users.push(u);
    this.db.data[u.id] = {};
    this.save();
  }

  /** Troca o id de uma conta local (quando ela passa a ser a mesma conta da nuvem). */
  rekeyUser(oldId: string, newId: string): void {
    const u = this.findUser(oldId);
    if (!u || oldId === newId) return;
    u.id = newId;
    for (const table of [this.db.data, this.db.notifications, this.db.engine] as Record<string, unknown>[]) {
      if (table[oldId] !== undefined) {
        table[newId] = table[oldId];
        delete table[oldId];
      }
    }
    if (this.db.app.session?.userId === oldId) this.db.app.session.userId = newId;
    this.save();
  }

  /** Grava um arquivo extra na pasta de dados (ex.: cópia de segurança). */
  writeExtra(name: string, data: string): void {
    try {
      this.files.write(name, data);
    } catch {
      // sem disco: segue sem a cópia
    }
  }

  rawData(userId: string): Partial<UserDataMap> {
    return this.db.data[userId] ?? {};
  }

  replaceData(userId: string, data: Partial<UserDataMap>): void {
    this.db.data[userId] = { ...data };
    this.save();
  }

  removeUser(id: string): void {
    this.db.users = this.db.users.filter((u) => u.id !== id);
    delete this.db.data[id];
    delete this.db.notifications[id];
    delete this.db.engine[id];
    if (this.db.app.session?.userId === id) delete this.db.app.session;
    this.save();
  }

  toPublic(u: UserRecord): PublicUser {
    const profile = this.db.data[u.id]?.profile;
    return {
      id: u.id,
      name: u.name,
      username: u.username,
      email: u.email,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      avatarHue: u.avatarHue,
      onboarded: profile?.onboarded ?? false,
    };
  }

  // ---- dados do usuário ----
  getData<K extends UserDataKey>(userId: string, key: K): UserDataMap[K] {
    const value = this.db.data[userId]?.[key];
    if (value === undefined) return defaultUserData()[key];
    if (key === "settings" || key === "profile" || key === "learning" || key === "simulator") {
      return { ...defaultUserData()[key], ...(value as object) } as UserDataMap[K];
    }
    return value as UserDataMap[K];
  }

  setData<K extends UserDataKey>(userId: string, key: K, value: UserDataMap[K]): void {
    if (!this.db.data[userId]) this.db.data[userId] = {};
    this.db.data[userId][key] = value;
    this.save();
  }

  getAllData(userId: string): UserDataMap {
    const defaults = defaultUserData();
    const out = {} as UserDataMap;
    for (const key of Object.keys(defaults) as UserDataKey[]) {
      (out as unknown as Record<string, unknown>)[key] = this.getData(userId, key);
    }
    return out;
  }

  // ---- notificações ----
  getNotifications(userId: string): AppNotification[] {
    return this.db.notifications[userId] ?? [];
  }

  setNotifications(userId: string, list: AppNotification[]): void {
    this.db.notifications[userId] = list.slice(0, 200);
    this.save();
  }

  /** Notificações, avisos já dados e estado dos alertas da conta (o que vai para a nuvem). */
  inbox(userId: string): Inbox {
    const st = this.engine(userId);
    return { items: this.getNotifications(userId), seen: st.keys, removed: st.removed ?? {}, alertState: st.alertState, ...(st.seeded ? { seeded: true } : {}) };
  }

  setInbox(userId: string, x: Inbox): void {
    const st = this.engine(userId);
    st.keys = x.seen;
    st.alertState = x.alertState;
    st.removed = x.removed;
    st.seeded = x.seeded || undefined;
    this.db.notifications[userId] = x.items;
    this.save();
  }

  /** Aplica uma mudança na caixa de avisos e devolve a lista atualizada. */
  updateInbox(userId: string, fn: (x: Inbox) => Inbox): AppNotification[] {
    const next = pruneInbox(fn(this.inbox(userId)));
    this.setInbox(userId, next);
    return next.items;
  }

  // ---- motor de alertas ----
  engine(userId: string): EngineState {
    if (!this.db.engine[userId]) this.db.engine[userId] = { keys: {}, alertState: {} };
    return this.db.engine[userId];
  }
}
