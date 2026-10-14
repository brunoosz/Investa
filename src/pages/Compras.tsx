import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, FileDown, FileSpreadsheet, Minus, Plus, ShoppingCart, Sparkles, Trash } from "lucide-react";
import clsx from "clsx";
import type { ShoppingCategory, ShoppingItem } from "@shared/types";
import { currentYm, monthBudget, pendingFor, summarizeMonth } from "@shared/finance";
import { categoryLabel, findCatalog, itemPrice, SHOPPING_CATEGORIES, suggestCatalog, summarizeShopping, type CatalogItem, type ItemPrice, type ShoppingTotals } from "@shared/shopping";
import { api, uid } from "@/lib/api";
import { brl, dateBR } from "@/lib/format";
import { useSession, useUserData } from "@/store/session";
import { toastError, useUi } from "@/store/ui";
import { Private } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Field, Input, MoneyInput, Select, Toggle } from "@/components/ui/form";
import { ConfirmDialog, Sheet } from "@/components/ui/Sheet";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const MAX_QTY = 999;

const catColor = (c: ShoppingCategory) => `rgb(var(--cat-${c}))`;
const catTint = (c: ShoppingCategory, a: number) => `rgb(var(--cat-${c}) / ${a})`;

function PriceTag({ price, className }: { price: ItemPrice; className?: string }) {
  if (price.source === "sem") return <span className={clsx("text-muted/80", className)}>sem preço</span>;
  return (
    <Private className={clsx("tabular", price.source === "estimado" && "text-muted", className)}>
      {price.source === "estimado" ? "~" : ""}
      {brl(price.total)}
    </Private>
  );
}

function TotalsLine({ t }: { t: ShoppingTotals }) {
  const parts: React.ReactNode[] = [];
  if (t.informed)
    parts.push(
      <span key="i">
        <Private>{brl(t.informed)}</Private> informado
      </span>,
    );
  if (t.estimated)
    parts.push(
      <span key="e">
        <Private>~{brl(t.estimated)}</Private> estimado
      </span>,
    );
  if (t.noPrice) parts.push(<span key="n">{t.noPrice} sem preço</span>);
  if (!parts.length) return null;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
      {parts.map((p, i) => (
        <span key={i} className="whitespace-nowrap">
          {i > 0 && <span className="mr-2 text-muted/50">·</span>}
          {p}
        </span>
      ))}
    </span>
  );
}

/** Círculo de marcar: comprado enche com a cor da categoria. */
function CheckCircle({ done, category, onToggle, label }: { done: boolean; category: ShoppingCategory; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onToggle}
      className="pressable relative -m-2 p-2 shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <span
        className="grid place-items-center h-6 w-6 rounded-full border-2 transition-[background-color,border-color] duration-200"
        style={{
          borderColor: done ? catColor(category) : "rgb(var(--separator) / 0.35)",
          backgroundColor: done ? catColor(category) : "transparent",
        }}
      >
        <Check
          size={14}
          strokeWidth={3}
          className={clsx("text-white transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]", done ? "opacity-100 scale-100" : "opacity-0 scale-75")}
        />
      </span>
    </button>
  );
}

function ItemRow({ item, onToggle, onOpen, animate }: { item: ShoppingItem; onToggle: () => void; onOpen: () => void; animate: boolean }) {
  const done = item.status === "comprado";
  const price = itemPrice(item);
  const reduce = useReducedMotion();
  return (
    <motion.li
      layout={animate && !reduce ? "position" : false}
      initial={animate ? { opacity: 0, transform: reduce ? "none" : "translateY(-6px)" } : false}
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      exit={{
        opacity: 0,
        transform: reduce ? "none" : "scale(0.98)",
        transition: { duration: 0.15, ease: EASE_OUT },
      }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
      className="flex items-center gap-3 px-4 min-h-[56px] py-2"
    >
      <CheckCircle done={done} category={item.category} onToggle={onToggle} label={done ? `Desmarcar ${item.name}` : `Marcar ${item.name} como comprado`} />
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left flex items-center gap-3 py-1 outline-none rounded-lg focus-visible:ring-2 focus-visible:ring-primary/60">
        <span className="flex-1 min-w-0">
          <span className={clsx("strike t-body block truncate transition-colors duration-200", done ? "text-muted" : "text-fg")} data-done={done || undefined}>
            {item.name}
          </span>
          <span className="t-footnote text-muted block truncate">
            {item.quantity > 1 && <span className="tabular">{item.quantity}× · </span>}
            {done ? (
              <>
                Comprado
                {item.boughtAt ? ` em ${dateBR(item.boughtAt, { day: "2-digit", month: "short" })}` : ""}
                {item.paid ? (
                  <>
                    {" "}
                    · pagou <Private>{brl(item.paid)}</Private>
                  </>
                ) : null}
              </>
            ) : price.source === "estimado" ? (
              <>
                preço médio <Private>~{brl(price.unit)}</Private>
                {item.quantity > 1 ? " cada" : ""}
              </>
            ) : price.source === "informado" ? (
              item.quantity > 1 ? (
                <>
                  <Private>{brl(price.unit)}</Private> cada
                </>
              ) : (
                "preço informado"
              )
            ) : (
              "sem preço: toque para informar"
            )}
          </span>
        </span>
        <PriceTag price={price} className={clsx("t-body shrink-0 text-right", done && "line-through decoration-muted/60")} />
      </button>
    </motion.li>
  );
}

/** Campo de adicionar rápido, com sugestões do catálogo enquanto digita. */
function QuickAdd({ onAdd }: { onAdd: (name: string, qty: number, catalog?: CatalogItem) => void }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestions = useMemo(() => suggestCatalog(name, 6), [name]);
  const open = focused && suggestions.length > 0 && name.trim().length >= 2;

  const submit = (pick?: CatalogItem) => {
    const clean = (pick?.name ?? name).trim();
    if (!clean) return;
    onAdd(clean, qty, pick ?? findCatalog(clean));
    setName("");
    setQty(1);
    setActive(0);
    inputRef.current?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Enter usa o que foi digitado; a sugestão só entra se foi escolhida com as setas.
      submit(open && active > 0 ? suggestions[active - 1] : undefined);
    } else if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      setActive((a) => Math.min(suggestions.length, a + 1));
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Escape") {
      setFocused(false);
    }
  };

  return (
    <div className="relative">
      <div className="group-card flex items-center gap-2 p-2 pl-4">
        <Plus size={18} className="text-primary shrink-0" />
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => {
            setName(e.target.value.slice(0, 120));
            setActive(0);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={onKey}
          placeholder="Adicionar item (ex.: leite, detergente, fone)"
          aria-label="Nome do item"
          aria-autocomplete="list"
          aria-expanded={open}
          enterKeyHint="done"
          autoComplete="off"
          className="flex-1 min-w-0 bg-transparent outline-none t-body h-10 placeholder:text-muted/70 text-[16px] sm:text-[15px]"
        />
        <div className="flex items-center rounded-full bg-line/[0.07] shrink-0" aria-label="Quantidade">
          <button
            type="button"
            aria-label="Diminuir quantidade"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="pressable h-9 w-9 grid place-items-center text-muted hover:text-fg rounded-full"
          >
            <Minus size={15} />
          </button>
          <span className="tabular t-footnote font-semibold w-6 text-center">{qty}</span>
          <button
            type="button"
            aria-label="Aumentar quantidade"
            onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
            className="pressable h-9 w-9 grid place-items-center text-muted hover:text-fg rounded-full"
          >
            <Plus size={15} />
          </button>
        </div>
        <Button size="sm" onClick={() => submit()} disabled={!name.trim()} className="shrink-0">
          Adicionar
        </Button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, transform: "translateY(-4px) scale(0.98)" }}
            animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            style={{ transformOrigin: "top left" }}
            className="absolute z-30 left-0 right-0 mt-2 material-regular hairline border rounded-[var(--radius-lg)] shadow-2xl overflow-hidden py-1"
          >
            {suggestions.map((s, i) => (
              <li key={s.name} role="option" aria-selected={active === i + 1}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => submit(s)}
                  onMouseEnter={() => setActive(i + 1)}
                  className={clsx("w-full flex items-center gap-3 px-4 py-2.5 text-left", active === i + 1 && "bg-primary/10")}
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: catColor(s.category) }} />
                  <span className="flex-1 min-w-0 truncate t-body">{s.name}</span>
                  <span className="t-footnote text-muted shrink-0">{categoryLabel(s.category)}</span>
                  <span className="t-footnote tabular text-muted shrink-0">~{brl(s.price)}</span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function ItemSheet({ item, onClose, onSave, onRemove }: { item: ShoppingItem | null; onClose: () => void; onSave: (i: ShoppingItem) => void; onRemove: (i: ShoppingItem) => void }) {
  const [draft, setDraft] = useState<ShoppingItem | null>(item);
  const [last, setLast] = useState<ShoppingItem | null>(null);
  if (item !== last) {
    setLast(item);
    if (item) setDraft({ ...item });
  }
  const d = draft ?? item;
  const catalog = d ? findCatalog(d.name) : undefined;
  const valid = !!d && d.name.trim().length > 0 && d.quantity >= 1;
  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title="Editar item"
      subtitle={
        catalog ? `Preço médio de ${catalog.name}: ~${brl(catalog.price)} (atualizado em ${catalog.updated.slice(5)}/${catalog.updated.slice(0, 4)})` : "Fora do catálogo: informe o preço, se souber."
      }
      footer={
        d && (
          <>
            <Button variant="danger" icon={Trash} className="mr-auto" onClick={() => onRemove(d)}>
              Excluir
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={!valid} onClick={() => onSave({ ...d, name: d.name.trim() })}>
              Salvar
            </Button>
          </>
        )
      }
    >
      {d && (
        <div className="space-y-4">
          <Field label="Nome">
            <Input value={d.name} maxLength={120} onChange={(e) => setDraft({ ...d, name: e.target.value })} className="text-[16px] sm:text-[15px]" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantidade">
              <Input
                inputMode="numeric"
                value={d.quantity || ""}
                onChange={(e) =>
                  setDraft({
                    ...d,
                    quantity: Math.min(MAX_QTY, Number(e.target.value.replace(/\D/g, "")) || 0),
                  })
                }
                className="text-[16px] sm:text-[15px]"
              />
            </Field>
            <Field label="Categoria">
              <Select
                value={d.category}
                onChange={(e) =>
                  setDraft({
                    ...d,
                    category: e.target.value as ShoppingCategory,
                  })
                }
                className="text-[16px] sm:text-[15px]"
              >
                {SHOPPING_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field
            label="Preço por unidade (opcional)"
            hint={catalog ? `Em branco, usa o preço médio (~${brl(catalog.price)}). O que você digitar sempre vale mais.` : 'Em branco, o item fica como "sem preço" e não soma no total.'}
          >
            <MoneyInput
              value={d.price ?? 0}
              placeholder={catalog ? catalog.price.toFixed(2).replace(".", ",") : "0,00"}
              onChange={(v) =>
                setDraft({
                  ...d,
                  price: v > 0 ? Math.min(v, 10_000_000) : undefined,
                })
              }
            />
          </Field>
          <div className="flex items-center justify-between rounded-2xl bg-line/[0.04] px-4 py-3">
            <div>
              <div className="font-medium text-[14.5px]">Comprado</div>
              <div className="text-[12.5px] text-muted">{d.status === "comprado" && d.paid ? `Pagou ${brl(d.paid)}` : "Marque quando já tiver comprado."}</div>
            </div>
            <Toggle
              checked={d.status === "comprado"}
              onChange={(v) =>
                setDraft({
                  ...d,
                  status: v ? "comprado" : "pendente",
                  boughtAt: v ? (d.boughtAt ?? new Date().toISOString().slice(0, 10)) : undefined,
                  paid: v ? d.paid : undefined,
                  expenseId: v ? d.expenseId : undefined,
                })
              }
              label="Comprado"
            />
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function Compras() {
  const items = useUserData("shopping");
  const update = useSession((s) => s.update);
  const toast = useUi((s) => s.toast);
  const [filter, setFilter] = useState<ShoppingCategory | "todas">("todas");
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  // Só anima entrada/saída depois da primeira pintura (abrir a tela com 500 itens não pode "chover" na tela).
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const expenses = useUserData("expenses");
  const profile = useUserData("profile");
  const invoices = useUserData("invoices");
  const bills = useUserData("bills");
  const planned = useUserData("planned");
  const boxes = useUserData("boxes");
  const ym = currentYm();
  const budget = useMemo(
    () => monthBudget(summarizeMonth(expenses, ym, profile.salary, profile.extraIncome), invoices, ym, new Date(), pendingFor(bills, planned, ym, boxes)),
    [expenses, ym, profile.salary, profile.extraIncome, invoices, bills, planned, boxes],
  );

  const summary = useMemo(() => summarizeShopping(items), [items]);
  const groups = useMemo(() => {
    const visible = filter === "todas" ? items : items.filter((i) => i.category === filter);
    return SHOPPING_CATEGORIES.map((c) => ({
      cat: c,
      totals: summary.byCategory.find((b) => b.category === c.id),
      list: visible.filter((i) => i.category === c.id).sort((a, b) => (a.status === b.status ? a.createdAt.localeCompare(b.createdAt) : a.status === "pendente" ? -1 : 1)),
    })).filter((g) => g.list.length);
  }, [items, filter, summary]);

  const add = (name: string, quantity: number, catalog?: CatalogItem) => {
    const item: ShoppingItem = {
      id: uid(),
      name,
      quantity,
      category: catalog?.category ?? "outros",
      status: "pendente",
      createdAt: new Date().toISOString(),
    };
    update("shopping", (list) => [...list, item]);
  };
  const toggle = (item: ShoppingItem) => {
    const done = item.status === "comprado";
    update("shopping", (list) =>
      list.map((i) =>
        i.id === item.id
          ? {
              ...i,
              status: done ? "pendente" : "comprado",
              boughtAt: done ? undefined : new Date().toISOString().slice(0, 10),
              paid: done ? undefined : i.paid,
              expenseId: done ? undefined : i.expenseId,
            }
          : i,
      ),
    );
  };
  const save = (item: ShoppingItem) => {
    update("shopping", (list) => list.map((i) => (i.id === item.id ? item : i)));
    setEditing(null);
  };
  const remove = (item: ShoppingItem) => {
    update("shopping", (list) => list.filter((i) => i.id !== item.id));
    setEditing(null);
    toast({
      title: `"${item.name}" removido`,
      tone: "info",
      action: {
        label: "Desfazer",
        onClick: () => update("shopping", (list) => (list.some((i) => i.id === item.id) ? list : [...list, item])),
      },
    });
  };
  const clearBought = () => {
    const gone = items.filter((i) => i.status === "comprado");
    update("shopping", (list) => list.filter((i) => i.status !== "comprado"));
    setConfirmClear(false);
    toast({
      title: `${gone.length} ${gone.length === 1 ? "item comprado removido" : "itens comprados removidos"}`,
      tone: "info",
      action: {
        label: "Desfazer",
        onClick: () => update("shopping", (list) => [...list, ...gone.filter((g) => !list.some((i) => i.id === g.id))]),
      },
    });
  };
  const exportAs = async (format: "pdf" | "xlsx") => {
    setExporting(format);
    try {
      const r = await api.exportShopping(format);
      if (r)
        toast({
          title: format === "pdf" ? "PDF salvo" : "Planilha salva",
          tone: "success",
        });
    } catch (err) {
      toastError(err);
    } finally {
      setExporting(null);
    }
  };

  const pendingTotal = summary.pending.total;
  const free = budget.available;
  const fits = pendingTotal <= free;
  const counts = new Map(SHOPPING_CATEGORIES.map((c) => [c.id, items.filter((i) => i.category === c.id && i.status === "pendente").length]));

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-5">
        <div className="min-w-0">
          <h1 className="t-large-title md:text-[34px]">Lista de compras</h1>
          <p className="t-body text-muted mt-1">Anote o que precisa comprar e veja quanto juntar. Quando lançar o gasto em Gastos, o item é riscado sozinho.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" size="sm" icon={FileDown} loading={exporting === "pdf"} disabled={!items.length} onClick={() => void exportAs("pdf")}>
            PDF
          </Button>
          <Button variant="secondary" size="sm" icon={FileSpreadsheet} loading={exporting === "xlsx"} disabled={!items.length} onClick={() => void exportAs("xlsx")}>
            Excel
          </Button>
        </div>
      </div>

      {items.length > 0 && (
        <section className="group-card p-5 mb-4" aria-label="Total da lista">
          <div className="t-caption text-muted">Falta comprar</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Private className="text-[34px] leading-none font-bold tracking-[-0.025em] tabular">
              {summary.pending.estimated ? "~" : ""}
              {brl(pendingTotal)}
            </Private>
            <span className="t-footnote text-muted">
              {summary.pending.count} {summary.pending.count === 1 ? "item" : "itens"}
            </span>
          </div>
          <div className="t-footnote text-muted mt-2 min-w-0">
            <TotalsLine t={summary.pending} />
          </div>
          {summary.pending.noPrice > 0 && <div className="t-footnote text-muted mt-1">Itens sem preço não entram no total.</div>}
          {pendingTotal > 0 && profile.salary > 0 && (
            <div className={clsx("mt-4 rounded-[var(--radius-md)] px-4 py-3 t-footnote", fits ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
              {fits ? (
                <>
                  Cabe no que sobra do mês: depois da lista, ficam <Private>{brl(free - pendingTotal)}</Private> disponíveis.
                </>
              ) : free > 0 ? (
                <>
                  Passa <Private>{brl(pendingTotal - free)}</Private> do que sobra no mês (<Private>{brl(free)}</Private>). Vale juntar aos poucos ou deixar parte para o mês que vem.
                </>
              ) : (
                <>Este mês não sobra dinheiro livre. Junte aos poucos ou deixe para o mês que vem.</>
              )}
            </div>
          )}
          {summary.bought.count > 0 && (
            <div className="mt-4 pt-4 border-t hairline flex items-center justify-between gap-3">
              <div className="t-footnote text-muted min-w-0">
                Já comprado: <Private className="text-fg font-medium">{brl(summary.bought.total)}</Private> em {summary.bought.count} {summary.bought.count === 1 ? "item" : "itens"}
              </div>
              <button type="button" onClick={() => setConfirmClear(true)} className="pressable t-footnote font-semibold text-primary shrink-0">
                Limpar comprados
              </button>
            </div>
          )}
        </section>
      )}

      <div className="sticky top-0 z-20 -mx-4 px-4 pt-2 pb-3 sm:-mx-2 sm:px-2 bg-gradient-to-b from-bg via-bg/90 to-transparent">
        <QuickAdd onAdd={add} />
      </div>

      {items.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 no-scrollbar" role="group" aria-label="Filtrar por categoria">
          {[{ id: "todas" as const, label: "Todas" }, ...SHOPPING_CATEGORIES.filter((c) => items.some((i) => i.category === c.id))].map((c) => {
            const on = filter === c.id;
            const n = c.id === "todas" ? summary.pending.count : (counts.get(c.id) ?? 0);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(c.id)}
                className={clsx(
                  "pressable relative h-9 px-3.5 rounded-full t-footnote font-semibold whitespace-nowrap shrink-0 transition-colors",
                  on ? "text-white" : "text-muted hover:text-fg bg-line/[0.06]",
                )}
              >
                {on && (
                  <motion.span
                    layoutId="shop-filter"
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: c.id === "todas" ? "rgb(var(--primary))" : catColor(c.id),
                    }}
                    transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                  />
                )}
                <span className="relative">
                  {c.label}
                  {n > 0 && <span className={clsx("ml-1.5 tabular", on ? "text-white/80" : "text-muted/70")}>{n}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {items.length === 0 ? (
        <div className="group-card px-6 py-12 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center bg-primary/[0.12] text-primary">
            <ShoppingCart size={26} />
          </div>
          <div className="t-title mt-4">Sua lista está vazia</div>
          <p className="t-body text-muted mt-1.5 max-w-sm mx-auto">Digite o nome de algo que precisa comprar. O app sugere o preço médio para você saber quanto juntar.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {["Leite", "Arroz", "Detergente", "Papel higiênico"].map((n) => (
              <button key={n} type="button" onClick={() => add(n, 1, findCatalog(n))} className="pressable h-9 px-3.5 rounded-full bg-line/[0.06] t-footnote font-semibold text-fg hover:bg-line/[0.1]">
                <Sparkles size={13} className="inline -mt-0.5 mr-1 text-primary" />
                {n}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4 pb-6">
          {groups.map(({ cat, list, totals }) => (
            <section key={cat.id} className="group-card" aria-label={cat.label}>
              <header className="flex items-center gap-3 px-4 pt-3.5 pb-2.5 border-b hairline">
                <span className="h-8 w-8 rounded-[10px] grid place-items-center text-[16px] shrink-0" style={{ background: catTint(cat.id, 0.16) }} aria-hidden>
                  {cat.emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <h2 className="t-headline">{cat.label}</h2>
                  {totals && totals.pending.count > 0 && (
                    <div className="t-footnote text-muted truncate">
                      <TotalsLine t={totals.pending} />
                    </div>
                  )}
                </div>
                {totals && totals.pending.total > 0 && (
                  <Private className="t-headline tabular shrink-0">
                    {totals.pending.estimated ? "~" : ""}
                    {brl(totals.pending.total)}
                  </Private>
                )}
              </header>
              <ul className="divide-y divide-[rgb(var(--separator)/0.08)]">
                <AnimatePresence initial={false}>
                  {list.map((item) => (
                    <ItemRow key={item.id} item={item} animate={ready && list.length <= 80} onToggle={() => toggle(item)} onOpen={() => setEditing(item)} />
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))}
          {groups.length === 0 && <div className="group-card px-6 py-10 text-center t-body text-muted">Nada nesta categoria.</div>}
        </div>
      )}

      <ItemSheet item={editing} onClose={() => setEditing(null)} onSave={save} onRemove={remove} />
      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={clearBought}
        title="Limpar itens comprados?"
        message="Os itens já comprados saem da lista. Dá para desfazer logo depois."
        confirmLabel="Limpar"
      />
    </div>
  );
}
