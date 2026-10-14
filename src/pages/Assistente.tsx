import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Brain,
  ChartLine,
  Check,
  CircleHelp,
  Copy,
  Globe,
  GraduationCap,
  History,
  KeyRound,
  MessageCircle,
  Mic,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  Square,
  SquarePen,
  Trash2,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import type { AiEvent, AiMode, ChatMessage } from "@shared/types";
import { AI_MODES, ASSISTANT_NAME, modeInfo, splitMemory } from "@shared/ai";
import { api, uid } from "@/lib/api";
import { relativeTime, timeBR } from "@/lib/format";
import { isOwner, useSession, useUserData } from "@/store/session";
import { useAssistant } from "@/store/assistant";
import { useUi } from "@/store/ui";
import { useAsync } from "@/hooks/useAsync";
import { Avatar, Badge, Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Sheet } from "@/components/ui/Sheet";
import { LogoMark } from "@/components/Logo";

const MODE_ICONS: Record<string, LucideIcon> = {
  message: MessageCircle,
  graduation: GraduationCap,
  wallet: Wallet,
  chart: ChartLine,
  cart: ShoppingCart,
  help: CircleHelp,
};

const MODE_KEY = "investa-assistente-modo";
const CONV_KEY = "investa-assistente-conversa";
/** Limite do histórico (todas as conversas): ele vai junto na sincronização com a nuvem. */
const MAX_MESSAGES = 200;
const MAX_CHARS = 400_000;

/** Corta as mensagens mais antigas quando o histórico passa do limite. */
function trimChat(list: ChatMessage[]): ChatMessage[] {
  let out = list.slice(-MAX_MESSAGES);
  let size = out.reduce((sum, m) => sum + m.content.length, 0);
  let start = 0;
  while (size > MAX_CHARS && out.length - start > 2) size -= out[start++].content.length;
  if (start) out = out.slice(start);
  return out;
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // armazenamento indisponível
  }
}

function savedMode(userId: string): AiMode {
  try {
    const raw = localStorage.getItem(`${MODE_KEY}-${userId}`) ?? localStorage.getItem(MODE_KEY);
    // Versões antigas gravavam o modo sem JSON.
    const m = (raw?.startsWith('"') ? JSON.parse(raw) : raw) as AiMode | null;
    if (m && AI_MODES.some((x) => x.id === m)) return m;
  } catch {
    // armazenamento indisponível
  }
  return "mercado";
}

function modeParam(params: URLSearchParams): AiMode | undefined {
  const m = params.get("modo") as AiMode | null;
  return m && AI_MODES.some((x) => x.id === m) ? m : undefined;
}

/** Mensagens antigas, sem modo, eram do analista de mercado. */
const modeOf = (m: ChatMessage): AiMode => m.mode ?? "mercado";
/** Mensagens de antes do histórico de conversas formam uma conversa por modo. */
const convOf = (m: ChatMessage): string => m.conversationId ?? `antiga-${modeOf(m)}`;

function latestConversation(all: ChatMessage[], mode: AiMode): string | undefined {
  for (let i = all.length - 1; i >= 0; i--) if (modeOf(all[i]) === mode) return convOf(all[i]);
  return undefined;
}

interface Conversation {
  id: string;
  mode: AiMode;
  title: string;
  updatedAt: string;
  count: number;
}

function listConversations(all: ChatMessage[]): Conversation[] {
  const map = new Map<string, Conversation>();
  for (const m of all) {
    const id = convOf(m);
    const c = map.get(id) ?? { id, mode: modeOf(m), title: "", updatedAt: m.createdAt, count: 0 };
    if (!c.title && m.role === "user") c.title = m.content.replace(/\s+/g, " ").trim().slice(0, 90);
    c.updatedAt = m.createdAt > c.updatedAt ? m.createdAt : c.updatedAt;
    c.count++;
    map.set(id, c);
  }
  return [...map.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Resposta em andamento: o texto fica aqui (e não nos dados salvos) até terminar. */
interface Live {
  requestId: string;
  message: ChatMessage;
  text: string;
  status?: string;
  model?: string;
}

const PRESS = "pressable transition-[transform,color,background-color,border-color,box-shadow,opacity] duration-150 ease-out-strong";
const ACTION = `${PRESS} h-7 px-2 rounded-chip text-footnote text-muted hover:text-fg hover:bg-line/10 inline-flex items-center gap-1`;
const SHOW_ON_HOVER = "opacity-0 group-hover:opacity-100 focus-within:opacity-100 max-sm:opacity-60 [@media(hover:none)]:opacity-70 transition-opacity duration-150 ease-out-strong";

const MARKDOWN: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href) void api.openExternal(href);
      }}
    >
      {children}
    </a>
  ),
  // Tabelas e código largos rolam de lado dentro da bolha, sem cortar nada.
  table: ({ children }) => (
    <div className="overflow-x-auto max-w-full">
      <table>{children}</table>
    </div>
  ),
  pre: ({ children }) => <pre className="overflow-x-auto max-w-full rounded-chip bg-elevated p-3 text-footnote my-2">{children}</pre>,
};

interface MessageProps {
  m: ChatMessage;
  live?: Live;
  owner: boolean;
  onRetry?: () => void;
  onDelete?: (id: string) => void;
}

const Message = memo(function Message({ m, live, owner, onRetry, onDelete }: MessageProps) {
  const user = useSession((s) => s.user)!;
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  if (m.role === "user") {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end gap-3 group">
        <div className="flex flex-col items-end min-w-0 max-w-[88%] sm:max-w-[78%]">
          <div className="rounded-card rounded-br-md bg-brand text-white px-4 py-2.5 text-body whitespace-pre-wrap break-words shadow-glow">{m.content}</div>
          {onDelete && (
            <button className={clsx(ACTION, "mt-1", SHOW_ON_HOVER)} onClick={() => onDelete(m.id)} aria-label="Apagar pergunta e resposta" title="Apaga esta pergunta e a resposta dela">
              <Trash2 size={13} /> Apagar
            </button>
          )}
        </div>
        <Avatar name={user.name} hue={user.avatarHue} size={32} className="mt-0.5 shrink-0" />
      </motion.div>
    );
  }
  const streaming = !!live;
  const content = live ? live.text : m.content;
  // Resposta que ficou vazia (app fechado no meio): não fica "Pensando…" para sempre.
  const interrupted = !streaming && !m.content.trim() && !m.error;
  const { text, items } = splitMemory(content);
  const saveMemory = () => {
    const now = new Date().toISOString();
    update("memory", (list) => [...list, ...items.filter((t) => !list.some((x) => x.text.toLowerCase() === t.toLowerCase())).map((t) => ({ id: uid(), text: t, createdAt: now }))]);
    update("chat", (list) => list.map((x) => (x.id === m.id ? { ...x, memoryHandled: true } : x)));
    toast({ title: "Guardado na memória", message: "Dá para ver, editar ou apagar em Configurações.", tone: "success" });
  };
  const dismissMemory = () => update("chat", (list) => list.map((x) => (x.id === m.id ? { ...x, memoryHandled: true } : x)));
  const model = live?.model ?? m.model;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 group">
      <div className="h-8 w-8 rounded-full bg-surface border border-separator/15 flex items-center justify-center shrink-0 mt-0.5">
        <LogoMark size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className={clsx("rounded-card rounded-tl-md px-4 py-3 min-w-0", m.error ? "bg-danger/10 border border-danger/25 text-danger" : "surface")}>
          {text ? (
            <div className={clsx("prose-investa break-words", streaming && "caret")}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>
                {text}
              </ReactMarkdown>
            </div>
          ) : interrupted ? (
            <div className="text-callout text-muted">Resposta interrompida.{onRetry ? " Toque em “Tentar de novo”." : ""}</div>
          ) : (
            <div className="flex items-center gap-1.5 py-1.5">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="h-2 w-2 rounded-full bg-primary" animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
              ))}
              <span className="text-footnote text-muted ml-2">{live?.status ?? "Pensando…"}</span>
            </div>
          )}
        </div>
        {!streaming && items.length > 0 && !m.memoryHandled && (
          <div className="mt-2 rounded-card border border-secondary/25 bg-secondary/[0.07] px-3.5 py-2.5 text-footnote">
            <div className="flex items-center gap-1.5 font-medium">
              <Brain size={15} className="text-secondary" /> Guardar na memória?
            </div>
            <ul className="mt-1 text-muted list-disc pl-5">
              {items.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <div className="flex gap-2 mt-2">
              <Button size="sm" icon={Check} onClick={saveMemory}>
                Guardar
              </Button>
              <Button size="sm" variant="ghost" icon={X} onClick={dismissMemory}>
                Agora não
              </Button>
            </div>
          </div>
        )}
        {!streaming && (
          <div className={clsx("flex flex-wrap items-center gap-1 mt-1", SHOW_ON_HOVER)}>
            <span className="text-caption font-normal tracking-normal text-muted tabular mr-1">
              {timeBR(m.createdAt)}
              {owner && model ? ` · ${model}` : ""}
            </span>
            {text && (
              <button
                className={ACTION}
                onClick={() => {
                  void navigator.clipboard.writeText(text);
                  toast({ title: "Resposta copiada", tone: "success" });
                }}
              >
                <Copy size={13} /> Copiar
              </button>
            )}
            {onRetry && (
              <button className={ACTION} onClick={onRetry}>
                <RotateCcw size={13} /> Tentar de novo
              </button>
            )}
            {onDelete && (
              <button className={ACTION} onClick={() => onDelete(m.id)} aria-label="Apagar resposta e pergunta" title="Apaga esta resposta e a pergunta dela">
                <Trash2 size={13} /> Apagar
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
});

function HistorySheet({
  open,
  onClose,
  conversations,
  current,
  onOpen,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  current: string;
  onOpen: (c: Conversation) => void;
  onDelete: (c: Conversation) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Conversas" subtitle="As conversas ficam salvas na sua conta. Toque em uma para continuar.">
      {conversations.length === 0 ? (
        <div className="text-center text-muted text-callout py-10">Nenhuma conversa ainda.</div>
      ) : (
        <div className="space-y-1.5">
          {conversations.map((c) => {
            const info = modeInfo(c.mode);
            const Icon = MODE_ICONS[info.icon] ?? MessageCircle;
            return (
              <div
                key={c.id}
                className={clsx(
                  "group flex items-center gap-3 rounded-card border px-3 py-2.5 transition-[color,background-color,border-color] duration-150 ease-out-strong",
                  c.id === current ? "border-primary/50 bg-primary/[0.07]" : "border-separator/10 hover:border-primary/30 hover:bg-line/[0.04]"
                )}
              >
                <button type="button" className="pressable flex-1 min-w-0 flex items-center gap-3 text-left" onClick={() => onOpen(c)}>
                  <span className="h-9 w-9 rounded-chip bg-line/[0.07] flex items-center justify-center shrink-0 text-primary">
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-callout truncate">{c.title || "Conversa sem título"}</span>
                    <span className="block text-footnote text-muted truncate">
                      {info.label} · {relativeTime(c.updatedAt)} · {c.count} {c.count === 1 ? "mensagem" : "mensagens"}
                    </span>
                  </span>
                </button>
                <Button size="icon-sm" variant="ghost" icon={Trash2} aria-label="Apagar conversa" title="Apagar conversa" onClick={() => onDelete(c)} />
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

type PendingConfirm = { kind: "clear" } | { kind: "conversation"; conversation: Conversation } | null;

export function Assistente() {
  const user = useSession((s) => s.user)!;
  const allChat = useUserData("chat");
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const info = useAsync("ai-info", () => api.ai.info(), { staleMs: 5_000 });
  const owner = isOwner(user);
  const convKey = `${CONV_KEY}-${user.id}`;
  const modeKey = `${MODE_KEY}-${user.id}`;

  const [mode, setModeState] = useState<AiMode>(() => modeParam(params) ?? savedMode(user.id));
  const [convId, setConvState] = useState<string>(() => {
    const m = modeParam(params) ?? savedMode(user.id);
    return readStorage<Partial<Record<AiMode, string>>>(convKey, {})[m] ?? latestConversation(useSession.getState().data.chat, m) ?? uid();
  });
  const [input, setInput] = useState("");
  const [live, setLiveState] = useState<Live | null>(null);
  const liveRef = useRef<Live | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [listening, setListening] = useState(false);
  const [web, setWebState] = useState(() => readStorage<number>("investa-assistente-web", 0) === 1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true);
  const frameRef = useRef(0);

  const current = modeInfo(mode);
  const chat = useMemo(() => allChat.filter((m) => convOf(m) === convId), [allChat, convId]);
  const conversations = useMemo(() => listConversations(allChat), [allChat]);
  const hasKey = info.data?.hasKey;

  const setWeb = (v: boolean) => {
    setWebState(v);
    writeStorage("investa-assistente-web", v ? 1 : 0);
  };

  // Ditado: no celular o Android devolve o texto; no Windows, a digitação por voz escreve direto na caixa.
  const dictate = async () => {
    inputRef.current?.focus();
    setListening(true);
    try {
      const r = await api.voice();
      if (r.mode === "text") {
        if (r.text) setInput((v) => (v ? `${v.trimEnd()} ${r.text}` : r.text!));
      } else {
        toast({ title: "Pode falar", message: "A digitação por voz do Windows vai escrever na caixa de mensagem. Clique de novo no microfone dela para parar.", tone: "info" });
      }
    } catch (err) {
      toast({ title: "Ditado por voz indisponível", message: (err as Error).message, tone: "error" });
    } finally {
      setListening(false);
      inputRef.current?.focus();
    }
  };

  const scrollDown = useCallback((smooth = true) => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    });
  }, []);

  /** Atualiza a tela no máximo uma vez por quadro enquanto a resposta chega. */
  const setLive = useCallback((next: Live | null) => {
    liveRef.current = next;
    if (!next) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      setLiveState(null);
      return;
    }
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      setLiveState(liveRef.current ? { ...liveRef.current } : null);
      const el = scrollRef.current;
      if (el && stickRef.current) el.scrollTop = el.scrollHeight;
    });
  }, []);

  /** Grava a resposta (completa, parcial ou com erro) nos dados da conversa. */
  const finish = useCallback(
    (how: { error?: string; interrupted?: boolean } = {}) => {
      const l = liveRef.current;
      if (!l) return;
      setLive(null);
      const text = l.text.trim() ? l.text : "";
      let content = text;
      let error = false;
      if (how.error) {
        if (text) content = `${text}\n\n_${how.error}_`;
        else [content, error] = [how.error, true];
      } else if (how.interrupted) {
        content = text ? `${text}\n\n_Resposta interrompida._` : "";
      } else if (!text) {
        [content, error] = ["Não recebi resposta. Tente novamente.", true];
      }
      const done: ChatMessage = { ...l.message, content, error: error || undefined, model: l.model };
      // A conversa pode ter sido trocada pela nuvem no meio da resposta: grava mesmo assim.
      useSession.getState().update("chat", (list) => trimChat(list.some((m) => m.id === done.id) ? list.map((m) => (m.id === done.id ? done : m)) : [...list, done]));
      // Os botões de copiar e tentar de novo aparecem embaixo da resposta: mantém tudo à vista.
      if (stickRef.current) scrollDown();
    },
    [setLive, scrollDown]
  );

  /** Para a resposta em andamento (troca de conversa, nova conversa, saída da tela). */
  const cancelLive = useCallback(() => {
    const l = liveRef.current;
    if (!l) return;
    void api.ai.cancel(l.requestId).catch(() => undefined);
    finish({ interrupted: true });
  }, [finish]);

  const openConversation = useCallback(
    (m: AiMode, id: string) => {
      cancelLive();
      setModeState(m);
      setConvState(id);
      writeStorage(modeKey, m);
      writeStorage(convKey, { ...readStorage<Partial<Record<AiMode, string>>>(convKey, {}), [m]: id });
      stickRef.current = true;
    },
    [cancelLive, convKey, modeKey]
  );

  const selectMode = (m: AiMode) => {
    if (m === mode) return;
    const stored = readStorage<Partial<Record<AiMode, string>>>(convKey, {})[m];
    openConversation(m, stored ?? latestConversation(useSession.getState().data.chat, m) ?? uid());
    inputRef.current?.focus();
  };

  const newConversation = () => {
    openConversation(mode, uid());
    inputRef.current?.focus();
  };

  useEffect(() => {
    stickRef.current = true;
    scrollDown(false);
  }, [scrollDown, convId]);

  useEffect(() => {
    return api.on<AiEvent>("ai:event", (ev) => {
      const l = liveRef.current;
      if (!l || ev.requestId !== l.requestId) return;
      if (ev.type === "context") {
        if (ev.data?.endsWith("…")) setLive({ ...l, status: ev.data });
      } else if (ev.type === "model") {
        setLive({ ...l, model: ev.data });
      } else if (ev.type === "replace" && ev.data) {
        setLive({ ...l, text: ev.data });
      } else if (ev.type === "chunk" && ev.data) {
        setLive({ ...l, text: l.text + ev.data });
      } else if (ev.type === "done") {
        finish();
      } else if (ev.type === "error") {
        finish({ error: ev.data ?? "O Assistente não respondeu. Tente de novo." });
      }
    });
  }, [finish, setLive]);

  // Saiu da tela no meio da resposta: cancela e guarda o que já chegou.
  useEffect(() => () => cancelLive(), [cancelLive]);

  const send = useCallback(
    async (text: string, opts: { mode?: AiMode; conv?: string; history?: ChatMessage[]; attachment?: string } = {}) => {
      const content = text.trim();
      if (!content || liveRef.current) return;
      const m = opts.mode ?? mode;
      const conv = opts.conv ?? convId;
      const all = useSession.getState().data.chat;
      const base = opts.history ?? all.filter((x) => convOf(x) === conv);
      const now = new Date().toISOString();
      const userMsg: ChatMessage = { id: uid(), role: "user", content, createdAt: now, mode: m, conversationId: conv };
      const aiMsg: ChatMessage = { id: uid(), role: "assistant", content: "", createdAt: now, mode: m, conversationId: conv };
      const keep = opts.history ? all.filter((x) => convOf(x) !== conv || opts.history!.includes(x)) : all;
      update("chat", trimChat([...keep, userMsg, aiMsg]));
      setInput("");
      const requestId = uid();
      const started: Live = { requestId, message: aiMsg, text: "" };
      liveRef.current = started;
      setLiveState(started);
      stickRef.current = true;
      scrollDown();
      const messages = [...base.filter((x) => !x.error && x.content.trim()), userMsg]
        .map((x) => ({ role: x.role, content: x.role === "assistant" ? splitMemory(x.content).text : x.content }))
        .slice(-10);
      try {
        await api.ai.chat(requestId, messages, m, opts.attachment, web && !!info.data?.hasSearch);
      } catch (err) {
        if (liveRef.current?.requestId === requestId) finish({ error: (err as Error).message });
        void info.reload();
      }
    },
    [update, scrollDown, setLive, finish, info, mode, convId, web]
  );

  // Pergunta vinda de outra tela (?q= ou rascunho com dados anexados): abre numa conversa nova.
  useEffect(() => {
    if (!info.data) return;
    const draft = useAssistant.getState().take();
    const q = params.get("q");
    const m = modeParam(params) ?? draft?.mode;
    if (params.has("q") || params.has("modo")) setParams({}, { replace: true });
    const question = draft?.question ?? q;
    const target = m ?? mode;
    if (!question) {
      if (m && m !== mode) selectMode(target);
      return;
    }
    const conv = uid();
    openConversation(target, conv);
    if (info.data.hasKey) void send(question, { mode: target, conv, attachment: draft?.attachment });
    else setInput(question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.data]);

  // Parar antes da resposta começar apaga a pergunta e a bolha "Pensando…" e devolve o texto para a caixa.
  const stop = () => {
    const l = liveRef.current;
    if (!l) return;
    void api.ai.cancel(l.requestId).catch(() => undefined);
    if (l.text.trim()) {
      finish();
      return;
    }
    setLive(null);
    const list = useSession.getState().data.chat;
    const idx = list.findIndex((m) => m.id === l.message.id);
    const question = idx > 0 && list[idx - 1].role === "user" ? list[idx - 1] : null;
    update("chat", (all) => all.filter((m) => m.id !== l.message.id && m.id !== question?.id));
    if (question) setInput(question.content);
    inputRef.current?.focus();
  };

  /** Apaga a pergunta junto com a resposta dela (ou a resposta junto com a pergunta). */
  const removePair = useCallback(
    (id: string) => {
      const list = useSession.getState().data.chat;
      const i = list.findIndex((m) => m.id === id);
      if (i < 0) return;
      const target = list[i];
      const sameConv = (m: ChatMessage) => convOf(m) === convOf(target);
      const ids = new Set([id]);
      if (target.role === "user") {
        const next = list.slice(i + 1).find(sameConv);
        if (next?.role === "assistant") ids.add(next.id);
      } else {
        const prev = list.slice(0, i).reverse().find(sameConv);
        if (prev?.role === "user") ids.add(prev.id);
      }
      const l = liveRef.current;
      if (l && ids.has(l.message.id)) {
        void api.ai.cancel(l.requestId).catch(() => undefined);
        setLive(null);
      }
      update("chat", (all) => all.filter((m) => !ids.has(m.id)));
    },
    [update, setLive]
  );

  const retryLast = useCallback(() => {
    const lastUserIndex = chat.map((m) => m.role).lastIndexOf("user");
    if (lastUserIndex < 0) return;
    void send(chat[lastUserIndex].content, { history: chat.slice(0, lastUserIndex) });
  }, [chat, send]);

  const runConfirm = () => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === "clear") {
      cancelLive();
      update("chat", (all) => all.filter((m) => convOf(m) !== convId));
      toast({ title: "Conversa limpa", tone: "success" });
    } else {
      if (c.conversation.id === convId) cancelLive();
      update("chat", (all) => all.filter((m) => convOf(m) !== c.conversation.id));
      if (c.conversation.id === convId) setConvState(uid());
    }
  };

  // A caixa de texto cresce com o conteúdo, até 40% da altura da tela.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.4))}px`;
  }, [input]);

  const autoLabel =
    info.data?.primary !== "nvidia" && info.data?.hasGroq ? (info.data.groqChoice === "auto" ? "Automático" : "Modelo escolhido") : info.data?.choice === "auto" ? "Automático" : "Modelo escolhido";
  const lastIndex = chat.length - 1;

  return (
    <div className="flex flex-col h-[calc(100dvh-52px)] max-sm:h-[calc(100dvh-140px)] -mb-16 -mt-1">
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 rounded-control bg-brand flex items-center justify-center shadow-glow shrink-0">
            <Sparkles size={22} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold tracking-[-0.02em] leading-tight">{ASSISTANT_NAME}</h1>
            <div className="text-footnote text-muted flex items-center gap-2 min-w-0">
              {owner && hasKey ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-success shrink-0" />
                  <span className="truncate">
                    {autoLabel} · {info.data?.modelLabel}
                  </span>
                </>
              ) : owner && !info.loading && !hasKey ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-warning" /> IA não configurada
                </>
              ) : (
                <span className="truncate">{current.description}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {conversations.length > 0 && (
            <Button variant="ghost" icon={History} onClick={() => setHistoryOpen(true)} className="max-lg:!px-0 max-lg:!w-10" aria-label="Conversas" title="Conversas anteriores">
              <span className="max-lg:hidden">Conversas</span>
            </Button>
          )}
          {chat.length > 0 && (
            <Button variant="ghost" icon={Trash2} onClick={() => setConfirm({ kind: "clear" })} className="max-lg:!px-0 max-lg:!w-10" aria-label="Limpar chat" title="Limpar chat">
              <span className="max-lg:hidden">Limpar chat</span>
            </Button>
          )}
          {chat.length > 0 && (
            <Button variant="secondary" icon={SquarePen} onClick={newConversation} className="max-sm:!px-0 max-sm:!w-10" aria-label="Nova conversa">
              <span className="max-sm:hidden">Nova conversa</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-3 -mx-1 px-1">
        {AI_MODES.map((m) => {
          const Icon = MODE_ICONS[m.icon] ?? MessageCircle;
          const active = m.id === mode;
          return (
            <button
              key={m.id}
              onClick={() => selectMode(m.id)}
              title={m.description}
              aria-pressed={active}
              className={clsx(
                `${PRESS} shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-footnote font-medium border`,
                active ? "bg-primary text-white border-transparent shadow-glow" : "border-separator/12 bg-surface/60 text-muted hover:text-fg hover:border-primary/30"
              )}
            >
              <Icon size={15} /> {m.label}
            </button>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden -mx-2 px-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {!hasKey && !info.loading && (
          <Card className="mb-4 border-warning/30">
            <div className="flex gap-4 items-start">
              <div className="h-11 w-11 rounded-control bg-warning/15 text-warning flex items-center justify-center shrink-0">
                <KeyRound size={22} />
              </div>
              <div className="flex-1">
                <div className="text-headline">{owner ? "Conecte a inteligência artificial" : "O Assistente ainda não foi ativado"}</div>
                <p className="text-callout text-muted mt-1">
                  {owner
                    ? "O Assistente usa a Groq (grátis e bem rápida) ou a NVIDIA. Cole uma chave nas configurações."
                    : "Peça ao Dono do aplicativo para ativar o Assistente."}
                </p>
                {owner && (
                  <Button className="mt-3" icon={KeyRound} onClick={() => navigate("/configuracoes?secao=ia")}>
                    Configurar agora
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

        {chat.length === 0 ? (
          <div className="flex flex-col items-center text-center pt-4 pb-10">
            <motion.div
              key={mode}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="h-20 w-20 rounded-sheet bg-surface border border-separator/15 flex items-center justify-center shadow-2xl"
            >
              <LogoMark size={44} animated />
            </motion.div>
            <h2 className="text-[24px] font-bold tracking-[-0.02em] mt-5">{current.label}</h2>
            <p className="text-muted mt-2 max-w-lg">{current.description}</p>
            <div className="grid sm:grid-cols-2 gap-2 mt-6 w-full max-w-2xl">
              {current.suggestions.map((s) => (
                <button
                  key={s}
                  disabled={!hasKey}
                  onClick={() => void send(s)}
                  className={`${PRESS} text-left rounded-card border border-separator/10 bg-surface/60 hover:bg-line/[0.06] hover:border-primary/30 px-4 py-3 text-callout font-medium disabled:opacity-50`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 pb-6 max-w-4xl mx-auto">
            {chat.map((m, i) => {
              const isLive = live?.message.id === m.id;
              return (
                <Message
                  key={m.id}
                  m={m}
                  live={isLive ? live! : undefined}
                  owner={owner}
                  onRetry={m.role === "assistant" && i === lastIndex && !live ? retryLast : undefined}
                  onDelete={isLive ? undefined : removePair}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-3 pb-5">
        <div className="max-w-4xl mx-auto">
          <div className="surface flex items-end gap-2 p-2 pl-4 focus-within:border-primary/40 focus-within:shadow-ring transition-[border-color,box-shadow] duration-150 ease-out-strong">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              disabled={!hasKey}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (!live) void send(input);
                }
              }}
              placeholder={hasKey ? `Mensagem para o ${ASSISTANT_NAME} (${current.short})` : "O Assistente ainda não foi ativado"}
              className="flex-1 min-w-0 resize-none bg-transparent outline-none text-body py-2 overflow-y-auto placeholder:text-muted/70"
            />
            {hasKey && (
              <button
                type="button"
                onClick={() => void dictate()}
                disabled={listening}
                title="Falar em vez de digitar"
                aria-label="Gravar voz"
                className={clsx(`${PRESS} h-10 w-10 rounded-control inline-flex items-center justify-center shrink-0`, listening ? "bg-danger/15 text-danger animate-pulse" : "text-muted hover:text-fg hover:bg-line/10")}
              >
                <Mic size={18} />
              </button>
            )}
            {info.data?.hasSearch && (
              <button
                type="button"
                onClick={() => setWeb(!web)}
                title={web ? "Pesquisa na internet ligada" : "Pesquisar na internet antes de responder"}
                aria-pressed={web}
                className={clsx(`${PRESS} h-10 px-2.5 rounded-control inline-flex items-center gap-1.5 text-footnote font-medium shrink-0`, web ? "bg-primary/15 text-primary" : "text-muted hover:text-fg hover:bg-line/10")}
              >
                <Globe size={17} />
                <span className="hidden sm:inline">Internet</span>
              </button>
            )}
            <AnimatePresence mode="wait" initial={false}>
              {live ? (
                <motion.div key="stop" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}>
                  <Button size="icon" variant="secondary" onClick={stop} aria-label="Parar resposta" title="Parar">
                    <Square size={14} fill="currentColor" />
                  </Button>
                </motion.div>
              ) : (
                <motion.div key="send" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}>
                  <Button size="icon" disabled={!input.trim() || !hasKey} onClick={() => void send(input)} aria-label="Enviar">
                    <ArrowUp size={18} strokeWidth={2.6} />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {mode !== "geral" && mode !== "app" && (
            <div className="text-caption font-normal tracking-normal text-muted text-center mt-2">
              <Badge className="mr-1">Educacional</Badge> As respostas usam dados reais do momento, mas não são recomendação individual. Confira antes de decidir.
            </div>
          )}
        </div>
      </div>

      <HistorySheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        conversations={conversations}
        current={convId}
        onOpen={(c) => {
          setHistoryOpen(false);
          openConversation(c.mode, c.id);
        }}
        onDelete={(c) => setConfirm({ kind: "conversation", conversation: c })}
      />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        title={confirm?.kind === "conversation" ? "Apagar esta conversa?" : "Limpar o chat?"}
        message={
          confirm?.kind === "conversation"
            ? `“${confirm.conversation.title || "Conversa sem título"}” e todas as mensagens dela serão apagadas.`
            : "Todas as mensagens desta conversa serão apagadas. As outras conversas continuam salvas."
        }
        confirmLabel={confirm?.kind === "conversation" ? "Apagar" : "Limpar"}
        danger
      />
    </div>
  );
}
