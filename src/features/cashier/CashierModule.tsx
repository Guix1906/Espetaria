import React, { useState } from 'react';
import { 
  Receipt, 
  CreditCard, 
  Banknote, 
  QrCode, 
  Users, 
  Sparkles, 
  AlertTriangle, 
  RotateCcw,
  CheckCircle2
} from 'lucide-react';
import { useTableStore } from '../../stores/useTableStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { RestaurantTable, Tab } from '../../types/domain';
import { formatBRL } from '../../lib/formatters';
import { TableSettlementModal } from './TableSettlementModal';
import { ReceiptModal } from './ReceiptModal';

type CashierFilter = 'WAITING_BILL' | 'ALL_ACTIVE' | 'CLOSED_TODAY';

export const CashierModule: React.FC = () => {
  const { tables, tabs, payments, getTabOrderItems, reopenTabAtomic } = useTableStore();
  const { currentShift } = useShiftStore();
  const { currentProfile } = useAuthStore();

  const [filter, setFilter] = useState<CashierFilter>('WAITING_BILL');
  const [selectedTableForCheckout, setSelectedTableForCheckout] = useState<RestaurantTable | null>(null);
  const [selectedClosedTabForReceipt, setSelectedClosedTabForReceipt] = useState<Tab | null>(null);

  // Pagamentos do turno atual
  const shiftPayments = currentShift
    ? payments.filter((p) => p.shift_id === currentShift.id && p.status === 'PAID')
    : [];

  const totalShiftRevenue = shiftPayments.reduce((sum, p) => sum + p.amount, 0);

  const revenueByMethod = {
    DINHEIRO: shiftPayments.filter((p) => p.method === 'DINHEIRO').reduce((s, p) => s + p.amount, 0),
    PIX: shiftPayments.filter((p) => p.method === 'PIX').reduce((s, p) => s + p.amount, 0),
    DEBITO: shiftPayments.filter((p) => p.method === 'DEBITO').reduce((s, p) => s + p.amount, 0),
    CREDITO: shiftPayments.filter((p) => p.method === 'CREDITO').reduce((s, p) => s + p.amount, 0),
  };

  // Mesas e comandas
  const waitingBillTables = tables.filter((t) => t.status === 'AGUARDANDO_CONTA');
  const activeTables = tables.filter((t) => t.status === 'OCUPADA' || t.status === 'AGUARDANDO_CONTA');
  const closedTabs = currentShift
    ? tabs.filter((t) => t.shift_id === currentShift.id && t.status === 'CLOSED')
    : [];

  // Se não houver mesas aguardando conta ao abrir, exibe todas as ativas
  const effectiveFilter = filter === 'WAITING_BILL' && waitingBillTables.length === 0 ? 'ALL_ACTIVE' : filter;

  const handleReopen = (tab: Tab) => {
    if (!['MASTER', 'GERENTE', 'CAIXA'].includes(currentProfile.role)) {
      alert('Apenas Gerente ou Caixa podem reabrir comandas.');
      return;
    }

    const reason = prompt('Motivo para reabertura da comanda fechada:', 'Erro na cobrança de itens');
    if (!reason) return;

    try {
      reopenTabAtomic(tab.id, currentProfile.id, reason);
      alert('Comanda reaberta com sucesso.');
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-5 space-y-4">
      
      {/* Topo do Módulo: Resumo Financeiro do Turno */}
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-5 rounded-3xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-emerald-950/60">
              <Receipt className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase">
                  Módulo do Caixa & Fechamento
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono font-bold">
                  Operação
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Fechamento de contas, divisão multimeios, troco e emissão de cupons térmicos
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400 font-mono">Faturamento do Turno:</span>
            <div className="text-2xl font-black text-emerald-400 font-mono">
              {formatBRL(totalShiftRevenue)}
            </div>
          </div>
        </div>

        {/* Métricas por Meio de Pagamento */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center">
              <Banknote className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Dinheiro</span>
              <div className="font-mono font-bold text-white text-sm">
                {formatBRL(revenueByMethod.DINHEIRO)}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-950 text-teal-400 border border-teal-800 flex items-center justify-center">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">PIX</span>
              <div className="font-mono font-bold text-white text-sm">
                {formatBRL(revenueByMethod.PIX)}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-950 text-sky-400 border border-sky-800 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Débito</span>
              <div className="font-mono font-bold text-white text-sm">
                {formatBRL(revenueByMethod.DEBITO)}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-950 text-indigo-400 border border-indigo-800 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Crédito</span>
              <div className="font-mono font-bold text-white text-sm">
                {formatBRL(revenueByMethod.CREDITO)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setFilter('WAITING_BILL')}
          className={`px-4 py-2.5 rounded-xl font-bold transition flex items-center gap-2 whitespace-nowrap active:scale-95 ${
            effectiveFilter === 'WAITING_BILL'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-950/50 animate-pulse'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Aguardando Conta ({waitingBillTables.length})</span>
        </button>

        <button
          onClick={() => setFilter('ALL_ACTIVE')}
          className={`px-4 py-2.5 rounded-xl font-bold transition flex items-center gap-2 whitespace-nowrap active:scale-95 ${
            effectiveFilter === 'ALL_ACTIVE'
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/50'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Todas Mesas Abertas ({activeTables.length})</span>
        </button>

        <button
          onClick={() => setFilter('CLOSED_TODAY')}
          className={`px-4 py-2.5 rounded-xl font-bold transition flex items-center gap-2 whitespace-nowrap active:scale-95 ${
            effectiveFilter === 'CLOSED_TODAY'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Comandas Encerradas ({closedTabs.length})</span>
        </button>
      </div>

      {/* Grade de Mesas / Comandas */}
      {effectiveFilter !== 'CLOSED_TODAY' ? (
        activeTables.length === 0 ? (
          <div className="py-20 text-center rounded-3xl bg-slate-900/60 border border-slate-800 p-8 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white">Nenhuma mesa aberta no salão</h3>
            <p className="text-xs text-slate-400">Todas as comandas estão fechadas e as mesas livres.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {activeTables
              .filter((t) => (effectiveFilter === 'WAITING_BILL' ? t.status === 'AGUARDANDO_CONTA' : true))
              .map((table) => {
                const currentTab = tabs.find((tab) => tab.table_id === table.id && tab.status === 'OPEN');
                const isWaitingBill = table.status === 'AGUARDANDO_CONTA';
                const items = currentTab ? getTabOrderItems(currentTab.id) : [];

                return (
                  <div
                    key={table.id}
                    className={`p-4 rounded-3xl border transition flex flex-col justify-between space-y-3 ${
                      isWaitingBill
                        ? 'bg-amber-950/40 border-amber-500/80 shadow-xl shadow-amber-950/40 ring-1 ring-amber-500/40'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black font-mono text-white">
                            Mesa {String(table.number).padStart(2, '0')}
                          </span>
                          {isWaitingBill && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 font-mono font-bold animate-pulse">
                              Conta Pedida!
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                          <Users className="w-3.5 h-3.5 text-slate-500" />
                          {currentTab?.people_count}p
                        </span>
                      </div>

                      <p className="text-xs text-slate-400 mt-1 truncate">
                        {currentTab?.customer_name || `Mesa ${table.number}`}
                      </p>

                      <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-baseline justify-between">
                        <span className="text-xs text-slate-400">
                          {items.filter(i => i.status !== 'CANCELLED').length} itens consumidos
                        </span>
                        <span className="text-xl font-black font-mono text-amber-400">
                          {formatBRL(currentTab?.total || 0)}
                        </span>
                      </div>
                    </div>

                    {/* Botão de Fechamento */}
                    <button
                      onClick={() => setSelectedTableForCheckout(table)}
                      className={`w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2 shadow-lg ${
                        isWaitingBill
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-amber-950/60'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                    >
                      <Receipt className="w-4 h-4" />
                      <span>Fechar Conta / Checkout</span>
                    </button>
                  </div>
                );
              })}
          </div>
        )
      ) : (
        /* Aba de Histórico de Comandas Fechadas */
        closedTabs.length === 0 ? (
          <div className="py-20 text-center rounded-3xl bg-slate-900/60 border border-slate-800 p-8 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-slate-600 mx-auto" />
            <h3 className="text-sm font-bold text-slate-400">Nenhuma comanda fechada neste turno ainda.</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {closedTabs.map((tab) => {
              const table = tables.find((t) => t.id === tab.table_id);
              const tabPayments = payments.filter((p) => p.tab_id === tab.id && p.status === 'PAID');

              return (
                <div
                  key={tab.id}
                  className="p-4 rounded-3xl bg-slate-900 border border-slate-800 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <div>
                      <div className="font-black text-white text-base font-mono">
                        Mesa {table ? String(table.number).padStart(2, '0') : '??'} • #{tab.id.slice(0, 6)}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {tab.customer_name} • Fechada às {new Date(tab.closed_at || tab.opened_at).toLocaleTimeString('pt-BR')}
                      </p>
                    </div>
                    <span className="text-lg font-black text-emerald-400 font-mono">
                      {formatBRL(tab.total)}
                    </span>
                  </div>

                  {/* Discriminativo de Meios de Pagamento */}
                  <div className="space-y-1 text-xs">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">
                      Recebimentos:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {tabPayments.map((p) => (
                        <span
                          key={p.id}
                          className="px-2 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 font-mono text-[11px]"
                        >
                          {p.method}: {formatBRL(p.amount)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex gap-2 pt-1 border-t border-slate-800/80">
                    <button
                      onClick={() => setSelectedClosedTabForReceipt(tab)}
                      className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                    >
                      <Receipt className="w-3.5 h-3.5 text-amber-400" />
                      <span>Ver Cupom</span>
                    </button>

                    {['MASTER', 'GERENTE', 'CAIXA'].includes(currentProfile.role) && (
                      <button
                        onClick={() => handleReopen(tab)}
                        className="px-3 py-2 rounded-xl bg-slate-800/60 hover:bg-rose-950 text-slate-400 hover:text-rose-300 font-semibold text-xs flex items-center justify-center gap-1 transition"
                        title="Reabrir comanda caso tenha sido fechada por engano"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reabrir</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Modal de Checkout / Fechamento da Mesa Selecionada */}
      {selectedTableForCheckout && (
        <TableSettlementModal
          table={selectedTableForCheckout}
          isOpen={true}
          onClose={() => setSelectedTableForCheckout(null)}
        />
      )}

      {/* Modal de Cupom Térmico para Comanda Já Fechada */}
      {selectedClosedTabForReceipt && (
        <ReceiptModal
          isOpen={true}
          onClose={() => setSelectedClosedTabForReceipt(null)}
          tab={selectedClosedTabForReceipt}
          table={tables.find((t) => t.id === selectedClosedTabForReceipt.table_id)}
          items={getTabOrderItems(selectedClosedTabForReceipt.id)}
          payments={payments.filter((p) => p.tab_id === selectedClosedTabForReceipt.id && p.status === 'PAID')}
        />
      )}

    </div>
  );
};
