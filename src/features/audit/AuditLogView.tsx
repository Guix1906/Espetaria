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
          color: 'text-emerald-700',
          bg: 'bg-emerald-50 border-emerald-200',
        };
      case 'VENDA':
        return {
          label: 'Venda de Salão/Mesa',
          icon: ArrowDownRight,
          color: 'text-amber-800',
          bg: 'bg-amber-50 border-amber-200',
        };
      case 'CANCELAMENTO_RETORNO':
        return {
          label: 'Cancelamento c/ Retorno',
          icon: RotateCcw,
          color: 'text-sky-700',
          bg: 'bg-sky-50 border-sky-200',
        };
      case 'PERDA':
      case 'DESCARTE':
        return {
          label: 'Perda / Descarte Grelha',
          icon: AlertOctagon,
          color: 'text-red-700',
          bg: 'bg-red-50 border-red-200',
        };
      case 'AJUSTE':
        return {
          label: 'Ajuste de Contagem Física',
          icon: SlidersHorizontal,
          color: 'text-purple-700',
          bg: 'bg-purple-50 border-purple-200',
        };
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-5">
      
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-muted p-5 rounded-2xl border border-line shadow-sm">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-ink tracking-tight flex items-center gap-2 font-sans">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
            <span>Trilha de Auditoria e Movimentações de Estoque</span>
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
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
                className={`filter-chip ${isActive ? 'is-active' : ''}`}
               type="button" aria-pressed={isActive}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Buscar por produto ou motivo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-surface-muted border border-line rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition shadow-sm"
         aria-label="Buscar por produto ou cliente"/>
      </div>

      {/* Lista de Movimentações em Tabela / Cards */}
      <div className="bg-surface-muted border border-line rounded-2xl overflow-hidden shadow-sm">
        {filteredMovements.length === 0 ? (
          <div className="p-8 text-center text-ink-muted text-sm">
            Nenhuma movimentação registrada com os filtros selecionados.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {filteredMovements.map((mov) => {
              const conf = getMovementConfig(mov.movement_type);
              const Icon = conf.icon;
              const isPositive = mov.quantity > 0;

              return (
                <div
                  key={mov.id}
                  className="p-3.5 sm:p-4 hover:bg-surface-muted transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  {/* Informações Principais */}
                  <div className="flex items-start sm:items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${conf.bg} ${conf.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink text-sm">
                          {mov.product_name || 'Produto'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-bold tabular-nums ${conf.bg} ${conf.color}`}>
                          {conf.label}
                        </span>
                      </div>

                      <div className="text-ink-muted mt-0.5">
                        {mov.reason || 'Operação de rotina'}
                      </div>
                    </div>
                  </div>

                  {/* Saldo Anterior, Quantidade e Novo Saldo */}
                  <div className="flex items-center justify-between sm:justify-end gap-5 pl-12 sm:pl-0">
                    <div className="text-left sm:text-right tabular-nums">
                      <div className="text-xs text-ink-muted">
                        Saldo: <span className="text-ink-muted">{mov.previous_balance}</span> ➔ <strong className="text-ink">{mov.new_balance}</strong>
                      </div>
                      <div className="text-xs text-ink-muted flex items-center sm:justify-end gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatDateTime(mov.created_at)}</span>
                      </div>
                    </div>

                    <div className={`px-3 py-1.5 rounded-xl tabular-nums font-bold text-sm border shrink-0 ${
                      isPositive
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-red-50 border-red-200 text-red-700'
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
