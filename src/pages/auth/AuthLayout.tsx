import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Bell, ChartLine, GraduationCap, Target } from "lucide-react";
import clsx from "clsx";
import { platform } from "@/lib/api";
import { AppIcon } from "@/components/Logo";
import { Toaster } from "@/components/ui/Toaster";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const FEATURES = [
  { icon: GraduationCap, title: "Educação", text: "Aprenda do zero ao avançado, com aulas e pontos." },
  { icon: ChartLine, title: "Mercado", text: "Acompanhe cotações e indicadores reais." },
  { icon: Target, title: "Planejamento", text: "Defina metas e simule cenários." },
  { icon: Bell, title: "Alertas", text: "Seja avisado sobre o que realmente importa." },
];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-full flex overflow-hidden">
      <div className="hidden lg:flex relative w-[46%] max-w-[640px] flex-col justify-between overflow-hidden bg-bg text-fg p-12" data-theme="dark">
        <div className="drag absolute inset-x-0 top-0 h-12" />
        <svg className="absolute bottom-0 inset-x-0 w-full opacity-60" viewBox="0 0 600 220" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="mtn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "rgb(var(--primary))", stopOpacity: 0.25 }} />
              <stop offset="1" style={{ stopColor: "rgb(var(--bg))", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path d="M0 220 L0 150 L80 110 L140 140 L230 60 L300 120 L360 90 L430 140 L520 70 L600 120 L600 220 Z" fill="url(#mtn)" />
          <path d="M0 220 L0 180 L120 150 L200 175 L310 120 L400 165 L480 135 L600 170 L600 220 Z" className="fill-bg" opacity="0.8" />
        </svg>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE_OUT }} className="relative flex items-center gap-4 mt-6">
          <AppIcon size={64} />
          <div>
            <div className="text-[38px] font-bold tracking-[-0.022em] leading-none">Investa</div>
            <div className="text-caption uppercase tracking-[0.32em] text-muted mt-2">APRENDA · INVISTA · EVOLUA</div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.08, ease: EASE_OUT }} className="relative">
          <div className="text-caption uppercase tracking-[0.2em] text-muted mb-4 border-l-2 border-primary pl-3">NOSSO PROPÓSITO</div>
          <h2 className="text-[34px] leading-[1.15] font-semibold tracking-[-0.022em]">
            Tornar o mundo dos investimentos
            <br />
            <span className="text-primary">mais acessível para todos.</span>
          </h2>
          <p className="text-muted mt-4 max-w-md text-body leading-relaxed">
            Conhecimento é o primeiro passo para a liberdade financeira. O Investa existe para ensinar, orientar e acompanhar você em cada decisão.
          </p>
        </motion.div>

        <div className="relative grid grid-cols-2 gap-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.16 + i * 0.05, ease: EASE_OUT }}
              className="rounded-card bg-fg/[0.04] border border-separator/10 p-4"
            >
              <div className="h-9 w-9 rounded-chip bg-primary/15 text-primary flex items-center justify-center mb-3">
                <f.icon size={18} />
              </div>
              <div className="text-callout font-semibold">{f.title}</div>
              <div className="text-footnote text-muted mt-0.5">{f.text}</div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="flex-1 relative flex flex-col overflow-y-auto">
        <div className={clsx("drag h-12 shrink-0", (platform === "win32" || platform === "linux") && "mr-[150px]")} />
        <div className="flex-1 flex items-center justify-center px-6 pb-12">
          <div className="w-full max-w-[420px] relative">{children}</div>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
