import type { AssetCategory } from "./types";
import { catalogAsset, displaySymbol } from "./catalog";

const OUNCE_G = 31.1034768;
const POUND_KG = 0.45359237;
const BARREL_L = 158.987;

export interface Conversion {
  label: string;
  /** Multiplica o preço (na moeda original) já convertido para reais. */
  factor: number;
}

export interface AssetExplainer {
  what: string;
  price: string;
  /** Texto curto que vai ao lado do preço, como "por onça troy (31,1 g)". */
  unit?: string;
  conversions?: Conversion[];
  tips: string[];
}

interface CommoditySpec {
  what: string;
  unit: string;
  market: string;
  conversions?: Conversion[];
  tip?: string;
}

const PER_GRAM: Conversion[] = [{ label: "por onça", factor: 1 }, { label: "por grama", factor: 1 / OUNCE_G }];
const PER_LITER: Conversion[] = [{ label: "por barril", factor: 1 }, { label: "por litro", factor: 1 / BARREL_L }];
const PER_KG: Conversion[] = [{ label: "por quilo", factor: 1 / POUND_KG }];

const COMMODITIES: Record<string, CommoditySpec> = {
  "GC=F": {
    what: "Ouro, o metal precioso. Muita gente compra como proteção em crises e contra a alta do dólar.",
    unit: "onça troy (31,1 g)",
    market: "COMEX, em Nova York",
    conversions: PER_GRAM,
    tip: "Na B3, dá para investir em ouro pelo ETF GOLD11, em reais.",
  },
  "SI=F": {
    what: "Prata, metal precioso muito usado também na indústria (eletrônicos e painéis solares).",
    unit: "onça troy (31,1 g)",
    market: "COMEX, em Nova York",
    conversions: PER_GRAM,
  },
  "BZ=F": {
    what: "Petróleo Brent, do Mar do Norte. É a referência para o preço da Petrobras e dos combustíveis no Brasil.",
    unit: "barril (159 litros)",
    market: "ICE, em Londres",
    conversions: PER_LITER,
    tip: "É o preço do petróleo cru, não da gasolina no posto.",
  },
  "CL=F": {
    what: "Petróleo WTI, produzido nos EUA. É a referência do petróleo americano.",
    unit: "barril (159 litros)",
    market: "NYMEX, em Nova York",
    conversions: PER_LITER,
    tip: "É o preço do petróleo cru, não da gasolina no posto.",
  },
  "NG=F": {
    what: "Gás natural dos EUA, usado para gerar energia e aquecer casas.",
    unit: "MMBtu (milhão de BTU, uma medida de energia)",
    market: "NYMEX, em Nova York",
  },
  "HG=F": {
    what: "Cobre, metal usado em fios, construção e carros elétricos. Costuma subir quando a economia mundial vai bem.",
    unit: "libra-peso (453,6 g)",
    market: "COMEX, em Nova York",
    conversions: PER_KG,
  },
  "ZS=F": {
    what: "Soja em grão. O Brasil é o maior produtor do mundo, então esse preço mexe com o agro daqui.",
    unit: "bushel (27,2 kg)",
    market: "CBOT, em Chicago",
    conversions: [{ label: "por saca de 60 kg", factor: 60 / 27.2155 }],
  },
  "ZC=F": {
    what: "Milho em grão, base de ração animal e de etanol nos EUA.",
    unit: "bushel (25,4 kg)",
    market: "CBOT, em Chicago",
    conversions: [{ label: "por saca de 60 kg", factor: 60 / 25.4012 }],
  },
  "KC=F": {
    what: "Café arábica. O Brasil é o maior produtor e exportador do mundo.",
    unit: "libra-peso (453,6 g)",
    market: "ICE, em Nova York",
    conversions: [{ label: "por saca de 60 kg", factor: 60 / POUND_KG }],
  },
  "SB=F": {
    what: "Açúcar bruto, que o Brasil exporta em grande volume.",
    unit: "libra-peso (453,6 g)",
    market: "ICE, em Nova York",
    conversions: PER_KG,
  },
  "CT=F": {
    what: "Algodão em pluma, matéria-prima de roupas e tecidos.",
    unit: "libra-peso (453,6 g)",
    market: "ICE, em Nova York",
    conversions: PER_KG,
  },
  "LE=F": {
    what: "Boi gordo vivo nos EUA. Não é o preço do boi brasileiro, mas costuma andar junto.",
    unit: "libra-peso de animal vivo (453,6 g)",
    market: "CME, em Chicago",
    conversions: [{ label: "por arroba (15 kg)", factor: 15 / POUND_KG }],
  },
};

const INDICES: Record<string, { what: string; etf?: string }> = {
  "^BVSP": { what: "O Ibovespa é o principal índice da bolsa brasileira: reúne as ações mais negociadas da B3.", etf: "BOVA11" },
  "IFIX.SA": { what: "O IFIX reúne os fundos imobiliários mais negociados da B3. Mostra como os FIIs estão indo no geral." },
  "^GSPC": { what: "O S&P 500 reúne 500 das maiores empresas dos EUA. É o termômetro da bolsa americana.", etf: "IVVB11" },
  "^IXIC": { what: "O Nasdaq Composite reúne as empresas da bolsa Nasdaq, com muito peso de tecnologia.", etf: "NASD11 (que segue a Nasdaq 100)" },
  "^DJI": { what: "O Dow Jones acompanha 30 empresas gigantes dos EUA. É o índice mais antigo de lá." },
  "^FTSE": { what: "O FTSE 100 reúne as 100 maiores empresas da bolsa de Londres." },
  "^GDAXI": { what: "O DAX reúne as 40 maiores empresas da bolsa da Alemanha." },
  "^N225": { what: "O Nikkei 225 acompanha 225 grandes empresas do Japão." },
  "^HSI": { what: "O Hang Seng reúne as maiores empresas da bolsa de Hong Kong." },
  "000001.SS": { what: "O Xangai Composite acompanha as ações da bolsa de Xangai, na China." },
};

const CURRENCIES: Record<string, string> = {
  USD: "1 dólar americano",
  EUR: "1 euro",
  GBP: "1 libra esterlina",
  JPY: "1 iene",
  CNY: "1 yuan",
  ARS: "1 peso argentino",
  CHF: "1 franco suíço",
  CAD: "1 dólar canadense",
  AUD: "1 dólar australiano",
};

const CRYPTO_EXTRA: Record<string, string> = {
  BTC: "Foi a primeira criptomoeda, de 2009, e nunca vai existir mais que 21 milhões de unidades.",
  ETH: "É a rede que roda contratos inteligentes e aplicativos; o ether paga as taxas dessa rede.",
};

const STABLECOINS = new Set(["USDT", "USDC", "DAI"]);

// ETFs da B3 que seguem ativos de fora: o preço em reais já sobe e desce com o dólar.
const FOREIGN_ETFS = new Set(["IVVB11", "SPXI11", "NASD11", "HASH11", "QBTC11", "ETHE11", "GOLD11", "XINA11", "ACWI11", "WRLD11"]);

const US_ETFS: Record<string, string> = { SPY: "S&P 500", VOO: "S&P 500", QQQ: "Nasdaq 100" };

/** Ação americana → código na B3 (BDR ou a própria ação, no caso das ADRs). */
export const US_TO_B3: Record<string, string> = {
  AAPL: "AAPL34", MSFT: "MSFT34", NVDA: "NVDC34", GOOGL: "GOGL34", AMZN: "AMZO34", META: "M1TA34",
  TSLA: "TSLA34", NFLX: "NFLX34", AVGO: "AVGO34", AMD: "A1MD34", JPM: "JPMC34", V: "VISA34",
  KO: "COCA34", "BRK-B": "BERK34", NU: "ROXO34", MELI: "MELI34", PBR: "PETR3", VALE: "VALE3", ITUB: "ITUB4",
};

function shareClass(ticker: string): string | undefined {
  const n = ticker.match(/(\d+)$/)?.[1];
  if (n === "3") return "Final 3 = ação ON (ordinária): dá direito a voto nas assembleias da empresa.";
  if (n === "4" || n === "5" || n === "6") return `Final ${n} = ação PN (preferencial): sem voto, mas com preferência para receber dividendos.`;
  if (n === "11") return "Final 11 = unit: um pacote que junta ações ON e PN da mesma empresa.";
  return undefined;
}

export function commodityUnit(symbol: string): string | undefined {
  return COMMODITIES[symbol]?.unit;
}

export function explainAsset(symbol: string, category: AssetCategory, name?: string, currency = "USD"): AssetExplainer {
  const ticker = displaySymbol(symbol);
  const label = name || catalogAsset(symbol)?.name || ticker;
  const cur = currency === "BRL" ? "reais" : currency === "USD" ? "dólares" : currency;
  switch (category) {
    case "acoes": {
      const cls = shareClass(ticker);
      return {
        what: `Uma ação é um pedacinho de uma empresa — aqui, ${label}. Quem compra vira sócio: ganha se a ação valorizar e recebe parte do lucro (dividendos).`,
        price: "Preço de 1 ação na B3, em reais. Dá para comprar a partir de 1 ação no mercado fracionário (código com F no fim, como " + ticker + "F).",
        unit: "por ação",
        tips: cls ? [cls] : [],
      };
    }
    case "fiis":
      return {
        what: "Fundo imobiliário (FII): junta o dinheiro de muitos investidores para ter imóveis (galpões, shoppings, escritórios) ou títulos de dívida imobiliária. O aluguel e os juros recebidos viram rendimentos, pagos em geral todo mês.",
        price: "Preço de 1 cota na B3, em reais. Dá para comprar a partir de 1 cota.",
        unit: "por cota",
        tips: [],
      };
    case "etfs":
      return {
        what: "ETF é um fundo que copia um índice. Com uma cota só, você investe em todos os ativos daquele índice de uma vez.",
        price: "Preço de 1 cota na B3, em reais.",
        unit: "por cota",
        tips: FOREIGN_ETFS.has(ticker) ? ["Ele segue ativos de fora, então o preço em reais também sobe e desce com o dólar."] : [],
      };
    case "bdrs":
      return {
        what: `BDR é um recibo negociado na B3 que representa ações de uma empresa de fora — aqui, ${label}. Você investe em reais, sem abrir conta no exterior.`,
        price: "Preço de 1 BDR, em reais. Ele acompanha a ação lá fora e também o dólar.",
        unit: "por BDR",
        tips: ["Um BDR costuma valer só uma fração da ação original, por isso o preço é diferente do da bolsa americana."],
      };
    case "exterior": {
      const index = US_ETFS[symbol];
      const b3 = US_TO_B3[symbol];
      if (index)
        return {
          what: `ETF americano que copia o ${index}. Com uma cota, você investe nas empresas desse índice de uma vez.`,
          price: `Preço de 1 cota em ${cur}, na bolsa dos EUA.`,
          unit: "por cota",
          tips: ["Daqui, dá para investir parecido em reais pelo IVVB11 (S&P 500) ou NASD11 (Nasdaq 100), na B3."],
        };
      return {
        what: `Ação da empresa ${label}, negociada na bolsa dos EUA.`,
        price: `Preço de 1 ação em ${cur}. Para comprar direto, é preciso ter conta numa corretora no exterior.`,
        unit: "por ação",
        tips: b3 && b3.endsWith("34") ? [`Na B3, você pode investir em reais pelo BDR ${b3}.`] : b3 ? [`Na B3, a mesma empresa é negociada como ${b3}.`] : [],
      };
    }
    case "cripto": {
      const coin = ticker.toUpperCase();
      if (STABLECOINS.has(coin))
        return {
          what: `${label} é uma stablecoin: uma criptomoeda feita para valer sempre perto de US$ 1. Funciona como um “dólar digital” no mundo cripto.`,
          price: `Preço de 1 ${coin} em dólares. Deve ficar bem perto de US$ 1,00.`,
          unit: `por 1 ${coin}`,
          tips: ["Ela não rende sozinha e depende da empresa que a emite manter reservas em dólar."],
        };
      return {
        what: `${label} é uma criptomoeda: dinheiro digital que não depende de banco nem de governo. As transações ficam registradas numa rede pública (blockchain).${CRYPTO_EXTRA[coin] ? " " + CRYPTO_EXTRA[coin] : ""}`,
        price: `Preço de 1 ${coin} inteiro, em ${cur}. Dá para comprar só um pedaço, como 0,001 ${coin}.`,
        unit: `por 1 ${coin}`,
        tips: ["Negocia 24 horas, todos os dias, e oscila muito: pode subir ou cair mais de 10% em poucos dias."],
      };
    }
    case "moedas": {
      const base = symbol.slice(0, 3);
      const what = CURRENCIES[base] ?? `1 ${base}`;
      return {
        what: `Câmbio: quantos reais custa ${what} hoje.`,
        price: `Valor em reais de ${what}. Se sobe, a moeda de fora ficou mais cara (o real perdeu valor).`,
        unit: `por ${what}`,
        tips: ["É o câmbio comercial, usado entre bancos e empresas. Para viajar ou comprar no cartão, você paga mais: tem a margem da casa de câmbio ou do banco e o IOF."],
      };
    }
    case "indices": {
      const info = INDICES[symbol];
      return {
        what: info?.what ?? `${label} é um índice: mede o sobe e desce de um grupo de ações.`,
        price: "Índice não é dinheiro: o valor é em pontos. Ele serve para comparar — o que importa é a variação em %.",
        tips: [
          info?.etf
            ? `Não dá para comprar um índice direto. Para investir nele, existe ETF, como o ${info.etf}.`
            : "Não dá para comprar um índice direto; para investir nele, procure um ETF que o acompanhe.",
        ],
      };
    }
    case "commodities": {
      const spec = COMMODITIES[symbol];
      if (!spec)
        return {
          what: `${label} é uma commodity: matéria-prima negociada no mundo todo, com o mesmo preço de referência.`,
          price: "Preço de um contrato futuro, normalmente em dólares.",
          tips: [],
        };
      return {
        what: spec.what,
        price: `Preço em ${cur} por ${spec.unit}, num contrato futuro da ${spec.market}. Contrato futuro é um acordo de compra e venda para uma data próxima; na prática, é a referência do preço no mundo.`,
        unit: `por ${spec.unit}`,
        conversions: spec.conversions,
        tips: spec.tip ? [spec.tip] : [],
      };
    }
    default:
      return { what: label, price: "Preço em reais.", tips: [] };
  }
}

export type StatKey = "open" | "prevClose" | "dayRange" | "volume" | "range52" | "ma50" | "ma200" | "pe" | "pb" | "dy" | "eps" | "mcap";

export function statHelp(key: StatKey, category: AssetCategory): string {
  const unit = category === "fiis" || category === "etfs" ? "cotas" : category === "bdrs" ? "BDRs" : category === "commodities" ? "contratos" : "ações";
  switch (key) {
    case "open":
      return "Primeiro preço negociado hoje, quando o mercado abriu.";
    case "prevClose":
      return "Último preço do pregão anterior. A variação do dia é calculada a partir dele.";
    case "dayRange":
      return "Menor e maior preço negociados hoje.";
    case "volume":
      return category === "cripto"
        ? "Quanto foi negociado nas últimas 24 horas, em dólares. Volume alto = muita gente comprando e vendendo."
        : `Quantidade de ${unit} negociadas hoje. Volume alto = muita gente comprando e vendendo, o que facilita entrar e sair.`;
    case "range52":
      return "Menor e maior preço do último ano (52 semanas). A bolinha mostra onde o preço está agora.";
    case "ma50":
      return "Média do preço nos últimos 50 dias de negociação (uns 2 meses e meio). Preço acima da média indica que vem subindo no curto prazo.";
    case "ma200":
      return "Média do preço nos últimos 200 dias de negociação (uns 10 meses). Mostra a tendência de longo prazo.";
    case "pe":
      return "P/L = preço ÷ lucro por ação dos últimos 12 meses. Diz em quantos anos o lucro “pagaria” a ação, se ficasse igual. Compare com empresas do mesmo setor.";
    case "pb":
      return category === "fiis"
        ? "P/VP = preço da cota ÷ valor dos imóveis e títulos do fundo por cota. Abaixo de 1, a cota sai mais barata que o patrimônio."
        : "P/VP = preço ÷ patrimônio da empresa por ação. Abaixo de 1, o mercado paga menos do que o valor contábil.";
    case "dy":
      return "Proventos pagos nos últimos 12 meses ÷ preço atual. Ex.: 8% = R$ 8 por ano a cada R$ 100 investidos. O passado não garante os próximos pagamentos.";
    case "eps":
      return "Lucro dos últimos 12 meses dividido pelo número de ações.";
    case "mcap":
      return "Preço × total de ações: quanto a bolsa diz que a empresa inteira vale hoje.";
  }
}
