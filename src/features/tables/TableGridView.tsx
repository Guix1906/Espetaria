import { Dialog } from '../../components/ui/Dialog';
import React, { useState } from 'react';
import { 
  Users, 
  Plus, 
  Receipt, 
  Clock, 
  Flame, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  Trash2,
  Send,
  ShoppingBag
} from 'lucide-react';
import { useTableStore } from '../../stores/useTableStore';
import { useStockStore } from '../../stores/useStockStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { RestaurantTable, Tab, OrderItem } from '../../types/domain';
import { MeatDoneness, TableStatus } from '../../types/enums';
import { formatBRL, formatElapsedMinutes, formatDoneness, getTableStatusConfig, getOrderItemStatusConfig } from '../../lib/formatters';
import { TableSettlementModal } from '../cashier/TableSettlementModal';

export const TableGridView: React.FC = () => {
  const { tables, tabs, openTab, addOrderAtomic, cancelOrderItemAtomic, getTabOrderItems } = useTableStore();
  const { products, dailyPrepStock } = useStockStore();
  const { currentProfile } = useAuthStore();
  const { currentShift } = useShiftStore();

  const [filter, setFilter] = useState<'ALL' | TableStatus>('ALL');
  
  // Modais
  const [selectedTableForOpen, setSelectedTableForOpen] = useState<RestaurantTable | null>(null);
  const [selectedTableForOrder, setSelectedTableForOrder] = useState<RestaurantTable | null>(null);
  const [selectedTableForBill, setSelectedTableForBill] = useState<RestaurantTable | null>(null);
  const [selectedTableForCheckout, setSelectedTableForCheckout] = useState<RestaurantTable | null>(null);

  // Estados dos formulários de modal
  const [customerName, setCustomerName] = useState('');
  const [peopleCount, setPeopleCount] = useState(2);
  const [tabNotes, setTabNotes] = useState('');
  
  // Lançamento de pedido
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [orderQty, setOrderQty] = useState<number>(1);
  const [orderDoneness, setOrderDoneness] = useState<MeatDoneness>('AO_PONTO');
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filtro de mesas
  const filteredTables = tables.filter((t) => {
    if (filter === 'ALL') return true;
    return t.status === filter;
  });

  const getTableTab = (tableId: string): Tab | undefined => {
    return tabs.find((tab) => tab.table_id === tableId && tab.status === 'OPEN');
  };

  const handleOpenTabSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTableForOpen || !currentShift) return;

    try {
      openTab(
        selectedTableForOpen.id,
        customerName,
        peopleCount,
        tabNotes,
        currentProfile.id,
        currentShift.id
      );
      setSelectedTableForOpen(null);
      setCustomerName('');
      setPeopleCount(2);
      setTabNotes('');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao abrir comanda.');
    }
  };

  const handleAddOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTableForOrder || !currentShift || !selectedProductId) return;

    const tab = getTableTab(selectedTableForOrder.id);
    if (!tab) return;

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    try {
      addOrderAtomic(
        currentShift.id,
        tab.id,
        [
          {
            productId: selectedProductId,
            quantity: orderQty,
            doneness: product.allows_doneness ? orderDoneness : undefined,
            notes: orderNotes || undefined,
          },
        ],
        currentProfile.id
      );

      setFeedbackMsg({
        type: 'success',
        text: `${orderQty}x ${product.name} lançado com sucesso!`,
      });

      // Limpa formulário
      setOrderQty(1);
      setOrderNotes('');
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (err: unknown) {
      setFeedbackMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Erro ao lançar pedido.',
      });
    }
  };

  const handleCancelItem = (item: OrderItem) => {
    if (!currentShift) return;
    const reason = prompt('Informe o motivo do cancelamento:', 'Cliente desistiu');
    if (!reason) return;

    try {
      cancelOrderItemAtomic(item.id, reason, currentProfile.id, currentShift.id);
      alert('Item cancelado com sucesso e registrado na auditoria.');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao cancelar item.');
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-5">
      
      {/* Barra de Filtros e Resumo do Salão */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-muted p-4 rounded-2xl border border-line shadow-sm">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-ink tracking-tight flex items-center gap-2 font-sans">
            <span>Visão do Salão & Mesas</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-surface-muted text-ink tabular-nums font-bold border border-line">
              20 Mesas
            </span>
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Acompanhe o consumo em tempo real, abra novas comandas e lance pedidos diretamente
          </p>
        </div>

        {/* Botões de Filtro */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(['ALL', 'LIVRE', 'OCUPADA', 'AGUARDANDO_CONTA'] as const).map((status) => {
            const label = status === 'ALL' ? 'Todas as Mesas' : getTableStatusConfig(status).label;
            const count = status === 'ALL' ? tables.length : tables.filter((t) => t.status === status).length;
            const isActive = filter === status;

            return (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`filter-chip ${isActive ? 'is-active' : ''}`}
               type="button" aria-pressed={isActive}>
                {label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid de Mesas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
        {filteredTables.map((table) => {
          const tab = getTableTab(table.id);
          const statusConfig = getTableStatusConfig(table.status);

          return (
            <div
              key={table.id}
              className={`relative rounded-2xl p-4 border transition flex flex-col justify-between min-h-[175px] shadow-sm ${
                table.status === 'LIVRE'
                  ? 'bg-surface-muted border-line hover:border-emerald-400 hover:shadow-card'
                  : table.status === 'OCUPADA'
                  ? 'bg-surface-muted border-2 border-amber-200'
                  : 'bg-surface-muted border-2 border-rose-200'
              }`}
            >
              {/* Topo do Card da Mesa */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-2xl font-bold text-ink tabular-nums leading-none">
                    Mesa {String(table.number).padStart(2, '0')}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-ink-muted mt-1 font-medium">
                    <Users className="w-3.5 h-3.5 text-ink-muted" />
                    <span>{table.capacity} lugares</span>
                  </div>
                </div>

                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusConfig.badgeBg}`}>
                  {statusConfig.label}
                </span>
              </div>

              {/* Informações da Comanda (se aberta) */}
              {tab ? (
                <div className="my-2 py-2 border-y border-line space-y-1 text-xs">
                  <div className="font-bold text-ink truncate" title={tab.customer_name || ''}>
                    {tab.customer_name || 'Comanda Sem Nome'}
                  </div>
                  <div className="flex items-center justify-between text-ink-muted text-xs">
                    <span className="flex items-center gap-1 text-amber-800 font-semibold tabular-nums">
                      <Clock className="w-3 h-3 text-amber-800" />
                      {formatElapsedMinutes(tab.opened_at)}
                    </span>
                    <span className="tabular-nums font-bold text-brand-700 text-sm">
                      {formatBRL(tab.total)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="my-auto py-3 text-center text-xs text-ink-muted font-medium">
                  Mesa desocupada
                </div>
              )}

              {/* Botões de Ação na Mesa */}
              <div className="pt-2">
                {table.status === 'LIVRE' ? (
                  <button
                    disabled={!currentShift}
                    onClick={() => {
                      if (!currentShift) {
                        alert('Abra o turno primeiro.');
                        return;
                      }
                      setSelectedTableForOpen(table);
                    }}
                    className="w-full py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-40 shadow-sm"
                   type="button">
                    <Plus className="w-4 h-4" />
                    <span>Abrir Comanda</span>
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setSelectedTableForOrder(table)}
                      className="btn-primary py-2 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 shadow-sm"
                     type="button">
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Pedir</span>
                    </button>
                    <button
                      onClick={() => setSelectedTableForBill(table)}
                      className="btn-secondary py-2 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                     type="button">
                      <Receipt className="w-3.5 h-3.5 text-amber-800" />
                      <span>Conta</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* MODAL: ABRIR COMANDA */}
      {/* ------------------------------------------------------------------ */}
      {selectedTableForOpen && (
        <Dialog label="Abrir comanda" onClose={() => setSelectedTableForOpen(null)}>
          <div className="dialog-panel bg-surface-muted border border-line rounded-2xl w-full max-w-md p-6 shadow-card space-y-4 fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <h3 className="text-base font-bold text-ink flex items-center gap-2 font-sans">
                <Users className="w-5 h-5 text-emerald-700" />
                <span>Abrir Comanda — Mesa {selectedTableForOpen.number}</span>
              </h3>
              <button
                onClick={() => setSelectedTableForOpen(null)}
                className="p-1.5 rounded-xl text-ink-muted hover:text-ink hover:bg-surface-muted transition"
                aria-label="Fechar"
               type="button">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOpenTabSubmit} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-ink font-bold mb-1.5" htmlFor="tablegridview-field-1">
                  Nome do Cliente / Identificador (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Roberto / Família Silva"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-surface-muted border border-line rounded-2xl px-3.5 py-2.5 text-ink placeholder-ink-muted focus:outline-none focus:border-brand-600 transition font-medium"
                 aria-label="Nome do Cliente / Identificador (Opcional)" id="tablegridview-field-1"/>
              </div>

              <div>
                <label className="block text-ink font-bold mb-1.5" htmlFor="tablegridview-field-2">
                  Quantidade de Pessoas na Mesa
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={peopleCount}
                  onChange={(e) => setPeopleCount(Number(e.target.value))}
                  className="w-full bg-surface-muted border border-line rounded-2xl px-3.5 py-2.5 text-ink focus:outline-none focus:border-brand-600 tabular-nums font-bold transition"
                 aria-label="Quantidade de Pessoas na Mesa" id="tablegridview-field-2"/>
              </div>

              <div>
                <label className="block text-ink font-bold mb-1.5" htmlFor="tablegridview-field-3">
                  Observação da Mesa (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Aniversariante, levar taça extra..."
                  value={tabNotes}
                  onChange={(e) => setTabNotes(e.target.value)}
                  className="w-full bg-surface-muted border border-line rounded-2xl px-3.5 py-2.5 text-ink placeholder-ink-muted focus:outline-none focus:border-brand-600 transition"
                 aria-label="Observação da Mesa (Opcional)" id="tablegridview-field-3"/>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl btn-success text-sm font-bold transition flex items-center justify-center gap-2 shadow-card"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Confirmar e Abrir Comanda</span>
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL: LANÇAR PEDIDO RÁPIDO */}
      {/* ------------------------------------------------------------------ */}
      {selectedTableForOrder && (
        <Dialog label="Lançar pedido" onClose={() => { setSelectedTableForOrder(null); setFeedbackMsg(null); }}>
          <div className="dialog-panel bg-surface-muted border border-line rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-card space-y-4 max-h-[90vh] flex flex-col fade-in zoom-in-95">
            
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h3 className="text-base font-bold text-ink flex items-center gap-2 font-sans">
                  <Flame className="w-5 h-5 text-brand-700" />
                  <span>Lançar Pedido — Mesa {selectedTableForOrder.number}</span>
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  {getTableTab(selectedTableForOrder.id)?.customer_name || 'Comanda Aberta'}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedTableForOrder(null);
                  setFeedbackMsg(null);
                }}
                className="p-1.5 rounded-xl text-ink-muted hover:text-ink hover:bg-surface-muted transition"
                aria-label="Fechar"
               type="button">
                <X className="w-5 h-5" />
              </button>
            </div>

            {feedbackMsg && (
              <div className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2 ${
                feedbackMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-rose-50 border-rose-300 text-rose-800'
              }`}>
                {feedbackMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                )}
                <span>{feedbackMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleAddOrderSubmit} className="space-y-4 overflow-y-auto pr-1 flex-1 text-xs sm:text-sm">
              {/* Seleção do Produto */}
              <div>
                <label className="block text-ink font-bold mb-1.5">
                  Selecione o Item do Cardápio
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-1.5 bg-surface-muted rounded-2xl border border-line">
                  {products.map((prod) => {
                    const daily = dailyPrepStock.find((s) => s.product_id === prod.id);
                    const isExhausted = !prod.available || (daily && (daily.is_exhausted || daily.current_quantity <= 0));
                    const isSelected = selectedProductId === prod.id;

                    return (
                      <button
                        type="button"
                        key={prod.id}
                        disabled={Boolean(isExhausted)}
                        onClick={() => setSelectedProductId(prod.id)}
                        className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                          isExhausted
                            ? 'bg-surface-muted border-line text-ink-muted opacity-50 cursor-not-allowed'
                            : isSelected
                            ? 'bg-brand-50 border-brand-400 text-brand-950 shadow-sm'
                            : 'bg-surface-muted border-line text-ink hover:border-brand-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-bold text-xs leading-snug">{prod.name}</span>
                          {isExhausted && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 font-bold shrink-0">
                              ESGOTADO
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-2 text-xs">
                          <span className="text-brand-700 tabular-nums font-bold">{formatBRL(prod.price)}</span>
                          {daily && !isExhausted && (
                            <span className="text-ink-muted tabular-nums text-xs">
                              Resta: {daily.current_quantity}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Se o produto for carne, seleciona Ponto */}
              {products.find((p) => p.id === selectedProductId)?.allows_doneness && (
                <div>
                  <label className="block text-ink font-bold mb-1.5">
                    Ponto da Carne (Obrigatório)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {(
                      [
                        'MAL_PASSADA',
                        'AO_PONTO_PARA_MAL',
                        'AO_PONTO',
                        'AO_PONTO_PARA_BEM',
                        'BEM_PASSADA',
                      ] as MeatDoneness[]
                    ).map((d) => (
                      <button
                        type="button"
                        key={d}
                        onClick={() => setOrderDoneness(d)}
                        className={`px-3 py-2 rounded-xl border text-xs font-bold transition text-center ${
                          orderDoneness === d
                            ? 'bg-brand-700 text-white border-brand-400 shadow-sm'
                            : 'bg-surface-muted border-line text-ink hover:bg-surface-muted'
                        }`}
                      >
                        {formatDoneness(d)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantidade e Observações */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink font-bold mb-1.5">
                    Quantidade
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOrderQty(Math.max(1, orderQty - 1))}
                      className="btn-secondary w-10 h-10 rounded-xl font-bold text-lg flex items-center justify-center transition"
                     aria-label="Diminuir quantidade">
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={orderQty}
                      onChange={(e) => setOrderQty(Math.max(1, Number(e.target.value)))}
                      className="w-full bg-surface-muted border border-line rounded-xl py-2 text-center text-ink font-bold tabular-nums focus:outline-none focus:border-brand-600 transition"
                     aria-label="Quantidade do produto"/>
                    <button
                      type="button"
                      onClick={() => setOrderQty(orderQty + 1)}
                      className="btn-primary w-10 h-10 rounded-xl font-bold text-lg flex items-center justify-center transition shadow-sm"
                     aria-label="Aumentar quantidade">
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-ink font-bold mb-1.5" htmlFor="tablegridview-field-4">
                    Observação do Item
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: sem sal grosso, farofa à parte..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    className="w-full bg-surface-muted border border-line rounded-xl px-3 py-2 text-ink placeholder-ink-muted focus:outline-none focus:border-brand-600 transition"
                   aria-label="Observação do Item" id="tablegridview-field-4"/>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!selectedProductId}
                  className="btn-primary w-full py-4 rounded-2xl disabled:opacity-50 font-bold text-sm transition flex items-center justify-center gap-2 shadow-card"
                >
                  <Send className="w-4 h-4" />
                  <span>Enviar Pedido à Produção</span>
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL: VER CONTA / EXTRATO DA MESA */}
      {/* ------------------------------------------------------------------ */}
      {selectedTableForBill && (
        <Dialog label="Extrato da comanda" onClose={() => setSelectedTableForBill(null)}>
          <div className="dialog-panel bg-surface-muted border border-line rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-card space-y-4 max-h-[90vh] flex flex-col fade-in zoom-in-95">
            
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h3 className="text-base font-bold text-ink flex items-center gap-2 font-sans">
                  <Receipt className="w-5 h-5 text-amber-800" />
                  <span>Extrato da Comanda — Mesa {selectedTableForBill.number}</span>
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  {getTableTab(selectedTableForBill.id)?.customer_name} • {getTableTab(selectedTableForBill.id)?.people_count} pessoas
                </p>
              </div>
              <button
                onClick={() => setSelectedTableForBill(null)}
                className="p-1.5 rounded-xl text-ink-muted hover:text-ink hover:bg-surface-muted transition"
                aria-label="Fechar"
               type="button">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Lista de Itens Consumidos */}
            <div className="overflow-y-auto space-y-2 flex-1 pr-1 text-xs">
              {(() => {
                const tab = getTableTab(selectedTableForBill.id);
                if (!tab) return null;
                const items = getTabOrderItems(tab.id);

                if (items.length === 0) {
                  return (
                    <div className="py-8 text-center text-ink-muted font-medium">
                      Nenhum item lançado ainda nesta comanda.
                    </div>
                  );
                }

                return items.map((item) => {
                  const statusConf = getOrderItemStatusConfig(item.status);
                  const isCancelled = item.status === 'CANCELLED';

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-2 shadow-sm ${
                        isCancelled
                          ? 'bg-rose-50 border-rose-200 text-ink-muted line-through'
                          : 'bg-surface-muted border-line text-ink'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-ink flex items-center gap-2">
                          <span>{item.quantity}x {item.product_name}</span>
                          {item.doneness && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 tabular-nums font-bold">
                              {formatDoneness(item.doneness)}
                            </span>
                          )}
                        </div>
                        {item.notes && (
                          <div className="text-xs text-amber-800 italic mt-0.5">
                            Obs: {item.notes}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-xs">
                          <span className={`px-2 py-0.5 rounded-full border font-bold ${statusConf.bg} ${statusConf.color}`}>
                            {statusConf.label}
                          </span>
                          <span className="text-ink-muted tabular-nums">
                            Setor: {item.sector}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="tabular-nums font-bold text-brand-700 text-sm">
                            {formatBRL(item.unit_price * item.quantity)}
                          </div>
                          <div className="text-xs text-ink-muted tabular-nums">
                            {item.quantity} × {formatBRL(item.unit_price)}
                          </div>
                        </div>

                        {!isCancelled && (
                          <button
                            title="Cancelar item"
                            onClick={() => handleCancelItem(item)}
                            className="p-2 rounded-xl text-rose-700 hover:text-rose-800 hover:bg-rose-100 transition"
                           type="button" aria-label="Cancelar item">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Totais da Comanda */}
            {(() => {
              const tab = getTableTab(selectedTableForBill.id);
              if (!tab) return null;

              return (
                <div className="border-t border-line pt-4 space-y-2 text-xs">
                  <div className="flex justify-between text-ink-muted">
                    <span>Subtotal:</span>
                    <span className="tabular-nums font-bold text-ink">{formatBRL(tab.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-ink-muted">
                    <span>Taxa de Serviço Opcional (10%):</span>
                    <span className="tabular-nums text-ink">{formatBRL(tab.service_fee)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-ink pt-2 border-t border-line">
                    <span>Total da Mesa:</span>
                    <span className="tabular-nums text-brand-700 text-2xl font-bold">{formatBRL(tab.total)}</span>
                  </div>
                  <div className="text-xs text-ink-muted text-right pt-0.5">
                    Divisão sugerida ({tab.people_count} pessoas): <span className="tabular-nums font-bold text-amber-800">{formatBRL(tab.total / tab.people_count)}</span> cada
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => {
                        const target = selectedTableForBill;
                        setSelectedTableForBill(null);
                        setSelectedTableForCheckout(target);
                      }}
                      className="btn-primary w-full py-3.5 rounded-2xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-card"
                     type="button">
                      <Receipt className="w-4 h-4" />
                      <span>Ir para Fechamento no Caixa</span>
                    </button>
                  </div>
                </div>
              );
            })()}

          </div>
        </Dialog>
      )}

      {/* Modal de Fechamento e Checkout do Caixa */}
      {selectedTableForCheckout && (
        <TableSettlementModal
          table={selectedTableForCheckout}
          isOpen={true}
          onClose={() => setSelectedTableForCheckout(null)}
        />
      )}

    </div>
  );
};
