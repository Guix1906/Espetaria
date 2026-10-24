import { StatusTag } from '../../components/ui/StatusTag';
import { Button } from '../../components/ui/Button';
import { ChevronDown, ChevronLeft, Minus, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatBRL, formatDoneness } from '../../lib/formatters';
import { getProductAvailability } from '../../lib/productAvailability';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useStockStore } from '../../stores/useStockStore';
import type { DeliveryOrderType, DeliveryPaymentMethod, Product } from '../../types/domain';
import type { MeatDoneness } from '../../types/enums';
import { OrderPixBlock, OrderStatusView } from './OrderStatusView';

/*
 * Cardápio digital do cliente (/cardapio). Celular: telas por etapa
 * (cardápio → pedido → entrega → pagamento → revisão → acompanhamento), e o
 * botão voltar do navegador volta uma etapa. Notebook (≥1024px): cardápio com
 * painel do pedido ao lado e finalização em uma página só.
 */

type Step = 'menu' | 'cart' | 'delivery' | 'payment' | 'review' | 'checkout' | 'sent';
const TOP_DRINKS = ['refrigerante lata', 'água mineral sem gás', 'refrigerante 1l', 'água mineral com gás', 'long neck', 'suco de maracujá'];
const DONENESS:{ id: MeatDoneness; label: string }[] = [
  { id: 'MAL_PASSADA', label: 'Mal passada' },
  { id: 'AO_PONTO', label: 'Ao ponto' },
  { id: 'BEM_PASSADA', label: 'Bem passada' },
];
const PAYMENTS: { id: DeliveryPaymentMethod; label: string; hint: string }[] = [
  { id: 'PIX', label: 'PIX', hint: 'Código gerado após enviar o pedido' },
  { id: 'CARTAO_ENTREGA', label: 'Cartão na entrega', hint: 'Débito ou crédito na maquininha' },
  { id: 'DINHEIRO', label: 'Dinheiro', hint: 'Pague ao entregador' },
];
// "Combos" = espetos com acompanhamento (nome curto na aba; o cadastro continua igual)
const COMBOS = 'Combos';
const COMBO_SIDES = 'Todos acompanham arroz, vinagrete, farofa e purê';
const CATEGORY_ORDER = [COMBOS, 'Espetos', 'Entradas', 'Porções', 'Bebidas', 'Sobremesas', 'Outros'];
const SAVED_KEY = 'ponto.cardapio.cliente';

/** Aba do cardápio. Produtos da categoria "Entradas" do cadastro ganham aba própria. */
function categoryOf(p: Product, categoryName?: string) {
  if (categoryName && /^entradas?$/i.test(categoryName.trim())) return 'Entradas';
  if (p.type === 'ESPETO') return /acompanhamento/i.test(p.name) ? COMBOS : 'Espetos';
  if (p.type === 'PORCAO') return 'Porções';
  if (p.type === 'BEBIDA') return 'Bebidas';
  if (p.type === 'SOBREMESA') return 'Sobremesas';
  return 'Outros';
}
const slug = (s: string) => 'cat-' + s.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase();
const parseMoney = (s: string) => { const n = parseFloat(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
/** (99) 99999-9999 enquanto digita (fixo com 10 dígitos vira (99) 9999-9999). */
function maskPhone(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  const head = d.length === 11 ? 7 : 6;
  return d.length <= head ? `(${d.slice(0, 2)}) ${d.slice(2)}` : `(${d.slice(0, 2)}) ${d.slice(2, head)}-${d.slice(head)}`;
}
/** Notas para "troco para": até 3 valores redondos acima do total. */
function changeSuggestions(total: number) {
  const out: number[] = [];
  const round10 = Math.ceil((total + 0.01) / 10) * 10;
  for (const v of [round10, 50, 100, 200]) if (v > total && !out.includes(v)) out.push(v);
  return out.sort((a, b) => a - b).slice(0, 3);
}
/** Descrição repetida dos combos ("Acompanha arroz, ...") sai do item: vai uma vez no título da seção. */
const isSidesDescription = (d?: string | null) => !!d && /^acompanha\s/i.test(d.trim());

function useIsDesktop() {
  const [is, setIs] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setIs(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return is;
}

interface Customer { name: string; phone: string; neighborhood: string; street: string; number: string; complement: string }
function loadCustomer(): Customer {
  try { return { name: '', phone: '', neighborhood: '', street: '', number: '', complement: '', ...JSON.parse(localStorage.getItem(SAVED_KEY) || '{}') }; }
  catch { return { name: '', phone: '', neighborhood: '', street: '', number: '', complement: '' }; }
}

/* ---------- peças visuais ---------- */
const inputCls = 'h-12 w-full rounded-md border border-line bg-white px-3.5 text-[16px] text-ink placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-50';
const labelCls = 'mb-1.5 block text-[14px] font-medium text-ink-secondary';

function Photo({ product, className }: { product: Product; className: string }) {
  if (product.image_url) return <img src={product.image_url} alt="" decoding="async" className={`${className} object-cover`} />;
  return <div aria-hidden="true" className={`${className} flex items-center justify-center bg-[repeating-linear-gradient(135deg,rgb(var(--color-surface-muted))_0_8px,rgb(var(--color-canvas))_8px_16px)] text-[22px] font-semibold text-ink-muted`}>{product.name.replace(/^espeto (de )?/i, '').charAt(0).toUpperCase()}</div>;
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md bg-surface-muted p-1">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
          className={`min-h-[40px] flex-1 rounded-md px-2 text-[15px] ${value === o.id ? 'bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(43,33,28,.08)]' : 'font-medium text-ink-muted'}`}>{o.label}</button>
      ))}
    </div>
  );
}

function Stepper({ qty, onMinus, onPlus, size = 40 }: { qty: number; onMinus: () => void; onPlus: () => void; size?: number }) {
  return (
    <div className="flex items-center rounded-md border border-line-strong bg-white" style={{ height: size }}>
      <button type="button" onClick={onMinus} aria-label="Diminuir" className="flex h-full w-10 items-center justify-center text-ink-muted"><Minus className="h-4 w-4" /></button>
      <span className="min-w-[20px] text-center text-[15px] font-semibold tabular-nums">{qty}</span>
      <button type="button" onClick={onPlus} aria-label="Aumentar" className="flex h-full w-10 items-center justify-center text-brand-500"><Plus className="h-4 w-4" /></button>
    </div>
  );
}

function Radio({ on }: { on: boolean }) {
  return <span aria-hidden="true" className={`block h-[22px] w-[22px] shrink-0 rounded-full bg-white ${on ? 'border-[7px] border-brand-500' : 'border-2 border-line-strong'}`} />;
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="sticky top-0 z-20 grid h-14 grid-cols-[44px_1fr_44px] items-center border-b border-line bg-surface px-2">
      <button type="button" onClick={onBack} aria-label="Voltar" className="flex h-11 w-11 items-center justify-center rounded-md text-ink hover:bg-surface-muted"><ChevronLeft className="h-6 w-6" /></button>
      <h1 className="text-center text-[17px] font-semibold">{title}</h1>
    </div>
  );
}

function Progress({ n }: { n: 1 | 2 | 3 }) {
  return (
    <div className="px-5 pt-4">
      <div className="flex gap-1.5">{[1, 2, 3].map((i) => <span key={i} className={`h-1 flex-1 rounded-sm ${i <= n ? 'bg-brand-500' : 'bg-line'}`} />)}</div>
      <p className="mt-2 text-[13px] text-ink-muted">Etapa {n} de 3</p>
    </div>
  );
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface px-5 pt-3" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}><div className="mx-auto max-w-xl">{children}</div></div>;
}

function Alert({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[14px] text-rose-600">{children}</p>;
}

/* ---------- produto (folha no celular, modal no notebook) ---------- */
function ProductSheet({ product, onClose, onAdd }: { product: Product; onClose: () => void; onAdd: (qty: number, doneness: MeatDoneness | null, notes: string) => string | null }) {
  const [qty, setQty] = useState(1);
  const [doneness, setDoneness] = useState<MeatDoneness | null>(null);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [flagDoneness, setFlagDoneness] = useState(false);
  const donenessRef = useRef<HTMLFieldSetElement>(null);
  const needsDoneness = product.allows_doneness;
  const missingDoneness = needsDoneness && !doneness;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  const submit = () => {
    // Falta o ponto: rola até o grupo e destaca (o botão parece desabilitado, mas responde ao toque)
    if (missingDoneness) {
      setFlagDoneness(true);
      donenessRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const e = onAdd(qty, doneness, notes); if (e) setErr(e); };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(43,33,28,.5)] lg:items-center lg:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={product.name} onClick={(e) => e.stopPropagation()}
        className="pm-sheet flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[12px] bg-surface lg:grid lg:h-[560px] lg:max-h-[90vh] lg:max-w-[860px] lg:grid-cols-[400px_1fr] lg:rounded-2xl">
        <div className="relative shrink-0">
          <Photo product={product} className="h-[200px] w-full lg:h-full" />
          <button type="button" onClick={onClose} aria-label="Fechar" className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink shadow lg:hidden"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="relative flex-1 space-y-5 overflow-y-auto px-5 pb-4 pt-5 lg:px-7 lg:pt-7">
            <button type="button" onClick={onClose} aria-label="Fechar" className="absolute right-5 top-5 hidden h-10 w-10 items-center justify-center rounded-full bg-surface-muted text-ink lg:flex"><X className="h-5 w-5" /></button>
            <div>
              <div className="flex items-start justify-between gap-4 lg:pr-[72px]"><h2 className="text-[24px] font-semibold leading-tight">{product.name}</h2><span className="shrink-0 pt-1 text-[20px] font-semibold tabular-nums">{formatBRL(product.price)}</span></div>
              {product.description && <p className="mt-2 text-[15px] leading-snug text-ink-muted">{product.description}</p>}
            </div>
            {needsDoneness && (
              <fieldset ref={donenessRef} className={`rounded-md border-2 border-[#B5502E] bg-[#FBEFE8] px-4 pb-2 pt-3 ${flagDoneness && missingDoneness ? 'ring-4 ring-[#B5502E]/30' : ''}`}>
                <legend className="sr-only">Ponto da carne</legend>
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"><span className="text-[17px] font-semibold">Ponto da carne</span><span className="text-[13px] font-semibold text-[#B5502E]">Escolha 1 · obrigatório</span></p>
                {flagDoneness && missingDoneness && <p role="alert" className="mt-1 text-[14px] font-semibold text-rose-700">Escolha o ponto da carne para continuar.</p>}
                <div className="mt-1 divide-y divide-[#B5502E]/15 lg:mt-3 lg:grid lg:grid-cols-3 lg:gap-2 lg:divide-y-0">
                  {DONENESS.map((d) => (
                    <button key={d.id} type="button" role="radio" aria-checked={doneness === d.id} onClick={() => { setDoneness(d.id); setErr(null); setFlagDoneness(false); }}
                      className={`flex h-12 w-full items-center gap-3 text-left text-[16px] lg:justify-center lg:rounded-md lg:border lg:text-[15px] ${doneness === d.id ? 'lg:border-2 lg:border-brand-500 lg:bg-brand-50 lg:font-semibold' : 'lg:border-line-strong lg:bg-white'}`}>
                      <span className="shrink-0 lg:hidden"><Radio on={doneness === d.id} /></span>{d.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <div><label htmlFor="pm-notes" className="mb-2 block text-[17px] font-semibold">Observação</label><input id="pm-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
              onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300); }} placeholder="Ex.: pouco sal" className={inputCls} /></div>
            {err && <Alert>{err}</Alert>}
          </div>
          <div className="flex items-center gap-3 border-t border-line px-5 pt-3 lg:px-7 lg:pb-5" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
            <div className="flex h-[52px] shrink-0 items-center rounded-md border border-line-strong bg-white">
              <button type="button" aria-label="Diminuir" onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-[52px] w-11 items-center justify-center text-ink-muted"><Minus className="h-5 w-5" /></button>
              <span className="w-9 text-center text-[17px] font-semibold tabular-nums">{qty}</span>
              <button type="button" aria-label="Aumentar" onClick={() => setQty((q) => q + 1)} className="flex h-[52px] w-11 items-center justify-center text-brand-500"><Plus className="h-5 w-5" /></button>
            </div>
            <Button size="lg" block onClick={submit} aria-disabled={missingDoneness} className={`px-3 text-[15px] font-semibold leading-tight ${missingDoneness ? '!bg-ink-muted' : 'whitespace-nowrap'}`}>{missingDoneness ? 'Escolha o ponto da carne' : `Adicionar · ${formatBRL(product.price * qty)}`}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- app ---------- */
export function PublicMenuApp() {
  const { products, dailyPrepStock, categories } = useStockStore();
  const { cart, addToCart, updateCartQuantity, submitDeliveryOrder, zones, activeTrackingOrder } = useDeliveryStore();
  const { currentShift } = useShiftStore();
  const settings = useSettingsStore((s) => s.settings);
  const deliveryEta = settings.delivery_eta?.trim() || '40–55 min';
  const pickupEta = settings.pickup_eta?.trim() || '30–40 min';
  const isDesktop = useIsDesktop();
  const isOpen = currentShift?.status === 'ABERTO';

  const [step, setStep] = useState<Step>('menu');
  const [orderType, setOrderType] = useState<DeliveryOrderType>('DELIVERY');
  const [query, setQuery] = useState('');
  const [sheetProduct, setSheetProduct] = useState<Product | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<string>('');
  const [customer, setCustomer] = useState<Customer>(loadCustomer);
  const [payment, setPayment] = useState<DeliveryPaymentMethod>('PIX');
  const [changeFor, setChangeFor] = useState('');
  const [noChange, setNoChange] = useState(false);
  const [otherChange, setOtherChange] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  /* navegação por etapa com o botão voltar do navegador */
  useEffect(() => {
    window.history.replaceState({ ...(window.history.state || {}), pmStep: 'menu' }, '');
    const onPop = (e: PopStateEvent) => { setStep((e.state?.pmStep as Step) || 'menu'); window.scrollTo(0, 0); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((next: Step, replace = false) => {
    if (replace) window.history.replaceState({ ...(window.history.state || {}), pmStep: next }, '');
    else window.history.pushState({ pmStep: next }, '');
    setStep(next);
    window.scrollTo(0, 0);
  }, []);
  const back = () => window.history.back();
  // Notebook: etapas do celular viram a página única de finalização
  useEffect(() => { if (isDesktop && (step === 'cart' || step === 'delivery' || step === 'payment' || step === 'review')) setStep('checkout'); if (!isDesktop && step === 'checkout') setStep('cart'); }, [isDesktop, step]);

  const stockOf = (p: Product) => getProductAvailability(p, dailyPrepStock.find((s) => s.product_id === p.id));
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    return products.filter((p) => p.active && (!q || `${p.name} ${p.description || ''}`.toLocaleLowerCase('pt-BR').includes(q)));
  }, [products, query]);
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  // Baixa todas as fotos assim que o cardápio chega: rolar e abrir um produto não espera a imagem
  useEffect(() => {
    products.forEach((p) => { if (p.active && p.image_url) { const img = new Image(); img.decoding = 'async'; img.src = p.image_url; } });
  }, [products]);
  const groups = useMemo(() => CATEGORY_ORDER.map((c) => ({ name: c, items: visible.filter((p) => categoryOf(p, catName.get(p.category_id)) === c) })).filter((g) => g.items.length), [visible, catName]);
  const qtyInCart = (id: string) => cart.filter((c) => c.productId === id).reduce((s, c) => s + c.quantity, 0);
  const count = cart.reduce((s, c) => s + c.quantity, 0);
  const subtotal = cart.reduce((s, c) => s + c.product.price * c.quantity, 0);
  const isPickup = orderType === 'PICKUP';
  const zone = zones.find((z) => z.name === customer.neighborhood);
  const minFee = zones.length ? Math.min(...zones.map((z) => z.fee)) : 0;
  const fee = isPickup ? 0 : zone?.fee ?? 0;
  const total = subtotal + fee;
  // Sugestões no "Seu pedido": as bebidas mais pedidas primeiro, depois as demais
  const drinkRank = (name: string) => {
    const i = TOP_DRINKS.findIndex((top) => name.toLowerCase().startsWith(top));
    return i === -1 ? TOP_DRINKS.length : i;
  };
  const drinks = products.filter((p) => p.active && p.type === 'BEBIDA' && stockOf(p).isAvailable)
    .sort((a, b) => drinkRank(a.name) - drinkRank(b.name)).slice(0, 8);

  /* scroll-spy das categorias */
  const sectionsRef = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    if (step !== 'menu') return;
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActiveCat(vis.target.getAttribute('data-cat') || '');
    }, { rootMargin: '-140px 0px -60% 0px' });
    Object.values(sectionsRef.current).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [groups, step]);
  useEffect(() => { if (!activeCat && groups[0]) setActiveCat(groups[0].name); }, [groups, activeCat]);
  useEffect(() => {
    const chip = document.getElementById(`chip-${slug(activeCat)}`);
    const bar = chip?.parentElement;
    if (chip && bar) bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2, behavior: 'smooth' });
  }, [activeCat]);
  const jumpTo = (cat: string) => {
    setActiveCat(cat);
    const el = sectionsRef.current[cat];
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - (isDesktop ? 96 : 128), behavior: 'smooth' });
  };

  const tryAdd = (p: Product, qty: number, doneness: MeatDoneness | null = null, notes = '') => {
    try { addToCart(p, qty, doneness, notes); return null; }
    catch (e) { return e instanceof Error ? e.message.replace('não possui quantidade suficiente em estoque', 'não tem mais unidades disponíveis hoje') : 'Não foi possível adicionar.'; }
  };
  const onPlus = (p: Product) => {
    setMenuError(null);
    if (p.allows_doneness) { setSheetProduct(p); return; }
    const e = tryAdd(p, 1); if (e) setMenuError(e);
  };

  const saveCustomer = (patch: Partial<Customer>) => setCustomer((c) => { const n = { ...c, ...patch }; try { localStorage.setItem(SAVED_KEY, JSON.stringify(n)); } catch { /* sem armazenamento */ } return n; });

  const validateDelivery = () => {
    if (!customer.name.trim()) return 'Informe o seu nome.';
    if (customer.phone.replace(/\D/g, '').length < 10) return 'Informe o WhatsApp com DDD.';
    if (!isPickup) {
      if (!zone) return 'Escolha o bairro de entrega.';
      if (!customer.street.trim() || !customer.number.trim()) return 'Preencha rua e número.';
    }
    return null;
  };
  const validatePayment = () => {
    if (payment === 'DINHEIRO' && !noChange) {
      const v = parseMoney(changeFor);
      if (!changeFor.trim() || Number.isNaN(v)) return 'Escolha o troco ou toque em "Sem troco".';
      if (v < total) return `O troco precisa ser de pelo menos ${formatBRL(total)}.`;
    }
    return null;
  };

  const send = async () => {
    if (sending) return;
    setFormError(null);
    const err = validateDelivery() || validatePayment();
    if (err) { setFormError(err); return; }
    if (!currentShift || !isOpen) { setFormError('A loja está fechada no momento. Aguarde a abertura para enviar o pedido.'); return; }
    setSending(true);
    try {
      await submitDeliveryOrder({
        shiftId: currentShift.id, orderType, customerName: customer.name.trim(), phone: customer.phone.trim(),
        addressStreet: isPickup ? '' : customer.street.trim(), addressNumber: isPickup ? '' : customer.number.trim(), addressNeighborhood: isPickup ? '' : customer.neighborhood,
        addressComplement: isPickup ? undefined : customer.complement.trim() || undefined,
        deliveryFee: fee, paymentMethod: payment,
        cashChangeFor: payment === 'DINHEIRO' && !noChange ? parseMoney(changeFor) : undefined,
      });
      go('sent', true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Não foi possível enviar o pedido. Tente novamente.';
      if (/estoque|esgot|dispon/i.test(msg)) { setCartError(`Um item acabou enquanto você pedia: ${msg} Ajuste o pedido e envie de novo.`); go(isDesktop ? 'checkout' : 'cart'); }
      else setFormError(msg);
    } finally { setSending(false); }
  };

  const tracking = activeTrackingOrder && !['CANCELLED', 'DELIVERED'].includes(activeTrackingOrder.status) ? activeTrackingOrder : null;
  const initials = settings.name.replace(/^espetaria\s+/i, '').split(/\s+/).filter((w) => w.length > 2).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'SC';

  /* ---------- telas ---------- */
  const typeOptions = [
    { id: 'DELIVERY' as const, label: <span className="whitespace-nowrap">Entrega{zones.length > 0 && <span className="font-normal text-ink-muted"> · {formatBRL(minFee)}</span>}</span> },
    { id: 'PICKUP' as const, label: 'Retirada' },
  ];

  const statusLine = (
    <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-muted">
      <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${isOpen ? 'bg-emerald-600' : 'bg-rose-600'}`} />
      {isOpen ? `Aberto agora · ${isPickup ? pickupEta : deliveryEta}` : 'Fechado no momento'}
    </p>
  );
  const logo = <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-ink text-[17px] font-bold text-canvas lg:h-11 lg:w-11">{initials}</div>;
  const searchBox = (
    <label className="relative block">
      <span className="sr-only">Buscar no cardápio</span>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-muted" />
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar no cardápio" className="h-11 w-full rounded-md border border-line bg-white pl-10 pr-3 text-[16px] placeholder:text-ink-muted focus:border-brand-500 focus:outline-none" />
    </label>
  );

  const productRow = (p: Product, inCombos = false) => {
    const { isAvailable } = stockOf(p);
    const q = qtyInCart(p.id);
    const description = inCombos && isSidesDescription(p.description) ? null : p.description;
    return (
      <li key={p.id} className="border-b border-surface-muted last:border-b-0">
        <button type="button" disabled={!isAvailable} onClick={() => (p.allows_doneness ? setSheetProduct(p) : onPlus(p))} className={`flex w-full gap-3.5 text-left disabled:cursor-not-allowed ${description ? 'py-3.5' : 'items-center py-2.5'}`}>
          <div className="min-w-0 flex-1">
            <h3 className="text-[17px] font-semibold leading-snug">{p.name}</h3>
            {description && <p className="mt-1 line-clamp-2 text-[14px] leading-[1.4] text-ink-muted">{description}</p>}
            {isAvailable ? <p className="mt-1.5 text-[16px] font-semibold tabular-nums">{formatBRL(p.price)}</p> : <p className="mt-1.5 flex items-center gap-2"><span className="text-[16px] font-semibold tabular-nums text-ink-muted opacity-60">{formatBRL(p.price)}</span><StatusTag kind="alert" className="text-[13px] font-semibold">Esgotado</StatusTag></p>}
          </div>
          {/* "+" dentro da foto: não passa da borda da imagem nem da tela */}
          <div className="relative shrink-0 overflow-hidden rounded-md">
            <Photo product={p} className={`${description ? 'h-24 w-24' : 'h-[92px] w-[92px]'} ${isAvailable ? '' : 'opacity-50 grayscale'}`} />
            {isAvailable && (q > 0
              ? <span aria-label={`${q} no pedido`} className="absolute bottom-1.5 right-1.5 flex h-10 min-w-[40px] items-center justify-center rounded-full bg-ink px-2 text-[15px] font-semibold text-white shadow-[0_2px_6px_rgba(43,33,28,.25)]">{q}</span>
              : <span aria-hidden="true" className="absolute bottom-1.5 right-1.5 flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-white shadow-[0_2px_6px_rgba(43,33,28,.25)]"><Plus className="h-5 w-5" /></span>)}
          </div>
        </button>
      </li>
    );
  };

  const productCard = (p: Product) => {
    const { isAvailable } = stockOf(p);
    const q = qtyInCart(p.id);
    return (
      <button key={p.id} type="button" disabled={!isAvailable} onClick={() => (p.allows_doneness ? setSheetProduct(p) : onPlus(p))}
        className={`relative flex gap-3.5 rounded-md bg-white p-3.5 text-left transition hover:shadow-[0_2px_8px_rgba(43,33,28,.08)] disabled:cursor-not-allowed ${q > 0 ? 'border-2 border-ink' : 'border border-line'}`}>
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="text-[17px] font-semibold leading-snug">{p.name}</h3>
          {p.description && !(categoryOf(p, catName.get(p.category_id)) === COMBOS && isSidesDescription(p.description)) && <p className="mt-1 line-clamp-2 text-[14px] leading-[1.4] text-ink-muted">{p.description}</p>}
          <div className="mt-auto flex items-center gap-2 pt-2">
            {isAvailable ? <span className="text-[16px] font-semibold tabular-nums">{formatBRL(p.price)}</span> : <><span className="text-[16px] font-semibold tabular-nums text-ink-muted opacity-60">{formatBRL(p.price)}</span><StatusTag kind="alert" className="text-[13px] font-semibold">Esgotado</StatusTag></>}
            {q > 0 && <span className="rounded-2xl bg-ink px-2 py-0.5 text-[12px] font-semibold text-surface">{q} no pedido</span>}
          </div>
        </div>
        <div className="relative shrink-0 overflow-hidden rounded-md">
          <Photo product={p} className={`h-[96px] w-[96px] xl:h-[110px] xl:w-[110px] ${isAvailable ? '' : 'opacity-50 grayscale'}`} />
          {isAvailable && <span aria-hidden="true" className="absolute bottom-1.5 right-1.5 flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-white shadow-[0_2px_6px_rgba(43,33,28,.2)]"><Plus className="h-5 w-5" /></span>}
        </div>
      </button>
    );
  };

  const cartLines = (compact = false) => (
    <ul className="divide-y divide-surface-muted">
      {cart.map((item) => (
        <li key={item.id} className={`flex items-center gap-3 ${compact ? 'py-3' : 'py-4'}`}>
          <div className="min-w-0 flex-1">
            <p className={`${compact ? 'text-[15px]' : 'text-[16px]'} font-semibold leading-snug`}>{item.product.name}</p>
            {(item.doneness || item.notes) && <p className="mt-0.5 text-[14px] text-ink-muted">{[item.doneness && formatDoneness(item.doneness), item.notes && `“${item.notes}”`].filter(Boolean).join(' · ')}</p>}
            <p className="mt-0.5 text-[15px] font-semibold tabular-nums">{formatBRL(item.product.price * item.quantity)}</p>
          </div>
          <Stepper size={compact ? 36 : 40} qty={item.quantity} onMinus={() => updateCartQuantity(item.id, -1)} onPlus={() => { setCartError(null); const e = tryAdd(item.product, 1, item.doneness ?? null, item.notes || ''); if (e) setCartError(e); }} />
        </li>
      ))}
    </ul>
  );

  const deliveryFields = (twoCols = false) => (
    <div className={`grid gap-4 ${twoCols ? 'grid-cols-2' : ''}`}>
      <div><label htmlFor="pm-name" className={labelCls}>Seu nome</label><input id="pm-name" autoComplete="name" value={customer.name} onChange={(e) => saveCustomer({ name: e.target.value })} className={inputCls} /></div>
      <div>
        <label htmlFor="pm-phone" className={labelCls}>WhatsApp</label>
        <input id="pm-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(99) 99999-9999" maxLength={15} value={maskPhone(customer.phone)} onChange={(e) => saveCustomer({ phone: maskPhone(e.target.value) })} className={inputCls} />
        <p className="mt-1.5 text-[13px] text-ink-muted">Enviamos a confirmação e o link de acompanhamento.</p>
      </div>
      {isPickup ? (
        <p className={`rounded-2xl border border-line bg-canvas px-3 py-2.5 text-[14px] text-ink-secondary ${twoCols ? 'col-span-2' : ''}`}>Avisamos no WhatsApp quando estiver pronto para buscar.{settings.address && <> Retire em: <strong className="font-semibold">{settings.address}</strong></>}</p>
      ) : (
        <>
          <div className={twoCols ? 'col-span-2' : ''}>
            <div className="mb-1.5 flex items-baseline justify-between"><label htmlFor="pm-hood" className="text-[14px] font-medium text-ink-secondary">Bairro</label>{zone && <span className="text-[14px] text-ink-muted">Taxa {formatBRL(zone.fee)}</span>}</div>
            <div className="relative">
              <select id="pm-hood" autoComplete="address-level3" value={customer.neighborhood} onChange={(e) => saveCustomer({ neighborhood: e.target.value })} className={`${inputCls} cursor-pointer appearance-none pr-12 ${customer.neighborhood ? '' : 'text-ink-muted'}`}>
                <option value="">Escolha o bairro</option>
                {zones.map((z) => <option key={z.name} value={z.name}>{z.name} · {formatBRL(z.fee)}</option>)}
              </select>
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-1 right-1 flex w-10 items-center justify-center rounded-r-md border-l border-line text-ink"><ChevronDown className="h-5 w-5" /></span>
            </div>
          </div>
          <div className={`grid grid-cols-[1fr_96px] gap-3 ${twoCols ? 'col-span-2' : ''}`}>
            <div><label htmlFor="pm-street" className={labelCls}>Rua</label><input id="pm-street" autoComplete="address-line1" value={customer.street} onChange={(e) => saveCustomer({ street: e.target.value })} className={inputCls} /></div>
            <div><label htmlFor="pm-number" className={labelCls}>Nº</label><input id="pm-number" inputMode="numeric" autoComplete="address-line2" value={customer.number} onChange={(e) => saveCustomer({ number: e.target.value })} className={inputCls} /></div>
          </div>
          <div className={twoCols ? 'col-span-2' : ''}><label htmlFor="pm-comp" className={labelCls}>Complemento ou referência <span className="font-normal text-ink-muted">(opcional)</span></label><input id="pm-comp" autoComplete="address-line3" value={customer.complement} onChange={(e) => saveCustomer({ complement: e.target.value })} className={inputCls} /></div>
        </>
      )}
    </div>
  );

  const paymentOptions = (inRow = false) => (
    <div role="radiogroup" aria-label="Forma de pagamento" className={inRow ? 'grid grid-cols-3 gap-3' : 'space-y-3'}>
      {PAYMENTS.map((m) => {
        const on = payment === m.id;
        return (
          <div key={m.id} className={`rounded-md bg-white ${on ? 'border-2 border-brand-500 p-[15px]' : 'border border-line p-4'}`}>
            <button type="button" role="radio" aria-checked={on} onClick={() => { setPayment(m.id); setFormError(null); }} className="flex w-full items-start gap-3 text-left">
              <Radio on={on} />
              <span><span className="block text-[16px] font-semibold">{m.id === 'CARTAO_ENTREGA' && isPickup ? 'Cartão na retirada' : m.label}</span><span className="mt-0.5 block text-[14px] text-ink-muted">{m.id === 'DINHEIRO' && isPickup ? 'Pague no balcão' : m.hint}</span></span>
            </button>
            {on && m.id === 'DINHEIRO' && !inRow && cashFields}
          </div>
        );
      })}
      {inRow && payment === 'DINHEIRO' && <div className="col-span-3">{cashFields}</div>}
    </div>
  );
  // Troco: "Sem troco", notas sugeridas acima do total ou "Outro" (valor digitado)
  const suggestions = changeSuggestions(total);
  const pickedNote = !noChange && !otherChange ? suggestions.find((v) => parseMoney(changeFor) === v) : undefined;
  const changeChip = (on: boolean, label: string, onClick: () => void) => (
    <button key={label} type="button" role="radio" aria-checked={on} onClick={() => { onClick(); setFormError(null); }}
      className={`min-h-[44px] rounded-md px-3.5 text-[15px] ${on ? 'border-2 border-brand-500 bg-brand-50 font-semibold text-ink' : 'border border-line-strong bg-white font-medium text-ink-secondary'}`}>{label}</button>
  );
  const cashFields = (
    <div className="mt-4 space-y-3 border-t border-surface-muted pt-4">
      <p className="text-[15px] font-semibold">Troco para quanto?</p>
      <div role="radiogroup" aria-label="Troco" className="flex flex-wrap gap-2">
        {changeChip(noChange, 'Sem troco', () => { setNoChange(true); setOtherChange(false); setChangeFor(''); })}
        {suggestions.map((v) => changeChip(pickedNote === v, formatBRL(v), () => { setNoChange(false); setOtherChange(false); setChangeFor(String(v)); }))}
        {changeChip(otherChange, 'Outro', () => { setNoChange(false); setOtherChange(true); setChangeFor(''); })}
      </div>
      {otherChange && (
        <div><label htmlFor="pm-change" className={labelCls}>Valor da nota</label>
          <div className="relative"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] text-ink-muted">R$</span><input id="pm-change" inputMode="decimal" autoFocus value={changeFor} onChange={(e) => setChangeFor(e.target.value.replace(/[^\d,.]/g, ''))} placeholder="0,00" className={`${inputCls} pl-10`} /></div>
        </div>
      )}
    </div>
  );
  const paymentSummary = payment === 'DINHEIRO' ? `Dinheiro · ${noChange || !changeFor ? 'sem troco' : `troco para ${formatBRL(parseMoney(changeFor) || 0)}`}` : PAYMENTS.find((p) => p.id === payment)!.label;

  const totals = (big = 20) => (
    <div className="space-y-2 text-[15px]">
      <div className="flex justify-between text-ink-secondary"><span>Subtotal</span><span className="tabular-nums">{formatBRL(subtotal)}</span></div>
      <div className="flex justify-between text-ink-secondary"><span>{isPickup ? 'Retirada no local' : zone ? `Entrega · ${zone.name}` : 'Entrega'}</span><span className="tabular-nums">{isPickup ? 'Grátis' : zone ? formatBRL(fee) : 'escolha o bairro'}</span></div>
      <div className="flex justify-between border-t border-line pt-3 font-semibold" style={{ fontSize: big }}><span>Total</span><span className="tabular-nums">{formatBRL(total)}</span></div>
    </div>
  );

  const closedNotice = !isOpen && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[14px] text-amber-900">A loja está fechada agora. Você pode olhar o cardápio, mas os pedidos só são aceitos no horário de funcionamento.</p>;

  const trackingBanner = tracking && (
    <button type="button" onClick={() => go('sent')} className="flex w-full items-center justify-between gap-3 rounded-md border border-line bg-white px-4 py-3 text-left">
      <span><span className="block font-mono text-[12px] text-ink-muted">Pedido #{tracking.order_number}</span><span className="block text-[15px] font-semibold">Acompanhar o seu pedido</span></span>
      <span className="text-[14px] font-semibold text-brand-700">Ver</span>
    </button>
  );

  let screen: ReactNode;

  if (step === 'sent' && activeTrackingOrder) {
    const o = activeTrackingOrder;
    const showPixColumn = o.payment_method === 'PIX' && !o.paid_at && !['DELIVERED', 'CANCELLED'].includes(o.status);
    screen = isDesktop ? (
      <div className="min-h-screen px-12 py-10">
        <div className={`mx-auto grid max-w-[1000px] gap-10 rounded-2xl border border-line bg-white p-8 ${showPixColumn ? 'grid-cols-[420px_1fr]' : 'max-w-[620px]'}`}>
          {showPixColumn && <div className="space-y-4 border-r border-surface-muted pr-10"><h2 className="text-[24px] font-semibold">Falta só o pagamento</h2><p className="text-[15px] text-ink-muted">Pague pelo app do seu banco. A brasa começa assim que a loja confirmar o PIX.</p><OrderPixBlock order={o} /></div>}
          <div>
            <OrderStatusView order={o} showPix={false} />
            <button type="button" onClick={() => go('menu', true)} className="mt-3 h-[52px] w-full rounded-md text-[16px] font-semibold text-brand-700 hover:bg-canvas">Fazer novo pedido</button>
          </div>
        </div>
      </div>
    ) : (
      <div className="mx-auto max-w-xl px-5 pb-10">
        <TopBar title="Seu pedido" onBack={() => go('menu', true)} />
        {showPixColumn && (
          <div className="pb-6 pt-6 text-center">
            <p className="font-mono text-[13px] text-ink-muted">Pedido #{o.order_number}</p>
            <h2 className="mt-1 text-[26px] font-semibold">Falta só o pagamento</h2>
            <p className="mx-auto mt-2 max-w-sm text-[15px] text-ink-muted">Pague pelo app do seu banco. A brasa começa assim que a loja confirmar o PIX.</p>
            <div className="mt-5 text-left"><OrderPixBlock order={o} /></div>
            <div className="mt-6 border-t border-line" />
          </div>
        )}
        <div className="pt-6"><OrderStatusView order={o} showPix={false} /></div>
        <button type="button" onClick={() => go('menu', true)} className="mt-3 h-[52px] w-full rounded-md text-[16px] font-semibold text-brand-700">Fazer novo pedido</button>
      </div>
    );
  } else if (step === 'cart') {
    screen = (
      <div className="mx-auto max-w-xl pb-44">
        <TopBar title="Seu pedido" onBack={back} />
        <div className="space-y-5 px-5 pt-2">
          {cartError && <div className="pt-3"><Alert>{cartError}</Alert></div>}
          {cart.length ? cartLines() : <p className="py-10 text-center text-[15px] text-ink-muted">Seu pedido está vazio.</p>}
          <button type="button" onClick={back} className="flex min-h-[44px] items-center gap-1.5 text-[15px] font-semibold text-brand-700"><Plus className="h-4 w-4" />Adicionar mais itens</button>
          <p className="rounded-2xl border border-line bg-canvas px-3 py-2.5 text-[14px] text-ink-secondary">Os acompanhamentos da casa já vão junto com o pedido.</p>
          {drinks.length > 0 && (
            <div>
              <h2 className="mb-3 text-[17px] font-semibold">Que tal uma bebida?</h2>
              <ul className="no-scrollbar -mx-5 flex snap-x gap-2.5 overflow-x-auto px-5 pb-1" aria-label="Bebidas sugeridas">
                {drinks.map((d) => {
                  const q = qtyInCart(d.id);
                  return (
                    <li key={d.id} className="w-[132px] shrink-0 snap-start">
                      <button type="button" onClick={() => { const e = tryAdd(d, 1); setCartError(e); }} aria-label={`Adicionar ${d.name}, ${formatBRL(d.price)}`} className="relative block w-full overflow-hidden rounded-md border border-line bg-white text-left">
                        <Photo product={d} className="h-[90px] w-full" />
                        <span className="block p-2.5 pr-11"><span className="line-clamp-2 block min-h-[2.5em] text-[14px] font-semibold leading-snug">{d.name}</span><span className="mt-1 block whitespace-nowrap text-[14px] font-semibold tabular-nums">{formatBRL(d.price)}</span></span>
                        <span aria-hidden="true" className={`absolute bottom-2.5 right-2.5 flex h-[34px] min-w-[34px] items-center justify-center rounded-full px-1.5 text-[14px] font-semibold text-white ${q > 0 ? 'bg-ink' : 'bg-brand-500'}`}>{q > 0 ? q : <Plus className="h-[18px] w-[18px]" />}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        <Footer>
          <div className="mb-3 flex justify-between text-[15px]"><span className="text-ink-secondary">Subtotal · {count} {count === 1 ? 'item' : 'itens'}</span><span className="font-semibold tabular-nums">{formatBRL(subtotal)}</span></div>
          <Button size="lg" block disabled={!cart.length} onClick={() => { setCartError(null); go('delivery'); }} className="font-semibold">Continuar</Button>
        </Footer>
      </div>
    );
  } else if (step === 'delivery') {
    screen = (
      <div className="mx-auto max-w-xl pb-44">
        <TopBar title={isPickup ? 'Retirada' : 'Entrega'} onBack={back} />
        <Progress n={1} />
        <div className="space-y-5 px-5 pt-5">
          <Segmented label="Como você quer receber" value={orderType} onChange={setOrderType} options={[{ id: 'DELIVERY', label: 'Entregar' }, { id: 'PICKUP', label: 'Retirar no local' }]} />
          {deliveryFields()}
          {formError && <Alert>{formError}</Alert>}
        </div>
        <Footer>
          <div className="mb-3 flex justify-between text-[15px]"><span className="text-ink-secondary">{isPickup ? 'Total' : zone ? 'Total com entrega' : 'Subtotal'}</span><span className="font-semibold tabular-nums">{formatBRL(isPickup || zone ? total : subtotal)}</span></div>
          <Button size="lg" block onClick={() => { const e = validateDelivery(); setFormError(e); if (!e) go('payment'); }} className="font-semibold">Ir para pagamento</Button>
        </Footer>
      </div>
    );
  } else if (step === 'payment') {
    screen = (
      <div className="mx-auto max-w-xl pb-44">
        <TopBar title="Pagamento" onBack={back} />
        <Progress n={2} />
        <div className="space-y-4 px-5 pt-5">{paymentOptions()}{formError && <Alert>{formError}</Alert>}</div>
        <Footer>
          <div className="mb-3 flex justify-between text-[15px]"><span className="text-ink-secondary">Total</span><span className="font-semibold tabular-nums">{formatBRL(total)}</span></div>
          <Button size="lg" block onClick={() => { const e = validatePayment(); setFormError(e); if (!e) go('review'); }} className="font-semibold">Revisar pedido</Button>
        </Footer>
      </div>
    );
  } else if (step === 'review') {
    const block = (label: string, onEdit: () => void, children: ReactNode) => (
      <section className="border-b border-surface-muted py-4">
        <div className="mb-1.5 flex items-center justify-between"><h2 className="text-[13px] text-ink-muted">{label}</h2><button type="button" onClick={onEdit} className="min-h-[44px] px-1 text-[14px] font-semibold text-brand-700">Alterar</button></div>
        {children}
      </section>
    );
    screen = (
      <div className="mx-auto max-w-xl pb-52">
        <TopBar title="Revisão" onBack={back} />
        <Progress n={3} />
        <div className="px-5 pt-1">
          {block(isPickup ? 'Retirar em' : 'Entregar em', () => window.history.go(-2), isPickup
            ? <p className="text-[16px]">{settings.address || 'Na loja'}<span className="block text-[14px] text-ink-muted">Pronto em {pickupEta} · {customer.name}</span></p>
            : <p className="text-[16px]">{customer.street}, {customer.number}{customer.complement ? ` · ${customer.complement}` : ''}<span className="block text-[14px] text-ink-muted">{customer.neighborhood} · {deliveryEta} · {customer.name}</span></p>)}
          {block('Pagamento', back, <p className="text-[16px]">{paymentSummary}</p>)}
          {block('Itens', () => window.history.go(-3), <ul className="space-y-2.5">{cart.map((c) => <li key={c.id} className="flex justify-between gap-3 text-[15px]"><span className="min-w-0">{c.quantity}× {c.product.name}{(c.doneness || c.notes) && <span className="mt-0.5 block text-[14px] text-ink-muted">{c.doneness && formatDoneness(c.doneness)}{c.doneness && c.notes && <br />}{c.notes && `“${c.notes}”`}</span>}</span><span className="shrink-0 tabular-nums">{formatBRL(c.product.price * c.quantity)}</span></li>)}</ul>)}
          <div className="pt-4">{totals()}</div>
          {closedNotice && <div className="pt-4">{closedNotice}</div>}
          {formError && <div className="pt-4"><Alert>{formError}</Alert></div>}
        </div>
        <Footer>
          <Button size="lg" block disabled={sending || !cart.length} onClick={() => void send()} className="font-semibold">{sending ? 'Enviando...' : `Enviar pedido · ${formatBRL(total)}`}</Button>
          <p className="mt-2 text-center text-[13px] text-ink-muted">A confirmação chega no seu WhatsApp.</p>
        </Footer>
      </div>
    );
  } else if (step === 'checkout') {
    const num = (n: number) => <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-surface">{n}</span>;
    screen = (
      <div className="min-h-screen">
        <header className="border-b border-line bg-surface"><div className="mx-auto flex h-[76px] max-w-[1366px] items-center gap-4 px-12"><button type="button" onClick={back} aria-label="Voltar ao cardápio" className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-surface-muted"><ChevronLeft className="h-6 w-6" /></button><h1 className="text-[22px] font-semibold">Finalizar pedido</h1></div></header>
        <div className="mx-auto grid max-w-[1366px] grid-cols-[1fr_400px] gap-12 px-12 py-7">
          <div className="space-y-10">
            <section>
              <h2 className="mb-4 flex items-center gap-3 text-[20px] font-semibold">{num(1)}Como você quer receber?</h2>
              <div className="mb-5 grid grid-cols-2 gap-3">
                {(['DELIVERY', 'PICKUP'] as const).map((t) => <button key={t} type="button" role="radio" aria-checked={orderType === t} onClick={() => setOrderType(t)} className={`flex items-center gap-3 rounded-md bg-white text-left ${orderType === t ? 'border-2 border-brand-500 p-[15px]' : 'border border-line p-4'}`}><Radio on={orderType === t} /><span><span className="block text-[16px] font-semibold">{t === 'DELIVERY' ? 'Entrega' : 'Retirar no local'}</span><span className="block text-[14px] text-ink-muted">{t === 'DELIVERY' ? `${deliveryEta}${zones.length ? ` · a partir de ${formatBRL(minFee)}` : ''}` : `${pickupEta} · sem taxa`}</span></span></button>)}
              </div>
              {deliveryFields(true)}
            </section>
            <section><h2 className="mb-4 flex items-center gap-3 text-[20px] font-semibold">{num(2)}Pagamento</h2>{paymentOptions(true)}</section>
          </div>
          <aside className="sticky top-6 h-fit space-y-4 rounded-md border border-line bg-white p-5">
            <h2 className="text-[19px] font-semibold">Resumo do pedido</h2>
            {cartError && <Alert>{cartError}</Alert>}
            {cartLines(true)}
            <p className="rounded-2xl border border-line bg-canvas px-3 py-2 text-[13px] text-ink-secondary">Os acompanhamentos da casa já vão junto com o pedido.</p>
            {totals(22)}
            {closedNotice}
            {formError && <Alert>{formError}</Alert>}
            <Button size="lg" block disabled={sending || !cart.length} onClick={() => void send()} className="font-semibold">{sending ? 'Enviando...' : `Enviar pedido · ${formatBRL(total)}`}</Button>
            <p className="text-center text-[13px] text-ink-muted">A confirmação chega no seu WhatsApp.</p>
          </aside>
        </div>
      </div>
    );
  } else if (isDesktop) {
    screen = (
      <div className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-line bg-surface">
          <div className="mx-auto flex h-[76px] max-w-[1366px] items-center gap-4 px-8">
            {logo}
            <div className="min-w-0 flex-1"><p className="truncate text-[19px] font-semibold">{settings.name}</p>{statusLine}</div>
            <div className="w-[320px]">{searchBox}</div>
            <div className="w-[300px]"><Segmented label="Como você quer receber" value={orderType} onChange={setOrderType} options={[{ id: 'DELIVERY', label: 'Entrega' }, { id: 'PICKUP', label: 'Retirada' }]} /></div>
          </div>
        </header>
        <div className="mx-auto grid max-w-[1366px] grid-cols-[180px_1fr_320px] xl:grid-cols-[200px_1fr_360px]">
          <nav aria-label="Categorias" className="sticky top-[76px] h-[calc(100vh-76px)] space-y-1 overflow-y-auto px-4 py-6">
            {groups.map((g) => <button key={g.name} type="button" onClick={() => jumpTo(g.name)} aria-current={activeCat === g.name ? 'true' : undefined} className={`block w-full rounded-2xl px-3 py-2.5 text-left text-[15px] ${activeCat === g.name ? 'bg-ink font-semibold text-surface' : 'text-ink-secondary hover:bg-surface-muted'}`}>{g.name}</button>)}
          </nav>
          <main className="min-w-0 space-y-8 border-l border-line px-8 py-6">
            {trackingBanner}
            {closedNotice}
            {menuError && <Alert>{menuError}</Alert>}
            {groups.length === 0 && <p className="py-16 text-center text-[16px] text-ink-muted">Nada encontrado para “{query}”.</p>}
            {groups.map((g) => (
              <section key={g.name} data-cat={g.name} ref={(el) => { sectionsRef.current[g.name] = el; }}>
                <h2 className={`text-[24px] font-semibold ${g.name === COMBOS ? '' : 'mb-4'}`}>{g.name}</h2>
                {g.name === COMBOS && <p className="mb-4 mt-1 text-[15px] text-ink-muted">{COMBO_SIDES}</p>}
                <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">{g.items.map(productCard)}</div>
              </section>
            ))}
          </main>
          <aside className="sticky top-[76px] flex h-[calc(100vh-76px)] flex-col border-l border-line bg-white">
            <h2 className="px-5 pb-2 pt-6 text-[19px] font-semibold">Seu pedido</h2>
            <div className="flex-1 overflow-y-auto px-5">
              {cartError && <Alert>{cartError}</Alert>}
              {cart.length ? cartLines(true) : <p className="py-10 text-center text-[15px] text-ink-muted">Escolha os itens no cardápio.</p>}
            </div>
            <div className="space-y-2 border-t border-line p-5 text-[15px]">
              <div className="flex justify-between"><span className="text-ink-secondary">Subtotal</span><span className="font-semibold tabular-nums">{formatBRL(subtotal)}</span></div>
              <p className="text-[14px] text-ink-muted">{isPickup ? 'Retirada no local: sem taxa' : 'Entrega: calculada no bairro'}</p>
              <Button size="lg" block disabled={!cart.length} onClick={() => go('checkout')} className="mt-2 font-semibold">Finalizar pedido · {formatBRL(subtotal)}</Button>
            </div>
          </aside>
        </div>
      </div>
    );
  } else {
    screen = (
      <div className="mx-auto max-w-xl pb-32">
        <header className="border-b border-line px-5 pb-4 pt-2">
          <div className="flex items-center gap-3 pt-2">{logo}<div className="min-w-0"><p className="truncate text-[19px] font-semibold leading-tight">{settings.name}</p>{statusLine}</div></div>
          <div className="mt-4 space-y-3">
            <Segmented label="Como você quer receber" value={orderType} onChange={setOrderType} options={typeOptions} />
            {searchBox}
          </div>
        </header>
        <nav aria-label="Categorias" className="no-scrollbar sticky top-0 z-20 flex gap-2 overflow-x-auto border-b border-surface-muted bg-surface px-5 py-3">
          {groups.map((g) => <button id={`chip-${slug(g.name)}`} key={g.name} type="button" onClick={() => jumpTo(g.name)} aria-current={activeCat === g.name ? 'true' : undefined} className={`h-9 shrink-0 rounded-2xl border px-3.5 text-[14px] ${activeCat === g.name ? 'border-ink bg-ink font-semibold text-surface' : 'border-line-strong bg-white font-medium text-ink-secondary'}`}>{g.name}</button>)}
        </nav>
        <main className="space-y-6 px-5 pt-4">
          {trackingBanner}
          {closedNotice}
          {menuError && <Alert>{menuError}</Alert>}
          {groups.length === 0 && <p className="py-16 text-center text-[16px] text-ink-muted">Nada encontrado para “{query}”.</p>}
          {groups.map((g) => (
            <section key={g.name} data-cat={g.name} ref={(el) => { sectionsRef.current[g.name] = el; }}>
              <h2 className="text-sm font-semibold text-ink-secondary">{g.name} · {g.items.length} {g.items.length === 1 ? 'item' : 'itens'}</h2>
              {g.name === COMBOS && <p className="mt-0.5 text-[14px] text-ink-muted">{COMBO_SIDES}</p>}
              <ul>{g.items.map((p) => productRow(p, g.name === COMBOS))}</ul>
            </section>
          ))}
        </main>
        {/* Barra do carrinho flutuante: acessível de qualquer ponto da rolagem */}
        {count > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-30 px-4" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
            <button type="button" onClick={() => { setCartError(null); go('cart'); }}
              className="mx-auto flex h-14 w-full max-w-xl items-center justify-between gap-3 rounded-xl bg-[#2A201B] px-5 text-[17px] font-semibold text-white shadow-[0_8px_24px_rgba(43,33,28,.35)] active:opacity-90">
              <span className="truncate">Ver pedido · {count} {count === 1 ? 'item' : 'itens'}</span>
              <span className="shrink-0 font-mono tabular-nums">{formatBRL(subtotal)}</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface font-sans text-ink">
      {screen}
      {sheetProduct && (
        <ProductSheet product={sheetProduct} onClose={() => setSheetProduct(null)} onAdd={(q, d, n) => { const e = tryAdd(sheetProduct, q, d, n); if (!e) setSheetProduct(null); return e; }} />
      )}
    </div>
  );
}
