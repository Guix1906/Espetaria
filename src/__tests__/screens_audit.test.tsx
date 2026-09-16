import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MasterDashboardView } from '../features/admin/MasterDashboardView';
import { WaiterModule } from '../features/waiter/WaiterModule';
import { TableGridView } from '../features/tables/TableGridView';
import { KDSModule } from '../features/kds/KDSModule';
import { GrillKDSView } from '../features/kds/GrillKDSView';
import { KitchenKDSView } from '../features/kds/KitchenKDSView';
import { BarKDSView } from '../features/kds/BarKDSView';
import { CashierModule } from '../features/cashier/CashierModule';
import { DeliveryManagementView } from '../features/delivery/DeliveryManagementView';
import { DeliveryCatalogView } from '../features/delivery/DeliveryCatalogView';
import { ProductCatalogManageView } from '../features/products/ProductCatalogManageView';
import { DailyStockView } from '../features/stock/DailyStockView';
import { AuditLogView } from '../features/audit/AuditLogView';
import { SettingsView } from '../features/settings/SettingsView';
import { ShiftOpenModal } from '../features/shifts/ShiftOpenModal';
import { ShiftCloseModal } from '../features/admin/ShiftCloseModal';
import { TableSettlementModal } from '../features/cashier/TableSettlementModal';
import { PixPaymentModal } from '../features/pix/PixPaymentModal';
import { DeliveryCartDrawer } from '../features/delivery/DeliveryCartDrawer';
import { ProductFormModal } from '../features/products/ProductFormModal';
import { ReceiptModal } from '../features/cashier/ReceiptModal';
import { FeedbackProvider } from '../components/ui/FeedbackProvider';
import { useShiftStore } from '../stores/useShiftStore';
import { useStockStore } from '../stores/useStockStore';
import { useTableStore } from '../stores/useTableStore';
import { useDeliveryStore } from '../stores/useDeliveryStore';
import { usePrintStore } from '../stores/usePrintStore';
import { useAuthStore } from '../stores/useAuthStore';
import { INITIAL_PRODUCTS, INITIAL_TABLES } from '../lib/mockData';

// Mock Web Audio Context
class MockAudioContext {
  currentTime = 0;
  state = 'running';
  resume = vi.fn().mockResolvedValue(undefined);
  createOscillator = vi.fn().mockReturnValue({
    type: 'sine',
    frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  });
  createGain = vi.fn().mockReturnValue({
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  });
  destination = {};
}
vi.stubGlobal('AudioContext', MockAudioContext);

// Override React.useSyncExternalStore to evaluate getSnapshot() in Node/SSR
(React as any).useSyncExternalStore = (_subscribe: any, getSnapshot: () => any) => getSnapshot();

function renderWithFeedback(component: React.ReactElement): string {
  return renderToStaticMarkup(
    <FeedbackProvider>
      {component}
    </FeedbackProvider>
  );
}

describe('Auditoria Completa de Todas as Telas e Módulos do Sistema', () => {
  const syncStores = () => {
    const stores = [useShiftStore, useTableStore, useStockStore, useDeliveryStore, usePrintStore, useAuthStore];
    stores.forEach((s) => {
      (s as any).getInitialState = () => s.getState();
    });
  };

  beforeEach(() => {
    useShiftStore.setState({ currentShift: null, shiftsHistory: [] });
    useTableStore.setState({
      tables: INITIAL_TABLES,
      tabs: [],
      orders: [],
      orderItems: [],
      payments: [],
    });
    useStockStore.setState({
      products: INITIAL_PRODUCTS,
      dailyPrepStock: [],
      stockMovements: [],
    });
    useDeliveryStore.setState({
      deliveryOrders: [],
      cart: [],
      activeTrackingOrder: null,
    });
    usePrintStore.setState({ jobs: [] });
    useAuthStore.setState({
      currentProfile: {
        id: 'usr-master',
        name: 'Administrador Master',
        email: 'master@sabordacarne.com.br',
        role: 'MASTER',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    syncStores();
  });

  describe('1. Telas Principais da Aplicação (Sem Turno Aberto)', () => {
    it('1.1 MasterDashboardView (Visão Geral) deve abrir e renderizar sem erros', () => {
      const html = renderWithFeedback(<MasterDashboardView />);
      expect(html).toContain('Visão geral');
      expect(html).toContain('Salão em atendimento');
      expect(html).toContain('Faturamento realizado');
      expect(html).toContain('Faturamento projetado');
      expect(html).toContain('Produção &amp; Impressão');
      expect(html).toContain('O turno formal ainda não foi aberto');
    });

    it('1.2 WaiterModule (Atendimento) deve abrir e renderizar sem erros', () => {
      const html = renderWithFeedback(<WaiterModule />);
      expect(html).toContain('Atendimento');
      expect(html).toContain('O turno está fechado');
      expect(html).toContain('Mesa 01');
    });

    it('1.3 TableGridView (Salão e Mesas) deve abrir e renderizar sem erros', () => {
      const html = renderWithFeedback(<TableGridView />);
      expect(html).toContain('Salão e mesas');
      expect(html).toContain('Mesas livres');
      expect(html).toContain('Consumo em aberto');
    });

    it('1.4 KDSModule (Produção Geral) deve abrir e renderizar sem erros', () => {
      const html = renderWithFeedback(<KDSModule />);
      expect(html).toContain('Painel de produção');
      expect(html).toContain('Churrasqueira');
      expect(html).toContain('Cozinha e cubas');
      expect(html).toContain('Bar e bebidas');
    });

    it('1.5 GrillKDSView (Produção Churrasqueira) deve abrir e renderizar sem erros', () => {
      const html = renderWithFeedback(<GrillKDSView />);
      expect(html).toContain('Churrasqueira');
      expect(html).toContain('Impressora da Brasa Ativa');
      expect(html).toContain('Bloquear Espeto se Acabar na Brasa');
    });

    it('1.6 KitchenKDSView (Produção Cozinha) deve abrir e renderizar sem erros', () => {
      const html = renderWithFeedback(<KitchenKDSView />);
      expect(html).toContain('Cozinha');
      expect(html).toContain('Impressora da Cozinha Ativa');
      expect(html).toContain('Estoque das cubas');
    });

    it('1.7 BarKDSView (Produção Bar) deve abrir e renderizar sem erros', () => {
      const html = renderWithFeedback(<BarKDSView />);
      expect(html).toContain('Bar e bebidas');
    });

    it('1.8 CashierModule (Caixa) deve abrir e renderizar sem erros', () => {
      const html = renderWithFeedback(<CashierModule />);
      expect(html).toContain('Caixa');
      expect(html).toContain('Dinheiro');
      expect(html).toContain('PIX');
    });

    it('1.9 DeliveryManagementView (Gestão Delivery) deve abrir e renderizar sem erros', () => {
      const html = renderWithFeedback(<DeliveryManagementView />);
      expect(html).toContain('Delivery');
      expect(html).toContain('Em produção');
      expect(html).toContain('Em rota de entrega');
    });

    it('1.10 DeliveryCatalogView (Cardápio Digital) deve abrir e renderizar sem erros', () => {
      const html = renderWithFeedback(<DeliveryCatalogView />);
      expect(html).toContain('Sabor da Carne');
      expect(html).toContain('Nosso cardápio');
    });

    it('1.11 ProductCatalogManageView (Cadastro de Produtos) deve abrir e renderizar sem erros', () => {
      const html = renderWithFeedback(<ProductCatalogManageView />);
      expect(html).toContain('Cadastro &amp; Gestão do Cardápio');
      expect(html).toContain('+ Cadastrar Novo Produto');
    });

    it('1.12 DailyStockView (Estoque Diário) deve abrir e renderizar mensagem para abrir turno', () => {
      const html = renderWithFeedback(<DailyStockView onOpenShiftClick={vi.fn()} />);
      expect(html).toContain('Estoque diário');
      expect(html).toContain('Vamos preparar o próximo turno?');
    });

    it('1.13 AuditLogView (Auditoria) deve abrir e renderizar sem erros', () => {
      const html = renderWithFeedback(<AuditLogView />);
      expect(html).toContain('Auditoria');
    });

    it('1.14 SettingsView (Configurações) deve abrir e renderizar sem erros', () => {
      const html = renderWithFeedback(<SettingsView />);
      expect(html).toContain('Configurações');
      expect(html).toContain('Conta PIX');
      expect(html).toContain('Impressoras &amp; Setores');
      expect(html).toContain('Fila Térmica');
      expect(html).toContain('Dados da Espetaria');
    });
  });

  describe('2. Telas Principais da Aplicação (Com Turno Aberto e Dados Ativos)', () => {
    beforeEach(() => {
      // Abre turno com estoque
      const shift = useShiftStore.getState().openShift(
        'Turno Auditoria',
        '',
        100.0,
        [{ productId: INITIAL_PRODUCTS[0]!.id, quantity: 20 }],
        'usr-master'
      );

      // Abre comanda
      const tableId = INITIAL_TABLES[0]!.id;
      const tab = useTableStore.getState().openTab(
        tableId,
        'Cliente Teste',
        2,
        'Sem cebola',
        'usr-master',
        shift.id
      );

      // Adiciona pedido
      useTableStore.getState().addOrderAtomic(
        shift.id,
        tab.id,
        [{ productId: INITIAL_PRODUCTS[0]!.id, quantity: 2 }],
        'usr-master'
      );

      syncStores();
    });

    it('2.1 MasterDashboardView com dados ativos deve listar comanda aberta e faturamento projetado', () => {
      const html = renderWithFeedback(<MasterDashboardView />);
      expect(html).toContain('Turno Auditoria');
      expect(html).toContain('Cliente Teste');
      expect(html).toContain('Mesa 01');
      expect(html).toContain('Em Consumo');
      expect(html).toContain('Feed de movimentações');
    });

    it('2.2 WaiterModule com turno aberto permite atendimento livre', () => {
      const html = renderWithFeedback(<WaiterModule />);
      expect(html).not.toContain('O turno está fechado');
      expect(html).toContain('Mesa 01');
    });

    it('2.3 DailyStockView com turno aberto exibe tabela de mise en place', () => {
      const html = renderWithFeedback(<DailyStockView onOpenShiftClick={vi.fn()} />);
      expect(html).toContain('Estoque diário');
      expect(html).toContain('Espeto de Picanha Grill');
      expect(html).toContain('Restante:');
      expect(html).toContain('Esgotar');
    });
  });

  describe('3. Modais e Gavetas da Aplicação', () => {
    it('3.1 ShiftOpenModal abre e renderiza campos de abertura', () => {
      const html = renderWithFeedback(<ShiftOpenModal isOpen={true} onClose={vi.fn()} />);
      expect(html).toContain('Abrir turno');
      expect(html).toContain('Fundo de Troco');
    });

    it('3.2 ShiftCloseModal abre e renderiza campos de fechamento', () => {
      useShiftStore.setState({
        currentShift: {
          id: 'shift-1',
          name: 'Turno 1',
          date: '2026-09-15',
          status: 'ABERTO',
          opened_by: 'usr-1',
          closed_by: null,
          opened_at: new Date().toISOString(),
          closed_at: null,
          initial_notes: null,
          closing_notes: null,
          cash_drawer_start: 100,
          cash_drawer_end: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      });
      syncStores();
      const html = renderWithFeedback(<ShiftCloseModal isOpen={true} onClose={vi.fn()} />);
      expect(html).toContain('Fechamento do Turno');
    });

    it('3.3 TableSettlementModal abre para liquidação da comanda', () => {
      const table = INITIAL_TABLES[0]!;
      const tab = {
        id: 'tab-1',
        shift_id: 'shift-1',
        table_id: table.id,
        customer_name: 'Roberto',
        people_count: 2,
        status: 'OPEN' as const,
        opened_by: 'usr-1',
        closed_by: null,
        subtotal: 50,
        service_fee: 5,
        discount: 0,
        total: 55,
        notes: null,
        opened_at: new Date().toISOString(),
        closed_at: null,
      };
      useTableStore.setState({ tabs: [tab] });
      syncStores();
      const html = renderWithFeedback(
        <TableSettlementModal
          table={table}
          isOpen={true}
          onClose={vi.fn()}
        />
      );
      expect(html).toContain('Fechamento de Conta');
      expect(html).toContain('Aguardando Quitação Total');
    });

    it('3.4 PixPaymentModal abre e exibe QR Code e Chave PIX', () => {
      const html = renderWithFeedback(
        <PixPaymentModal
          isOpen={true}
          amount={45.0}
          onClose={vi.fn()}
          onPaymentConfirmed={vi.fn()}
        />
      );
      expect(html).toContain('Pagamento por PIX');
      expect(html).toContain('45,00');
    });

    it('3.5 DeliveryCartDrawer abre e exibe opções de entrega e pagamento', () => {
      const html = renderWithFeedback(
        <DeliveryCartDrawer
          isOpen={true}
          onClose={vi.fn()}
          onOrderPlaced={vi.fn()}
        />
      );
      expect(html).toContain('Seu pedido');
    });

    it('3.6 ProductFormModal abre em modo de criação de produto', () => {
      const html = renderWithFeedback(
        <ProductFormModal
          isOpen={true}
          productToEdit={null}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      );
      expect(html).toContain('Cadastrar Novo Produto');
      expect(html).toContain('Nome do Prato / Produto');
    });

    it('3.7 ReceiptModal abre e exibe comprovante formatado', () => {
      const tab = {
        id: 'tab-1',
        shift_id: 'shift-1',
        table_id: INITIAL_TABLES[0]!.id,
        customer_name: 'Roberto',
        people_count: 2,
        status: 'CLOSED' as const,
        opened_by: 'usr-1',
        closed_by: 'usr-1',
        subtotal: 50,
        service_fee: 5,
        discount: 0,
        total: 55,
        notes: null,
        opened_at: new Date().toISOString(),
        closed_at: new Date().toISOString(),
      };
      const html = renderWithFeedback(
        <ReceiptModal
          tab={tab}
          isOpen={true}
          onClose={vi.fn()}
        />
      );
      expect(html).toContain('Conta Encerrada com Sucesso');
      expect(html).toContain('CUPOM NÃO FISCAL');
      expect(html).toContain('ESPETARIA SABOR DA CARNE');
    });
  });
});
