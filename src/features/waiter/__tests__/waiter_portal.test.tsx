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
    expect(html).toContain('Entrar como garçom');
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
    expect(html).toContain('Escolha a mesa');
    expect(html).toContain('Para servir');
    expect(html).toContain('Solicite a abertura ao gerente');
    expect(html).not.toContain('Abrir Turno Agora');
    expect(html).not.toContain('href="#/garcom"');
  });

  it('mantem o acesso a area movel no atendimento administrativo', () => {
    const html = renderToStaticMarkup(<WaiterModule onOpenShiftClick={vi.fn()} />);
    expect(html).toContain('href="#/garcom"');
    expect(html).toContain('Abrir Turno Agora');
  });

  it('remove cadastro de produtos do celular mesmo com perfil administrativo', () => {
    const html = renderToStaticMarkup(<WaiterOrderPad table={table} dedicated onBackToTables={vi.fn()} />);
    expect(html).not.toContain('Novo Produto');
    expect(html).toContain('Ver consumo');
    expect(html).toContain('Esta comanda foi encerrada');
    const admin = renderToStaticMarkup(<WaiterOrderPad table={table} onBackToTables={vi.fn()} />);
    expect(admin).toContain('Novo Produto');
    useAuthStore.setState({ currentProfile: waiter });
    expect(renderToStaticMarkup(<WaiterOrderPad table={table} onBackToTables={vi.fn()} />)).not.toContain('Novo Produto');
  });

  it('permite observacoes sem oferecer ponto da carne para outros produtos', () => {
    const html = renderToStaticMarkup(<WaiterDonenessModal product={{ ...product, allows_doneness: false, allows_notes: true }} isOpen onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(html).toContain('Alguma observação?');
    expect(html).not.toContain('Como você prefere o ponto?');
    expect(html).not.toContain('Sem sal grosso');
  });

  it('preserva rascunho e comanda quando a rodada falha por falta de estoque', () => {
    const tab = useTableStore.getState().openTab(table.id, 'Cliente', 2, '', waiter.id, 'shift-test');
    useStockStore.getState().initShiftStock('shift-test', [{ productId: product.id, quantity: 1 }], waiter.id);
    useCartStore.getState().addItem(table.id, product, 2, 'AO_PONTO', 'Pouco sal');
    const drafts = useCartStore.getState().getCart(table.id);
    expect(() => useTableStore.getState().addOrderAtomic('shift-test', tab.id, drafts.map((item) => ({ productId: item.product.id, quantity: item.quantity })), waiter.id)).toThrow();
    expect(useCartStore.getState().getCart(table.id)).toEqual(drafts);
    expect(useTableStore.getState().orders).toHaveLength(0);
    expect(useTableStore.getState().getTabByTableId(table.id)?.subtotal).toBe(0);
    expect(useStockStore.getState().getProductDailyStock(product.id)?.current_quantity).toBe(1);
  });
});
