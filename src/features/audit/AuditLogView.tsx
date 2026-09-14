import React, { useState } from 'react';
import { 
  ArrowDownRight, 
  ArrowUpRight, 
  RotateCcw, 
  AlertOctagon, 
  SlidersHorizontal,
  Clock,
  ShieldCheck,
  Search
} from 'lucide-react';
import { useStockStore } from '../../stores/useStockStore';
import { StockMovementType } from '../../types/enums';
import { formatDateTime } from '../../lib/formatters';

export const AuditLogView: React.FC = () => {
  const { stockMovements } = useStockStore();

  const [typeFilter, setTypeFilter] = useState<'ALL' | StockMovementType>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMovements = stockMovements.filter((m) => {
    const matchesType = typeFilter === 'ALL' || m.movement_type === typeFilter;
    const matchesSearch = 
      (m.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
      (m.reason?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    return matchesType && matchesSearch;
  });

  const getMovementConfig = (type: StockMovementType) => {
    switch (type) {
      case 'PRODUCAO':
        return {
          label: 'Produção (Mise en Place)',
          icon: ArrowUpRight,
          color: 'text-emerald-400',
          bg: 'bg-emerald-500/10 border-emerald-500/30',
        };
      case 'VENDA':
        return {
          label: 'Venda de Salão/Mesa',
          icon: ArrowDownRight,
          color: 'text-gold-400',
          bg: 'bg-gold-500/10 border-gold-500/30',
        };
      case 'CANCELAMENTO_RETORNO':
        return {
          label: 'Cancelamento c/ Retorno',
          icon: RotateCcw,
          color: 'text-cyan-400',
          bg: 'bg-cyan-500/10 border-cyan-500/30',
        };
      case 'PERDA':
      case 'DESCARTE':
        return {
          label: 'Perda / Descarte Grelha',
          icon: AlertOctagon,
          color: 'text-ruby-400',
          bg: 'bg-ruby-500/10 border-ruby-500/30',
        };
      case 'AJUSTE':
        return {
          label: 'Ajuste de Contagem Física',
          icon: SlidersHorizontal,
          color: 'text-purple-400',
          bg: 'bg-purple-500/10 border-purple-500/30',
        };
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-5">
      
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 card-carbon p-5 rounded-2xl border border-carbon-800/80 shadow-lg">
        <div>
          <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>Trilha de Auditoria e Movimentações de Estoque</span>
          </h2>
          <p className="text-xs text-obsidian-400 mt-0.5">
            Registro imutável de todas as baixas, devoluções, perdas e ajustes em tempo real
          </p>
        </div>

        {/* Filtro por Tipo de Movimentação */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(['ALL', 'PRODUCAO', 'VENDA', 'CANCELAMENTO_RETORNO', 'PERDA', 'AJUSTE'] as const).map((t) => {
            const label = 
              t === 'ALL' ? 'Todas' :
              t === 'PRODUCAO' ? 'Produção' :
              t === 'VENDA' ? 'Vendas' :
              t === 'CANCELAMENTO_RETORNO' ? 'Retornos' :
              t === 'PERDA' ? 'Perdas' : 'Ajustes';
            const isActive = typeFilter === t;

            return (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap active:scale-95 ${
                  isActive
                    ? 'bg-ember-500 text-white shadow-md shadow-ember-950/60'
                    : 'btn-carbon text-obsidian-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="w-4 h-4 text-obsidian-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Buscar por produto ou motivo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-carbon-900 border border-carbon-800 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-white placeholder-obsidian-500 focus:outline-none focus:border-ember-500 transition shadow-inner"
        />
      </div>

      {/* Lista de Movimentações em Tabela / Cards */}
      <div className="card-carbon border border-carbon-800/80 rounded-2xl overflow-hidden shadow-xl">
        {filteredMovements.length === 0 ? (
          <div className="p-8 text-center text-obsidian-500 text-sm">
            Nenhuma movimentação registrada com os filtros selecionados.
          </div>
        ) : (
          <div className="divide-y divide-carbon-800/70">
            {filteredMovements.map((mov) => {
              const conf = getMovementConfig(mov.movement_type);
              const Icon = conf.icon;
              const isPositive = mov.quantity > 0;

              return (
                <div
                  key={mov.id}
                  className="p-3.5 sm:p-4 hover:bg-carbon-800/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  {/* Informações Principais */}
                  <div className="flex items-start sm:items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${conf.bg} ${conf.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">
                          {mov.product_name || 'Produto'}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold font-mono ${conf.bg} ${conf.color}`}>
                          {conf.label}
                        </span>
                      </div>

                      <div className="text-obsidian-400 mt-0.5">
                        {mov.reason || 'Operação de rotina'}
                      </div>
                    </div>
                  </div>

                  {/* Saldo Anterior, Quantidade e Novo Saldo */}
                  <div className="flex items-center justify-between sm:justify-end gap-5 pl-12 sm:pl-0">
                    <div className="text-left sm:text-right font-mono">
                      <div className="text-[11px] text-obsidian-400">
                        Saldo: <span className="text-obsidian-300">{mov.previous_balance}</span> ➔ <strong className="text-white">{mov.new_balance}</strong>
                      </div>
                      <div className="text-[10px] text-obsidian-500 flex items-center sm:justify-end gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatDateTime(mov.created_at)}</span>
                      </div>
                    </div>

                    <div className={`px-3 py-1.5 rounded-xl font-mono font-black text-sm border shrink-0 ${
                      isPositive
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-ruby-500/10 border-ruby-500/30 text-ruby-400'
                    }`}>
                      {isPositive ? `+${mov.quantity}` : mov.quantity}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
