// Ranking dos modelos de conversa da NVIDIA (build.nvidia.com) para o uso do
// Investa: português, finanças pessoais e, acima de tudo, respostas rápidas em
// streaming. Modelos que "pensam" antes de responder ficam por último: a
// pessoa espera dezenas de segundos sem ver nada.
// A lista abaixo é a referência conhecida em outubro de 2026. Modelos novos que
// aparecerem na conta entram pelo ranking por família e versão, sem precisar de
// uma versão nova do app.
import type { AiModelInfo } from "@shared/types";

const CURATED: Record<string, number> = {
  "deepseek-ai/deepseek-v4-flash": 100,
  "qwen/qwen3-next-80b-a3b-instruct": 97,
  "moonshotai/kimi-k2-instruct-0905": 96,
  "mistralai/mistral-large-3-675b-instruct-2512": 95,
  "meta/llama-4-maverick-17b-128e-instruct": 93,
  "deepseek-ai/deepseek-v3.2": 92,
  "deepseek-ai/deepseek-v3.1-terminus": 89,
  "deepseek-ai/deepseek-v3.1": 88,
  "qwen/qwen3-235b-a22b": 87,
  "moonshotai/kimi-k2.6": 86,
  "z-ai/glm5": 85,
  "meta/llama-3.3-70b-instruct": 84,
  "mistralai/mistral-medium-3-instruct": 83,
  "z-ai/glm4.7": 82,
  "meta/llama-3.1-405b-instruct": 72,
  "meta/llama-4-scout-17b-16e-instruct": 70,
  // Raciocínio: boas respostas, mas pensam antes e demoram.
  "deepseek-ai/deepseek-v4-pro": 68,
  "openai/gpt-oss-120b": 67,
  "minimaxai/minimax-m3": 64,
  "nvidia/llama-3.3-nemotron-super-49b-v1.5": 62,
  "minimaxai/minimax-m2.1": 60,
  "nvidia/llama-3.1-nemotron-ultra-253b-v1": 58,
  "moonshotai/kimi-k2-thinking": 55,
  "openai/gpt-oss-20b": 52,
};

/** Modelos que sempre escrevem um raciocínio antes da resposta. */
const REASONING = /thinking|reason|(^|[-/])r1([-.]|$)|qwq|magistral|minimax|gpt-oss|-pro$|-pro-/i;

export function isReasoning(id: string): boolean {
  return REASONING.test(id);
}

interface Family {
  name: string;
  test: RegExp;
  /** Captura a versão (ex.: "v4" → 4, "k2.6" → 2.6, "glm5" → 5). */
  version: RegExp;
  base: number;
}

const FAMILIES: Family[] = [
  { name: "DeepSeek", test: /deepseek/i, version: /deepseek-v?(\d+(?:\.\d+)?)/i, base: 80 },
  { name: "Kimi", test: /kimi|moonshot/i, version: /kimi-k(\d+(?:\.\d+)?)/i, base: 80 },
  { name: "GLM", test: /glm/i, version: /glm-?(\d+(?:\.\d+)?)/i, base: 78 },
  { name: "Qwen", test: /qwen/i, version: /qwen(\d+(?:\.\d+)?)/i, base: 75 },
  { name: "MiniMax", test: /minimax/i, version: /minimax-m(\d+(?:\.\d+)?)/i, base: 75 },
  { name: "Mistral", test: /mistral-large|mistral-medium/i, version: /(?:large|medium)-(\d+(?:\.\d+)?)/i, base: 72 },
  { name: "GPT-OSS", test: /gpt-oss/i, version: /gpt-oss-(\d+(?:\.\d+)?)(?!b)/i, base: 72 },
  { name: "Llama", test: /llama/i, version: /llama-?(\d+(?:\.\d+)?)/i, base: 62 },
  { name: "Nemotron", test: /nemotron/i, version: /nemotron-?(\d+(?:\.\d+)?)/i, base: 66 },
  { name: "Gemma", test: /gemma/i, version: /gemma-?(\d+(?:\.\d+)?)/i, base: 55 },
  { name: "Phi", test: /phi-/i, version: /phi-(\d+(?:\.\d+)?)/i, base: 48 },
];

const NOT_CHAT =
  /(embed|rerank|guard|safety|reward|retriev|parse|clip|deplot|kosmos|fuyu|paligemma|neva|vila|detector|cosmos|ocr|asr|tts|whisper|bge|e5-|arctic-embed|sdxl|flux|stable-diffusion|nv-embed|grounding|segment|translate|riva|audio|speech|-base$|chatqa|pii|content-safety|topic-control|jailbreak)/i;

function versionOf(id: string, fam?: Family): number | undefined {
  if (!fam) return undefined;
  const m = fam.version.exec(id);
  return m ? Number(m[1]) : undefined;
}

export function isChatModel(id: string): boolean {
  return !NOT_CHAT.test(id);
}

export function scoreModel(id: string): number {
  if (CURATED[id] !== undefined) return CURATED[id];
  const fam = FAMILIES.find((f) => f.test.test(id));
  let score = fam?.base ?? 40;
  const v = versionOf(id, fam);
  if (fam && v !== undefined) {
    // Geração mais nova que todas as conhecidas da família: provavelmente melhor.
    const known = Object.entries(CURATED).filter(([k]) => fam.test.test(k));
    const maxKnown = Math.max(...known.map(([k]) => versionOf(k, fam) ?? 0), 0);
    const topKnown = Math.max(...known.map(([, s]) => s), fam.base);
    if (v > maxKnown) score = topKnown + 2;
  }
  if (isReasoning(id)) score -= 25;
  if (/coder|code/i.test(id)) score -= 15;
  if (/vision|-vl|vlm/i.test(id)) score -= 10;
  if (/\b(1b|2b|3b|4b|7b|8b|9b|mini|small|tiny|nano)\b/i.test(id.replace(/[-_/]/g, " "))) score -= 20;
  return score;
}

const PUBLISHERS: Record<string, string> = {
  "deepseek-ai": "DeepSeek",
  moonshotai: "Moonshot AI",
  "z-ai": "Z.ai",
  qwen: "Alibaba Qwen",
  minimaxai: "MiniMax",
  mistralai: "Mistral AI",
  openai: "OpenAI",
  meta: "Meta",
  nvidia: "NVIDIA",
  google: "Google",
  microsoft: "Microsoft",
  ibm: "IBM",
  thinkingmachines: "Thinking Machines",
};

export function modelLabel(id: string): string {
  const name = id.split("/").pop() ?? id;
  return name
    .replace(/-instruct.*$/i, "")
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => {
      if (/^v\d/i.test(part)) return part.toUpperCase();
      if (/^\d+(\.\d+)?b$/i.test(part)) return part.toUpperCase();
      if (/^(glm|gpt|oss|llm)\d*/i.test(part)) return part.toUpperCase().replace(/^GLM(\d)/, "GLM-$1");
      if (/^k\d/i.test(part)) return part.toUpperCase();
      if (/^m\d/i.test(part)) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ")
    .replace(/^Deepseek/, "DeepSeek")
    .replace(/^Minimax/, "MiniMax");
}

export function describeModels(ids: string[]): AiModelInfo[] {
  return ids
    .filter(isChatModel)
    .map((id) => {
      const score = scoreModel(id);
      const tags: string[] = [];
      if (isReasoning(id)) tags.push("raciocínio, mais lento");
      else if (score >= 90 || /flash|turbo|fast|instant/i.test(id)) tags.push("rápido");
      if (/vision|-vl|vlm/i.test(id)) tags.push("imagem");
      if (/coder|code/i.test(id)) tags.push("código");
      return { id, label: modelLabel(id), publisher: PUBLISHERS[id.split("/")[0]] ?? id.split("/")[0], score, tags };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Melhor modelo disponível, ignorando os que já falharam. */
export function pickBest(ids: string[], exclude: string[] = []): string | undefined {
  return describeModels(ids.filter((id) => !exclude.includes(id)))[0]?.id;
}

export const FALLBACK_MODEL = "deepseek-ai/deepseek-v4-flash";
/** Usados quando a lista de modelos da conta não pôde ser carregada. */
export const FALLBACK_MODELS = [
  FALLBACK_MODEL,
  "qwen/qwen3-next-80b-a3b-instruct",
  "mistralai/mistral-large-3-675b-instruct-2512",
  "meta/llama-4-maverick-17b-128e-instruct",
  "deepseek-ai/deepseek-v3.2",
];

// Groq (console.groq.com): grátis e muito mais rápida. Só modelos que respondem
// direto, na ordem usada pelo modo automático.
export const GROQ_MODELS: { id: string; label: string; note: string }[] = [
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", note: "Equilibrado, bom em português" },
  { id: "moonshotai/kimi-k2-instruct-0905", label: "Kimi K2", note: "Respostas mais completas" },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", note: "Pensa um pouco antes de responder" },
  { id: "meta-llama/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick", note: "Rápido" },
  { id: "qwen/qwen3-32b", label: "Qwen3 32B", note: "Rápido, bom em português" },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", note: "Rápido, pensa um pouco" },
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B", note: "O mais rápido, respostas mais simples" },
];

export function groqLabel(id: string): string {
  return GROQ_MODELS.find((m) => m.id === id)?.label ?? modelLabel(id);
}

/**
 * Modelos de conversa da Groq, na ordem de preferência: os conhecidos que
 * existem na conta; se a Groq tiver aposentado todos, os de conversa que ela listar.
 */
export function groqChatModels(ids?: string[]): string[] {
  const known = GROQ_MODELS.map((m) => m.id).filter((id) => !ids?.length || ids.includes(id));
  if (!ids?.length) return known;
  // Modelos novos que a Groq listar entram depois dos conhecidos (e no lugar deles, se forem aposentados).
  const others = ids.filter((id) => !known.includes(id) && isChatModel(id) && !/whisper|guard|tts|playai|orpheus|compound|prompt|saba|allam|safeguard/i.test(id));
  return [...known, ...others.sort((a, b) => scoreModel(b) - scoreModel(a))];
}

/** Modelos da Groq para a tela de configuração. */
export function describeGroq(ids?: string[]): AiModelInfo[] {
  return groqChatModels(ids).map((id, i) => {
    const known = GROQ_MODELS.find((m) => m.id === id);
    return {
      id,
      label: known?.label ?? modelLabel(id),
      publisher: known?.note ?? "Groq",
      score: 100 - i,
      tags: isReasoning(id) ? ["raciocínio"] : i === 0 ? ["rápido"] : [],
    };
  });
}

/**
 * Ajustes no pedido para o modelo responder direto, sem a etapa de "pensar"
 * (que deixa tudo muito mais lento). Cada família usa uma chave diferente; as
 * que o modelo não conhece são ignoradas pelo modelo de conversa.
 */
export function directAnswerTweaks(provider: "nvidia" | "groq", id: string): { body?: Record<string, unknown>; system?: string } {
  if (/gpt-oss/i.test(id)) return { body: { reasoning_effort: "low" } };
  if (provider === "groq") return /qwen3/i.test(id) ? { body: { reasoning_effort: "none" } } : {};
  if (/nemotron.*(v1\.5|v2)|nemotron-nano/i.test(id)) return { system: "/no_think" };
  if (/nemotron/i.test(id)) return { system: "detailed thinking off" };
  if (/deepseek|kimi|qwen3|glm/i.test(id)) return { body: { chat_template_kwargs: { thinking: false, enable_thinking: false } } };
  return {};
}
