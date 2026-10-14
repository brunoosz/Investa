import { api } from "@/lib/api";
import { useAsync } from "./useAsync";

export function useIndicators() {
  return useAsync("indicators", () => api.market.indicators(), { refreshMs: 30 * 60_000, staleMs: 10 * 60_000 });
}

export function useNews() {
  return useAsync("news", () => api.market.news(), { refreshMs: 10 * 60_000, staleMs: 5 * 60_000 });
}

export function useCopom() {
  return useAsync("copom", () => api.market.copom(), { staleMs: 30 * 60_000 });
}

export function useTesouro() {
  return useAsync("tesouro", () => api.market.tesouro(), { refreshMs: 30 * 60_000, staleMs: 15 * 60_000 });
}
