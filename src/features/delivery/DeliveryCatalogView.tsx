import React, { useState } from 'react';
import { 
  Flame, 
  Plus, 
  UtensilsCrossed, 
  Beer, 
  CakeSlice, 
  Bike,
  Sparkles
} from 'lucide-react';
import { useStockStore } from '../../stores/useStockStore';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { Product } from '../../types/domain';
import { MeatDoneness } from '../../types/enums';
import { formatBRL } from '../../lib/formatters';
import { WaiterDonenessModal } from '../waiter/WaiterDonenessModal';
import { DeliveryCartDrawer } from './DeliveryCartDrawer';
import { DeliveryTrackingModal } from './DeliveryTrackingModal';

export const DeliveryCatalogView: React.FC = () => {
  const { products, dailyPrepStock } = useStockStore();
  const { cart, addToCart, activeTrackingOrder } = useDeliveryStore();

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [productForDoneness, setProductForDoneness] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);

  // Filtra produtos ativos
  const activeProducts = products.filter((p) => p.active);

  const filteredProducts = activeProducts.filter((p) => {
    if (selectedCategory === 'ALL') return true;
    if (selectedCategory === 'ESPETO') return p.type === 'ESPETO';
    if (selectedCategory === 'PORCAO') return p.type === 'PORCAO';
    if (selectedCategory === 'BEBIDA') return p.type === 'BEBIDA';
    if (selectedCategory === 'SOBREMESA') return p.type === 'SOBREMESA';
    return true;
  });

  const handleProductClick = (product: Product) => {
    const stock = dailyPrepStock.find((s) => s.product_id === product.id);
    const isExhausted = stock ? stock.is_exhausted || stock.current_quantity <= 0 : false;
    if (isExhausted) return;

    if (product.allows_doneness) {
      setProductForDoneness(product);
    } else {
      addToCart(product, 1);
    }
  };

  const handleConfirmDoneness = (doneness: MeatDoneness, notes: string) => {
    if (productForDoneness) {
      addToCart(productForDoneness, 1, doneness, notes);
      setProductForDoneness(null);
    }
  };

  const totalCartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const totalCartPrice = cart.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-28">
      
      {/* Banner de Boas-Vindas e Marca da Espetaria */}
      <div className="bg-gradient-to-b from-amber-950/60 via-slate-900 to-slate-950 border-b border-slate-800 p-4 sm:p-6 text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-amber-600 text-slate-950 flex items-center justify-center mx-auto shadow-lg shadow-amber-950/60">
          <Flame className="w-7 h-7 animate-pulse" />
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider">
          Espetaria Sabor da Carne • Delivery
        </h1>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Espetos nobres na brasa, acompanhamentos da casa e cervejas bem geladas entregues na sua porta.
        </p>

        <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400 font-mono pt-1">
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            Aberto para Pedidos
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Bike className="w-3.5 h-3.5 text-amber-400" />
            Entrega: 35–50 min
          </span>
        </div>
      </div>

      {/* Alerta de Pedido em Andamento (Se houver) */}
      {activeTrackingOrder && activeTrackingOrder.status !== 'DELIVERED' && (
        <div className="max-w-4xl mx-auto w-full px-3 pt-3">
          <div
            onClick={() => setIsTrackingOpen(true)}
            className="p-3 rounded-2xl bg-gradient-to-r from-emerald-950/80 to-slate-900 border border-emerald-600/80 text-emerald-300 text-xs flex items-center justify-between cursor-pointer hover:border-emerald-500 transition shadow-lg shadow-emerald-950/40"
          >
            <div className="flex items-center gap-2">
              <Bike className="w-4 h-4 text-emerald-400 animate-bounce" />
              <span className="font-bold">
                Seu pedido #{activeTrackingOrder.order_number} está sendo preparado!
              </span>
            </div>
            <span className="text-[11px] underline font-bold">Acompanhar ao Vivo &rarr;</span>
          </div>
        </div>
      )}

      {/* Categorias */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 px-3 py-2.5">
        <div className="max-w-4xl mx-auto flex items-center gap-2 overflow-x-auto scrollbar-none text-xs">
          {[
            { id: 'ALL', label: 'Cardápio Completo', icon: Sparkles },
            { id: 'ESPETO', label: 'Espetos na Brasa', icon: Flame },
            { id: 'PORCAO', label: 'Porções & Cubas', icon: UtensilsCrossed },
            { id: 'BEBIDA', label: 'Cervejas & Bebidas', icon: Beer },
            { id: 'SOBREMESA', label: 'Sobremesas', icon: CakeSlice },
          ].map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-2 rounded-xl font-bold transition flex items-center gap-1.5 whitespace-nowrap active:scale-95 ${
                  isSelected
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-950/50'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grade de Produtos */}
      <div className="max-w-4xl mx-auto w-full px-3 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {filteredProducts.map((product) => {
            const stock = dailyPrepStock.find((s) => s.product_id === product.id);
            const isExhausted = stock ? stock.is_exhausted || stock.current_quantity <= 0 : false;
            const remaining = stock ? stock.current_quantity : null;

            return (
              <div
                key={product.id}
                onClick={() => !isExhausted && handleProductClick(product)}
                className={`p-4 rounded-3xl border transition flex flex-col justify-between select-none ${
                  isExhausted
                    ? 'bg-slate-900/40 border-slate-800/80 opacity-60 cursor-not-allowed'
                    : 'bg-slate-900/90 border-slate-800 hover:border-amber-500/60 cursor-pointer shadow-lg active:scale-[0.99]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-extrabold text-white text-base leading-snug">
                      {product.name}
                    </h3>
                    <span className="font-mono font-black text-amber-400 text-base shrink-0">
                      {formatBRL(product.price)}
                    </span>
                  </div>

                  {product.description && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {product.description}
                    </p>
                  )}

                  {product.allows_doneness && (
                    <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-800 font-mono">
                      Você escolhe o ponto da carne
                    </span>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                  {isExhausted ? (
                    <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider font-mono">
                      Esgotado nesta noite
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500 font-mono">
                      {remaining !== null && remaining <= 5
                        ? `Apenas ${remaining} restantes!`
                        : 'Disponível na brasa'}
                    </span>
                  )}

                  <button
                    disabled={isExhausted}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 transition ${
                      isExhausted
                        ? 'bg-slate-800 text-slate-500'
                        : 'bg-amber-600 hover:bg-amber-500 text-slate-950 shadow-md shadow-amber-950/40'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Barra Flutuante do Carrinho (Floating Bottom Bar) */}
      {totalCartCount > 0 && (
        <div className="fixed bottom-3 inset-x-3 sm:inset-x-auto sm:right-6 sm:w-96 z-40">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full p-4 rounded-2xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black transition active:scale-95 shadow-2xl shadow-amber-950/80 flex items-center justify-between animate-in fade-in slide-in-from-bottom-3"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-slate-950 text-amber-400 flex items-center justify-center font-bold text-xs">
                {totalCartCount}
              </div>
              <div className="text-left leading-tight">
                <div className="text-xs uppercase tracking-wider font-bold text-slate-950/80">Ver Carrinho</div>
                <div className="text-sm font-black">{formatBRL(totalCartPrice)}</div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-xs uppercase tracking-wider">
              <span>Avançar</span>
              <span>&rarr;</span>
            </div>
          </button>
        </div>
      )}

      {/* Modal de Escolha do Ponto da Carne */}
      <WaiterDonenessModal
        product={productForDoneness}
        isOpen={!!productForDoneness}
        onClose={() => setProductForDoneness(null)}
        onConfirm={handleConfirmDoneness}
      />

      {/* Drawer do Carrinho de Delivery */}
      <DeliveryCartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onOrderPlaced={() => {
          setIsCartOpen(false);
          setIsTrackingOpen(true);
        }}
      />

      {/* Modal de Acompanhamento do Pedido */}
      {activeTrackingOrder && (
        <DeliveryTrackingModal
          order={activeTrackingOrder}
          isOpen={isTrackingOpen}
          onClose={() => setIsTrackingOpen(false)}
        />
      )}

    </div>
  );
};
