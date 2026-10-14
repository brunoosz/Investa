import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { AtSign, Crown, Lock, Mail, User } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useSession } from "@/store/session";
import { Button } from "@/components/ui/Button";
import { Field, Input, PasswordInput, Toggle } from "@/components/ui/form";
import { AppIcon } from "@/components/Logo";
import { AuthLayout } from "./AuthLayout";
import { ErrorBanner } from "./Login";

function strength(pw: string): { score: number; label: string; color: string } {
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const levels = [
    { label: "Muito fraca", color: "rgb(var(--danger))" },
    { label: "Fraca", color: "rgb(var(--danger))" },
    { label: "Razoável", color: "rgb(var(--warning))" },
    { label: "Boa", color: "rgb(var(--primary))" },
    { label: "Forte", color: "rgb(var(--success))" },
    { label: "Excelente", color: "rgb(var(--success))" },
  ];
  return { score: s, ...levels[s] };
}

export function Register() {
  const signIn = useSession((s) => s.signIn);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [firstRun, setFirstRun] = useState(false);
  const st = useMemo(() => strength(password), [password]);

  useEffect(() => {
    api
      .appInfo()
      .then((i) => setFirstRun(!i.hasUsers))
      .catch(() => undefined);
  }, []);

  const fail = (msg: string, f: string | null) => {
    setError(msg);
    setField(f);
    setShake((s) => s + 1);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return fail("Informe seu nome.", "name");
    if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username.trim())) return fail("O usuário deve ter de 3 a 24 caracteres: letras, números, ponto, hífen ou sublinhado.", "username");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return fail("A senha precisa ter pelo menos 8 caracteres, com letras e números.", "password");
    if (password !== confirm) return fail("As senhas não conferem.", "confirm");
    setLoading(true);
    setError(null);
    setField(null);
    try {
      const user = await api.register({ name, username: username.trim(), password, email: email.trim() || undefined, remember });
      await signIn(user);
    } catch (err) {
      const code = (err as { code?: string }).code;
      fail((err as Error).message, code === "USERNAME_TAKEN" || code === "INVALID_USERNAME" ? "username" : code === "INVALID_EMAIL" ? "email" : code === "WEAK_PASSWORD" ? "password" : null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}>
        <div className="lg:hidden flex justify-center mb-6">
          <AppIcon size={64} />
        </div>
        <h1 className="text-large-title">Criar conta</h1>
        <p className="text-body text-muted mt-1.5">Leva menos de um minuto.</p>

        {firstRun && (
          <div className="mt-5 rounded-card bg-warning/10 border border-warning/25 px-4 py-3 text-footnote flex gap-2.5">
            <Crown size={18} className="text-warning shrink-0 mt-0.5" />
            <div>
              Esta será a conta <strong>Dono</strong> do aplicativo, com controle total sobre usuários e configurações.
            </div>
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-3.5">
          <Field label="Nome completo">
            <Input icon={User} autoFocus placeholder="Como você se chama?" value={name} invalid={field === "name"} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Nome de usuário" hint="Usado para entrar. Não diferencia maiúsculas de minúsculas.">
            <Input icon={AtSign} autoComplete="username" placeholder="ex.: bruno.silva" value={username} invalid={field === "username"} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} />
          </Field>
          <Field label="E-mail (opcional)">
            <Input icon={Mail} type="email" placeholder="voce@email.com" value={email} invalid={field === "email"} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Senha">
            <PasswordInput icon={Lock} autoComplete="new-password" placeholder="8+ caracteres, letras e números" value={password} invalid={field === "password"} onChange={(e) => setPassword(e.target.value)} />
            {password && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 grid grid-cols-5 gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className={clsx("h-1.5 rounded-full transition-colors duration-200", i < st.score ? "" : "bg-separator/15")} style={i < st.score ? { background: st.color } : undefined} />
                  ))}
                </div>
                <span className="text-footnote font-medium" style={{ color: st.color }}>
                  {st.label}
                </span>
              </div>
            )}
          </Field>
          <Field label="Confirmar senha">
            <PasswordInput icon={Lock} autoComplete="new-password" placeholder="Repita a senha" value={confirm} invalid={field === "confirm"} onChange={(e) => setConfirm(e.target.value)} />
          </Field>

          <ErrorBanner message={error} shakeKey={shake} />

          <label className="flex items-center gap-3 text-callout text-muted cursor-pointer select-none pt-1">
            <Toggle checked={remember} onChange={setRemember} label="Manter conectado" />
            Manter conectado
          </label>

          <Button type="submit" size="lg" block loading={loading}>
            Criar conta
          </Button>
        </form>

        <p className="text-center text-callout text-muted mt-6">
          Já tem conta?{" "}
          <Link to="/" className="pressable inline-block text-primary font-semibold">
            Entrar
          </Link>
        </p>
        {!firstRun && <p className="text-center text-footnote text-muted/70 mt-6">Novas contas começam com o cargo Usuário. O Dono pode promover para Administrador.</p>}
      </motion.div>
    </AuthLayout>
  );
}
