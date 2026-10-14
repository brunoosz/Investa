import type { CapacitorConfig } from "@capacitor/cli";

// App Android do Investa. Usa a mesma interface (dist/) do desktop e roda o
// motor do app (core/) dentro do WebView. O CapacitorHttp faz as requisições
// às fontes de dados pela rede nativa, sem bloqueio de CORS.
const config: CapacitorConfig = {
  appId: "com.investa.app",
  appName: "Investa",
  webDir: "dist",
  backgroundColor: "#0B0F1A",
  android: {
    allowMixedContent: false,
  },
  plugins: {
    CapacitorHttp: { enabled: true },
    CapacitorCookies: { enabled: true },
    SplashScreen: { launchAutoHide: false, backgroundColor: "#0B0F1A", showSpinner: false },
    LocalNotifications: { smallIcon: "ic_stat_investa", iconColor: "#4F8CFF" },
  },
};

export default config;
