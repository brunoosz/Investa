import type { Quote } from "@shared/types";

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function brl(value: number | undefined | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return "—";
  return brlFmt.format(value);
}

export function brlCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `R$ ${(value / 1e12).toFixed(2).replace(".", ",")} tri`;
  if (abs >= 1e9) return `R$ ${(value / 1e9).toFixed(2).replace(".", ",")} bi`;
  if (abs >= 1e6) return `R$ ${(value / 1e6).toFixed(2).replace(".", ",")} mi`;
  if (abs >= 1e4) return `R$ ${(value / 1e3).toFixed(1).replace(".", ",")} mil`;
  return brl(value);
}

export function money(value: number | undefined, currency = "BRL"): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  if (currency === "BRL") return brl(value);
  const digits = Math.abs(value) < 1 ? 4 : 2;
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  } catch {
    return `${currency} ${num(value, digits)}`;
  }
}

export function isIndex(symbol: string): boolean {
  return symbol.startsWith("^") || symbol === "IFIX.SA" || symbol === "000001.SS";
}

export function quotePrice(q: Pick<Quote, "symbol" | "price" | "currency">): string {
  if (isIndex(q.symbol)) return `${num(q.price, 0)} pts`;
  if (q.symbol.endsWith("=X")) return `R$ ${num(q.price, 4)}`;
  return money(q.price, q.currency);
}

export function num(value: number | undefined, digits = 2): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function compact(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1).replace(".", ",")} bi`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1).replace(".", ",")} mi`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1).replace(".", ",")} mil`;
  return value.toFixed(0);
}

export function pct(value: number | undefined, digits = 2, sign = true): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  const s = sign && value > 0 ? "+" : "";
  return `${s}${value.toFixed(digits).replace(".", ",")}%`;
}

export function dateBR(iso: string | number | Date, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = iso instanceof Date ? iso : new Date(typeof iso === "string" && iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", opts);
}

export function timeBR(iso: string | number | Date): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(iso: string | number): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 45) return "agora";
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  return dateBR(iso, { day: "2-digit", month: "short" });
}

export function toneClass(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || Math.abs(value) < 0.005) return "text-muted";
  return value > 0 ? "text-success" : "text-danger";
}

export function parseMoney(input: string): number {
  const clean = input.replace(/[^\d,.-]/g, "");
  if (!clean) return 0;
  if (clean.includes(",")) return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
  return parseFloat(clean) || 0;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
