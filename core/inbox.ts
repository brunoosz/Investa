// Avisos de cada conta, iguais em todos os aparelhos: a lista de notificações,
// o registro do que já foi avisado (para nunca avisar de novo) e o estado dos
// alertas de preço. Duas cópias sempre se juntam do mesmo jeito: lida em um
// aparelho fica lida em todos, apagada some de todos e nada já avisado volta.
import type { AlertRuntimeState, AppNotification } from "@shared/types";

/** Onde a caixa de avisos vai dentro dos dados da conta na nuvem. */
export const INBOX_KEY = "_inbox";
export const KEEP_DAYS = 90;
const MAX_ITEMS = 200;
const DAY = 86_400_000;
/** Avisos que só aparecem uma vez na vida da conta. */
const PERMANENT = new Set(["welcome"]);

export interface Inbox {
  items: AppNotification[];
  /** Chave de cada aviso já dado → quando foi dado pela primeira vez. */
  seen: Record<string, string>;
  /** Notificação apagada (chave ou id) → quando. */
  removed: Record<string, number>;
  alertState: Record<string, AlertRuntimeState>;
  /** O registro desta conta já foi preenchido (não é a primeira vez do motor). */
  seeded?: boolean;
}

export function emptyInbox(): Inbox {
  return { items: [], seen: {}, removed: {}, alertState: {} };
}

/** A mesma ocorrência tem a mesma chave em qualquer aparelho; avisos antigos, sem chave, usam o id. */
export const identity = (n: AppNotification): string => n.key ?? n.id;

const time = (iso: string | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

const stateStamp = (s: AlertRuntimeState | undefined): string => s?.changedAt ?? s?.firedAt ?? "";

const isRemoved = (x: Pick<Inbox, "removed">, n: AppNotification): boolean => {
  const at = x.removed[identity(n)];
  return at !== undefined && at >= time(n.createdAt);
};

const newestFirst = (a: AppNotification, b: AppNotification): number => time(b.createdAt) - time(a.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function pruneInbox(x: Inbox, now = Date.now()): Inbox {
  const limit = now - KEEP_DAYS * DAY;
  const seen: Record<string, string> = {};
  for (const [k, t] of Object.entries(x.seen)) if (PERMANENT.has(k) || time(t) >= limit) seen[k] = t;
  const removed: Record<string, number> = {};
  for (const [k, t] of Object.entries(x.removed)) if (t >= limit) removed[k] = t;
  const items = x.items
    .filter((n) => time(n.createdAt) >= limit && !isRemoved(x, n))
    .sort(newestFirst)
    .slice(0, MAX_ITEMS);
  return { items, seen, removed, alertState: x.alertState, ...(x.seeded ? { seeded: true } : {}) };
}

/** Junta duas cópias. A ordem não importa: merge(a, b) e merge(b, a) dão o mesmo resultado. */
export function mergeInbox(a: Inbox, b: Inbox, now = Date.now()): Inbox {
  const pa = pruneInbox(a, now);
  const pb = pruneInbox(b, now);
  const seen = { ...pa.seen };
  for (const [k, t] of Object.entries(pb.seen)) if (!seen[k] || time(t) < time(seen[k])) seen[k] = t;
  const removed = { ...pa.removed };
  for (const [k, t] of Object.entries(pb.removed)) if (!(removed[k] >= t)) removed[k] = t;
  const alertState = { ...pa.alertState };
  for (const [k, s] of Object.entries(pb.alertState)) {
    const cur = alertState[k];
    const sa = stateStamp(cur);
    const sb = stateStamp(s);
    if (!cur || sb > sa || (sb === sa && s.fired && !cur.fired)) alertState[k] = s;
  }
  const byKey = new Map<string, AppNotification>();
  for (const n of [...pa.items, ...pb.items]) {
    const k = identity(n);
    const cur = byKey.get(k);
    if (!cur) {
      byKey.set(k, n);
      continue;
    }
    // Dois aparelhos deram o mesmo aviso: fica um só, e lido se foi lido em qualquer um.
    const keep = newestFirst(cur, n) > 0 ? cur : n;
    byKey.set(k, keep.read || !(cur.read || n.read) ? keep : { ...keep, read: true });
  }
  return pruneInbox({ items: [...byKey.values()], seen, removed, alertState, ...(pa.seeded || pb.seeded ? { seeded: true } : {}) }, now);
}

function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

export function sameInbox(a: Inbox, b: Inbox): boolean {
  return canon({ ...a, items: [...a.items].sort(newestFirst) }) === canon({ ...b, items: [...b.items].sort(newestFirst) });
}

/** Mesmas notificações, com o mesmo estado de leitura (o que a tela mostra). */
export function sameItems(a: AppNotification[], b: AppNotification[]): boolean {
  const view = (l: AppNotification[]) => canon([...l].sort(newestFirst).map((n) => [n.id, n.read]));
  return view(a) === view(b);
}

export function isEmptyInbox(x: Inbox): boolean {
  return !x.items.length && !Object.keys(x.seen).length && !Object.keys(x.removed).length && !Object.keys(x.alertState).length && !x.seeded;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Lê a cópia que veio da nuvem, descartando o que não tiver o formato certo. */
export function parseInbox(raw: unknown): Inbox | null {
  if (!isObj(raw)) return null;
  const x = emptyInbox();
  if (Array.isArray(raw.items)) {
    x.items = raw.items.filter(
      (n): n is AppNotification =>
        isObj(n) && typeof n.id === "string" && typeof n.title === "string" && typeof n.message === "string" && typeof n.createdAt === "string" && (n.key === undefined || typeof n.key === "string")
    ).map((n) => ({ ...n, read: n.read === true }));
  }
  if (isObj(raw.seen)) for (const [k, t] of Object.entries(raw.seen)) if (typeof t === "string") x.seen[k] = t;
  if (isObj(raw.removed)) for (const [k, t] of Object.entries(raw.removed)) if (typeof t === "number" && Number.isFinite(t)) x.removed[k] = t;
  if (isObj(raw.alertState)) for (const [k, s] of Object.entries(raw.alertState)) if (isObj(s) && typeof s.fired === "boolean") x.alertState[k] = s as unknown as AlertRuntimeState;
  if (raw.seeded === true) x.seeded = true;
  return x;
}

// ---- ações da pessoa ----

export function markRead(x: Inbox, id?: string): Inbox {
  if (!id) return { ...x, items: x.items.map((n) => (n.read ? n : { ...n, read: true })) };
  const target = x.items.find((n) => n.id === id);
  if (!target) return x;
  const k = identity(target);
  return { ...x, items: x.items.map((n) => (identity(n) === k && !n.read ? { ...n, read: true } : n)) };
}

const tombstone = (removed: Record<string, number>, n: AppNotification, now: number) => {
  const k = identity(n);
  removed[k] = Math.max(removed[k] ?? 0, now, time(n.createdAt));
};

export function removeItem(x: Inbox, id: string, now = Date.now()): Inbox {
  const target = x.items.find((n) => n.id === id);
  if (!target) return x;
  const removed = { ...x.removed };
  tombstone(removed, target, now);
  const k = identity(target);
  return { ...x, removed, items: x.items.filter((n) => identity(n) !== k) };
}

export function clearItems(x: Inbox, now = Date.now()): Inbox {
  const removed = { ...x.removed };
  for (const n of x.items) tombstone(removed, n, now);
  return { ...x, removed, items: [] };
}
