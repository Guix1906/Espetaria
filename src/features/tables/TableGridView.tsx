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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#14151f] p-4 rounded-3xl border border-white/10 shadow-xl">
        <div>
          <h2 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2 font-brand">
            <span>Visão do Salão & Mesas</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/10 text-stone-300 font-mono font-bold">
              20 Mesas
            </span>
          </h2>
          <p className="text-xs text-stone-400 mt-0.5">
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
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap active:scale-95 ${
                  isActive
                    ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/25 font-black'
                    : 'bg-[#090a0f] border border-white/10 text-stone-400 hover:text-white'
                }`}
              >
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
              className={`relative rounded-3xl p-4 border transition flex flex-col justify-between min-h-[175px] shadow-lg ${
                table.status === 'LIVRE'
                  ? 'bg-[#12131a] border-white/10 hover:border-emerald-500/40 hover:bg-[#151620]'
                  : table.status === 'OCUPADA'
                  ? 'bg-[#14151f] border-2 border-amber-500/40 shadow-amber-950/20'
                  : 'bg-[#16141a] border-2 border-rose-500/50 shadow-rose-950/30'
              }`}
            >
              {/* Topo do Card da Mesa */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-2xl font-black text-white font-mono leading-none">
                    Mesa {String(table.number).padStart(2, '0')}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-stone-400 mt-1 font-medium">
                    <Users className="w-3.5 h-3.5 text-stone-500" />
                    <span>{table.capacity} lugares</span>
                  </div>
                </div>

                <span className={`text-[9px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full border ${statusConfig.badgeBg}`}>
                  {statusConfig.label}
                </span>
              </div>

              {/* Informações da Comanda (se aberta) */}
              {tab ? (
                <div className="my-2 py-2 border-y border-white/5 space-y-1 text-xs">
                  <div className="font-bold text-white truncate" title={tab.customer_name || ''}>
                    {tab.customer_name || 'Comanda Sem Nome'}
                  </div>
                  <div className="flex items-center justify-between text-stone-400 text-[11px]">
                    <span className="flex items-center gap-1 text-amber-300 font-semibold font-mono">
                      <Clock className="w-3 h-3 text-amber-400" />
                      {formatElapsedMinutes(tab.opened_at)}
                    </span>
                    <span className="font-mono font-black text-amber-400 text-sm">
                      {formatBRL(tab.total)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="my-auto py-3 text-center text-xs text-stone-500 font-medium">
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
                    className="w-full py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-40 shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Abrir Comanda</span>
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setSelectedTableForOrder(table)}
                      className="py-2 px-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white text-xs font-bold transition flex items-center justify-center gap-1 active:scale-95 shadow-md shadow-orange-500/20"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Pedir</span>
                    </button>
                    <button
                      onClick={() => setSelectedTableForBill(table)}
                      className="py-2 px-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-stone-200 text-xs font-bold transition flex items-center justify-center gap-1 active:scale-95"
                    >
                      <Receipt className="w-3.5 h-3.5 text-amber-400" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#14151f] border border-white/15 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-base font-black text-white flex items-center gap-2 font-brand">
                <Users className="w-5 h-5 text-emerald-400" />
                <span>Abrir Comanda — Mesa {selectedTableForOpen.number}</span>
              </h3>
              <button
                onClick={() => setSelectedTableForOpen(null)}
                className="p-1 rounded-xl text-stone-400 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOpenTabSubmit} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block text-stone-300 font-bold mb-1.5">
                  Nome do Cliente / Identificador (Opcional)
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
                  placeholder="Ex: Aniversariante, levar taça extra..."
                  value={tabNotes}
                  onChange={(e) => setTabNotes(e.target.value)}
                  className="w-full bg-[#090a0f] border border-white/10 rounded-2xl px-3.5 py-2.5 text-white placeholder-stone-500 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl btn-emerald text-sm uppercase tracking-wider font-bold transition flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-emerald-950/40"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Confirmar e Abrir Comanda</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL: LANÇAR PEDIDO RÁPIDO */}
      {/* ------------------------------------------------------------------ */}
      {selectedTableForOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#14151f] border border-white/15 rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2 font-brand">
                  <Flame className="w-5 h-5 text-orange-500" />
                  <span>Lançar Pedido — Mesa {selectedTableForOrder.number}</span>
                </h3>
                <p className="text-xs text-stone-400 mt-0.5">
                  {getTableTab(selectedTableForOrder.id)?.customer_name || 'Comanda Aberta'}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedTableForOrder(null);
                  setFeedbackMsg(null);
                }}
                className="p-1.5 rounded-xl text-stone-400 hover:text-white hover:bg-white/10 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {feedbackMsg && (
              <div className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2 ${
                feedbackMsg.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              }`}>
                {feedbackMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{feedbackMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleAddOrderSubmit} className="space-y-4 overflow-y-auto pr-1 flex-1 text-xs sm:text-sm">
              {/* Seleção do Produto */}
              <div>
                <label className="block text-stone-300 font-bold mb-1.5">
                  Selecione o Item do Cardápio
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-1.5 bg-[#090a0f] rounded-2xl border border-white/10">
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
                            ? 'bg-[#14151f]/40 border-white/5 text-stone-600 opacity-50 cursor-not-allowed'
                            : isSelected
                            ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/15 border-orange-500 text-white shadow-md'
                            : 'bg-[#14151f] border-white/10 text-stone-200 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-bold text-xs leading-snug">{prod.name}</span>
                          {isExhausted && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/30 font-black shrink-0">
                              ESGOTADO
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-2 text-[11px]">
                          <span className="text-amber-400 font-mono font-bold">{formatBRL(prod.price)}</span>
                          {daily && !isExhausted && (
                            <span className="text-stone-400 font-mono text-[10px]">
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
                  <label className="block text-stone-300 font-bold mb-1.5">
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
                            ? 'bg-orange-500 text-white border-orange-400 shadow-md shadow-orange-500/20'
                            : 'bg-[#090a0f] border-white/10 text-stone-300 hover:bg-white/5'
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
                  <label className="block text-stone-300 font-bold mb-1.5">
                    Quantidade
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOrderQty(Math.max(1, orderQty - 1))}
                      className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-lg flex items-center justify-center border border-white/10 active:scale-95 transition"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={orderQty}
                      onChange={(e) => setOrderQty(Math.max(1, Number(e.target.value)))}
                      className="w-full bg-[#090a0f] border border-white/10 rounded-xl py-2 text-center text-white font-black font-mono focus:outline-none focus:border-orange-500 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setOrderQty(orderQty + 1)}
                      className="w-10 h-10 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-lg flex items-center justify-center active:scale-95 transition shadow-sm shadow-orange-500/20"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-stone-300 font-bold mb-1.5">
                    Observação do Item
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: sem sal grosso, farofa à parte..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    className="w-full bg-[#090a0f] border border-white/10 rounded-xl px-3 py-2 text-white placeholder-stone-500 focus:outline-none focus:border-orange-500 transition"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!selectedProductId}
                  className="w-full py-4 rounded-2xl btn-ember disabled:opacity-50 text-white font-black text-sm uppercase tracking-wider transition flex items-center justify-center gap-2 active:scale-95 shadow-xl shadow-orange-500/25"
                >
                  <Send className="w-4 h-4" />
                  <span>Enviar Pedido à Produção</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* MODAL: VER CONTA / EXTRATO DA MESA */}
      {/* ------------------------------------------------------------------ */}
      {selectedTableForBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#14151f] border border-white/15 rounded-3xl w-full max-w-lg p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2 font-brand">
                  <Receipt className="w-5 h-5 text-amber-400" />
                  <span>Extrato da Comanda — Mesa {selectedTableForBill.number}</span>
                </h3>
                <p className="text-xs text-stone-400 mt-0.5">
                  {getTableTab(selectedTableForBill.id)?.customer_name} • {getTableTab(selectedTableForBill.id)?.people_count} pessoas
                </p>
              </div>
              <button
                onClick={() => setSelectedTableForBill(null)}
                className="p-1.5 rounded-xl text-stone-400 hover:text-white hover:bg-white/10 transition"
              >
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
                    <div className="py-8 text-center text-stone-500 font-medium">
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
                          ? 'bg-rose-950/20 border-rose-900/30 text-stone-500 line-through'
                          : 'bg-[#090a0f] border-white/10 text-stone-200'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>{item.quantity}x {item.product_name}</span>
                          {item.doneness && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-bold">
                              {formatDoneness(item.doneness)}
                            </span>
                          )}
                        </div>
                        {item.notes && (
                          <div className="text-[11px] text-amber-400/90 italic mt-0.5">
                            Obs: {item.notes}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-[10px]">
                          <span className={`px-2 py-0.5 rounded-full border font-bold ${statusConf.bg} ${statusConf.color}`}>
                            {statusConf.label}
                          </span>
                          <span className="text-stone-400 font-mono">
                            Setor: {item.sector}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-mono font-bold text-amber-400 text-sm">
                            {formatBRL(item.unit_price * item.quantity)}
                          </div>
                          <div className="text-[10px] text-stone-500 font-mono">
                            {item.quantity} × {formatBRL(item.unit_price)}
                          </div>
                        </div>

                        {!isCancelled && (
                          <button
                            title="Cancelar item"
                            onClick={() => handleCancelItem(item)}
                            className="p-2 rounded-xl text-rose-400 hover:text-white hover:bg-rose-500/20 transition"
                          >
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
                <div className="border-t border-white/10 pt-4 space-y-2 text-xs">
                  <div className="flex justify-between text-stone-400">
                    <span>Subtotal:</span>
                    <span className="font-mono font-bold text-stone-200">{formatBRL(tab.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-stone-400">
                    <span>Taxa de Serviço Opcional (10%):</span>
                    <span className="font-mono text-stone-300">{formatBRL(tab.service_fee)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-white/10">
                    <span className="text-stone-200">Total da Mesa:</span>
                    <span className="font-mono text-amber-400 text-2xl font-black">{formatBRL(tab.total)}</span>
                  </div>
                  <div className="text-[11px] text-stone-400 text-right pt-0.5">
                    Divisão sugerida ({tab.people_count} pessoas): <span className="font-mono font-bold text-amber-300">{formatBRL(tab.total / tab.people_count)}</span> cada
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => {
                        const target = selectedTableForBill;
                        setSelectedTableForBill(null);
                        setSelectedTableForCheckout(target);
                      }}
                      className="w-full py-3.5 rounded-2xl btn-gold font-black text-xs uppercase tracking-wider transition active:scale-95 flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25"
                    >
                      <Receipt className="w-4 h-4" />
                      <span>Ir para Fechamento no Caixa</span>
                    </button>
                  </div>
                </div>
              );
            })()}

          </div>
        </div>
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
