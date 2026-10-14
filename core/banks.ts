import type { BankScore, BanksData, CreditRate, CreditRatesData } from "@shared/types";
import { BANKS, matchBankId } from "@shared/banks";
import { netReturn } from "@shared/finance";
import { cached, getJson, readDiskCache, writeDiskCache } from "./http";
import { getIndicators } from "./bcb";

const TAXAS = "https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata";

const MODALITIES: { key: string; label: string; match: (m: string) => boolean }[] = [
  { key: "cheque", label: "Cheque especial", match: (m) => /cheque especial/i.test(m) },
  { key: "rotativo", label: "Cartão de crédito rotativo", match: (m) => /rotativo/i.test(m) },
  { key: "cartao-parcelado", label: "Parcelamento da fatura do cartão", match: (m) => /cart[aã]o de cr[eé]dito.*parcelado/i.test(m) },
  { key: "pessoal", label: "Empréstimo pessoal", match: (m) => /pessoal n[ãa]o consignado/i.test(m) },
  { key: "consignado", label: "Consignado (INSS)", match: (m) => /consignado inss/i.test(m) },
  { key: "veiculos", label: "Financiamento de veículos", match: (m) => /ve[íi]culos/i.test(m) },
];

interface TaxaRow {
  InicioPeriodo: string;
  FimPeriodo: string;
  Segmento: string;
  Modalidade: string;
  Posicao: number;
  InstituicaoFinanceira: string;
  TaxaJurosAoMes: number;
  TaxaJurosAoAno: number;
}

// Última consulta boa fica em disco: a base do Banco Central é grande e em
// conexões lentas a consulta pode falhar. Nesse caso o app mostra a anterior.
export const CREDIT_CACHE = "cache-credito.json";

const FIELDS = "InicioPeriodo,FimPeriodo,Segmento,Modalidade,Posicao,InstituicaoFinanceira,TaxaJurosAoMes,TaxaJurosAoAno";

async function fetchTaxas(): Promise<TaxaRow[]> {
  const urls = [
    `${TAXAS}/TaxasJurosDiariaPorInicioPeriodo?$top=6000&$orderby=InicioPeriodo%20desc&$select=${FIELDS}&$format=json`,
    `${TAXAS}/TaxasJurosDiariaPorInicioPeriodo?$top=6000&$orderby=InicioPeriodo%20desc&$format=json`,
  ];
  let last: unknown;
  for (const url of urls) {
    try {
      const json = await getJson<{ value: TaxaRow[] }>(url, {}, 90_000);
      if (json.value?.length) return json.value;
    } catch (err) {
      last = err;
    }
  }
  throw last ?? new Error("Taxas de juros do BCB indisponíveis");
}

export async function getCreditRates(): Promise<CreditRatesData> {
  return cached("bcb:credit", 12 * 3600_000, async () => {
    try {
      const data = parseCredit(await fetchTaxas());
      writeDiskCache(CREDIT_CACHE, data);
      return data;
    } catch (err) {
      const stale = readDiskCache<CreditRatesData>(CREDIT_CACHE, Number.POSITIVE_INFINITY);
      if (stale) return stale;
      throw err;
    }
  });
}

function parseCredit(all: TaxaRow[]): CreditRatesData {
  {
    const period = all[0]?.InicioPeriodo;
    if (!period) throw new Error("Taxas de juros do BCB indisponíveis");
    const rows = all.filter((r) => r.InicioPeriodo === period && /f[íi]sica/i.test(r.Segmento));
    const modalities = MODALITIES.map((m) => {
      const rates: CreditRate[] = rows
        .filter((r) => m.match(r.Modalidade) && r.TaxaJurosAoMes > 0)
        .map((r) => ({
          modality: r.Modalidade,
          institution: r.InstituicaoFinanceira,
          bankId: matchBankId(r.InstituicaoFinanceira),
          rateMonth: r.TaxaJurosAoMes,
          rateYear: r.TaxaJurosAoAno,
          position: r.Posicao,
          period: `${r.InicioPeriodo} a ${r.FimPeriodo}`,
        }))
        .sort((a, b) => a.rateMonth - b.rateMonth);
      return { key: m.key, label: m.label, rates };
    }).filter((m) => m.rates.length > 0);
    return { period, modalities, updatedAt: new Date().toISOString() };
  }
}

export async function getBanks(): Promise<BanksData> {
  // Sem as taxas de crédito, o ranking fica em cache só por 2 minutos, para o
  // "Tentar de novo" da aba Juros de crédito buscar de novo.
  const fetched = await getCreditRates().catch(() => null);
  const key = fetched ? "banks" : "banks:sem-credito";
  return cached(key, fetched ? 60 * 60_000 : 2 * 60_000, async () => {
    const ind = await getIndicators().catch(() => undefined);
    const credit = fetched ?? ({ modalities: [], updatedAt: new Date().toISOString() } as CreditRatesData);
    const cdi = ind?.cdi?.value;
    const maxBreadth = Math.max(...BANKS.map((b) => b.invest.length));

    const scores: BankScore[] = BANKS.map((b) => {
      const liquidYield = cdi ? (b.liquidProduct.pctCDI / 100) * cdi : 0;
      const netYield1y = liquidYield ? netReturn(liquidYield, 365, "cdb") : 0;

      const percentiles: { label: string; pct: number; rank: number; total: number }[] = [];
      for (const m of credit.modalities) {
        const idx = m.rates.findIndex((r) => r.bankId === b.id);
        if (idx >= 0) percentiles.push({ label: m.label, pct: 1 - idx / Math.max(1, m.rates.length - 1), rank: idx + 1, total: m.rates.length });
      }
      const creditPercentile = percentiles.length ? percentiles.reduce((s, p) => s + p.pct, 0) / percentiles.length : undefined;

      const investScore = Math.max(0, Math.min(100, ((b.liquidProduct.pctCDI - 85) / 30) * 100));
      const feeScore = b.freeAccount ? 100 : 45;
      const creditScore = creditPercentile !== undefined ? creditPercentile * 100 : 50;
      const breadthScore = (b.invest.length / maxBreadth) * 100;
      const score = Math.round(investScore * 0.4 + feeScore * 0.2 + creditScore * 0.25 + breadthScore * 0.15);

      const reasons: string[] = [];
      if (cdi) {
        reasons.push(
          `${b.liquidProduct.name} rende ${b.liquidProduct.pctCDI}% do CDI: ≈ ${liquidYield.toFixed(2).replace(".", ",")}% ao ano hoje (${netYield1y.toFixed(2).replace(".", ",")}% líquido em 1 ano).`
        );
      } else {
        reasons.push(`${b.liquidProduct.name} rende ${b.liquidProduct.pctCDI}% do CDI.`);
      }
      reasons.push(b.freeAccount ? "Conta sem tarifa de manutenção." : b.feeNote + ".");
      const best = percentiles.filter((p) => p.rank <= Math.max(5, Math.ceil(p.total * 0.25)));
      if (best.length) {
        reasons.push(
          `Juros de crédito entre os menores do país em: ${best.map((p) => `${p.label.toLowerCase()} (${p.rank}º de ${p.total})`).join(", ")} — dados do Banco Central.`
        );
      }
      const worst = percentiles.filter((p) => p.rank > p.total * 0.75);
      if (worst.length) reasons.push(`Atenção: juros altos em ${worst.map((p) => p.label.toLowerCase()).join(", ")} (Banco Central).`);
      reasons.push(`${b.invest.length} tipos de investimento disponíveis.`);
      return { bankId: b.id, score, liquidYield, netYield1y, creditPercentile, reasons };
    }).sort((a, b) => b.score - a.score);

    return { cdi, selic: ind?.selic?.value, scores, credit, updatedAt: new Date().toISOString() };
  });
}
