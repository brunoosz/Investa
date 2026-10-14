// No desktop, window.investa vem do preload do Electron. No app Android, o
// motor do app roda no próprio WebView e precisa ser montado antes da interface.
async function boot(): Promise<void> {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  // Em desenvolvimento, ?mobile=1 no navegador simula o app do celular.
  const simulate = import.meta.env.DEV && location.search.includes("mobile=1");
  if (cap?.isNativePlatform?.() || simulate) {
    document.documentElement.classList.add("native-app");
    const { installMobileBridge } = await import("./mobile/bridge");
    await installMobileBridge();
  }
  const { renderApp } = await import("./root");
  renderApp();
}

void boot();
