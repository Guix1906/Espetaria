import { create } from 'zustand';
import { Shift } from '../types/domain';
import { generateId } from '../lib/utils';
import { useStockStore, PrepItemInput } from './useStockStore';
import { logger } from '../lib/logger';

interface ShiftState {
  currentShift: Shift | null;
  shiftsHistory: Shift[];
  openShift: (
    name: string,
    initialNotes: string,
    cashDrawerStart: number,
    stockItems: PrepItemInput[],
    userId: string
  ) => Shift;
  closeShift: (
    closingNotes: string,
    cashDrawerEnd: number,
    userId: string
  ) => void;
}

export const useShiftStore = create<ShiftState>((set, get) => ({
  currentShift: null,
  shiftsHistory: [],

  openShift: (name, initialNotes, cashDrawerStart, stockItems, userId) => {
    if (get().currentShift && get().currentShift?.status === 'ABERTO') {
      throw new Error('Já existe um turno aberto. Feche o turno atual antes de iniciar um novo.');
    }

    const shiftId = generateId();
    const newShift: Shift = {
      id: shiftId,
      date: new Date().toISOString().split('T')[0]!,
      name: name || `${new Date().toLocaleDateString('pt-BR')} — Noite`,
      status: 'ABERTO',
      opened_by: userId,
      closed_by: null,
      opened_at: new Date().toISOString(),
      closed_at: null,
      initial_notes: initialNotes || null,
      closing_notes: null,
      cash_drawer_start: cashDrawerStart || 0,
      cash_drawer_end: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Inicializa o estoque de mise en place do dia
    useStockStore.getState().initShiftStock(shiftId, stockItems, userId);

    set({
      currentShift: newShift,
      shiftsHistory: [newShift, ...get().shiftsHistory],
    });

    logger.info({
      context: 'ShiftStore',
      message: `Turno aberto com sucesso: ${newShift.name}`
    });

    return newShift;
  },

  closeShift: (closingNotes, cashDrawerEnd, userId) => {
    const current = get().currentShift;
    if (!current || current.status !== 'ABERTO') {
      throw new Error('Nenhum turno aberto para fechar.');
    }

    const closedShift: Shift = {
      ...current,
      status: 'FECHADO',
      closed_by: userId,
      closed_at: new Date().toISOString(),
      closing_notes: closingNotes || null,
      cash_drawer_end: cashDrawerEnd,
      updated_at: new Date().toISOString(),
    };

    set({
      currentShift: null,
      shiftsHistory: get().shiftsHistory.map((s) => (s.id === current.id ? closedShift : s)),
    });

    logger.info({
      context: 'ShiftStore',
      message: `Turno ${closedShift.name} encerrado com sucesso.`
    });
  }
}));
