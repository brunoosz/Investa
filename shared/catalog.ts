import type { AssetCategory } from "./types";

export interface CategoryInfo {
  id: AssetCategory;
  label: string;
  description: string;
  icon: string;
  quoted: boolean;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: "acoes", label: "Ações", description: "Empresas negociadas na B3", icon: "building", quoted: true },
  { id: "fiis", label: "Fundos Imobiliários", description: "FIIs que pagam rendimentos mensais", icon: "landmark", quoted: true },
  { id: "etfs", label: "ETFs", description: "Fundos de índice negociados na bolsa", icon: "layers", quoted: true },
  { id: "bdrs", label: "BDRs", description: "Empresas estrangeiras negociadas na B3", icon: "globe", quoted: true },
  { id: "tesouro", label: "Tesouro Direto", description: "Títulos públicos federais", icon: "shield", quoted: false },
  { id: "rendafixa", label: "Renda Fixa Bancária", description: "CDB, LCI, LCA e poupança", icon: "piggy", quoted: false },
  { id: "cripto", label: "Criptomoedas", description: "Bitcoin, Ethereum e outras", icon: "bitcoin", quoted: true },
  { id: "moedas", label: "Moedas", description: "Câmbio em relação ao real", icon: "banknote", quoted: true },
  { id: "indices", label: "Índices", description: "Ibovespa e bolsas do mundo", icon: "activity", quoted: true },
  { id: "commodities", label: "Commodities", description: "Ouro, petróleo, soja e mais", icon: "gem", quoted: true },
  { id: "exterior", label: "Ações dos EUA", description: "Empresas negociadas em Nova York", icon: "store", quoted: true },
];

export interface CatalogAsset {
  symbol: string;
  name: string;
  category: AssetCategory;
  label?: string;
}

const b3 = (category: AssetCategory, list: [string, string][]): CatalogAsset[] =>
  list.map(([t, name]) => ({ symbol: `${t}.SA`, name, category }));

const raw = (category: AssetCategory, list: [string, string, string?][]): CatalogAsset[] =>
  list.map(([symbol, name, label]) => ({ symbol, name, category, label }));

export const CATALOG: CatalogAsset[] = [
  ...b3("acoes", [
    ["PETR4", "Petrobras PN"], ["PETR3", "Petrobras ON"], ["VALE3", "Vale"], ["ITUB4", "Itaú Unibanco"],
    ["BBDC4", "Bradesco PN"], ["BBDC3", "Bradesco ON"], ["BBAS3", "Banco do Brasil"], ["B3SA3", "B3"],
    ["ABEV3", "Ambev"], ["WEGE3", "WEG"], ["ITSA4", "Itaúsa"], ["SANB11", "Santander Brasil"],
    ["BPAC11", "BTG Pactual"], ["AXIA3", "Axia Energia (Eletrobras)"], ["SUZB3", "Suzano"], ["RENT3", "Localiza"],
    ["RADL3", "Raia Drogasil"], ["RDOR3", "Rede D'Or"], ["EQTL3", "Equatorial"], ["PRIO3", "PRIO"],
    ["GGBR4", "Gerdau"], ["GOAU4", "Metalúrgica Gerdau"], ["CSNA3", "CSN"], ["USIM5", "Usiminas"],
    ["CMIN3", "CSN Mineração"], ["BRAP4", "Bradespar"], ["MGLU3", "Magazine Luiza"], ["LREN3", "Lojas Renner"],
    ["VIVT3", "Telefônica Vivo"], ["TIMS3", "TIM"], ["CMIG4", "Cemig"], ["CPLE3", "Copel"],
    ["SBSP3", "Sabesp"], ["TAEE11", "Taesa"], ["EGIE3", "Engie Brasil"], ["CPFE3", "CPFL Energia"],
    ["ENEV3", "Eneva"], ["AURE3", "Auren"], ["ISAE4", "ISA Energia"], ["ALUP11", "Alupar"],
    ["SAPR11", "Sanepar"], ["CSMG3", "Copasa"], ["CSAN3", "Cosan"], ["RAIL3", "Rumo"],
    ["UGPA3", "Ultrapar"], ["VBBR3", "Vibra Energia"], ["RECV3", "PetroReconcavo"], ["BRAV3", "Brava Energia"],
    ["EMBJ3", "Embraer"], ["HAPV3", "Hapvida"], ["FLRY3", "Fleury"],
    ["HYPE3", "Hypera"], ["TOTS3", "Totvs"], ["LWSA3", "Locaweb"], ["INTB3", "Intelbras"],
    ["CYRE3", "Cyrela"], ["MRVE3", "MRV"], ["EZTC3", "EZTec"], ["DIRR3", "Direcional"],
    ["CURY3", "Cury"], ["MULT3", "Multiplan"], ["ALOS3", "Allos"], ["KLBN11", "Klabin"],
    ["MOTV3", "Motiva"], ["ECOR3", "EcoRodovias"], ["ASAI3", "Assaí"], ["GMAT3", "Grupo Mateus"],
    ["NATU3", "Natura"], ["AZZA3", "Azzas 2154"], ["VIVA3", "Vivara"], ["SBFG3", "Grupo SBF"],
    ["BBSE3", "BB Seguridade"], ["CXSE3", "Caixa Seguridade"], ["PSSA3", "Porto Seguro"], ["IRBR3", "IRB Re"],
    ["ABCB4", "ABC Brasil"], ["BRSR6", "Banrisul"], ["YDUQ3", "Yduqs"],
    ["COGN3", "Cogna"], ["SMTO3", "São Martinho"], ["SLCE3", "SLC Agrícola"], ["BEEF3", "Minerva"],
    ["POMO4", "Marcopolo"], ["TUPY3", "Tupy"], ["LEVE3", "Mahle Metal Leve"], ["FRAS3", "Fras-le"],
    ["KEPL3", "Kepler Weber"], ["VAMO3", "Vamos"], ["VULC3", "Vulcabras"], ["CVCB3", "CVC"],
    ["ORVR3", "Orizon"], ["CASH3", "Méliuz"], ["AMER3", "Americanas"],
  ]),
  ...b3("fiis", [
    ["HGLG11", "CSHG Logística"], ["XPML11", "XP Malls"], ["KNRI11", "Kinea Renda Imobiliária"],
    ["MXRF11", "Maxi Renda"], ["VISC11", "Vinci Shopping Centers"], ["BTLG11", "BTG Logística"],
    ["HGRU11", "CSHG Renda Urbana"], ["XPLG11", "XP Log"], ["KNCR11", "Kinea Rendimentos"],
    ["KNIP11", "Kinea Índices de Preços"], ["CPTS11", "Capitânia Securities"], ["IRDM11", "Iridium Recebíveis"],
    ["HGRE11", "CSHG Real Estate"], ["RBRF11", "RBR Alpha Multiestratégia"], ["VGIP11", "Valora CRI"],
    ["TRXF11", "TRX Real Estate"], ["PVBI11", "VBI Prime Properties"], ["RECR11", "REC Recebíveis"],
    ["JSRE11", "JS Real Estate"], ["BRCO11", "Bresco Logística"], ["LVBI11", "VBI Logístico"],
    ["HSML11", "HSI Malls"], ["VILG11", "Vinci Logística"], ["GGRC11", "GGR Covepi"],
    ["RBRR11", "RBR Rendimento High Grade"], ["KNSC11", "Kinea Securities"], ["MCCI11", "Mauá Capital"],
    ["VGHF11", "Valora Hedge Fund"], ["TGAR11", "TG Ativo Real"], ["ALZR11", "Alianza Trust"],
    ["HCTR11", "Hectare CE"], ["RZTR11", "Riza Terrax"], ["XPIN11", "XP Industrial"],
    ["BRCR11", "BC Fund"], ["RBVA11", "Rio Bravo Renda Varejo"], ["HGCR11", "CSHG Recebíveis"],
    ["SNAG11", "Suno Agro"], ["KNHF11", "Kinea Hedge Fund"], ["VRTA11", "Fator Verità"],
    ["BTCI11", "BTG Crédito Imobiliário"], ["CPSH11", "Capitânia Shoppings"], ["KFOF11", "Kinea FoF"],
    ["BCRI11", "Banestes Recebíveis"], ["HFOF11", "Hedge Top FoFII"], ["RZAK11", "Riza Akin"],
    ["PCIP11", "Patria Crédito Imobiliário"], ["GARE11", "Guardian Real Estate"], ["TVRI11", "Tivio Renda Imobiliária"],
    ["PMLL11", "Pátria Malls"], ["SNCI11", "Suno Recebíveis"],
  ]),
  ...b3("etfs", [
    ["BOVA11", "iShares Ibovespa"], ["BOVV11", "It Now Ibovespa"], ["SMAL11", "iShares Small Cap"],
    ["IVVB11", "iShares S&P 500"], ["SPXI11", "It Now S&P 500"], ["NASD11", "Trend Nasdaq 100"],
    ["HASH11", "Hashdex Nasdaq Crypto"], ["QBTC11", "QR Bitcoin"], ["ETHE11", "Hashdex Ethereum"],
    ["GOLD11", "Trend Ouro"], ["DIVO11", "It Now IDIV Dividendos"], ["XINA11", "Trend China"],
    ["ACWI11", "Trend ACWI Mundo"], ["WRLD11", "Investo Mundo"],
    ["FIND11", "It Now Financeiro"], ["MATB11", "It Now Materiais Básicos"], ["ECOO11", "iShares Carbono Eficiente"],
    ["PIBB11", "It Now IBrX-50"], ["IMAB11", "It Now IMA-B"], ["IRFM11", "It Now IRF-M"],
    ["FIXA11", "Mirae Renda Fixa Pré"], ["B5P211", "It Now IMA-B5 P2"], ["LFTS11", "Investo Tesouro Selic"],
    ["NTNS11", "Investo Tesouro IPCA"], ["BOVX11", "Trend Ibovespa"],
  ]),
  ...b3("bdrs", [
    ["AAPL34", "Apple"], ["MSFT34", "Microsoft"], ["AMZO34", "Amazon"], ["GOGL34", "Alphabet (Google)"],
    ["NVDC34", "NVIDIA"], ["M1TA34", "Meta"], ["TSLA34", "Tesla"], ["NFLX34", "Netflix"],
    ["DISB34", "Disney"], ["COCA34", "Coca-Cola"], ["JPMC34", "JPMorgan"], ["BERK34", "Berkshire Hathaway"],
    ["MELI34", "Mercado Livre"], ["ROXO34", "Nubank"], ["INBR32", "Inter&Co"], ["VISA34", "Visa"],
    ["MSCD34", "Mastercard"], ["PGCO34", "Procter & Gamble"], ["JNJB34", "Johnson & Johnson"], ["WALM34", "Walmart"],
    ["NIKE34", "Nike"], ["MCDC34", "McDonald's"], ["PFIZ34", "Pfizer"], ["BABA34", "Alibaba"],
    ["TSMC34", "TSMC"], ["A1MD34", "AMD"], ["ITLC34", "Intel"], ["ORCL34", "Oracle"],
    ["AVGO34", "Broadcom"], ["ASML34", "ASML"], ["EXXO34", "Exxon Mobil"], ["BOAC34", "Bank of America"],
  ]),
  ...raw("cripto", [
    ["BTC-USD", "Bitcoin", "BTC"], ["ETH-USD", "Ethereum", "ETH"], ["SOL-USD", "Solana", "SOL"],
    ["XRP-USD", "XRP", "XRP"], ["BNB-USD", "BNB", "BNB"], ["ADA-USD", "Cardano", "ADA"],
    ["DOGE-USD", "Dogecoin", "DOGE"], ["TRX-USD", "TRON", "TRX"], ["AVAX-USD", "Avalanche", "AVAX"],
    ["LINK-USD", "Chainlink", "LINK"], ["DOT-USD", "Polkadot", "DOT"], ["LTC-USD", "Litecoin", "LTC"],
    ["USDT-USD", "Tether", "USDT"], ["USDC-USD", "USD Coin", "USDC"],
  ]),
  ...raw("moedas", [
    ["USDBRL=X", "Dólar americano", "USD/BRL"], ["EURBRL=X", "Euro", "EUR/BRL"],
    ["GBPBRL=X", "Libra esterlina", "GBP/BRL"], ["JPYBRL=X", "Iene japonês", "JPY/BRL"],
    ["CNYBRL=X", "Yuan chinês", "CNY/BRL"], ["ARSBRL=X", "Peso argentino", "ARS/BRL"],
    ["CHFBRL=X", "Franco suíço", "CHF/BRL"], ["CADBRL=X", "Dólar canadense", "CAD/BRL"],
    ["AUDBRL=X", "Dólar australiano", "AUD/BRL"],
  ]),
  ...raw("indices", [
    ["^BVSP", "Ibovespa", "IBOV"], ["IFIX.SA", "IFIX (Fundos Imobiliários)", "IFIX"],
    ["^GSPC", "S&P 500", "S&P 500"], ["^IXIC", "Nasdaq Composite", "NASDAQ"], ["^DJI", "Dow Jones", "DOW"],
    ["^FTSE", "FTSE 100 (Londres)", "FTSE"], ["^GDAXI", "DAX (Alemanha)", "DAX"],
    ["^N225", "Nikkei 225 (Japão)", "NIKKEI"], ["^HSI", "Hang Seng (Hong Kong)", "HSI"],
    ["000001.SS", "Xangai Composite", "SSE"],
  ]),
  ...raw("commodities", [
    ["GC=F", "Ouro", "OURO"], ["SI=F", "Prata", "PRATA"], ["BZ=F", "Petróleo Brent", "BRENT"],
    ["CL=F", "Petróleo WTI", "WTI"], ["NG=F", "Gás natural", "GÁS"], ["HG=F", "Cobre", "COBRE"],
    ["ZS=F", "Soja", "SOJA"], ["ZC=F", "Milho", "MILHO"], ["KC=F", "Café", "CAFÉ"],
    ["SB=F", "Açúcar", "AÇÚCAR"], ["CT=F", "Algodão", "ALGODÃO"], ["LE=F", "Boi gordo (EUA)", "BOI"],
  ]),
  ...raw("exterior", [
    ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["NVDA", "NVIDIA"], ["GOOGL", "Alphabet (Google)"],
    ["AMZN", "Amazon"], ["META", "Meta"], ["TSLA", "Tesla"], ["NFLX", "Netflix"],
    ["AVGO", "Broadcom"], ["AMD", "AMD"], ["JPM", "JPMorgan"], ["V", "Visa"],
    ["KO", "Coca-Cola"], ["BRK-B", "Berkshire Hathaway"], ["NU", "Nu Holdings (Nubank)"], ["MELI", "MercadoLibre"],
    ["PBR", "Petrobras (ADR)"], ["VALE", "Vale (ADR)"], ["ITUB", "Itaú (ADR)"], ["SPY", "SPDR S&P 500 ETF"],
    ["QQQ", "Invesco QQQ (Nasdaq 100)"], ["VOO", "Vanguard S&P 500 ETF"],
  ]),
];

const catalogIndex = new Map(CATALOG.map((a) => [a.symbol, a]));

export function catalogAsset(symbol: string): CatalogAsset | undefined {
  return catalogIndex.get(symbol);
}

export function displaySymbol(symbol: string): string {
  const known = catalogIndex.get(symbol);
  if (known?.label) return known.label;
  if (symbol.endsWith(".SA")) return symbol.slice(0, -3);
  if (symbol.endsWith("=X")) return `${symbol.slice(0, 3)}/${symbol.slice(3, 6)}`;
  if (symbol.endsWith("-USD")) return symbol.slice(0, -4);
  if (symbol.startsWith("^")) return symbol.slice(1);
  return symbol;
}

export function toYahooSymbol(input: string): string {
  const s = input.trim().toUpperCase();
  if (!s) return s;
  if (/^[A-Z]{4}\d{1,2}F?$/.test(s)) return `${s.replace(/F$/, "")}.SA`;
  return s;
}

export function guessCategory(symbol: string, quoteType?: string): AssetCategory {
  const known = catalogIndex.get(symbol);
  if (known) return known.category;
  const t = (quoteType || "").toUpperCase();
  if (t === "CRYPTOCURRENCY") return "cripto";
  if (t === "CURRENCY") return "moedas";
  if (t === "INDEX") return "indices";
  if (t === "FUTURE") return "commodities";
  if (!t) {
    if (/-(USD|BRL|USDT)$/.test(symbol)) return "cripto";
    if (symbol.endsWith("=X")) return "moedas";
    if (symbol.endsWith("=F")) return "commodities";
    if (symbol.startsWith("^")) return "indices";
  }
  if (symbol.endsWith(".SA")) {
    const base = symbol.slice(0, -3);
    if (/3[2-5]$/.test(base)) return "bdrs";
    if (/11$/.test(base)) return t === "ETF" ? "etfs" : "fiis";
    return "acoes";
  }
  return "exterior";
}

export const LIQUID_UNIVERSE = [
  "PETR4.SA", "VALE3.SA", "ITUB4.SA", "BBDC4.SA", "BBAS3.SA", "B3SA3.SA", "ABEV3.SA", "WEGE3.SA",
  "ITSA4.SA", "BPAC11.SA", "AXIA3.SA", "SUZB3.SA", "RENT3.SA", "RADL3.SA", "RDOR3.SA", "EQTL3.SA",
  "PRIO3.SA", "GGBR4.SA", "MGLU3.SA", "LREN3.SA", "VIVT3.SA", "TIMS3.SA", "CMIG4.SA", "SBSP3.SA",
  "TAEE11.SA", "EGIE3.SA", "CSAN3.SA", "RAIL3.SA", "UGPA3.SA", "VBBR3.SA", "EMBJ3.SA", "HAPV3.SA",
  "TOTS3.SA", "CYRE3.SA", "MULT3.SA", "KLBN11.SA", "ASAI3.SA", "BBSE3.SA", "CSNA3.SA", "USIM5.SA",
];
