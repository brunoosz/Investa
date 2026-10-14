// Camadas abertas por cima da tela (janelas, paleta de busca), da mais antiga
// para a mais nova. O Esc e o voltar do Android fecham só a de cima, e o
// <html data-overlay> avisa o CSS que há uma camada aberta de verdade.
const stack: { close: () => void }[] = [];

function sync(): void {
  document.documentElement.toggleAttribute("data-overlay", stack.length > 0);
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
  if (closeTopOverlay()) e.preventDefault();
}

export function pushOverlay(close: () => void): () => void {
  const entry = { close };
  if (!stack.length) window.addEventListener("keydown", onKey);
  stack.push(entry);
  sync();
  return () => {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    if (!stack.length) window.removeEventListener("keydown", onKey);
    sync();
  };
}

/** Fecha a camada de cima. Devolve falso se não havia nenhuma aberta. */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}
