import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import { logger } from './logger';
import { audioService } from './audio';
import { useTableStore } from '../stores/useTableStore';
import { useShiftStore } from '../stores/useShiftStore';
import { useStockStore } from '../stores/useStockStore';
import { useAuthStore } from '../stores/useAuthStore';
import { usePrintStore } from '../stores/usePrintStore';
import { useDeliveryStore } from '../stores/useDeliveryStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import type { RestaurantTable, Tab, Order, OrderItem, DailyPrepStock, Shift, Payment, Product, WhatsAppMessage, Category, PrinterStatusRecord } from '../types/domain';

class SyncService {
  private channel: RealtimeChannel | null = null;
  private isHydrated = false;
  private isHydrating = false;
  private isSubscribed = false;
  private hadConnectionLoss = false;
  private removeResyncListeners: (() => void) | null = null;

  /**
   * Carga inicial (Hydration) do banco compartilhado Supabase.
   * Carrega turno aberto, mesas, comandas ativas, pedidos, itens e estoque diário.
   */
  public async hydrateAll(): Promise<void> {
    if (this.isHydrating) {
      logger.debug({ context: 'SyncService', message: 'Hidratação já em andamento, ignorando chamada concorrente.' });
      return;
    }
    if (!isSupabaseConfigured) {
      logger.debug({
        context: 'SyncService',
        message: 'Supabase não configurado. Mantendo dados em memória local.',
      });
      return;
    }

    // As políticas RLS exigem usuário autenticado; sem sessão não há o que carregar.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      logger.debug({ context: 'SyncService', message: 'Sem sessão autenticada. Hidratação adiada até o login.' });
      return;
    }

    this.isHydrating = true;
    try {
      logger.info({ context: 'SyncService', message: 'Iniciando sincronização e hidratação de dados remotos...' });

      // 0. Cardápio (IDs reais do banco; os IDs de demonstração não existem no Supabase)
      const { data: dbProducts, error: productsError } = await supabase
        .from('products')
        .select('*')
        .order('display_order', { ascending: true });
      if (productsError) {
        logger.warn({ context: 'SyncService', message: 'Aviso ao buscar produtos', error: productsError });
      } else if (dbProducts && dbProducts.length > 0) {
        useStockStore.setState({
          products: dbProducts.map((p) => ({ ...p, price: Number(p.price) })) as Product[],
        });
      }

      // 0b. Categorias reais (os filtros do garçom e do cadastro dependem dos IDs do banco)
      const { data: dbCategories, error: categoriesError } = await supabase
        .from('categories')
        .select('*')
        .order('display_order', { ascending: true });
      if (categoriesError) {
        logger.warn({ context: 'SyncService', message: 'Aviso ao buscar categorias', error: categoriesError });
      } else if (dbCategories && dbCategories.length > 0) {
        useStockStore.setState({ categories: dbCategories as Category[] });
      }

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
      } else {
        useShiftStore.setState({ currentShift: (shiftData as Shift | null) ?? null });
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

      // 3. Busca comandas abertas + as já fechadas do turno atual (faturamento, caixa e fechamento do turno dependem delas)
      const shiftId = (shiftData as Shift | null)?.id;
      const { data: dbTabs, error: tabsError } = await supabase
        .from('tabs')
        .select('*')
        .or(shiftId ? `status.eq.OPEN,shift_id.eq.${shiftId}` : 'status.eq.OPEN');

      if (tabsError) {
        logger.warn({ context: 'SyncService', message: 'Aviso ao buscar comandas', error: tabsError });
      }

      const activeTabs = ((dbTabs || []) as Tab[]).map((t) => ({
        ...t,
        subtotal: Number(t.subtotal),
        service_fee: Number(t.service_fee),
        discount: Number(t.discount),
        total: Number(t.total),
      }));

      // Atualiza mesas associando comanda atual
      if (dbTables && dbTables.length > 0) {
        const mergedTables: RestaurantTable[] = dbTables.map((tbl) => {
          const matchingTab = activeTabs.find((tab) => tab.status === 'OPEN' && (tab.table_id === tbl.id || tab.table_id === `table-${tbl.number}`));
          return {
            ...tbl,
            updated_at: tbl.updated_at ?? new Date().toISOString(),
            updated_by: tbl.updated_by ?? null,
            version: tbl.version ?? 1,
            status: matchingTab ? (tbl.status === 'AGUARDANDO_CONTA' ? 'AGUARDANDO_CONTA' : 'OCUPADA') : 'LIVRE',
            current_tab: matchingTab,
          };
        });
        useTableStore.setState({ tables: mergedTables, tabs: activeTabs });
      } else {
        useTableStore.setState({ tabs: activeTabs });
      }

      // 4. Busca pedidos, itens e pagamentos das comandas abertas
      if (activeTabs.length === 0) {
        useTableStore.setState({ orders: [], orderItems: [], payments: [] });
      } else {
        const tabIds = activeTabs.map((t) => t.id);

        const { data: dbPayments, error: paymentsError } = await supabase
          .from('payments')
          .select('*')
          .in('tab_id', tabIds)
          .eq('status', 'PAID');
        if (paymentsError) throw paymentsError;
        useTableStore.setState({
          payments: ((dbPayments || []) as Payment[]).map((p) => ({ ...p, amount: Number(p.amount) })),
        });

        const { data: dbOrders, error: ordersError } = await supabase
          .from('orders')
          .select('*')
          .in('tab_id', tabIds);
        if (ordersError) throw ordersError;

        const ordersList = (dbOrders || []).map((o) => ({
          ...o,
          updated_at: o.updated_at ?? new Date().toISOString(),
          updated_by: o.updated_by ?? null,
          version: o.version ?? 1,
        })) as Order[];

        if (ordersList.length === 0) {
          useTableStore.setState({ orders: [], orderItems: [] });
        } else {
          const orderIds = ordersList.map((o) => o.id);
          const { data: dbItems, error: itemsError } = await supabase
            .from('order_items')
            .select('*')
            .in('order_id', orderIds);
          if (itemsError) throw itemsError;

          const itemsList = (dbItems || []).map((item) => ({
            ...item,
            unit_price: Number(item.unit_price),
            updated_at: item.updated_at ?? new Date().toISOString(),
            updated_by: item.updated_by ?? null,
            version: item.version ?? 1,
          })) as OrderItem[];
          useTableStore.setState({ orders: ordersList, orderItems: itemsList });
        }
      }

      // 5. Busca estoque do turno se houver turno aberto
      if (shiftData) {
        const { data: dbStock, error: stockError } = await supabase
          .from('daily_prep_stock')
          .select('*')
          .eq('shift_id', shiftData.id);
        if (stockError) throw stockError;

        useStockStore.setState({ dailyPrepStock: (dbStock || []) as DailyPrepStock[] });
      } else if (!shiftError) {
        useStockStore.setState({ dailyPrepStock: [] });
      }

      // 6. Fila de impressão e pedidos de delivery (cardápio digital)
      await Promise.all([
        useSettingsStore.getState().loadRemoteSettings(),
        useDeliveryStore.getState().loadWhatsAppMessages(),
        usePrintStore.getState().loadRemoteJobs(),
        usePrintStore.getState().loadPrinterStatus(),
        useDeliveryStore.getState().loadRemoteDeliveryOrders(),
      ]);

      this.isHydrated = true;
      logger.info({ context: 'SyncService', message: 'Hidratação de dados remotos concluída com sucesso.' });
    } catch (err) {
      logger.error({ context: 'SyncService', message: 'Erro ao hidratar dados do Supabase', error: err });
    } finally {
      this.isHydrating = false;
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
            if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
              const updated = payload.new as RestaurantTable;
              if (payload.eventType === 'INSERT' && !tableStore.tables.some((t) => t.id === updated.id)) {
                useTableStore.setState({ tables: [...tableStore.tables, updated].sort((a, b) => a.number - b.number) });
              } else {
                tableStore.applyRemoteTableUpdate(updated);
              }
            } else if (payload.eventType === 'DELETE') {
              const removedId = (payload.old as Partial<RestaurantTable>).id;
              useTableStore.setState({ tables: tableStore.tables.filter((t) => t.id !== removedId) });
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
            } else if (payload.eventType === 'DELETE') {
              tableStore.applyRemoteOrderChange('DELETE', payload.old as Order);
            }
          }
        )
        // 3a. Fila de impressão (status confirmado pelo printer-bridge)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'print_queue' },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              const id = (payload.old as { id?: string } | null)?.id;
              if (id) usePrintStore.getState().removeRemoteJob(id);
            } else usePrintStore.getState().applyRemoteJob(payload.new as Record<string, unknown>);
          }
        )
        // 3a-2. Status em tempo real das impressoras e do PC da loja
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'printer_status' },
          (payload) => {
            if (payload.new) {
              usePrintStore.getState().applyRemotePrinterStatus(payload.new as PrinterStatusRecord);
            }
          }
        )
        // 3c. Pedidos do cardápio digital
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'delivery_orders' },
          (payload) => {
            if (payload.eventType !== 'DELETE') void useDeliveryStore.getState().applyRemoteDeliveryOrder(payload.new as Record<string, unknown>);
          }
        )
        // 3d. Mensagens automáticas de WhatsApp (enviado / falhou)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'whatsapp_outbox' },
          (payload) => {
            if (payload.eventType !== 'DELETE') useDeliveryStore.getState().applyRemoteWhatsAppMessage(payload.new as WhatsAppMessage);
          }
        )
        // 3b. Pagamentos (caixas simultâneos)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payments' },
          (payload) => {
            const tableStore = useTableStore.getState();
            if (payload.eventType === 'DELETE') {
              tableStore.applyRemotePaymentChange('DELETE', payload.old as Payment);
            } else {
              tableStore.applyRemotePaymentChange(payload.eventType, payload.new as Payment);
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
            } else if (payload.eventType === 'DELETE') {
              tableStore.applyRemoteOrderItemChange('DELETE', payload.old as OrderItem);
            } else if (payload.eventType === 'UPDATE') {
              const updatedItem = payload.new as OrderItem;
              const oldItem = payload.old as Partial<OrderItem>;
              tableStore.applyRemoteOrderItemChange('UPDATE', updatedItem);

              // Alerta de 'Item Pronto para Servir' para garçons e gerência
              // payload.old só traz o status com REPLICA IDENTITY FULL; usa o estado local como referência
              const previousStatus =
                oldItem?.status ?? tableStore.orderItems.find((i) => i.id === updatedItem.id)?.status;
              if (
                updatedItem.status === 'READY' &&
                previousStatus !== 'READY' &&
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
        // 5b. Cardápio: produto cadastrado, editado, pausado ou removido em outro aparelho
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'products' },
          (payload) => {
            const products = useStockStore.getState().products;
            if (payload.eventType === 'DELETE') {
              const removedId = (payload.old as Partial<Product>).id;
              useStockStore.setState({ products: products.filter((p) => p.id !== removedId) });
              return;
            }
            const row = payload.new as Product;
            const product = { ...row, price: Number(row.price) };
            const exists = products.some((p) => p.id === product.id);
            useStockStore.setState({
              products: (exists ? products.map((p) => (p.id === product.id ? { ...p, ...product } : p)) : [...products, product])
                .sort((a, b) => a.display_order - b.display_order),
            });
          }
        )
        // 5c. Configurações da loja (modelos de cupom, PIX, taxa de serviço)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'restaurant_settings' },
          () => { void useSettingsStore.getState().loadRemoteSettings(); }
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
                  useStockStore.setState({ dailyPrepStock: [] });
                }
              }
            }
          }
        )
        .subscribe((status) => {
          logger.debug({ context: 'SyncService', message: `Canal postgres-db-sync: ${status}` });
          if (status === 'SUBSCRIBED') {
            // Reconexão após queda: recarrega o estado para recuperar eventos perdidos
            if (this.hadConnectionLoss) {
              this.hadConnectionLoss = false;
              void this.hydrateAll();
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            this.hadConnectionLoss = true;
          }
        });

      this.channel = channel;
      this.isSubscribed = true;

      // Aparelho voltou do modo suspenso ou recuperou a rede: ressincroniza
      const resync = () => {
        if (document.visibilityState === 'visible') void this.hydrateAll();
      };
      window.addEventListener('online', resync);
      document.addEventListener('visibilitychange', resync);
      this.removeResyncListeners = () => {
        window.removeEventListener('online', resync);
        document.removeEventListener('visibilitychange', resync);
      };

      return () => this.unsubscribe();
    } catch (err) {
      logger.warn({ context: 'SyncService', message: 'Erro ao assinar canal postgres-db-sync', error: err });
      return () => {};
    }
  }

  public unsubscribe(): void {
    this.removeResyncListeners?.();
    this.removeResyncListeners = null;
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
