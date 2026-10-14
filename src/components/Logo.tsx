import { useId } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { ICON_BG, LOGO_GRADIENT, LOGO_PATHS, LOGO_STOPS, type IconVariant } from "@shared/brand";
import { useIconVariant } from "@/lib/appIcon";

export function LogoMark({ size = 32, animated = false, className }: { size?: number; animated?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={`lg-${id}`} {...LOGO_GRADIENT} gradientUnits="userSpaceOnUse">
          {LOGO_STOPS.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      {LOGO_PATHS.map((d, i) =>
        animated ? (
          <motion.path
            key={i}
            d={d}
            fill={`url(#lg-${id})`}
            style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ delay: 0.12 * i, type: "spring", stiffness: 160, damping: 16 }}
          />
        ) : (
          <path key={i} d={d} fill={`url(#lg-${id})`} />
        )
      )}
    </svg>
  );
}

export function Logo({ size = 32, showTagline = false, className, textClassName }: { size?: number; showTagline?: boolean; className?: string; textClassName?: string }) {
  return (
    <div className={clsx("flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <div className="leading-none">
        <div className={clsx("font-bold tracking-tight", textClassName)} style={{ fontSize: size * 0.72 }}>
          Investa
        </div>
        {showTagline && <div className="text-[9px] tracking-[0.28em] text-muted mt-1.5 font-medium">APRENDA · INVISTA · EVOLUA</div>}
      </div>
    </div>
  );
}

export function AppIcon({ size = 64, variant, animated = false }: { size?: number; variant?: IconVariant; animated?: boolean }) {
  const chosen = useIconVariant();
  const v = variant ?? chosen;
  const bg = ICON_BG[v];
  const light = v === "light";
  return (
    <div
      className="flex items-center justify-center shadow-2xl"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.23,
        background: `radial-gradient(circle at 50% 50%, rgba(79,140,255,${light ? 0.1 : 0.26}), transparent 62%), linear-gradient(135deg, ${bg[0]}, ${bg[1]} 55%, ${bg[2]})`,
        boxShadow: light
          ? "inset 0 0 0 1px rgba(11,15,26,0.06), 0 20px 50px -12px rgba(79,140,255,0.35)"
          : "inset 0 1px 0 rgba(255,255,255,0.12), 0 20px 50px -12px rgba(79,140,255,0.45)",
      }}
    >
      <LogoMark size={size * 0.72} animated={animated} />
    </div>
  );
}
