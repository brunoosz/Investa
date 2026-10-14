import { strikeFromExpenses, SHOPPING_CATALOG, matchShopping, findCatalog, suggestCatalog, itemPrice, summarizeShopping } from "@shared/shopping";
const it = (name: string, extra: any = {}) => ({ id: name, name, quantity: 1, category: "alimentos", status: "pendente", createdAt: "", ...extra }) as any;
const ok = (c: boolean, m: string) => { console.log((c ? "OK  " : "FAIL") + " " + m); if (!c) process.exitCode = 1; };
ok(SHOPPING_CATALOG.length >= 145, "catálogo " + SHOPPING_CATALOG.length);
ok(matchShopping("leite", [it("Leite integral")])?.name === "Leite integral", "leite -> Leite integral");
ok(matchShopping("Leite Integral Italac", [it("leite")])?.name === "leite", "descrição maior -> leite");
ok(matchShopping("LEITES", [it("Leite integral")])?.name === "Leite integral", "plural/maiúsculas");
ok(matchShopping("feijões", [it("Feijão")])?.name === "Feijão", "feijões -> Feijão");
ok(matchShopping("Pão", [it("pães de queijo")])?.name === "pães de queijo", "pão -> pães de queijo");
ok(!matchShopping("mercado", [it("Leite")]), "mercado não casa");
ok(!matchShopping("leite", [it("Leite", { status: "comprado" })]), "comprado ignorado");
ok(matchShopping("leite condensado", [it("Leite integral"), it("Leite condensado")])?.name === "Leite condensado", "melhor correspondência");
ok(findCatalog("leite condensado")?.name === "Leite condensado", "catálogo específico");
ok(findCatalog("Café pilão")?.name === "Café 500 g", "café pilão -> café");
ok(suggestCatalog("deter")[0]?.name.startsWith("Detergente"), "sugestão deter");
ok(suggestCatalog("fone").length > 0, "sugestão fone");
ok(itemPrice(it("leite", { quantity: 2 })).source === "estimado" && itemPrice(it("leite", { quantity: 2 })).total === 11, "estimado x2");
ok(itemPrice(it("leite", { price: 4 })).source === "informado", "informado vale mais");
ok(itemPrice(it("xyzabc")).source === "sem", "sem preço");
const s = summarizeShopping([it("leite"), it("xyz"), it("arroz", { price: 30 }), it("Fone", { category: "eletronicos", status: "comprado", paid: 70 })]);
ok(s.pending.count === 3 && s.pending.noPrice === 1 && s.pending.informed === 30 && s.pending.estimated === 5.5, "totais pendentes");
ok(s.bought.informed === 70, "comprado usa pago");
{
  const items = [it("Leite integral"), it("Arroz")];
  const r = strikeFromExpenses([{ id: "a" }], [{ id: "a", type: "despesa", description: "Leite", amount: 9, date: "2026-10-01" }, { id: "b", type: "despesa", description: "leites", amount: 12, date: "2026-10-14" }, { id: "c", type: "receita", description: "Arroz", amount: 1, date: "2026-10-14" }], items);
  ok(r.struck.length === 1 && r.items[0].status === "comprado" && r.items[0].paid === 12 && r.items[0].boughtAt === "2026-10-14" && r.items[1].status === "pendente", "risco automático só para gasto novo");
}
