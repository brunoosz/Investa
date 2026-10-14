import { useCallback, useEffect, useRef, useState } from "react";

interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => void;
  updatedAt: number | null;
}

const memory = new Map<string, { data: unknown; at: number }>();

/** Busca dados com cache em memória por chave, recarga periódica opcional e estado de erro amigável. */
export function useAsync<T>(key: string | null, loader: () => Promise<T>, options: { refreshMs?: number; staleMs?: number } = {}): AsyncState<T> {
  const cachedEntry = key ? (memory.get(key) as { data: T; at: number } | undefined) : undefined;
  const [data, setData] = useState<T | undefined>(cachedEntry?.data);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cachedEntry && !!key);
  const [updatedAt, setUpdatedAt] = useState<number | null>(cachedEntry?.at ?? null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const seq = useRef(0);

  const run = useCallback(
    async (silent: boolean) => {
      if (!key) return;
      const id = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const result = await loaderRef.current();
        if (id !== seq.current) return;
        memory.set(key, { data: result, at: Date.now() });
        setData(result);
        setUpdatedAt(Date.now());
        setError(null);
      } catch (err) {
        if (id !== seq.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (id === seq.current) setLoading(false);
      }
    },
    [key]
  );

  useEffect(() => {
    if (!key) {
      setData(undefined);
      setLoading(false);
      return;
    }
    const entry = memory.get(key) as { data: T; at: number } | undefined;
    if (entry) {
      setData(entry.data);
      setUpdatedAt(entry.at);
      setLoading(false);
    } else {
      setData(undefined);
    }
    const stale = !entry || Date.now() - entry.at > (options.staleMs ?? 60_000);
    if (stale) void run(!!entry);
    if (!options.refreshMs) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void run(true);
    }, options.refreshMs);
    return () => clearInterval(t);
  }, [key, run, options.refreshMs, options.staleMs]);

  return { data, error, loading, reload: () => void run(false), updatedAt };
}
