import { useId, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";

export function Sparkline({ data, width = 96, height = 32, positive, className }: { data: number[]; width?: number; height?: number; positive?: boolean; className?: string }) {
  const id = useId().replace(/:/g, "");
  if (data.length < 2) return <div style={{ width, height }} className={className} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 2 - ((v - min) / range) * (height - 4)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const up = positive ?? data[data.length - 1] >= data[0];
  const color = up ? "rgb(var(--success))" : "rgb(var(--danger))";
  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#sp-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function Donut({ data, size = 180, thickness = 22, center, onHover }: { data: DonutSlice[]; size?: number; thickness?: number; center?: ReactNode; onHover?: (s: DonutSlice | null) => void }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const [hover, setHover] = useState<number | null>(null);
  const arcs = useMemo(() => {
    let acc = 0;
    return data
      .filter((d) => d.value > 0)
      .map((d) => {
        const frac = total ? d.value / total : 0;
        const gap = data.length > 1 ? Math.min(0.006, frac / 4) : 0;
        const arc = { d, start: acc + gap, frac: Math.max(0, frac - gap * 2) };
        acc += frac;
        return arc;
      });
  }, [data, total]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line) / 0.1)" strokeWidth={thickness} />
        {arcs.map((a, i) => (
          <motion.circle
            key={a.d.label}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={a.d.color}
            strokeWidth={hover === i ? thickness + 4 : thickness}
            strokeLinecap="butt"
            strokeDasharray={`${a.frac * c} ${c}`}
            initial={{ strokeDashoffset: c, opacity: 0 }}
            animate={{ strokeDashoffset: -a.start * c, opacity: hover === null || hover === i ? 1 : 0.45 }}
            transition={{ type: "spring", stiffness: 70, damping: 18, delay: i * 0.05 }}
            onMouseEnter={() => {
              setHover(i);
              onHover?.(a.d);
            }}
            onMouseLeave={() => {
              setHover(null);
              onHover?.(null);
            }}
            style={{ cursor: "pointer" }}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center pointer-events-none">{center}</div>
    </div>
  );
}

export function Legend({ data, format, private: priv }: { data: DonutSlice[]; format: (v: number) => string; private?: boolean }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col gap-2 min-w-0">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2.5 text-footnote">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
          <span className="truncate flex-1">{d.label}</span>
          <span className="text-muted tabular">{total ? ((d.value / total) * 100).toFixed(1).replace(".", ",") : 0}%</span>
          <span className="font-semibold tabular w-[96px] text-right" data-private={priv ? "" : undefined}>
            {format(d.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function BarList({
  data,
  format,
  max: maxProp,
  private: priv,
}: {
  data: { label: ReactNode; value: number; color?: string; key: string }[];
  format: (v: number) => string;
  max?: number;
  private?: boolean;
}) {
  const max = maxProp ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={d.key}>
          <div className="flex items-center justify-between text-footnote mb-1.5">
            <span className="truncate">{d.label}</span>
            <span className="font-semibold tabular" data-private={priv ? "" : undefined}>
              {format(d.value)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-line/10 overflow-hidden">
            <motion.div
              className={clsx("h-full rounded-full")}
              style={{ background: d.color ?? "linear-gradient(90deg, rgb(var(--primary)), rgb(var(--secondary)))" }}
              initial={{ width: 0 }}
              animate={{ width: `${(d.value / max) * 100}%` }}
              transition={{ type: "spring", stiffness: 80, damping: 18, delay: i * 0.04 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export const PALETTE = Array.from({ length: 11 }, (_, i) => `rgb(var(--chart-${i + 1}))`);
