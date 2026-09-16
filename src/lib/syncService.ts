import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { logger } from './logger';
import { audioService } from './audio';
import { useTableStore } from '../stores/useTableStore';
import { useShiftStore } from '../stores/useShiftStore';
import { useStockStore } from '../stores/useStockStore';
import { useAuthStore } from '../stores/useAuthStore';
import type { RestaurantTable, Tab, Order, OrderItem, DailyPrepStock, Shift } from '../types/domain';

class SyncService {
  private channel: RealtimeChannel | null = null;
  private isHydrated = false;
  private isSubscribed = false;

  /**
   * Carga inicial (Hydration) do banco compartilhado Supabase.
   * Carrega turno aberto, mesas, comandas ativas, pedidos, itens e estoque diário.
   */
  public async hydrateAll(): Promise<void> {
    if (!isSupabaseConfigured) {
      logger.debug({
        context: 'SyncService',
        message: 'Supabase não configurado. Mantendo dados em memória local.',
      });
      return;
    }

    try {
      logger.info({ context: 'SyncService', message: 'Iniciando sincronização e hidratação de dados remotos...' });

      // 1. Busca turno aberto
      const { data: shiftData, error: shiftError } = await supabase
        .from('shifts')
        .select('*')
        .eq('status', 'ABERTO')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (shiftError) {
        logger.warn({ context: 'SyncService', message: 'Aviso ao buscar turno ativo', error: shiftError });
      } else if (shiftData) {
        useShiftStore.setState({ currentShift: shiftData as Shift });
      }

      // 2. Busca mesas cadastradas
      const { data: dbTables, error: tablesError } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('active', true)
        .order('number', { ascending: true });

      if (tablesError) {
        logger.warn({ context: 'SyncService', message: 'Aviso ao buscar mesas', error: tablesError });
      }

      // 3. Busca comandas abertas
      const { data: dbTabs, error: tabsError } = await supabase
        .from('tabs')
        .select('*')
        .eq('status', 'OPEN');

      if (tabsError) {
        logger.warn({ context: 'SyncService', message: 'Aviso ao buscar comandas', error: tabsError });
      }

      const activeTabs = (dbTabs || []) as Tab[];

      // Atualiza mesas associando comanda atual
      if (dbTables && dbTables.length > 0) {
        const mergedTables: RestaurantTable[] = dbTables.map((tbl) => {
          const matchingTab = activeTabs.find((tab) => tab.table_id === tbl.id || tab.table_id === `table-${tbl.number}`);
          return {
            id: tbl.id,
            number: tbl.number,
            capacity: tbl.capacity,
            status: matchingTab ? (tbl.status === 'AGUARDANDO_CONTA' ? 'AGUARDANDO_CONTA' : 'OCUPADA') : 'LIVRE',
            active: tbl.active,
            created_at: tbl.created_at,
            current_tab: matchingTab,
          };
        });
        useTableStore.setState({ tables: mergedTables, tabs: activeTabs });
      } else if (activeTabs.length > 0) {
        useTableStore.setState({ tabs: activeTabs });
      }

      // 4. Busca pedidos e itens das comandas abertas
      if (activeTabs.length > 0) {
        const tabIds = activeTabs.map((t) => t.id);
        const { data: dbOrders } = await supabase
          .from('orders')
          .select('*')
          .in('tab_id', tabIds);

        const ordersList = (dbOrders || []) as Order[];

        if (ordersList.length > 0) {
          const orderIds = ordersList.map((o) => o.id);
          const { data: dbItems } = await supabase
            .from('order_items')
            .select('*')
            .in('order_id', orderIds);

          const itemsList = (dbItems || []) as OrderItem[];
          useTableStore.setState({ orders: ordersList, orderItems: itemsList });
        }
      }

      // 5. Busca estoque do turno se houver turno aberto
      if (shiftData) {
        const { data: dbStock } = await supabase
          .from('daily_prep_stock')
          .select('*')
          .eq('shift_id', shiftData.id);

        if (dbStock && dbStock.length > 0) {
          useStockStore.setState({ dailyPrepStock: dbStock as DailyPrepStock[] });
        }
      }

      this.isHydrated = true;
      logger.info({ context: 'SyncService', message: 'Hidratação de dados remotos concluída com sucesso.' });
    } catch (err) {
      logger.error({ context: 'SyncService', message: 'Erro ao hidratar dados do Supabase', error: err });
    }
  }

  /**
   * Assina canais Realtime do Postgres (postgres_changes) para sincronizar
   * mutações originadas em qualquer aparelho (celular, KDS, caixa).
   */
  public subscribeToDatabaseChanges(): () => void {
    if (!isSupabaseConfigured) {
      return () => {};
    }

    if (this.isSubscribed && this.channel) {
      return () => this.unsubscribe();
    }

    try {
      const channel = supabase
        .channel('postgres-db-sync')
        // 1. Mudanças em restaurant_tables
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'restaurant_tables' },
          (payload) => {
            const tableStore = useTableStore.getState();
            if (payload.eventType === 'UPDATE') {
              const updated = payload.new as RestaurantTable;
              tableStore.applyRemoteTableUpdate(updated);
            }
          }
        )
        // 2. Mudanças em tabs (comandas)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tabs' },
          (payload) => {
            const tableStore = useTableStore.getState();
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              tableStore.applyRemoteTabChange(payload.eventType, payload.new as Tab);
            } else if (payload.eventType === 'DELETE') {
              tableStore.applyRemoteTabChange('DELETE', payload.old as Tab);
            }
          }
        )
        // 3. Mudanças em orders (pedidos)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'orders' },
          (payload) => {
            const tableStore = useTableStore.getState();
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              tableStore.applyRemoteOrderChange(payload.eventType, payload.new as Order);
            }
          }
        )
        // 4. Mudanças em order_items (itens de pedido)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'order_items' },
          (payload) => {
            const tableStore = useTableStore.getState();
            const currentRole = useAuthStore.getState().currentProfile?.role;

            if (payload.eventType === 'INSERT') {
              const newItem = payload.new as OrderItem;
              tableStore.applyRemoteOrderItemChange('INSERT', newItem);

              // Toca alerta sonoro nos setores correspondentes
              if (
                (newItem.sector === 'GRILL' && ['CHURRASQUEIRA', 'GERENTE', 'MASTER'].includes(currentRole)) ||
                (newItem.sector === 'KITCHEN' && ['COZINHA', 'GERENTE', 'MASTER'].includes(currentRole)) ||
                (newItem.sector === 'BAR' && ['BAR', 'GERENTE', 'MASTER'].includes(currentRole))
              ) {
                audioService.playNewOrderSound();
              }
            } else if (payload.eventType === 'UPDATE') {
              const updatedItem = payload.new as OrderItem;
              const oldItem = payload.old as Partial<OrderItem>;
              tableStore.applyRemoteOrderItemChange('UPDATE', updatedItem);

              // Alerta de 'Item Pronto para Servir' para garçons e gerência
              if (
                updatedItem.status === 'READY' &&
                oldItem?.status !== 'READY' &&
                ['GARCOM', 'GERENTE', 'MASTER'].includes(currentRole)
              ) {
                audioService.playOrderReadySound();
              }
            }
          }
        )
        // 5. Mudanças no estoque diário (daily_prep_stock)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'daily_prep_stock' },
          (payload) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              useStockStore.getState().applyRemoteStockChange(payload.new as DailyPrepStock);
            }
          }
        )
        // 6. Mudanças de Turno (shifts)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'shifts' },
          (payload) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const shift = payload.new as Shift;
              if (shift.status === 'ABERTO') {
                useShiftStore.setState({ currentShift: shift });
              } else if (shift.status === 'FECHADO') {
                const current = useShiftStore.getState().currentShift;
                if (current && current.id === shift.id) {
                  useShiftStore.setState({ currentShift: null });
                }
              }
            }
          }
        )
        .subscribe((status) => {
          logger.debug({ context: 'SyncService', message: `Canal postgres-db-sync: ${status}` });
        });

      this.channel = channel;
      this.isSubscribed = true;

      return () => this.unsubscribe();
    } catch (err) {
      logger.warn({ context: 'SyncService', message: 'Erro ao assinar canal postgres-db-sync', error: err });
      return () => {};
    }
  }

  public unsubscribe(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
      this.isSubscribed = false;
    }
  }

  public getHydrated(): boolean {
    return this.isHydrated;
  }
}

export const syncService = new SyncService();
