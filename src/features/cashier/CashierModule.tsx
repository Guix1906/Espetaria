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
    <div className="min-h-screen bg-obsidian-950 text-obsidian-100 p-3 sm:p-5 space-y-4">
      
      {/* Topo do Módulo: Resumo Financeiro do Turno */}
      <div className="bg-carbon-900 border border-carbon-800 p-4 sm:p-6 rounded-3xl shadow-2xl space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-carbon-800 pb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-950/80 border border-emerald-600/50 text-emerald-400 flex items-center justify-center font-black shadow-lg shadow-emerald-950/50">
              <Receipt className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase font-serif">
                  Frente de Caixa & Fechamento
                </h2>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-bold tracking-wider">
                  TURNO EM ANDAMENTO
                </span>
              </div>
              <p className="text-xs text-obsidian-400 mt-0.5">
                Fechamento de contas, divisão multimeios, troco e emissão de cupons térmicos
              </p>
            </div>
          </div>

          <div className="text-left sm:text-right bg-carbon-800/60 sm:bg-transparent p-3 sm:p-0 rounded-2xl border sm:border-0 border-carbon-700/60 w-full sm:w-auto">
            <span className="text-xs text-obsidian-400 font-mono uppercase tracking-wider block">Faturamento do Turno:</span>
            <div className="text-2xl sm:text-3xl font-black text-gold-400 font-mono tracking-tight drop-shadow-md">
              {formatBRL(totalShiftRevenue)}
            </div>
          </div>
        </div>

        {/* Métricas por Meio de Pagamento */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-obsidian-900/80 border border-carbon-800 flex items-center gap-3 shadow-inner">
            <div className="w-9 h-9 rounded-xl bg-emerald-950/80 text-emerald-400 border border-emerald-700/50 flex items-center justify-center shadow-md">
              <Banknote className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-obsidian-400 uppercase font-semibold">Dinheiro</span>
              <div className="font-mono font-bold text-white text-sm">
                {formatBRL(revenueByMethod.DINHEIRO)}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-obsidian-900/80 border border-carbon-800 flex items-center gap-3 shadow-inner">
            <div className="w-9 h-9 rounded-xl bg-teal-950/80 text-teal-400 border border-teal-700/50 flex items-center justify-center shadow-md">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-obsidian-400 uppercase font-semibold">PIX Instantâneo</span>
              <div className="font-mono font-bold text-white text-sm">
                {formatBRL(revenueByMethod.PIX)}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-obsidian-900/80 border border-carbon-800 flex items-center gap-3 shadow-inner">
            <div className="w-9 h-9 rounded-xl bg-cyan-950/80 text-cyan-400 border border-cyan-700/50 flex items-center justify-center shadow-md">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-obsidian-400 uppercase font-semibold">Cartão Débito</span>
              <div className="font-mono font-bold text-white text-sm">
                {formatBRL(revenueByMethod.DEBITO)}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-obsidian-900/80 border border-carbon-800 flex items-center gap-3 shadow-inner">
            <div className="w-9 h-9 rounded-xl bg-purple-950/80 text-purple-400 border border-purple-700/50 flex items-center justify-center shadow-md">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] text-obsidian-400 uppercase font-semibold">Cartão Crédito</span>
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
          className={`px-4 py-2.5 rounded-2xl font-bold transition flex items-center gap-2 whitespace-nowrap active:scale-95 ${
            effectiveFilter === 'WAITING_BILL'
              ? 'bg-gold-500 text-obsidian-950 font-black shadow-lg shadow-gold-950/60 animate-pulse'
              : 'bg-carbon-900 text-obsidian-400 border border-carbon-800 hover:text-white hover:border-carbon-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Aguardando Conta ({waitingBillTables.length})</span>
        </button>

        <button
          onClick={() => setFilter('ALL_ACTIVE')}
          className={`px-4 py-2.5 rounded-2xl font-bold transition flex items-center gap-2 whitespace-nowrap active:scale-95 ${
            effectiveFilter === 'ALL_ACTIVE'
              ? 'bg-ember-600 text-white font-black shadow-lg shadow-ember-950/60'
              : 'bg-carbon-900 text-obsidian-400 border border-carbon-800 hover:text-white hover:border-carbon-700'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Todas Mesas Abertas ({activeTables.length})</span>
        </button>

        <button
          onClick={() => setFilter('CLOSED_TODAY')}
          className={`px-4 py-2.5 rounded-2xl font-bold transition flex items-center gap-2 whitespace-nowrap active:scale-95 ${
            effectiveFilter === 'CLOSED_TODAY'
              ? 'bg-emerald-600 text-white font-black shadow-lg shadow-emerald-950/60'
              : 'bg-carbon-900 text-obsidian-400 border border-carbon-800 hover:text-white hover:border-carbon-700'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Comandas Encerradas ({closedTabs.length})</span>
        </button>
      </div>

      {/* Grade de Mesas / Comandas */}
      {effectiveFilter !== 'CLOSED_TODAY' ? (
        activeTables.length === 0 ? (
          <div className="py-20 text-center rounded-3xl bg-carbon-900/60 border border-carbon-800 p-8 space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-carbon-800 border border-carbon-700 text-obsidian-400 flex items-center justify-center mx-auto">
              <Sparkles className="w-8 h-8 text-gold-400" />
            </div>
            <h3 className="text-xl font-bold text-white font-serif">Nenhuma mesa aberta no salão</h3>
            <p className="text-xs text-obsidian-400">Todas as comandas estão fechadas e as mesas livres para novos clientes.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {activeTables
              .filter((t) => (effectiveFilter === 'WAITING_BILL' ? t.status === 'AGUARDANDO_CONTA' : true))
              .map((table) => {
                const currentTab = tabs.find((tab) => tab.table_id === table.id && tab.status === 'OPEN');
                const isWaitingBill = table.status === 'AGUARDANDO_CONTA';
                const items = currentTab ? getTabOrderItems(currentTab.id) : [];

                return (
                  <div
                    key={table.id}
                    className={`p-5 rounded-3xl border transition flex flex-col justify-between space-y-4 shadow-xl ${
                      isWaitingBill
                        ? 'bg-gradient-to-b from-carbon-900 to-amber-950/30 border-amber-500 shadow-amber-950/40 ring-1 ring-amber-500/50'
                        : 'bg-carbon-900 border-carbon-800 hover:border-carbon-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-black font-mono text-white">
                            Mesa {String(table.number).padStart(2, '0')}
                          </span>
                          {isWaitingBill && (
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 font-mono font-bold animate-pulse">
                              Conta Pedida!
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-obsidian-400 flex items-center gap-1 font-mono">
                          <Users className="w-3.5 h-3.5 text-obsidian-500" />
                          {currentTab?.people_count}p
                        </span>
                      </div>

                      <p className="text-xs text-obsidian-400 mt-1 truncate">
                        {currentTab?.customer_name || `Mesa ${table.number}`}
                      </p>

                      <div className="mt-3.5 pt-3 border-t border-carbon-800/80 flex items-baseline justify-between">
                        <span className="text-xs text-obsidian-400">
                          {items.filter(i => i.status !== 'CANCELLED').length} itens consumidos
                        </span>
                        <span className="text-xl font-black font-mono text-gold-400">
                          {formatBRL(currentTab?.total || 0)}
                        </span>
                      </div>
                    </div>

                    {/* Botão de Fechamento */}
                    <button
                      onClick={() => setSelectedTableForCheckout(table)}
                      className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2 shadow-lg ${
                        isWaitingBill
                          ? 'btn-gold shadow-gold-950/50'
                          : 'btn-carbon'
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
          <div className="py-20 text-center rounded-3xl bg-carbon-900/60 border border-carbon-800 p-8 space-y-2">
            <CheckCircle2 className="w-10 h-10 text-obsidian-600 mx-auto" />
            <h3 className="text-sm font-bold text-obsidian-400">Nenhuma comanda fechada neste turno ainda.</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {closedTabs.map((tab) => {
              const table = tables.find((t) => t.id === tab.table_id);
              const tabPayments = payments.filter((p) => p.tab_id === tab.id && p.status === 'PAID');

              return (
                <div
                  key={tab.id}
                  className="p-5 rounded-3xl bg-carbon-900 border border-carbon-800 space-y-3.5 shadow-xl"
                >
                  <div className="flex items-center justify-between border-b border-carbon-800/80 pb-3">
                    <div>
                      <div className="font-black text-white text-base font-mono">
                        Mesa {table ? String(table.number).padStart(2, '0') : '??'} • #{tab.id.slice(0, 6)}
                      </div>
                      <p className="text-xs text-obsidian-400 mt-0.5">
                        {tab.customer_name} • Fechada às {new Date(tab.closed_at || tab.opened_at).toLocaleTimeString('pt-BR')}
                      </p>
                    </div>
                    <span className="text-lg font-black text-emerald-400 font-mono">
                      {formatBRL(tab.total)}
                    </span>
                  </div>

                  {/* Discriminativo de Meios de Pagamento */}
                  <div className="space-y-1 text-xs">
                    <span className="text-[10px] text-obsidian-500 uppercase font-semibold">
                      Recebimentos:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {tabPayments.map((p) => (
                        <span
                          key={p.id}
                          className="px-2.5 py-0.5 rounded-lg bg-obsidian-900 border border-carbon-800 text-obsidian-300 font-mono text-[11px]"
                        >
                          {p.method}: {formatBRL(p.amount)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex gap-2 pt-1 border-t border-carbon-800/80">
                    <button
                      onClick={() => setSelectedClosedTabForReceipt(tab)}
                      className="btn-gold flex-1 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Ver Cupom</span>
                    </button>

                    {['MASTER', 'GERENTE', 'CAIXA'].includes(currentProfile.role) && (
                      <button
                        onClick={() => handleReopen(tab)}
                        className="btn-carbon px-3 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1 text-obsidian-400 hover:text-ruby-400"
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
