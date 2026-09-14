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
    <div className="p-3 sm:p-5 max-w-5xl mx-auto space-y-4">
      
      {/* Topo do Módulo do Garçom */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#14151f] p-4 rounded-3xl border border-white/10 shadow-xl">
        <div>
          <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2 font-brand">
            <Flame className="w-5 h-5 text-orange-500" />
            <span>Salão do Garçom — Atendimento Ágil</span>
          </h2>
          <p className="text-xs text-stone-400 mt-0.5">
            Toque na mesa livre para abrir comanda ou na mesa ocupada para lançar pedidos
          </p>
        </div>

        {/* Busca por Mesa ou Cliente */}
        <div className="relative sm:w-64">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Mesa nº ou cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#090a0f] border border-white/10 rounded-2xl pl-10 pr-3 py-2 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-orange-500 transition"
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
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap active:scale-95 ${
                isActive
                  ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/25'
                  : 'bg-[#14151f] border border-white/10 text-stone-400 hover:text-white'
              }`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Grid de Mesas Mobile-First */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
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
              className={`p-4 rounded-3xl border text-left transition flex flex-col justify-between min-h-[148px] active:scale-[0.97] shadow-lg ${
                table.status === 'LIVRE'
                  ? 'bg-[#12131a] border-white/10 hover:border-emerald-500/40 hover:bg-[#151620]'
                  : table.status === 'OCUPADA'
                  ? 'bg-[#14151f] border-amber-500/40 shadow-amber-950/20'
                  : 'bg-[#16141a] border-rose-500/50 shadow-rose-950/30'
              }`}
            >
              {/* Topo do Card */}
              <div className="flex items-start justify-between w-full">
                <span className="font-mono font-black text-2xl text-white">
                  Mesa {String(table.number).padStart(2, '0')}
                </span>
                <span className={`text-[9px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full border ${statusConfig.badgeBg}`}>
                  {statusConfig.label}
                </span>
              </div>

              {/* Informações Centrais */}
              {tab ? (
                <div className="my-2 space-y-1 w-full border-y border-white/5 py-1.5">
                  <div className="font-bold text-xs text-white truncate">
                    {tab.customer_name || 'Comanda Sem Nome'}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-stone-400">
                    <span className="flex items-center gap-1 font-mono text-amber-300 font-semibold">
                      <Clock className="w-3 h-3 text-amber-400" />
                      {formatElapsedMinutes(tab.opened_at)}
                    </span>
                    <span className="font-mono font-black text-amber-400 text-sm">
                      {formatBRL(tab.total)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="my-auto py-2 text-stone-400 text-xs flex items-center gap-1.5 font-medium">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <span>Toque para abrir</span>
                </div>
              )}

              {/* Rodapé do Card */}
              <div className="w-full pt-1.5 border-t border-white/10 flex items-center justify-between text-[11px] text-stone-400">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-stone-500" />
                  <span>{table.capacity} lugares</span>
                </span>
                {table.status !== 'LIVRE' && (
                  <span className="font-bold text-orange-400 flex items-center gap-0.5 text-xs">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#14151f] border border-white/15 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                <span>Abrir Comanda — Mesa {tableToOpen.number}</span>
              </h3>
              <button
                onClick={() => setTableToOpen(null)}
                className="p-1 rounded-xl text-stone-400 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOpenTabSubmit} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-stone-300 font-bold mb-1.5">
                  Nome do Cliente (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Roberto / Família Silva"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-[#090a0f] border border-white/10 rounded-2xl px-3.5 py-2.5 text-white placeholder-stone-500 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-bold mb-1.5">
                  Quantidade de Pessoas na Mesa
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={peopleCount}
                  onChange={(e) => setPeopleCount(Number(e.target.value))}
                  className="w-full bg-[#090a0f] border border-white/10 rounded-2xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500 font-mono transition"
                />
              </div>

              <div>
                <label className="block text-stone-300 font-bold mb-1.5">
                  Observação da Mesa (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Comemorando aniversário..."
                  value={openNotes}
                  onChange={(e) => setOpenNotes(e.target.value)}
                  className="w-full bg-[#090a0f] border border-white/10 rounded-2xl px-3.5 py-2.5 text-white placeholder-stone-500 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl btn-emerald flex items-center justify-center gap-2 active:scale-95 transition text-sm"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Abrir Comanda e Iniciar Pedido</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
