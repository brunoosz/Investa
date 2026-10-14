export type BankType = "digital" | "tradicional" | "corretora";

export interface BankRef {
  id: string;
  name: string;
  short: string;
  type: BankType;
  color: string;
  liquidProduct: { name: string; pctCDI: number };
  cdbTop: { pctCDI: number; term: string };
  freeAccount: boolean;
  feeNote: string;
  invest: string[];
  pros: string[];
  cons: string[];
  bestFor: string;
  matchNames: string[];
}

/**
 * Taxas de referência típicas de cada instituição (podem variar por cliente e promoções).
 * O rendimento em reais é recalculado todos os dias com o CDI oficial do Banco Central.
 */
export const BANKS: BankRef[] = [
  {
    id: "nubank", name: "Nubank", short: "Nu", type: "digital", color: "#8A05BE",
    liquidProduct: { name: "Caixinhas", pctCDI: 100 }, cdbTop: { pctCDI: 105, term: "2 anos" },
    freeAccount: true, feeNote: "Conta sem tarifa de manutenção",
    invest: ["CDB", "LCI", "LCA", "Tesouro", "Ações", "FIIs", "ETFs", "Fundos", "Cripto"],
    pros: ["Rende 100% do CDI com resgate a qualquer momento", "App simples, ótimo para começar", "Caixinhas para separar objetivos"],
    cons: ["Menos opções de renda fixa que corretoras grandes"],
    bestFor: "Quem está começando e quer simplicidade",
    matchNames: ["NU FINANCEIRA", "NU PAGAMENTOS", "NUBANK"],
  },
  {
    id: "inter", name: "Banco Inter", short: "Inter", type: "digital", color: "#FF7A00",
    liquidProduct: { name: "CDB liquidez diária", pctCDI: 100 }, cdbTop: { pctCDI: 110, term: "2 a 3 anos" },
    freeAccount: true, feeNote: "Conta digital gratuita",
    invest: ["CDB", "LCI", "LCA", "Tesouro", "Ações", "FIIs", "ETFs", "Fundos", "Cripto", "Previdência"],
    pros: ["Plataforma de investimentos completa no mesmo app", "Boa variedade de CDBs e LCIs", "Investe em ações e FIIs sem taxa de corretagem"],
    cons: ["Algumas ofertas exigem valores mínimos maiores"],
    bestFor: "Quem quer banco e corretora no mesmo lugar",
    matchNames: ["BCO INTER", "BANCO INTER", "INTER S.A"],
  },
  {
    id: "c6", name: "C6 Bank", short: "C6", type: "digital", color: "#242424",
    liquidProduct: { name: "CDB com liquidez", pctCDI: 100 }, cdbTop: { pctCDI: 110, term: "2 anos" },
    freeAccount: true, feeNote: "Conta digital gratuita",
    invest: ["CDB", "LCI", "LCA", "Tesouro", "Ações", "FIIs", "ETFs", "Fundos"],
    pros: ["CDBs próprios competitivos", "Conta global em dólar e euro", "Corretora integrada"],
    cons: ["Alguns benefícios ligados a programa de pontos pago"],
    bestFor: "Quem quer conta em outras moedas",
    matchNames: ["BCO C6", "BANCO C6", "C6 S.A"],
  },
  {
    id: "picpay", name: "PicPay", short: "PicPay", type: "digital", color: "#11C76F",
    liquidProduct: { name: "Cofrinhos", pctCDI: 102 }, cdbTop: { pctCDI: 102, term: "liquidez diária" },
    freeAccount: true, feeNote: "Conta sem tarifa",
    invest: ["CDB", "Cofrinhos", "Cripto"],
    pros: ["Cofrinhos rendem acima de 100% do CDI", "Resgate imediato"],
    cons: ["Poucas opções além dos cofrinhos e cripto"],
    bestFor: "Reserva de emergência com rendimento acima do CDI",
    matchNames: ["PICPAY"],
  },
  {
    id: "mercadopago", name: "Mercado Pago", short: "MP", type: "digital", color: "#00B1EA",
    liquidProduct: { name: "Saldo remunerado", pctCDI: 100 }, cdbTop: { pctCDI: 100, term: "liquidez diária" },
    freeAccount: true, feeNote: "Conta sem tarifa",
    invest: ["CDB", "Cofrinhos", "Cripto"],
    pros: ["Dinheiro na conta já rende automaticamente", "Integração com compras no Mercado Livre"],
    cons: ["Poucas opções de investimento de longo prazo"],
    bestFor: "Quem quer o saldo da conta rendendo sem esforço",
    matchNames: ["MERCADO PAGO", "MERCADOPAGO", "MERCADO CRÉDITO", "MERCADO CREDITO"],
  },
  {
    id: "pagbank", name: "PagBank", short: "Pag", type: "digital", color: "#1BB99A",
    liquidProduct: { name: "CDB liquidez diária", pctCDI: 100 }, cdbTop: { pctCDI: 110, term: "2 anos" },
    freeAccount: true, feeNote: "Conta sem tarifa",
    invest: ["CDB", "Tesouro", "Fundos"],
    pros: ["CDBs com liquidez diária a partir de valores baixos", "Promoções frequentes acima de 100% do CDI"],
    cons: ["Menos opções de renda variável"],
    bestFor: "CDB simples com aplicação pequena",
    matchNames: ["PAGSEGURO", "PAGBANK", "BCO SEGURO"],
  },
  {
    id: "btg", name: "BTG Pactual", short: "BTG", type: "corretora", color: "#0B2A5B",
    liquidProduct: { name: "CDB liquidez diária", pctCDI: 100 }, cdbTop: { pctCDI: 115, term: "3 a 5 anos" },
    freeAccount: true, feeNote: "Conta gratuita",
    invest: ["CDB", "LCI", "LCA", "CRI", "CRA", "Debêntures", "Tesouro", "Ações", "FIIs", "ETFs", "Fundos", "Previdência", "Cripto"],
    pros: ["Enorme variedade de produtos", "CDBs de vários bancos em um lugar", "Bons fundos e análises"],
    cons: ["Pode ser complexo para iniciantes"],
    bestFor: "Quem quer variedade e já tem alguma experiência",
    matchNames: ["BCO BTG PACTUAL", "BTG PACTUAL"],
  },
  {
    id: "xp", name: "XP Investimentos", short: "XP", type: "corretora", color: "#111111",
    liquidProduct: { name: "CDB liquidez diária", pctCDI: 100 }, cdbTop: { pctCDI: 115, term: "3 a 5 anos" },
    freeAccount: true, feeNote: "Conta gratuita",
    invest: ["CDB", "LCI", "LCA", "CRI", "CRA", "Debêntures", "Tesouro", "Ações", "FIIs", "ETFs", "Fundos", "Previdência", "Cripto"],
    pros: ["Uma das maiores corretoras do país", "Muitas ofertas de renda fixa", "Conteúdo educativo"],
    cons: ["Interface com muitas opções pode assustar no início"],
    bestFor: "Investidores que querem diversificar bastante",
    matchNames: ["BCO XP", "XP INVESTIMENTOS", "XP S.A"],
  },
  {
    id: "sofisa", name: "Sofisa Direto", short: "Sofisa", type: "digital", color: "#E3003A",
    liquidProduct: { name: "CDB liquidez diária", pctCDI: 110 }, cdbTop: { pctCDI: 115, term: "2 anos" },
    freeAccount: true, feeNote: "Conta digital gratuita",
    invest: ["CDB", "LCI", "LCA", "Fundos"],
    pros: ["CDB com liquidez diária acima de 100% do CDI", "Coberto pelo FGC"],
    cons: ["Banco menor, foque no limite do FGC"],
    bestFor: "Quem quer liquidez diária rendendo mais",
    matchNames: ["SOFISA"],
  },
  {
    id: "itau", name: "Itaú", short: "Itaú", type: "tradicional", color: "#EC7000",
    liquidProduct: { name: "CDB DI", pctCDI: 95 }, cdbTop: { pctCDI: 100, term: "2 anos" },
    freeAccount: false, feeNote: "Cobra pacote de tarifas (há opção de serviços essenciais gratuitos)",
    invest: ["CDB", "LCI", "LCA", "Tesouro", "Ações", "FIIs", "Fundos", "Previdência"],
    pros: ["Maior banco privado do país", "Agências físicas e atendimento"],
    cons: ["Renda fixa costuma render menos que bancos digitais", "Tarifas no pacote padrão"],
    bestFor: "Quem precisa de agência e atendimento presencial",
    matchNames: ["ITAÚ UNIBANCO", "ITAU UNIBANCO", "BCO ITAUCARD", "ITAÚ"],
  },
  {
    id: "bradesco", name: "Bradesco", short: "Brad", type: "tradicional", color: "#CC092F",
    liquidProduct: { name: "CDB liquidez", pctCDI: 95 }, cdbTop: { pctCDI: 100, term: "2 anos" },
    freeAccount: false, feeNote: "Cobra pacote de tarifas (há opção de serviços essenciais gratuitos)",
    invest: ["CDB", "LCI", "LCA", "Tesouro", "Ações", "Fundos", "Previdência"],
    pros: ["Presença em todo o Brasil", "Bom para quem já é correntista"],
    cons: ["Rentabilidade menor na renda fixa", "Tarifas no pacote padrão"],
    bestFor: "Correntistas que preferem atendimento físico",
    matchNames: ["BCO BRADESCO", "BRADESCO"],
  },
  {
    id: "bb", name: "Banco do Brasil", short: "BB", type: "tradicional", color: "#F8D117",
    liquidProduct: { name: "CDB DI", pctCDI: 95 }, cdbTop: { pctCDI: 100, term: "2 anos" },
    freeAccount: false, feeNote: "Cobra pacote de tarifas (há opção de serviços essenciais gratuitos)",
    invest: ["CDB", "LCI", "LCA", "Tesouro", "Ações", "Fundos", "Previdência"],
    pros: ["Banco público sólido", "Boas condições de crédito rural e consignado"],
    cons: ["Rendimentos de renda fixa abaixo dos digitais"],
    bestFor: "Servidores públicos e crédito consignado",
    matchNames: ["BCO DO BRASIL", "BANCO DO BRASIL"],
  },
  {
    id: "caixa", name: "Caixa", short: "Caixa", type: "tradicional", color: "#005CA9",
    liquidProduct: { name: "Poupança / CDB", pctCDI: 90 }, cdbTop: { pctCDI: 98, term: "2 anos" },
    freeAccount: false, feeNote: "Cobra pacote de tarifas (há opção de serviços essenciais gratuitos)",
    invest: ["Poupança", "CDB", "LCI", "Tesouro", "Fundos", "Previdência"],
    pros: ["Principal banco do financiamento imobiliário", "Benefícios sociais e FGTS"],
    cons: ["Opções de investimento limitadas e menos rentáveis"],
    bestFor: "Financiamento da casa própria",
    matchNames: ["CAIXA ECONOMICA", "CAIXA ECONÔMICA"],
  },
  {
    id: "santander", name: "Santander", short: "Sant", type: "tradicional", color: "#EC0000",
    liquidProduct: { name: "CDB liquidez", pctCDI: 95 }, cdbTop: { pctCDI: 100, term: "2 anos" },
    freeAccount: false, feeNote: "Cobra pacote de tarifas (há opção de serviços essenciais gratuitos)",
    invest: ["CDB", "LCI", "LCA", "Tesouro", "Ações", "Fundos", "Previdência"],
    pros: ["Grande banco internacional", "Corretora integrada"],
    cons: ["Renda fixa menos competitiva", "Tarifas no pacote padrão"],
    bestFor: "Quem já é cliente e quer praticidade",
    matchNames: ["BCO SANTANDER", "SANTANDER"],
  },
];

export const OTHER_INSTITUTIONS = ["Rico", "Clear", "Ágora", "Modal", "Banco Pan", "Neon", "Next", "Will Bank", "Sicoob", "Sicredi", "Banrisul", "Outra"];

export function bankById(id: string): BankRef | undefined {
  return BANKS.find((b) => b.id === id);
}

export function institutionLabel(idOrName: string): string {
  return bankById(idOrName)?.name ?? idOrName;
}

export function matchBankId(institution: string): string | undefined {
  const up = institution.toUpperCase();
  return BANKS.find((b) => b.matchNames.some((m) => up.includes(m)))?.id;
}
