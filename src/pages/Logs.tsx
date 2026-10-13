import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { CheckCircle2, CircleSlash, Copy, Info, RefreshCw, Repeat, Trash, XCircle } from "lucide-react";
import clsx from "clsx";
import type { AiLogEntry } from "@shared/types";
import { api } from "@/lib/api";
import { useSession } from "@/store/session";
import { toastError, useUi } from "@/store/ui";
import { useAsync } from "@/hooks/useAsync";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/form";

/** O que cada código quer dizer, em português, para o Dono saber o que fazer. */
const EXPLAIN: Record<string, string> = {
  AI_NO_KEY: "Sem chave de IA. Coloque a chave da Groq ou da NVIDIA em Configurações → Inteligência Artificial.",
  AI_AUTH: "O provedor recusou a chave (401/403). Gere uma chave nova (console.groq.com ou build.nvidia.com) e cole em Configurações.",
  AI_RATE: "Limite de uso da conta grátis atingido (429). O app tenta outro modelo ou o outro provedor; se continuar, espere alguns minutos.",
  AI_BLOCKED: "O firewall na frente do provedor recusou esta rede (403 em página HTML). O app tenta o outro provedor.",
  AI_MODEL: "O modelo foi desativado pelo provedor (404/410). O app usa outro só nesta resposta; a sua escolha continua salva.",
  AI_DOWN: "O servidor deu erro (5xx) ou recusou o pedido. O app tenta outro modelo.",
  AI_SLOW: "O modelo não respondeu no prazo. O app tenta outro modelo.",
  AI_EMPTY: "O modelo respondeu vazio (ou só com o rascunho do raciocínio). O app tenta outro modelo.",
  AI_BIG: "A conversa ficou grande demais para o limite grátis deste modelo. O app tenta outro.",
  AI_OFFLINE: "Sem conexão com o provedor de IA. Verifique a internet do aparelho.",
  AI_ERROR: "Erro inesperado da IA. Veja o detalhe abaixo.",
  AI_LANG: "O modelo começou em inglês. O app descartou e pediu de novo em português, sem a pessoa ver.",
  AI_CONTINUE: "A resposta passou do limite de tamanho. O app pediu a continuação e juntou tudo na mesma mensagem.",
};

const KIND = {
  ok: { label: "Respondeu", icon: CheckCircle2, tone: "success" as const },
  erro: { label: "Erro", icon: XCircle, tone: "danger" as const },
  troca: { label: "Troca de modelo", icon: Repeat, tone: "warning" as const },
  cancelado: { label: "Cancelado", icon: CircleSlash, tone: "neutral" as const },
  aviso: { label: "Ajuste automático", icon: Info, tone: "primary" as const },
};

/** "groq:llama-3.3-70b-versatile" → "Groq · llama-3.3-70b-versatile". */
const modelName = (id: string) => (id.startsWith("groq:") ? `Groq · ${id.slice(5)}` : id === "-" ? id : `NVIDIA · ${id}`);

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function Logs() {
  const user = useSession((s) => s.user);
  const toast = useUi((s) => s.toast);
  const logs = useAsync("ai-logs", () => api.ai.logs(), { staleMs: 0 });
  const [filter, setFilter] = useState<"todos" | "erro">("todos");
  const list = useMemo(() => (logs.data ?? []).filter((l) => filter === "todos" || l.kind !== "ok"), [logs.data, filter]);
  const stats = useMemo(() => {
    const all = logs.data ?? [];
    const ok = all.filter((l) => l.kind === "ok");
    const avg = ok.length ? Math.round(ok.reduce((s, l) => s + (l.ms ?? 0), 0) / ok.length / 100) / 10 : 0;
    return { ok: ok.length, err: all.filter((l) => l.kind === "erro").length, avg, model: ok[0] ? modelName(ok[0].model) : undefined };
  }, [logs.data]);
  if (user && user.role !== "dono") return <Navigate to="/" replace />;

  const copy = (l: AiLogEntry) => {
    void navigator.clipboard.writeText(JSON.stringify(l, null, 2));
    toast({ title: "Log copiado", tone: "success" });
  };

  return (
    <div>
      <PageHeader
        title="Logs"
        subtitle="Só o Dono vê. Cada pergunta ao Assistente deste aparelho: qual modelo respondeu, quanto demorou e, quando falha, o código do erro."
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={() => logs.reload()}>
              Atualizar
            </Button>
            <Button
              variant="ghost"
              icon={Trash}
              onClick={async () => {
                try {
                  await api.ai.clearLogs();
                  logs.reload();
                } catch (err) {
                  toastError(err);
                }
              }}
            >
              Limpar
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Card>
          <div className="text-[13px] text-muted">Respostas</div>
          <div className="text-[22px] font-bold">{stats.ok}</div>
        </Card>
        <Card>
          <div className="text-[13px] text-muted">Erros</div>
          <div className={clsx("text-[22px] font-bold", stats.err && "text-danger")}>{stats.err}</div>
        </Card>
        <Card>
          <div className="text-[13px] text-muted">Tempo médio</div>
          <div className="text-[22px] font-bold">{stats.avg ? `${String(stats.avg).replace(".", ",")} s` : "—"}</div>
        </Card>
        <Card>
          <div className="text-[13px] text-muted">Último que respondeu</div>
          <div className="text-[15px] font-semibold mt-1.5 break-all">{stats.model ?? "—"}</div>
        </Card>
      </div>

      <div className="mb-3">
        <SegmentedControl<"todos" | "erro">
          value={filter}
          onChange={setFilter}
          options={[
            { value: "todos", label: "Tudo" },
            { value: "erro", label: "Só problemas" },
          ]}
        />
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState icon={CheckCircle2} title={filter === "erro" ? "Nenhum problema registrado" : "Nada registrado ainda"} description="Faça uma pergunta ao Assistente e volte aqui." />
        </Card>
      ) : (
        <Card padded={false}>
          <div className="divide-y divide-line/[0.06]">
            {list.map((l, i) => {
              const k = KIND[l.kind] ?? KIND.aviso;
              const Icon = k.icon;
              return (
                <div key={l.at + i} className="p-4 flex gap-3">
                  <Icon size={18} className={clsx("shrink-0 mt-0.5", k.tone === "success" ? "text-success" : k.tone === "danger" ? "text-danger" : k.tone === "warning" ? "text-warning" : k.tone === "primary" ? "text-primary" : "text-muted")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={k.tone}>{k.label}</Badge>
                      {l.status !== undefined && <Badge tone="danger">HTTP {l.status}</Badge>}
                      {l.code && <Badge>{l.code}</Badge>}
                      <span className="text-[12.5px] text-muted">{when(l.at)}</span>
                      {l.ms !== undefined && <span className="text-[12.5px] text-muted">· {(l.ms / 1000).toFixed(1).replace(".", ",")} s</span>}
                    </div>
                    <div className="text-[13px] mt-1 break-all">
                      <span className="text-muted">Modelo:</span> {modelName(l.model)}
                    </div>
                    {l.message && <div className="text-[13.5px] mt-1">{l.message}</div>}
                    {l.code && EXPLAIN[l.code] && <div className="text-[12.5px] text-muted mt-1">O que fazer: {EXPLAIN[l.code]}</div>}
                    {l.detail && <pre className="mt-2 text-[11.5px] whitespace-pre-wrap break-all rounded-xl bg-line/[0.05] p-2.5 text-muted">{l.detail}</pre>}
                  </div>
                  <Button size="icon-sm" variant="ghost" icon={Copy} aria-label="Copiar log" onClick={() => copy(l)} />
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
