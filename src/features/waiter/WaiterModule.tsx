import { CheckCircle2, Info, Smartphone, Users, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { FilterChip } from '../../components/ui/FilterChip';
import { PageHeader } from '../../components/ui/PageHeader';
import { SearchField } from '../../components/ui/SearchField';
import { TableCard } from '../../components/ui/TableCard';
import { getTableStatusConfig } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useTableStore } from '../../stores/useTableStore';
import type { RestaurantTable } from '../../types/domain';
import type { TableStatus } from '../../types/enums';
import { WaiterOrderPad } from './WaiterOrderPad';

export function WaiterModule() {
  const { tables, tabs, openTab } = useTableStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [filter, setFilter] = useState<'ALL' | TableStatus>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [tableToOpen, setTableToOpen] = useState<RestaurantTable | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [peopleCount, setPeopleCount] = useState(2);
  const [openNotes, setOpenNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isShiftOpen = currentShift?.status === 'ABERTO';
  const query = searchTerm.trim().toLocaleLowerCase('pt-BR');

  if (selectedTable) return <WaiterOrderPad table={selectedTable} onBackToTables={() => setSelectedTable(null)} />;

  const getTableTab = (tableId: string) => tabs.find((tab) => tab.table_id === tableId && tab.status === 'OPEN');
  const filteredTables = tables.filter((table) => {
    const tab = getTableTab(table.id);
    return (filter === 'ALL' || table.status === filter) && (String(table.number).padStart(2, '0').includes(query) || (tab?.customer_name?.toLocaleLowerCase('pt-BR').includes(query) ?? false));
  });

  const handleOpenTabSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!tableToOpen || !currentShift || !isShiftOpen) { setErrorMessage('Abra um turno antes de iniciar o atendimento.'); return; }
    try {
      openTab(tableToOpen.id, customerName, peopleCount, openNotes, currentProfile.id, currentShift.id);
      setSelectedTable(useTableStore.getState().tables.find((table) => table.id === tableToOpen.id) || tableToOpen);
      setTableToOpen(null);
      setCustomerName('');
      setPeopleCount(2);
      setOpenNotes('');
      setErrorMessage(null);
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível abrir a comanda.');
    }
  };

  return (
    <div className="page-layout">
      <PageHeader eyebrow="Atendimento" title="Bom atendimento começa aqui." description="Escolha uma mesa para abrir uma comanda ou continuar um pedido." icon={Smartphone} actions={<span className="status-badge border-brand-200 bg-brand-50 text-brand-800"><Users className="h-4 w-4" aria-hidden="true" />{tables.filter((table) => table.status === 'LIVRE').length} mesas livres</span>} />
      {!isShiftOpen && <div className="notice border-amber-200 bg-amber-50 text-amber-900" role="status"><Info className="mt-0.5 h-5 w-5 shrink-0" /><span>O turno está fechado. Use <strong>Abrir turno</strong> no topo para começar o atendimento.</span></div>}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="filter-bar" aria-label="Filtrar mesas por situação">
          {(['ALL', 'LIVRE', 'OCUPADA', 'AGUARDANDO_CONTA', 'RESERVADA'] as const).map((status) => <FilterChip key={status} active={filter === status} onClick={() => setFilter(status)} count={status === 'ALL' ? tables.length : tables.filter((table) => table.status === status).length}>{status === 'ALL' ? 'Todas' : getTableStatusConfig(status).label}</FilterChip>)}
        </div>
        <SearchField value={searchTerm} onChange={setSearchTerm} label="Buscar mesa ou cliente" placeholder="Número da mesa ou cliente" className="w-full shrink-0 xl:w-64" />
      </div>
      {filteredTables.length ? <div className="table-grid">{filteredTables.map((table) => <TableCard key={table.id} table={table} tab={getTableTab(table.id)} disabled={!isShiftOpen} onOpen={() => { setErrorMessage(null); setTableToOpen(table); }} onOrder={() => setSelectedTable(table)} />)}</div> : <EmptyState title="Nenhuma mesa encontrada" description="Tente outro número, nome de cliente ou situação da mesa." action={<button type="button" className="btn-secondary" onClick={() => { setFilter('ALL'); setSearchTerm(''); }}>Limpar filtros</button>} />}

      {tableToOpen && <Dialog label={`Abrir comanda da mesa ${tableToOpen.number}`} onClose={() => setTableToOpen(null)} placement="sheet">
        <div className="dialog-panel w-full max-w-md space-y-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3 border-b border-line pb-4"><div><p className="eyebrow">Novo atendimento</p><h2 className="text-xl font-bold">Mesa {String(tableToOpen.number).padStart(2, '0')}</h2><p className="mt-1 text-sm text-ink-muted">Abra a comanda e comece o pedido.</p></div><button type="button" onClick={() => setTableToOpen(null)} className="icon-button" aria-label="Fechar abertura da comanda"><X className="h-5 w-5" /></button></div>
          {errorMessage && <div role="alert" className="notice border-rose-200 bg-rose-50 text-rose-800">{errorMessage}</div>}
          <form onSubmit={handleOpenTabSubmit} className="space-y-4">
            <div><label htmlFor="waiter-customer" className="mb-1.5 block text-sm font-medium">Nome do cliente <span className="font-normal text-ink-muted">(opcional)</span></label><input id="waiter-customer" type="text" placeholder="Ex.: Roberto ou Família Silva" value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="w-full rounded-xl border border-line-strong px-3.5 py-2.5" /></div>
            <div><label htmlFor="waiter-people" className="mb-1.5 block text-sm font-medium">Quantidade de pessoas</label><input id="waiter-people" type="number" min="1" max="30" required value={peopleCount} onChange={(event) => setPeopleCount(Number(event.target.value))} className="w-full rounded-xl border border-line-strong px-3.5 py-2.5 tabular-nums" /></div>
            <div><label htmlFor="waiter-notes" className="mb-1.5 block text-sm font-medium">Observação <span className="font-normal text-ink-muted">(opcional)</span></label><input id="waiter-notes" type="text" placeholder="Ex.: Comemorando aniversário" value={openNotes} onChange={(event) => setOpenNotes(event.target.value)} className="w-full rounded-xl border border-line-strong px-3.5 py-2.5" /></div>
            <button type="submit" className="btn-primary w-full py-3"><CheckCircle2 className="h-5 w-5" aria-hidden="true" />Abrir comanda e iniciar pedido</button>
          </form>
        </div>
      </Dialog>}
    </div>
  );
}
