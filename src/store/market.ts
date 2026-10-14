import { useEffect, useMemo } from "react";
import { create } from "zustand";
import type { Quote } from "@shared/types";
import { api } from "@/lib/api";

interface MarketState {
  quotes: Record<string, Quote>;
  updatedAt: number | null;
  error: string | null;
  loading: boolean;
}

export const useMarket = create<MarketState>(() => ({ quotes: {}, updatedAt: null, error: null, loading: false }));

const subscribers = new Map<string, number>();
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let intervalMs = 15_000;

async function refresh(force = false): Promise<void> {
  if (inFlight) return;
  const symbols = [...subscribers.keys()];
  if (!symbols.length) return;
  inFlight = true;
  useMarket.setState({ loading: true });
  try {
    const fresh = await api.market.quotes(symbols, force ? 5_000 : 10_000);
    useMarket.setState((s) => ({ quotes: { ...s.quotes, ...fresh }, updatedAt: Date.now(), error: null, loading: false }));
  } catch (err) {
    useMarket.setState({ error: err instanceof Error ? err.message : String(err), loading: false });
  } finally {
    inFlight = false;
  }
}

function ensureTimer(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (document.visibilityState === "visible") void refresh();
  }, intervalMs);
}

let debounce: ReturnType<typeof setTimeout> | null = null;
function scheduleRefresh(): void {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => void refresh(), 60);
}

export function refreshQuotes(): Promise<void> {
  return refresh(true);
}

/** Assina cotações em tempo real. Todas as telas compartilham um único ciclo de atualização. */
export function useQuotes(symbols: (string | undefined)[]): Record<string, Quote> {
  const key = useMemo(() => [...new Set(symbols.filter((s): s is string => !!s))].sort().join("|"), [symbols]);
  useEffect(() => {
    const list = key ? key.split("|") : [];
    for (const s of list) subscribers.set(s, (subscribers.get(s) ?? 0) + 1);
    ensureTimer();
    const missing = list.some((s) => !useMarket.getState().quotes[s]);
    if (missing) scheduleRefresh();
    return () => {
      for (const s of list) {
        const n = (subscribers.get(s) ?? 1) - 1;
        if (n <= 0) subscribers.delete(s);
        else subscribers.set(s, n);
      }
    };
  }, [key]);
  return useMarket((s) => s.quotes);
}

export function setQuoteInterval(ms: number): void {
  intervalMs = ms;
  if (timer) {
    clearInterval(timer);
    timer = null;
    ensureTimer();
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void refresh();
});
