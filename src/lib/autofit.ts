// Valores grandes (R$ 100.000,00 num card estreito do celular) diminuem a
// fonte até caber, em vez de vazar do card. Vale para qualquer tela: observa
// os números (.tabular e títulos de valor) e ajusta quando o conteúdo ou o
// tamanho da tela muda.
const MIN_PX = 12;
const SELECTOR = '.surface .tabular, .surface [data-fit], .group-card [data-fit], .surface [class*="text-[2"], .surface [class*="text-[3"]';

function fit(el: HTMLElement): void {
  if (!el.isConnected) return;
  const base = Number(el.dataset.fitBase) || parseFloat(getComputedStyle(el).fontSize);
  if (base < 16) return; // só números grandes
  el.dataset.fitBase = String(base);
  const parent = el.parentElement;
  if (!parent) return;
  const avail = el.clientWidth || parent.clientWidth;
  // Nada mudou desde o último ajuste: não mexe (evita piscar durante animações).
  const key = `${el.textContent}|${avail}`;
  if (el.dataset.fitKey === key) return;
  el.dataset.fitKey = key;
  el.style.fontSize = "";
  el.style.whiteSpace = "nowrap";
  const width = el.scrollWidth;
  if (width <= avail + 1) return;
  // A largura do texto acompanha o tamanho da fonte: começa perto do certo e
  // ajusta de 1 em 1, em vez de medir a tela a cada pixel.
  let size = Math.max(MIN_PX, Math.floor((base * avail) / width));
  el.style.fontSize = `${size}px`;
  while (el.scrollWidth > avail + 1 && size > MIN_PX) {
    size -= 1;
    el.style.fontSize = `${size}px`;
  }
}

export function installAutoFit(): void {
  const resize = new ResizeObserver((entries) => {
    for (const e of entries) for (const el of (e.target as HTMLElement).querySelectorAll<HTMLElement>(SELECTOR)) fit(el);
  });
  const seen = new WeakSet<Element>();
  const visit = (el: HTMLElement) => {
    fit(el);
    const card = el.closest(".surface, .group-card");
    if (card && !seen.has(card)) {
      seen.add(card);
      resize.observe(card);
    }
  };
  // Só olha o card (ou o trecho) que mudou. Números animados e a resposta do
  // Assistente mudam a cada quadro; varrer a tela toda a cada vez pesa no celular.
  const dirty = new Set<Element>();
  let queued = false;
  const scan = () => {
    queued = false;
    const roots = [...dirty];
    dirty.clear();
    for (const root of roots) {
      if (!root.isConnected) continue;
      const scope = root.closest(".surface, .group-card") ?? root;
      if (scope.matches(SELECTOR)) visit(scope as HTMLElement);
      for (const el of scope.querySelectorAll<HTMLElement>(SELECTOR)) visit(el);
    }
  };
  const mark = (node: Node) => {
    const el = node instanceof Element ? node : node.parentElement;
    if (el) dirty.add(el);
    if (queued) return;
    queued = true;
    requestAnimationFrame(scan);
  };
  new MutationObserver((records) => {
    for (const r of records) mark(r.target);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  mark(document.body);
}
