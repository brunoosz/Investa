import { create } from "zustand";
import type { AiMode } from "@shared/types";

/** Pergunta deixada por outra tela (Gastos, Vale a pena?, Ativo) para o Assistente enviar ao abrir. */
export interface AssistantDraft {
  mode: AiMode;
  question: string;
  attachment?: string;
}

interface AssistantState {
  draft: AssistantDraft | null;
  ask: (draft: AssistantDraft) => void;
  take: () => AssistantDraft | null;
}

export const useAssistant = create<AssistantState>((set, get) => ({
  draft: null,
  ask: (draft) => set({ draft }),
  take: () => {
    const d = get().draft;
    if (d) set({ draft: null });
    return d;
  },
}));
