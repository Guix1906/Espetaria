import { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Flame, Plus, Receipt, ShoppingBag, X } from 'lucide-react';
import { useStockStore } from '../../stores/useStockStore';
import { useCartStore } from '../../stores/useCartStore';
import { useTableStore } from '../../stores/useTableStore';
import type { RestaurantTable, Product } from '../../types/domain';
import type { MeatDoneness } from '../../types/enums';
import { formatBRL } from '../../lib/formatters';
import { getProductAvailability } from '../../lib/productAvailability';
import { SearchField } from '../../components/ui/SearchField';
import { FilterChip } from '../../components/ui/FilterChip';
import { EmptyState } from '../../components/ui/EmptyState';
import { WaiterDonenessModal } from './WaiterDonenessModal';
import { WaiterCartDrawer } from './WaiterCartDrawer';
import { WaiterViewTab } from './WaiterViewTab';

interface WaiterOrderPadProps { table: RestaurantTable; onBackToTables: () => void; }
const categories = [{ id: 'ALL', name: 'Todos' }, { id: 'cat-1', name: 'Espetos nobres' }, { id: 'cat-2', name: 'Tradicionais' }, { id: 'cat-3', name: 'Acompanhamentos' }, { id: 'cat-4', name: 'Bebidas' }, { id: 'cat-5', name: 'Sobremesas' }];

export function WaiterOrderPad({ table, onBackToTables }: WaiterOrderPadProps) {
  const { products, dailyPrepStock } = useStockStore();
  const { addItem, getCartItemsCount, getCartTotal } = useCartStore();
  const { tabs } = useTableStore();
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [isViewTabOpen, setIsViewTabOpen] = useState(false);
  const [orderSent, setOrderSent] = useState(false);
  const activeTab = tabs.find((tab) => tab.table_id === table.id && tab.status === 'OPEN');
  const cartCount = getCartItemsCount(table.id);
  const cartTotal = getCartTotal(table.id);
  const query = searchQuery.trim().toLocaleLowerCase('pt-BR');
  const filteredProducts = products.filter((product) => product.active && (selectedCategory === 'ALL' || product.category_id === selectedCategory) && product.name.toLocaleLowerCase('pt-BR').includes(query));

  const handleProductTap = (product: Product) => {
    setOrderSent(false);
    if (product.allows_doneness) setModalProduct(product);
    else addItem(table.id, product, 1);
  };
  const handleDonenessConfirm = (doneness: MeatDoneness, notes: string, quantity: number) => {
    if (modalProduct) addItem(table.id, modalProduct, quantity, doneness, notes);
  };

  return (
    <div className="min-w-0 pb-28">
      <div className="subnav-sticky px-4 py-3 sm:px-6 xl:px-8">
        <div className="mx-auto flex max-w-[1536px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><button type="button" onClick={onBackToTables} className="icon-button" aria-label="Voltar às mesas"><ArrowLeft className="h-5 w-5" /></button><div><h1 className="text-xl font-bold tracking-tight text-ink">Mesa {String(table.number).padStart(2, '0')}</h1><p className="text-xs text-ink-muted">{activeTab?.customer_name || 'Comanda aberta'}</p></div></div>
          <button type="button" onClick={() => setIsViewTabOpen(true)} className="btn-secondary"><Receipt className="h-4 w-4" aria-hidden="true" /><span>Ver consumo <span className="ml-1 font-bold text-ink tabular-nums">{formatBRL(activeTab?.total)}</span></span></button>
        </div>
      </div>
      <div className="page-layout">
        {orderSent && <div role="status" className="notice items-center justify-between border-emerald-200 bg-emerald-50 text-emerald-800"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /><span>Pedido enviado à produção. Acompanhe em <strong>Ver consumo</strong>.</span></div><button type="button" className="icon-button border-emerald-200 bg-emerald-50 text-emerald-800" onClick={() => setOrderSent(false)} aria-label="Dispensar confirmação"><X className="h-4 w-4" /></button></div>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold">O que vamos servir?</h2><p className="mt-1 text-sm text-ink-muted">Toque em um produto para adicionar ao pedido.</p></div><SearchField value={searchQuery} onChange={setSearchQuery} label="Buscar produto no cardápio" placeholder="Buscar espeto, porção ou bebida" className="w-full sm:w-80" /></div>
        <div className="filter-bar" aria-label="Categorias do cardápio">{categories.map((category) => <FilterChip key={category.id} active={selectedCategory === category.id} onClick={() => setSelectedCategory(category.id)}>{category.name}</FilterChip>)}</div>
        {filteredProducts.length ? <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredProducts.map((product) => {
            const { isAvailable, remaining } = getProductAvailability(product, dailyPrepStock.find((stock) => stock.product_id === product.id));
            return <button key={product.id} type="button" disabled={!isAvailable} onClick={() => handleProductTap(product)} className={`product-card min-h-[176px] justify-between ${!isAvailable ? 'border-dashed bg-surface-soft' : ''}`} aria-label={`${product.name}, ${formatBRL(product.price)}. ${isAvailable ? 'Adicionar ao pedido' : 'Indisponível'}`}>
              <div><div className="mb-3 flex items-center justify-between gap-2"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${isAvailable ? 'bg-accent-50 text-accent-700' : 'bg-surface-muted text-ink-muted'}`}><Flame className="h-4 w-4" aria-hidden="true" /></span>{!isAvailable && <span className="status-badge border-rose-200 bg-rose-50 text-rose-700">Indisponível</span>}</div><h3 className="text-sm font-semibold leading-relaxed text-ink">{product.name}</h3><p className="mt-1 min-h-[18px] text-xs text-ink-muted">{product.allows_doneness ? 'Escolha o ponto da carne' : 'Adicionar com um toque'}</p></div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3"><div><span className="text-lg font-bold text-brand-800 tabular-nums">{formatBRL(product.price)}</span>{remaining !== null && <span className="mt-0.5 block text-xs text-ink-muted">{remaining} disponíveis</span>}</div>{isAvailable && <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-800"><Plus className="h-5 w-5" aria-hidden="true" /></span>}</div>
            </button>;
          })}
        </div> : <EmptyState title="Nenhum produto encontrado" description="Tente outro nome ou escolha uma categoria diferente." action={<button type="button" className="btn-secondary" onClick={() => { setSelectedCategory('ALL'); setSearchQuery(''); }}>Limpar filtros</button>} />}
      </div>
      {cartCount > 0 && <div className="floating-cart"><button type="button" onClick={() => setIsCartDrawerOpen(true)} className="btn-primary mx-auto flex w-full max-w-2xl flex-wrap justify-between gap-3 px-4 py-4 shadow-floating"><span className="flex items-center gap-3"><ShoppingBag className="h-5 w-5" aria-hidden="true" /><span className="text-left"><span className="block font-semibold">Revisar pedido</span><span className="block text-xs text-white">{cartCount} {cartCount === 1 ? 'item no rascunho' : 'itens no rascunho'}</span></span></span><span className="flex items-center gap-3"><span className="text-lg font-bold tabular-nums">{formatBRL(cartTotal)}</span><ArrowRight className="h-5 w-5" aria-hidden="true" /></span></button></div>}
      <WaiterDonenessModal product={modalProduct} isOpen={!!modalProduct} onClose={() => setModalProduct(null)} onConfirm={handleDonenessConfirm} />
      <WaiterCartDrawer table={table} isOpen={isCartDrawerOpen} onClose={() => setIsCartDrawerOpen(false)} onSuccess={() => setOrderSent(true)} />
      <WaiterViewTab table={table} isOpen={isViewTabOpen} onClose={() => setIsViewTabOpen(false)} onRequestBill={() => { useTableStore.getState().requestBill(table.id); setIsViewTabOpen(false); }} />
    </div>
  );
}
