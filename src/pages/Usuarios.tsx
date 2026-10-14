import { useMemo, useState } from "react";
import { Ban, Copy, Crown, KeyRound, Pencil, Search, ShieldCheck, Trash, User, UserPlus, Users, Wand2 } from "lucide-react";
import clsx from "clsx";
import type { PublicUser, Role, UserStatus } from "@shared/types";
import { ROLE_LABEL } from "@shared/types";
import { api } from "@/lib/api";
import { dateBR, relativeTime } from "@/lib/format";
import { useSession } from "@/store/session";
import { toastError, useUi } from "@/store/ui";
import { useAsync } from "@/hooks/useAsync";
import { Avatar, Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton, toneColor } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Field, Input, PasswordInput, SegmentedControl, Select, Toggle } from "@/components/ui/form";
import { ConfirmDialog, Sheet } from "@/components/ui/Sheet";
import { ErrorBanner } from "@/pages/auth/Login";

type Filter = "todos" | Role;

const ROLE_ICON = { usuario: User, adm: ShieldCheck, dono: Crown };
const ROLE_TONE = { usuario: "neutral", adm: "primary", dono: "warning" } as const;

function randomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const arr = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

function EditUserSheet({ user, me, onClose, onSaved }: { user: PublicUser | null; me: PublicUser; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", username: "", email: "", role: "usuario" as Role, status: "ativo" as UserStatus });
  const [loaded, setLoaded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [saving, setSaving] = useState(false);
  const toast = useUi((s) => s.toast);
  if (user && loaded !== user.id) {
    setLoaded(user.id);
    setForm({ name: user.name, username: user.username, email: user.email ?? "", role: user.role, status: user.status });
    setError(null);
  }
  if (!user && loaded) setLoaded(null);
  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await api.users.update(user.id, {
        name: form.name,
        username: form.username,
        email: form.email,
        role: me.role === "dono" ? form.role : undefined,
        status: user.id === me.id ? undefined : form.status,
      });
      toast({ title: "Usuário atualizado", tone: "success" });
      if (user.id === me.id) {
        const fresh = await api.session();
        if (fresh) useSession.getState().setUser(fresh);
      }
      onSaved();
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
      open={!!user}
      onClose={onClose}
      title="Editar usuário"
      subtitle={user ? `Criado em ${dateBR(user.createdAt)}` : undefined}
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Usuário">
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, "") })} />
          </Field>
          <Field label="E-mail">
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        </div>
        <Field label="Cargo" hint={me.role !== "dono" ? "Apenas o Dono pode mudar cargos." : undefined}>
          <SegmentedControl<Role>
            block
            value={form.role}
            onChange={(r) => me.role === "dono" && setForm({ ...form, role: r })}
            options={[
              { value: "usuario", label: "Usuário", icon: User },
              { value: "adm", label: "Administrador", icon: ShieldCheck },
              { value: "dono", label: "Dono", icon: Crown },
            ]}
          />
        </Field>
        {user && user.id !== me.id && (
          <label className="flex items-center justify-between rounded-card bg-line/[0.04] px-4 py-3">
            <div>
              <div className="font-medium text-callout">Conta ativa</div>
              <div className="text-footnote text-muted">Contas bloqueadas não conseguem entrar.</div>
            </div>
            <Toggle checked={form.status === "ativo"} onChange={(v) => setForm({ ...form, status: v ? "ativo" : "bloqueado" })} />
          </label>
        )}
        <ErrorBanner message={error} shakeKey={shake} />
      </div>
    </Sheet>
  );
}

function PasswordSheet({ user, onClose }: { user: PublicUser | null; onClose: () => void }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [saving, setSaving] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const toast = useUi((s) => s.toast);
  if ((user?.id ?? null) !== lastId) {
    setLastId(user?.id ?? null);
    setPw("");
    setConfirm("");
    setError(null);
  }
  const save = async () => {
    if (!user) return;
    if (pw.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      setShake((s) => s + 1);
      return;
    }
    if (pw !== confirm) {
      setError("As senhas não conferem.");
      setShake((s) => s + 1);
      return;
    }
    setSaving(true);
    try {
      await api.users.resetPassword(user.id, pw);
      toast({ title: "Senha alterada", message: `Informe a nova senha para ${user.name}.`, tone: "success" });
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
      open={!!user}
      onClose={onClose}
      title="Redefinir senha"
      subtitle={user ? `Nova senha para ${user.name} (@${user.username})` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            Alterar senha
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nova senha">
          <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </Field>
        <Field label="Confirmar nova senha">
          <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            icon={Wand2}
            onClick={() => {
              const p = randomPassword();
              setPw(p);
              setConfirm(p);
            }}
          >
            Gerar senha
          </Button>
          {pw && (
            <Button
              size="sm"
              variant="ghost"
              icon={Copy}
              onClick={() => {
                void navigator.clipboard.writeText(pw);
                toast({ title: "Senha copiada", tone: "success" });
              }}
            >
              Copiar
            </Button>
          )}
        </div>
        <ErrorBanner message={error} shakeKey={shake} />
      </div>
    </Sheet>
  );
}

function CreateUserSheet({ open, me, onClose, onSaved }: { open: boolean; me: PublicUser; onClose: () => void; onSaved: () => void }) {
  const empty = { name: "", username: "", email: "", password: "", role: "usuario" as Role };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  const toast = useUi((s) => s.toast);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(empty);
      setError(null);
    }
  }
  const save = async () => {
    setSaving(true);
    try {
      await api.users.create({ ...form, email: form.email || undefined });
      toast({ title: "Usuário criado", message: `${form.name} já pode entrar com @${form.username}.`, tone: "success" });
      onSaved();
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
      title="Novo usuário"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={saving} disabled={!form.name || !form.username || form.password.length < 6}>
            Criar usuário
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome">
          <Input value={form.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Usuário">
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/\s/g, "") })} />
          </Field>
          <Field label="E-mail (opcional)">
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
        </div>
        <Field label="Senha inicial">
          <div className="flex gap-2">
            <div className="flex-1">
              <PasswordInput value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <Button variant="secondary" icon={Wand2} onClick={() => setForm({ ...form, password: randomPassword() })}>
              Gerar
            </Button>
          </div>
        </Field>
        <Field label="Cargo" hint={me.role !== "dono" ? "Administradores só podem criar contas de Usuário." : undefined}>
          <Select value={form.role} disabled={me.role !== "dono"} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="usuario">Usuário</option>
            <option value="adm">Administrador</option>
            <option value="dono">Dono</option>
          </Select>
        </Field>
        <ErrorBanner message={error} shakeKey={shake} />
      </div>
    </Sheet>
  );
}

export function Usuarios() {
  const me = useSession((s) => s.user)!;
  const { data, error, loading, reload } = useAsync("users", () => api.users.list(), { staleMs: 3_000 });
  const toast = useUi((s) => s.toast);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [resetting, setResetting] = useState<PublicUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PublicUser | null>(null);

  const users = data ?? [];
  const counts = useMemo(
    () => ({
      todos: users.length,
      usuario: users.filter((u) => u.role === "usuario").length,
      adm: users.filter((u) => u.role === "adm").length,
      dono: users.filter((u) => u.role === "dono").length,
      bloqueados: users.filter((u) => u.status === "bloqueado").length,
    }),
    [users]
  );
  const list = useMemo(() => {
    const t = query.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return users
      .filter((u) => filter === "todos" || u.role === filter)
      .filter((u) => !t || `${u.name} ${u.username} ${u.email ?? ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(t))
      .sort((a, b) => ({ dono: 0, adm: 1, usuario: 2 })[a.role] - ({ dono: 0, adm: 1, usuario: 2 })[b.role] || a.name.localeCompare(b.name));
  }, [users, query, filter]);

  const canManage = (u: PublicUser) => me.role === "dono" || u.role === "usuario";

  const toggleBlock = async (u: PublicUser) => {
    try {
      await api.users.update(u.id, { status: u.status === "ativo" ? "bloqueado" : "ativo" });
      toast({ title: u.status === "ativo" ? "Usuário bloqueado" : "Usuário desbloqueado", tone: "success" });
      reload();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <div>
      <PageHeader
        title="Usuários"
        subtitle={me.role === "dono" ? "Você é o Dono: controla todas as contas, cargos e senhas." : "Como Administrador, você gerencia as contas de Usuário."}
        actions={
          <Button icon={UserPlus} onClick={() => setCreating(true)}>
            Novo usuário
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Total de contas", value: counts.todos, icon: Users, color: "primary" },
          { label: "Usuários", value: counts.usuario, icon: User, color: "muted" },
          { label: "Administradores", value: counts.adm, icon: ShieldCheck, color: "secondary" },
          { label: "Bloqueados", value: counts.bloqueados, icon: Ban, color: "danger" },
        ].map((s) => (
          <Card key={s.label}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-[10px] flex items-center justify-center" style={{ background: toneColor(s.color, 0.14), color: toneColor(s.color) }}>
                <s.icon size={19} />
              </div>
              <div>
                <div className="text-[22px] font-bold tabular leading-none">{s.value}</div>
                <div className="text-footnote text-muted mt-1">{s.label}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-4 border-b border-separator/10">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input className="field pl-10" placeholder="Pesquisar por nome, usuário ou e-mail" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <SegmentedControl<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "todos", label: `Todos (${counts.todos})` },
              { value: "usuario", label: `Usuários (${counts.usuario})` },
              { value: "adm", label: `Admins (${counts.adm})` },
              { value: "dono", label: `Donos (${counts.dono})` },
            ]}
          />
        </div>

        {loading && !data ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : error && !data ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : list.length === 0 ? (
          <EmptyState icon={Search} title="Nenhum usuário encontrado" description="Tente outro nome ou mude o filtro." />
        ) : (
          <div className="divide-y divide-separator/[0.07]">
            {list.map((u) => {
              const RIcon = ROLE_ICON[u.role];
              const manageable = canManage(u);
              const isMe = u.id === me.id;
              return (
                <div key={u.id} className={clsx("flex flex-wrap items-center gap-3 px-5 py-3.5", u.status === "bloqueado" && "opacity-60")}>
                  <Avatar name={u.name} hue={u.avatarHue} size={42} />
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{u.name}</span>
                      {isMe && <span className="text-[12px] text-primary font-semibold">você</span>}
                      <Badge tone={ROLE_TONE[u.role]} icon={RIcon}>
                        {ROLE_LABEL[u.role]}
                      </Badge>
                      {u.status === "bloqueado" && <Badge tone="danger" icon={Ban}>Bloqueado</Badge>}
                      {!u.onboarded && <Badge>Sem perfil financeiro</Badge>}
                    </div>
                    <div className="text-footnote text-muted">
                      @{u.username}
                      {u.email ? ` · ${u.email}` : ""}
                    </div>
                  </div>
                  <div className="text-footnote text-muted text-right hidden md:block min-w-[150px]">
                    <div>Criado em {dateBR(u.createdAt)}</div>
                    <div>{u.lastLoginAt ? `Último acesso ${relativeTime(u.lastLoginAt)}` : "Nunca entrou"}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon-sm" variant="ghost" icon={Pencil} disabled={!manageable} onClick={() => setEditing(u)} title="Editar" aria-label="Editar" />
                    <Button size="icon-sm" variant="ghost" icon={KeyRound} disabled={!manageable} onClick={() => setResetting(u)} title="Redefinir senha" aria-label="Redefinir senha" />
                    <Button size="icon-sm" variant="ghost" icon={Ban} disabled={!manageable || isMe} onClick={() => void toggleBlock(u)} title={u.status === "ativo" ? "Bloquear" : "Desbloquear"} aria-label="Bloquear" />
                    <Button size="icon-sm" variant="ghost" icon={Trash} disabled={!manageable || isMe} onClick={() => setDeleting(u)} title="Excluir" aria-label="Excluir" className="hover:text-danger" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <EditUserSheet user={editing} me={me} onClose={() => setEditing(null)} onSaved={reload} />
      <PasswordSheet user={resetting} onClose={() => setResetting(null)} />
      <CreateUserSheet open={creating} me={me} onClose={() => setCreating(false)} onSaved={reload} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api.users.remove(deleting.id);
            toast({ title: "Usuário excluído", tone: "success" });
            reload();
          } catch (err) {
            toastError(err);
          }
          setDeleting(null);
        }}
        title={`Excluir ${deleting?.name}?`}
        message="A conta e todos os dados dela (carteira, metas, gastos, progresso) serão apagados. Isso não pode ser desfeito."
        confirmLabel="Excluir conta"
        danger
      />
    </div>
  );
}
