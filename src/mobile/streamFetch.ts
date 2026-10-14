// A IA responde em streaming. Tenta primeiro o fetch do próprio WebView (que
// entrega a resposta aos poucos); se ele falhar para aquele servidor (CORS),
// usa a rede nativa, que entrega tudo de uma vez. Cada servidor é lembrado à
// parte: a Groq aceita o WebView, a NVIDIA não. A rede nativa não respeita o
// AbortSignal, então o cancelamento é feito aqui: a promessa termina na hora
// e a resposta que chegar depois é descartada.
// Fica fora do bridge.ts (que importa os plugins do Capacitor) para ser testado no Node.

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

export interface NativeRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  data?: unknown;
}
export type NativeHttp = (req: NativeRequest) => Promise<{ status: number; data: unknown; headers: Record<string, string> }>;

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export function createStreamFetch(webFetch: FetchImpl | undefined, native: NativeHttp): { fetch: FetchImpl; buffered: (url: string) => boolean } {
  const webStreams = new Map<string, boolean>();
  const nativeFetch = (url: string, init: RequestInit): Promise<Response> =>
    new Promise<Response>((resolve, reject) => {
      const signal = init.signal;
      const abort = () => reject(Object.assign(new Error("Cancelado"), { name: "AbortError" }));
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort, { once: true });
      const headers = Object.fromEntries(new Headers(init.headers).entries());
      native({ url, method: init.method ?? "GET", headers, data: typeof init.body === "string" ? JSON.parse(init.body) : undefined })
        .then((res) => {
          signal?.removeEventListener("abort", abort);
          if (signal?.aborted) return;
          const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
          resolve(new Response(body, { status: res.status, headers: res.headers }));
        })
        .catch((err) => {
          signal?.removeEventListener("abort", abort);
          reject(err);
        });
    });
  return {
    async fetch(url, init) {
      const host = hostOf(url);
      if (webFetch && webStreams.get(host) !== false) {
        try {
          const res = await webFetch(url, init);
          webStreams.set(host, true);
          return res;
        } catch (err) {
          if (init.signal?.aborted) throw err;
          // Só desiste do streaming se a rede nativa funcionar (era bloqueio do WebView,
          // não falta de internet).
          const res = await nativeFetch(url, init);
          webStreams.set(host, false);
          return res;
        }
      }
      return nativeFetch(url, init);
    },
    buffered: (url) => !webFetch || webStreams.get(hostOf(url)) !== true,
  };
}
