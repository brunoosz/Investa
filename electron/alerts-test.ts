// Teste dos avisos: nada que já foi avisado volta (sair e entrar, reabrir o
// app, outro aparelho), lida e apagada valem em todos os aparelhos.
// Roda com: npm run test:alerts (nuvem falsa em memória, sem internet).
import crypto from "node:crypto";
import type { AppNotification, Bill, Holding, PriceAlert, UserDataKey } from "@shared/types";
import { defaultUserData } from "@shared/defaults";
import { Backend } from "../core/backend";
import type { FileStore, Platform } from "../core/platform";
import { todayIsoSaoPaulo } from "../core/http";
import { INBOX_KEY, emptyInbox, mergeInbox, removeItem, markRead, sameInbox, type Inbox } from "../core/inbox";

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`OK   ${label}`);
  else {
    failures++;
    console.log(`FAIL ${label}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- nuvem falsa (Supabase) ----

interface Row {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: string;
  status: string;
  avatar_hue: number;
  data: Record<string, unknown>;
  data_updated_at: string;
  created_at: string;
  last_login_at: string | null;
}
const accounts = new Map<string, { id: string; password: string }>();
const rows = new Map<string, Row>();
let version = 0;
const stamp = () => new Date(Date.now() + ++version).toISOString();

function seedAccount(username: string, password: string, data: Record<string, unknown>, createdAt: string): string {
  const id = crypto.randomUUID();
  accounts.set(`${username}@contas.investa.app`, { id, password });
  rows.set(id, { id, username, name: username, email: null, role: rows.size ? "usuario" : "dono", status: "ativo", avatar_hue: 200, data, data_updated_at: stamp(), created_at: createdAt, last_login_at: null });
  return id;
}

const PRICES: Record<string, [number, number]> = { "PETR4.SA": [40, 39.6] };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const tokens = (id: string) => ({ access_token: `tok-${id}`, refresh_token: `ref-${id}`, expires_in: 3600, user: { id } });

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.host !== "nuvem.teste") {
    const m = /\/v8\/finance\/chart\/([^/?]+)/.exec(url.pathname);
    if (m) {
      const [price, prev] = PRICES[decodeURIComponent(m[1])] ?? [100, 100];
      return json({ chart: { result: [{ meta: { regularMarketPrice: price, chartPreviousClose: prev, currency: "BRL" } }] } });
    }
    throw new TypeError("fetch failed");
  }
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  const auth = new Headers(init?.headers).get("Authorization") ?? "";
  const me = auth.startsWith("Bearer tok-") ? auth.slice(11) : null;
  if (url.pathname === "/auth/v1/signup") {
    if (accounts.has(body.email)) return json({ error_code: "user_already_exists", msg: "User already registered" }, 422);
    const id = seedAccount(body.data.username, body.password, {}, new Date().toISOString());
    return json(tokens(id));
  }
  if (url.pathname === "/auth/v1/token") {
    if (url.searchParams.get("grant_type") === "refresh_token") return json(tokens(String(body.refresh_token).slice(4)));
    const acc = accounts.get(body.email);
    if (!acc || acc.password !== body.password) return json({ error: "invalid_grant", error_description: "Invalid login credentials" }, 400);
    return json(tokens(acc.id));
  }
  if (url.pathname === "/rest/v1/profiles") {
    const id = url.searchParams.get("id")?.replace(/^eq\./, "") ?? "";
    const row = rows.get(id);
    if (!row || id !== me) return json([]);
    if (method === "GET") return json([row]);
    if (method === "PATCH") {
      const expected = url.searchParams.get("data_updated_at");
      if (expected && expected !== `eq.${row.data_updated_at}`) return json([]);
      Object.assign(row, body, body.data_updated_at ? { data_updated_at: stamp() } : {});
      return json([row]);
    }
  }
  if (url.pathname === "/rest/v1/app_settings") return json([{ ai: {}, updated_at: "2026-01-01T00:00:00Z" }]);
  return json({ message: "não encontrado" }, 404);
}) as typeof fetch;

// ---- aparelhos ----

function memoryFiles(): FileStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, read: (n) => map.get(n) ?? null, write: (n, d) => void map.set(n, d) };
}

interface Device {
  name: string;
  backend: Backend;
  files: ReturnType<typeof memoryFiles>;
  /** Avisos novos que o motor mandou para a tela. */
  shown: AppNotification[];
  /** Avisos que viraram notificação do sistema (Windows/Android). */
  system: AppNotification[];
  call<T = unknown>(channel: string, args?: unknown): Promise<T>;
}

function device(name: string, files = memoryFiles()): Device {
  const shown: AppNotification[] = [];
  const system: AppNotification[] = [];
  const platform: Platform = {
    kind: "desktop",
    os: "linux",
    version: "teste",
    dataDir: "/memoria",
    files,
    secrets: { encrypt: (plain) => ({ data: plain, mode: "plain" }), decrypt: (data) => data },
    hashPassword: (password, salt) => crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex"),
    randomHex: (bytes) => crypto.randomBytes(bytes).toString("hex"),
    emit: (channel, payload) => {
      if (channel === "notifications:new") shown.push(payload as AppNotification);
    },
    notify: (n) => void system.push(n),
    saveReport: async () => null,
    openExternal: () => undefined,
  };
  const backend = new Backend(platform);
  // Sem relógio do motor: as rodadas são chamadas pelo teste, uma de cada vez.
  const engine = backend.engine as unknown as { userId: string | null; start(id: string): void; stop(): void };
  engine.start = (id: string) => {
    engine.stop();
    engine.userId = id;
  };
  return {
    name,
    backend,
    files,
    shown,
    system,
    async call<T>(channel: string, args?: unknown): Promise<T> {
      const r = await backend.invoke(channel, args);
      if (!r.ok) throw new Error(`${name} ${channel}: ${r.error.message}`);
      return r.data as T;
    },
  };
}

async function idle(d: Device): Promise<void> {
  const e = d.backend.engine as unknown as { running: boolean };
  while (e.running) await sleep(5);
}

async function tick(d: Device): Promise<void> {
  await idle(d);
  await d.backend.engine.tick();
  await idle(d);
}

/** Espera os envios para a nuvem terminarem. */
async function flush(d: Device): Promise<void> {
  const uid = d.backend.userId ?? [...rows.keys()].find((id) => d.backend.store.findUser(id));
  if (!uid) return;
  const cloud = d.backend.cloud as unknown as { pushing: Set<string>; pushTimers: Map<string, ReturnType<typeof setTimeout>> };
  for (let i = 0; i < 200; i++) {
    clearTimeout(cloud.pushTimers.get(uid));
    await d.backend.cloud.push(uid).catch(() => undefined);
    const dirty = d.backend.store.app.cloud?.dirtyKeys?.[uid] ?? {};
    if (!cloud.pushing.has(uid) && !Object.keys(dirty).length) return;
    await sleep(10);
  }
  throw new Error(`${d.name}: envio para a nuvem não terminou`);
}

const list = (d: Device) => d.call<AppNotification[]>("notifications:list");
const view = (l: AppNotification[]) => JSON.stringify(l.map((n) => [n.key ?? n.id, n.read]).sort());
const keysOf = (l: AppNotification[]) => l.map((n) => n.key ?? n.id);
const set = (d: Device, key: UserDataKey, value: unknown) => d.call("data:set", { key, value });

const today = todayIsoSaoPaulo();
const ym = today.slice(0, 7);
const day = Number(today.slice(8, 10));
const hourAgo = new Date(Date.now() - 3600_000).toISOString();
const bill = (id: string, name: string): Bill => ({ id, name, amount: 120, dueDay: day, category: "Casa", paid: [], active: true });
const reminder = (id: string, title: string, at: string): PriceAlert => ({ id, kind: "lembrete", title, remindAt: at, active: true, repeat: false, createdAt: at });

async function fillAccount(d: Device): Promise<void> {
  const defaults = defaultUserData();
  await set(d, "profile", { ...defaults.profile, onboarded: true, salary: 1000 });
  await set(d, "settings", { ...defaults.settings, marketEvents: false });
  await set(d, "bills", [bill("b1", "Internet")]);
  await set(d, "invoices", [{ id: "i1", institution: "Nubank", ym, amount: 5000, paid: false }]);
  const holding: Holding = { id: "h1", kind: "variavel", name: "Petrobras", category: "acoes", institution: "XP", purchaseDate: "2025-01-02", symbol: "PETR4.SA", quantity: 10, avgPrice: 30 };
  await set(d, "portfolio", [holding]);
  await set(d, "alerts", [reminder("r1", "Pagar o IPVA", hourAgo), { id: "p1", kind: "preco-acima", symbol: "PETR4.SA", value: 35, active: true, repeat: false, createdAt: hourAgo }]);
}

function unitTests(): void {
  const n = (id: string, key: string | undefined, createdAt: string, read = false): AppNotification => ({ id, key, type: "sistema", title: id, message: "", createdAt, read });
  const t1 = new Date(Date.now() - 60_000).toISOString();
  const t2 = new Date().toISOString();
  const a: Inbox = { ...emptyInbox(), items: [n("a1", "k1", t1, true), n("a2", "k2", t1)], seen: { k1: t1, k2: t1 } };
  const b: Inbox = { ...emptyInbox(), items: [n("b1", "k1", t2), n("b2", "k2", t2), n("b3", "k3", t2)], seen: { k1: t2, k2: t2, k3: t2 } };
  const ab = mergeInbox(a, b);
  check(sameInbox(ab, mergeInbox(b, a)), "junção dá o mesmo resultado nas duas ordens");
  check(ab.items.length === 3 && ab.items.find((x) => x.key === "k1")?.read === true, "mesmo aviso em dois aparelhos vira um só, e lido vence");
  check(ab.seen.k1 === t1, "registro guarda a primeira vez que o aviso foi dado");
  const removed = removeItem(ab, ab.items.find((x) => x.key === "k2")!.id);
  check(!mergeInbox(removed, b).items.some((x) => x.key === "k2"), "apagado continua apagado mesmo com cópia antiga");
  const read = markRead(b);
  check(mergeInbox(read, b).items.every((x) => x.read), "\"marcar todas como lidas\" vence a cópia antiga");
  const old = { ...emptyInbox(), seen: { welcome: "2020-01-01T00:00:00.000Z", velho: "2020-01-01T00:00:00.000Z" } };
  const pruned = mergeInbox(old, emptyInbox());
  check(!!pruned.seen.welcome && !pruned.seen.velho, "registro limpa o que tem mais de 90 dias, menos as boas-vindas");
}

async function main(): Promise<void> {
  unitTests();

  // 1) Aparelho A: conta nova, avisos de verdade.
  const A = device("PC");
  await A.call("auth:register", { name: "Ana Souza", username: "ana", password: "segredo1", remember: true });
  await fillAccount(A);
  await tick(A);
  const first = await list(A);
  const expected = ["welcome", `conta-b1-${ym}-hoje`, `fatura-renda-${ym}`, `rem-r1-${hourAgo}`, "alerta-p1@0", "carteira-gain:h1@0"];
  check(expected.every((k) => keysOf(first).includes(k)), `A gera os avisos esperados (${first.length})`);
  check(A.shown.length === first.length && A.system.length === first.length, "cada aviso aparece uma vez na tela e no sistema");
  await tick(A);
  check(A.shown.length === first.length, "nova rodada do motor não repete nada");

  // Lê um, apaga outro.
  const readOne = first.find((x) => x.key === `fatura-renda-${ym}`)!;
  const gone = first.find((x) => x.key === "alerta-p1@0")!;
  await A.call("notifications:markRead", { id: readOne.id });
  await A.call("notifications:remove", { id: gone.id });
  const afterEdit = await list(A);
  await flush(A);

  // 2) Sair e entrar de novo.
  const shownBefore = A.shown.length;
  await A.call("auth:logout");
  await flush(A);
  await A.call("auth:login", { username: "ana", password: "segredo1", remember: true });
  await tick(A);
  check(A.shown.length === shownBefore && A.system.length === shownBefore, "sair e entrar não repete avisos");
  check(view(await list(A)) === view(afterEdit), "sair e entrar mantém lidas e apagadas");

  // 3) Reabrir o app (outro Backend com os mesmos arquivos).
  A.backend.stop();
  await flush(A);
  A.backend.store.flush();
  const A2 = device("PC reaberto", A.files);
  const session = await A2.call<{ id: string } | null>("auth:session");
  check(!!session, "sessão lembrada ao reabrir");
  await A2.backend.sync();
  await tick(A2);
  check(A2.shown.length === 0 && A2.system.length === 0, "reabrir o app não repete avisos");
  check(view(await list(A2)) === view(afterEdit), "reabrir o app mantém lidas e apagadas");

  // 4) Segundo aparelho: recebe a lista igual, sem avisar de novo.
  const B = device("Celular");
  await B.call("auth:login", { username: "ana", password: "segredo1", remember: true });
  await tick(B);
  check(B.shown.length === 0 && B.system.length === 0, "celular novo não repete avisos antigos");
  check(view(await list(B)) === view(afterEdit), "celular mostra as mesmas notificações, com as mesmas lidas");
  check(!keysOf(await list(B)).includes("alerta-p1@0"), "apagada no PC não aparece no celular");

  // 5) Aviso novo no celular: aparece uma vez, e o PC recebe só na lista.
  const bills = (await B.call<{ bills: Bill[] }>("data:getAll")).bills;
  await set(B, "bills", [...bills, bill("b2", "Aluguel")]);
  await tick(B);
  check(B.shown.length === 1 && B.shown[0].key === `conta-b2-${ym}-hoje`, "aviso novo aparece uma vez no celular");
  await flush(B);
  await A2.backend.sync();
  await tick(A2);
  const onPc = await list(A2);
  check(onPc.some((x) => x.key === `conta-b2-${ym}-hoje` && !x.read), "PC recebe o aviso novo como não lido");
  check(A2.shown.length === 0 && A2.system.length === 0, "PC não dispara de novo o aviso dado no celular");

  // 6) Lida no celular fica lida no PC; apagada no PC some do celular.
  await B.call("notifications:markRead", {});
  await flush(B);
  await A2.backend.sync();
  check((await list(A2)).every((x) => x.read), "\"marcar todas como lidas\" no celular vale no PC");
  const b2 = (await list(A2)).find((x) => x.key === `conta-b2-${ym}-hoje`)!;
  await A2.call("notifications:remove", { id: b2.id });
  await flush(A2);
  await B.backend.sync();
  check(!keysOf(await list(B)).includes(`conta-b2-${ym}-hoje`), "apagada no PC some do celular");

  // 7) Um aparelho com versão antiga regrava a nuvem com uma cópia velha dos avisos.
  const row = rows.get(A2.backend.userId!)!;
  const stale = { ...(row.data[INBOX_KEY] as Inbox), items: first, removed: {} };
  row.data = { ...row.data, [INBOX_KEY]: stale };
  row.data_updated_at = stamp();
  await A2.backend.sync();
  await B.backend.sync();
  for (const d of [A2, B]) {
    const l = await list(d);
    check(l.every((x) => x.read) && !keysOf(l).includes("alerta-p1@0") && !keysOf(l).includes(`conta-b2-${ym}-hoje`), `${d.name}: cópia velha não traz de volta lidas nem apagadas`);
  }

  // 8) Conta antiga, sem registro de avisos na nuvem, num aparelho novo: nada antigo aparece.
  const defaults = defaultUserData();
  seedAccount(
    "bruno",
    "segredo2",
    {
      profile: { ...defaults.profile, onboarded: true, salary: 1000 },
      settings: { ...defaults.settings, marketEvents: false },
      bills: [bill("c1", "Luz")],
      alerts: [reminder("r9", "Consulta", hourAgo)],
    },
    "2025-01-01T00:00:00.000Z"
  );
  const C = device("Notebook");
  await C.call("auth:login", { username: "bruno", password: "segredo2" });
  await tick(C);
  check(C.shown.length === 0 && C.system.length === 0, "conta antiga num aparelho novo não recebe avisos antigos");
  const alerts = (await C.call<{ alerts: PriceAlert[] }>("data:getAll")).alerts;
  const soon = new Date(Date.now() - 1000).toISOString();
  await set(C, "alerts", [...alerts, reminder("r10", "Ligar para o banco", soon)]);
  await tick(C);
  check(C.shown.length === 1 && C.shown[0].key === `rem-r10-${soon}`, "e recebe normalmente o que é novo");

  // 9) Lembrete muito atrasado não é avisado.
  const D = device("Tablet");
  await D.call("auth:register", { name: "Caio Lima", username: "caio", password: "segredo3" });
  await set(D, "settings", { ...defaults.settings, marketEvents: false, dailyTip: false });
  await set(D, "alerts", [reminder("r20", "Antigo", new Date(Date.now() - 30 * 86_400_000).toISOString())]);
  await tick(D);
  check(D.shown.every((x) => !x.key?.startsWith("rem-")), "lembrete com mais de 7 dias de atraso não aparece");

  for (const d of [A2, B, C, D]) d.backend.stop();
  console.log(`\n${failures ? `${failures} verificação(ões) falharam.` : "Todas as verificações passaram."}`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
