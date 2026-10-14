import { useSyncExternalStore } from "react";
import type { IconVariant } from "@shared/brand";
import { api } from "@/lib/api";

const KEY = "investa.appIcon";
let current: IconVariant = read();
let supported = true;
const listeners = new Set<() => void>();

function read(): IconVariant {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function set(v: IconVariant): void {
  current = v;
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // sem armazenamento: vale só nesta sessão
  }
  listeners.forEach((l) => l());
}

/** Lê o ícone salvo no aparelho (o motor é a fonte de verdade; o localStorage só evita piscar). */
export function loadIconVariant(): void {
  void api
    .appIcon()
    .then((r) => {
      supported = r.supported;
      set(r.variant);
    })
    .catch(() => undefined);
}

export async function changeIconVariant(v: IconVariant): Promise<void> {
  const r = await api.appIcon(v);
  supported = r.supported;
  set(r.variant);
}

export const iconChangeSupported = () => supported;

export function useIconVariant(): IconVariant {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current
  );
}
