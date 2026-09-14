import { create } from 'zustand';
import { DailyPrepStock, Product, StockMovement } from '../types/domain';
import { OrderItemStatus } from '../types/enums';
import { INITIAL_PRODUCTS } from '../lib/mockData';
import { generateId } from '../lib/utils';
import { logger } from '../lib/logger';

export interface PrepItemInput {
  productId: string;
  cubasCount?: number;
  portionsPerCuba?: number;
  quantity?: number;
}

interface StockState {
  products: Product[];
  dailyPrepStock: DailyPrepStock[];
  stockMovements: StockMovement[];
  
  // Ações de Negócio
  setProducts: (products: Product[]) => void;
  initShiftStock: (shiftId: string, items: PrepItemInput[], userId: string) => void;
  consumeStockAtomic: (
    shiftId: string,
    items: { productId: string; quantity: number }[],
    userId: string,
    orderId?: string
  ) => void;
  toggleExhaustProduct: (
    shiftId: string,
    productId: string,
    isExhausted: boolean,
    userId: string,
    reason?: string
  ) => void;
  cancelOrderItemStockAtomic: (
    shiftId: string,
    productId: string,
    quantity: number,
    previousStatus: OrderItemStatus,
    userId: string,
    orderItemId: string,
    reason: string
  ) => { returnedToStock: boolean };
  adjustStockPhysicalCount: (
    shiftId: string,
    productId: string,
    physicalCount: number,
    userId: string,
    reason: string
  ) => void;
  getProductDailyStock: (productId: string) => DailyPrepStock | undefined;
}

export const useStockStore = create<StockState>((set, get) => ({
  products: INITIAL_PRODUCTS,
  dailyPrepStock: [],
  stockMovements: [],

  setProducts: (products) => set({ products }),

  initShiftStock: (shiftId, items, userId) => {
    const newDailyPrep: DailyPrepStock[] = [];
    const newMovements: StockMovement[] = [];
    const updatedProducts = [...get().products];

    items.forEach((item) => {
      const product = updatedProducts.find((p) => p.id === item.productId);
      if (!product) return;

      const cubas = item.cubasCount ?? 0;
      const portionsPerCuba = item.portionsPerCuba ?? product.portions_per_cuba ?? 1;
      
      // Cálculo de porções totais (ex: 3 cubas * 15 porções = 45 porções)
      let initialQty = 0;
      if (cubas > 0) {
        initialQty = Math.round(cubas * portionsPerCuba);
      } else {
        initialQty = item.quantity ?? 0;
      }

      if (initialQty > 0) {
        const prepRecord: DailyPrepStock = {
          id: generateId(),
          shift_id: shiftId,
          product_id: product.id,
          cubas_count: cubas,
          portions_per_cuba: portionsPerCuba,
          initial_quantity: initialQty,
          current_quantity: initialQty,
          reserved_quantity: 0,
          consumed_quantity: 0,
          discarded_quantity: 0,
          adjusted_quantity: 0,
          last_counted_quantity: null,
          count_difference: null,
          is_exhausted: false,
          exhausted_at: null,
          exhausted_by: null,
          exhaust_reason: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          product: product,
        };

        newDailyPrep.push(prepRecord);

        // Movimentação auditável de PRODUÇÃO inicial (+80 picanhas / +45 arroz)
        newMovements.push({
          id: generateId(),
          shift_id: shiftId,
          product_id: product.id,
          quantity: initialQty,
          movement_type: 'PRODUCAO',
          previous_balance: 0,
          new_balance: initialQty,
          order_id: null,
          order_item_id: null,
          reason: 'Abertura de turno - Produção do dia (Mise en place)',
          user_id: userId,
          created_at: new Date().toISOString(),
          product_name: product.name,
        });

        // Garante que o produto está ativo e disponível
        product.available = true;
      }
    });

    set({
      dailyPrepStock: newDailyPrep,
      stockMovements: [...newMovements, ...get().stockMovements],
      products: updatedProducts,
    });

    logger.info({
      context: 'StockStore',
      message: `Mise en place de turno inicializado com ${newDailyPrep.length} produtos preparados.`
    });
  },

  consumeStockAtomic: (shiftId, items, userId, orderId) => {
    const dailyPrepList = [...get().dailyPrepStock];
    const updatedProducts = [...get().products];
    const newMovements: StockMovement[] = [];

    // FASE 1: VALIDAÇÃO ATÔMICA (Todos ou nenhum)
    for (const item of items) {
      const prod = updatedProducts.find((p) => p.id === item.productId);
      if (!prod) {
        throw new Error(`Produto não cadastrado no sistema.`);
      }

      if (!prod.tracks_stock) continue; // Itens sem controle diário de salão

      const dailyStock = dailyPrepList.find(
        (s) => s.shift_id === shiftId && s.product_id === item.productId
      );

      if (!dailyStock) {
        throw new Error(`Produto "${prod.name}" não foi preparado para a produção deste turno.`);
      }

      if (dailyStock.is_exhausted) {
        throw new Error(`Produto "${prod.name}" está ESGOTADO.`);
      }

      if (dailyStock.current_quantity < item.quantity) {
        throw new Error(
          `Estoque insuficiente para "${prod.name}". Saldo disponível: ${dailyStock.current_quantity}, Solicitado: ${item.quantity}.`
        );
      }
    }

    // FASE 2: BAIXA ATÔMICA E REGISTRO AUDITÁVEL
    for (const item of items) {
      const prod = updatedProducts.find((p) => p.id === item.productId);
      if (!prod || !prod.tracks_stock) continue;

      const index = dailyPrepList.findIndex(
        (s) => s.shift_id === shiftId && s.product_id === item.productId
      );
      if (index === -1) continue;

      const dailyStock = dailyPrepList[index]!;
      const prevBalance = dailyStock.current_quantity;
      const newBalance = prevBalance - item.quantity;
      const willExhaust = newBalance === 0;

      dailyPrepList[index] = {
        ...dailyStock,
        current_quantity: newBalance,
        consumed_quantity: dailyStock.consumed_quantity + item.quantity,
        is_exhausted: willExhaust ? true : dailyStock.is_exhausted,
        exhausted_at: willExhaust ? new Date().toISOString() : dailyStock.exhausted_at,
        updated_at: new Date().toISOString(),
      };

      if (willExhaust) {
        prod.available = false;
      }

      newMovements.unshift({
        id: generateId(),
        shift_id: shiftId,
        product_id: prod.id,
        quantity: -item.quantity,
        movement_type: 'VENDA',
        previous_balance: prevBalance,
        new_balance: newBalance,
        order_id: orderId ?? null,
        order_item_id: null,
        reason: 'Venda de Comanda',
        user_id: userId,
        created_at: new Date().toISOString(),
        product_name: prod.name,
      });
    }

    set({
      dailyPrepStock: dailyPrepList,
      products: updatedProducts,
      stockMovements: [...newMovements, ...get().stockMovements],
    });
  },

  toggleExhaustProduct: (shiftId, productId, isExhausted, userId, reason) => {
    const dailyPrepList = [...get().dailyPrepStock];
    const updatedProducts = [...get().products];
    const prod = updatedProducts.find((p) => p.id === productId);

    const index = dailyPrepList.findIndex(
      (s) => s.shift_id === shiftId && s.product_id === productId
    );

    if (index !== -1) {
      dailyPrepList[index] = {
        ...dailyPrepList[index]!,
        is_exhausted: isExhausted,
        exhausted_at: isExhausted ? new Date().toISOString() : null,
        exhausted_by: isExhausted ? userId : null,
        exhaust_reason: reason ?? null,
        updated_at: new Date().toISOString(),
      };
    }

    if (prod) {
      prod.available = !isExhausted;
    }

    set({
      dailyPrepStock: dailyPrepList,
      products: updatedProducts,
    });

    logger.info({
      context: 'StockStore',
      message: `Produto ${prod?.name ?? productId} marcado como ${isExhausted ? 'ESGOTADO' : 'DISPONÍVEL'} pelo usuário.`
    });
  },

  cancelOrderItemStockAtomic: (shiftId, productId, quantity, previousStatus, userId, orderItemId, reason) => {
    const dailyPrepList = [...get().dailyPrepStock];
    const updatedProducts = [...get().products];
    const prod = updatedProducts.find((p) => p.id === productId);
    const index = dailyPrepList.findIndex(
      (s) => s.shift_id === shiftId && s.product_id === productId
    );

    let returnedToStock = false;

    if (index !== -1 && prod && prod.tracks_stock) {
      const dailyStock = dailyPrepList[index]!;

      // REGRA CRÍTICA DE CANCELAMENTO:
      // Se RECEIVED (ainda não entrou na grelha/cozinha): DEVOLVE AO SALDO
      // Se IN_PREPARATION ou READY: NÃO DEVOLVE, VIRA PERDA / DESCARTE
      if (previousStatus === 'RECEIVED') {
        returnedToStock = true;
        const newBalance = dailyStock.current_quantity + quantity;

        dailyPrepList[index] = {
          ...dailyStock,
          current_quantity: newBalance,
          consumed_quantity: Math.max(0, dailyStock.consumed_quantity - quantity),
          is_exhausted: false, // Reativa se estiver zerado
          updated_at: new Date().toISOString(),
        };

        prod.available = true;

        const mov: StockMovement = {
          id: generateId(),
          shift_id: shiftId,
          product_id: productId,
          quantity: quantity,
          movement_type: 'CANCELAMENTO_RETORNO',
          previous_balance: dailyStock.current_quantity,
          new_balance: newBalance,
          order_id: null,
          order_item_id: orderItemId,
          reason: `Cancelamento antes do preparo: ${reason}`,
          user_id: userId,
          created_at: new Date().toISOString(),
          product_name: prod.name,
        };

        set({
          dailyPrepStock: dailyPrepList,
          products: updatedProducts,
          stockMovements: [mov, ...get().stockMovements],
        });
      } else {
        // Já estava na grelha ou pronto: vira PERDA
        dailyPrepList[index] = {
          ...dailyStock,
          discarded_quantity: dailyStock.discarded_quantity + quantity,
          updated_at: new Date().toISOString(),
        };

        const mov: StockMovement = {
          id: generateId(),
          shift_id: shiftId,
          product_id: productId,
          quantity: -quantity,
          movement_type: 'PERDA',
          previous_balance: dailyStock.current_quantity,
          new_balance: dailyStock.current_quantity, // Saldo comercializável não altera pois já foi consumido
          order_id: null,
          order_item_id: orderItemId,
          reason: `Perda/Descarte após preparo: ${reason}`,
          user_id: userId,
          created_at: new Date().toISOString(),
          product_name: prod.name,
        };

        set({
          dailyPrepStock: dailyPrepList,
          stockMovements: [mov, ...get().stockMovements],
        });
      }
    }

    return { returnedToStock };
  },

  adjustStockPhysicalCount: (shiftId, productId, physicalCount, userId, reason) => {
    if (physicalCount < 0) {
      throw new Error('Contagem física não pode ser negativa.');
    }

    const dailyPrepList = [...get().dailyPrepStock];
    const updatedProducts = [...get().products];
    const prod = updatedProducts.find((p) => p.id === productId);
    const index = dailyPrepList.findIndex(
      (s) => s.shift_id === shiftId && s.product_id === productId
    );

    if (index === -1) {
      throw new Error('Produto não cadastrado na produção deste turno.');
    }

    const stock = dailyPrepList[index]!;
    const diff = physicalCount - stock.current_quantity;

    dailyPrepList[index] = {
      ...stock,
      last_counted_quantity: physicalCount,
      count_difference: diff,
      adjusted_quantity: stock.adjusted_quantity + diff,
      current_quantity: physicalCount,
      is_exhausted: physicalCount === 0,
      updated_at: new Date().toISOString(),
    };

    if (prod) {
      prod.available = physicalCount > 0;
    }

    const mov: StockMovement = {
      id: generateId(),
      shift_id: shiftId,
      product_id: productId,
      quantity: diff,
      movement_type: 'AJUSTE',
      previous_balance: stock.current_quantity,
      new_balance: physicalCount,
      order_id: null,
      order_item_id: null,
      reason: `Contagem Física: ${reason}`,
      user_id: userId,
      created_at: new Date().toISOString(),
      product_name: prod?.name,
    };

    set({
      dailyPrepStock: dailyPrepList,
      products: updatedProducts,
      stockMovements: [mov, ...get().stockMovements],
    });
  },

  getProductDailyStock: (productId: string) => {
    return get().dailyPrepStock.find((s) => s.product_id === productId);
  },
}));
