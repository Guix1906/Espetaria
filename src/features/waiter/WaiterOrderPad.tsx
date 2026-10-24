import { StatusTag } from '../../components/ui/StatusTag';
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

  const { notify, requestChoice } = useFeedback();
  /** Rola até a busca do cardápio, descontando o cabeçalho fixo (sem scrollIntoView). */
  const scrollToCatalog = () => {
    const el = document.getElementById('waiter-catalog');
    if (!el) return;
    const header = (document.querySelector('.subnav-sticky') as HTMLElement | null)?.offsetHeight ?? 0;
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - header - 8), behavior: 'smooth' });
  };
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
    if (level === 'low') return { text: left === 1 ? 'resta 1' : `restam ${left}`, cls: 'font-semibold text-amber-700' };
    if (level === 'ok') return { text: `${left} disponíveis`, cls: 'text-ink-muted' };
    return null;
  };

  return (
    <div className="min-w-0 pb-32">
      <div className="subnav-sticky bg-canvas px-3 py-2 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <button type="button" onClick={onBackToTables} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink" aria-label="Voltar às mesas"><ArrowLeft className="h-5 w-5" /></button>
            <div className="min-w-0">
              <h1 className="truncate font-mono text-xl font-bold leading-tight text-ink">Mesa {pad2(table.number)}</h1>
              {subtitle && <p className="truncate text-[13px] text-ink-muted">{subtitle}</p>}
            </div>
          </div>
          <button type="button" onClick={() => setIsViewTabOpen(true)} className="flex min-h-[44px] shrink-0 flex-col items-end justify-center rounded-md border border-line-strong bg-surface px-2.5 py-1 text-right active:bg-surface-muted" aria-label={`Ver consumo e conta: ${formatBRL(activeTab?.total)}`}>
            <span className="text-[13px] font-semibold text-brand-700">Ver conta ›</span>
            <span className="font-mono text-[15px] font-bold text-ink">{formatBRL(activeTab?.total)}</span>
          </button>
        </div>
        <div className="mx-auto mt-2 flex max-w-5xl flex-nowrap gap-1.5 overflow-x-auto pb-0.5" aria-label="Categorias do cardápio">
          {[{ id: TOP, name: 'Mais pedidos' }, ...categories].map((category) => (
            <button key={category.id} type="button" aria-pressed={selectedCategory === category.id && !query} onClick={() => { setSelectedCategory(category.id); setSearchQuery(''); scrollToCatalog(); }}
              className={`h-12 shrink-0 whitespace-nowrap rounded-md border px-4 text-[18px] font-semibold ${selectedCategory === category.id && !query ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink'}`}>
              {category.id === TOP ? category.name : shortCategoryName(category.name)}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-5xl space-y-3 px-3 pt-3 sm:px-6">
        {/* Um aviso só, o mais importante: encerrada > trocando > enviado > conta pedida */}
        {!activeTab ? <p role="alert" className="notice border-rose-200 bg-rose-50 text-rose-800">Esta comanda foi encerrada. Volte às mesas para iniciar outro atendimento.</p>
          : swapping ? <p role="status" className="notice border-brand-200 bg-brand-50 text-brand-900">Trocando <strong>{swapping}</strong>: escolha o item substituto e envie o pedido.</p>
          : orderSent ? <div role="status" className="notice items-center justify-between border-emerald-200 bg-emerald-50 text-emerald-800"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /><span>Pedido enviado à produção.</span></div><button type="button" className="icon-button bg-emerald-50 text-emerald-800" onClick={() => setOrderSent(false)} aria-label="Dispensar confirmação"><X className="h-4 w-4" /></button></div>
          : (billRequested || table.status === 'AGUARDANDO_CONTA') ? <p role="status" className="notice border-brand-200 bg-brand-50 text-brand-900">Conta pedida. Aguarde o atendimento do caixa.</p>
          : null}
        {/* Mesa aberta sem nenhum pedido: o garçom pode desfazer (abriu a mesa errada) */}
        {activeTab && cartCount === 0 && !useTableStore.getState().getTabOrderItems(activeTab.id).some((item) => item.status !== 'CANCELLED') && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3.5 py-3">
            <p className="text-[15px] text-ink-secondary">Mesa aberta, ainda sem pedido.</p>
            <button type="button" onClick={async () => {
              const answer = await requestChoice({ title: `Liberar a Mesa ${pad2(table.number)}?`, message: 'Use quando abriu a mesa por engano. Ela volta a ficar livre.', choices: [{ value: 'yes', label: 'Sim, liberar a mesa' }, { value: 'no', label: 'Não, continuar atendendo' }] });
              if (answer !== 'yes') return;
              try { useTableStore.getState().releaseEmptyTab(activeTab.id, currentProfile.id); notify(`Mesa ${pad2(table.number)} liberada.`, 'success'); onBackToTables(); }
              catch (error: unknown) { notify(error instanceof Error ? error.message : 'Não foi possível liberar a mesa.', 'error'); }
            }} className="min-h-[44px] rounded-lg border-2 border-rose-300 bg-white px-3.5 text-[15px] font-semibold text-rose-700 active:bg-rose-50">Liberar mesa</button>
          </div>
        )}
        {activeTab && <TabItemsPanel table={table} onSwap={(item) => { setSwapping(item.product_name); setSearchQuery(''); setSelectedCategory(TOP); scrollToCatalog(); }} />}
        <div id="waiter-catalog" className="flex scroll-mt-32 items-center gap-2">
          <label className="relative block flex-1">
            <span className="sr-only">Buscar produto no cardápio</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar item" className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-10 pr-3 text-base placeholder:text-ink-muted" />
          </label>
          {canManageProducts && <button type="button" onClick={() => setIsProductModalOpen(true)} className="btn-secondary h-11 shrink-0 px-3 text-xs" title="Cadastrar novo produto no cardápio"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Novo produto</span></button>}
        </div>
        {sections.every((s) => !s.rows.length) ? <EmptyState title="Nenhum produto encontrado" description="Tente outro nome ou escolha uma categoria diferente." action={<button type="button" className="btn-secondary" onClick={() => { setSelectedCategory(TOP); setSearchQuery(''); }}>Limpar busca</button>} /> : sections.filter((s) => s.rows.length).map((section) => (
          <section key={section.id} aria-label={section.title} className="space-y-2">
            <h2 className="pt-2 text-[20px] font-bold text-ink">{section.title}</h2>
            <ul className="waiter-products grid grid-cols-1 gap-2 sm:grid-cols-2">
              {section.rows.map(({ product, level, left, inCart }) => {
                const out = level === 'out';
                const blocked = !activeTab || (out && inCart === 0);
                const tag = stockText(level, left, inCart);
                return (
                  <li key={product.id} className={`flex min-h-[88px] items-center gap-3 rounded-xl border px-3.5 py-3 ${inCart ? 'border-brand-200 bg-brand-50' : 'border-line bg-surface'}`}>
                    {product.image_url && (
                      <img src={product.image_url} alt="" loading="lazy" className={`h-14 w-14 shrink-0 rounded-md object-cover ${out && !inCart ? 'opacity-50 grayscale' : ''}`}
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[23px] font-bold leading-tight text-ink">{product.name}</h3>
                      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 text-[19px]">
                        <span className={`font-mono font-semibold text-ink ${out && !inCart ? 'opacity-50' : ''}`}>{formatBRL(product.price)}</span>
                        {tag && (out && !inCart ? <StatusTag kind="alert" className="font-semibold">{tag.text}</StatusTag> : <span className={tag.cls}>{tag.text}</span>)}
                      </p>
                    </div>
                    {inCart > 0 ? (
                      <div className="flex h-[46px] shrink-0 items-center rounded-lg bg-brand-500 text-white">
                        <button type="button" className="flex h-[46px] w-11 items-center justify-center" onClick={() => decrement(product)} aria-label={`Tirar 1 ${product.name}`}><Minus className="h-5 w-5" /></button>
                        <output className="min-w-[1.75rem] text-center font-mono text-lg font-bold" aria-live="polite" aria-label={`${inCart} no pedido`}>{inCart}</output>
                        <button type="button" className="flex h-[46px] w-11 items-center justify-center disabled:opacity-40" disabled={blocked || out} onClick={() => increment(product)} aria-label={`Mais 1 ${product.name}`}><Plus className="h-5 w-5" /></button>
                      </div>
                    ) : !out && (
                      <button type="button" disabled={blocked} onClick={() => handleAdd(product)} className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg border-2 border-brand-500 text-brand-500 active:bg-brand-50 disabled:opacity-40"
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
          <button type="button" onClick={() => setIsCartDrawerOpen(true)} className="flex h-[62px] w-full items-center gap-3 rounded-2xl bg-brand-500 px-3.5 text-white shadow-[0_8px_24px_rgba(80,30,10,0.3)] active:bg-brand-700">
            <span className="flex h-8 min-w-[32px] items-center justify-center rounded-md bg-white px-1.5 font-mono text-base font-bold text-brand-500">{cartCount}</span>
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
