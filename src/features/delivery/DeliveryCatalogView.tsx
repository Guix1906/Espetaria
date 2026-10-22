import { ArrowRight, Beer, Bike, Clock3, Flame, PackagePlus, Plus, ShoppingBag, Sparkles, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { FilterChip } from '../../components/ui/FilterChip';
import { SearchField } from '../../components/ui/SearchField';
import { getDeliveryStatusConfig } from '../../lib/deliveryStatus';
import { formatBRL } from '../../lib/formatters';
import { getProductAvailability } from '../../lib/productAvailability';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import type { Product } from '../../types/domain';
import type { MeatDoneness } from '../../types/enums';
import { ProductFormModal } from '../products/ProductFormModal';
import { WaiterDonenessModal } from '../waiter/WaiterDonenessModal';
import { DeliveryCartDrawer } from './DeliveryCartDrawer';
import { DeliveryTrackingModal } from './DeliveryTrackingModal';

const categories = [
  { id: 'ALL', label: 'Todos', icon: Sparkles },
  { id: 'ENTRADA', label: 'Entradas', icon: UtensilsCrossed },
  { id: 'ESPETO_C_ACOMP', label: 'Espeto c/ Acompanhamento', icon: Flame },
  { id: 'ESPETO_S_ACOMP', label: 'Espeto s/ Acompanhamento', icon: Flame },
  { id: 'BEBIDA', label: 'Bebidas', icon: Beer },
] as const;

/** publicMode: versão do cliente (link do WhatsApp), sem ações administrativas. */
export function DeliveryCatalogView({ publicMode = false }: { publicMode?: boolean } = {}) {
  const { products, dailyPrepStock, categories: storeCategories } = useStockStore();
  // Entradas = produtos da categoria "Entradas" do cadastro
  const entradaIds = new Set(storeCategories.filter((c) => /^entradas?$/i.test(c.name.trim())).map((c) => c.id));
  const isEntrada = (product: Product) => entradaIds.has(product.category_id);
  const { cart, addToCart, activeTrackingOrder } = useDeliveryStore();
  const { currentShift } = useShiftStore();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [cartError, setCartError] = useState<{ productId: string; message: string } | null>(null);
  const [productForDoneness, setProductForDoneness] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isTrackingOpen, setIsTrackingOpen] = useState(false);
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const isOpen = currentShift?.status === 'ABERTO';
  const query = searchQuery.trim().toLocaleLowerCase('pt-BR');
  const filteredProducts = products.filter((product) => {
    if (!product.active) return false;
    if (query && !`${product.name} ${product.description || ''}`.toLocaleLowerCase('pt-BR').includes(query)) return false;
    if (selectedCategory === 'ALL') return true;
    if (selectedCategory === 'ENTRADA') return isEntrada(product);
    if (selectedCategory === 'ESPETO_C_ACOMP') return product.type === 'ESPETO' && !isEntrada(product) && /acompanhamento|c\/|com\s/i.test(product.name + ' ' + (product.description || ''));
    if (selectedCategory === 'ESPETO_S_ACOMP') return product.type === 'ESPETO' && !isEntrada(product) && !/acompanhamento|c\/|com\s/i.test(product.name + ' ' + (product.description || ''));
    if (selectedCategory === 'BEBIDA') return product.type === 'BEBIDA';
    return product.type === selectedCategory;
  });
  const totalCartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCartPrice = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  const handleProductClick = (product: Product) => {
    setCartError(null);
    try {
      if (product.allows_doneness) setProductForDoneness(product);
      else addToCart(product, 1);
    } catch (error: unknown) {
      setCartError({ productId: product.id, message: error instanceof Error ? error.message : 'Não foi possível adicionar o produto ao carrinho.' });
    }
  };
  const handleConfirmDoneness = (doneness: MeatDoneness | null, notes: string, quantity: number) => {
    if (productForDoneness) addToCart(productForDoneness, quantity, doneness, notes);
  };

  return (
    <div className="page-layout pb-32">
      <section className="catalog-hero">
        <div className="relative z-10 grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-white"><Flame className="h-4 w-4" aria-hidden="true" />Sabor da Carne · Delivery</p>
            <h1 className="max-w-xl text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">Da brasa para<br className="hidden sm:block" /> a sua mesa.</h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-white">Espetos no seu ponto, acompanhamentos da casa e bebidas geladas. Escolha seus favoritos e deixe o resto com a gente.</p>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs font-medium">
              <span className="inline-flex items-center gap-2 rounded border border-white/25 px-3 py-2"><span className={`h-2 w-2 rounded-sm ${isOpen ? 'bg-emerald-300' : 'bg-amber-300'}`} aria-hidden="true" />{isOpen ? 'Aberto para pedidos' : 'Fechado no momento'}</span>
              <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" aria-hidden="true" />Estimativa: 35–50 min</span>
              <span className="inline-flex items-center gap-1.5"><Bike className="h-4 w-4" aria-hidden="true" />Entrega própria</span>
            </div>
          </div>
          <div className="hidden h-48 w-48 rotate-12 items-center justify-center rounded-sm border border-white/15 bg-white/5 lg:flex" aria-hidden="true"><div className="flex h-36 w-36 -rotate-12 items-center justify-center rounded-sm border border-white/20 bg-white/5"><UtensilsCrossed className="h-16 w-16 text-white" strokeWidth={1.2} /></div></div>
        </div>
      </section>

      {/* Aviso só para pedido em andamento: cancelado/entregue não aparece para o cliente */}
      {activeTrackingOrder && activeTrackingOrder.status !== 'CANCELLED' && activeTrackingOrder.status !== 'DELIVERED' && <button type="button" onClick={() => setIsTrackingOpen(true)} className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-left text-brand-900"><span className="flex items-center gap-3"><Bike className="h-5 w-5 shrink-0" aria-hidden="true" /><span><span className="block text-sm font-semibold">Pedido #{activeTrackingOrder.order_number}: {getDeliveryStatusConfig(activeTrackingOrder.status).label}</span><span className="mt-0.5 block text-xs text-ink-secondary">{getDeliveryStatusConfig(activeTrackingOrder.status).description}</span></span></span><span className="flex items-center gap-2 text-sm font-semibold">Ver pedido<ArrowRight className="h-4 w-4" aria-hidden="true" /></span></button>}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="eyebrow">Feito com capricho</p>
          <h2 className="text-2xl font-bold text-ink">Nosso cardápio</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <SearchField value={searchQuery} onChange={setSearchQuery} label="Buscar no cardápio digital" placeholder="O que você quer comer hoje?" className="w-full sm:w-72" />
          {!publicMode && <button
            type="button"
            onClick={() => setIsNewProductModalOpen(true)}
            className="btn-secondary shrink-0 text-xs py-2.5 px-3"
            title="Cadastrar novo item no cardápio digital"
          >
            <PackagePlus className="h-4 w-4 text-brand-700" />
            <span className="hidden sm:inline">Novo Produto</span>
          </button>}
        </div>
      </div>
      {/* Cardápio já abre completo (sem botão "Ver cardápio completo") */}
      {(
        <>
          <div className="filter-bar" aria-label="Categorias do cardápio digital">{categories.map(({ id, label, icon: Icon }) => <FilterChip key={id} active={selectedCategory === id} onClick={() => setSelectedCategory(id)}><Icon className="h-4 w-4" aria-hidden="true" />{label}</FilterChip>)}</div>

          {filteredProducts.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {filteredProducts.map((product) => {
              const { isAvailable, remaining } = getProductAvailability(product, dailyPrepStock.find((stock) => stock.product_id === product.id));
              const Icon = categories.find((category) => category.id === product.type)?.icon || UtensilsCrossed;
              return <article key={product.id} className={`product-card justify-between ${!isAvailable ? 'border-dashed bg-surface-soft' : ''}`}>
                <div className="flex items-start gap-4"><div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${product.type === 'BEBIDA' ? 'bg-sky-50 text-sky-700' : product.type === 'SOBREMESA' ? 'bg-rose-50 text-rose-700' : 'bg-accent-50 text-accent-700'}`} aria-hidden="true"><Icon className="h-7 w-7" strokeWidth={1.5} /></div><div><h3 className="text-base font-semibold leading-snug text-ink">{product.name}</h3><p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{product.description || 'Preparado com cuidado pela nossa equipe.'}</p></div></div>
                {product.allows_doneness && <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-accent-700"><Flame className="h-3.5 w-3.5" aria-hidden="true" />Você escolhe o ponto da carne</p>}
                {cartError?.productId === product.id && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{cartError.message}</p>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><div><p className="text-xl font-bold text-brand-800 tabular-nums">{formatBRL(product.price)}</p><p className={`mt-1 text-xs ${!isAvailable ? 'font-semibold text-rose-700' : 'text-ink-muted'}`}>{!isAvailable ? 'Indisponível no momento' : remaining !== null && remaining <= 5 ? `Apenas ${remaining} disponíveis` : 'Preparado na hora'}</p></div><button type="button" disabled={!isAvailable} onClick={() => handleProductClick(product)} aria-label={`Adicionar ${product.name} ao carrinho`} className={isAvailable ? 'btn-primary' : 'btn-secondary'}><Plus className="h-4 w-4" aria-hidden="true" />Adicionar</button></div>
              </article>;
            })}
          </div> : <EmptyState title="Não encontramos esse sabor" description="Tente outra busca ou veja todas as opções do nosso cardápio." action={<button type="button" className="btn-secondary" onClick={() => { setSelectedCategory('ALL'); setSearchQuery(''); }}>Ver todo o cardápio</button>} />}
        </>
      )}

      {totalCartCount > 0 && <div className="floating-cart"><button type="button" onClick={() => setIsCartOpen(true)} className="btn-primary mx-auto flex w-full max-w-xl flex-wrap justify-between gap-3 px-5 py-4 shadow-floating"><span className="flex items-center gap-3"><ShoppingBag className="h-5 w-5" aria-hidden="true" /><span className="text-left"><span className="block text-sm font-semibold">Ver meu pedido</span><span className="block text-xs">{totalCartCount} {totalCartCount === 1 ? 'item selecionado' : 'itens selecionados'}</span></span></span><span className="flex items-center gap-3"><span className="text-lg font-bold tabular-nums">{formatBRL(totalCartPrice)}</span><ArrowRight className="h-5 w-5" aria-hidden="true" /></span></button></div>}
      <WaiterDonenessModal product={productForDoneness} isOpen={!!productForDoneness} onClose={() => setProductForDoneness(null)} onConfirm={handleConfirmDoneness} />
      <DeliveryCartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} onOrderPlaced={() => { setIsCartOpen(false); setIsTrackingOpen(true); }} />
      {activeTrackingOrder && <DeliveryTrackingModal order={activeTrackingOrder} isOpen={isTrackingOpen} onClose={() => setIsTrackingOpen(false)} />}
      {!publicMode && <ProductFormModal isOpen={isNewProductModalOpen} onClose={() => setIsNewProductModalOpen(false)} />}
    </div>
  );
}
