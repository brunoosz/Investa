import type { ShoppingCategory, ShoppingItem } from "./types";

export const SHOPPING_CATEGORIES: { id: ShoppingCategory; label: string; emoji: string }[] = [
  { id: "alimentos", label: "Alimentos", emoji: "🥫" },
  { id: "bebidas", label: "Bebidas", emoji: "🥤" },
  { id: "limpeza", label: "Limpeza", emoji: "🧽" },
  { id: "higiene", label: "Higiene", emoji: "🧴" },
  { id: "casa", label: "Casa", emoji: "🏠" },
  { id: "eletronicos", label: "Eletrônicos", emoji: "🎧" },
  { id: "jogos", label: "Jogos", emoji: "🎮" },
  { id: "roupas", label: "Roupas", emoji: "👕" },
  { id: "outros", label: "Outros", emoji: "📦" },
];

export function categoryLabel(id: ShoppingCategory): string {
  return SHOPPING_CATEGORIES.find((c) => c.id === id)?.label ?? "Outros";
}

export interface CatalogItem {
  name: string;
  aliases: string[];
  category: ShoppingCategory;
  /** Preço médio em reais, por unidade/pacote comum. */
  price: number;
  /** Mês (AAAA-MM) em que o preço foi revisado. */
  updated: string;
}

const UPDATED = "2026-10";

// nome, apelidos, preço médio. Valores de referência de mercado/varejo no Brasil; servem só como estimativa.
const RAW: Record<ShoppingCategory, [string, string[], number][]> = {
  alimentos: [
    ["Arroz 5 kg", ["arroz", "arroz branco", "arroz tipo 1"], 27.9],
    ["Feijão carioca 1 kg", ["feijao", "feijao carioca"], 8.5],
    ["Feijão preto 1 kg", ["feijao preto"], 9.2],
    ["Açúcar 1 kg", ["acucar", "acucar refinado", "acucar cristal"], 5.2],
    ["Sal 1 kg", ["sal", "sal refinado"], 3.5],
    ["Café 500 g", ["cafe", "cafe em po", "po de cafe"], 24.9],
    ["Óleo de soja 900 ml", ["oleo", "oleo de soja"], 8.9],
    ["Azeite 500 ml", ["azeite", "azeite de oliva"], 34.9],
    ["Macarrão 500 g", ["macarrao", "espaguete", "massa", "miojo"], 5.5],
    ["Farinha de trigo 1 kg", ["farinha", "farinha de trigo"], 5.9],
    ["Farinha de mandioca 1 kg", ["farofa", "farinha de mandioca"], 7.9],
    ["Fubá 1 kg", ["fuba"], 4.9],
    ["Leite integral 1 L", ["leite", "leite integral", "leite desnatado", "leite semidesnatado"], 5.5],
    ["Leite condensado", ["leite condensado"], 7.5],
    ["Creme de leite", ["creme de leite"], 4.2],
    ["Manteiga 200 g", ["manteiga"], 13.9],
    ["Margarina 500 g", ["margarina"], 9.5],
    ["Queijo muçarela 500 g", ["queijo", "mussarela", "mucarela", "queijo mussarela"], 27.9],
    ["Presunto 200 g", ["presunto"], 8.9],
    ["Requeijão", ["requeijao"], 9.9],
    ["Iogurte", ["iogurte", "danone"], 6.5],
    ["Ovos (dúzia)", ["ovo", "ovos", "duzia de ovos"], 12.9],
    ["Pão francês (kg)", ["pao", "pao frances", "pao de sal"], 16.9],
    ["Pão de forma", ["pao de forma", "pao de sanduiche"], 9.9],
    ["Biscoito", ["biscoito", "bolacha", "cookie"], 4.5],
    ["Bolo pronto", ["bolo"], 14.9],
    ["Peito de frango (kg)", ["frango", "peito de frango", "file de frango"], 19.9],
    ["Coxa e sobrecoxa (kg)", ["coxa", "sobrecoxa"], 14.9],
    ["Carne moída (kg)", ["carne moida", "patinho moido"], 36.9],
    ["Alcatra (kg)", ["alcatra", "bife", "carne"], 49.9],
    ["Linguiça (kg)", ["linguica", "calabresa"], 24.9],
    ["Salsicha (kg)", ["salsicha", "hot dog"], 13.9],
    ["Peixe (kg)", ["peixe", "tilapia", "file de peixe"], 39.9],
    ["Atum em lata", ["atum"], 9.9],
    ["Sardinha em lata", ["sardinha"], 5.9],
    ["Batata (kg)", ["batata", "batata inglesa"], 6.5],
    ["Cebola (kg)", ["cebola"], 5.9],
    ["Alho 200 g", ["alho"], 7.9],
    ["Tomate (kg)", ["tomate"], 8.5],
    ["Cenoura (kg)", ["cenoura"], 5.5],
    ["Alface", ["alface", "salada"], 3.9],
    ["Banana (kg)", ["banana"], 6.9],
    ["Maçã (kg)", ["maca"], 10.9],
    ["Laranja (kg)", ["laranja"], 5.5],
    ["Limão (kg)", ["limao"], 6.9],
    ["Mamão", ["mamao", "papaia"], 8.9],
    ["Abacate (kg)", ["abacate"], 9.9],
    ["Molho de tomate", ["molho", "molho de tomate", "extrato de tomate"], 3.9],
    ["Maionese", ["maionese"], 8.9],
    ["Ketchup", ["ketchup"], 9.5],
    ["Achocolatado 400 g", ["achocolatado", "nescau", "toddy"], 10.9],
    ["Chocolate (barra)", ["chocolate", "barra de chocolate"], 8.9],
    ["Granola", ["granola", "aveia"], 14.9],
    ["Cereal matinal", ["cereal", "sucrilhos"], 15.9],
    ["Pipoca de micro-ondas", ["pipoca"], 4.9],
    ["Batata chips", ["salgadinho", "chips", "doritos", "ruffles"], 9.9],
    ["Sorvete 1,5 L", ["sorvete"], 22.9],
    ["Pizza congelada", ["pizza", "pizza congelada"], 21.9],
    ["Lasanha congelada", ["lasanha"], 19.9],
    ["Hambúrguer congelado", ["hamburguer"], 16.9],
    ["Ração para cachorro 10 kg", ["racao", "racao de cachorro", "racao para cachorro"], 119.9],
    ["Ração para gato 3 kg", ["racao de gato", "racao para gato"], 64.9],
  ],
  bebidas: [
    ["Água mineral 1,5 L", ["agua", "agua mineral"], 3.2],
    ["Galão de água 20 L", ["galao", "galao de agua"], 14],
    ["Refrigerante 2 L", ["refrigerante", "refri", "coca", "coca cola", "guarana"], 10.9],
    ["Suco de caixinha 1 L", ["suco", "suco de caixinha"], 8.9],
    ["Cerveja lata 350 ml", ["cerveja", "latinha"], 4.5],
    ["Cerveja (pack 12)", ["pack de cerveja", "fardo de cerveja"], 45.9],
    ["Energético", ["energetico", "red bull", "monster"], 9.9],
    ["Chá (caixa)", ["cha", "cha em sache"], 6.9],
    ["Vinho", ["vinho"], 39.9],
    ["Café em cápsula (10 un.)", ["capsula", "capsula de cafe", "nespresso"], 24.9],
    ["Leite vegetal 1 L", ["leite de amendoa", "leite vegetal", "leite de aveia"], 15.9],
    ["Isotônico", ["isotonico", "gatorade"], 6.5],
  ],
  limpeza: [
    ["Detergente 500 ml", ["detergente", "lava loucas"], 2.9],
    ["Sabão em pó 1,6 kg", ["sabao em po", "omo", "sabao"], 22.9],
    ["Sabão líquido 3 L", ["sabao liquido", "lava roupas"], 39.9],
    ["Amaciante 2 L", ["amaciante"], 19.9],
    ["Água sanitária 2 L", ["agua sanitaria", "candida", "cloro"], 7.9],
    ["Desinfetante 2 L", ["desinfetante", "pinho sol"], 12.9],
    ["Multiuso 500 ml", ["multiuso", "veja"], 6.9],
    ["Esponja (pacote)", ["esponja", "bucha"], 6.5],
    ["Saco de lixo (pacote)", ["saco de lixo", "lixo"], 11.9],
    ["Papel toalha", ["papel toalha"], 8.9],
    ["Álcool 70% 1 L", ["alcool", "alcool 70", "alcool em gel"], 9.9],
    ["Limpa vidros", ["limpa vidro", "limpa vidros"], 9.9],
    ["Lustra móveis", ["lustra moveis", "polidor"], 10.9],
    ["Pano de chão", ["pano de chao", "pano"], 7.9],
    ["Vassoura", ["vassoura"], 22.9],
    ["Rodo", ["rodo"], 19.9],
    ["Inseticida", ["inseticida", "baygon", "repelente de insetos"], 18.9],
    ["Tira manchas", ["tira manchas", "vanish"], 21.9],
  ],
  higiene: [
    ["Papel higiênico (12 rolos)", ["papel higienico", "papel"], 21.9],
    ["Sabonete", ["sabonete"], 2.9],
    ["Sabonete líquido", ["sabonete liquido"], 12.9],
    ["Shampoo", ["shampoo", "xampu"], 19.9],
    ["Condicionador", ["condicionador"], 19.9],
    ["Creme dental", ["pasta de dente", "creme dental", "colgate"], 5.9],
    ["Escova de dente", ["escova de dente", "escova"], 9.9],
    ["Fio dental", ["fio dental"], 8.9],
    ["Enxaguante bucal", ["enxaguante", "listerine"], 21.9],
    ["Desodorante", ["desodorante"], 15.9],
    ["Absorvente", ["absorvente"], 9.9],
    ["Fralda (pacote)", ["fralda"], 59.9],
    ["Lenço umedecido", ["lenco umedecido"], 12.9],
    ["Aparelho de barbear", ["gilete", "barbeador", "aparelho de barbear"], 19.9],
    ["Algodão", ["algodao"], 6.9],
    ["Cotonete", ["cotonete", "haste flexivel"], 7.9],
    ["Protetor solar", ["protetor solar", "filtro solar"], 49.9],
    ["Hidratante", ["hidratante", "creme hidratante"], 24.9],
    ["Remédio para dor", ["remedio", "dipirona", "paracetamol", "analgesico"], 12.9],
  ],
  casa: [
    ["Lâmpada LED", ["lampada", "lampada led"], 12.9],
    ["Pilha AA (4 un.)", ["pilha", "pilhas"], 19.9],
    ["Extensão / filtro de linha", ["extensao", "filtro de linha", "benjamim"], 39.9],
    ["Toalha de banho", ["toalha", "toalha de banho"], 39.9],
    ["Jogo de lençol", ["lencol", "jogo de cama"], 89.9],
    ["Travesseiro", ["travesseiro"], 49.9],
    ["Cobertor", ["cobertor", "edredom", "manta"], 99.9],
    ["Panela", ["panela"], 79.9],
    ["Frigideira", ["frigideira"], 69.9],
    ["Jogo de pratos", ["prato", "pratos"], 89.9],
    ["Copos (jogo)", ["copo", "copos"], 39.9],
    ["Talheres (jogo)", ["talher", "talheres", "garfo", "faca", "colher"], 59.9],
    ["Pote plástico (jogo)", ["pote", "potes", "tupperware"], 34.9],
    ["Papel alumínio", ["papel aluminio"], 9.9],
    ["Filme PVC", ["filme pvc", "plastico filme"], 8.9],
    ["Filtro de café", ["filtro de cafe", "filtro de papel"], 5.9],
    ["Vela", ["vela", "velas"], 6.9],
    ["Gás de cozinha (botijão)", ["gas", "botijao", "gas de cozinha"], 115],
    ["Cortina", ["cortina"], 79.9],
    ["Tapete", ["tapete"], 69.9],
    ["Cadeira", ["cadeira"], 149.9],
    ["Ventilador", ["ventilador"], 179.9],
    ["Ferro de passar", ["ferro", "ferro de passar"], 99.9],
  ],
  eletronicos: [
    ["Fone de ouvido", ["fone", "fone de ouvido", "headphone", "headset"], 79.9],
    ["Fone Bluetooth", ["fone bluetooth", "fone sem fio", "airpods"], 149.9],
    ["Carregador de celular", ["carregador", "fonte"], 49.9],
    ["Cabo USB-C", ["cabo", "cabo usb", "cabo usb c"], 29.9],
    ["Power bank", ["power bank", "bateria externa", "carregador portatil"], 119.9],
    ["Capinha de celular", ["capinha", "capa de celular"], 29.9],
    ["Película de celular", ["pelicula"], 24.9],
    ["Mouse", ["mouse"], 59.9],
    ["Teclado", ["teclado"], 99.9],
    ["Pen drive 64 GB", ["pen drive", "pendrive"], 39.9],
    ["Cartão de memória 128 GB", ["cartao de memoria", "micro sd"], 69.9],
    ["Caixa de som Bluetooth", ["caixa de som", "jbl", "som"], 199.9],
    ["Smartwatch", ["smartwatch", "relogio inteligente"], 299.9],
    ["Celular intermediário", ["celular", "smartphone"], 1499],
    ["Notebook", ["notebook", "laptop"], 3299],
    ["Monitor", ["monitor"], 899],
    ["Smart TV 50\"", ["tv", "televisao", "smart tv"], 2399],
    ["Roteador Wi-Fi", ["roteador", "wifi"], 179.9],
    ["Webcam", ["webcam", "camera"], 159.9],
  ],
  jogos: [
    ["Jogo de console", ["jogo", "game", "jogo de console", "jogo de ps5", "jogo de xbox", "jogo de switch"], 299.9],
    ["Jogo de PC (Steam)", ["jogo de pc", "steam"], 99.9],
    ["Controle de videogame", ["controle", "joystick", "dualsense"], 399.9],
    ["Console (videogame)", ["console", "videogame", "playstation", "ps5", "xbox", "nintendo switch"], 3799],
    ["Assinatura Game Pass/PS Plus (mês)", ["game pass", "ps plus", "assinatura de jogo"], 49.9],
    ["Gift card de jogos", ["gift card", "cartao presente", "credito de jogo"], 100],
    ["Jogo de tabuleiro", ["jogo de tabuleiro", "tabuleiro"], 149.9],
    ["Baralho", ["baralho", "cartas"], 19.9],
    ["Headset gamer", ["headset gamer"], 249.9],
    ["Cadeira gamer", ["cadeira gamer"], 999],
  ],
  roupas: [
    ["Camiseta", ["camiseta", "camisa", "blusa"], 49.9],
    ["Calça jeans", ["calca", "calca jeans", "jeans"], 129.9],
    ["Bermuda", ["bermuda", "short"], 69.9],
    ["Moletom", ["moletom", "casaco", "blusa de frio"], 149.9],
    ["Jaqueta", ["jaqueta"], 199.9],
    ["Tênis", ["tenis", "sapato"], 299.9],
    ["Chinelo", ["chinelo", "havaianas"], 39.9],
    ["Meia (par)", ["meia", "meias"], 14.9],
    ["Cueca", ["cueca"], 24.9],
    ["Calcinha", ["calcinha"], 19.9],
    ["Sutiã", ["sutia"], 59.9],
    ["Pijama", ["pijama"], 79.9],
    ["Boné", ["bone"], 59.9],
    ["Mochila", ["mochila"], 149.9],
    ["Uniforme / roupa de academia", ["roupa de academia", "legging", "uniforme"], 89.9],
  ],
  outros: [
    ["Caderno", ["caderno"], 24.9],
    ["Caneta (kit)", ["caneta", "canetas"], 12.9],
    ["Livro", ["livro"], 59.9],
    ["Presente", ["presente", "lembrancinha"], 80],
    ["Flores", ["flor", "flores", "buque"], 59.9],
    ["Recarga de celular", ["recarga", "credito de celular"], 30],
    ["Cartão de transporte (recarga)", ["passagem", "bilhete unico", "recarga de transporte"], 50],
  ],
};

export const SHOPPING_CATALOG: CatalogItem[] = (Object.keys(RAW) as ShoppingCategory[]).flatMap((category) =>
  RAW[category].map(([name, aliases, price]) => ({ name, aliases, category, price, updated: UPDATED }))
);

const STOP = new Set(["de", "da", "do", "das", "dos", "e", "com", "sem", "para", "pra", "a", "o", "em", "un", "und", "kg", "g", "ml", "l", "lt", "pct", "pacote", "cx", "caixa"]);

/** Plural simples do português ("feijões" → "feijao", "pães" → "pao", "colheres" → "colher"). */
function singular(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("oes") || w.endsWith("aes")) return `${w.slice(0, -3)}ao`;
  if (w.endsWith("ns")) return `${w.slice(0, -2)}m`;
  if (/[rsz]es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("is") && w.length > 4) return `${w.slice(0, -2)}l`;
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
}

/** Minúsculas, sem acento nem pontuação. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function nameTokens(s: string): string[] {
  return normalizeName(s)
    .split(" ")
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w))
    .map(singular);
}

/** Sugestões do catálogo para o que está sendo digitado (por nome ou apelido). */
export function suggestCatalog(query: string, max = 6): CatalogItem[] {
  const q = normalizeName(query);
  if (q.length < 2) return [];
  const qt = nameTokens(query);
  const scored: { item: CatalogItem; score: number }[] = [];
  for (const item of SHOPPING_CATALOG) {
    let best = 0;
    for (const term of [item.name, ...item.aliases]) {
      const t = normalizeName(term);
      if (t === q) best = Math.max(best, 100);
      else if (t.startsWith(q)) best = Math.max(best, 80 - t.length / 10);
      else if (t.split(" ").some((w) => w.startsWith(q))) best = Math.max(best, 60 - t.length / 10);
      else if (qt.length && qt.every((w) => nameTokens(term).includes(w))) best = Math.max(best, 50);
    }
    if (best > 0) scored.push({ item, score: best });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map((s) => s.item);
}

/** Item do catálogo que corresponde ao nome (para o preço médio). */
export function findCatalog(name: string): CatalogItem | undefined {
  const n = normalizeName(name);
  if (!n) return undefined;
  const exact = SHOPPING_CATALOG.find((c) => normalizeName(c.name) === n || c.aliases.some((a) => normalizeName(a) === n));
  if (exact) return exact;
  const tokens = nameTokens(name);
  if (!tokens.length) return undefined;
  // O apelido mais específico que cabe inteiro no nome ("leite condensado" ganha de "leite").
  let best: { item: CatalogItem; len: number } | undefined;
  for (const c of SHOPPING_CATALOG) {
    for (const term of [c.name, ...c.aliases]) {
      const tt = nameTokens(term);
      if (tt.length && tt.every((w) => tokens.includes(w)) && (!best || tt.length > best.len)) best = { item: c, len: tt.length };
    }
  }
  return best?.item;
}

export type PriceSource = "informado" | "estimado" | "pago" | "sem";

export interface ItemPrice {
  /** Valor total do item (unitário × quantidade, ou o que foi pago). */
  total: number;
  unit: number;
  source: PriceSource;
}

/** Preço do item: pago (se comprado com valor) > informado > médio do catálogo > sem preço. */
export function itemPrice(item: Pick<ShoppingItem, "name" | "quantity" | "price" | "status" | "paid">): ItemPrice {
  const qty = Math.max(1, item.quantity || 1);
  if (item.status === "comprado" && item.paid !== undefined && item.paid > 0) return { total: item.paid, unit: item.paid / qty, source: "pago" };
  if (item.price !== undefined && item.price > 0) return { total: item.price * qty, unit: item.price, source: "informado" };
  const c = findCatalog(item.name);
  if (c) return { total: c.price * qty, unit: c.price, source: "estimado" };
  return { total: 0, unit: 0, source: "sem" };
}

export interface ShoppingTotals {
  /** Soma do que tem preço informado/pago. */
  informed: number;
  /** Soma do que usa o preço médio do catálogo. */
  estimated: number;
  /** Itens sem preço nenhum (não somam, mas contam). */
  noPrice: number;
  count: number;
  total: number;
}

function emptyTotals(): ShoppingTotals {
  return { informed: 0, estimated: 0, noPrice: 0, count: 0, total: 0 };
}

function add(t: ShoppingTotals, p: ItemPrice): void {
  t.count += 1;
  if (p.source === "estimado") t.estimated += p.total;
  else if (p.source === "sem") t.noPrice += 1;
  else t.informed += p.total;
  t.total = t.informed + t.estimated;
}

export interface ShoppingSummary {
  byCategory: { category: ShoppingCategory; pending: ShoppingTotals; bought: ShoppingTotals }[];
  pending: ShoppingTotals;
  bought: ShoppingTotals;
}

export function summarizeShopping(items: ShoppingItem[]): ShoppingSummary {
  const map = new Map<ShoppingCategory, { pending: ShoppingTotals; bought: ShoppingTotals }>();
  const pending = emptyTotals();
  const bought = emptyTotals();
  for (const it of items) {
    const cat = SHOPPING_CATEGORIES.some((c) => c.id === it.category) ? it.category : "outros";
    if (!map.has(cat)) map.set(cat, { pending: emptyTotals(), bought: emptyTotals() });
    const p = itemPrice(it);
    const slot = map.get(cat)!;
    if (it.status === "comprado") {
      add(slot.bought, p);
      add(bought, p);
    } else {
      add(slot.pending, p);
      add(pending, p);
    }
  }
  const byCategory = SHOPPING_CATEGORIES.filter((c) => map.has(c.id)).map((c) => ({ category: c.id, ...map.get(c.id)! }));
  return { byCategory, pending, bought };
}

/**
 * Item pendente que corresponde a um gasto. Ignora maiúsculas, acentos e
 * plural; "leite" casa com "Leite integral" e "Leite integral Italac" casa
 * com "leite". Ganha o item com mais palavras em comum.
 */
export function matchShopping(description: string, items: ShoppingItem[]): ShoppingItem | undefined {
  const exp = nameTokens(description);
  if (!exp.length) return undefined;
  let best: { item: ShoppingItem; score: number } | undefined;
  for (const it of items) {
    if (it.status !== "pendente") continue;
    const tok = nameTokens(it.name);
    if (!tok.length) continue;
    const fits = exp.every((w) => tok.includes(w)) || tok.every((w) => exp.includes(w));
    if (!fits) continue;
    const score = tok.filter((w) => exp.includes(w)).length;
    if (!best || score > best.score) best = { item: it, score };
  }
  return best?.item;
}

/** Normaliza um item vindo de dados antigos ou de outra versão do app. */
export function sanitizeShoppingItem(raw: Partial<ShoppingItem>): ShoppingItem {
  const cat = SHOPPING_CATEGORIES.some((c) => c.id === raw.category) ? (raw.category as ShoppingCategory) : "outros";
  const qty = Number(raw.quantity);
  const price = Number(raw.price);
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? "").slice(0, 200),
    quantity: Number.isFinite(qty) && qty > 0 ? Math.min(qty, 9999) : 1,
    category: cat,
    price: Number.isFinite(price) && price > 0 ? price : undefined,
    status: raw.status === "comprado" ? "comprado" : "pendente",
    boughtAt: raw.boughtAt,
    paid: raw.paid,
    expenseId: raw.expenseId,
    createdAt: raw.createdAt ?? new Date().toISOString(),
  };
}
