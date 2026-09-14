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
    <div className="flex flex-col min-h-screen bg-[#090a0f] text-stone-100 pb-28">
      
      {/* Barra de Topo do Bloco de Pedidos */}
      <div className="sticky top-0 z-30 bg-[#090a0f]/95 backdrop-blur-xl border-b border-white/10 px-3 sm:px-6 py-2.5 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToTables}
              className="p-2.5 rounded-2xl bg-[#14151f] hover:bg-[#1e202f] border border-white/10 text-stone-300 hover:text-white transition active:scale-95 shadow-sm"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-xl text-white leading-none">
                  Mesa {String(table.number).padStart(2, '0')}
                </span>
                <span className="text-[10px] uppercase font-black tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 truncate max-w-[140px]">
                  {activeTab?.customer_name || 'Comanda Aberta'}
                </span>
              </div>
              <p className="text-[11px] text-stone-400 mt-1">
                Total acumulado: <strong className="text-amber-400 font-mono font-bold text-xs">{formatBRL(activeTab?.total)}</strong>
              </p>
            </div>
          </div>

          {/* Botão de Ver Conta Atual da Mesa */}
          <button
            onClick={() => setIsViewTabOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#14151f] hover:bg-[#1e202f] border border-white/15 text-stone-200 text-xs font-bold transition active:scale-95 shadow-sm"
          >
            <Receipt className="w-4 h-4 text-amber-400" />
            <span className="hidden xs:inline">Ver Consumo</span>
          </button>

        </div>
      </div>

      <div className="max-w-5xl mx-auto w-full p-3 sm:p-5 space-y-4 flex-1">
        
        {/* Barra de Busca Rápida */}
        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar espeto nobre, porção, bebida gelada..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#14151f] border border-white/10 rounded-2xl pl-10 pr-4 py-3 text-sm text-white placeholder-stone-500 focus:outline-none focus:border-orange-500 transition shadow-inner"
          />
        </div>

        {/* Categorias Deslizantes em Pílulas */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold transition whitespace-nowrap active:scale-95 ${
                selectedCategory === cat.id
                  ? 'bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/25 font-black'
                  : 'bg-[#14151f] border border-white/10 text-stone-400 hover:text-white hover:bg-[#181a26]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Grade de Produtos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
          {filteredProducts.map((prod) => {
            const daily = dailyPrepStock.find((s) => s.product_id === prod.id);
            const isExhausted = !prod.available || (daily && (daily.is_exhausted || daily.current_quantity <= 0));

            return (
              <button
                key={prod.id}
                disabled={Boolean(isExhausted)}
                onClick={() => handleProductTap(prod)}
                className={`relative p-3.5 sm:p-4 rounded-3xl border text-left transition flex flex-col justify-between min-h-[110px] active:scale-[0.97] shadow-lg ${
                  isExhausted
                    ? 'bg-[#14151f]/40 border-white/5 opacity-50 cursor-not-allowed'
                    : 'bg-[#14151f] border-white/10 hover:border-orange-500/40 hover:bg-[#181a26]'
                }`}
              >
                {/* Topo do Card de Produto */}
                <div>
                  <div className="flex items-start justify-between gap-1.5">
                    <span className="font-bold text-white text-xs sm:text-sm leading-snug line-clamp-2">
                      {prod.name}
                    </span>
                    {isExhausted && (
                      <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-400 shrink-0">
                        ESGOTADO
                      </span>
                    )}
                  </div>
                  {prod.allows_doneness && !isExhausted && (
                    <span className="text-[10px] text-orange-400 flex items-center gap-1 mt-1 font-semibold">
                      <Flame className="w-3 h-3 text-orange-500" /> Ponto da carne
                    </span>
                  )}
                </div>

                {/* Preço e Saldo Restante */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
                  <span className="text-amber-400 font-mono font-black text-sm sm:text-base">
                    {formatBRL(prod.price)}
                  </span>

                  {daily && !isExhausted && (
                    <span className="text-[10px] font-mono text-stone-400">
                      Resta: <strong className="text-stone-200 font-bold">{daily.current_quantity}</strong>
                    </span>
                  )}

                  {!isExhausted && (
                    <div className="w-7 h-7 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center hover:bg-orange-500 hover:text-white transition">
                      <Plus className="w-4 h-4" />
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
        <div className="fixed bottom-0 inset-x-0 z-40 p-3 bg-gradient-to-t from-[#090a0f] via-[#090a0f]/95 to-transparent">
          <div className="max-w-xl mx-auto">
            <button
              onClick={() => setIsCartDrawerOpen(true)}
              className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-600 to-orange-600 hover:brightness-110 text-white font-bold text-sm shadow-2xl shadow-orange-500/30 active:scale-[0.98] transition flex items-center justify-between border border-white/20"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-black/30 flex items-center justify-center font-mono font-black text-sm text-white">
                  {cartCount}
                </div>
                <span className="font-extrabold tracking-wide">Itens no Rascunho</span>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono font-black text-lg text-white">{formatBRL(cartTotal)}</span>
                <span className="text-xs px-3 py-1 rounded-xl bg-black/30 uppercase font-black tracking-wider text-amber-200">
                  Revisar ➔
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
