import { StatusTag } from '../../components/ui/StatusTag';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { ArrowLeft, ArrowRight, Beer, CheckCircle2, Flame, Minus, Plus, Search, Star, UtensilsCrossed, X, ArrowLeftRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatBRL } from '../../lib/formatters';
import { getProductAvailability, getStockLevel, productFlavors, type StockLevel } from '../../lib/productAvailability';
import { pairCombos, remainingFor } from '../../lib/comboStock';
import { useAuthStore } from '../../stores/useAuthStore';
import { useCartStore } from '../../stores/useCartStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { triggerHaptic } from '../../lib/haptics';
import type { Product, RestaurantTable } from '../../types/domain';
import type { MeatDoneness } from '../../types/enums';
import { ProductFormModal } from '../products/ProductFormModal';
import { WaiterCartDrawer } from './WaiterCartDrawer';
import { WaiterDonenessModal } from './WaiterDonenessModal';
import { WaiterViewTab } from './WaiterViewTab';
import { TableSettlementModal } from '../cashier/TableSettlementModal';
import { TableTransferModal } from './TableTransferModal';
import { TabItemsPanel } from './TabItemsPanel';
import { optimizeThumbnailUrl } from '../../lib/imageOptimization';

const TOP = 'TOP';
/** Aba Espetos: só os de carne. Assados da categoria Entradas (queijo, pão de alho, cebola) ficam em Porções, como no cardápio digital. */
export function isEspetoProduct(p: Pick<Product, 'type'>, categoryName?: string) {
  return p.type === 'ESPETO' && !/^entradas?$/i.test(categoryName?.trim() ?? '');
}
function isBebidaProduct(p: Product) {
  return p.sector === 'BAR' || p.type === 'BEBIDA' || /bebida|cerveja|suco|refresco|jarra|refrigerante|água|drink|gin|dose|whisky|original|heineken|skol|long neck|red bull/i.test(p.name);
}
export function isPorcaoProduct(p: Product, categoryName?: string) {
  return !isEspetoProduct(p, categoryName) && !isBebidaProduct(p);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Nomes curtos para os chips de categoria (cabem sem rolagem lateral). */
export function shortCategoryName(name: string) {
  const n = name.trim();
  if (/^espetos?\s+com\s+acompanhamento/i.test(n)) return 'Espetos + acomp.';
  if (/^espetos?\s+sem\s+acompanhamento/i.test(n)) return 'Espetos';
  if (/^acompanhamentos?/i.test(n)) return 'Acompanh.';
  return n.length > 22 ? `${n.slice(0, 21).trimEnd()}.` : n;
}

interface WaiterOrderPadProps {
  table: RestaurantTable;
  onBackToTables: () => void;
  dedicated?: boolean;
  onTableTransferred?: (newTable: RestaurantTable) => void;
}

export function WaiterOrderPad({ table, onBackToTables, dedicated = false, onTableTransferred }: WaiterOrderPadProps) {
  const { currentProfile } = useAuthStore();
  const canManageProducts = !dedicated && ['MASTER', 'GERENTE'].includes(currentProfile.role);
  const { products, dailyPrepStock, categories: storeCategories } = useStockStore();
  const { addItem, updateQuantity, getCart, getCartItemsCount, getCartTotal, clearCart } = useCartStore();
  const { tabs, orderItems, addOrderAtomic } = useTableStore();
  const { currentShift } = useShiftStore();
  const [selectedCategory, setSelectedCategory] = useState(TOP);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState(false);
  const [isViewTabOpen, setIsViewTabOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isSettlementOpen, setIsSettlementOpen] = useState(false);
  const [orderSent, setOrderSent] = useState(false);
  const [billRequested, setBillRequested] = useState(false);
  const [showPhotos, setShowPhotos] = useState(() => {
    try { return localStorage.getItem('ponto_waiter_show_photos') !== 'false'; } catch { return true; }
  });
  const togglePhotos = () => {
    setShowPhotos((prev) => {
      const next = !prev;
      try { localStorage.setItem('ponto_waiter_show_photos', String(next)); } catch {}
      return next;
    });
  };

  const [isSendingQuick, setIsSendingQuick] = useState(false);
  const handleQuickSend = () => {
    if (isSendingQuick) return;
    if (!currentShift || currentShift.status !== 'ABERTO') {
      notify('O turno precisa estar aberto para enviar o pedido.', 'error');
      return;
    }
    if (!activeTab) {
      notify('Comanda não encontrada para esta mesa.', 'error');
      return;
    }
    const cartItems = getCart(table.id);
    if (!cartItems.length) {
      notify('Adicione pelo menos um item ao pedido.', 'error');
      return;
    }

    setIsSendingQuick(true);
    triggerHaptic(30);
    try {
      addOrderAtomic(
        currentShift.id,
        activeTab.id,
        cartItems.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          doneness: item.doneness,
          notes: item.notes || undefined,
        })),
        currentProfile.id,
        undefined,
        () => useCartStore.getState().restoreItems(table.id, cartItems)
      );
      clearCart(table.id);
      triggerHaptic(60);
      setOrderSent(true);
      notify('Pedido enviado à produção com sucesso!', 'success');
    } catch (err: unknown) {
      triggerHaptic(80);
      notify(err instanceof Error ? err.message : 'Não foi possível enviar o pedido.', 'error');
    } finally {
      setIsSendingQuick(false);
    }
  };

  const activeTab = tabs.find((tab) => (tab.table_id === table.id || tab.table_id === `table-${table.number}`) && tab.status === 'OPEN');
  // Rascunho esquecido de outra comanda desta mesa não pode sair no pedido do cliente atual
  useEffect(() => {
    if (activeTab) useCartStore.getState().bindCartToTab(table.id, activeTab.id);
  }, [table.id, activeTab?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Abrir a mesa conta como "levou à mesa": o aviso de pronto some sem o botão "Servir"
  useEffect(() => {
    if (!activeTab) return;
    const { getTabOrderItems, markDelivered } = useTableStore.getState();
    getTabOrderItems(activeTab.id).filter((item) => item.status === 'READY').forEach((item) => markDelivered(item.id));
  }, [activeTab?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const cart = getCart(table.id);
  const cartCount = getCartItemsCount(table.id);
  const cartTotal = getCartTotal(table.id);
  const query = searchQuery.trim().toLocaleLowerCase('pt-BR');
  const activeProducts = products.filter((product) => product.active);
  const categories = [...storeCategories].sort((a, b) => a.display_order - b.display_order).filter((category) => category.active && activeProducts.some((product) => product.category_id === category.id));
  const categoryNameOf = (p: Product) => storeCategories.find((c) => c.id === p.category_id)?.name;
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
  // Espeto e "com acompanhamento" usam o mesmo estoque: um cartão só, com as duas opções
  const sortRows = (list: Product[]) => pairCombos(list, activeProducts)
    .map(({ product, combo }) => ({ ...rowFor(product), combo: combo ? rowFor(combo) : null }))
    .sort((a, b) => Number(a.level === 'out' && a.combo?.level !== 'ok' && a.combo?.level !== 'low') - Number(b.level === 'out' && b.combo?.level !== 'ok' && b.combo?.level !== 'low'));

  const sections: { id: string; title: string; rows: ReturnType<typeof sortRows> }[] = query
    ? [{ id: 'search', title: 'Resultados', rows: sortRows(activeProducts.filter((p) => p.name.toLocaleLowerCase('pt-BR').includes(query)).sort(byOrder)) }]
    : selectedCategory === TOP
      ? [{ id: TOP, title: 'Mais pedidos', rows: sortRows(topProducts) }]
      : selectedCategory === 'GROUP_ESPETOS'
        ? [{ id: 'GROUP_ESPETOS', title: 'Espetos', rows: sortRows(activeProducts.filter((p) => isEspetoProduct(p, categoryNameOf(p))).sort(byOrder)) }]
        : selectedCategory === 'GROUP_BEBIDAS'
          ? [{ id: 'GROUP_BEBIDAS', title: 'Bebidas', rows: sortRows(activeProducts.filter(isBebidaProduct).sort(byOrder)) }]
          : selectedCategory === 'GROUP_PORCOES'
            ? [{ id: 'GROUP_PORCOES', title: 'Porções e entradas', rows: sortRows(activeProducts.filter((p) => isPorcaoProduct(p, categoryNameOf(p))).sort(byOrder)) }]
            : selectedCategory === 'ALL'
              ? categories.map((c) => ({ id: c.id, title: c.name, rows: sortRows(activeProducts.filter((p) => p.category_id === c.id).sort(byOrder)) }))
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
    try {
      action();
      triggerHaptic(30);
    } catch (error: unknown) {
      triggerHaptic(80);
      notify(error instanceof Error ? error.message : 'Estoque insuficiente.', 'error');
    }
  };
  const handleAdd = (product: Product) => {
    setOrderSent(false);
    if (product.allows_doneness || /acompanhamento|arroz|suco|refresco|jarra/i.test(product.name) || productFlavors(product.description).length) {
      triggerHaptic(25);
      setModalProduct(product);
    } else {
      tryAdd(() => addItem(table.id, product, 1));
    }
  };
  const lastLine = (product: Product) => [...cart].reverse().find((item) => item.product.id === product.id);
  const increment = (product: Product) => {
    const line = lastLine(product);
    if (line) tryAdd(() => updateQuantity(table.id, line.id, 1));
    else handleAdd(product);
  };
  const decrement = (product: Product) => {
    const line = lastLine(product);
    if (line) {
      triggerHaptic(25);
      updateQuantity(table.id, line.id, -1);
    }
  };
  const handleDonenessConfirm = (doneness: MeatDoneness | null, notes: string, quantity: number, multiDoneness?: { doneness: MeatDoneness | null; quantity: number; notes?: string }[]) => {
    if (!modalProduct) return;
    if (multiDoneness && multiDoneness.length > 0) {
      for (const item of multiDoneness) {
        if (item.quantity > 0) {
          addItem(table.id, modalProduct, item.quantity, item.doneness, item.notes ?? notes);
        }
      }
    } else {
      addItem(table.id, modalProduct, quantity, doneness, notes);
    }
  };

  const subtitle = [activeTab?.customer_name && activeTab.customer_name !== `Mesa ${table.number}` ? activeTab.customer_name : null, activeTab?.people_count ? `${activeTab.people_count} ${activeTab.people_count === 1 ? 'pessoa' : 'pessoas'}` : null].filter(Boolean).join(' · ');
  const stockText = (level: StockLevel, left: number | null, inCart: number) => {
    if (level === 'out') return { text: left === 0 && inCart ? 'Tudo no pedido' : 'Esgotado', cls: 'text-rose-700' };
    if (level === 'low') return { text: left === 1 ? 'resta 1' : `restam ${left}`, cls: 'font-semibold text-amber-700' };
    if (level === 'ok') return { text: `${left} disponíveis`, cls: 'text-ink-muted' };
    return null;
  };

  /** Uma das opções do cartão do espeto: "Só o espeto" ou "Completo". */
  const renderOption = (row: ReturnType<typeof rowFor>, label: string) => {
    const out = row.level === 'out';
    return (
      <div className="min-w-0">
        <button type="button" disabled={!activeTab || out} onClick={() => handleAdd(row.product)} aria-label={`Adicionar ${row.product.name}, ${formatBRL(row.product.price)}`}
          className={`block min-h-[64px] w-full rounded-lg border px-2.5 py-2 text-left transition active:bg-surface-muted disabled:cursor-not-allowed ${out ? 'border-line' : 'border-brand-500'}`}>
          <span className="block text-[15px] font-medium leading-tight text-ink-secondary">{label}</span>
          {out ? <StatusTag kind="alert" className="mt-1 font-semibold">Esgotado</StatusTag> : <span className="mt-0.5 block font-mono text-[18px] font-semibold text-ink">{formatBRL(row.product.price)}</span>}
        </button>
        {row.inCart > 0 && (
          <div className="mt-1.5 flex h-11 items-center justify-between rounded-md bg-brand-500 text-white">
            <button type="button" className="flex h-11 w-10 items-center justify-center active:bg-brand-600" onClick={() => decrement(row.product)} aria-label={`Tirar 1 ${row.product.name}`}><Minus className="h-5 w-5" /></button>
            <output className="min-w-[1.5rem] text-center font-mono text-lg font-bold" aria-live="polite" aria-label={`${row.inCart} no pedido`}>{row.inCart}</output>
            <button type="button" className="flex h-11 w-10 items-center justify-center disabled:opacity-40 active:bg-brand-600" disabled={!activeTab || out} onClick={() => increment(row.product)} aria-label={`Mais 1 ${row.product.name}`}><Plus className="h-5 w-5" /></button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-w-0 pb-32">
      <div className="subnav-sticky bg-canvas px-3 py-2 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5 min-[375px]:gap-2.5">
            <button type="button" onClick={onBackToTables} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-ink" aria-label="Voltar às mesas"><ArrowLeft className="h-5 w-5" /></button>
            {/* O número da mesa nunca é cortado: é o que evita lançar pedido na mesa errada */}
            <div className="min-w-0">
              <h1 className="whitespace-nowrap font-mono text-lg font-bold leading-tight text-ink min-[375px]:text-xl">Mesa {pad2(table.number)}</h1>
              {subtitle && <p className="truncate text-sm text-ink-muted min-[375px]:text-base">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {activeTab && (
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(true)}
                className="flex min-h-[44px] flex-col items-center justify-center rounded-md border border-line-strong bg-surface px-1.5 text-ink active:bg-surface-muted font-semibold text-sm leading-none sm:flex-row sm:gap-1.5 sm:px-3 sm:text-base"
                aria-label="Trocar de mesa"
              >
                <ArrowLeftRight className="h-5 w-5 shrink-0" />
                <span className="mt-0.5 whitespace-nowrap sm:mt-0"><span className="sm:hidden">Trocar</span><span className="hidden sm:inline">Trocar mesa</span></span>
              </button>
            )}
            <button type="button" onClick={() => setIsViewTabOpen(true)} className="flex min-h-[44px] shrink-0 flex-col items-end justify-center rounded-md border border-line-strong bg-surface px-2.5 py-1 text-right active:bg-surface-muted" aria-label={`Ver consumo e conta: ${formatBRL(activeTab?.total)}`}>
              <span className="text-base font-semibold text-brand-700">Ver conta ›</span>
              <span className="font-mono text-[17px] font-bold text-ink">{formatBRL(activeTab?.total)}</span>
            </button>
          </div>
        </div>
        {/* 4 Botões Principais Fixos (Acesso Imediato com o Polegar) */}
        <div className="mx-auto mt-2 grid grid-cols-4 gap-1.5 max-w-5xl" aria-label="Grupos principais">
          {[
            { id: TOP, label: 'Top', icon: Star },
            { id: 'GROUP_ESPETOS', label: 'Espetos', icon: Flame },
            { id: 'GROUP_BEBIDAS', label: 'Bebidas', icon: Beer },
            { id: 'GROUP_PORCOES', label: 'Porções', icon: UtensilsCrossed },
          ].map((grp) => {
            const isGroupActive = selectedCategory === grp.id && !query;
            return (
              <button
                key={grp.id}
                type="button"
                onClick={() => { triggerHaptic(20); setSelectedCategory(grp.id); setSearchQuery(''); scrollToCatalog(); }}
                className={`flex h-11 items-center justify-center gap-1 rounded-xl text-center text-[14px] font-bold border transition min-[375px]:text-[15px] ${isGroupActive ? 'bg-ink text-white border-ink shadow-sm' : 'bg-surface text-ink border-line hover:border-line-strong active:bg-surface-muted'}`}>
                <grp.icon className="hidden h-4 w-4 shrink-0 min-[375px]:block" aria-hidden="true" />{grp.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mx-auto max-w-5xl space-y-3 px-3 pt-3 sm:px-6">
        {/* Um aviso só, o mais importante: encerrada > enviado > conta pedida */}
        {!activeTab ? <p role="alert" className="notice border-rose-200 bg-rose-50 text-rose-800">Esta comanda foi encerrada. Volte às mesas para iniciar outro atendimento.</p>
          : orderSent && cartCount === 0 ? <div role="status" className="notice items-center justify-between border-emerald-200 bg-emerald-50 text-emerald-800"><div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /><span>Pedido enviado à produção.</span></div><button type="button" className="icon-button bg-emerald-50 text-emerald-800" onClick={() => setOrderSent(false)} aria-label="Dispensar confirmação"><X className="h-4 w-4" /></button></div>
          : (billRequested || table.status === 'AGUARDANDO_CONTA') ? <p role="status" className="notice border-brand-200 bg-brand-50 text-brand-900">Conta pedida. Aguarde o atendimento do caixa.</p>
          : null}
        {/* Mesa aberta sem nenhum pedido: o garçom pode desfazer (abriu a mesa errada) */}
        {activeTab && cartCount === 0 && !useTableStore.getState().getTabOrderItems(activeTab.id).some((item) => item.status !== 'CANCELLED') && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-3.5 py-3">
            <p className="text-[17px] text-ink-secondary">Mesa aberta, ainda sem pedido.</p>
            <button type="button" onClick={async () => {
              const answer = await requestChoice({ title: `Liberar a Mesa ${pad2(table.number)}?`, message: 'Use quando abriu a mesa por engano. Ela volta a ficar livre.', choices: [{ value: 'yes', label: 'Sim, liberar a mesa' }, { value: 'no', label: 'Não, continuar atendendo' }] });
              if (answer !== 'yes') return;
              try { useTableStore.getState().releaseEmptyTab(activeTab.id, currentProfile.id); notify(`Mesa ${pad2(table.number)} liberada.`, 'success'); onBackToTables(); }
              catch (error: unknown) { notify(error instanceof Error ? error.message : 'Não foi possível liberar a mesa.', 'error'); }
            }} className="min-h-[44px] rounded-md px-3.5 text-[17px] font-semibold text-rose-700 hover:bg-rose-50 active:bg-rose-50">Liberar mesa</button>
          </div>
        )}
        {activeTab && <TabItemsPanel table={table} />}
        <div id="waiter-catalog" className="flex scroll-mt-32 items-center gap-2">
          <label className="relative block flex-1">
            <span className="sr-only">Buscar produto no cardápio</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Buscar item" className="h-11 w-full rounded-lg border border-line-strong bg-surface pl-10 pr-3 text-base placeholder:text-ink-muted" />
          </label>
          <button
            type="button"
            onClick={togglePhotos}
            className={`h-11 shrink-0 px-3 rounded-lg border text-base font-semibold flex items-center gap-1.5 transition ${showPhotos ? 'border-line bg-surface text-ink-muted active:bg-surface-muted' : 'border-brand-500 bg-brand-50 text-brand-700 font-bold'}`}
            title={showPhotos ? 'Ocultar fotos para carregamento instantâneo' : 'Exibir fotos dos produtos'}>
            {showPhotos ? 'Ocultar fotos' : 'Mostrar fotos'}
          </button>
          {canManageProducts && <button type="button" onClick={() => setIsProductModalOpen(true)} className="btn-secondary h-11 shrink-0 px-3 text-base" title="Cadastrar novo produto no cardápio"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Novo produto</span></button>}
        </div>
        {sections.every((s) => !s.rows.length) ? <EmptyState title="Nenhum produto encontrado" description="Tente outro nome ou escolha uma categoria diferente." action={<button type="button" className="btn-secondary" onClick={() => { setSelectedCategory(TOP); setSearchQuery(''); }}>Limpar busca</button>} /> : sections.filter((s) => s.rows.length).map((section) => (
          <section key={section.id} aria-label={section.title} className="space-y-2">
            <h2 className="pt-2 text-[20px] font-bold text-ink">{section.title}</h2>
            <ul className="waiter-products grid grid-cols-1 gap-2 sm:grid-cols-2">
              {section.rows.map(({ product, level, left, inCart, combo }) => {
                if (combo) {
                  const pairTag = stockText(level, left, inCart + combo.inCart);
                  return (
                    <li key={product.id} className="rounded-2xl border border-line bg-surface px-3.5 py-3">
                      <div className="flex items-center gap-3">
                        {showPhotos && product.image_url && <img src={optimizeThumbnailUrl(product.image_url, 112)} alt="" loading="lazy" decoding="async" width={48} height={48} className={`h-12 w-12 shrink-0 rounded-md object-cover ${level === 'out' ? 'opacity-50 grayscale' : ''}`} onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />}
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[20px] font-bold leading-tight text-ink">{product.name}</h3>
                          {pairTag && <p className={`mt-0.5 text-[17px] ${pairTag.cls}`}>{pairTag.text}</p>}
                        </div>
                      </div>
                      <div className="mt-2.5 grid grid-cols-2 items-start gap-2">
                        {renderOption({ product, level, left, inCart }, 'Só o espeto')}
                        {renderOption(combo, 'Completo')}
                      </div>
                    </li>
                  );
                }
                const out = level === 'out';
                const blocked = !activeTab || (out && inCart === 0);
                const tag = stockText(level, left, inCart);
                return (
                  <li
                    key={product.id}
                    onClick={() => {
                      if (blocked || out) return;
                      handleAdd(product);
                    }}
                    className={`flex min-h-[88px] items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 transition select-none ${!blocked && !out ? 'cursor-pointer active:bg-surface-muted hover:border-line-strong' : ''}`}
                  >
                    {showPhotos && product.image_url && (
                      <img
                        src={optimizeThumbnailUrl(product.image_url, 112)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        width={56}
                        height={56}
                        className={`h-14 w-14 shrink-0 rounded-md object-cover pointer-events-none ${out && !inCart ? 'opacity-50 grayscale' : ''}`}
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[20px] font-bold leading-tight text-ink">{product.name}</h3>
                      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 text-[20px]">
                        <span className={`font-mono font-semibold text-ink ${out && !inCart ? 'opacity-50' : ''}`}>{formatBRL(product.price)}</span>
                        {tag && (out && !inCart ? <StatusTag kind="alert" className="font-semibold">{tag.text}</StatusTag> : <span className={tag.cls}>{tag.text}</span>)}
                      </p>
                    </div>
                    <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                      {inCart > 0 ? (
                        <div className="flex h-12 items-center rounded-md bg-brand-500 text-white">
                          <button type="button" className="flex h-12 w-11 items-center justify-center active:bg-brand-600" onClick={() => decrement(product)} aria-label={`Tirar 1 ${product.name}`}><Minus className="h-5 w-5" /></button>
                          <output className="min-w-[1.75rem] text-center font-mono text-lg font-bold" aria-live="polite" aria-label={`${inCart} no pedido`}>{inCart}</output>
                          <button type="button" className="flex h-12 w-11 items-center justify-center disabled:opacity-40 active:bg-brand-600" disabled={blocked || out} onClick={() => increment(product)} aria-label={`Mais 1 ${product.name}`}><Plus className="h-5 w-5" /></button>
                        </div>
                      ) : !out && (
                        <button
                          type="button"
                          disabled={blocked}
                          onClick={(e) => { e.stopPropagation(); handleAdd(product); }}
                          className="flex h-12 w-12 items-center justify-center rounded-md border-2 border-brand-500 text-brand-500 active:bg-brand-50 disabled:opacity-40"
                          aria-label={`Adicionar ${product.name}, ${formatBRL(product.price)}${level === 'low' ? `. Restam ${left}` : ''}`}>
                          <Plus className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {cartCount > 0 && (
        <div className="fixed inset-x-3 z-30 mx-auto max-w-2xl" style={{ bottom: 'max(26px, calc(env(safe-area-inset-bottom) + 12px))' }}>
          <div className="flex h-[62px] w-full items-center justify-between gap-2 rounded-2xl bg-brand-500 p-2 text-white shadow-[0_8px_24px_rgba(80,30,10,0.3)]">
            <button
              type="button"
              onClick={() => setIsCartDrawerOpen(true)}
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-1 text-left active:bg-brand-600 transition"
              aria-label={`Ver carrinho: ${cartCount} itens por ${formatBRL(cartTotal)}`}
            >
              <span className="flex h-8 min-w-[32px] items-center justify-center rounded-lg bg-white px-1.5 font-mono text-base font-bold text-brand-500">
                {cartCount}
              </span>
              <div className="min-w-0 flex-1">
                <span className="block truncate font-mono text-base font-bold leading-tight">
                  {formatBRL(cartTotal)}
                </span>
                <span className="block truncate text-sm text-brand-100 font-medium">
                  Ver itens ›
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={handleQuickSend}
              disabled={isSendingQuick}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 text-base font-bold text-brand-700 shadow-sm active:bg-brand-50 disabled:opacity-50 transition"
            >
              {isSendingQuick ? (
                <span>Enviando...</span>
              ) : (
                <>
                  <span>Enviar</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
      <WaiterDonenessModal product={modalProduct} isOpen={!!modalProduct} onClose={() => setModalProduct(null)} onConfirm={handleDonenessConfirm} maxQuantity={(() => { if (!modalProduct) return undefined; const left = remainingFor(modalProduct, products, dailyPrepStock, cart); return left === null ? undefined : Math.max(1, left); })()} />
      <WaiterCartDrawer table={table} isOpen={isCartDrawerOpen} onClose={() => setIsCartDrawerOpen(false)} onSuccess={() => setOrderSent(true)} />
      <WaiterViewTab
        table={table}
        isOpen={isViewTabOpen}
        onClose={() => setIsViewTabOpen(false)}
        onRequestBill={() => { useTableStore.getState().requestBill(table.id); setBillRequested(true); setIsViewTabOpen(false); }}
        onSettleTab={() => setIsSettlementOpen(true)}
        onTransferTable={() => { setIsViewTabOpen(false); setIsTransferModalOpen(true); }}
      />
      {activeTab && (
        <TableTransferModal
          sourceTable={table}
          currentTab={activeTab}
          isOpen={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
          onSuccess={(newTable) => {
            if (onTableTransferred) {
              onTableTransferred(newTable);
            } else {
              onBackToTables();
            }
          }}
        />
      )}
      {isSettlementOpen && <TableSettlementModal table={table} isOpen={isSettlementOpen} onClose={() => setIsSettlementOpen(false)} />}
      {canManageProducts && <ProductFormModal isOpen={isProductModalOpen} onClose={() => setIsProductModalOpen(false)} />}
    </div>
  );
}