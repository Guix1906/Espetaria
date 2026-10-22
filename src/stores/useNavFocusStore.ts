import { create } from 'zustand';

/**
 * "Abrir direto nesta mesa": a Visão geral marca a mesa e troca de tela;
 * o Atendimento/Caixa lê ao montar e já abre a mesa certa.
 */
interface NavFocusState {
  tableId: string | null;
  focusTable: (tableId: string) => void;
  /** Salão abre direto na aba "Prontos" (alerta de item pronto esperando). */
  readySection: boolean;
  focusReady: () => void;
  /** Chamar depois de montar (useEffect): ler no estado inicial e limpar aqui. */
  clear: () => void;
}

export const useNavFocusStore = create<NavFocusState>((set) => ({
  tableId: null,
  focusTable: (tableId) => set({ tableId }),
  readySection: false,
  focusReady: () => set({ readySection: true }),
  clear: () => set({ tableId: null, readySection: false }),
}));
