import { create } from 'zustand';
import { Shift } from '../types/domain';
import { generateId } from '../lib/utils';
import { useStockStore, PrepItemInput } from './useStockStore';
import { useTableStore } from './useTableStore';
import { useDeliveryStore } from './useDeliveryStore';
import { logger } from '../lib/logger';
import { callRpc } from '../lib/remote';

interface ShiftState {
  currentShift: Shift | null;
  shiftsHistory: Shift[];
  openShift: (
    name: string,
    initialNotes: string,
    cashDrawerStart: number,
    stockItems: PrepItemInput[],
    userId: string,
    disabledProductIds?: string[]
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

  openShift: (name, initialNotes, cashDrawerStart, stockItems, userId, disabledProductIds = []) => {
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
      updated_by: userId,
      version: 1,
    };

    // Inicializa o estoque de mise en place do dia (incluindo produtos desabilitados)
    useStockStore.getState().initShiftStock(shiftId, stockItems, userId, disabledProductIds);

    set({
      currentShift: newShift,
      shiftsHistory: [newShift, ...get().shiftsHistory],
    });

    // Abertura atômica no banco (turno + estoque + auditoria). Em seguida re-hidrata
    // para adotar o ID definitivo gerado pelo servidor.
    void callRpc<string>('open_shift', {
      p_shift_name: newShift.name,
      p_initial_notes: newShift.initial_notes,
      p_cash_start: newShift.cash_drawer_start,
      p_stock_items: stockItems.map((item) => ({
        product_id: item.productId,
        cubas_count: item.cubasCount ?? 0,
        portions_per_cuba: item.portionsPerCuba ?? 1,
        quantity: item.quantity ?? 0,
      })),
    }, 'ShiftStore').then(async (serverShiftId) => {
      if (serverShiftId) {
        if (disabledProductIds && disabledProductIds.length > 0) {
          for (const dId of disabledProductIds) {
            void callRpc('toggle_exhaustion', {
              p_shift_id: serverShiftId,
              p_product_id: dId,
              p_is_exhausted: true,
              p_reason: 'Não disponível hoje (abertura do turno)',
            }, 'ShiftStore');
          }
        }
        const { syncService } = await import('../lib/syncService');
        await syncService.hydrateAll();
      }
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
      updated_by: userId,
      version: (current.version || 0) + 1,
    };

    set({
      currentShift: null,
      shiftsHistory: get().shiftsHistory.map((s) => (s.id === current.id ? closedShift : s)),
    });

    // Zera automaticamente o estoque diário ao encerrar o turno
    useStockStore.setState({ dailyPrepStock: [] });

    // Zera e libera todas as mesas e comandas do salão automaticamente
    const tableStore = useTableStore.getState();
    const closeNow = new Date().toISOString();
    useTableStore.setState({
      tables: tableStore.tables.map((t) => ({ ...t, status: 'LIVRE' as const, current_tab: undefined, updated_at: closeNow })),
      tabs: tableStore.tabs.map((t) => (t.status === 'OPEN' ? { ...t, status: 'CLOSED' as const, closed_at: closeNow, closed_by: userId } : t)),
      orders: tableStore.orders.map((o) => (o.status !== 'CANCELLED' && o.status !== 'CLOSED' ? { ...o, status: 'CLOSED' as const, updated_at: closeNow } : o)),
      orderItems: tableStore.orderItems.map((i) => (i.status !== 'CANCELLED' && i.status !== 'DELIVERED' ? { ...i, status: 'DELIVERED' as const, delivered_at: closeNow, updated_at: closeNow } : i)),
    });

    // Finaliza automaticamente pedidos de delivery pendentes (Em entrega, Pronto, etc.) do turno encerrado como ENTREGUES
    const deliveryStore = useDeliveryStore.getState();
    useDeliveryStore.setState({
      deliveryOrders: deliveryStore.deliveryOrders.map((o) =>
        (o.shift_id === current.id || !o.shift_id) && o.status !== 'DELIVERED' && o.status !== 'CANCELLED'
          ? { ...o, status: 'DELIVERED' as const, delivered_at: o.delivered_at ?? closeNow }
          : o
      ),
    });

    void callRpc('close_shift', {
      p_shift_id: current.id,
      p_closing_notes: closedShift.closing_notes,
      p_cash_end: closedShift.cash_drawer_end,
    }, 'ShiftStore');

    logger.info({
      context: 'ShiftStore',
      message: `Turno ${closedShift.name} encerrado com sucesso.`
    });
  }
}));
