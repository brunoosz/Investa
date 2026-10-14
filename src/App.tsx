import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { motion } from "framer-motion";
import { useSession, isManager } from "@/store/session";
import { Intro } from "@/components/Intro";
import { AppLayout } from "@/components/layout/AppLayout";
import { Login } from "@/pages/auth/Login";
import { Register } from "@/pages/auth/Register";
import { Onboarding } from "@/pages/Onboarding";
import { Inicio } from "@/pages/Inicio";
import { Carteira } from "@/pages/Carteira";
import { Mercado } from "@/pages/Mercado";
import { Ativo } from "@/pages/Ativo";
import { Aulas } from "@/pages/Aulas";
import { Aula } from "@/pages/Aula";
import { Assistente } from "@/pages/Assistente";
import { Simulador } from "@/pages/Simulador";
import { Objetivos } from "@/pages/Objetivos";
import { Plano } from "@/pages/Plano";
import { Logs } from "@/pages/Logs";
import { Gastos } from "@/pages/Gastos";
import { Compras } from "@/pages/Compras";
import { ValeAPena } from "@/pages/ValeAPena";
import { Bancos } from "@/pages/Bancos";
import { Alertas } from "@/pages/Alertas";
import { Usuarios } from "@/pages/Usuarios";
import { Configuracoes } from "@/pages/Configuracoes";

function ManagerOnly({ children }: { children: JSX.Element }) {
  const user = useSession((s) => s.user);
  return isManager(user) ? children : <Navigate to="/" replace />;
}

export default function App() {
  const ready = useSession((s) => s.ready);
  const user = useSession((s) => s.user);
  const loaded = useSession((s) => s.loaded);
  const onboarded = useSession((s) => s.data.profile.onboarded);
  const boot = useSession((s) => s.boot);
  const [intro, setIntro] = useState(true);
  const endIntro = useCallback(() => setIntro(false), []);

  useEffect(() => {
    void boot();
  }, [boot]);

  const screen = !ready || (user && !loaded) ? "loading" : !user ? "auth" : !onboarded ? "onboarding" : "app";

  return (
    <>
      {intro && <Intro ready={screen !== "loading"} onDone={endIntro} />}
      <motion.div key={screen} className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: "easeOut" }}>
        {screen === "auth" && (
          <Routes>
            <Route path="/cadastro" element={<Register />} />
            <Route path="*" element={<Login />} />
          </Routes>
        )}
        {screen === "onboarding" && <Onboarding />}
        {screen === "app" && (
          <Routes>
            <Route path="/aula/:lessonId" element={<Aula />} />
            <Route element={<AppLayout />}>
              <Route index element={<Inicio />} />
              <Route path="carteira" element={<Carteira />} />
              <Route path="mercado" element={<Mercado />} />
              <Route path="mercado/:symbol" element={<Ativo />} />
              <Route path="aulas" element={<Aulas />} />
              <Route path="assistente" element={<Assistente />} />
              <Route path="simulador" element={<Simulador />} />
              <Route path="plano" element={<Plano />} />
              <Route path="logs" element={<Logs />} />
              <Route path="objetivos" element={<Objetivos />} />
              <Route path="gastos" element={<Gastos />} />
              <Route path="compras" element={<Compras />} />
              <Route path="vale-a-pena" element={<ValeAPena />} />
              <Route path="bancos" element={<Bancos />} />
              <Route path="alertas" element={<Alertas />} />
              <Route
                path="usuarios"
                element={
                  <ManagerOnly>
                    <Usuarios />
                  </ManagerOnly>
                }
              />
              <Route path="configuracoes" element={<Configuracoes />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        )}
      </motion.div>
    </>
  );
}
