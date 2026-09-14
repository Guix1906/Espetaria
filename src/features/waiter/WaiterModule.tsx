import React, { useState } from 'react';
import { 
  Users, 
  Plus, 
  Clock, 
  CheckCircle2, 
  X, 
  Search,
  Flame
} from 'lucide-react';
import { useTableStore } from '../../stores/useTableStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { RestaurantTable, Tab } from '../../types/domain';
import { TableStatus } from '../../types/enums';
import { formatBRL, formatElapsedMinutes, getTableStatusConfig } from '../../lib/formatters';
import { WaiterOrderPad } from './WaiterOrderPad';

export const WaiterModule: React.FC = () => {
  const { tables, tabs, openTab } = useTableStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();

  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [filter, setFilter] = useState<'ALL' | TableStatus>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal para abrir mesa livre
  const [tableToOpen, setTableToOpen] = useState<RestaurantTable | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [peopleCount, setPeopleCount] = useState(2);
  const [openNotes, setOpenNotes] = useState('');

  // Se uma mesa estiver selecionada, renderiza o Bloco de Pedidos da Mesa
  if (selectedTable) {
    return (
      <WaiterOrderPad
        table={selectedTable}
        onBackToTables={() => setSelectedTable(null)}
      />
    );
  }

  const getTableTab = (tableId: string): Tab | undefined => {
    return tabs.find((tab) => tab.table_id === tableId && tab.status === 'OPEN');
  };

  const filteredTables = tables.filter((t) => {
    const matchesFilter = filter === 'ALL' || t.status === filter;
    const tab = getTableTab(t.id);
    const matchesSearch =
      String(t.number).includes(searchTerm) ||
      (tab?.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    return matchesFilter && matchesSearch;
  });

  const handleOpenTabSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableToOpen || !currentShift) return;

    try {
      openTab(
        tableToOpen.id,
        customerName,
        peopleCount,
        openNotes,
        currentProfile.id,
        currentShift.id
      );

      // Automaticamente abre a mesa recém-aberta para já lançar o primeiro pedido!
      const opened = tables.find((t) => t.id === tableToOpen.id);
      setTableToOpen(null);
      setCustomerName('');
      setPeopleCount(2);
      setOpenNotes('');
      if (opened) {
        setSelectedTable(opened);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao abrir comanda.');
    }
  };

  return (
    <div className="p-3 sm:p-5 max-w-4xl mx-auto space-y-4">
      
      {/* Topo do Módulo do Garçom */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 p-4 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Flame className="w-5 h-5 text-rose-500" />
            <span>Salão do Garçom — Atendimento Rápido</span>
          </h2>
          <p className="text-xs text-slate-400">
            Toque na mesa para abrir comanda ou adicionar espetos e bebidas
          </p>
        </div>

        {/* Busca por Mesa ou Cliente */}
        <div className="relative sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Mesa nº ou cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {/* Filtros Rápidos */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {(['ALL', 'LIVRE', 'OCUPADA', 'AGUARDANDO_CONTA'] as const).map((status) => {
          const label = status === 'ALL' ? 'Todas as Mesas' : getTableStatusConfig(status).label;
          const count = status === 'ALL' ? tables.length : tables.filter((t) => t.status === status).length;
          const isActive = filter === status;

          return (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap active:scale-95 ${
                isActive
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-950/50'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Grid de Mesas Mobile-First (Alvos de Toque Grandes de no mínimo 60px) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {filteredTables.map((table) => {
          const tab = getTableTab(table.id);
          const statusConfig = getTableStatusConfig(table.status);

          return (
            <button
              key={table.id}
              onClick={() => {
                if (table.status === 'LIVRE') {
                  setTableToOpen(table);
                } else {
                  setSelectedTable(table);
                }
              }}
              className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between min-h-[140px] active:scale-[0.97] ${
                table.status === 'LIVRE'
                  ? 'bg-slate-900/80 border-slate-800 hover:border-emerald-700/60'
                  : table.status === 'OCUPADA'
                  ? 'bg-slate-900 border-amber-800/80 shadow-lg shadow-amber-950/20'
                  : 'bg-slate-900 border-rose-800/80 shadow-lg shadow-rose-950/20'
              }`}
            >
              {/* Topo do Card */}
              <div className="flex items-start justify-between w-full">
                <span className="font-mono font-black text-2xl text-white">
                  Mesa {String(table.number).padStart(2, '0')}
                </span>
                <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full border ${statusConfig.badgeBg}`}>
                  {statusConfig.label}
                </span>
              </div>

              {/* Informações Centrais */}
              {tab ? (
                <div className="my-1.5 space-y-0.5 w-full">
                  <div className="font-bold text-xs text-white truncate">
                    {tab.customer_name || 'Sem nome'}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {formatElapsedMinutes(tab.opened_at)}
                    </span>
                    <span className="font-mono font-black text-amber-400 text-sm">
                      {formatBRL(tab.total)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="my-auto py-2 text-slate-500 text-xs flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Toque para abrir</span>
                </div>
              )}

              {/* Rodapé do Card */}
              <div className="w-full pt-1 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {table.capacity}p
                </span>
                {table.status !== 'LIVRE' && (
                  <span className="font-bold text-rose-400 flex items-center gap-0.5">
                    Lançar ➔
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Modal de Abertura de Mesa */}
      {tableToOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                <span>Abrir Comanda — Mesa {tableToOpen.number}</span>
              </h3>
              <button
                onClick={() => setTableToOpen(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOpenTabSubmit} className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Nome do Cliente (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Família Silva / Roberto"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Quantidade de Pessoas na Mesa
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={peopleCount}
                  onChange={(e) => setPeopleCount(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Observação da Mesa (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Comemorando aniversário..."
                  value={openNotes}
                  onChange={(e) => setOpenNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-emerald-950/60"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Abrir e Ir para o Bloco de Pedidos</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
