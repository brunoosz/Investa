import { create } from "zustand";
import { api } from "@/lib/api";

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: string;
  title: string;
  message?: string;
  tone: ToastTone;
  action?: { label: string; to?: string; onClick?: () => void };
}

interface UiState {
  toasts: Toast[];
  resolvedTheme: "dark" | "light";
  toast: (t: Omit<Toast, "id" | "tone"> & { tone?: ToastTone }) => void;
  dismiss: (id: string) => void;
  applyTheme: (theme: "dark" | "light" | "system") => void;
}

const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function resolve(theme: "dark" | "light" | "system"): "dark" | "light" {
  if (theme === "system") return media?.matches === false ? "light" : "dark";
  return theme;
}

let currentPref: "dark" | "light" | "system" = "dark";

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  resolvedTheme: (document.documentElement.dataset.theme as "dark" | "light") ?? "dark",
  toast: (t) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, tone: "info", ...t }] }));
    setTimeout(() => get().dismiss(id), t.tone === "error" || t.action?.onClick ? 6500 : 4200);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  applyTheme: (theme) => {
    currentPref = theme;
    const resolved = resolve(theme);
    document.documentElement.dataset.theme = resolved;
    try {
      localStorage.setItem("investa-theme", resolved);
    } catch {
      // armazenamento indisponível
    }
    set({ resolvedTheme: resolved });
    void api.setTheme(resolved).catch(() => undefined);
  },
}));

media?.addEventListener("change", () => {
  if (currentPref === "system") useUi.getState().applyTheme("system");
});

export function initialTheme(): void {
  try {
    const saved = localStorage.getItem("investa-theme");
    if (saved === "light" || saved === "dark") document.documentElement.dataset.theme = saved;
  } catch {
    // armazenamento indisponível
  }
}

export function toastError(err: unknown, title = "Algo deu errado"): void {
  useUi.getState().toast({ title, message: err instanceof Error ? err.message : String(err), tone: "error" });
}
