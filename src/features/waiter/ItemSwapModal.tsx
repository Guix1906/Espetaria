import React, { useState, useMemo } from 'react';
import { ArrowLeftRight, Check, Search, X, Minus, Plus } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { OptionGroup } from '../../components/ui/OptionGroup';
import { formatBRL, formatDoneness } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import type { OrderItem, Product, RestaurantTable, MeatDoneness } from '../../types/domain';
import { NO_RICE } from './WaiterDonenessModal';

interface ItemSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: OrderItem | null;
  table: RestaurantTable;
}

const DONENESS_OPTIONS: { value: MeatDoneness; label: string }[] = [
  { value: 'MAL_PASSADA', label: 'Mal passada' },
  { value: 'AO_PONTO', label: 'Ao ponto' },
  { value: 'BEM_PASSADA', label: 'Bem passada' },
];

export const ItemSwapModal: React.FC<ItemSwapModalProps> = ({
  isOpen,
  onClose,
  item,
  table,
}) => {
  const { notify } = useFeedback();
  const { currentProfile } = useAuthStore();
  const { currentShift } = useShiftStore();
  const { products, dailyPrepStock, categories } = useStockStore();
  const { swapOrderItemAtomic } = useTableStore();
  const { settings } = useSettingsStore();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState<number>(item?.quantity || 1);
  const [doneness, setDoneness] = useState<MeatDoneness | null>(item?.doneness || 'AO_PONTO');
  const [notes, setNotes] = useState<string>('');
  const [rice, setRice] = useState<string | null>(null);
  const [returnStock, setReturnStock] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Redefine valores iniciais ao abrir ou mudar de item
  React.useEffect(() => {
    if (item) {
      setQuantity(item.quantity);
      setDoneness(item.doneness || 'AO_PONTO');
      setNotes('');
      setRice(null);
      setSelectedProduct(null);
      setSearch('');
      setSelectedCategory('ALL');
      setReturnStock(true);
    }
  }, [item]);

  const activeProducts = useMemo(() => {
    return products.filter((p) => p.active);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeProducts.filter((p) => {
      if (selectedCategory !== 'ALL' && p.category_id !== selectedCategory) {
        return false;
      }
      if (q && !p.name.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [activeProducts, search, selectedCategory]);

  if (!isOpen || !item) return null;

  const oldTotal = item.unit_price * item.quantity;
  const newTotal = selectedProduct ? selectedProduct.price * quantity : 0;
  const diff = newTotal - oldTotal;
  // Mesma regra de lançar pedido: Completo sempre sai com o arroz escolhido
  const riceOptions = settings.daily_rice_flavors ?? [];
  const needsRice = !!selectedProduct && /acompanhamento/i.test(selectedProduct.name) && riceOptions.length > 0;

  const handleConfirmSwap = async () => {
    if (!selectedProduct) {
      notify('Selecione o produto substituto.', 'error');
      return;
    }
    if (needsRice && !rice) {
      notify('Escolha o arroz para continuar.', 'error');
      return;
    }
    if (!currentShift) {
      notify('Nenhum turno aberto.', 'error');
      return;
    }
    if (quantity <= 0) {
      notify('A quantidade deve ser maior que zero.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      swapOrderItemAtomic(
        item.id,
        selectedProduct.id,
        quantity,
        selectedProduct.allows_doneness ? doneness : null,
        [needsRice ? rice : null, notes.trim()].filter(Boolean).join(', ') || null,
        currentProfile.id,
        currentShift.id,
        returnStock
      );

      notify(
        `Troca realizada: ${item.quantity}x ${item.product_name} trocado por ${quantity}x ${selectedProduct.name}. Cupons enviados para a produção!`,
        'success'
      );
      onClose();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Não foi possível trocar o item.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog label={`Trocar item · Mesa ${table.number}`} onClose={onClose} placement="sheet">
      <div className="dialog-panel bg-surface-muted border-t sm:border border-line rounded-t-2xl sm:rounded-2xl w-full max-w-xl p-5 sm:p-6 shadow-card space-y-4 max-h-[92vh] flex flex-col fade-in zoom-in-95">
        
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b border-line pb-3">
          <div className="flex items-center gap-3">
            <div className="bg-brand-700 w-11 h-11 rounded-2xl text-white flex items-center justify-center shadow-card shrink-0">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink text-xl leading-tight">
                Trocar item · Mesa {String(table.number).padStart(2, '0')}
              </h3>
              <p className="text-base text-ink-muted mt-0.5">
                Substituir pedido lançado por engano
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-surface transition"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Item Atual a ser cancelado */}
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-rose-800 uppercase tracking-wide">
            <span>Item a cancelar na produção</span>
            <span>{formatBRL(oldTotal)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <p className="text-lg font-bold text-ink">
              {item.quantity}x {item.product_name}
            </p>
            {item.doneness && (
              <span className="text-sm font-medium text-ink-muted">
                Ponto: {formatDoneness(item.doneness)}
              </span>
            )}
          </div>
          {item.notes && <p className="text-sm text-ink-muted">Obs: {item.notes}</p>}
        </div>

        {/* Seleção do Substituto */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {!selectedProduct ? (
            <>
              {/* Barra de Busca e Categorias */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar produto substituto..."
                    className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3 text-base placeholder:text-ink-muted focus:border-brand-500 focus:outline-none"
                    autoFocus
                  />
                </div>

                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('ALL')}
                    className={`h-8 px-3 rounded-lg text-xs font-bold border whitespace-nowrap transition ${selectedCategory === 'ALL' ? 'bg-ink text-white border-ink' : 'bg-surface text-ink border-line'}`}
                  >
                    Todos
                  </button>
                  {categories.filter((c) => c.active).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCategory(c.id)}
                      className={`h-8 px-3 rounded-lg text-xs font-bold border whitespace-nowrap transition ${selectedCategory === c.id ? 'bg-ink text-white border-ink' : 'bg-surface text-ink border-line'}`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lista de Produtos */}
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {filteredProducts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-muted">Nenhum produto encontrado.</p>
                ) : (
                  filteredProducts.map((p) => {
                    const prep = p.tracks_stock ? dailyPrepStock.find((d) => d.product_id === p.id) : null;
                    const isOut = Boolean(p.tracks_stock && prep && (prep.is_exhausted || prep.current_quantity <= 0));
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={isOut}
                        onClick={() => {
                          setSelectedProduct(p);
                          if (p.allows_doneness) setDoneness('AO_PONTO');
                        }}
                        className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition ${isOut ? 'opacity-40 bg-surface border-line cursor-not-allowed' : 'bg-surface border-line hover:border-brand-500 active:scale-[0.99]'}`}
                      >
                        <div>
                          <p className="font-bold text-base text-ink">{p.name}</p>
                          <p className="text-xs text-ink-muted">
                            {p.tracks_stock && prep ? `${prep.current_quantity} disponíveis no turno` : 'Pronto para preparo'}
                          </p>
                        </div>
                        <span className="font-mono font-bold text-brand-700 text-base">
                          {formatBRL(p.price)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            /* Detalhes do Substituto Selecionado */
            <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-800">Novo produto escolhido</span>
                  <h4 className="text-lg font-bold text-ink leading-tight">{selectedProduct.name}</h4>
                  <p className="font-mono text-sm font-semibold text-brand-700">{formatBRL(selectedProduct.price)} cada</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedProduct(null); setRice(null); }}
                  className="text-xs font-bold text-brand-700 hover:underline px-2 py-1"
                >
                  Alterar produto
                </button>
              </div>

              {/* Ponto da Carne */}
              {selectedProduct.allows_doneness && (
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-bold uppercase text-ink-muted">Ponto da carne</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {DONENESS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDoneness(opt.value)}
                        className={`py-2 rounded-lg text-xs font-bold border transition ${doneness === opt.value ? 'bg-ink text-white border-ink shadow-sm' : 'bg-surface text-ink border-line'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {needsRice && <OptionGroup title={quantity > 1 ? 'Arroz do dia (vale para todos)' : 'Arroz do dia'} hint="obrigatório" options={[...riceOptions, NO_RICE]} value={rice} onChange={setRice} />}

              {/* Observações */}
              {selectedProduct.allows_notes && (
                <div className="space-y-1 pt-1">
                  <label htmlFor="swap-notes" className="text-xs font-bold uppercase text-ink-muted">Observação</label>
                  <input
                    id="swap-notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ex.: Sem farofa, pouco sal..."
                    className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
              )}

              {/* Quantidade */}
              <div className="flex items-center justify-between pt-2 border-t border-brand-100">
                <span className="text-sm font-semibold text-ink">Quantidade</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-lg border border-line bg-surface flex items-center justify-center font-bold text-ink"
                    aria-label="Diminuir"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-8 text-center font-mono font-bold text-lg">{quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="w-9 h-9 rounded-lg border border-brand-200 bg-brand-100 flex items-center justify-center font-bold text-brand-800"
                    aria-label="Aumentar"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Opção de devolução ao estoque se já estava na brasa */}
              {item.status === 'IN_PREPARATION' && (
                <div className="flex items-center justify-between text-xs pt-1 text-ink-secondary">
                  <span>Devolver item cancelado ao estoque do turno?</span>
                  <input
                    type="checkbox"
                    checked={returnStock}
                    onChange={(e) => setReturnStock(e.target.checked)}
                    className="rounded border-line text-brand-600 focus:ring-brand-500 h-4 w-4"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Resumo Financeiro da Troca e Botão de Ação */}
        {selectedProduct && (
          <div className="border-t border-line pt-3 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Ajuste no valor da comanda:</span>
              <span className={`font-mono font-bold ${diff > 0 ? 'text-amber-700' : diff < 0 ? 'text-emerald-700' : 'text-ink'}`}>
                {diff === 0 ? 'Sem diferença' : diff > 0 ? `+ ${formatBRL(diff)}` : `- ${formatBRL(Math.abs(diff))}`}
              </span>
            </div>

            <button
              type="button"
              disabled={submitting || (needsRice && !rice)}
              onClick={() => void handleConfirmSwap()}
              className="w-full py-3.5 rounded-xl bg-brand-700 hover:bg-brand-800 active:scale-[0.98] text-white font-bold transition flex items-center justify-center gap-2 shadow-md disabled:opacity-50 text-base"
            >
              <Check className="w-5 h-5" />
              <span>{submitting ? 'Emitindo cupons...' : needsRice && !rice ? 'Escolha o arroz' : 'Confirmar Troca e Mandar para Produção'}</span>
            </button>
          </div>
        )}

      </div>
    </Dialog>
  );
};
