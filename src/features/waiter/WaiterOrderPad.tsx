import { useFeedback } from '../../components/ui/FeedbackProvider';
import { ArrowLeft, ArrowRight, CheckCircle2, Minus, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatBRL } from '../../lib/formatters';
import { getProductAvailability, getStockLevel, type StockLevel } from '../../lib/productAvailability';
import { remainingFor } from '../../lib/comboStock';
import { useAuthStore } from '../../stores/useAuthStore';
import { useCartStore } from '../../stores/useCartStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import type { Product, RestaurantTable } from '../../types/domain';
import type { MeatDoneness } from '../../types/enums';
import { ProductFormModal } from '../products/ProductFormModal';
import { WaiterCartDrawer } from './WaiterCartDrawer';
import { WaiterDonenessModal } from './WaiterDonenessModal';
import { WaiterViewTab } from './WaiterViewTab';
import { TabItemsPanel } from './TabItemsPanel';

const TOP = 'TOP';
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Nomes curtos para os chips de categoria (cabem sem rolagem lateral). */
export function shortCategoryName(name: string) {
  const n = name.trim();
  if (/^espetos?\s+com\s+acompanhamento/i.test(n)) return 'Espetos + acomp.';
  if (/^espetos?\s+sem\s+acompanhamento/i.test(n)) return 'Espetos';
  if (/^acompanhamentos?/i.test(n)) return 'Acompanh.';
  return n.length > 22 ? `${n.slice(0, 21).trimEnd()}.` : n;
}

interface WaiterOrderPadProps { table: RestaurantTable; onBackToTables: () => void; dedicated?: boolean; }

export function WaiterOrderPad({ table, onBackToTables, dedicated = false }: WaiterOrderPadProps) {
  const { currentProfile } = useAuthStore();
  const canManageProducts = !dedicated && ['MASTER', 'GERENTE'].includes(currentProfile.role);
  const { products, dailyPrepStock, categories: storeCategories } = useStockStore();
  const { addItem, updateQuantity, getCart, getCartItemsCount, getCartTotal } = useCartStore();
  const { tabs, orderItems } = useTableStore();
  const [selectedCategory, setSelectedCategory] = useState(TOP);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [isViewTabOpen, setIsViewTabOpen] = useState(false);
  const [orderSent, setOrderSent] = useState(false);
  const [billRequested, setBillRequested] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);
  const activeTab = tabs.find((tab) => tab.table_id === table.id && tab.status === 'OPEN');
  const cart = getCart(table.id);
  const cartCount = getCartItemsCount(table.id);
  const cartTotal = getCartTotal(table.id);
  const query = searchQuery.trim().toLocaleLowerCase('pt-BR');
  const activeProducts = products.filter((product) => product.active);
  const categories = [...storeCategories].sort((a, b) => a.display_order - b.display_order).filter((category) => category.active && activeProducts.some((product) => product.category_id === category.id));
  const byOrder = (a: Product, b: Product) => a.display_order - b.display_order || a.name.localeCompare(b.name, 'pt-BR');

  // "Mais pedidos": os 8 mais lançados (dados carregados do turno); sem dados, os primeiros do cardápio
  const topProducts = useMemo(() => {
    const sold = new Map<string, number>();
    for (const item of orderItems) if (item.status !== 'CANCELLED') sold.set(item.product_id, (sold.get(item.product_id) ?? 0) + item.quantity);
    const ranked = activeProducts.filter((p) => sold.has(p.id)).sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0));
    if (ranked.length >= 4) return ranked.slice(0, 8);
    const fallback = categories.flatMap((category) => activeProducts.filter((p) => p.category_id === category.id).sort(byOrder).slice(0, 3));
    return [...ranked, ...fallback.filter((p) => !ranked.includes(p))].slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderItems, products, storeCategories]);

  // Saldo de cada produto já descontando o rascunho (combo também ocupa espeto e arroz)
  const rowFor = (product: Product) => {
    const { isAvailable } = getProductAvailability(product, dailyPrepStock.find((stock) => stock.product_id === product.id));
    const inCart = cart.filter((item) => item.product.id === product.id).reduce((sum, item) => sum + item.quantity, 0);
    const left = remainingFor(product, products, dailyPrepStock, cart);
    return { product, inCart, left, level: getStockLevel(isAvailable, left) };
  };
  const sortRows = (list: Product[]) => list.map(rowFor).sort((a, b) => Number(a.level === 'out') - Number(b.level === 'out'));

  const sections: { id: string; title: string; rows: ReturnType<typeof rowFor>[] }[] = query
    ? [{ id: 'search', title: 'Resultados', rows: sortRows(activeProducts.filter((p) => p.name.toLocaleLowerCase('pt-BR').includes(query)).sort(byOrder)) }]
    : selectedCategory === TOP
      ? [{ id: TOP, title: 'Mais pedidos', rows: sortRows(topProducts) }, ...categories.map((c) => ({ id: c.id, title: c.name, rows: sortRows(activeProducts.filter((p) => p.category_id === c.id).sort(byOrder)) }))]
      : categories.filter((c) => c.id === selectedCategory).map((c) => ({ id: c.id, title: c.name, rows: sortRows(activeProducts.filter((p) => p.category_id === c.id).sort(byOrder)) }));

  const { notify } = useFeedback();
  const tryAdd = (action: () => void) => {
    try { action(); } catch (error: unknown) { notify(error instanceof Error ? error.message : 'Estoque insuficiente.', 'error'); }
  };
  const handleAdd = (product: Product) => {
    setOrderSent(false);
    setSwapping(null);
    if (product.allows_doneness) setModalProduct(product);
    else tryAdd(() => addItem(table.id, product, 1));
  };
  // No stepper: + repete a última linha do produto (mesmo ponto); − tira da última
  const lastLine = (product: Product) => [...cart].reverse().find((item) => item.product.id === product.id);
  const increment = (product: Product) => { const line = lastLine(product); if (line) tryAdd(() => updateQuantity(table.id, line.id, 1)); else handleAdd(product); };
  const decrement = (product: Product) => { const line = lastLine(product); if (line) updateQuantity(table.id, line.id, -1); };
  const handleDonenessConfirm = (doneness: MeatDoneness | null, notes: string, quantity: number) => {
    if (modalProduct) addItem(table.id, modalProduct, quantity, doneness, notes);
  };

  const subtitle = [activeTab?.customer_name && activeTab.customer_name !== `Mesa ${table.number}` ? activeTab.customer_name : null, activeTab?.people_count ? `${activeTab.people_count} ${activeTab.people_count === 1 ? 'pessoa' : 'pessoas'}` : null].filter(Boolean).join(' · ');
  const stockText = (level: StockLevel, left: number | null, inCart: number) => {
    if (level === 'out') return { text: left === 0 && inCart ? 'Tudo no pedido' : 'Esgotado', cls: 'text-rose-700' };
    if (level === 'low') return { text: left === 1 ? 'resta 1' : `restam ${left}`, cls: 'font-semibold text-[#A06A10]' };
    if (level === 'ok') return { text: `${left} disponíveis`, cls: 'text-[#7A6C62]' };
    return null;
  };

  return (
    <div className="min-w-0 pb-32">
      <div className="subnav-sticky bg-[#F4EEE7] px-3 py-2 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" onClick={onBackToTables} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#D9CEC2] bg-[#FBF8F4] text-[#2A201B]" aria-label="Voltar às mesas"><ArrowLeft className="h-5 w-5" /></button>
            <div className="min-w-0">
              <h1 className="truncate font-mono text-xl font-bold leading-tight text-[#2A201B]">Mesa {pad2(table.number)}</h1>
              {subtitle && <p className="truncate text-[13px] text-[#7A6C62]">{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={() => setIsViewTabOpen(true)} className="flex min-h-[44px] shrink-0 flex-col items-end justify-center px-1 text-right" aria-label={`Ver consumo e conta: ${formatBRL(activeTab?.total)}`}>
            <span className="text-xs text-[#7A6C62]">Conta</span>
            <span className="font-mono text-[15px] font-bold text-[#2A201B]">{formatBRL(activeTab?.total)}</span>
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-5xl space-y-3 px-3 pt-3 sm:px-6">
        {!activeTab && <p role="alert" className="notice border-rose-200 bg-rose-50 text-rose-800">Esta comanda foi encerrada. Volte às mesas para iniciar outro atendimento.</p>}
        {(billRequested || table.status === 'AGUARDANDO_CONTA') && <p role="status" className="notice border-amber-200 bg-amber-50 text-amber-900">Conta solicitada. Aguarde o atendimento do caixa.</p>}
        {orderSent && <div role="status" className="notice items-center justify-between border-emerald-200 bg-emerald-50 text-emerald-800"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /><span>Pedido enviado à produção.</span></div><button type="button" className="icon-button bg-emerald-50 text-emerald-800" onClick={() => setOrderSent(false)} aria-label="Dispensar confirmação"><X className="h-4 w-4" /></button></div>}
        {activeTab && <TabItemsPanel table={table} onSwap={(item) => { setSwapping(item.product_name); setSearchQuery(''); setSelectedCategory(TOP); document.getElementById('waiter-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />}
        {swapping && <p role="status" className="notice border-brand-200 bg-brand-50 text-brand-900">Trocando <strong>{swapping}</strong>: escolha o item substituto e envie o pedido.</p>}
        <div id="waiter-catalog" className="flex scroll-mt-32 items-center gap-2">
          <label className="relative block flex-1">
            <span className="sr-only">Buscar produto no cardápio</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A8B80]" aria-hidden="true" />
            <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar item" className="h-11 w-full rounded-lg border border-[#D9CEC2] bg-[#FBF8F4] pl-10 pr-3 text-base placeholder:text-[#9A8B80]" />
          </label>
          {canManageProducts && <button type="button" onClick={() => setIsProductModalOpen(true)} className="btn-secondary h-11 shrink-0 px-3 text-xs" title="Cadastrar novo produto no cardápio"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Novo Produto</span></button>}
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Categorias do cardápio">
          {[{ id: TOP, name: 'Mais pedidos' }, ...categories].map((category) => (
            <button key={category.id} type="button" aria-pressed={selectedCategory === category.id && !query} onClick={() => { setSelectedCategory(category.id); setSearchQuery(''); }}
              className={`h-[38px] rounded-md border px-3 text-sm font-semibold ${selectedCategory === category.id && !query ? 'border-[#2A201B] bg-[#2A201B] text-white' : 'border-[#E3D9CE] bg-[#FBF8F4] text-[#2A201B]'}`}>
              {category.id === TOP ? category.name : shortCategoryName(category.name)}
            </button>
          ))}
        </div>
        {sections.every((s) => !s.rows.length) ? <EmptyState title="Nenhum produto encontrado" description="Tente outro nome ou escolha uma categoria diferente." action={<button type="button" className="btn-secondary" onClick={() => { setSelectedCategory(TOP); setSearchQuery(''); }}>Limpar busca</button>} /> : sections.filter((s) => s.rows.length).map((section) => (
          <section key={section.id} aria-label={section.title} className="space-y-2">
            <h2 className="pt-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-[#7A6C62]">{section.title}</h2>
            <ul className="waiter-products grid grid-cols-1 gap-2 sm:grid-cols-2">
              {section.rows.map(({ product, level, left, inCart }) => {
                const out = level === 'out';
                const blocked = !activeTab || (out && inCart === 0);
                const tag = stockText(level, left, inCart);
                return (
                  <li key={product.id} className={`flex min-h-[62px] items-center gap-3 rounded-xl border px-3.5 py-2 ${inCart ? 'border-[#E7B49E] bg-[#FCEFE8]' : out ? 'border-dashed border-[#E3D9CE] bg-[#F4EEE7] opacity-70' : 'border-[#E3D9CE] bg-[#FBF8F4]'}`}>
                    <div className="min-w-0 flex-1">
                      <h3 className={`text-base font-semibold leading-snug ${out && !inCart ? 'text-[#7A6C62] line-through' : 'text-[#2A201B]'}`}>{product.name}</h3>
                      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2.5 text-[13px]">
                        <span className="font-mono text-[#5E5048]">{formatBRL(product.price)}</span>
                        {tag && <span className={tag.cls}>{tag.text}</span>}
                      </p>
                    </div>
                    {inCart > 0 ? (
                      <div className="flex h-[46px] shrink-0 items-center rounded-lg bg-[#B5502F] text-white">
                        <button type="button" className="flex h-[46px] w-11 items-center justify-center" onClick={() => decrement(product)} aria-label={`Tirar 1 ${product.name}`}><Minus className="h-5 w-5" /></button>
                        <output className="min-w-[1.75rem] text-center font-mono text-lg font-bold" aria-live="polite" aria-label={`${inCart} no pedido`}>{inCart}</output>
                        <button type="button" className="flex h-[46px] w-11 items-center justify-center disabled:opacity-40" disabled={blocked || out} onClick={() => increment(product)} aria-label={`Mais 1 ${product.name}`}><Plus className="h-5 w-5" /></button>
                      </div>
                    ) : !out && (
                      <button type="button" disabled={blocked} onClick={() => handleAdd(product)} className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-lg border-[1.5px] border-[#B5502F] text-[#B5502F] active:bg-[#F9ECE5] disabled:opacity-40"
                        aria-label={`Adicionar ${product.name}, ${formatBRL(product.price)}${level === 'low' ? `. Restam ${left}` : ''}`}>
                        <Plus className="h-5 w-5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {cartCount > 0 && (
        <div className="fixed inset-x-3 z-30 mx-auto max-w-2xl" style={{ bottom: 'max(26px, calc(env(safe-area-inset-bottom) + 12px))' }}>
          <button type="button" onClick={() => setIsCartDrawerOpen(true)} className="flex h-[62px] w-full items-center gap-3 rounded-[14px] bg-[#B5502F] px-3.5 text-white shadow-[0_8px_24px_rgba(80,30,10,0.3)] active:bg-[#8E3B21]">
            <span className="flex h-8 min-w-[32px] items-center justify-center rounded-md bg-white px-1.5 font-mono text-base font-bold text-[#B5502F]">{cartCount}</span>
            <span className="min-w-0 flex-1 whitespace-nowrap text-left text-[15px] font-semibold xs:text-[17px]">Revisar e enviar</span>
            <span className="whitespace-nowrap font-mono text-[15px] font-bold xs:text-[17px]">{formatBRL(cartTotal)}</span>
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}
      <WaiterDonenessModal product={modalProduct} isOpen={!!modalProduct} onClose={() => setModalProduct(null)} onConfirm={handleDonenessConfirm} maxQuantity={(() => { if (!modalProduct) return undefined; const left = remainingFor(modalProduct, products, dailyPrepStock, cart); return left === null ? undefined : Math.max(1, left); })()} />
      <WaiterCartDrawer table={table} isOpen={isCartDrawerOpen} onClose={() => setIsCartDrawerOpen(false)} onSuccess={() => setOrderSent(true)} />
      <WaiterViewTab table={table} isOpen={isViewTabOpen} onClose={() => setIsViewTabOpen(false)} onRequestBill={() => { useTableStore.getState().requestBill(table.id); setBillRequested(true); setIsViewTabOpen(false); }} />
      {canManageProducts && <ProductFormModal isOpen={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} />}
    </div>
  );
}
