import { create } from 'zustand';

/**
 * "Abrir direto nesta mesa": a Visão geral marca a mesa e troca de tela;
 * o Atendimento/Caixa lê ao montar e já abre a mesa certa.
 */
interface NavFocusState {
  tableId: string | null;
  focusTable: (tableId: string) => void;
  /** Chamar depois de montar (useEffect): ler no estado inicial e limpar aqui. */
  clear: () => void;
}

export const useNavFocusStore = create<NavFocusState>((set) => ({
  tableId: null,
  focusTable: (tableId) => set({ tableId }),
  clear: () => set({ tableId: null }),
}));
