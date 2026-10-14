import type { AiMode } from "./types";

export const ASSISTANT_NAME = "Assistente";

export interface AiModeInfo {
  id: AiMode;
  label: string;
  short: string;
  description: string;
  icon: string;
  suggestions: string[];
}

export const AI_MODES: AiModeInfo[] = [
  {
    id: "geral",
    label: "Conversa livre",
    short: "Geral",
    description: "Qualquer assunto, como um chat de IA comum.",
    icon: "message",
    suggestions: [
      "Me ajude a escrever um e-mail pedindo aumento",
      "Resuma em 5 tópicos o que é inteligência artificial",
      "Monte uma lista de compras de mercado para uma semana",
      "Me dê ideias de renda extra para fazer em casa",
    ],
  },
  {
    id: "professor",
    label: "Professor",
    short: "Professor",
    description: "Explica investimentos passo a passo, com exemplos e perguntas.",
    icon: "graduation",
    suggestions: [
      "O que é CDI e por que todo investimento fala dele?",
      "Me explique juros compostos com um exemplo de R$ 200 por mês",
      "Qual a diferença entre Tesouro Selic, CDB e poupança?",
      "Me faça 3 perguntas para ver se entendi renda fixa",
    ],
  },
  {
    id: "financas",
    label: "Minhas finanças",
    short: "Finanças",
    description: "Orçamento, faturas e dívidas. Monta um plano com os seus números.",
    icon: "wallet",
    suggestions: [
      "Minha fatura passou da minha renda. O que eu faço?",
      "Onde estou gastando demais este mês?",
      "Monte um orçamento para eu sobrar R$ 500 por mês",
      "Vale mais a pena parcelar a fatura ou pegar um empréstimo?",
    ],
  },
  {
    id: "mercado",
    label: "Analista de mercado",
    short: "Mercado",
    description: "Cotações, Selic, notícias e a sua carteira em tempo real.",
    icon: "chart",
    suggestions: [
      "Por onde eu começo a investir com o que tenho hoje?",
      "Quais ações estão em destaque hoje e por quê?",
      "Como está a minha carteira e o que eu poderia melhorar?",
      "O que a última decisão do Copom muda para mim?",
    ],
  },
  {
    id: "compras",
    label: "Vale a pena comprar?",
    short: "Compras",
    description: "Diz se o preço está bom e se cabe no seu bolso agora.",
    icon: "cart",
    suggestions: [
      "Vale a pena comprar um celular de R$ 2.500 em 10x agora?",
      "Tenho R$ 300 sobrando. Compro um jogo ou guardo?",
      "Como saber se uma promoção da Black Friday é de verdade?",
      "Devo trocar meu notebook agora ou esperar?",
    ],
  },
  {
    id: "app",
    label: "Ajuda com o app",
    short: "Ajuda",
    description: "Tira dúvidas sobre como usar o Investa.",
    icon: "help",
    suggestions: [
      "Como cadastro um CDB na carteira?",
      "Como crio um alerta quando uma ação cair?",
      "Como exporto meus gastos do mês em Excel?",
      "Como funciona o ranking de bancos?",
    ],
  },
];

export function modeInfo(id?: AiMode): AiModeInfo {
  return AI_MODES.find((m) => m.id === id) ?? AI_MODES[3];
}

/** Marcador que o Assistente usa para sugerir algo para a memória: [[lembrar: gosta de jogar videogame]]. */
const MEMORY_TAG = /\[\[\s*lembrar\s*:\s*([^\]]+?)\s*\]\]/gi;

/** Separa o texto da resposta das sugestões de memória (e esconde marcador ainda incompleto no streaming). */
export function splitMemory(content: string): { text: string; items: string[] } {
  const items: string[] = [];
  const text = content
    .replace(MEMORY_TAG, (_, fact: string) => {
      items.push(fact.trim());
      return "";
    })
    .replace(/\[\[[^\]]*$/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  return { text, items: [...new Set(items)].filter((x) => x.length > 2) };
}
