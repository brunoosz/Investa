/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  // Sem hover "grudado" depois de tocar na tela do celular.
  future: { hoverOnlyWhenSupported: true },
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: token("surface"),
        elevated: token("elevated"),
        line: token("line"),
        fg: token("fg"),
        muted: token("muted"),
        primary: token("primary"),
        secondary: token("secondary"),
        success: token("success"),
        danger: token("danger"),
        warning: token("warning"),
        separator: token("separator"),
        "cat-alimentos": token("cat-alimentos"),
        "cat-bebidas": token("cat-bebidas"),
        "cat-limpeza": token("cat-limpeza"),
        "cat-higiene": token("cat-higiene"),
        "cat-casa": token("cat-casa"),
        "cat-eletronicos": token("cat-eletronicos"),
        "cat-jogos": token("cat-jogos"),
        "cat-roupas": token("cat-roupas"),
        "cat-outros": token("cat-outros"),
      },
      // Escala de texto do visual novo (tamanho, entrelinha, tracking e peso juntos).
      fontSize: {
        "large-title": ["30px", { lineHeight: "1.1", letterSpacing: "-0.022em", fontWeight: "700" }],
        title: ["20px", { lineHeight: "1.2", letterSpacing: "-0.016em", fontWeight: "650" }],
        headline: ["15.5px", { lineHeight: "1.35", letterSpacing: "-0.006em", fontWeight: "600" }],
        body: ["15px", { lineHeight: "1.45", letterSpacing: "-0.003em" }],
        callout: ["14px", { lineHeight: "1.4", letterSpacing: "-0.002em" }],
        footnote: ["13px", { lineHeight: "1.4", letterSpacing: "0.002em" }],
        caption: ["11.5px", { lineHeight: "1.3", letterSpacing: "0.04em", fontWeight: "600" }],
      },
      transitionTimingFunction: {
        "out-strong": "var(--ease-out)",
        "in-out-strong": "var(--ease-in-out)",
      },
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
        chip: "var(--radius-sm)",
        control: "var(--radius-md)",
        card: "var(--radius-lg)",
        sheet: "var(--radius-xl)",
      },
      boxShadow: {
        soft: "0 1px 2px rgb(0 0 0 / 0.04), 0 10px 30px -12px rgb(0 0 0 / 0.25)",
        glow: "0 10px 30px -8px rgb(var(--primary) / 0.55)",
        ring: "0 0 0 4px rgb(var(--primary) / 0.18)",
      },
      backgroundImage: {
        brand: "linear-gradient(135deg, rgb(var(--primary)) 0%, rgb(var(--brand-mid)) 55%, rgb(var(--secondary)) 100%)",
      },
      keyframes: {
        shimmer: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        pulseDot: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
        "pulse-dot": "pulseDot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
