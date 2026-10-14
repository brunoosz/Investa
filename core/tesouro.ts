import type { TesouroData, TesouroTitle } from "@shared/types";
import { cached, fetchWithTimeout, getJson, readDiskCache, writeDiskCache } from "./http";

const TD_JSON = "https://www.tesourodireto.com.br/json/br/com/b3/tesourodireto/service/api/treasurybondsinfo.json";
const TD_CSV =
  "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv";

function indexerFromName(name: string): TesouroTitle["indexer"] {
  const n = name.toUpperCase();
  if (n.includes("SELIC")) return "SELIC";
  if (n.includes("IGPM") || n.includes("IGP-M")) return "IGPM";
  if (n.includes("IPCA") || n.includes("RENDA+") || n.includes("EDUCA+")) return "IPCA";
  if (n.includes("PREFIXADO")) return "PRE";
  return "OUTRO";
}

function kindFromName(name: string): string {
  const n = name.replace(/\s+\d{4}$/, "").trim();
  return n;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fromOfficialJson(): Promise<TesouroData> {
  const json: any = await getJson(TD_JSON, { headers: { Referer: "https://www.tesourodireto.com.br/" } }, 15_000);
  const list: any[] = json?.response?.TrsrBdTradgList ?? [];
  if (!list.length) throw new Error("Tesouro Direto sem títulos");
  const titles: TesouroTitle[] = list.map(({ TrsrBd: t }) => ({
    name: t.nm,
    kind: kindFromName(t.nm),
    maturity: String(t.mtrtyDt).slice(0, 10),
    buyRate: t.anulInvstmtRate > 0 ? t.anulInvstmtRate : undefined,
    sellRate: t.anulRedRate > 0 ? t.anulRedRate : undefined,
    unitPrice: t.untrInvstmtVal > 0 ? t.untrInvstmtVal : undefined,
    minInvestment: t.minInvstmtAmt > 0 ? t.minInvstmtAmt : undefined,
    sellPrice: t.untrRedVal > 0 ? t.untrRedVal : undefined,
    indexer: indexerFromName(t.nm),
    canBuy: t.anulInvstmtRate > 0 && t.untrInvstmtVal > 0,
  }));
  return { titles: sortTitles(titles), updatedAt: json?.response?.TrsrBondMkt?.qtnDtTm ?? new Date().toISOString(), source: "Tesouro Direto (oficial)" };
}

function parseBrNumber(v: string): number {
  return parseFloat(v.replace(/\./g, "").replace(",", "."));
}

/** Fallback: base pública do Tesouro Transparente (atualizada diariamente). Mantém apenas a data mais recente. */
async function fromTransparencyCsv(): Promise<TesouroData> {
  const res = await fetchWithTimeout(TD_CSV, {}, 60_000);
  if (!res.ok || !res.body) throw new Error(`Tesouro Transparente HTTP ${res.status}`);
  const decoder = new TextDecoder("latin1");
  let buffer = "";
  let header: string[] | null = null;
  let latestKey = "";
  let latestRows: string[][] = [];
  const reader = res.body.getReader();
  const handle = (line: string) => {
    if (!line.trim()) return;
    const cols = line.split(";");
    if (!header) {
      header = cols.map((c) => c.trim());
      return;
    }
    const base = cols[2];
    if (!base) return;
    const [d, m, y] = base.split("/");
    const key = `${y}-${m}-${d}`;
    if (key > latestKey) {
      latestKey = key;
      latestRows = [cols];
    } else if (key === latestKey) {
      latestRows.push(cols);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      handle(buffer.slice(0, idx).replace(/\r$/, ""));
      buffer = buffer.slice(idx + 1);
    }
  }
  handle(buffer);
  if (!latestRows.length) throw new Error("Tesouro Transparente sem dados");
  const titles: TesouroTitle[] = latestRows.map((c) => {
    const [d, m, y] = c[1].split("/");
    const type = c[0].trim();
    const name = `${type} ${y}`;
    const buyRate = parseBrNumber(c[3]);
    const unitPrice = parseBrNumber(c[5]);
    return {
      name,
      kind: type,
      maturity: `${y}-${m}-${d}`,
      buyRate: buyRate > 0 ? buyRate : undefined,
      sellRate: parseBrNumber(c[4]) || undefined,
      unitPrice: unitPrice > 0 ? unitPrice : undefined,
      sellPrice: parseBrNumber(c[6]) || undefined,
      indexer: indexerFromName(type),
      canBuy: buyRate > 0 && unitPrice > 0,
    };
  });
  return { titles: sortTitles(titles), updatedAt: latestKey, source: "Tesouro Transparente (oficial)" };
}

function sortTitles(titles: TesouroTitle[]): TesouroTitle[] {
  const order: Record<TesouroTitle["indexer"], number> = { SELIC: 0, PRE: 1, IPCA: 2, IGPM: 3, OUTRO: 4 };
  return titles.sort((a, b) => order[a.indexer] - order[b.indexer] || a.maturity.localeCompare(b.maturity));
}

const CACHE = "cache-tesouro.json";

export async function getTesouro(): Promise<TesouroData> {
  return cached("tesouro", 60 * 60_000, async () => {
    // A base oficial completa tem vários MB e muda uma vez por dia.
    const fresh = readDiskCache<TesouroData>(CACHE, 4 * 3600_000);
    if (fresh) return fresh;
    try {
      let data: TesouroData;
      try {
        data = await fromOfficialJson();
      } catch {
        data = await fromTransparencyCsv();
      }
      writeDiskCache(CACHE, data);
      return data;
    } catch (err) {
      const stale = readDiskCache<TesouroData>(CACHE, Number.POSITIVE_INFINITY);
      if (stale) return stale;
      throw err;
    }
  });
}

export function formatTesouroRate(t: TesouroTitle): string {
  if (t.buyRate === undefined) return "—";
  const r = t.buyRate.toFixed(2).replace(".", ",");
  if (t.indexer === "SELIC") return `Selic + ${t.buyRate.toFixed(4).replace(".", ",")}%`;
  if (t.indexer === "IPCA") return `IPCA + ${r}%`;
  if (t.indexer === "IGPM") return `IGP-M + ${r}%`;
  return `${r}% a.a.`;
}
