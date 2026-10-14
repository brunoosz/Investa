export const BRAND = {
  bg: "#0B0F1A",
  surface: "#1A1F2E",
  primary: "#4F8CFF",
  secondary: "#A78BFA",
  text: "#F8FAFC",
  muted: "#94A3B8",
  tagline: "APRENDA · INVISTA · EVOLUA",
};

/**
 * Marca: três barras inclinadas que sobem (como um gráfico) em degradê
 * azul → roxo. A segunda e a terceira têm um "dente" no alto, à esquerda, que
 * lembra o número 1. Vetorizado a partir da arte original (espaço 64×64).
 */
export const LOGO_PATHS = [
  "M9.1 59C8.8 58.8 8.6 58.6 8.4 58.3C8.3 57.9 8.3 32.4 8.5 31.6C8.9 29.5 9.6 28.7 12.1 27.2C12.8 26.8 14.2 25.9 15.3 25.3C18.8 23.2 19.5 22.8 20 22.8C20.8 22.7 21.5 23.4 21.6 24.3C21.8 25.2 21.6 47.1 21.4 48.1C20.6 52.4 18 55.1 11.7 58.4C10.3 59.1 9.8 59.2 9.1 59Z",
  "M26.1 55.1C25.6 54.8 25.6 56.7 25.6 38.3C25.6 28.7 25.6 22.4 25.5 22.3C25.4 21.9 25.4 21.8 25 21.4C23.8 19.9 24.1 18.2 25.7 17.4C26.8 16.9 27.3 17 29.9 18.6C30.9 19.1 32.2 19.9 32.8 20.3C36.8 22.7 37 22.8 37.5 23.2C38.1 23.6 38.5 24.4 38.7 25.3C38.9 26.1 38.7 43.4 38.5 44.3C37.7 48.2 36.3 49.7 30.7 53.1C27.6 55 26.7 55.4 26.1 55.1Z",
  "M43.7 45.5C43.5 45.4 43.3 45.2 43.3 45C43.2 44.8 43.1 38.6 43.1 25.3C43 14.4 43.2 15.4 41.5 14.3C40.3 13.4 40 13 40.2 12.3C40.3 11.8 40.6 11.6 43.1 10.3C44.2 9.8 45.5 9.1 46.1 8.7C46.7 8.4 47.6 7.9 48.1 7.7C48.6 7.4 49.5 6.9 50.2 6.5C51.7 5.7 52.8 5.2 53.2 5.1C54.4 4.8 55.4 5.3 55.6 6.3C55.7 6.7 55.8 23.4 55.7 28.5C55.6 30.1 55.6 31.9 55.6 32.6C55.6 37.2 54.2 39.6 49.9 42.2C49.5 42.5 48.8 42.9 48.4 43.1C44.8 45.4 44.2 45.7 43.7 45.5Z",
];

/** Degradê da marca: azul-claro no alto à esquerda → roxo embaixo à direita (coordenadas 64×64). */
export const LOGO_GRADIENT = { x1: 8, y1: 6, x2: 56, y2: 60 };
export const LOGO_STOPS = [
  { offset: 0, color: "#72D2FF" },
  { offset: 0.5, color: "#4F86FF" },
  { offset: 1, color: "#7A4BFF" },
];

const stops = () => LOGO_STOPS.map((g) => `<stop offset="${g.offset}" stop-color="${g.color}"/>`).join("");
const gradient = (id: string) =>
  `<linearGradient id="${id}" x1="${LOGO_GRADIENT.x1}" y1="${LOGO_GRADIENT.y1}" x2="${LOGO_GRADIENT.x2}" y2="${LOGO_GRADIENT.y2}" gradientUnits="userSpaceOnUse">${stops()}</linearGradient>`;
const paths = (fill: string) => LOGO_PATHS.map((d) => `<path d="${d}" fill="${fill}"/>`).join("");

export function logoMarkSvg(size = 64, id = "investa-g", mono?: string): string {
  const defs = mono ? "" : `<defs>${gradient(id)}</defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${defs}${paths(mono ?? `url(#${id})`)}</svg>`;
}

export type IconVariant = "dark" | "light";

/** Fundo do ícone em cada variante (também usado no fundo do ícone adaptativo do Android). */
export const ICON_BG: Record<IconVariant, string[]> = {
  dark: ["#1C2440", "#10162A", "#0A0E1A"],
  light: ["#FFFFFF", "#F3F6FC", "#E6EBF6"],
};

export function appIconSvg(size = 1024, variant: IconVariant = "dark"): string {
  const light = variant === "light";
  const bg = ICON_BG[variant];
  const p = `ic-${variant}-`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="${p}bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg[0]}"/>
      <stop offset="0.55" stop-color="${bg[1]}"/>
      <stop offset="1" stop-color="${bg[2]}"/>
    </linearGradient>
    <linearGradient id="${p}rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${light ? "#0B0F1A" : "#ffffff"}" stop-opacity="${light ? 0.07 : 0.16}"/>
      <stop offset="1" stop-color="${light ? "#0B0F1A" : "#ffffff"}" stop-opacity="0.02"/>
    </linearGradient>
    <radialGradient id="${p}glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#4F8CFF" stop-opacity="${light ? 0.1 : 0.3}"/>
      <stop offset="1" stop-color="#4F8CFF" stop-opacity="0"/>
    </radialGradient>
    ${gradient(`${p}bars`)}
  </defs>
  <rect x="32" y="32" width="960" height="960" rx="224" fill="url(#${p}bg)"/>
  <rect x="33" y="33" width="958" height="958" rx="223" fill="none" stroke="url(#${p}rim)" stroke-width="4"/>
  <rect x="32" y="32" width="960" height="960" rx="224" fill="url(#${p}glow)"/>
  <g transform="translate(160 160) scale(11)">${paths(`url(#${p}bars)`)}</g>
</svg>`;
}
