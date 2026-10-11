import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bell, BellRing, BrainCircuit, CheckCheck, Clock, Pencil, Plus, RotateCcw, Trash, TrendingDown, TrendingUp } from "lucide-react";
import clsx from "clsx";
import type { AlertKind, AppNotification, NotificationType, PriceAlert } from "@shared/types";
import { displaySymbol } from "@shared/catalog";
import { api, uid } from "@/lib/api";
import { dateBR, money, num, pct, relativeTime, timeBR, toneClass } from "@/lib/format";
import { useQuotes } from "@/store/market";
import { useSession, useUserData } from "@/store/session";
import { useUi } from "@/store/ui";
import { useAsync } from "@/hooks/useAsync";
import { Badge, Card, EmptyState, ListGroup, PageHeader, PrivateAmounts, SectionTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Chip, Field, Input, MoneyInput, NumberInput, Select, SegmentedControl, Textarea, Toggle } from "@/components/ui/form";
import { ConfirmDialog, Sheet } from "@/components/ui/Sheet";
import { NotificationIcon } from "@/components/NotificationIcon";
import { AssetAvatar, AssetPicker } from "@/components/market";

type Tab = "notificacoes" | "alertas" | "inteligentes";

const KIND_LABEL: Record<AlertKind, string> = {
  "preco-acima": "Preço subir acima de",
  "preco-abaixo": "Preço cair abaixo de",
  "variacao-dia": "Variar no dia mais de",
  "abaixo-media": "Ficar abaixo da média de 50 dias em",
  lembrete: "Lembrete personalizado",
};

const FILTERS: { value: "todas" | NotificationType; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "mercado", label: "Mercado" },
  { value: "carteira", label: "Carteira" },
  { value: "alerta", label: "Meus alertas" },
  { value: "dica", label: "Dicas" },
  { value: "sistema", label: "Sistema" },
];

function Notifications() {
  const notifications = useSession((s) => s.notifications);
  const setNotifications = useSession((s) => s.setNotifications);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("todas");
  const [confirmClear, setConfirmClear] = useState(false);
  const list = notifications.filter((n) => filter === "todas" || n.type === filter);

  const open = (n: AppNotification) => {
    if (!n.read) void api.notifications.markRead(n.id).then(setNotifications);
    if (n.link) navigate(n.link);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" icon={CheckCheck} onClick={() => void api.notifications.markRead().then(setNotifications)}>
            Marcar como lidas
          </Button>
          <Button size="sm" variant="ghost" icon={Trash} onClick={() => setConfirmClear(true)} disabled={!notifications.length}>
            Limpar
          </Button>
        </div>
      </div>
      {list.length === 0 ? (
        <Card>
          <EmptyState icon={Bell} title="Nenhuma notificação" description="Você será avisado sobre Copom, inflação, movimentos fortes do mercado, sua carteira e seus alertas." />
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="divide-y divide-line/[0.07]">
            {list.map((n) => (
              <div key={n.id} className={clsx("group flex gap-3.5 px-5 py-4", !n.read && "bg-primary/[0.04]")}>
                <NotificationIcon n={n} size={40} />
                <button className="flex-1 min-w-0 text-left" onClick={() => open(n)}>
                  <div className="flex items-center gap-2">
                    <span className={clsx("text-[15px]", n.read ? "font-medium" : "font-semibold")}>{n.title}</span>
                    {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  <div className="text-[12.5px] text-muted mt-0.5">
                    {dateBR(n.createdAt, { day: "2-digit", month: "short" })}, {timeBR(n.createdAt)} · {relativeTime(n.createdAt)}
                  </div>
                  <p className="text-[14px] mt-1.5 text-fg/85">{n.type === "carteira" || n.type === "sistema" ? <PrivateAmounts text={n.message} /> : n.message}</p>
                </button>
                <button onClick={() => void api.notifications.remove(n.id).then(setNotifications)} className="h-8 w-8 rounded-lg flex items-center justify-center text-muted opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 hover:text-danger hover:bg-danger/10 transition" aria-label="Excluir">
                  <Trash size={15} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          void api.notifications.clear().then(setNotifications);
          setConfirmClear(false);
        }}
        title="Limpar notificações?"
        message="Todas as notificações serão apagadas."
        confirmLabel="Limpar"
        danger
      />
    </div>
  );
}

function emptyAlert(symbol?: string): PriceAlert {
  return { id: uid(), kind: "preco-abaixo", symbol, value: undefined, active: true, repeat: false, createdAt: new Date().toISOString() };
}

function AlertSheet({ open, initial, defaultSymbol, onClose }: { open: boolean; initial: PriceAlert | null; defaultSymbol?: string; onClose: () => void }) {
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const [a, setA] = useState<PriceAlert>(initial ?? emptyAlert());
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setA(initial ? { ...initial } : emptyAlert(defaultSymbol));
  }
  const quotes = useQuotes(a.symbol ? [a.symbol] : []);
  const q = a.symbol ? quotes[a.symbol] : undefined;
  const isReminder = a.kind === "lembrete";
  const valid = isReminder ? !!a.remindAt && !!(a.title?.trim() || a.message?.trim()) : !!a.symbol && (a.value ?? 0) > 0;
  const save = () => {
    update("alerts", (list) => (list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [a, ...list]));
    if (initial) void api.alerts.rearm(a.id);
    toast({ title: initial ? "Alerta atualizado" : "Alerta criado", message: isReminder ? "Você será lembrado no horário escolhido." : "Você será avisado assim que a condição acontecer.", tone: "success" });
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? "Editar alerta" : "Novo alerta"}
      subtitle="Crie avisos de preço ou lembretes com sua própria mensagem."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={!valid}>
            Salvar alerta
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Me avise quando">
          <Select value={a.kind} onChange={(e) => setA({ ...a, kind: e.target.value as AlertKind, value: undefined })}>
            {(Object.keys(KIND_LABEL) as AlertKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        {!isReminder && (
          <>
            <Field label="Ativo">
              <AssetPicker value={a.symbol} onSelect={(r) => setA({ ...a, symbol: r.symbol })} />
            </Field>
            {q && (
              <div className="text-[13px] text-muted -mt-2">
                Agora: <strong className="text-fg">{money(q.price, q.currency)}</strong> <span className={toneClass(q.changePercent)}>({pct(q.changePercent)} hoje)</span>
                {q.fiftyDayAverage ? ` · média 50 dias ${money(q.fiftyDayAverage, q.currency)}` : ""}
              </div>
            )}
            <Field label={a.kind === "variacao-dia" || a.kind === "abaixo-media" ? "Percentual" : "Preço"}>
              {a.kind === "variacao-dia" || a.kind === "abaixo-media" ? (
                <NumberInput value={a.value ?? 0} onChange={(v) => setA({ ...a, value: v })} suffix="%" min={0} />
              ) : (
                <MoneyInput value={a.value ?? 0} onChange={(v) => setA({ ...a, value: v })} prefix={q && q.currency !== "BRL" ? q.currency : "R$"} />
              )}
            </Field>
            {q && (a.kind === "preco-abaixo" || a.kind === "preco-acima") && (
              <div className="flex gap-2 -mt-1 flex-wrap">
                {[-10, -5, 5, 10].map((p) => (
                  <Chip key={p} onClick={() => setA({ ...a, kind: p < 0 ? "preco-abaixo" : "preco-acima", value: Math.round(q.price * (1 + p / 100) * 100) / 100 })}>
                    {p > 0 ? "+" : ""}
                    {p}% ({num(q.price * (1 + p / 100))})
                  </Chip>
                ))}
              </div>
            )}
          </>
        )}
        {isReminder && (
          <Field label="Data e hora">
            <Input type="datetime-local" value={a.remindAt?.slice(0, 16) ?? ""} onChange={(e) => setA({ ...a, remindAt: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
          </Field>
        )}
        <Field label={isReminder ? "Título" : "Título personalizado (opcional)"}>
          <Input value={a.title ?? ""} onChange={(e) => setA({ ...a, title: e.target.value })} placeholder={isReminder ? "Ex.: Aportar no Tesouro" : "Ex.: Hora de comprar PETR4!"} />
        </Field>
        <Field label={isReminder ? "Mensagem" : "Sua mensagem (opcional)"}>
          <Textarea value={a.message ?? ""} onChange={(e) => setA({ ...a, message: e.target.value })} placeholder="Escreva o que quer lembrar quando o alerta disparar." />
        </Field>
        {!isReminder && (
          <label className="flex items-center justify-between rounded-2xl bg-line/[0.04] px-4 py-3">
            <div>
              <div className="font-medium text-[14.5px]">Repetir</div>
              <div className="text-[12.5px] text-muted">Avisar de novo toda vez que a condição voltar a acontecer.</div>
            </div>
            <Toggle checked={a.repeat} onChange={(v) => setA({ ...a, repeat: v })} />
          </label>
        )}
      </div>
    </Sheet>
  );
}

function MyAlerts({ openNew }: { openNew: (symbol?: string) => void }) {
  const alerts = useUserData("alerts");
  const update = useSession((s) => s.update);
  const state = useAsync("alert-state", () => api.alerts.state(), { refreshMs: 30_000, staleMs: 5_000 });
  const quotes = useQuotes(alerts.filter((a) => a.symbol).map((a) => a.symbol!));
  const [edit, setEdit] = useState<PriceAlert | null>(null);
  const [toDelete, setToDelete] = useState<PriceAlert | null>(null);

  if (!alerts.length)
    return (
      <Card>
        <EmptyState
          icon={BellRing}
          title="Nenhum alerta criado"
          description="Seja avisado quando um ativo chegar no preço que você quer, variar forte no dia ou ficar mais barato que o normal. Também dá para criar lembretes com sua própria mensagem."
          action={
            <Button icon={Plus} onClick={() => openNew()}>
              Criar alerta
            </Button>
          }
        />
      </Card>
    );

  return (
    <>
      <Card padded={false} className="overflow-hidden">
        <div className="divide-y divide-line/[0.07]">
          {alerts.map((a) => {
            const q = a.symbol ? quotes[a.symbol] : undefined;
            const st = state.data?.[a.id];
            const fired = st?.fired;
            const distance = q && a.value && (a.kind === "preco-abaixo" || a.kind === "preco-acima") ? ((a.value - q.price) / q.price) * 100 : undefined;
            return (
              <div key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                {a.symbol ? (
                  <AssetAvatar symbol={a.symbol} size={40} />
                ) : (
                  <div className="h-10 w-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center">
                    <Clock size={18} />
                  </div>
                )}
                <div className="flex-1 min-w-[180px]">
                  <div className="font-semibold text-[14.5px]">{a.title?.trim() || (a.symbol ? displaySymbol(a.symbol) : "Lembrete")}</div>
                  <div className="text-[13px] text-muted">
                    {a.kind === "lembrete"
                      ? `${a.remindAt ? `${dateBR(a.remindAt)} às ${timeBR(a.remindAt)}` : ""}${a.message ? ` · ${a.message}` : ""}`
                      : `${KIND_LABEL[a.kind]} ${a.kind === "variacao-dia" || a.kind === "abaixo-media" ? `${num(a.value)}%` : money(a.value, q?.currency ?? "BRL")}`}
                  </div>
                  {q && a.kind !== "lembrete" && (
                    <div className="text-[12.5px] text-muted">
                      Agora {money(q.price, q.currency)}
                      {distance !== undefined && ` · falta ${pct(distance, 1)}`}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {fired ? (
                    <Badge tone="success">Disparado {st?.firedAt ? relativeTime(st.firedAt) : ""}</Badge>
                  ) : a.active ? (
                    <Badge tone="primary">Monitorando</Badge>
                  ) : (
                    <Badge>Pausado</Badge>
                  )}
                  {fired && !a.repeat && a.kind !== "lembrete" && (
                    <Button size="icon-sm" variant="ghost" icon={RotateCcw} title="Reativar" onClick={() => void api.alerts.rearm(a.id).then(() => state.reload())} />
                  )}
                  <Toggle checked={a.active} onChange={(v) => update("alerts", (l) => l.map((x) => (x.id === a.id ? { ...x, active: v } : x)))} />
                  <Button size="icon-sm" variant="ghost" icon={Pencil} onClick={() => setEdit(a)} aria-label="Editar" />
                  <Button size="icon-sm" variant="ghost" icon={Trash} onClick={() => setToDelete(a)} aria-label="Excluir" />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <AlertSheet open={!!edit} initial={edit} onClose={() => setEdit(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) update("alerts", (l) => l.filter((x) => x.id !== toDelete.id));
          setToDelete(null);
        }}
        title="Excluir alerta?"
        message="Você não será mais avisado sobre esta condição."
        confirmLabel="Excluir"
        danger
      />
    </>
  );
}

function SmartAlerts() {
  const settings = useUserData("settings");
  const portfolio = useUserData("portfolio");
  const update = useSession((s) => s.update);
  const variable = portfolio.filter((h) => h.kind === "variavel" && h.symbol);
  const quotes = useQuotes(variable.map((h) => h.symbol!));
  const set = (patch: Partial<typeof settings>) => update("settings", (s) => ({ ...s, ...patch }));

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-2 space-y-4">
        <ListGroup>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <BrainCircuit size={20} className="text-primary" />
            <div className="flex-1">
              <div className="font-medium text-[14.5px]">Alertas inteligentes da carteira</div>
              <div className="text-[12.5px] text-muted">Avisa quando seus ativos estão mais baratos ou mais caros que o normal e quando estão dando lucro ou prejuízo.</div>
            </div>
            <Toggle checked={settings.smartAlerts} onChange={(v) => set({ smartAlerts: v })} />
          </div>
          <div className="px-4 py-3.5 space-y-4">
            <Slider label="Avisar quando der lucro de" value={settings.gainThreshold} min={2} max={50} onChange={(v) => set({ gainThreshold: v })} />
            <Slider label="Avisar quando cair (prejuízo) de" value={settings.lossThreshold} min={2} max={50} onChange={(v) => set({ lossThreshold: v })} />
            <Slider label="Diferença da média de 50 dias" value={settings.deviationThreshold} min={2} max={20} onChange={(v) => set({ deviationThreshold: v })} />
          </div>
        </ListGroup>
        <ListGroup>
          <ToggleRow title="Eventos do mercado" subtitle="Copom (antes e depois da reunião), inflação (IPCA), dólar e Ibovespa em dias de movimento forte." checked={settings.marketEvents} onChange={(v) => set({ marketEvents: v })} />
          <ToggleRow title="Dica do dia" subtitle="Uma dica de educação financeira por dia." checked={settings.dailyTip} onChange={(v) => set({ dailyTip: v })} />
          <ToggleRow title="Notificações do Windows" subtitle="Mostra o aviso na área de notificações do sistema." checked={settings.desktopNotifications} onChange={(v) => set({ desktopNotifications: v })} />
          <ToggleRow title="Continuar em segundo plano" subtitle="Ao fechar a janela, o Investa fica na bandeja e continua avisando." checked={settings.runInBackground} onChange={(v) => set({ runInBackground: v })} />
        </ListGroup>
      </div>
      <Card padded={false} className="lg:col-span-3 overflow-hidden h-fit">
        <div className="px-5 pt-4 pb-2">
          <SectionTitle title="Situação dos seus ativos agora" subtitle="É isso que o Investa observa a cada minuto para te avisar." />
        </div>
        {variable.length === 0 ? (
          <div className="px-5 pb-5 text-[14px] text-muted">Cadastre ações, FIIs ou outros ativos na Carteira para receber alertas inteligentes.</div>
        ) : (
          <div className="divide-y divide-line/[0.07]">
            {variable.map((h) => {
              const q = quotes[h.symbol!];
              const ret = q && h.avgPrice ? ((q.price - h.avgPrice) / h.avgPrice) * 100 : undefined;
              const dev = q?.fiftyDayAverage ? ((q.price - q.fiftyDayAverage) / q.fiftyDayAverage) * 100 : undefined;
              const status =
                ret !== undefined && ret >= settings.gainThreshold
                  ? { tone: "success" as const, label: "Dando bom", icon: TrendingUp }
                  : ret !== undefined && ret <= -settings.lossThreshold
                    ? { tone: "danger" as const, label: "Em queda", icon: TrendingDown }
                    : dev !== undefined && dev <= -settings.deviationThreshold
                      ? { tone: "primary" as const, label: "Abaixo do normal", icon: TrendingDown }
                      : dev !== undefined && dev >= settings.deviationThreshold
                        ? { tone: "warning" as const, label: "Acima do normal", icon: TrendingUp }
                        : { tone: "neutral" as const, label: "Normal", icon: undefined };
              return (
                <div key={h.id} className="flex items-center gap-3 px-5 py-3">
                  <AssetAvatar symbol={h.symbol!} size={38} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{displaySymbol(h.symbol!)}</div>
                    <div className="text-[12.5px] text-muted">
                      vs. seu preço médio: <span className={toneClass(ret)}>{pct(ret, 1)}</span> · vs. média 50 dias: <span className={toneClass(dev)}>{pct(dev, 1)}</span>
                    </div>
                  </div>
                  <Badge tone={status.tone} icon={status.icon}>
                    {status.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-[13.5px] mb-2">
        <span className="text-muted">{label}</span>
        <span className="font-semibold tabular">{value}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ background: `linear-gradient(90deg, rgb(var(--primary)) ${((value - min) / (max - min)) * 100}%, rgb(var(--line) / 0.15) 0)` }}
      />
    </div>
  );
}

function ToggleRow({ title, subtitle, checked, onChange }: { title: string; subtitle: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="flex-1">
        <div className="font-medium text-[14.5px]">{title}</div>
        <div className="text-[12.5px] text-muted">{subtitle}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export function Alertas() {
  const [params, setParams] = useSearchParams();
  const unread = useSession((s) => s.notifications.filter((n) => !n.read).length);
  const alertsCount = useUserData("alerts").length;
  const [tab, setTab] = useState<Tab>(params.get("novo") ? "alertas" : "notificacoes");
  const [sheet, setSheet] = useState<{ open: boolean; symbol?: string }>({ open: false });

  useEffect(() => {
    const s = params.get("novo");
    if (s) {
      setSheet({ open: true, symbol: s });
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const options = useMemo(
    () => [
      { value: "notificacoes" as Tab, label: `Notificações${unread ? ` (${unread})` : ""}` },
      { value: "alertas" as Tab, label: `Meus alertas${alertsCount ? ` (${alertsCount})` : ""}` },
      { value: "inteligentes" as Tab, label: "Inteligentes" },
    ],
    [unread, alertsCount]
  );

  return (
    <div>
      <PageHeader
        title="Alertas"
        subtitle="Avisos sobre o que realmente importa: mercado, sua carteira e os alertas que você criar."
        actions={
          <Button icon={Plus} onClick={() => setSheet({ open: true })}>
            Novo alerta
          </Button>
        }
      />
      <SegmentedControl<Tab> className="mb-5" value={tab} onChange={setTab} options={options} />
      {tab === "notificacoes" && <Notifications />}
      {tab === "alertas" && <MyAlerts openNew={(s) => setSheet({ open: true, symbol: s })} />}
      {tab === "inteligentes" && <SmartAlerts />}
      <AlertSheet open={sheet.open} initial={null} defaultSymbol={sheet.symbol} onClose={() => setSheet({ open: false })} />
    </div>
  );
}

