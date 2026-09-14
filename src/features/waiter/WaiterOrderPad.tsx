import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Search, 
  Flame, 
  Plus, 
  Receipt
} from 'lucide-react';
import { useStockStore } from '../../stores/useStockStore';
import { useCartStore } from '../../stores/useCartStore';
import { useTableStore } from '../../stores/useTableStore';
import { RestaurantTable, Product } from '../../types/domain';
import { MeatDoneness } from '../../types/enums';
import { formatBRL } from '../../lib/formatters';
import { WaiterDonenessModal } from './WaiterDonenessModal';
import { WaiterCartDrawer } from './WaiterCartDrawer';
import { WaiterViewTab } from './WaiterViewTab';

interface WaiterOrderPadProps {
  table: RestaurantTable;
  onBackToTables: () => void;
}

export const WaiterOrderPad: React.FC<WaiterOrderPadProps> = ({
  table,
  onBackToTables,
}) => {
  const { products, dailyPrepStock } = useStockStore();
  const { addItem, getCartItemsCount, getCartTotal } = useCartStore();
  const { tabs } = useTableStore();

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modais do Garçom
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [isDonenessModalOpen, setIsDonenessModalOpen] = useState(false);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [isViewTabOpen, setIsViewTabOpen] = useState(false);

  const activeTab = tabs.find((t) => t.table_id === table.id && t.status === 'OPEN');
  const cartCount = getCartItemsCount(table.id);
  const cartTotal = getCartTotal(table.id);

  // Categorias únicas existentes
  const categories = [
    { id: 'ALL', name: 'Todos' },
    { id: 'cat-1', name: 'Espetos Nobres' },
    { id: 'cat-2', name: 'Tradicionais' },
    { id: 'cat-3', name: 'Acompanhamentos' },
    { id: 'cat-4', name: 'Bebidas' },
    { id: 'cat-5', name: 'Sobremesas' },
  ];

  const handleProductTap = (product: Product) => {
    // Se exige seleção de ponto de carne, abre o modal de ponto
    if (product.allows_doneness) {
      setModalProduct(product);
      setIsDonenessModalOpen(true);
    } else {
      // Adiciona 1 unidade diretamente ao rascunho da mesa
      addItem(table.id, product, 1);
    }
  };

  const handleDonenessConfirm = (doneness: MeatDoneness, notes: string, quantity: number) => {
    if (!modalProduct) return;
    addItem(table.id, modalProduct, quantity, doneness, notes);
    setModalProduct(null);
  };

  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'ALL' || p.category_id === selectedCategory;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 pb-24">
      
      {/* Barra de Topo do Bloco de Pedidos */}
      <div className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-3 py-2.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          
          <div className="flex items-center gap-2">
            <button
              onClick={onBackToTables}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-lg text-white font-mono leading-none">
                  Mesa {String(table.number).padStart(2, '0')}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-semibold truncate max-w-[120px]">
                  {activeTab?.customer_name || 'Comanda'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Total mesa: <strong className="text-amber-400 font-mono">{formatBRL(activeTab?.total)}</strong>
              </p>
            </div>
          </div>

          {/* Botão de Ver Conta Atual da Mesa */}
          <button
            onClick={() => setIsViewTabOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition active:scale-95 shadow"
          >
            <Receipt className="w-4 h-4 text-amber-400" />
            <span className="hidden xs:inline">Ver Consumo</span>
          </button>

        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full p-3 sm:p-4 space-y-3 flex-1">
        
        {/* Barra de Busca Rápida */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar espeto, porção ou bebida..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
          />
        </div>

        {/* Categorias Deslizantes em Pílulas */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap active:scale-95 ${
                selectedCategory === cat.id
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-950/50'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Grade de Produtos (Alvos de Toque Grandes) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
          {filteredProducts.map((prod) => {
            const daily = dailyPrepStock.find((s) => s.product_id === prod.id);
            const isExhausted = !prod.available || (daily && (daily.is_exhausted || daily.current_quantity <= 0));

            return (
              <button
                key={prod.id}
                disabled={Boolean(isExhausted)}
                onClick={() => handleProductTap(prod)}
                className={`relative p-3 sm:p-3.5 rounded-2xl border text-left transition flex flex-col justify-between min-h-[96px] active:scale-[0.97] ${
                  isExhausted
                    ? 'bg-slate-900/40 border-slate-800/40 opacity-50 cursor-not-allowed'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700 shadow-md shadow-black/20'
                }`}
              >
                {/* Topo do Card de Produto */}
                <div>
                  <div className="flex items-start justify-between gap-1">
                    <span className="font-bold text-white text-xs sm:text-sm leading-tight line-clamp-2">
                      {prod.name}
                    </span>
                    {isExhausted && (
                      <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded bg-rose-950 border border-rose-800 text-rose-400 shrink-0">
                        ESGOTADO
                      </span>
                    )}
                  </div>
                  {prod.allows_doneness && !isExhausted && (
                    <span className="text-[10px] text-rose-400 flex items-center gap-0.5 mt-0.5 font-medium">
                      <Flame className="w-3 h-3" /> Ponto da carne
                    </span>
                  )}
                </div>

                {/* Preço e Saldo Restante */}
                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-800/60">
                  <span className="text-amber-400 font-mono font-bold text-xs sm:text-sm">
                    {formatBRL(prod.price)}
                  </span>

                  {daily && !isExhausted && (
                    <span className="text-[10px] font-mono text-slate-400">
                      Resta: <strong className="text-slate-200">{daily.current_quantity}</strong>
                    </span>
                  )}

                  {!isExhausted && (
                    <div className="w-6 h-6 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center">
                      <Plus className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

      </div>

      {/* BARRA FLUTUANTE DE CARRINHO (STICKY BOTTOM) */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-3 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent">
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => setIsCartDrawerOpen(true)}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-600 via-rose-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-bold text-sm shadow-2xl shadow-rose-950/80 active:scale-[0.98] transition flex items-center justify-between"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-black/30 flex items-center justify-center font-mono font-black text-sm">
                  {cartCount}
                </div>
                <span>Itens Selecionados</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-base">{formatBRL(cartTotal)}</span>
                <span className="text-xs px-2.5 py-1 rounded-xl bg-white/20 uppercase font-extrabold tracking-wide">
                  Revisar Pedido ➔
                </span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Modal de Ponto da Carne */}
      <WaiterDonenessModal
        product={modalProduct}
        isOpen={isDonenessModalOpen}
        onClose={() => {
          setIsDonenessModalOpen(false);
          setModalProduct(null);
        }}
        onConfirm={handleDonenessConfirm}
      />

      {/* Drawer de Revisão do Pedido */}
      <WaiterCartDrawer
        table={table}
        isOpen={isCartDrawerOpen}
        onClose={() => setIsCartDrawerOpen(false)}
        onSuccess={() => {
          alert('Pedido lançado com sucesso na churrasqueira e cozinha!');
        }}
      />

      {/* Modal de Extrato e Conta da Mesa */}
      <WaiterViewTab
        table={table}
        isOpen={isViewTabOpen}
        onClose={() => setIsViewTabOpen(false)}
        onRequestBill={() => {
          useTableStore.getState().requestBill(table.id);
          setIsViewTabOpen(false);
        }}
      />

    </div>
  );
};
