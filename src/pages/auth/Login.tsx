import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, Sparkles, User, CircleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useSession } from "@/store/session";
import { Button } from "@/components/ui/Button";
import { Field, Input, PasswordInput, Toggle } from "@/components/ui/form";
import { AppIcon } from "@/components/Logo";
import { AuthLayout } from "./AuthLayout";

export function ErrorBanner({ message, shakeKey }: { message: string | null; shakeKey: number }) {
  if (!message) return null;
  return (
    <motion.div
      key={shakeKey}
      initial={{ opacity: 0, x: 0 }}
      animate={{ opacity: 1, x: [0, -9, 9, -6, 6, -3, 0] }}
      transition={{ duration: 0.45 }}
      className="flex items-start gap-2.5 rounded-control border border-danger/25 bg-danger/[0.08] px-4 py-3 text-callout text-danger"
      role="alert"
    >
      <CircleAlert size={18} className="shrink-0 mt-0.5" />
      <span className="font-medium">{message}</span>
    </motion.div>
  );
}

export function Login() {
  const signIn = useSession((s) => s.signIn);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<"user" | "password" | null>(null);
  const [shake, setShake] = useState(0);
  const [firstRun, setFirstRun] = useState(false);

  useEffect(() => {
    api
      .appInfo()
      .then((i) => setFirstRun(!i.hasUsers))
      .catch(() => undefined);
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Preencha usuário e senha.");
      setErrorField(!username.trim() ? "user" : "password");
      setShake((s) => s + 1);
      return;
    }
    setLoading(true);
    setError(null);
    setErrorField(null);
    try {
      const user = await api.login({ username, password, remember });
      await signIn(user);
    } catch (err) {
      const code = (err as { code?: string }).code;
      setError((err as Error).message);
      setErrorField(code === "WRONG_PASSWORD" ? "password" : code === "USER_NOT_FOUND" ? "user" : null);
      setShake((s) => s + 1);
      if (code === "WRONG_PASSWORD") setPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}>
        <div className="lg:hidden flex justify-center mb-6">
          <AppIcon size={68} />
        </div>
        <h1 className="text-large-title">Entrar</h1>
        <p className="text-body text-muted mt-1.5">Use seu usuário e senha.</p>

        {firstRun && (
          <div className="mt-5 rounded-card bg-primary/10 border border-primary/20 px-4 py-3 text-footnote flex gap-2.5">
            <Sparkles size={18} className="text-primary shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Primeiro acesso</div>
              <div className="text-muted mt-0.5">
                Ainda não existe nenhuma conta. A primeira conta criada será a conta <strong className="text-fg">Dono</strong> do aplicativo.{" "}
                <Link to="/cadastro" className="pressable inline-block text-primary font-semibold">
                  Criar agora
                </Link>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="mt-7 space-y-4">
          <Field label="Usuário">
            <Input
              icon={User}
              autoFocus
              autoComplete="username"
              placeholder="seu.usuario"
              value={username}
              invalid={errorField === "user"}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label="Senha">
            <PasswordInput
              icon={Lock}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              invalid={errorField === "password"}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <ErrorBanner message={error} shakeKey={shake} />

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-3 text-callout text-muted cursor-pointer select-none">
              <Toggle checked={remember} onChange={setRemember} label="Manter conectado" />
              Manter conectado
            </label>
          </div>

          <Button type="submit" size="lg" block loading={loading}>
            Entrar
          </Button>
        </form>

        <p className="text-center text-callout text-muted mt-6">
          Não tem conta?{" "}
          <Link to="/cadastro" className="pressable inline-block text-primary font-semibold">
            Criar conta
          </Link>
        </p>
        <p className="text-center text-footnote text-muted/70 mt-8">Nomes de usuário não diferenciam maiúsculas de minúsculas. Esqueceu a senha? O Dono ou um Administrador pode redefini-la.</p>
      </motion.div>
    </AuthLayout>
  );
}
