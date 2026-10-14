import { useEffect, useState } from "react";
import { LOGO_GRADIENT, LOGO_PATHS, LOGO_STOPS } from "@shared/brand";

// Caixa de cada barra no espaço 64×64 da logo (x, y, largura, altura).
const BOXES = [
  [8, 22.6, 14, 36.8],
  [23.9, 16.8, 15, 38.8],
  [39.9, 4.7, 16, 41.1],
] as const;

const FILL_END_MS = 1250;
const EXIT_MS = 320;

function Bar({ i, id }: { i: number; id: string }) {
  const [x, y, w, h] = BOXES[i];
  return (
    <div className="intro-window" style={{ left: `${(x / 64) * 100}%`, top: `${(y / 64) * 100}%`, width: `${(w / 64) * 100}%`, height: `${(h / 64) * 100}%`, animationDelay: `${120 + i * 180}ms` }}>
      <svg className="intro-fill" viewBox={`${x} ${y} ${w} ${h}`} width="100%" height="100%" aria-hidden style={{ animationDelay: `${120 + i * 180}ms` }}>
        <path d={LOGO_PATHS[i]} fill={`url(#${id})`} />
      </svg>
    </div>
  );
}

/**
 * Abertura do app: as três barras da logo enchem de baixo para cima, uma depois
 * da outra; depois a logo some e o app aparece. Só CSS (roda fora da thread
 * principal enquanto o app carrega). Se o app ainda não estiver pronto, a logo
 * fica cheia esperando, sem repetir.
 */
export function Intro({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [filled, setFilled] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    window.dispatchEvent(new Event("investa:intro"));
    const t = setTimeout(() => setFilled(true), reduce ? 450 : FILL_END_MS);
    return () => clearTimeout(t);
  }, [reduce]);

  useEffect(() => {
    if (!filled || !ready || leaving) return;
    setLeaving(true);
    const t = setTimeout(onDone, EXIT_MS);
    return () => clearTimeout(t);
  }, [filled, ready, leaving, onDone]);

  const id = "intro-grad";
  return (
    <div className="intro fixed inset-0 z-[100] bg-bg grid place-items-center" data-leaving={leaving || undefined} aria-label="Abrindo o Investa" role="status">
      <div className="drag fixed inset-x-0 top-0 h-12" />
      <div className="intro-logo relative" style={{ width: 112, height: 112 }}>
        <svg viewBox="0 0 64 64" width="112" height="112" className="absolute inset-0" aria-hidden>
          <defs>
            <linearGradient id={id} {...LOGO_GRADIENT} gradientUnits="userSpaceOnUse">
              {LOGO_STOPS.map((s) => (
                <stop key={s.offset} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>
          {LOGO_PATHS.map((d, i) => (
            <path key={i} d={d} className="intro-track" />
          ))}
        </svg>
        {[0, 1, 2].map((i) => (
          <Bar key={i} i={i} id={id} />
        ))}
      </div>
    </div>
  );
}
