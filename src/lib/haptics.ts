/** Vibração curta nas ações principais (só no app do celular; no PC não faz nada). */
export function tap(): void {
  if (!document.documentElement.classList.contains("native-app")) return;
  try {
    navigator.vibrate?.(8);
  } catch {
    // aparelho sem vibração
  }
}
