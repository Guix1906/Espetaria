import { StatusTag } from '../../components/ui/StatusTag';
import { groupItemsByTab } from './tableItems';
import type { StatusKind } from '../../lib/statusStyles';
import { ArrowRight, Info, LayoutGrid, Plus, Search, Settings2, BellRing, Store, X } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { TableSettlementModal } from '../cashier/TableSettlementModal';
import { TableTransferModal } from './TableTransferModal';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { usePrintStore } from '../../stores/usePrintStore';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { TableDrawer } from './TableDrawer';
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
import type { OrderItem, RestaurantTable, Tab } from '../../types/domain';
import { isLocalTable, localTabPhone, tableShortLabel, tabCustomerName } from '../../lib/localTables';
import { SectionTabs } from '../../components/ui/SectionTabs';
import type { TableStatus } from '../../types/enums';
import { WaiterOpenTabSheet } from './WaiterOpenTabSheet';
import { WaiterOrderPad } from './WaiterOrderPad';

interface WaiterModuleProps {
  onOpenShiftClick?: () => void;
  dedicated?: boolean;
  /** Conteúdo da aba "Ajustes" na área do garçom (som, sair...). */
  settings?: ReactNode;
}

type Section = 'tables' | 'local' | 'ready' | 'settings';
type TableFilter = 'occupied' | 'free' | 'all';
type SalonFilter = 'ACTIVE' | 'ALL' | 'READY' | TableStatus;
const pad2 = (n: number) => String(n).padStart(2, '0');

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
  // Salão no computador: aba Mesas ou aba Consumo local
  const [salonView, setSalonView] = useState<'tables' | 'local'>('tables');
  const [tableToOpen, setTableToOpen] = useState<RestaurantTable | null>(null);
  const [tableForBill, setTableForBill] = useState<RestaurantTable | null>(null);
  // Gaveta lateral da mesa (Salão no computador): um toque no cartão abre a comanda
  const [drawerTableId, setDrawerTableId] = useState<string | null>(null);
  const closeDrawer = useCallback(() => setDrawerTableId(null), []);
  const [tableToTransfer, setTableToTransfer] = useState<{ table: RestaurantTable; tab: Tab } | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { notify } = useFeedback();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(id); }, []);

  const isShiftOpen = currentShift?.status === 'ABERTO';
  const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
  const selectedTable = tables.find((table) => table.id === selectedTableId);
  const drawerTable = tables.find((table) => table.id === drawerTableId);
  // Índices montados uma vez por mudança de dados (antes, cada mesa varria todos os pedidos a cada toque)
  const allTables = useMemo(() => tables.filter((table) => table.active).sort((a, b) => a.number - b.number), [tables]);
  // Salão = mesas de verdade; as "mesas" internas do consumo local (nº 900+) ficam só na aba própria
  const activeTables = useMemo(() => allTables.filter((table) => !isLocalTable(table)), [allTables]);
  const openTabByTable = useMemo(() => {
    const map = new Map<string, Tab>();
    for (const tab of tabs) {
      if (tab.status === 'OPEN' && tab.table_id) {
        map.set(tab.table_id, tab);
        const tbl = tables.find((t) => t.id === tab.table_id || `table-${t.number}` === tab.table_id);
        if (tbl) {
          map.set(tbl.id, tab);
          map.set(`table-${tbl.number}`, tab);
        }
      }
    }
    return map;
  }, [tabs, tables]);

  const getTableTab = (tableId: string) => {
    const direct = openTabByTable.get(tableId);
    if (direct) return direct;
    const table = tables.find((t) => t.id === tableId);
    if (table) {
      return openTabByTable.get(`table-${table.number}`) || tabs.find((t) => t.status === 'OPEN' && (t.table_id === table.id || t.table_id === `table-${table.number}`));
    }
    return undefined;
  };

  const isTableOccupied = (table: RestaurantTable) => {
    if (table.status === 'OCUPADA' || table.status === 'AGUARDANDO_CONTA') return true;
    const tab = getTableTab(table.id);
    return tab !== undefined && tab.status === 'OPEN';
  };

  const itemsByTab = useMemo(() => groupItemsByTab(orders, orderItems), [orders, orderItems]);
  const itemsOfTable = (tableId: string): OrderItem[] => {
    const tab = getTableTab(tableId);
    return (tab && itemsByTab.get(tab.id)) ?? [];
  };
  const readyItemsOf = (tableId: string) => itemsOfTable(tableId).filter((item) => isFreshReady(item, now));
  const readyTables = allTables.filter((table) => readyItemsOf(table.id).length > 0);
  const readyTableIds = new Set(readyTables.map((table) => table.id));
  // Consumo local em aberto: quem pediu primeiro fica em cima
  const localTabs = allTables
    .filter((table) => isLocalTable(table) && isTableOccupied(table))
    .map((table) => ({ table, tab: getTableTab(table.id) }))
    .sort((a, b) => (a.tab?.opened_at ?? '').localeCompare(b.tab?.opened_at ?? ''));
  const nameOf = (table: RestaurantTable) => tableShortLabel(table, getTableTab(table.id)?.customer_name);

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
    const digits = query.replace(/\D/g, '');
    return (!isLocalTable(table) && String(table.number).padStart(2, '0').includes(query))
      || (tab?.customer_name?.toLocaleLowerCase('pt-BR').includes(query) ?? false)
      || (isLocalTable(table) && digits.length >= 4 && (tab?.notes ?? '').includes(digits));
  };
  const localMatches = localTabs.filter(({ table }) => matches(table));

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
    const occupiedTables = activeTables.filter(isTableOccupied);
    const freeTables = activeTables.filter((t) => t.status === 'LIVRE');
    const effectiveFilter: SalonFilter = filter;

    const filteredTables = activeTables.filter((table) => {
      if (!matches(table)) return false;
      if (query) return true;
      if (effectiveFilter === 'ACTIVE') return isTableOccupied(table);
      if (effectiveFilter === 'ALL') return true;
      if (effectiveFilter === 'READY') return readyTableIds.has(table.id);
      return table.status === effectiveFilter;
    });

    const filterOptions: { key: SalonFilter; label: string; count: number }[] = [
      { key: 'ACTIVE', label: 'Em atendimento', count: occupiedTables.length },
      { key: 'ALL', label: 'Todas as mesas', count: activeTables.length },
    ];

    const handlePrintTable = async (table: RestaurantTable) => {
      const ok = await usePrintStore.getState().printBill(table.id);
      notify(
        ok ? `Pré-conta de ${nameOf(table)} impressa com sucesso.` : 'Não foi possível imprimir a conta.',
        ok ? 'success' : 'error'
      );
    };

    return (
      <div className="page-layout">
        <PageHeader
          eyebrow="Salão"
          title="Salão"
          description={
            occupiedTables.length > 0
              ? `${occupiedTables.length} ${occupiedTables.length === 1 ? 'mesa em atendimento' : 'mesas em atendimento'} · ${formatBRL(tabs.filter((tab) => tab.status === 'OPEN').reduce((sum, tab) => sum + tab.total, 0))} em aberto`
              : 'Nenhuma mesa em atendimento no momento.'
          }
          icon={LayoutGrid}
          actions={
            // Só o "+" (pedido do dono, 22/11); "Área do garçom" fica no menu do perfil
            <button
              type="button"
              disabled={!isShiftOpen}
              onClick={() => setIsPickerOpen(true)}
              className="btn-primary h-11 w-11 shrink-0 p-0"
              title="Abrir mesa"
              aria-label="Abrir mesa"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
          }
        />
        {shiftNotice}
        <SectionTabs
          label="Seções do salão"
          value={salonView}
          onChange={setSalonView}
          items={[
            { id: 'tables', label: 'Mesas', icon: LayoutGrid, count: occupiedTables.length },
            { id: 'local', label: 'Consumo local', icon: Store, count: localTabs.length },
          ]}
        />
        {salonView === 'local' ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-muted">Pedidos do cardápio digital para comer aqui. Toque no cliente para ver o pedido, acrescentar itens ou cobrar.</p>
              <div className="w-full sm:w-64 sm:shrink-0">
                <SearchField value={searchTerm} onChange={setSearchTerm} label="Buscar cliente" placeholder="Nome ou WhatsApp" className="w-full" />
              </div>
            </div>
            {localMatches.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {localMatches.map(({ table, tab }) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    tab={tab}
                    itemCount={itemsOfTable(table.id).filter((i) => i.status !== 'CANCELLED').length}
                    readyCount={readyItemsOf(table.id).length}
                    now={now}
                    disabled={!isShiftOpen}
                    onOpen={() => setDrawerTableId(table.id)}
                    onOrder={() => setDrawerTableId(table.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title={query ? 'Nenhum cliente encontrado' : 'Nenhum pedido de consumo local agora'}
                description={query ? 'Tente outro nome ou o final do WhatsApp.' : 'Quem pedir pelo cardápio digital escolhendo "Consumir no local" aparece aqui, com o nome e o WhatsApp.'}
              />
            )}
          </div>
        ) : (<>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="filter-bar" aria-label="Filtrar mesas">
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

          <div className="w-full sm:w-64">
            <SearchField
              value={searchTerm}
              onChange={setSearchTerm}
              label="Buscar mesa ou cliente"
              placeholder="Nº da mesa ou cliente"
              className="w-full"
            />
          </div>
        </div>

        {filteredTables.length ? (
          <div className="space-y-5">
            {/* Em atendimento: cartões com tudo à vista (conta pedida e item pronto primeiro) */}
            {filteredTables.some((t) => t.status !== 'LIVRE') && (
              <section aria-label="Mesas em atendimento" className="space-y-2">
                {effectiveFilter === 'ALL' && <h2 className="section-title">Em atendimento</h2>}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {filteredTables
                    .filter((t) => t.status !== 'LIVRE')
                    .sort((a, b) => Number(b.status === 'AGUARDANDO_CONTA') - Number(a.status === 'AGUARDANDO_CONTA') || Number(readyTableIds.has(b.id)) - Number(readyTableIds.has(a.id)) || a.number - b.number)
                    .map((table) => (
                      <TableCard
                        key={table.id}
                        table={table}
                        tab={getTableTab(table.id)}
                        itemCount={itemsOfTable(table.id).filter((i) => i.status !== 'CANCELLED').length}
                        readyCount={readyItemsOf(table.id).length}
                        now={now}
                        disabled={!isShiftOpen}
                        onOpen={() => askOpen(table)}
                        onOrder={() => setDrawerTableId(table.id)}
                      />
                    ))}
                </div>
              </section>
            )}
            {/* Livres: grade compacta, tipo mapa (cabem todas na tela) */}
            {filteredTables.some((t) => t.status === 'LIVRE') && (
              <section aria-label="Mesas livres" className="space-y-2">
                <h2 className="section-title">Livres <span className="font-mono text-sm font-normal text-ink-muted">{filteredTables.filter((t) => t.status === 'LIVRE').length}</span></h2>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2">
                  {filteredTables.filter((t) => t.status === 'LIVRE').map((table) => (
                    <TableCard key={table.id} table={table} disabled={!isShiftOpen} onOpen={() => askOpen(table)} onOrder={() => setSelectedTableId(table.id)} />
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card space-y-3 max-w-md mx-auto my-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-surface-muted text-ink-muted">
              <LayoutGrid className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink">
                {effectiveFilter === 'ACTIVE'
                  ? 'Nenhuma mesa em atendimento'
                  : 'Nenhuma mesa encontrada'}
              </h3>
              <p className="mt-1 text-xs text-ink-muted">
                {effectiveFilter === 'ACTIVE'
                  ? 'As mesas ativadas com pedidos aparecerão aqui.'
                  : 'Tente outro número de mesa ou nome de cliente.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                disabled={!isShiftOpen}
                onClick={() => setIsPickerOpen(true)}
                className="btn-primary min-h-[44px] px-4 text-sm font-bold inline-flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                <span>Abrir mesa</span>
              </button>
              {effectiveFilter === 'ACTIVE' && (
                <button
                  type="button"
                  onClick={() => setFilter('ALL')}
                  className="btn-secondary min-h-[44px] px-3 text-sm font-semibold"
                >
                  Ver todas as {activeTables.length} mesas
                </button>
              )}
            </div>
            {freeTables[0] && <p className="text-xs text-ink-muted pt-1">{activeTables.length} mesas cadastradas. Próxima livre: <strong>Mesa {String(Math.min(...freeTables.map((t) => t.number))).padStart(2, '0')}</strong>.</p>}
          </div>
        )}
        </>)}

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
        {drawerTable && (
          <TableDrawer
            key={drawerTable.id}
            table={drawerTable}
            tab={getTableTab(drawerTable.id)}
            items={itemsOfTable(drawerTable.id)}
            readyCount={readyItemsOf(drawerTable.id).length}
            now={now}
            onClose={closeDrawer}
            onOrder={() => setSelectedTableId(drawerTable.id)}
            onPrint={() => void handlePrintTable(drawerTable)}
            onTransfer={() => {
              const tab = getTableTab(drawerTable.id);
              if (tab) setTableToTransfer({ table: drawerTable, tab });
            }}
          />
        )}
        {tableForBill &&<TableSettlementModal table={tableForBill} isOpen onClose={() => setTableForBill(null)} />}
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
  const occupied = activeTables.filter(isTableOccupied);
  const free = activeTables.filter((table) => !isTableOccupied(table));
  // Sempre abre em Todas (pedido do dono, 03/11)
  const tableFilter: TableFilter = chosenFilter ?? 'all';
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
  const tabName = (table: RestaurantTable, tab: Tab | undefined) => tabCustomerName(table, tab?.customer_name) ?? 'Sem nome';

  // Consumo local no celular: lista pelo nome do cliente, tocar abre a comanda para acrescentar
  const localSection = (
    <div className="space-y-3.5">
      <div>
        <h1 className="text-xl font-semibold text-ink">Consumo local</h1>
        <p className="mt-0.5 text-base text-ink-muted">Pedidos do cardápio digital para comer aqui. Toque para acrescentar itens.</p>
      </div>
      <label className="relative block">
        <span className="sr-only">Buscar cliente</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
        <input type="search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Nome ou WhatsApp"
          className="h-11 w-full rounded-md border border-line bg-surface pl-10 pr-3 text-base placeholder:text-ink-muted" />
      </label>
      {shiftNotice}
      {localMatches.length ? (
        <ul className="space-y-2" aria-label="Clientes de consumo local">
          {localMatches.map(({ table, tab }) => {
            const chip = statusChip(table);
            const phone = localTabPhone(tab?.notes);
            return (
              <li key={table.id}>
                <button type="button" onClick={() => setSelectedTableId(table.id)} className="flex min-h-[72px] w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 text-left active:bg-surface-muted"
                  aria-label={`${tabName(table, tab)}, consumo local, ${chip.label}. Acrescentar itens`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px] font-semibold text-ink">{tabName(table, tab)}</span>
                    <span className="block truncate text-base text-ink-muted">{[phone, tab ? `pediu há ${formatElapsedMinutes(tab.opened_at, now)}` : null].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-mono text-base font-bold text-ink">{formatBRL(tab?.total)}</span>
                    <StatusTag kind={chip.kind} className="font-semibold">{chip.label}</StatusTag>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title={query ? 'Nenhum cliente encontrado' : 'Nenhum pedido agora'} description={query ? 'Tente outro nome ou o final do WhatsApp.' : 'Quem pedir pelo cardápio digital escolhendo "Consumir no local" aparece aqui.'} />
      )}
    </div>
  );

  const readyBanner = readyTables.length > 0 && (
    <button type="button" onClick={() => setSection('ready')} className="flex min-h-[64px] w-full items-center justify-between gap-3 rounded-2xl bg-sucesso px-3.5 py-3 text-left text-white">
      <span className="min-w-0">
        <span className="block text-[17px] font-semibold">{readyCount} {readyCount === 1 ? 'item pronto' : 'itens prontos'}</span>
        <span className="block truncate text-base text-white/90">{readyTables.map(nameOf).join(' · ')} — levar agora</span>
      </span>
      <ArrowRight className="h-6 w-6 shrink-0" aria-hidden="true" />
    </button>
  );

  const tablesSection = (
    <div className="space-y-3.5">
      {readyBanner}
      <div className="grid grid-cols-3 gap-1 rounded-md bg-surface-muted p-1" role="tablist" aria-label="Filtrar mesas">
        {([['occupied', 'Ocupadas', occupied.length], ['free', 'Livres', free.length], ['all', 'Todas', activeTables.length]] as const).map(([key, label, count]) => (
          <button key={key} type="button" role="tab" aria-selected={tableFilter === key} aria-controls="tables-panel" onClick={() => setTableFilter(key)}
            className={`flex h-11 items-center justify-center gap-1.5 rounded-md text-[17px] font-semibold ${tableFilter === key ? 'bg-surface text-brand-800 shadow-sm ring-1 ring-brand-600' : 'text-ink-secondary'}`}>
            {label}<span className={`font-mono text-base ${tableFilter === key ? 'text-brand-700' : 'text-ink-muted'}`}>{count}</span>
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
      {/* "Todas": uma grade só, em ordem; ocupada = cor cheia, livre = contorno claro */}
      {tableFilter === 'all' && (showOccupied.length + showFree.length) > 0 && (
        <section aria-label="Todas as mesas" className="space-y-2.5">
          <p className="grid grid-cols-2 gap-x-3 gap-y-1 text-[15px] text-ink-secondary">
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-sm bg-ink" />Ocupada</span>
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-sm bg-brand-500" />Conta pedida</span>
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-sm bg-emerald-600" />Item pronto</span>
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-sm border border-line-strong bg-surface" />Livre</span>
          </p>
          <div className="grid grid-cols-3 gap-2 xs:grid-cols-4">
            {[...showOccupied, ...showFree].sort((a, b) => a.number - b.number).map((table) => {
              if (!isTableOccupied(table)) {
                return (
                  <button key={table.id} type="button" disabled={!isShiftOpen} onClick={() => askOpen(table)}
                    className={`flex h-[64px] items-center justify-center rounded-md border bg-surface font-mono text-2xl font-semibold disabled:opacity-50 ${table.status === 'RESERVADA' ? 'border-dashed border-line-strong text-ink-secondary' : 'border-line-strong text-ink-muted'}`}
                    aria-label={`Mesa ${pad2(table.number)} livre${table.status === 'RESERVADA' ? ' (reservada)' : ''}. Abrir comanda`}>
                    {pad2(table.number)}
                  </button>
                );
              }
              const chip = statusChip(table);
              // Ocupada = cheia escura (o garçom procura essas); "conta pedida" terracota e "pronto" verde chamam mais atenção
              const fill = 'short' in chip ? 'bg-emerald-600 text-white' : chip.kind === 'bill' ? 'bg-brand-500 text-white' : 'bg-ink text-white';
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
                  <span className="w-11 shrink-0 font-mono text-[24px] font-bold text-ink">{pad2(table.number)}</span>
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
                {isLocalTable(table) ? <>
                  <span className="text-xl font-bold text-ink">{tabName(table, tab)}</span>
                  <span className="ml-2 truncate text-base text-ink-muted">Consumo local</span>
                </> : <>
                  <span className="font-mono text-xl font-bold text-ink">Mesa {pad2(table.number)}</span>
                  <span className="ml-2 truncate text-base text-ink-muted">{tabName(table, tab)}</span>
                </>}
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
    { key: 'local', label: 'Local', icon: Store, badge: localTabs.length },
    { key: 'ready', label: 'Prontos', icon: BellRing, badge: readyCount },
    { key: 'settings', label: 'Ajustes', icon: Settings2 },
  ];

  return (
    <div className="px-4 pb-28 pt-3">
      {section === 'tables' && tablesSection}
      {section === 'local' && localSection}
      {section === 'ready' && readySection}
      {section === 'settings' && <div className="space-y-3"><h1 className="text-xl font-semibold text-ink">Ajustes</h1>{settings}</div>}
      <nav aria-label="Área do garçom" className="vv-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto grid max-w-5xl grid-cols-4">
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
