export type Role = "usuario" | "adm" | "dono";

export const ROLE_LABEL: Record<Role, string> = {
  usuario: "Usuário",
  adm: "Administrador",
  dono: "Dono",
};

export type UserStatus = "ativo" | "bloqueado";

export interface PublicUser {
  id: string;
  name: string;
  username: string;
  email?: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  lastLoginAt?: string;
  avatarHue: number;
  onboarded: boolean;
}

export type RiskProfile = "conservador" | "moderado" | "arrojado";
export type Experience = "nunca" | "pouco" | "experiente";

export interface FinancialProfile {
  onboarded: boolean;
  salary: number;
  extraIncome: number;
  fixedExpenses: number;
  variableExpenses: number;
  monthlyInvest: number;
  emergencyReserve: number;
  invested: number;
  debts: number;
  riskProfile: RiskProfile;
  experience: Experience;
  mainGoal: string;
  age?: number;
  /** Dia do mês em que o salário cai. */
  payDay?: number;
  /** Adiantamento (vale): dia e valor, já incluído no salário. */
  advanceDay?: number;
  advanceAmount?: number;
  updatedAt: string;
}

export interface UserSettings {
  theme: "dark" | "light" | "system";
  desktopNotifications: boolean;
  smartAlerts: boolean;
  marketEvents: boolean;
  dailyTip: boolean;
  /** Resumo da semana todo domingo. */
  weeklySummary: boolean;
  gainThreshold: number;
  lossThreshold: number;
  deviationThreshold: number;
  hiddenCategories: AssetCategory[];
  hiddenSymbols: string[];
  customSymbols: { symbol: string; name: string; category: AssetCategory }[];
  favorites: string[];
  runInBackground: boolean;
  /** Análise diária da IA ("Hoje: … porque …") como notificação. */
  aiInsight?: boolean;
  /** Hora da análise diária (8 a 21). */
  aiInsightHour?: number;
  /** Dono: avisar quando a IA registrar erros. */
  ownerAiAlerts?: boolean;
}

/** Análise diária da IA. */
export interface DailyInsight {
  /** Dia (AAAA-MM-DD). */
  date: string;
  at: string;
  title: string;
  why: string;
  model?: string;
}

export type AssetCategory =
  | "acoes"
  | "fiis"
  | "etfs"
  | "bdrs"
  | "rendafixa"
  | "tesouro"
  | "cripto"
  | "moedas"
  | "indices"
  | "commodities"
  | "exterior";

export type FixedType =
  | "cdb"
  | "lci"
  | "lca"
  | "tesouro-selic"
  | "tesouro-ipca"
  | "tesouro-pre"
  | "poupanca"
  | "debenture"
  | "outro";

export type RateType = "cdi" | "selic" | "ipca" | "pre" | "variavel";

export interface Holding {
  id: string;
  kind: "variavel" | "fixa";
  name: string;
  category: AssetCategory;
  institution: string;
  purchaseDate: string;
  notes?: string;
  symbol?: string;
  quantity?: number;
  avgPrice?: number;
  fixedType?: FixedType;
  rateType?: Exclude<RateType, "variavel">;
  rate?: number;
  amount?: number;
}

export type AllocationType =
  | FixedType
  | "acao"
  | "fii"
  | "etf"
  | "cripto";

export interface GoalAllocation {
  id: string;
  type: AllocationType;
  asset: string;
  institution: string;
  amount: number;
  monthly: number;
  rateType: RateType;
  rate: number;
}

export interface Goal {
  id: string;
  name: string;
  icon: string;
  color: string;
  target: number;
  deadline: string;
  allocations: GoalAllocation[];
  createdAt: string;
}

export type PaymentMethod = "pix" | "debito" | "credito" | "dinheiro" | "boleto" | "transferencia";

export interface Expense {
  id: string;
  type: "despesa" | "receita";
  description: string;
  amount: number;
  date: string;
  category: string;
  method: PaymentMethod;
  institution: string;
  installments: number;
  notes?: string;
  /** Conta fixa que gerou este lançamento ("Paguei"). */
  billId?: string;
  /** Receita avulsa: de onde veio (não é salário nem renda do mês). */
  incomeKind?: IncomeKind;
}

export type IncomeKind = "trabalho" | "presente" | "venda" | "reembolso" | "outro";

export type AlertKind = "preco-acima" | "preco-abaixo" | "variacao-dia" | "abaixo-media" | "lembrete";

export interface PriceAlert {
  id: string;
  kind: AlertKind;
  symbol?: string;
  value?: number;
  title?: string;
  message?: string;
  remindAt?: string;
  active: boolean;
  repeat: boolean;
  createdAt: string;
}

export interface AlertRuntimeState {
  fired: boolean;
  firedAt?: string;
  /** Última mudança (disparo ou rearme), para juntar o estado de dois aparelhos. */
  changedAt?: string;
  lastValue?: number;
}

export type NotificationType = "mercado" | "carteira" | "alerta" | "dica" | "sistema" | "noticia";
export type Tone = "positive" | "negative" | "neutral" | "info";

export interface AppNotification {
  id: string;
  /** Chave da ocorrência (a mesma em todos os aparelhos): um aviso com esta chave nunca é dado de novo. */
  key?: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  symbol?: string;
  tone?: Tone;
  link?: string;
}

export interface LessonRecord {
  score: number;
  total: number;
  xp: number;
  completedAt: string;
  approved: boolean;
}

export interface LearningState {
  xp: number;
  completed: Record<string, LessonRecord>;
  streak: { count: number; lastDate: string };
  badges: string[];
}

export interface SimPosition {
  symbol: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currency: string;
}

export interface SimTrade {
  id: string;
  side: "compra" | "venda";
  symbol: string;
  quantity: number;
  price: number;
  date: string;
}

export interface SimulatorState {
  cash: number;
  startedAt: string;
  positions: SimPosition[];
  history: SimTrade[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  error?: boolean;
  mode?: AiMode;
  /** Conversa a que a mensagem pertence (as antigas, sem id, ficam numa conversa por modo). */
  conversationId?: string;
  /** Modelo que respondeu, para o Dono ver discretamente. */
  model?: string;
  /** A sugestão de "lembrar" desta resposta já foi salva ou ignorada. */
  memoryHandled?: boolean;
}

/** Algo que o usuário contou e o Assistente guarda para as próximas conversas. */
export interface MemoryItem {
  id: string;
  text: string;
  createdAt: string;
}

/** Fatura do cartão de um banco em um mês. */
export interface Invoice {
  id: string;
  institution: string;
  ym: string;
  amount: number;
  dueDay?: number;
  minimumPayment?: number;
  paid: boolean;
  notes?: string;
}

export type AiMode = "geral" | "professor" | "app" | "financas" | "mercado" | "compras";

export interface UserDataMap {
  profile: FinancialProfile;
  settings: UserSettings;
  portfolio: Holding[];
  goals: Goal[];
  expenses: Expense[];
  alerts: PriceAlert[];
  learning: LearningState;
  simulator: SimulatorState;
  chat: ChatMessage[];
  invoices: Invoice[];
  accounts: BankAccount[];
  bills: Bill[];
  memory: MemoryItem[];
  planned: PlannedExpense[];
  wealth: WealthState;
  boxes: SavingBox[];
}

/** Caixinha: guarda um valor todo mês num dia fixo, até a meta. */
export interface SavingBox {
  id: string;
  name: string;
  /** Meta (0 = sem meta). */
  target: number;
  monthly: number;
  /** Dia do mês em que o valor é guardado. */
  day: number;
  balance: number;
  /** Último mês (AAAA-MM) em que o depósito automático foi feito. */
  lastDeposit?: string;
  history: { date: string; amount: number; note?: string }[];
  active: boolean;
  createdAt: string;
}

export type WealthStyle = "seguro" | "equilibrado" | "crescimento";

/** Respostas do questionário do plano de investimento. */
export interface WealthAnswers {
  goal: string;
  years: number;
  /** Quanto consegue guardar por mês (pode ser R$ 1). */
  monthly: number;
  /** Quanto já tem guardado para começar. */
  start: number;
  style: WealthStyle;
  notes?: string;
}

export interface WealthPlan extends SavingPlan {
  sources: { title: string; url: string }[];
  /** Usou a pesquisa na internet ou só a base do app. */
  searched: boolean;
}

export interface WealthState {
  answers?: WealthAnswers;
  plan?: WealthPlan;
}

/** Passo de um plano montado pelo Assistente (vira checklist). */
export interface PlanStep {
  id: string;
  text: string;
  /** AAAA-MM-DD, quando o passo tem data. */
  date?: string;
  done: boolean;
}

export interface SavingPlan {
  createdAt: string;
  /** Plano completo em Markdown, como o Assistente escreveu. */
  text: string;
  steps: PlanStep[];
}

/** Gasto que ainda vai acontecer (projeto da faculdade, viagem, presente…). */
export interface PlannedExpense {
  id: string;
  description: string;
  amount: number;
  /** AAAA-MM-DD */
  date: string;
  notes?: string;
  done: boolean;
  plan?: SavingPlan;
}

/** Conta que se repete todo mês (aluguel, internet, assinatura). */
export interface Bill {
  id: string;
  name: string;
  amount: number;
  /** Dia do vencimento (1 a 31; em meses mais curtos vale o último dia). */
  dueDay: number;
  category: string;
  institution?: string;
  /** Meses (AAAA-MM) já pagos. */
  paid: string[];
  active: boolean;
  /** Gasto obrigatório do mês (transporte, aluguel, luz…). */
  mandatory?: boolean;
}

/** Saldo de uma conta (corrente, poupança ou carteira digital), informado pela pessoa. */
export interface BankAccount {
  id: string;
  institution: string;
  balance: number;
  updatedAt: string;
  notes?: string;
  /** Só tem o cartão neste banco (sem saldo em conta). */
  cardOnly?: boolean;
  card?: CreditCardInfo;
}

/** Cartão de crédito de um banco: limite total, fechamento e vencimento. */
export interface CreditCardInfo {
  limit: number;
  closingDay?: number;
  dueDay?: number;
}

export type UserDataKey = keyof UserDataMap;

export const USER_DATA_KEYS: UserDataKey[] = [
  "profile",
  "settings",
  "portfolio",
  "goals",
  "expenses",
  "alerts",
  "learning",
  "simulator",
  "chat",
  "invoices",
  "accounts",
  "bills",
  "memory",
  "planned",
  "wealth",
  "boxes",
];

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose?: number;
  open?: number;
  dayHigh?: number;
  dayLow?: number;
  volume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  marketCap?: number;
  pe?: number;
  priceToBook?: number;
  dividendYield?: number;
  eps?: number;
  currency: string;
  marketState?: string;
  exchange?: string;
  delayMinutes?: number;
  time: number;
}

export type ChartRange = "1D" | "5D" | "1M" | "6M" | "1A" | "5A" | "MAX";

export interface ChartPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ChartData {
  symbol: string;
  range: ChartRange;
  currency: string;
  previousClose?: number;
  intraday: boolean;
  /** No 1D, quando o pregão do dia ainda não tem pontos: mostra o último pregão. */
  lastSession?: boolean;
  points: ChartPoint[];
}

export interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  category: AssetCategory;
}

export interface SeriesValue {
  value: number;
  date: string;
}

export interface Indicators {
  selic?: SeriesValue;
  cdi?: SeriesValue;
  ipcaMonth?: SeriesValue;
  ipca12m?: SeriesValue;
  dollarPtax?: SeriesValue & { change?: number };
  euroPtax?: SeriesValue;
  savingsMonth?: SeriesValue;
  tr?: SeriesValue;
  focus?: FocusExpectations;
  updatedAt: string;
}

export interface FocusExpectations {
  date: string;
  ipcaYear?: { year: number; value: number };
  selicYear?: { year: number; value: number };
  pibYear?: { year: number; value: number };
  dollarYear?: { year: number; value: number };
  nextMeeting?: { meeting: string; value: number };
  /** Medianas ano a ano, do ano atual em diante: Selic no fim de cada ano e IPCA de cada ano. */
  selicPath?: { year: number; value: number }[];
  ipcaPath?: { year: number; value: number }[];
}

export interface CopomMeeting {
  start: string;
  decision: string;
}

export interface CopomInfo {
  current?: number;
  lastMeeting?: {
    date: string;
    outcome: "manteve" | "elevou" | "reduziu" | "aguardando";
    from?: number;
    to?: number;
  };
  nextMeeting?: CopomMeeting;
  history: { date: string; from: number; to: number }[];
  expectation?: { meeting: string; value: number; date: string };
}

export interface TesouroTitle {
  name: string;
  kind: string;
  maturity: string;
  buyRate?: number;
  sellRate?: number;
  unitPrice?: number;
  minInvestment?: number;
  sellPrice?: number;
  indexer: "SELIC" | "IPCA" | "PRE" | "IGPM" | "OUTRO";
  canBuy: boolean;
}

export interface TesouroData {
  titles: TesouroTitle[];
  updatedAt: string;
  source: string;
}

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  summary?: string;
  image?: string;
}

export interface CreditRate {
  modality: string;
  institution: string;
  bankId?: string;
  rateMonth: number;
  rateYear: number;
  position: number;
  period: string;
}

export interface CreditRatesData {
  period?: string;
  modalities: { key: string; label: string; rates: CreditRate[] }[];
  updatedAt: string;
}

export interface BankScore {
  bankId: string;
  score: number;
  liquidYield: number;
  netYield1y: number;
  creditPercentile?: number;
  reasons: string[];
}

export interface BanksData {
  cdi?: number;
  selic?: number;
  scores: BankScore[];
  credit: CreditRatesData;
  updatedAt: string;
}

export type AiProvider = "nvidia" | "groq";

export interface AiConfigInfo {
  /** Alguma chave de IA configurada (Groq ou NVIDIA). */
  hasKey: boolean;
  /** Só o Dono vê e muda a configuração (modelo, chave, erros técnicos). */
  canManage: boolean;
  /** "auto" ou o id do modelo escolhido. Só para o Dono. */
  choice?: string;
  /** Modelo que responde primeiro agora. Só para o Dono. */
  model?: string;
  /** Nome amigável do modelo que responde primeiro, com o provedor (ex.: "Llama 3.3 70B · Groq"). */
  modelLabel?: string;
  hasNvidia?: boolean;
  keyPreview?: string;
  /** Chave grátis da Groq (bem mais rápida). */
  hasGroq?: boolean;
  groqPreview?: string;
  /** "auto" ou o id do modelo da Groq escolhido. */
  groqChoice?: string;
  /** Qual provedor tenta primeiro quando os dois estão configurados. */
  primary?: AiProvider;
  /** Quem respondeu por último neste aparelho (ex.: "Llama 3.3 70B · Groq"). */
  lastUsedLabel?: string;
  /** Última resposta boa e último erro de cada provedor. */
  providers?: Partial<Record<AiProvider, AiProviderHealth>>;
  baseUrl?: string;
  source?: "app" | "arquivo" | "ambiente" | null;
  catalogUpdatedAt?: string;
  /** Pesquisa na internet disponível (funciona sem chave). */
  hasSearch?: boolean;
  /** Chave opcional da pesquisa (Tavily ou Brave), se o Dono configurou. */
  searchProvider?: "tavily" | "brave";
  searchPreview?: string;
}

export interface AiProviderHealth {
  okAt?: string;
  /** Ex.: "Groq: 401 Invalid API Key". */
  error?: { at: string; message: string };
}

export interface AiModelInfo {
  id: string;
  label: string;
  publisher: string;
  score: number;
  tags: string[];
}

export interface AiCatalog {
  models: AiModelInfo[];
  best?: string;
  updatedAt?: string;
  /** Modelos da Groq disponíveis (quando há chave da Groq). */
  groq?: AiModelInfo[];
}

export interface AiChatRequest {
  requestId: string;
  messages: { role: "user" | "assistant"; content: string }[];
  mode?: AiMode;
  /** Dados extras anexados à pergunta (fatura, compra analisada etc.). */
  attachment?: string;
  /** Pesquisar na internet antes de responder (se o Dono configurou a pesquisa). */
  web?: boolean;
}

export interface AiEvent {
  requestId: string;
  /** "model": nome do modelo que está respondendo (só para o Dono); "replace": texto inteiro corrigido (trecho em inglês traduzido). */
  type: "chunk" | "done" | "error" | "context" | "model" | "replace";
  data?: string;
}

export interface PortfolioHistoryPoint {
  time: number;
  value: number;
  invested: number;
}

export type ApiError = { code: string; message: string };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface DealOffer {
  store: string;
  price: number;
  currency: string;
  priceBrl?: number;
  regularPrice?: number;
  discountPercent?: number;
  url?: string;
}

export interface DealCheck {
  query: string;
  kind: "jogo" | "produto";
  title?: string;
  image?: string;
  source?: string;
  url?: string;
  currentPrice?: number;
  /** Preço atual em reais (convertido pelo dólar do dia quando a loja cobra em outra moeda). */
  currentPriceBrl?: number;
  currency: string;
  regularPrice?: number;
  discountPercent?: number;
  lowestPrice?: { price: number; currency: string; priceBrl?: number; date?: string; note: string };
  offers: DealOffer[];
  historyLinks: { label: string; url: string }[];
  notes: string[];
  budget: { monthBalance: number; invoicesOpen: number; emergencyReserve: number; monthlyIncome: number; accountsBalance?: number; available?: number };
}

/** Evento da IA para a aba de Logs do Dono. */
export interface AiLogEntry {
  at: string;
  /** "aviso": algo que o app corrigiu sozinho (resposta em inglês, resposta longa continuada). */
  kind: "ok" | "erro" | "troca" | "cancelado" | "aviso";
  model: string;
  /** Código interno (AI_DOWN, AI_SLOW, AI_AUTH…). */
  code?: string;
  /** Código HTTP do provedor (404, 429, 500…). */
  status?: number;
  message?: string;
  /** Trecho da resposta do servidor. */
  detail?: string;
  ms?: number;
}
