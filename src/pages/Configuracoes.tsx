import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Bell,
  BrainCircuit,
  CircleCheck,
  Database,
  ExternalLink,
  Info,
  KeyRound,
  Lock,
  LogOut,
  Moon,
  Monitor,
  Palette,
  PiggyBank,
  RefreshCw,
  Sparkles,
  Sun,
  UserRound,
  Wallet,
  Plus,
  Trash,
  Download,
  Upload,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import type { AiCatalog, AiConfigInfo, FinancialProfile, UserSettings } from "@shared/types";
import { ROLE_LABEL } from "@shared/types";
import { api, uid } from "@/lib/api";
import { brl, relativeTime } from "@/lib/format";
import { isOwner, useSession, useUserData } from "@/store/session";
import { toastError, useUi } from "@/store/ui";
import { useAsync } from "@/hooks/useAsync";
import { Avatar, Badge, Card, ListGroup, ListRow, PageHeader, Private, PrivateAmounts } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Field, Input, PasswordInput, SegmentedControl, Toggle } from "@/components/ui/form";
import { ConfirmDialog, Sheet } from "@/components/ui/Sheet";
import { ExpenseFields, IncomeFields, InvestFields, ProfileFields, RISK_LABEL, totalExpenses, totalIncome } from "@/components/ProfileForm";
import { ErrorBanner } from "@/pages/auth/Login";
import { AppIcon } from "@/components/Logo";
import { changeIconVariant, useIconVariant } from "@/lib/appIcon";
import { TabBarSettings, usePhoneLayout } from "@/components/TabBarSettings";


/** Cópia de todos os dados da conta num arquivo, para guardar fora do app ou restaurar. */
function BackupSection() {
  const toast = useUi((s) => s.toast);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const doExport = async () => {
    setBusy("export");
    try {
      const res = await api.backup.export();
      if (res) toast({ title: "Backup salvo", message: res.path, tone: "success" });
    } catch (err) {
      toastError(err, "Não foi possível salvar o backup");
    } finally {
      setBusy(null);
    }
  };
  const doImport = async (json: string) => {
    setBusy("import");
    try {
      const data = await api.backup.import(json);
      useSession.setState({ data });
      toast({ title: "Backup restaurado", message: "Seus dados foram substituídos pelos do arquivo.", tone: "success" });
    } catch (err) {
      toastError(err, "Não foi possível restaurar");
    } finally {
      setBusy(null);
      setPending(null);
    }
  };
  return (
    <Card>
      <div className="text-[13.5px] text-muted">
        Salve uma cópia de tudo (gastos, faturas, contas, carteira, metas, caixinhas, aulas e memória do Assistente) num arquivo. Com a nuvem ligada, os dados já ficam guardados na
        conta; o backup é uma garantia a mais.
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button variant="secondary" icon={Download} loading={busy === "export"} onClick={() => void doExport()}>
          Salvar backup
        </Button>
        <Button variant="ghost" icon={Upload} loading={busy === "import"} onClick={() => fileRef.current?.click()}>
          Restaurar de um arquivo
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setPending(await f.text());
          }}
        />
      </div>
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => pending && void doImport(pending)}
        title="Restaurar este backup?"
        message="Os dados atuais desta conta serão substituídos pelos do arquivo. Faça um backup antes, se quiser guardar os de agora."
        confirmLabel="Restaurar"
        danger
      />
    </Card>
  );
}

/** O que o Assistente guardou sobre a pessoa: ver, editar, apagar ou adicionar. */
function MemorySection() {
  const memory = useUserData("memory");
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const [draft, setDraft] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const add = () => {
    const text = draft.trim();
    if (text.length < 3) return;
    update("memory", (list) => [...list, { id: uid(), text, createdAt: new Date().toISOString() }]);
    setDraft("");
  };
  return (
    <Card>
      <div className="text-[13.5px] text-muted mb-3">
        Gostos, hobbies e planos que você contou ao Assistente. Ele usa isso para personalizar as respostas, como numa análise de compra. Toque no texto para editar.
      </div>
      {memory.length > 0 ? (
        <div className="space-y-2">
          {memory.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <Input
                value={m.text}
                onChange={(e) => update("memory", (list) => list.map((x) => (x.id === m.id ? { ...x, text: e.target.value } : x)))}
                onBlur={(e) => !e.target.value.trim() && update("memory", (list) => list.filter((x) => x.id !== m.id))}
                aria-label="Item da memória"
              />
              <Button size="icon-sm" variant="ghost" icon={Trash} aria-label="Apagar da memória" onClick={() => update("memory", (list) => list.filter((x) => x.id !== m.id))} />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[13.5px] text-muted">Nada guardado ainda. Conte ao Assistente o que você gosta de fazer, ou adicione aqui.</div>
      )}
      <div className="flex gap-2 mt-3">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Ex.: gosto de jogar videogame e comer fora" />
        <Button variant="secondary" icon={Plus} onClick={add} disabled={draft.trim().length < 3}>
          Adicionar
        </Button>
      </div>
      {memory.length > 0 && (
        <Button size="sm" variant="ghost" className="mt-3 text-danger" icon={Trash} onClick={() => setConfirmClear(true)}>
          Apagar toda a memória
        </Button>
      )}
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          update("memory", []);
          setConfirmClear(false);
          toast({ title: "Memória apagada", tone: "success" });
        }}
        title="Apagar toda a memória?"
        message="O Assistente esquece tudo o que você contou. Isso não apaga as conversas."
        confirmLabel="Apagar"
        danger
      />
    </Card>
  );
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted mb-2 px-1">{title}</h2>
      {children}
    </section>
  );
}

function ProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useSession((s) => s.user)!;
  const setUser = useSession((s) => s.setUser);
  const toast = useUi((s) => s.toast);
  const [form, setForm] = useState({ name: user.name, username: user.username, email: user.email ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setForm({ name: user.name, username: user.username, email: user.email ?? "" });
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const save = async () => {
    setSaving(true);
    try {
      const u = await api.updateProfile(form);
      setUser(u);
      toast({ title: "Perfil atualizado", tone: "success" });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setShake((s) => s + 1);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Seu perfil"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Usuário" hint="Usado para entrar. Não diferencia maiúsculas de minúsculas.">
          <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, "") })} />
        </Field>
        <Field label="E-mail">
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <ErrorBanner message={error} shakeKey={shake} />
      </div>
    </Sheet>
  );
}

function FinanceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const profile = useUserData("profile");
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const [p, setP] = useState<FinancialProfile>(profile);
  const [section, setSection] = useState<"renda" | "gastos" | "investir" | "perfil">("renda");
  // Só recarrega ao abrir: uma atualização vinda da nuvem não apaga o que está sendo digitado.
  useEffect(() => {
    if (open) setP(profile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      width="lg"
      title="Dados financeiros"
      subtitle="Ganhou aumento? Mudou de emprego? Atualize aqui — o Assistente e as metas usam essas informações."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              update("profile", { ...p, updatedAt: new Date().toISOString() });
              toast({ title: "Dados financeiros atualizados", tone: "success" });
              onClose();
            }}
          >
            Salvar
          </Button>
        </>
      }
    >
      <SegmentedControl
        block
        className="mb-5"
        value={section}
        onChange={setSection}
        options={[
          { value: "renda", label: "Renda" },
          { value: "gastos", label: "Gastos" },
          { value: "investir", label: "Investir" },
          { value: "perfil", label: "Perfil" },
        ]}
      />
      {section === "renda" && <IncomeFields value={p} onChange={setP} />}
      {section === "gastos" && <ExpenseFields value={p} onChange={setP} />}
      {section === "investir" && <InvestFields value={p} onChange={setP} />}
      {section === "perfil" && <ProfileFields value={p} onChange={setP} />}
    </Sheet>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useUi((s) => s.toast);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setCurrent("");
      setNext("");
      setConfirm("");
      setError(null);
    }
  }, [open]);
  const fail = (m: string) => {
    setError(m);
    setShake((s) => s + 1);
  };
  const save = async () => {
    if (next.length < 6) return fail("A nova senha precisa ter pelo menos 6 caracteres.");
    if (next !== confirm) return fail("As senhas não conferem.");
    setSaving(true);
    try {
      await api.changePassword(current, next);
      toast({ title: "Senha alterada com sucesso", tone: "success" });
      onClose();
    } catch (err) {
      fail((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Alterar senha"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={saving} disabled={!current || !next}>
            Alterar senha
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Senha atual">
          <PasswordInput value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
        </Field>
        <Field label="Nova senha">
          <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirmar nova senha">
          <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <ErrorBanner message={error} shakeKey={shake} />
      </div>
    </Sheet>
  );
}

/** A pesquisa funciona sem chave; a chave da Tavily ou da Brave é opcional. */
function SearchSettings({ info, onChange }: { info?: AiConfigInfo | null; onChange: () => void }) {
  const toast = useUi((s) => s.toast);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const save = async () => {
    const k = key.trim();
    if (!k) return;
    setBusy("save");
    try {
      const n = await api.ai.testSearch(k);
      await api.ai.setConfig({ searchKey: k });
      setKey("");
      onChange();
      toast({ title: "Chave salva", message: `Teste trouxe ${n} resultado(s). Vale para todas as contas.`, tone: "success" });
    } catch (err) {
      toastError(err, "A chave não funcionou");
    } finally {
      setBusy(null);
    }
  };
  const test = async () => {
    setBusy("test");
    try {
      const n = await api.ai.testSearch("");
      toast({ title: "A pesquisa está funcionando", message: `Teste sem chave trouxe ${n} resultado(s).`, tone: "success" });
    } catch (err) {
      toastError(err, "A pesquisa não respondeu");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="mt-5 pt-5 border-t border-line/10">
      <div className="flex items-center gap-2">
        <span className="font-semibold">Pesquisa na internet</span>
        <Badge tone="success">Ligada</Badge>
      </div>
      <div className="text-[13px] text-muted mt-0.5">
        Funciona sem chave: cada aparelho faz a própria busca, então não existe limite dividido entre as contas. O Assistente mostra as fontes, inclusive no plano de investimento.
      </div>
      <div className="text-[13px] font-medium mt-4">Chave da Tavily ou da Brave (opcional)</div>
      <div className="text-[13px] text-muted mt-0.5">Deixa os resultados mais completos. Se a cota acabar, o app volta sozinho para a busca sem chave.</div>
      {info?.searchPreview && (
        <div className="mt-2 text-[13px]">
          <Badge tone="neutral">{info.searchProvider === "tavily" ? "Tavily" : "Brave"}</Badge> <span className="text-muted ml-1">{info.searchPreview}</span>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-2 mt-3">
        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="tvly-… ou chave da Brave" type="password" autoComplete="off" />
        <Button onClick={() => void save()} loading={busy === "save"} disabled={!key.trim() || busy === "test"}>
          Testar e salvar
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <Button size="sm" variant="ghost" icon={Sparkles} loading={busy === "test"} disabled={busy === "save"} onClick={() => void test()}>
          Testar pesquisa
        </Button>
        <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => void api.openExternal("https://app.tavily.com/home")}>
          Criar chave na Tavily
        </Button>
        <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => void api.openExternal("https://api-dashboard.search.brave.com/app/keys")}>
          Criar chave na Brave
        </Button>
        {info?.searchPreview && (
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            onClick={async () => {
              await api.ai.setConfig({ searchKey: null });
              onChange();
            }}
          >
            Remover chave
          </Button>
        )}
      </div>
    </div>
  );
}

/** Linha de escolha (modelo ou opção) que salva na hora, sem botão "Salvar". */
function ChoiceRow({ selected, saving, onClick, title, sub, badge }: { selected: boolean; saving?: boolean; onClick: () => void; title: React.ReactNode; sub: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={clsx(
        "w-full text-left flex items-center gap-3 rounded-2xl border px-4 py-3 transition",
        selected ? "border-primary/60 bg-primary/[0.07]" : "border-line/10 hover:border-primary/30 hover:bg-line/[0.04]"
      )}
    >
      <span
        className={clsx(
          "h-4 w-4 rounded-full border-2 shrink-0",
          selected ? "border-primary bg-primary shadow-[inset_0_0_0_3px_rgb(var(--surface))]" : "border-line/30",
          saving && "animate-pulse"
        )}
      />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2 flex-wrap font-medium text-[14.5px]">
          {title} {badge}
        </span>
        <span className="block text-[12.5px] text-muted truncate">{sub}</span>
      </span>
    </button>
  );
}

/** Groq: chave grátis e respostas bem mais rápidas. */
function GroqSettings({ info, groqModels, onChange }: { info?: AiConfigInfo | null; groqModels?: AiCatalog["groq"]; onChange: () => void }) {
  const toast = useUi((s) => s.toast);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const has = !!info?.hasGroq;
  const selected = pick ?? info?.groqChoice;
  useEffect(() => {
    if (pick && info?.groqChoice === pick) setPick(null);
  }, [info?.groqChoice, pick]);

  const save = async () => {
    const k = key.trim();
    if (!k) return;
    if (!k.startsWith("gsk_")) {
      toast({ title: "Essa não parece uma chave da Groq", message: "A chave da Groq começa com gsk_. Copie de novo em console.groq.com/keys.", tone: "error" });
      return;
    }
    setBusy(true);
    try {
      const r = await api.ai.test("groq", k);
      await api.ai.setConfig({ groqKey: k });
      setKey("");
      onChange();
      toast({ title: "Groq conectada", message: r.slice(0, 120), tone: "success" });
    } catch (err) {
      toastError(err, "A chave não funcionou");
    } finally {
      setBusy(false);
    }
  };

  const choose = async (patch: { groqModel?: string; primary?: "groq" | "nvidia" }) => {
    if (patch.groqModel) setPick(patch.groqModel);
    try {
      await api.ai.setConfig(patch);
      onChange();
    } catch (err) {
      setPick(null);
      toastError(err);
    }
  };

  return (
    <div className="rounded-2xl border border-line/10 p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Zap size={17} className="text-primary" />
        <span className="font-semibold">Groq</span>
        {has ? (
          <Badge tone="success" icon={CircleCheck}>
            Ligada
          </Badge>
        ) : (
          <Badge tone="primary">Recomendado</Badge>
        )}
      </div>
      <div className="text-[13px] text-muted mt-0.5">Grátis e bem mais rápida; crie a chave em console.groq.com.</div>
      {has && info?.groqPreview && <div className="text-[13px] text-muted mt-2">Chave atual: {info.groqPreview}</div>}
      <div className="flex flex-col sm:flex-row gap-2 mt-3">
        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder={has ? "Nova chave (gsk_…)" : "gsk_…"} type="password" autoComplete="off" />
        <Button onClick={() => void save()} loading={busy} disabled={!key.trim()}>
          Testar e salvar
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => void api.openExternal("https://console.groq.com/keys")}>
          Criar chave na Groq
        </Button>
        {has && (
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => setConfirmRemove(true)}>
            Remover chave
          </Button>
        )}
      </div>
      {has && (
        <>
          {info?.hasNvidia && (
            <div className="mt-4">
              <div className="label">Quem responde primeiro</div>
              <SegmentedControl<"groq" | "nvidia">
                value={info?.primary ?? "groq"}
                onChange={(v) => void choose({ primary: v })}
                options={[
                  { value: "groq", label: "Groq (mais rápida)" },
                  { value: "nvidia", label: "NVIDIA" },
                ]}
              />
              <div className="text-[12px] text-muted mt-1.5">O outro fica de reserva: só entra se o primeiro falhar, e só naquela resposta.</div>
            </div>
          )}
          <div className="label mt-4">Modelo da Groq</div>
          <div className="space-y-2">
            <ChoiceRow
              selected={selected === "auto"}
              saving={pick === "auto"}
              onClick={() => void choose({ groqModel: "auto" })}
              title="Automático"
              sub={`Começa pelo ${groqModels?.[0]?.label ?? "Llama 3.3 70B"} e usa outro só se ele falhar.`}
              badge={<Badge tone="primary">Recomendado</Badge>}
            />
            {(groqModels ?? []).map((m) => (
              <ChoiceRow
                key={m.id}
                selected={selected === m.id}
                saving={pick === m.id}
                onClick={() => void choose({ groqModel: m.id })}
                title={m.label}
                sub={`${m.publisher} · ${m.id}`}
                badge={m.tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              />
            ))}
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={async () => {
          setConfirmRemove(false);
          try {
            await api.ai.setConfig({ groqKey: null });
            onChange();
          } catch (err) {
            toastError(err);
          }
        }}
        title="Remover a chave da Groq?"
        message={info?.hasNvidia ? "O Assistente passa a usar só a NVIDIA, que é mais lenta." : "O Assistente deixará de funcionar até uma nova chave ser configurada."}
        confirmLabel="Remover"
        danger
      />
    </div>
  );
}

function AiSettings() {
  const info = useAsync("ai-info", () => api.ai.info(), { staleMs: 2_000 });
  const catalog = useAsync("ai-catalog", () => api.ai.catalog(), { staleMs: 60_000 });
  const toast = useUi((s) => s.toast);
  const [key, setKey] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Enquanto a configuração carrega, nenhuma opção aparece marcada (nada de "Automático" piscando).
  const selected = pick ?? info.data?.choice;
  useEffect(() => {
    if (pick && info.data?.choice === pick) setPick(null);
  }, [info.data?.choice, pick]);
  const models = catalog.data?.models ?? [];
  const best = models.find((m) => m.id === catalog.data?.best);
  const visible = showAll ? models : models.slice(0, 10);
  if (selected && selected !== "auto" && !visible.some((m) => m.id === selected)) {
    const extra = models.find((m) => m.id === selected);
    if (extra) visible.push(extra);
  }
  const reloadAll = () => {
    info.reload();
    catalog.reload();
  };

  const chooseModel = async (id: string) => {
    if (id === info.data?.choice) return;
    setPick(id);
    try {
      await api.ai.setConfig({ model: id });
      info.reload();
      toast({ title: "Modelo salvo", message: "Fica assim até você trocar.", tone: "success" });
    } catch (err) {
      setPick(null);
      toastError(err);
    }
  };

  const saveKey = async () => {
    if (!key.trim()) return;
    setSaving(true);
    try {
      await api.ai.setConfig({ apiKey: key.trim() });
      setKey("");
      await catalog.reload();
      info.reload();
      toast({ title: "Chave da NVIDIA salva", tone: "success" });
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      if (key.trim()) await api.ai.setConfig({ apiKey: key.trim() });
      setKey("");
      const r = await api.ai.test("nvidia");
      info.reload();
      void catalog.reload();
      toast({ title: "NVIDIA conectada", message: r.slice(0, 120), tone: "success" });
    } catch (err) {
      toastError(err, "Falha ao conectar");
    } finally {
      setTesting(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api.ai.catalog(true);
      await catalog.reload();
      info.reload();
      toast({ title: "Lista de modelos atualizada", tone: "success" });
    } catch (err) {
      toastError(err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 rounded-xl bg-brand flex items-center justify-center shadow-glow shrink-0">
          <BrainCircuit size={22} className="text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-[16px]">Inteligência Artificial</div>
            {info.data?.hasKey ? (
              <Badge tone="success" icon={CircleCheck}>
                Conectada
              </Badge>
            ) : (
              <Badge tone="warning">Não configurada</Badge>
            )}
          </div>
          <p className="text-[13.5px] text-muted mt-1">
            Só você, como Dono, vê esta seção. As chaves ficam guardadas criptografadas e valem para todas as contas do app. Os outros usuários só veem o Assistente funcionando.
          </p>
          {info.data?.hasKey && info.data.modelLabel && <p className="text-[12.5px] text-muted mt-1">Responde agora: {info.data.modelLabel}</p>}
        </div>
      </div>
      <div className="mt-5 space-y-4">
        <GroqSettings info={info.data} groqModels={catalog.data?.groq} onChange={reloadAll} />

        <div className="rounded-2xl border border-line/10 p-4 space-y-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">NVIDIA</span>
              {info.data?.hasNvidia ? (
                <Badge tone="success" icon={CircleCheck}>
                  Conectada {info.data.source === "arquivo" ? "(arquivo config.json)" : info.data.source === "ambiente" ? "(variável de ambiente)" : ""}
                </Badge>
              ) : (
                <Badge>{info.data?.hasGroq ? "Opcional" : "Não configurada"}</Badge>
              )}
            </div>
            <div className="text-[13px] text-muted mt-0.5">Muitos modelos grátis, porém mais lentos.{info.data?.hasGroq ? " Serve de reserva para a Groq." : ""}</div>
          </div>
          <Field label="Chave da API" hint={info.data?.keyPreview ? `Chave atual: ${info.data.keyPreview}` : "Começa com nvapi-"}>
            <PasswordInput icon={KeyRound} value={key} onChange={(e) => setKey(e.target.value)} placeholder={info.data?.hasNvidia ? "Deixe em branco para manter a chave atual" : "nvapi-..."} />
          </Field>

          {info.data?.hasNvidia && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="label !mb-0">Modelo da NVIDIA</div>
                <Button size="sm" variant="ghost" icon={RefreshCw} loading={refreshing} onClick={() => void refresh()}>
                  Atualizar lista
                </Button>
              </div>
              <div className="space-y-2">
                <ChoiceRow
                  selected={selected === "auto"}
                  saving={pick === "auto"}
                  onClick={() => void chooseModel("auto")}
                  title="Automático"
                  sub={best ? `Usa o mais rápido e bom disponível. Agora: ${best.label} (${best.publisher}).` : "Usa o mais rápido e bom disponível para o Investa."}
                  badge={<Badge tone="primary">Recomendado</Badge>}
                />
                {visible.map((m) => (
                  <ChoiceRow
                    key={m.id}
                    selected={selected === m.id}
                    saving={pick === m.id}
                    onClick={() => void chooseModel(m.id)}
                    title={m.label}
                    sub={`${m.publisher} · ${m.id}`}
                    badge={
                      <>
                        {m.id === best?.id && <Badge tone="success">Melhor agora</Badge>}
                        {m.tags.map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                      </>
                    }
                  />
                ))}
              </div>
              {models.length > 10 && (
                <button type="button" className="text-[13px] text-primary font-medium mt-2" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Mostrar só os melhores" : `Mostrar todos os ${models.length} modelos`}
                </button>
              )}
              <div className="text-[12px] text-muted mt-2">
                {catalog.data?.updatedAt ? `Lista da sua conta NVIDIA, atualizada ${relativeTime(catalog.data.updatedAt)}. O app confere de novo todo dia.` : "A lista aparece depois da primeira conexão."} A escolha
                fica salva: se o modelo escolhido falhar, outro responde só naquela vez.
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void saveKey()} loading={saving} disabled={!key.trim()}>
              Salvar chave
            </Button>
            <Button variant="secondary" icon={Sparkles} loading={testing} disabled={!info.data?.hasNvidia && !key.trim()} onClick={() => void test()}>
              Testar conexão
            </Button>
            <Button variant="ghost" icon={ExternalLink} onClick={() => void api.openExternal("https://build.nvidia.com/models")}>
              Ver modelos na NVIDIA
            </Button>
            <Button variant="ghost" icon={ExternalLink} onClick={() => void api.openExternal("https://build.nvidia.com/settings/api-keys")}>
              Gerar chave
            </Button>
            {info.data?.source === "app" && (
              <Button variant="ghost" className="text-danger" onClick={() => setConfirmRemove(true)}>
                Remover chave
              </Button>
            )}
          </div>
        </div>
      </div>
      <SearchSettings info={info.data} onChange={() => info.reload()} />
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={async () => {
          await api.ai.setConfig({ apiKey: null });
          setConfirmRemove(false);
          info.reload();
        }}
        title="Remover a chave da NVIDIA?"
        message={info.data?.hasGroq ? "O Assistente continua com a Groq, mas sem a reserva da NVIDIA." : "O Assistente deixará de funcionar até uma nova chave ser configurada."}
        confirmLabel="Remover"
        danger
      />
    </Card>
  );
}

export function Configuracoes() {
  const user = useSession((s) => s.user)!;
  const profile = useUserData("profile");
  const settings = useUserData("settings");
  const update = useSession((s) => s.update);
  const signOut = useSession((s) => s.signOut);
  const applyTheme = useUi((s) => s.applyTheme);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const appInfo = useAsync("app-info", () => api.appInfo(), { staleMs: 60_000 });
  const [sheet, setSheet] = useState<"perfil" | "financeiro" | "senha" | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const aiRef = useRef<HTMLDivElement>(null);
  const phone = usePhoneLayout();

  useEffect(() => {
    if (params.get("secao") === "ia") setTimeout(() => aiRef.current?.scrollIntoView({ behavior: "smooth" }), 250);
  }, [params]);

  const setSetting = (patch: Partial<UserSettings>) => update("settings", (s) => ({ ...s, ...patch }));

  return (
    <div className="max-w-3xl">
      <PageHeader title="Configurações" />

      <div className="space-y-7">
        <Card className="flex items-center gap-4">
          <Avatar name={user.name} hue={user.avatarHue} size={64} />
          <div className="flex-1 min-w-0">
            <div className="text-[20px] font-semibold truncate">{user.name}</div>
            <div className="text-[14px] text-muted">
              @{user.username}
              {user.email ? ` · ${user.email}` : ""}
            </div>
            <Badge className="mt-1.5" tone={user.role === "dono" ? "warning" : user.role === "adm" ? "primary" : "neutral"}>
              {ROLE_LABEL[user.role]}
            </Badge>
          </div>
          <Button variant="secondary" onClick={() => setSheet("perfil")}>
            Editar
          </Button>
        </Card>

        <Section title="Finanças">
          <ListGroup>
            <ListRow icon={Wallet} iconColor="#34D399" title="Renda mensal" subtitle={<PrivateAmounts text={`${brl(profile.salary)} de salário${profile.extraIncome ? ` + ${brl(profile.extraIncome)} extra` : ""}`} />} right={<Private className="font-semibold tabular">{brl(totalIncome(profile))}</Private>} onClick={() => setSheet("financeiro")} chevron />
            <ListRow icon={PiggyBank} iconColor="#FBBF24" title="Gastos e investimentos" subtitle={<PrivateAmounts text={`Gasta ${brl(totalExpenses(profile))} · investe ${brl(profile.monthlyInvest)} por mês`} />} onClick={() => setSheet("financeiro")} chevron />
            <ListRow icon={UserRound} iconColor="#A78BFA" title="Perfil de investidor" subtitle="Usado pelo Assistente para personalizar sugestões" right={<Badge tone="secondary">{RISK_LABEL[profile.riskProfile]}</Badge>} onClick={() => setSheet("financeiro")} chevron />
          </ListGroup>
        </Section>

        <Section title="Memória do Assistente">
          <MemorySection />
        </Section>

        <Section title="Aparência">
          <Card>
            <div className="flex items-center gap-3 mb-4">
              <Palette size={20} className="text-primary" />
              <div className="font-medium">Tema</div>
            </div>
            <SegmentedControl
              block
              value={settings.theme}
              onChange={(t) => {
                setSetting({ theme: t });
                applyTheme(t);
              }}
              options={[
                { value: "dark", label: "Escuro", icon: Moon },
                { value: "light", label: "Claro", icon: Sun },
                { value: "system", label: "Sistema", icon: Monitor },
              ]}
            />
          </Card>
          <IconPicker />
        </Section>

        {phone && (
          <Section title="Celular">
            <TabBarSettings />
          </Section>
        )}

        <Section title="Segurança">
          <ListGroup>
            <ListRow icon={Lock} iconColor="#4F8CFF" title="Alterar senha" onClick={() => setSheet("senha")} chevron />
          </ListGroup>
        </Section>

        <Section title="Notificações">
          <ListGroup>
            <ToggleRow title="Notificações do Windows" subtitle="Avisos na área de notificações do sistema" checked={settings.desktopNotifications} onChange={(v) => setSetting({ desktopNotifications: v })} />
            <ToggleRow title="Alertas inteligentes da carteira" subtitle="Lucro, prejuízo e preço fora do normal" checked={settings.smartAlerts} onChange={(v) => setSetting({ smartAlerts: v })} />
            <ToggleRow title="Eventos do mercado" subtitle="Copom, IPCA, dólar e Ibovespa" checked={settings.marketEvents} onChange={(v) => setSetting({ marketEvents: v })} />
            <ToggleRow title="Dica do dia" subtitle="Uma dica de educação financeira por dia" checked={settings.dailyTip} onChange={(v) => setSetting({ dailyTip: v })} />
            <ToggleRow title="Resumo semanal" subtitle="Todo domingo: quanto gastou, o que vence e o disponível do mês" checked={settings.weeklySummary !== false} onChange={(v) => setSetting({ weeklySummary: v })} />
            <ToggleRow title="Continuar em segundo plano" subtitle="Ao fechar, fica na bandeja e continua avisando" checked={settings.runInBackground} onChange={(v) => setSetting({ runInBackground: v })} />
          </ListGroup>
          <button className="text-[13px] text-primary font-semibold mt-2 px-1 inline-flex items-center gap-1" onClick={() => navigate("/alertas")}>
            <Bell size={14} /> Gerenciar alertas
          </button>
        </Section>

        {isOwner(user) && (
          <Section title="Inteligência Artificial" id="ia">
            <div ref={aiRef}>
              <AiSettings />
            </div>
          </Section>
        )}

        <Section title="Backup">
          <BackupSection />
        </Section>

        <Section title="Sobre">
          <ListGroup>
            <ListRow icon={Info} iconColor="#94A3B8" title="Versão" right={<span className="text-muted">{appInfo.data?.version ?? "—"}</span>} />
            <ListRow
              icon={Database}
              iconColor="#94A3B8"
              title="Pasta de dados"
              subtitle={<span className="break-all">{appInfo.data?.dataDir ?? "—"}</span>}
            />
          </ListGroup>
          <Card className="mt-3 text-[13px] text-muted space-y-1.5">
            <div className="font-semibold text-fg text-[14px] mb-1">Fontes de dados</div>
            <div>Cotações: Yahoo Finance (B3 com atraso de até 15 minutos; cripto e câmbio em tempo real).</div>
            <div>Selic, CDI, IPCA, dólar PTAX, Boletim Focus e juros de crédito: Banco Central do Brasil (dados abertos oficiais).</div>
            <div>Títulos públicos: Tesouro Direto / Tesouro Transparente.</div>
            <div>Notícias: InfoMoney, Money Times, g1, Exame e CNN Brasil (RSS).</div>
            <div className="pt-2">O Investa é uma ferramenta educacional. Nada aqui é recomendação individual de investimento.</div>
          </Card>
        </Section>

        <Button variant="danger" size="lg" block icon={LogOut} onClick={() => setConfirmOut(true)}>
          Sair da conta
        </Button>
      </div>

      <ProfileSheet open={sheet === "perfil"} onClose={() => setSheet(null)} />
      <FinanceSheet open={sheet === "financeiro"} onClose={() => setSheet(null)} />
      <PasswordSheet open={sheet === "senha"} onClose={() => setSheet(null)} />
      <ConfirmDialog
        open={confirmOut}
        onClose={() => setConfirmOut(false)}
        onConfirm={async () => {
          setConfirmOut(false);
          await signOut();
          navigate("/");
        }}
        title="Sair da conta?"
        message="Você precisará entrar novamente com seu usuário e senha."
        confirmLabel="Sair"
        danger
      />
    </div>
  );
}

function ToggleRow({ title, subtitle, checked, onChange }: { title: string; subtitle: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="flex-1">
        <div className="font-medium text-[15px]">{title}</div>
        <div className="text-[13px] text-muted">{subtitle}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

/** Trocar ícone: escuro ou claro, neste aparelho (janela e barra de tarefas no PC, tela inicial no Android). */
function IconPicker() {
  const current = useIconVariant();
  const toast = useUi((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const pick = async (v: "dark" | "light") => {
    if (v === current || busy) return;
    setBusy(true);
    try {
      await changeIconVariant(v);
      toast({
        title: v === "light" ? "Ícone claro ativado" : "Ícone escuro ativado",
        message: document.documentElement.classList.contains("native-app") ? "O ícone muda na tela inicial quando você sair do app." : undefined,
        tone: "success",
      });
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="mt-3">
      <div className="flex items-center gap-3 mb-1">
        <Sparkles size={20} className="text-primary" />
        <div className="font-medium">Trocar ícone</div>
      </div>
      <div className="text-[13px] text-muted mb-4">O ícone do app neste aparelho.</div>
      <div className="grid grid-cols-2 gap-3">
        {(["dark", "light"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={current === v}
            disabled={busy}
            onClick={() => void pick(v)}
            className={clsx(
              "rounded-2xl p-4 flex flex-col items-center gap-3 border-2 transition-colors",
              current === v ? "border-primary bg-primary/[0.06]" : "border-transparent bg-line/[0.04] hover:bg-line/[0.07]"
            )}
          >
            <AppIcon size={64} variant={v} />
            <span className="text-[14px] font-medium flex items-center gap-1.5">
              {current === v && <CircleCheck size={15} className="text-primary" />}
              {v === "dark" ? "Escuro" : "Claro"}
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
