import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WaiterPortal, isWaiterProfile } from '../WaiterPortal';
import { WaiterModule } from '../WaiterModule';
import { WaiterOrderPad } from '../WaiterOrderPad';
import { WaiterDonenessModal } from '../WaiterDonenessModal';
import { INITIAL_PROFILES, INITIAL_PRODUCTS, INITIAL_TABLES } from '../../../lib/mockData';
import { useAuthStore } from '../../../stores/useAuthStore';
import { useTableStore } from '../../../stores/useTableStore';
import { useCartStore } from '../../../stores/useCartStore';
import { useStockStore } from '../../../stores/useStockStore';
import { useShiftStore } from '../../../stores/useShiftStore';
import { FeedbackProvider } from '../../../components/ui/FeedbackProvider';

const pad = (props: React.ComponentProps<typeof WaiterOrderPad>) => renderToStaticMarkup(<FeedbackProvider><WaiterOrderPad {...props} /></FeedbackProvider>);

vi.mock('../../../lib/supabase', () => ({ isSupabaseConfigured: false, supabase: {} }));
vi.mock('../../../lib/realtime', () => ({ realtimeService: { broadcastNewOrder: vi.fn(), broadcastOrderReady: vi.fn(), broadcastStockChange: vi.fn() } }));
vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) => getSnapshot());

const waiter = INITIAL_PROFILES.find((profile) => profile.role === 'GARCOM')!;
const master = INITIAL_PROFILES.find((profile) => profile.role === 'MASTER')!;
const table = INITIAL_TABLES[0]!;
const product = INITIAL_PRODUCTS.find((item) => item.id === 'prod-picanha')!;

describe('Area dedicada do garcom', () => {
  beforeEach(() => {
    useAuthStore.setState({ currentProfile: master, availableProfiles: INITIAL_PROFILES });
    useTableStore.setState({ tables: INITIAL_TABLES, tabs: [], orders: [], orderItems: [], payments: [] });
    useCartStore.setState({ tableCarts: {} });
    useShiftStore.setState({ currentShift: null });
    useStockStore.setState({ products: INITIAL_PRODUCTS, dailyPrepStock: [], stockMovements: [] });
  });

  it('exige perfil completo, ativo e de garcom', () => {
    expect(isWaiterProfile(waiter)).toBe(true);
    expect(isWaiterProfile(master)).toBe(false);
    expect(isWaiterProfile({ ...waiter, is_active: false })).toBe(false);
    expect(isWaiterProfile({ role: 'GARCOM', is_active: true })).toBe(false);
    expect(isWaiterProfile(null)).toBe(false);
  });

  it('abre identificacao propria e informa a limitacao local sem expor o painel', () => {
    const html = renderToStaticMarkup(<WaiterPortal />);
    expect(html).toContain('Entrar no atendimento');
    expect(html).toContain('Demonstração local');
    expect(html).toContain('não são sincronizados');
    expect(html).toContain(waiter.name);
    expect(html).not.toContain(master.name);
    expect(html).not.toContain('Abrir turno');
    expect(html).not.toContain('Configurações');
    expect(html).not.toContain('Mesa 01');
  });

  it('na area dedicada nao oferece abertura de turno nem link para o painel', () => {
    const html = renderToStaticMarkup(<WaiterModule dedicated onOpenShiftClick={vi.fn()} />);
    expect(html).toContain('Mesas');
    expect(html).toContain('Prontos');
    expect(html).toContain('Livres');
    expect(html).not.toContain('lugares');
    expect(html).toContain('Solicite a abertura ao gerente');
    expect(html).not.toContain('Abrir turno');
    expect(html).not.toContain('href="#/garcom"');
  });

  it('mantem o acesso a area movel no atendimento administrativo', () => {
    const html = renderToStaticMarkup(<WaiterModule onOpenShiftClick={vi.fn()} />);
    expect(html).toContain('href="#/garcom"');
    expect(html).toContain('Abrir turno');
  });

  it('remove cadastro de produtos do celular mesmo com perfil administrativo', () => {
    const html = pad({ table, dedicated: true, onBackToTables: vi.fn() });
    expect(html).not.toContain('Novo Produto');
    expect(html).toContain('Ver consumo');
    expect(html).toContain('Esta comanda foi encerrada');
    const admin = pad({ table, onBackToTables: vi.fn() });
    expect(admin).toContain('Novo Produto');
    useAuthStore.setState({ currentProfile: waiter });
    expect(pad({ table, onBackToTables: vi.fn() })).not.toContain('Novo Produto');
  });

  it('permite observacoes sem oferecer ponto da carne para outros produtos', () => {
    const html = renderToStaticMarkup(<WaiterDonenessModal product={{ ...product, allows_doneness: false, allows_notes: true }} isOpen onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(html).toContain('Alguma observação?');
    expect(html).not.toContain('Como você prefere o ponto?');
    expect(html).not.toContain('Sem sal grosso');
  });

  it('preserva rascunho e comanda quando a rodada falha por falta de estoque', () => {
    const tab = useTableStore.getState().openTab(table.id, 'Cliente', 2, '', waiter.id, 'shift-test');
    useStockStore.getState().initShiftStock('shift-test', [{ productId: product.id, quantity: 2 }], waiter.id);
    useCartStore.getState().addItem(table.id, product, 2, 'AO_PONTO', 'Pouco sal');
    // Outro garçom vendeu uma unidade enquanto este rascunho estava aberto
    useStockStore.setState({ dailyPrepStock: useStockStore.getState().dailyPrepStock.map((s) => (s.product_id === product.id ? { ...s, current_quantity: 1 } : s)) });
    const drafts = useCartStore.getState().getCart(table.id);
    expect(() => useTableStore.getState().addOrderAtomic('shift-test', tab.id, drafts.map((item) => ({ productId: item.product.id, quantity: item.quantity })), waiter.id)).toThrow();
    expect(useCartStore.getState().getCart(table.id)).toEqual(drafts);
    expect(useTableStore.getState().orders).toHaveLength(0);
    expect(useTableStore.getState().getTabByTableId(table.id)?.subtotal).toBe(0);
    expect(useStockStore.getState().getProductDailyStock(product.id)?.current_quantity).toBe(1);
  });

  it('espeto com acompanhamento ocupa o espeto e o arroz no rascunho e na baixa', () => {
    const base = { ...product, id: 'p-base', name: 'Picanha', tracks_stock: true };
    const combo = { ...product, id: 'p-combo', name: 'Picanha com acompanhamento', tracks_stock: true };
    const rice = { ...product, id: 'p-rice', name: 'Arroz', allows_doneness: false, tracks_stock: true };
    useStockStore.setState({ products: [base, combo, rice], dailyPrepStock: [], stockMovements: [] });
    useStockStore.getState().initShiftStock('shift-test', [{ productId: base.id, quantity: 3 }, { productId: combo.id, quantity: 2 }, { productId: rice.id, quantity: 2 }], waiter.id);
    useCartStore.getState().addItem(table.id, base, 2, 'AO_PONTO');
    useCartStore.getState().addItem(table.id, combo, 1, 'AO_PONTO');
    // 3 picanhas preparadas: 2 avulsas + 1 combo já ocupam todas
    expect(() => useCartStore.getState().addItem(table.id, combo, 1, 'AO_PONTO')).toThrow('Picanha');
    useCartStore.setState({ tableCarts: {} });
    useCartStore.getState().addItem(table.id, combo, 2, 'AO_PONTO');
    // Só havia 2 arroz
    expect(() => useCartStore.getState().addItem(table.id, combo, 1, 'AO_PONTO')).toThrow();
    useStockStore.getState().consumeStockAtomic('shift-test', [{ productId: combo.id, quantity: 1 }], waiter.id, 'o1');
    const qty = (id: string) => useStockStore.getState().getProductDailyStock(id)?.current_quantity;
    expect(qty(base.id)).toBe(2);
    expect(qty(rice.id)).toBe(1);
    expect(qty(combo.id)).toBe(1);
  });

  it('formata o tempo de mesa sem "630 min"', async () => {
    const { formatElapsedMinutes } = await import('../../../lib/formatters');
    const t0 = new Date('2026-10-15T12:00:00Z').getTime();
    expect(formatElapsedMinutes(new Date(t0).toISOString(), t0 + 52 * 60000)).toBe('52 min');
    expect(formatElapsedMinutes(new Date(t0).toISOString(), t0 + 65 * 60000)).toBe('1h05');
    expect(formatElapsedMinutes(new Date(t0).toISOString(), t0 + 630 * 60000)).toBe('10h30');
  });

  it('nao deixa anotar mais espetos do que ha no estoque do turno', () => {
    useStockStore.getState().initShiftStock('shift-test', [{ productId: product.id, quantity: 3 }], waiter.id);
    useCartStore.getState().addItem(table.id, product, 2, 'AO_PONTO');
    expect(() => useCartStore.getState().addItem(table.id, product, 2, 'MAL_PASSADA')).toThrow('Só resta 1 unidade');
    useCartStore.getState().addItem(table.id, product, 1, 'MAL_PASSADA');
    const first = useCartStore.getState().getCart(table.id)[0]!;
    expect(() => useCartStore.getState().updateQuantity(table.id, first.id, 1)).toThrow('Já estão no pedido todas as 3');
    useStockStore.setState({ dailyPrepStock: useStockStore.getState().dailyPrepStock.map((s) => ({ ...s, is_exhausted: true })) });
    expect(() => useCartStore.getState().addItem('outra-mesa', product, 1)).toThrow('esgotou');
  });
});