// No celular não existe processo principal: o motor do app (core/) roda aqui
// mesmo, dentro do WebView, e responde pelo mesmo window.investa que o
// Electron expõe no desktop. As requisições às fontes de dados passam pela
// rede nativa (CapacitorHttp), sem bloqueio de CORS.
import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";

/** Plugin nativo do app (android/…/VoiceInputPlugin.java): ditado pelo reconhecimento de voz do Android. */
/** Plugin nativo (android/…/AppIconPlugin.java): troca o ícone da tela inicial. */
const AppIcon = registerPlugin<{ set(o: { variant: "dark" | "light" }): Promise<void> }>("AppIcon");
/** Plugin nativo (android/…/BackgroundPlugin.java): análise diária da IA feita pelo Android, com o app fechado. */
const Background = registerPlugin<{
  configure(o: BackgroundConfig): Promise<void>;
  /** Última análise e último erro do trabalho em segundo plano (JSON), se houver. */
  take(): Promise<{ insight?: string; error?: string }>;
}>("InvestaBackground");
const VoiceInput = registerPlugin<{ listen(o: { language?: string; prompt?: string }): Promise<{ text: string }> }>("VoiceInput");
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Share } from "@capacitor/share";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { scrypt } from "@noble/hashes/scrypt.js";
import { Backend } from "../../core/backend";
import { setStreamFetch } from "../../core/http";
import { randomHexWeb, toHex, type BackgroundConfig, type FileStore, type Platform } from "../../core/platform";
import { closeTopOverlay } from "../lib/overlays";
import { createStreamFetch } from "./streamFetch";

const CHANNEL = "investa";
const SCHEDULED_IDS = "investa-agendados";

const FILES = ["investa-data.json", "investa-data.bak.json", "cache-tesouro.json", "cache-credito.json"];

async function loadFiles(): Promise<FileStore> {
  const cache = new Map<string, string>();
  await Promise.all(
    FILES.map(async (name) => {
      try {
        const r = await Filesystem.readFile({ path: name, directory: Directory.Data, encoding: Encoding.UTF8 });
        cache.set(name, typeof r.data === "string" ? r.data : await (r.data as Blob).text());
      } catch {
        // arquivo ainda não existe
      }
    })
  );
  // As gravações são em fila para nunca sobrescrever uma mais nova com uma antiga.
  let queue: Promise<unknown> = Promise.resolve();
  return {
    read: (name) => cache.get(name) ?? null,
    write(name, data) {
      cache.set(name, data);
      queue = queue
        .then(() => Filesystem.writeFile({ path: name, data, directory: Directory.Data, encoding: Encoding.UTF8, recursive: true }))
        .catch(() => undefined);
    },
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

type Listener = (payload: unknown) => void;

export async function installMobileBridge(): Promise<void> {
  const listeners = new Map<string, Set<Listener>>();
  const emit = (channel: string, payload: unknown) => listeners.get(channel)?.forEach((cb) => cb(payload));
  let active = true;
  let backendRef: Backend | null = null;
  App.addListener("appStateChange", (s) => {
    active = s.isActive;
    // Voltou para o app: busca o que mudou no PC antes de qualquer edição.
    if (s.isActive) void backendRef?.sync();
  });

  const webFetch = (window as unknown as { CapacitorWebFetch?: typeof fetch }).CapacitorWebFetch;
  const stream = createStreamFetch(webFetch, (req) =>
    CapacitorHttp.request({ ...req, responseType: "text", connectTimeout: 15_000, readTimeout: 240_000 })
  );
  setStreamFetch(stream.fetch, stream.buffered);

  const info = await App.getInfo().catch(() => ({ version: "1.0.0" }));
  const files = await loadFiles();
  // Id fixo por aviso: se o mesmo aviso chegar de novo, substitui o que está na barra em vez de repetir.
  const notificationId = (key: string) => {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
    return (h & 0x7fffffff) || 1;
  };

  // Os avisos agendados ficam no sistema e chegam mesmo com o app fechado.
  // A cada mudança, os antigos saem e entra a lista nova (mesmo id = mesma chave do aviso).
  let scheduling: Promise<unknown> = Promise.resolve();
  const scheduleNotices: NonNullable<Platform["scheduleNotices"]> = (items) => {
    scheduling = scheduling
      .then(async () => {
        const pending = await LocalNotifications.getPending();
        let known: number[] = [];
        try {
          known = JSON.parse(localStorage.getItem(SCHEDULED_IDS) ?? "[]");
        } catch {
          // sem lista guardada
        }
        const old = new Set([...known, ...pending.notifications.filter((n) => (n.extra as { scheduled?: boolean } | undefined)?.scheduled).map((n) => n.id)]);
        if (old.size) await LocalNotifications.cancel({ notifications: [...old].map((id) => ({ id })) });
        const ids = items.map((n) => notificationId(n.key));
        try {
          localStorage.setItem(SCHEDULED_IDS, JSON.stringify(ids));
        } catch {
          // segue sem guardar
        }
        if (!items.length) return;
        await LocalNotifications.schedule({
          notifications: items.map((n) => ({
            id: notificationId(n.key),
            title: n.title,
            body: n.message,
            channelId: CHANNEL,
            smallIcon: "ic_stat_investa",
            schedule: { at: n.at, allowWhileIdle: true },
            extra: { link: n.link ?? "/alertas", scheduled: true },
          })),
        });
      })
      .catch(() => undefined);
  };

  const platform: Platform = {
    kind: "mobile",
    os: Capacitor.getPlatform(),
    version: info.version,
    dataDir: "Armazenamento interno do app",
    files,
    secrets: {
      // O armazenamento do app no Android já é privado; a chave fica em base64.
      encrypt: (plain) => ({ data: btoa(unescape(encodeURIComponent(plain))), mode: "plain" }),
      decrypt: (data) => decodeURIComponent(escape(atob(data))),
    },
    hashPassword: (password, salt) => toHex(scrypt(new TextEncoder().encode(password), new TextEncoder().encode(salt), { N: 16384, r: 8, p: 1, dkLen: 64 })),
    randomHex: randomHexWeb,
    emit,
    notify(n, settings) {
      if (active || !settings.desktopNotifications) return;
      void LocalNotifications.schedule({
        notifications: [{ id: notificationId(n.key ?? n.id), title: n.title, body: n.message, channelId: CHANNEL, smallIcon: "ic_stat_investa", extra: { link: n.link ?? "/alertas" } }],
      }).catch(() => undefined);
    },
    scheduleNotices,
    configureBackground(cfg) {
      void Background.configure(cfg).catch(() => undefined);
    },
    async saveReport(report) {
      const written =
        report.format === "json"
          ? await Filesystem.writeFile({ path: report.fileName, data: report.json?.() ?? "{}", directory: Directory.Cache, encoding: Encoding.UTF8 })
          : await Filesystem.writeFile({ path: report.fileName, data: bytesToBase64(report.format === "xlsx" ? await report.xlsx() : await report.pdf()), directory: Directory.Cache });
      await Share.share({ title: report.fileName, files: [written.uri], dialogTitle: "Salvar ou enviar relatório" }).catch(() => undefined);
      return { path: report.fileName };
    },
    openExternal: (url) => void Browser.open({ url }),
    async voiceInput() {
      const r = await VoiceInput.listen({ language: "pt-BR", prompt: "Fale com o Assistente" });
      return { mode: "text" as const, text: r.text };
    },
    async setAppIcon(variant) {
      await AppIcon.set({ variant });
    },
    setTheme(theme) {
      void StatusBar.setStyle({ style: theme === "light" ? Style.Light : Style.Dark }).catch(() => undefined);
      void StatusBar.setBackgroundColor({ color: theme === "light" ? "#F2F4F8" : "#0B0F1A" }).catch(() => undefined);
    },
  };

  const backend = new Backend(platform);
  backendRef = backend;
  window.investa = {
    platform: platform.os,
    invoke: (channel: string, args?: unknown) => backend.invoke(channel, args),
    on(event: string, cb: Listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
      return () => listeners.get(event)?.delete(cb);
    },
  };

  // O que o Android fez em segundo plano (análise diária, erro da IA) entra no app.
  const takeBackground = async () => {
    const r = await Background.take().catch(() => ({}) as { insight?: string; error?: string });
    const parse = (s?: string) => {
      try {
        return s ? JSON.parse(s) : null;
      } catch {
        return null;
      }
    };
    backend.importBackground({ insight: parse(r.insight), error: parse(r.error) });
  };
  App.addListener("appStateChange", (s) => {
    if (s.isActive) void takeBackground();
  });
  setTimeout(() => void takeBackground(), 6000);

  backend.start();
  // Android 13+: pede a permissão de notificação; o canal precisa existir para os avisos aparecerem com som.
  void LocalNotifications.requestPermissions().catch(() => undefined);
  void LocalNotifications.createChannel({ id: CHANNEL, name: "Avisos do Investa", description: "Contas, faturas, lembretes, alertas e dicas", importance: 4, visibility: 1 }).catch(() => undefined);
  LocalNotifications.addListener("localNotificationActionPerformed", (a) => {
    const link = (a.notification.extra as { link?: string } | undefined)?.link;
    if (link) emit("navigate", link);
  });
  // Botão voltar do Android: fecha a janela aberta; senão volta uma tela; na Início, minimiza.
  App.addListener("backButton", ({ canGoBack }) => {
    if (closeTopOverlay()) return;
    if (canGoBack && location.hash && location.hash !== "#/") history.back();
    else void App.minimizeApp();
  });
  App.addListener("pause", () => backend.store.flush());
  void StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);
  platform.setTheme?.(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  setTimeout(() => void SplashScreen.hide().catch(() => undefined), 300);
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
