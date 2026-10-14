import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ChevronRight, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { initials } from "@/lib/format";

export function Card({
  children,
  className,
  onClick,
  padded = true,
  interactive,
  style,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  padded?: boolean;
  interactive?: boolean;
  style?: CSSProperties;
}) {
  const clickable = interactive ?? !!onClick;
  return (
    <div
      onClick={onClick}
      style={style}
      className={clsx(
        "surface relative",
        padded && "p-5",
        clickable && "cursor-pointer pressable hover:border-separator/20",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  // Cabeçalho que encolhe: quando o título grande sai da tela, um título pequeno fica fixo no topo.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = titleRef.current;
    const root = el?.closest("main");
    if (!el || !root || typeof IntersectionObserver !== "function") return;
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <>
      <div className="sticky top-0 z-30 h-0" aria-hidden={!compact}>
        <div
          className={clsx(
            "absolute inset-x-0 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 h-11 flex items-center bg-bg border-b border-line/12 transition-[opacity,transform] duration-200 ease-out-strong",
            compact ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 pointer-events-none"
          )}
        >
          <span className="text-headline font-extrabold tracking-[-0.02em] truncate">{title}</span>
        </div>
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
        <div className="min-w-0">
          {eyebrow && <div className="text-footnote font-medium text-muted mb-1">{eyebrow}</div>}
          <h1 ref={titleRef} className="text-large-title md:text-[38px]">{title}</h1>
          {subtitle && <p className="text-muted mt-2 text-body max-w-2xl">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </>
  );
}

/** As três barras da logo em tamanho pequeno: marca das seções e indicador de carregamento. */
export function ThreeBars({ size = 14, loading, className }: { size?: number; loading?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden className={clsx("shrink-0", loading && "three-bars-loading", className)} fill="currentColor">
      <path d="M1 13.2V7.6l3.4-2v6.6z" />
      <path d="M5.3 12V4.4l3.4-2V10z" />
      <path d="M9.6 10.8V1.6L13 0v8.8z" />
    </svg>
  );
}

export function SectionTitle({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div>
        <h2 className="text-title flex items-center gap-2">
          <ThreeBars size={13} className="text-primary" />
          {title}
        </h2>
        {subtitle && <p className="text-footnote text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "primary" | "success" | "danger" | "warning" | "secondary";
const BADGE: Record<Tone, string> = {
  neutral: "bg-line/10 text-muted",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  danger: "bg-danger/10 text-danger",
  warning: "bg-warning/10 text-warning",
  secondary: "bg-secondary/10 text-secondary",
};

export function Badge({ children, tone = "neutral", className, icon: Icon }: { children: ReactNode; tone?: Tone; className?: string; icon?: LucideIcon }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] leading-[1.35] font-semibold tracking-[0.01em] whitespace-nowrap", BADGE[tone], className)}>
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      {children}
    </span>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={clsx("skeleton rounded-control", className)} style={style} />;
}

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span role="status" aria-label="Carregando" className={clsx("inline-flex text-muted", className)}>
      <ThreeBars size={size} loading />
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center text-center py-12 px-6", className)}>
      <div className="h-14 w-14 rounded-card bg-primary/10 text-primary flex items-center justify-center mb-4">
        <Icon size={26} strokeWidth={1.8} />
      </div>
      <h3 className="text-headline">{title}</h3>
      {description && <p className="text-muted text-callout mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-card border border-danger/20 bg-danger/5 px-4 py-3 text-callout text-danger flex items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-semibold underline underline-offset-2 shrink-0">
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function Avatar({ name, hue = 220, size = 36, className }: { name: string; hue?: number; size?: number; className?: string }) {
  return (
    <div
      className={clsx("rounded-full flex items-center justify-center font-semibold text-white shrink-0 select-none", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, hsl(${hue} 85% 62%), hsl(${(hue + 45) % 360} 75% 55%))`,
      }}
    >
      {initials(name) || "?"}
    </div>
  );
}

export function ProgressBar({ value, className, color, height = 8 }: { value: number; className?: string; color?: string; height?: number }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={clsx("w-full rounded-full bg-line/10 overflow-hidden", className)} style={{ height }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color ?? "linear-gradient(90deg, rgb(var(--primary)), rgb(var(--secondary)))" }}
        initial={{ width: 0 }}
        animate={{ width: `${v * 100}%` }}
        transition={{ type: "spring", stiffness: 90, damping: 20 }}
      />
    </div>
  );
}

export function ProgressRing({ value, size = 64, stroke = 7, children, color }: { value: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  const id = `ring-${size}-${stroke}`;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={color ?? "rgb(var(--primary))"} />
            <stop offset="1" stopColor={color ?? "rgb(var(--secondary))"} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line) / 0.12)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - v) }}
          transition={{ type: "spring", stiffness: 60, damping: 18 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/** Cor de token ("primary", "success", "cat-casa"…) ou, para dados como a cor de um banco, um hex. */
export function toneColor(color: string, alpha = 1): string {
  if (color.startsWith("#") || color.startsWith("rgb") || color.startsWith("hsl")) return alpha === 1 ? color : `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
  return alpha === 1 ? `rgb(var(--${color}))` : `rgb(var(--${color}) / ${alpha})`;
}

export function IconTile({ icon: Icon, color = "primary", size = 36, className }: { icon: LucideIcon; color?: string; size?: number; className?: string }) {
  return (
    <div className={clsx("rounded-[10px] flex items-center justify-center shrink-0", className)} style={{ width: size, height: size, background: toneColor(color, 0.14), color: toneColor(color) }}>
      <Icon size={size * 0.5} strokeWidth={2} />
    </div>
  );
}

export function ListGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("surface overflow-hidden divide-y divide-separator/10", className)}>{children}</div>;
}

export function ListRow({
  icon,
  iconColor,
  title,
  subtitle,
  right,
  onClick,
  chevron,
  className,
}: {
  icon?: LucideIcon;
  iconColor?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  className?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={clsx("flex items-center gap-3.5 px-4 py-3.5 min-h-[56px]", onClick && "cursor-pointer hover:bg-line/[0.04] active:bg-line/[0.07] transition-colors", className)}
    >
      {icon && <IconTile icon={icon} color={iconColor} size={34} />}
      <div className="flex-1 min-w-0">
        <div className="text-body font-medium truncate">{title}</div>
        {subtitle && <div className="text-footnote text-muted mt-0.5">{subtitle}</div>}
      </div>
      {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
      {chevron && <ChevronRight size={18} className="text-muted/60 shrink-0" />}
    </div>
  );
}

/** Valor pessoal (saldo, renda, gastos, carteira): fica borrado no modo privacidade. */
export function Private({ children, className, block }: { children: ReactNode; className?: string; block?: boolean }) {
  const Tag = block ? "div" : "span";
  return (
    <Tag data-private="" className={className}>
      {children}
    </Tag>
  );
}

const AMOUNT = /((?:R\$|US\$|€)\s?[-−+]?\s?\d+(?:\.\d{3})*(?:,\d+)?)/;

/** Texto pronto (ex.: notificação da semana) com valores pessoais: borra só os valores em dinheiro. */
export function PrivateAmounts({ text }: { text: string }) {
  return <>{text.split(AMOUNT).map((part, i) => (i % 2 ? <Private key={i}>{part}</Private> : part))}</>;
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-footnote text-muted">{label}</div>
      <div className="text-[22px] font-semibold tracking-[-0.02em] tabular mt-0.5">{value}</div>
      {sub && <div className="text-footnote mt-0.5">{sub}</div>}
    </div>
  );
}

// Anima do valor mostrado até o novo valor. Se o valor mudar no meio da
// animação (por exemplo, quando chegam as últimas cotações), recomeça de onde
// parou e termina sempre exatamente no valor atual.
export function AnimatedNumber({ value, format, className, private: priv }: { value: number; format: (n: number) => string; className?: string; private?: boolean }) {
  // Conta até o valor (escrevendo direto no texto, sem re-renderizar a cada quadro).
  // Na primeira vez sai do zero; depois, do valor anterior. Some com "reduzir movimento".
  const ref = useRef<HTMLSpanElement>(null);
  const current = useRef<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = current.current ?? 0;
    current.current = value;
    if (!el || reduce || from === value || !Number.isFinite(value)) {
      if (el) el.textContent = format(value);
      return;
    }
    const started = performance.now();
    const duration = 650;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      el.textContent = format(t >= 1 ? value : from + (value - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    // Valor final garantido mesmo se o navegador pausar os quadros.
    const done = setTimeout(() => {
      cancelAnimationFrame(frame);
      el.textContent = format(value);
    }, duration + 150);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(done);
      el.textContent = format(value);
    };
  }, [value, format]);
  return (
    <span ref={ref} className={clsx("tabular", className)} data-private={priv ? "" : undefined}>
      {format(value)}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={clsx("relative inline-flex h-2 w-2", className)}>
      <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
    </span>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={clsx("h-px bg-line/10", className)} />;
}
