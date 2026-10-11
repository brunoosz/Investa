import { useSyncExternalStore } from "react";
import type { PublicUser } from "@shared/types";
import { isManager } from "@/store/session";
import { ALL_NAV, type NavItem } from "./nav";

// Abas da barra de baixo no celular. O último botão é sempre "Mais"; a escolha
// fica salva neste aparelho.
const KEY = "investa.abas";
export const TAB_SLOTS = 4;
export const DEFAULT_TABS = ["/", "/mercado", "/aulas", "/assistente"];

let current = read();
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (Array.isArray(saved) && saved.length && saved.every((s) => typeof s === "string")) return [...new Set(saved as string[])].slice(0, TAB_SLOTS);
  } catch {
    // valor salvo inválido ou armazenamento indisponível
  }
  return DEFAULT_TABS;
}

export function setTabs(list: string[]): void {
  current = list.length ? [...new Set(list)].slice(0, TAB_SLOTS) : DEFAULT_TABS;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // sem armazenamento: vale só nesta sessão
  }
  listeners.forEach((l) => l());
}

export function useTabs(): string[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current
  );
}

/** Telas que este usuário pode abrir (Usuários e Logs dependem do cargo). */
export function navFor(user: PublicUser | null): NavItem[] {
  return ALL_NAV.filter((i) => (!i.managerOnly || isManager(user)) && (!i.ownerOnly || user?.role === "dono"));
}

/** As abas escolhidas que o usuário pode ver, na ordem escolhida. */
export function tabItems(tabs: string[], user: PublicUser | null): NavItem[] {
  const allowed = navFor(user);
  const pick = (list: string[]) => list.map((to) => allowed.find((i) => i.to === to)).filter((i): i is NavItem => !!i);
  const chosen = pick(tabs);
  return chosen.length ? chosen : pick(DEFAULT_TABS);
}
