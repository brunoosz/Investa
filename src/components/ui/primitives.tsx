import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Loader2, type LucideIcon } from "lucide-react";
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
        clickable && "cursor-pointer transition duration-200 hover:border-line/20 hover:-translate-y-0.5 active:translate-y-0",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
      <div className="min-w-0">
        {eyebrow && <div className="text-[13px] font-medium text-muted mb-1">{eyebrow}</div>}
        <h1 className="text-[28px] md:text-[34px] leading-tight font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted mt-1.5 text-[15px] max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-[13px] text-muted mt-0.5">{subtitle}</p>}
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
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap", BADGE[tone], className)}>
      {Icon && <Icon size={12} strokeWidth={2.5} />}
      {children}
    </span>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={clsx("skeleton rounded-xl", className)} style={style} />;
}

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={clsx("animate-spin text-muted", className)} />;
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col items-center justify-center text-center py-12 px-6", className)}>
      <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-4">
        <Icon size={26} strokeWidth={1.8} />
      </div>
      <h3 className="font-semibold text-[16px]">{title}</h3>
      {description && <p className="text-muted text-[14px] mt-1.5 max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-[14px] text-danger flex items-center justify-between gap-3">
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

export function IconTile({ icon: Icon, color = "#4F8CFF", size = 36, className }: { icon: LucideIcon; color?: string; size?: number; className?: string }) {
  return (
    <div className={clsx("rounded-xl flex items-center justify-center shrink-0", className)} style={{ width: size, height: size, background: `${color}22`, color }}>
      <Icon size={size * 0.5} strokeWidth={2} />
    </div>
  );
}

export function ListGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("surface overflow-hidden divide-y divide-line/10", className)}>{children}</div>;
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
      className={clsx("flex items-center gap-3.5 px-4 py-3.5 min-h-[56px]", onClick && "cursor-pointer hover:bg-line/[0.04] active:bg-line/[0.07] transition", className)}
    >
      {icon && <IconTile icon={icon} color={iconColor} size={34} />}
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-medium truncate">{title}</div>
        {subtitle && <div className="text-[13px] text-muted mt-0.5">{subtitle}</div>}
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
      <div className="text-[13px] text-muted">{label}</div>
      <div className="text-[22px] font-semibold tracking-tight tabular mt-0.5">{value}</div>
      {sub && <div className="text-[13px] mt-0.5">{sub}</div>}
    </div>
  );
}

// Anima do valor mostrado até o novo valor. Se o valor mudar no meio da
// animação (por exemplo, quando chegam as últimas cotações), recomeça de onde
// parou e termina sempre exatamente no valor atual.
export function AnimatedNumber({ value, format, className, private: priv }: { value: number; format: (n: number) => string; className?: string; private?: boolean }) {
  const [display, setDisplay] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    const started = performance.now();
    const duration = 700;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const next = t >= 1 ? value : from + (value - from) * (1 - Math.pow(1 - t, 3));
      current.current = next;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    // Garante o valor final mesmo se o navegador pausar os quadros (janela em
    // segundo plano, por exemplo).
    const done = setTimeout(() => {
      cancelAnimationFrame(frame);
      current.current = value;
      setDisplay(value);
    }, duration + 150);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(done);
    };
  }, [value]);
  return (
    <span className={clsx("tabular", className)} data-private={priv ? "" : undefined}>
      {format(display)}
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
