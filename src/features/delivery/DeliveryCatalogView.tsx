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
    <div className="min-h-screen bg-obsidian-950 text-obsidian-100 flex flex-col font-sans pb-28">
      
      {/* Banner de Boas-Vindas e Marca da Espetaria */}
      <div className="bg-gradient-to-b from-carbon-900 via-carbon-900/90 to-obsidian-950 border-b border-carbon-800 p-5 sm:p-7 text-center space-y-2.5">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-ember-600 to-gold-600 text-obsidian-950 flex items-center justify-center mx-auto shadow-xl shadow-ember-950/60">
          <Flame className="w-8 h-8 animate-pulse" />
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider font-serif">
          Espetaria Sabor da Carne • Delivery Oficial
        </h1>
        <p className="text-xs text-obsidian-400 max-w-md mx-auto">
          Espetos nobres na brasa artesanal, acompanhamentos quentinhos e cervejas bem geladas entregues na sua porta.
        </p>

        <div className="flex items-center justify-center gap-4 text-[11px] text-obsidian-400 font-mono pt-1">
          <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            Brasa Acesa • Aberto para Pedidos
          </span>
          <span>•</span>
          <span className="flex items-center gap-1.5 text-gold-400 font-bold">
            <Bike className="w-3.5 h-3.5" />
            Entrega: 35–50 min
          </span>
        </div>
      </div>

      {/* Alerta de Pedido em Andamento (Se houver) */}
      {activeTrackingOrder && activeTrackingOrder.status !== 'DELIVERED' && (
        <div className="max-w-4xl mx-auto w-full px-3 pt-3">
          <div
            onClick={() => setIsTrackingOpen(true)}
            className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-950/70 via-carbon-900 to-carbon-900 border border-emerald-600/70 text-emerald-300 text-xs flex items-center justify-between cursor-pointer hover:border-emerald-500 transition shadow-lg shadow-emerald-950/40"
          >
            <div className="flex items-center gap-2.5">
              <Bike className="w-4 h-4 text-emerald-400 animate-bounce" />
              <span className="font-bold font-serif">
                Seu pedido #{activeTrackingOrder.order_number} está sendo preparado na brasa!
              </span>
            </div>
            <span className="text-[11px] underline font-bold">Acompanhar ao Vivo &rarr;</span>
          </div>
        </div>
      )}

      {/* Categorias */}
      <div className="sticky top-0 z-20 bg-obsidian-950/95 backdrop-blur-md border-b border-carbon-800 px-3 py-3">
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
                className={`px-4 py-2.5 rounded-2xl font-bold transition flex items-center gap-2 whitespace-nowrap active:scale-95 ${
                  isSelected
                    ? 'btn-ember text-obsidian-950 shadow-lg'
                    : 'bg-carbon-900 text-obsidian-400 border border-carbon-800 hover:text-white hover:border-carbon-700'
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredProducts.map((product) => {
            const stock = dailyPrepStock.find((s) => s.product_id === product.id);
            const isExhausted = stock ? stock.is_exhausted || stock.current_quantity <= 0 : false;
            const remaining = stock ? stock.current_quantity : null;

            return (
              <div
                key={product.id}
                onClick={() => !isExhausted && handleProductClick(product)}
                className={`p-5 rounded-3xl border transition flex flex-col justify-between select-none ${
                  isExhausted
                    ? 'bg-carbon-900/40 border-carbon-800/60 opacity-60 cursor-not-allowed'
                    : 'bg-carbon-900 border-carbon-800 hover:border-ember-500/60 cursor-pointer shadow-xl active:scale-[0.99] group'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-extrabold text-white text-base leading-snug group-hover:text-gold-400 transition">
                      {product.name}
                    </h3>
                    <span className="font-mono font-black text-gold-400 text-base shrink-0">
                      {formatBRL(product.price)}
                    </span>
                  </div>

                  {product.description && (
                    <p className="text-xs text-obsidian-400 mt-1 line-clamp-2">
                      {product.description}
                    </p>
                  )}

                  {product.allows_doneness && (
                    <span className="inline-block mt-2 text-[10px] px-2.5 py-0.5 rounded-full bg-ember-950/60 text-ember-300 border border-ember-800/60 font-mono font-semibold">
                      Você escolhe o ponto da carne
                    </span>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-carbon-800 flex items-center justify-between">
                  {isExhausted ? (
                    <span className="text-[10px] font-bold text-ruby-400 uppercase tracking-wider font-mono">
                      Esgotado nesta noite
                    </span>
                  ) : (
                    <span className="text-[10px] text-obsidian-400 font-mono">
                      {remaining !== null && remaining <= 5
                        ? `Apenas ${remaining} restantes!`
                        : 'Disponível na brasa'}
                    </span>
                  )}

                  <button
                    disabled={isExhausted}
                    className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition active:scale-95 ${
                      isExhausted
                        ? 'bg-carbon-800 text-obsidian-500'
                        : 'btn-ember text-obsidian-950 shadow-md shadow-ember-950/50'
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
        <div className="fixed bottom-4 inset-x-3 sm:inset-x-auto sm:right-6 sm:w-96 z-40">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full p-4 rounded-3xl bg-gradient-to-r from-ember-600 via-ember-500 to-gold-500 text-obsidian-950 font-black transition active:scale-95 shadow-2xl shadow-ember-950/80 flex items-center justify-between animate-in fade-in slide-in-from-bottom-3"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-obsidian-950 text-gold-400 flex items-center justify-center font-bold text-sm shadow-md">
                {totalCartCount}
              </div>
              <div className="text-left leading-tight">
                <div className="text-[11px] uppercase tracking-wider font-bold text-obsidian-950/80">Ver Carrinho</div>
                <div className="text-base font-black font-mono">{formatBRL(totalCartPrice)}</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-extrabold bg-obsidian-950/15 px-3 py-1.5 rounded-xl">
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
