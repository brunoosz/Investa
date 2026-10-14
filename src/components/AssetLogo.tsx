import { useEffect, useState, type ReactNode } from "react";
import { Bean, Beef, ChartLine, Cloud, Coffee, Cuboid, Droplet, Flame, TrendingUp, Wheat, type LucideIcon } from "lucide-react";
import type { AssetCategory } from "@shared/types";
import { US_TO_B3 } from "@shared/assetInfo";

type FlagCode = "br" | "us" | "eu" | "gb" | "jp" | "cn" | "ar" | "ch" | "ca" | "au" | "de" | "hk";

export type LogoSource =
  | { kind: "img"; src: string; plate: boolean }
  | { kind: "flag"; code: FlagCode; index?: boolean }
  | { kind: "glyph"; id: string };

const INDEX_FLAGS: Record<string, FlagCode> = {
  "^BVSP": "br", "IFIX.SA": "br", "^GSPC": "us", "^IXIC": "us", "^DJI": "us", "^NDX": "us", "^RUT": "us",
  "^FTSE": "gb", "^GDAXI": "de", "^N225": "jp", "^HSI": "hk", "000001.SS": "cn", "^STOXX50E": "eu",
};

const CURRENCY_FLAGS: Record<string, FlagCode> = {
  USD: "us", EUR: "eu", GBP: "gb", JPY: "jp", CNY: "cn", ARS: "ar", CHF: "ch", CAD: "ca", AUD: "au", BRL: "br",
};

const brapi = (ticker: string) => `https://icons.brapi.dev/icons/${encodeURIComponent(ticker)}.svg`;

export function logoSource(symbol: string, category: AssetCategory): LogoSource | null {
  switch (category) {
    case "indices":
      return INDEX_FLAGS[symbol] ? { kind: "flag", code: INDEX_FLAGS[symbol], index: true } : { kind: "glyph", id: "index" };
    case "moedas": {
      const base = symbol.slice(0, 3);
      const code = CURRENCY_FLAGS[base === "BRL" ? symbol.slice(3, 6) : base];
      return code ? { kind: "flag", code } : null;
    }
    case "commodities":
      return GLYPHS[symbol] ? { kind: "glyph", id: symbol } : null;
    case "cripto": {
      const coin = symbol.split("-")[0].toLowerCase();
      return /^[a-z0-9]{2,10}$/.test(coin) ? { kind: "img", src: `https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/${coin}.svg`, plate: false } : null;
    }
    case "exterior":
      return /^[A-Z][A-Z.-]{0,6}$/.test(symbol) ? { kind: "img", src: brapi(US_TO_B3[symbol] ?? symbol), plate: true } : null;
    case "acoes":
    case "fiis":
    case "etfs":
    case "bdrs":
      if (!symbol.endsWith(".SA")) return null;
      return { kind: "img", src: brapi(symbol.slice(0, -3).replace(/^([A-Z0-9]{4}\d{1,2})F$/, "$1")), plate: true };
    default:
      return null;
  }
}

// Lembra o que já carregou ou falhou para não piscar nem repetir pedidos na mesma sessão.
const loaded = new Set<string>();
const failed = new Set<string>();
if (typeof window !== "undefined") window.addEventListener("online", () => failed.clear());

export function RemoteLogo({ src, plate, size, fallback }: { src: string; plate: boolean; size: number; fallback: ReactNode }) {
  const initial = () => (failed.has(src) ? "error" : loaded.has(src) ? "ok" : "loading");
  const [state, setState] = useState<"loading" | "ok" | "error">(initial);
  const [instant] = useState(() => loaded.has(src));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setState(initial()), [src]);

  if (state === "error" || (typeof navigator !== "undefined" && navigator.onLine === false && !loaded.has(src))) return <>{fallback}</>;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {state !== "ok" && <div className="absolute inset-0">{fallback}</div>}
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        referrerPolicy="no-referrer"
        onLoad={() => {
          loaded.add(src);
          setState("ok");
        }}
        onError={() => {
          failed.add(src);
          setState("error");
        }}
        className={`absolute inset-0 h-full w-full rounded-full object-cover ${plate ? "bg-white ring-1 ring-black/5" : "ring-1 ring-line/10"} ${instant ? "" : "transition-opacity duration-300"} ${state === "ok" ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

function starPoints(cx: number, cy: number, r: number, rot = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = ((i * 36 - 90 + rot) * Math.PI) / 180;
    const rr = i % 2 ? r * 0.4 : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

function UnionJack({ w = 32, h = 32 }: { w?: number; h?: number }) {
  return (
    <g>
      <rect width={w} height={h} fill="#012169" />
      <path d={`M0,0L${w},${h}M${w},0L0,${h}`} stroke="#fff" strokeWidth={w * 0.19} />
      <path d={`M0,0L${w},${h}M${w},0L0,${h}`} stroke="#C8102E" strokeWidth={w * 0.07} />
      <path d={`M${w / 2},0V${h}M0,${h / 2}H${w}`} stroke="#fff" strokeWidth={w * 0.27} />
      <path d={`M${w / 2},0V${h}M0,${h / 2}H${w}`} stroke="#C8102E" strokeWidth={w * 0.15} />
    </g>
  );
}

const FLAGS: Record<FlagCode, ReactNode> = {
  br: (
    <>
      <rect width="32" height="32" fill="#009C3B" />
      <polygon points="16,4.5 29.5,16 16,27.5 2.5,16" fill="#FFDF00" />
      <circle cx="16" cy="16" r="6.4" fill="#002776" />
      <path d="M9.8,14.6 Q16,12.6 22.2,17.2" stroke="#fff" strokeWidth="1.3" fill="none" />
    </>
  ),
  us: (
    <>
      <rect width="32" height="32" fill="#fff" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect key={i} y={(i * 32) / 13} width="32" height={32 / 13} fill="#B22234" />
      ))}
      <rect width="15" height={(32 / 13) * 7} fill="#3C3B6E" />
      {[0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => <circle key={`${r}${c}`} cx={3.2 + c * 4.3} cy={3.4 + r * 5.4} r="0.95" fill="#fff" />))}
    </>
  ),
  eu: (
    <>
      <rect width="32" height="32" fill="#003399" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        return <polygon key={i} points={starPoints(16 + 8.5 * Math.cos(a), 16 + 8.5 * Math.sin(a), 1.6)} fill="#FFCC00" />;
      })}
    </>
  ),
  gb: <UnionJack />,
  jp: (
    <>
      <rect width="32" height="32" fill="#fff" />
      <circle cx="16" cy="16" r="7.5" fill="#BC002D" />
    </>
  ),
  cn: (
    <>
      <rect width="32" height="32" fill="#DE2910" />
      <polygon points={starPoints(11, 13, 5.5)} fill="#FFDE00" />
      {[
        [18, 7],
        [20.5, 10.5],
        [20.5, 14.5],
        [18, 18],
      ].map(([x, y], i) => (
        <polygon key={i} points={starPoints(x, y, 1.7, 20)} fill="#FFDE00" />
      ))}
    </>
  ),
  ar: (
    <>
      <rect width="32" height="32" fill="#74ACDF" />
      <rect y="10.67" width="32" height="10.67" fill="#fff" />
      <circle cx="16" cy="16" r="3.4" fill="#F6B40E" />
    </>
  ),
  ch: (
    <>
      <rect width="32" height="32" fill="#DA291C" />
      <rect x="13" y="7" width="6" height="18" fill="#fff" />
      <rect x="7" y="13" width="18" height="6" fill="#fff" />
    </>
  ),
  ca: (
    <>
      <rect width="32" height="32" fill="#fff" />
      <rect width="8" height="32" fill="#D52B1E" />
      <rect x="24" width="8" height="32" fill="#D52B1E" />
      <polygon
        points="16,7 17.6,10.2 19.6,9.4 19,13.6 22.4,11.6 23.2,13.4 25,13 23.8,16.4 25,17.2 20.6,20.6 21.2,22.2 16.6,21.6 16.6,25 15.4,25 15.4,21.6 10.8,22.2 11.4,20.6 7,17.2 8.2,16.4 7,13 8.8,13.4 9.6,11.6 13,13.6 12.4,9.4 14.4,10.2"
        fill="#D52B1E"
      />
    </>
  ),
  au: (
    <>
      <rect width="32" height="32" fill="#012169" />
      <svg width="16" height="16" viewBox="0 0 32 32" x="0" y="0">
        <UnionJack />
      </svg>
      <polygon points={starPoints(8, 24, 3.2)} fill="#fff" />
      {[
        [24, 7, 1.6],
        [19.5, 14.5, 1.6],
        [27, 13, 1.6],
        [24, 25, 1.8],
        [24.5, 18, 0.9],
      ].map(([x, y, r], i) => (
        <polygon key={i} points={starPoints(x, y, r)} fill="#fff" />
      ))}
    </>
  ),
  de: (
    <>
      <rect width="32" height="10.67" fill="#000" />
      <rect y="10.67" width="32" height="10.67" fill="#DD0000" />
      <rect y="21.33" width="32" height="10.67" fill="#FFCE00" />
    </>
  ),
  hk: (
    <>
      <rect width="32" height="32" fill="#DE2910" />
      {[0, 72, 144, 216, 288].map((r) => (
        <ellipse key={r} cx="16" cy="11.2" rx="2.9" ry="4.8" fill="#fff" transform={`rotate(${r} 16 16)`} />
      ))}
      <circle cx="16" cy="16" r="1.2" fill="#DE2910" />
    </>
  ),
};

interface Glyph {
  bg: string;
  fg?: string;
  icon?: LucideIcon;
  fill?: boolean;
  bar?: [top: string, front: string, edge: string];
}

const GLYPHS: Record<string, Glyph> = {
  index: { bg: "#6366F1", fg: "#fff", icon: ChartLine },
  "GC=F": { bg: "#FEF3C7", bar: ["#FDE68A", "#F59E0B", "#B45309"] },
  "SI=F": { bg: "#E5E7EB", bar: ["#F8FAFC", "#CBD5E1", "#64748B"] },
  "HG=F": { bg: "#FFEDD5", bar: ["#F4A672", "#B87333", "#7C3F12"] },
  "BZ=F": { bg: "#F59E0B", fg: "#111827", icon: Droplet, fill: true },
  "CL=F": { bg: "#F59E0B", fg: "#111827", icon: Droplet, fill: true },
  "NG=F": { bg: "#2563EB", fg: "#fff", icon: Flame },
  "ZS=F": { bg: "#65A30D", fg: "#fff", icon: Bean },
  "ZC=F": { bg: "#EAB308", fg: "#fff", icon: Wheat },
  "KC=F": { bg: "#78350F", fg: "#fff", icon: Coffee },
  "SB=F": { bg: "#E2E8F0", fg: "#334155", icon: Cuboid },
  "CT=F": { bg: "#16A34A", fg: "#fff", icon: Cloud, fill: true },
  "LE=F": { bg: "#B45309", fg: "#fff", icon: Beef },
};

function Bar({ colors: [top, front, edge] }: { colors: [string, string, string] }) {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full">
      <polygon points="11,10.5 21,10.5 23.8,15 8.2,15" fill={top} stroke={edge} strokeWidth="0.9" strokeLinejoin="round" />
      <polygon points="8.2,15 23.8,15 26.4,22 5.6,22" fill={front} stroke={edge} strokeWidth="0.9" strokeLinejoin="round" />
      <path d="M10.5,18.5 H17" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

export function LocalLogo({ source, size }: { source: Exclude<LogoSource, { kind: "img" }>; size: number }) {
  if (source.kind === "flag") {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <div className="h-full w-full rounded-full overflow-hidden ring-1 ring-black/10">
          <svg viewBox="0 0 32 32" className="block h-full w-full" preserveAspectRatio="xMidYMid slice">
            {FLAGS[source.code]}
          </svg>
        </div>
        {source.index && (
          <span
            className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center text-white"
            style={{ width: size * 0.46, height: size * 0.46, background: "#6366F1", boxShadow: "0 0 0 1.5px rgb(var(--surface))" }}
          >
            <TrendingUp size={size * 0.3} strokeWidth={2.6} />
          </span>
        )}
      </div>
    );
  }
  const g = GLYPHS[source.id];
  const Icon = g.icon;
  return (
    <div className="rounded-full flex items-center justify-center shrink-0 overflow-hidden" style={{ width: size, height: size, background: g.bg, color: g.fg }}>
      {g.bar ? <Bar colors={g.bar} /> : Icon ? <Icon size={size * 0.52} strokeWidth={2} fill={g.fill ? "currentColor" : "none"} /> : null}
    </div>
  );
}
