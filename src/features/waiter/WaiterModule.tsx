import { StatusTag } from '../../components/ui/StatusTag';
import type { StatusKind } from '../../lib/statusStyles';
import { ArrowRight, CheckCheck, Info, LayoutGrid, Plus, Receipt, Search, Settings2, ShoppingBag, Smartphone, Users, BellRing, X, Sparkles } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { StatCard } from '../../components/ui/StatCard';
import { TableSettlementModal } from '../cashier/TableSettlementModal';
import { TableTransferModal } from './TableTransferModal';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { usePrintStore } from '../../stores/usePrintStore';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { FilterChip } from '../../components/ui/FilterChip';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchField } from '../../components/ui/SearchField';
import { TableCard } from '../../components/ui/TableCard';
import { formatBRL, formatDoneness, formatElapsedMinutes } from '../../lib/formatters';
import { isFreshReady, isPendingProduction } from '../../lib/productionStatus';
import { ALERT_LIMITS } from '../admin/dashboardMetrics';
import { KDSElapsedTimer } from '../kds/KDSElapsedTimer';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useTableStore } from '../../stores/useTableStore';
import { useNavFocusStore } from '../../stores/useNavFocusStore';
import type { Order, OrderItem, RestaurantTable, Tab } from '../../types/domain';
import type { TableStatus } from '../../types/enums';
import { WaiterOpenTabSheet } from './WaiterOpenTabSheet';
import { WaiterOrderPad } from './WaiterOrderPad';

interface WaiterModuleProps {
  onOpenShiftClick?: () => void;
  dedicated?: boolean;
  /** Conteúdo da aba "Ajustes" na área do garçom (som, sair...). */
  settings?: ReactNode;
}

type Section = 'tables' | 'ready' | 'settings';
type TableFilter = 'occupied' | 'free' | 'all';
type SalonFilter = 'ACTIVE' | 'ALL' | 'READY' | TableStatus;
const pad2 = (n: number) => String(n).padStart(2, '0');
const isOccupied = (table: RestaurantTable) => table.status === 'OCUPADA' || table.status === 'AGUARDANDO_CONTA';

export function WaiterModule({ onOpenShiftClick, dedicated = false, settings }: WaiterModuleProps = {}) {
  const { tables, tabs, openTab, orders, orderItems } = useTableStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();
  // Vindo da Visão geral com uma mesa escolhida ou restaurando sessão após atualização
  const [selectedTableId, setSelectedTableIdState] = useState<string | null>(() => {
    const focusId = useNavFocusStore.getState().tableId;
    if (focusId) return focusId;
    try {
      const saved = sessionStorage.getItem('ponto_selected_table_id');
      if (saved && useTableStore.getState().tables.some((t) => t.id === saved)) {
        return saved;
      }
    } catch {}
    return null;
  });

  const setSelectedTableId = (id: string | null) => {
    setSelectedTableIdState(id);
    try {
      if (id) {
        sessionStorage.setItem('ponto_selected_table_id', id);
        if (!window.history.state?.tableSelected) {
          window.history.pushState({ tableSelected: id }, '');
        }
      } else {
        sessionStorage.removeItem('ponto_selected_table_id');
        if (window.history.state?.tableSelected) {
          window.history.back();
        }
      }
    } catch {}
  };

  // Suporte ao botão Voltar do celular (Android gestos / navegador)
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (!e.state?.tableSelected && selectedTableId) {
        setSelectedTableIdState(null);
        try { sessionStorage.removeItem('ponto_selected_table_id'); } catch {}
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [selectedTableId]);

  // Se outro componente (ex: Visão Geral) focar uma mesa ou aba com o WaiterModule já montado
  useEffect(() => {
    return useNavFocusStore.subscribe((state) => {
      if (state.tableId) {
        setSelectedTableIdState(state.tableId);
        try { sessionStorage.setItem('ponto_selected_table_id', state.tableId); } catch {}
        useNavFocusStore.getState().clear();
      }
      if (state.readySection) {
        setSection('ready');
        setFilter('READY');
        useNavFocusStore.getState().clear();
      }
    });
  }, []);

  useEffect(() => { useNavFocusStore.getState().clear(); }, []);
  const [filter, setFilter] = useState<SalonFilter>(() => (useNavFocusStore.getState().readySection ? 'READY' : 'ACTIVE'));
  const [chosenFilter, setTableFilter] = useState<TableFilter | null>(null);
  const [section, setSection] = useState<Section>(() => (useNavFocusStore.getState().readySection ? 'ready' : 'tables'));
  const [searchTerm, setSearchTerm] = useState('');
  const [tableToOpen, setTableToOpen] = useState<RestaurantTable | null>(null);
  const [tableForBill, setTableForBill] = useState<RestaurantTable | null>(null);
  const [tableToTransfer, setTableToTransfer] = useState<{ table: RestaurantTable; tab: Tab } | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { notify } = useFeedback();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(id); }, []);

  const isShiftOpen = currentShift?.status === 'ABERTO';
  const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
  const selectedTable = tables.find((table) => table.id === selectedTableId);
  // Índices montados uma vez por mudança de dados (antes, cada mesa varria todos os pedidos a cada toque)
  const activeTables = useMemo(() => tables.filter((table) => table.active).sort((a, b) => a.number - b.number), [tables]);
  const openTabByTable = useMemo(() => new Map(tabs.filter((tab) => tab.status === 'OPEN' && tab.table_id).map((tab) => [tab.table_id!, tab])), [tabs]);
  const itemsByTable = useMemo(() => {
    const tableOfOrder = new Map<string, string>();
    const tableOfTab = new Map([...openTabByTable].map(([tableId, tab]) => [tab.id, tableId]));
    orders.forEach((order) => { const tableId = tableOfTab.get(order.tab_id); if (tableId) tableOfOrder.set(order.id, tableId); });
    const map = new Map<string, OrderItem[]>();
    orderItems.forEach((item) => { const tableId = tableOfOrder.get(item.order_id); if (tableId) map.set(tableId, [...(map.get(tableId) ?? []), item]); });
    return map;
  }, [openTabByTable, orders, orderItems]);
  const getTableTab = (tableId: string) => openTabByTable.get(tableId);
  const itemsOfTable = (tableId: string): OrderItem[] => itemsByTable.get(tableId) ?? [];
  const readyItemsOf = (tableId: string) => itemsOfTable(tableId).filter((item) => isFreshReady(item, now));
  const readyTables = activeTables.filter((table) => readyItemsOf(table.id).length > 0);
  const readyTableIds = new Set(readyTables.map((table) => table.id));

  if (selectedTable) {
    return (
      <WaiterOrderPad
        table={selectedTable}
        dedicated={dedicated}
        onBackToTables={() => setSelectedTableId(null)}
        onTableTransferred={(newTable) => setSelectedTableId(newTable.id)}
      />
    );
  }

  const matches = (table: RestaurantTable) => {
    if (!query) return true;
    const tab = getTableTab(table.id);
    return String(table.number).padStart(2, '0').includes(query) || (tab?.customer_name?.toLocaleLowerCase('pt-BR').includes(query) ?? false);
  };

  const handleOpenTab = ({ people, name, notes }: { people: number; name: string; notes: string }) => {
    if (!tableToOpen || !currentShift || !isShiftOpen) { setErrorMessage('Solicite a abertura do turno antes de iniciar o atendimento.'); return; }
    if (!Number.isInteger(people) || people < 1 || people > 30) { setErrorMessage('Informe de 1 a 30 pessoas.'); return; }
    try {
      openTab(tableToOpen.id, name, people, notes, currentProfile.id, currentShift.id);
      setSelectedTableId(tableToOpen.id);
      setTableToOpen(null);
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível abrir a comanda.');
    }
  };
  const askOpen = (table: RestaurantTable) => { if (!isShiftOpen) return; setErrorMessage(null); setTableToOpen(table); };
  const openSheet = tableToOpen && <WaiterOpenTabSheet key={tableToOpen.id} table={tableToOpen} error={errorMessage} onClose={() => setTableToOpen(null)} onSubmit={handleOpenTab} />;
  const shiftNotice = !isShiftOpen && <div className="notice flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 text-amber-900" role="status"><div className="flex items-center gap-2"><Info className="h-5 w-5 shrink-0" /><span>O turno está fechado. {dedicated ? 'Solicite a abertura ao gerente.' : 'Abra um turno para iniciar novos atendimentos.'}</span></div>{!dedicated && onOpenShiftClick && <button type="button" onClick={onOpenShiftClick} className="btn-primary">Abrir turno</button>}</div>;

  // ---------------- Painel administrativo (tela larga) ----------------
  if (!dedicated) {
    const occupiedTables = activeTables.filter(isOccupied);
    const freeTables = activeTables.filter((t) => t.status === 'LIVRE');
    const effectiveFilter: SalonFilter = filter;

    const filteredTables = activeTables.filter((table) => {
      if (!matches(table)) return false;
      if (query) return true;
      if (effectiveFilter === 'ACTIVE') return isOccupied(table);
      if (effectiveFilter === 'ALL') return true;
      if (effectiveFilter === 'READY') return readyTableIds.has(table.id);
      return table.status === effectiveFilter;
    });

    const filterOptions: { key: SalonFilter; label: string; count: number }[] = [
      { key: 'ACTIVE', label: 'Ativas', count: occupiedTables.length },
      { key: 'AGUARDANDO_CONTA', label: 'Conta pedida', count: activeTables.filter((t) => t.status === 'AGUARDANDO_CONTA').length },
      { key: 'READY', label: 'Para servir', count: readyTables.length },
      { key: 'LIVRE', label: 'Livres', count: freeTables.length },
      { key: 'ALL', label: 'Todas as 60', count: activeTables.length },
    ];

    const handlePrintTable = async (table: RestaurantTable) => {
      const ok = await usePrintStore.getState().printBill(table.id);
      notify(
        ok ? `Pré-conta da Mesa ${table.number} impressa com sucesso.` : 'Não foi possível imprimir a conta.',
        ok ? 'success' : 'error'
      );
    };

    const handleLoadDemoTables = () => {
      let shift = useShiftStore.getState().currentShift;
      if (!shift || shift.status !== 'ABERTO') {
        try {
          shift = useShiftStore.getState().openShift(
            'Turno Principal',
            'Turno de demonstração das mesas',
            200,
            [],
            currentProfile.id
          );
        } catch {}
      }

      const shiftId = shift?.id || 'shift-demo';
      const userId = currentProfile.id;

      const demoData = [
        { num: 27, status: 'OCUPADA' as const, people: 1, items: 3, total: 95 },
        { num: 34, status: 'OCUPADA' as const, people: 2, items: 1, total: 85 },
        { num: 41, status: 'OCUPADA' as const, people: 2, items: 1, total: 70 },
        { num: 47, status: 'OCUPADA' as const, people: 1, items: 4, total: 231 },
        { num: 48, status: 'OCUPADA' as const, people: 1, items: 1, total: 40 },
        { num: 50, status: 'AGUARDANDO_CONTA' as const, people: 1, items: 1, total: 67 },
        { num: 52, status: 'OCUPADA' as const, people: 1, items: 1, total: 94 },
        { num: 53, status: 'OCUPADA' as const, people: 1, items: 1, total: 65 },
        { num: 54, status: 'AGUARDANDO_CONTA' as const, people: 1, items: 1, total: 75 },
        { num: 56, status: 'OCUPADA' as const, people: 1, items: 2, total: 92 },
      ];

      const nowIso = new Date().toISOString();
      const demoNumSet = new Set(demoData.map((d) => d.num));

      const newTables = useTableStore.getState().tables.map((t) => {
        const demo = demoData.find((d) => d.num === t.number);
        if (demo) {
          return { ...t, status: demo.status, updated_at: nowIso };
        }
        return t;
      });

      const newTabs: Tab[] = demoData.map((d) => ({
        id: `tab-demo-${d.num}`,
        shift_id: shiftId,
        table_id: `table-${d.num}`,
        customer_name: `Mesa ${String(d.num).padStart(2, '0')}`,
        people_count: d.people,
        status: 'OPEN',
        opened_by: userId,
        closed_by: null,
        subtotal: d.total,
        service_fee: 0,
        service_fee_enabled: false,
        discount: 0,
        total: d.total,
        notes: null,
        opened_at: nowIso,
        closed_at: null,
        updated_at: nowIso,
        updated_by: userId,
        version: 1,
      }));

      const newOrders: Order[] = demoData.map((d) => ({
        id: `order-demo-${d.num}`,
        shift_id: shiftId,
        tab_id: `tab-demo-${d.num}`,
        table_id: `table-${d.num}`,
        order_number: d.num,
        status: 'OPEN',
        notes: null,
        idempotency_key: null,
        created_by: userId,
        created_at: nowIso,
        updated_at: nowIso,
        updated_by: userId,
        version: 1,
      }));

      const newOrderItems: OrderItem[] = [];
      demoData.forEach((d) => {
        for (let i = 1; i <= d.items; i++) {
          newOrderItems.push({
            id: `item-demo-${d.num}-${i}`,
            order_id: `order-demo-${d.num}`,
            shift_id: shiftId,
            product_id: 'prod-picanha',
            product_name: i === 1 ? 'Espeto Especial' : `Item ${i}`,
            unit_price: d.total / d.items,
            quantity: 1,
            doneness: null,
            notes: null,
            sector: 'GRILL',
            status: 'DELIVERED',
            created_at: nowIso,
            prepared_at: nowIso,
            delivered_at: nowIso,
            updated_at: nowIso,
            updated_by: userId,
            version: 1,
          });
        }
      });

      useTableStore.setState((state) => ({
        tables: newTables,
        tabs: [
          ...state.tabs.filter((t) => !demoNumSet.has(parseInt(t.table_id?.replace('table-', '') || '0', 10))),
          ...newTabs,
        ],
        orders: [
          ...state.orders.filter((o) => !demoNumSet.has(parseInt(o.table_id?.replace('table-', '') || '0', 10))),
          ...newOrders,
        ],
        orderItems: [
          ...state.orderItems.filter((i) => !i.id.startsWith('item-demo-')),
          ...newOrderItems,
        ],
      }));

      setFilter('ACTIVE');
      setSearchTerm('');
      notify('10 mesas da foto carregadas no Mapa de Mesas!', 'success');
    };

    return (
      <div className="page-layout">
        <PageHeader
          eyebrow="Salão"
          title="Salão — Mapa de mesas e comandas"
          description={
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#f87152]" />
                <span>Ocupada ({occupiedTables.length})</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span>Fechando conta ({activeTables.filter((t) => t.status === 'AGUARDANDO_CONTA').length})</span>
              </span>
              <span className="text-ink-muted">· {formatBRL(tabs.filter((tab) => tab.status === 'OPEN').reduce((sum, tab) => sum + tab.total, 0))} em aberto</span>
            </div>
          }
          icon={Smartphone}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadDemoTables}
                className="btn-secondary min-h-[44px] text-xs font-semibold flex items-center gap-1.5"
                title="Carregar as 10 mesas de exemplo da foto"
              >
                <Sparkles className="h-4 w-4 text-brand-600" />
                <span>Mesas da foto</span>
              </button>
              <a className="btn-secondary min-h-[44px]" href="#/garcom">
                <Smartphone className="h-4 w-4" />
                <span>Área do garçom no celular</span>
              </a>
            </div>
          }
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Mesas livres" value={freeTables.length} hint="Disponíveis para novos clientes" icon={CheckCheck} tone="success" />
          <StatCard label="Em atendimento" value={activeTables.filter((table) => table.status === 'OCUPADA').length} hint="Comandas em andamento" icon={Users} />
          <StatCard label="Conta pedida" value={activeTables.filter((table) => table.status === 'AGUARDANDO_CONTA').length} hint="Prontas para o fechamento" icon={Receipt} tone="brand" />
          <StatCard label="Consumo em aberto" value={formatBRL(tabs.filter((tab) => tab.status === 'OPEN').reduce((sum, tab) => sum + tab.total, 0))} hint="Total das comandas abertas" icon={ShoppingBag} />
        </div>
        {shiftNotice}
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="filter-bar" aria-label="Filtrar mesas por situação">
            {filterOptions.map((opt) => (
              <FilterChip
                key={opt.key}
                active={effectiveFilter === opt.key}
                onClick={() => setFilter(opt.key)}
                count={opt.count}
              >
                {opt.label}
              </FilterChip>
            ))}
          </div>

          <div className="flex items-center gap-2.5 w-full xl:w-auto">
            <button
              type="button"
              disabled={!isShiftOpen}
              onClick={() => setIsPickerOpen(true)}
              className="btn-primary min-h-[44px] shrink-0 text-sm flex items-center justify-center gap-1.5 px-3.5"
              title="Abrir uma nova mesa livre"
            >
              <Plus className="h-4 w-4" />
              <span>Abrir mesa</span>
            </button>
            <SearchField
              value={searchTerm}
              onChange={setSearchTerm}
              label="Buscar mesa ou cliente"
              placeholder="Nº da mesa ou cliente"
              className="w-full shrink-0 xl:w-64"
            />
          </div>
        </div>

        {filteredTables.length ? (
          <div className="table-grid">
            {filteredTables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                tab={getTableTab(table.id)}
                itemCount={itemsOfTable(table.id).filter((i) => i.status !== 'CANCELLED').length}
                disabled={!isShiftOpen}
                onOpen={() => askOpen(table)}
                onOrder={() => setSelectedTableId(table.id)}
                onBill={() => setTableForBill(table)}
                onPrint={() => void handlePrintTable(table)}
                onTransfer={() => {
                  const tab = getTableTab(table.id);
                  if (tab) setTableToTransfer({ table, tab });
                }}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card space-y-4 max-w-2xl mx-auto my-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-800">
              <LayoutGrid className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink">
                {effectiveFilter === 'ACTIVE'
                  ? 'Nenhuma mesa com comanda aberta no momento'
                  : 'Nenhuma mesa encontrada'}
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                {effectiveFilter === 'ACTIVE'
                  ? 'O mapa de mesas e comandas exibe as mesas com atendimento ativo (ocupadas ou fechando conta). Você pode abrir uma mesa agora ou carregar as 10 mesas de exemplo da foto para testar a tela.'
                  : 'Tente outro número, nome de cliente ou situação da mesa.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {effectiveFilter === 'ACTIVE' ? (
                <>
                  <button
                    type="button"
                    onClick={handleLoadDemoTables}
                    className="btn-primary min-h-[44px] px-5 text-sm font-bold flex items-center gap-2 shadow-sm"
                  >
                    <Sparkles className="h-4 w-4" />
                    Carregar 10 mesas da foto
                  </button>
                  <button
                    type="button"
                    disabled={!isShiftOpen}
                    onClick={() => setIsPickerOpen(true)}
                    className="btn-secondary min-h-[44px] px-4 text-sm font-semibold flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Abrir comanda (Mesa 01 a 60)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilter('ALL')}
                    className="btn-secondary min-h-[44px] px-4 text-sm font-semibold"
                  >
                    Ver todas as 60 mesas
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setFilter('ACTIVE');
                    setSearchTerm('');
                  }}
                >
                  Ver mesas ativas
                </button>
              )}
            </div>
            <p className="text-xs text-ink-muted pt-1">
              60 mesas cadastradas no salão. Próxima disponível: <strong>Mesa 01</strong>.
            </p>
          </div>
        )}

        {isPickerOpen && (
          <Dialog label="Selecionar mesa para abrir" onClose={() => setIsPickerOpen(false)}>
            <div className="dialog-panel bg-surface border border-line rounded-2xl w-full max-w-xl p-5 shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div>
                  <h3 className="font-bold text-ink text-lg leading-none">Abrir nova mesa</h3>
                  <p className="text-xs text-ink-muted mt-1">
                    Toque no número da mesa disponível ({freeTables.length} livres) para iniciar a comanda
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPickerOpen(false)}
                  className="p-2 text-ink-muted hover:text-ink rounded-lg transition"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-4 xs:grid-cols-6 sm:grid-cols-8 gap-2 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                {freeTables.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setIsPickerOpen(false);
                      askOpen(t);
                    }}
                    className="h-12 rounded-xl border border-line bg-surface hover:border-brand-500 hover:bg-brand-50 hover:text-brand-900 font-mono text-base font-bold text-ink flex items-center justify-center transition active:scale-95"
                    aria-label={`Mesa ${String(t.number).padStart(2, '0')}`}
                  >
                    {String(t.number).padStart(2, '0')}
                  </button>
                ))}
              </div>
              {freeTables.length === 0 && (
                <p className="py-6 text-center text-sm text-ink-muted">Todas as mesas estão ocupadas no momento.</p>
              )}
            </div>
          </Dialog>
        )}

        {openSheet}
        {tableForBill && <TableSettlementModal table={tableForBill} isOpen onClose={() => setTableForBill(null)} />}
        {tableToTransfer && (
          <TableTransferModal
            isOpen={true}
            sourceTable={tableToTransfer.table}
            currentTab={tableToTransfer.tab}
            onClose={() => setTableToTransfer(null)}
            onSuccess={(newTable) => {
              setTableToTransfer(null);
              setSelectedTableId(newTable.id);
            }}
          />
        )}
      </div>
    );
  }

  // ---------------- Área do garçom (celular) ----------------
  const occupied = activeTables.filter(isOccupied);
  const free = activeTables.filter((table) => !isOccupied(table));
  // Sem mesa ocupada, começa mostrando todas (não abre numa lista vazia)
  const tableFilter: TableFilter = chosenFilter ?? (occupied.length ? 'occupied' : 'all');
  const readyCount = readyTables.reduce((sum, table) => sum + readyItemsOf(table.id).length, 0);
  const showOccupied = tableFilter !== 'free' ? occupied.filter(matches) : [];
  const showFree = tableFilter !== 'occupied' ? free.filter(matches) : [];

  const statusChip = (table: RestaurantTable) => {
    const items = itemsOfTable(table.id).filter((item) => item.status !== 'CANCELLED');
    if (readyTableIds.has(table.id)) {
      // Há quanto tempo o item pronto mais antigo espera; passou de 5 min vira alerta
      const since = readyItemsOf(table.id).reduce((m, item) => Math.max(m, Math.floor((now - new Date(item.prepared_at ?? item.updated_at).getTime()) / 60000)), 0);
      return { label: since >= 1 ? `Pronto há ${since} min` : 'Pronto agora', kind: (since >= ALERT_LIMITS.readyNotServed ? 'alert' : 'ready') as StatusKind, short: 'Pronto' };
    }
    if (table.status === 'AGUARDANDO_CONTA') return { label: 'Conta pedida', kind: 'bill' as StatusKind };
    const onGrill = items.filter(isPendingProduction);
    if (onGrill.length) return { label: 'Na brasa', kind: 'preparing' as StatusKind, since: onGrill.reduce((m, i) => (i.created_at < m ? i.created_at : m), onGrill[0]!.created_at) };
    if (!items.length) return { label: 'Sem pedido', kind: 'occupied' as StatusKind };
    return { label: 'Servido', kind: 'occupied' as StatusKind };
  };
  const tabSubtitle = (tab: Tab | undefined) => [tab?.people_count ? `${tab.people_count} ${tab.people_count === 1 ? 'pessoa' : 'pessoas'}` : null, tab ? formatElapsedMinutes(tab.opened_at, now) : null].filter(Boolean).join(' · ');
  const tabName = (table: RestaurantTable, tab: Tab | undefined) => (tab?.customer_name && tab.customer_name !== `Mesa ${table.number}` ? tab.customer_name : 'Sem nome');

  const readyBanner = readyTables.length > 0 && (
    <button type="button" onClick={() => setSection('ready')} className="flex min-h-[64px] w-full items-center justify-between gap-3 rounded-2xl bg-sucesso px-3.5 py-3 text-left text-white">
      <span className="min-w-0">
        <span className="block text-[17px] font-semibold">{readyCount} {readyCount === 1 ? 'item pronto' : 'itens prontos'}</span>
        <span className="block truncate text-base text-white/90">{readyTables.map((table) => `Mesa ${pad2(table.number)}`).join(' · ')} — levar agora</span>
      </span>
      <ArrowRight className="h-6 w-6 shrink-0" aria-hidden="true" />
    </button>
  );

  const tablesSection = (
    <div className="space-y-3.5">
      {readyBanner}
      <div className="grid grid-cols-3 gap-1 rounded-md bg-line p-1" role="tablist" aria-label="Filtrar mesas">
        {([['occupied', 'Ocupadas', occupied.length], ['free', 'Livres', free.length], ['all', 'Todas', activeTables.length]] as const).map(([key, label, count]) => (
          <button key={key} type="button" role="tab" aria-selected={tableFilter === key} aria-controls="tables-panel" onClick={() => setTableFilter(key)}
            className={`flex h-10 items-center justify-center gap-1.5 rounded-md text-[17px] font-semibold ${tableFilter === key ? 'bg-ink text-white' : 'text-ink'}`}>
            {label}<span className={`font-mono text-base ${tableFilter === key ? 'text-white/80' : 'text-ink-muted'}`}>{count}</span>
          </button>
        ))}
      </div>
      <label className="relative block">
        <span className="sr-only">Buscar mesa ou cliente</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
        <input type="search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Nº da mesa ou cliente" aria-describedby="tables-search-hint"
          className="h-11 w-full rounded-md border border-line bg-surface pl-10 pr-3 text-base placeholder:text-ink-muted" />
        <span id="tables-search-hint" className="sr-only">{showOccupied.length + showFree.length} mesas encontradas</span>
      </label>
      {shiftNotice}
      {/* "Todas": uma grade só, em ordem; ocupada = cor cheia, livre = contorno verde */}
      {tableFilter === 'all' && (showOccupied.length + showFree.length) > 0 && (
        <section aria-label="Todas as mesas" className="space-y-2.5">
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-ink-secondary">
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3.5 w-3.5 rounded-sm border border-line-strong bg-surface-muted" />Ocupada</span>
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3.5 w-3.5 rounded-sm bg-brand-500" />Conta pedida</span>
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3.5 w-3.5 rounded-sm bg-emerald-600" />Item pronto</span>
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3.5 w-3.5 rounded-sm border-2 border-emerald-600" />Livre</span>
          </p>
          <div className="grid grid-cols-3 gap-2 xs:grid-cols-4">
            {[...showOccupied, ...showFree].sort((a, b) => a.number - b.number).map((table) => {
              if (!isOccupied(table)) {
                return (
                  <button key={table.id} type="button" disabled={!isShiftOpen} onClick={() => askOpen(table)}
                    className={`flex h-[64px] items-center justify-center rounded-md border-2 bg-surface font-mono text-2xl font-bold disabled:opacity-50 ${table.status === 'RESERVADA' ? 'border-dashed border-line-strong text-ink-secondary' : 'border-emerald-600 text-emerald-800'}`}
                    aria-label={`Mesa ${pad2(table.number)} livre${table.status === 'RESERVADA' ? ' (reservada)' : ''}. Abrir comanda`}>
                    {pad2(table.number)}
                  </button>
                );
              }
              const chip = statusChip(table);
              // Ocupada fica neutra; só "conta pedida" (terracota) e "pronto" (verde) chamam atenção
              const fill = 'short' in chip ? 'bg-emerald-600 text-white' : chip.kind === 'bill' ? 'bg-brand-500 text-white' : 'border border-line-strong bg-surface-muted text-ink';
              return (
                <button key={table.id} type="button" onClick={() => setSelectedTableId(table.id)}
                  className={`flex h-[64px] flex-col items-center justify-center rounded-md active:brightness-95 ${fill}`}
                  aria-label={`Mesa ${pad2(table.number)} ocupada, ${chip.label}. Lançar itens`}>
                  <span className="font-mono text-2xl font-bold leading-none">{pad2(table.number)}</span>
                  <span className="mt-1 text-base font-semibold leading-none">{'short' in chip ? chip.short : chip.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {tableFilter !== 'all' && showOccupied.length > 0 && (
        <ul className="space-y-2" aria-label="Mesas ocupadas">
          {showOccupied.map((table) => {
            const tab = getTableTab(table.id);
            const chip = statusChip(table);
            // A cor fica só na etiqueta de situação
            return (
              <li key={table.id}>
                <button type="button" onClick={() => setSelectedTableId(table.id)} className="flex min-h-[72px] w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 text-left active:bg-surface-muted"
                  aria-label={`Mesa ${pad2(table.number)}, ${tabName(table, tab)}, ${chip.label}. Lançar itens`}>
                  <span className="w-11 shrink-0 font-mono text-[26px] font-bold text-ink">{pad2(table.number)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-ink">{tabName(table, tab)}</span>
                    <span className="block truncate text-base text-ink-muted">{tabSubtitle(tab)}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-mono text-base font-bold text-ink">{formatBRL(tab?.total)}</span>
                    <StatusTag kind={chip.kind} className="font-semibold">{chip.label}{'since' in chip && chip.since && <> · <KDSElapsedTimer compact createdAt={chip.since} /></>}</StatusTag>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {tableFilter !== 'all' && showFree.length > 0 && (
        <section aria-label="Mesas livres">
          <h2 className="mb-2 text-base font-semibold text-ink-secondary">Livres <span className="font-normal text-ink-muted">· toque para abrir</span></h2>
          <div className="grid grid-cols-3 xs:grid-cols-4 gap-2">
            {showFree.map((table) => (
              <button key={table.id} type="button" disabled={!isShiftOpen} onClick={() => askOpen(table)}
                className={`flex h-[50px] items-center justify-center rounded-md border bg-surface font-mono text-xl font-bold disabled:opacity-50 ${table.status === 'RESERVADA' ? 'border-dashed border-line-strong text-ink-secondary' : 'border-emerald-600 text-emerald-800'}`}
                aria-label={`Mesa ${pad2(table.number)}${table.status === 'RESERVADA' ? ' (reservada)' : ''}. Abrir comanda`}>
                {pad2(table.number)}
              </button>
            ))}
          </div>
        </section>
      )}
      {!showOccupied.length && !showFree.length && (
        <EmptyState title="Nenhuma mesa encontrada" description={query ? 'Tente outro número ou nome de cliente.' : tableFilter === 'occupied' ? 'Nenhuma mesa ocupada agora.' : 'Nenhuma mesa livre agora.'}
          action={<button type="button" className="btn-secondary" onClick={() => { setTableFilter('all'); setSearchTerm(''); }}>Ver todas</button>} />
      )}
    </div>
  );

  const readySection = (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold text-ink">Prontos para servir</h1>
      {readyTables.length === 0 ? <EmptyState title="Nada pronto agora" description="Quando a churrasqueira, a cozinha ou o bar terminarem um item, ele aparece aqui." /> : readyTables.map((table) => {
        const items = readyItemsOf(table.id);
        const tab = getTableTab(table.id);
        return (
          <section key={table.id} className="rounded-2xl border border-line bg-surface p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <button type="button" onClick={() => setSelectedTableId(table.id)} className="min-h-[44px] min-w-0 text-left">
                <span className="font-mono text-xl font-bold text-ink">Mesa {pad2(table.number)}</span>
                <span className="ml-2 truncate text-base text-ink-muted">{tabName(table, tab)}</span>
              </button>
            </div>
            <ul className="divide-y divide-line">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-semibold text-ink">{item.quantity}x {item.product_name}</span>
                    {(item.doneness || item.notes) && <span className="block text-base text-ink-muted">{[item.doneness ? formatDoneness(item.doneness) : null, item.notes].filter(Boolean).join(' · ')}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );

  const navItems: { key: Section; label: string; icon: typeof LayoutGrid; badge?: number }[] = [
    { key: 'tables', label: 'Mesas', icon: LayoutGrid },
    { key: 'ready', label: 'Prontos', icon: BellRing, badge: readyCount },
    { key: 'settings', label: 'Ajustes', icon: Settings2 },
  ];

  return (
    <div className="px-4 pb-28 pt-3">
      {section === 'tables' && tablesSection}
      {section === 'ready' && readySection}
      {section === 'settings' && <div className="space-y-3"><h1 className="text-xl font-semibold text-ink">Ajustes</h1>{settings}</div>}
      <nav aria-label="Área do garçom" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto grid max-w-5xl grid-cols-3">
          {navItems.map(({ key, label, icon: Icon, badge }) => (
            <button key={key} type="button" onClick={() => { setSection(key); window.scrollTo({ top: 0 }); }} aria-current={section === key ? 'page' : undefined}
              className={`flex h-[62px] flex-col items-center justify-center gap-1 text-base ${section === key ? 'font-semibold text-brand-500' : 'text-ink-secondary'}`}>
              <span className="relative">
                <Icon className="h-6 w-6" aria-hidden="true" />
                {!!badge && <span className="absolute -right-3 -top-2 min-w-[20px] rounded bg-sucesso px-1 text-center font-mono text-base font-bold leading-5 text-white">{badge}</span>}
              </span>
              {label}{!!badge && <span className="sr-only">: {badge}</span>}
            </button>
          ))}
        </div>
      </nav>
      {openSheet}
    </div>
  );
}
