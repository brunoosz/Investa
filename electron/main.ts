import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, Notification, safeStorage, session, shell, Tray } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { INVOKE_CHANNELS } from "@shared/ipc";
import { Backend, safeExternalUrl } from "../core/backend";
import { fallbackFetch, setBrowserFetch, setStreamFetch } from "../core/http";
import type { AiFileConfig, FileStore, Platform } from "../core/platform";

const isDev = process.argv.includes("--dev");
const DEV_URL = "http://localhost:5173";
const APP_HTML = path.resolve(__dirname, "..", "dist", "index.html");

if (process.env.INVESTA_USER_DATA) app.setPath("userData", process.env.INVESTA_USER_DATA);
if (process.platform === "win32") {
  app.setAppUserModelId("com.investa.app");
  // O Chromium às vezes acha que a janela está coberta por outra e para de
  // desenhar: a tela fica parada e os cliques parecem não funcionar.
  app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let backend: Backend;

const resourcesDir = app.isPackaged ? path.join(process.resourcesPath, "resources") : path.join(__dirname, "..", "resources");
const defaultIcon = path.join(resourcesDir, "icon.png");

/** Ícone escolhido em Configurações → Trocar ícone (escuro ou claro). */
function iconFile(variant?: "dark" | "light"): string | undefined {
  const file = path.join(resourcesDir, `icon-${variant ?? backend?.store.app.appIcon ?? "dark"}.png`);
  if (fs.existsSync(file)) return file;
  return fs.existsSync(defaultIcon) ? defaultIcon : undefined;
}

function themeColors(theme: "dark" | "light") {
  return theme === "light" ? { bg: "#F2F4F8", symbol: "#334155" } : { bg: "#0B0F1A", symbol: "#CBD5E1" };
}

function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/** Arquivos na pasta de dados, com gravação atômica (grava num .tmp e renomeia). */
function diskFiles(dir: string): FileStore {
  fs.mkdirSync(dir, { recursive: true });
  return {
    read(name) {
      const file = path.join(dir, name);
      return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    },
    write(name, data) {
      const file = path.join(dir, name);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, data, "utf8");
      fs.renameSync(tmp, file);
    },
  };
}

/** config.json, investa.config.json ou .env com a chave da IA (ver README). */
function aiFileConfig(dirs: string[]): AiFileConfig | null {
  for (const dir of dirs) {
    for (const name of ["config.json", "investa.config.json"]) {
      const file = path.join(dir, name);
      try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as AiFileConfig;
      } catch {
        // arquivo inválido: ignora
      }
    }
    const env = path.join(dir, ".env");
    try {
      if (fs.existsSync(env)) {
        const text = fs.readFileSync(env, "utf8");
        const read = (name: string) => new RegExp(`^\\s*${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, "m").exec(text)?.[1].trim();
        const nvidiaApiKey = read("NVIDIA_API_KEY");
        const groqApiKey = read("GROQ_API_KEY");
        if (nvidiaApiKey || groqApiKey) return { nvidiaApiKey, groqApiKey };
      }
    } catch {
      // ignora
    }
  }
  return null;
}

function createPlatform(): Platform {
  const dataDir = app.getPath("userData");
  const configDirs = [dataDir, process.env.PORTABLE_EXECUTABLE_DIR, path.dirname(process.execPath), isDev ? process.cwd() : undefined].filter((d): d is string => !!d);
  return {
    kind: "desktop",
    os: process.platform,
    version: app.getVersion(),
    dataDir,
    files: diskFiles(dataDir),
    secrets: {
      encrypt(plain) {
        if (safeStorage.isEncryptionAvailable()) return { data: safeStorage.encryptString(plain).toString("base64"), mode: "safe" };
        return { data: Buffer.from(plain, "utf8").toString("base64"), mode: "plain" };
      },
      decrypt(data, mode) {
        const buf = Buffer.from(data, "base64");
        return mode === "safe" ? safeStorage.decryptString(buf) : buf.toString("utf8");
      },
    },
    hashPassword: (password, salt) => crypto.scryptSync(password, salt, 64).toString("hex"),
    randomHex: (bytes) => crypto.randomBytes(bytes).toString("hex"),
    emit: send,
    notify(n, settings) {
      const focused = win?.isFocused() && win.isVisible();
      if (settings.desktopNotifications && !focused && Notification.isSupported()) {
        const toast = new Notification({ title: n.title, body: n.message, icon: iconFile(), silent: false });
        toast.on("click", () => showWindow(n.link ?? "/alertas"));
        toast.show();
      }
    },
    aiFileConfig: () => aiFileConfig(configDirs),
    async saveReport(report) {
      const result = await dialog.showSaveDialog(win!, {
        title: report.format === "json" ? "Salvar backup" : "Salvar arquivo",
        defaultPath: path.join(app.getPath("documents"), report.fileName),
        filters:
          report.format === "pdf" ? [{ name: "PDF", extensions: ["pdf"] }] : report.format === "json" ? [{ name: "Backup do Investa", extensions: ["json"] }] : [{ name: "Excel", extensions: ["xlsx"] }],
      });
      if (result.canceled || !result.filePath) return null;
      if (report.format === "json") {
        fs.writeFileSync(result.filePath, report.json?.() ?? "{}", "utf8");
      } else if (report.format === "xlsx") {
        fs.writeFileSync(result.filePath, await report.xlsx());
      } else {
        const tmp = path.join(os.tmpdir(), `investa-relatorio-${Date.now()}.html`);
        fs.writeFileSync(tmp, report.html(), "utf8");
        const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
        try {
          await pdfWin.loadFile(tmp);
          const pdf = await pdfWin.webContents.printToPDF({ printBackground: true, pageSize: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 } });
          fs.writeFileSync(result.filePath, pdf);
        } finally {
          pdfWin.destroy();
          fs.rmSync(tmp, { force: true });
        }
      }
      shell.showItemInFolder(result.filePath);
      return { path: result.filePath };
    },
    openExternal: (url) => openOutside(url),
    // Abre a digitação por voz do Windows (Win+H), que escreve no campo focado em português.
    async voiceInput() {
      if (process.platform !== "win32") throw new Error("A digitação por voz está disponível no Windows e no celular.");
      const script =
        "Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class K{[DllImport(\"user32.dll\")]public static extern void keybd_event(byte b,byte s,uint f,UIntPtr e);}';" +
        "[K]::keybd_event(0x5B,0,0,[UIntPtr]::Zero);[K]::keybd_event(0x48,0,0,[UIntPtr]::Zero);[K]::keybd_event(0x48,0,2,[UIntPtr]::Zero);[K]::keybd_event(0x5B,0,2,[UIntPtr]::Zero)";
      spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script], { windowsHide: true, stdio: "ignore" }).on("error", () => undefined);
      return { mode: "system" as const };
    },
    setAppIcon(variant) {
      const file = iconFile(variant);
      if (file) win?.setIcon(nativeImage.createFromPath(file));
      tray?.setImage(trayImage(variant));
    },
    setTheme(theme) {
      const c = themeColors(theme);
      if (win && process.platform !== "darwin") {
        try {
          win.setTitleBarOverlay({ color: c.bg, symbolColor: c.symbol, height: 44 });
        } catch {
          // plataforma sem overlay
        }
      }
      win?.setBackgroundColor(c.bg);
    },
  };
}

function createWindow(): void {
  const theme = backend.store.app.lastTheme ?? "dark";
  const colors = themeColors(theme);
  win = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 380,
    minHeight: 620,
    show: false,
    title: "Investa",
    backgroundColor: colors.bg,
    icon: iconFile(),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    trafficLightPosition: { x: 18, y: 16 },
    titleBarOverlay: process.platform === "darwin" ? undefined : { color: colors.bg, symbolColor: colors.symbol, height: 44 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: !app.isPackaged,
      spellcheck: false,
    },
  });

  win.once("ready-to-show", () => win?.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!isTrustedUrl(url)) {
      e.preventDefault();
      openOutside(url);
    }
  });
  win.webContents.on("will-redirect", (e, url) => {
    if (!isTrustedUrl(url)) e.preventDefault();
  });
  win.on("close", (e) => {
    if (quitting) return;
    if (backend.settingsOfCurrentUser()?.runInBackground) {
      e.preventDefault();
      win?.hide();
      ensureTray();
    }
  });

  if (isDev) void win.loadURL(DEV_URL);
  else void win.loadFile(APP_HTML);
}

function trayImage(variant?: "dark" | "light") {
  const file = iconFile(variant);
  return file ? nativeImage.createFromPath(file).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
}

function ensureTray(): void {
  if (tray) return;
  tray = new Tray(trayImage());
  tray.setToolTip("Investa — alertas ativos");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Abrir Investa", click: () => showWindow() },
      { type: "separator" },
      {
        label: "Sair",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on("click", () => showWindow());
}

function showWindow(route?: string): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (route) send("navigate", route);
}

/** Só a tela do próprio app (dist/index.html) fala com o motor; outro arquivo local, não. */
function isTrustedUrl(url: string): boolean {
  if (isDev) return url === DEV_URL || url.startsWith(`${DEV_URL}/`);
  if (!url.startsWith("file:")) return false;
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    const file = path.resolve(fileURLToPath(u));
    return process.platform === "win32" ? file.toLowerCase() === APP_HTML.toLowerCase() : file === APP_HTML;
  } catch {
    return false;
  }
}

/** Links externos abrem no navegador, e só se forem https. */
function openOutside(url: string): void {
  const safe = safeExternalUrl(url);
  if (safe) void shell.openExternal(safe);
}

function hardenSession(): void {
  // O app não usa câmera, microfone nem localização; só copia texto.
  const allowed = new Set(["clipboard-sanitized-write"]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
}

app.on("web-contents-created", (_e, contents) => {
  contents.on("will-attach-webview", (e) => e.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
});

app.on("second-instance", () => showWindow());

app.whenReady().then(() => {
  setBrowserFetch((url, init) => net.fetch(url, init));
  setStreamFetch(fallbackFetch((url, init) => fetch(url, init), (url, init) => net.fetch(url, init)));
  hardenSession();
  backend = new Backend(createPlatform());
  for (const channel of INVOKE_CHANNELS) {
    ipcMain.handle(channel, (event, args) => {
      if (!isTrustedUrl(event.senderFrame?.url ?? "")) return { ok: false, error: { code: "FORBIDDEN", message: "Origem não permitida." } };
      return backend.invoke(channel, args);
    });
  }
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: "appMenu" },
        { role: "editMenu" },
        { label: "Visualizar", submenu: [{ role: "reload" }, { role: "togglefullscreen" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }] },
      ])
    );
  } else {
    Menu.setApplicationMenu(null);
  }
  createWindow();
  backend.start();
  if (isDev)
    win?.webContents.on("before-input-event", (_e, input) => {
      if (input.key === "F12") win?.webContents.toggleDevTools();
    });
});

app.on("before-quit", () => {
  quitting = true;
  backend?.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else showWindow();
});
