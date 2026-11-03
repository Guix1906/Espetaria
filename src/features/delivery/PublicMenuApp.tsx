import { OptionGroup } from '../../components/ui/OptionGroup';
import { StatusTag } from '../../components/ui/StatusTag';
import { Stepper } from '../../components/ui/Stepper';
import { Button } from '../../components/ui/Button';
import { DEFAULT_DELIVERY_ETA, DEFAULT_PICKUP_ETA } from '../../lib/eta';
import { Check, ChevronDown, ChevronLeft, Minus, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { comboBlockedByBase } from '../../lib/comboStock';
import { DINE_IN_NOTE } from '../../lib/deliveryStatus';
import { formatBRL, formatDoneness } from '../../lib/formatters';
import { menuPhotoUrl } from '../../lib/imageOptimization';
import { getProductAvailability, menuFlavors } from '../../lib/productAvailability';
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

type OrderMode = 'DELIVERY' | 'DINE_IN' | 'PICKUP';
const MODE_OPTIONS: { id: OrderMode; label: string }[] = [{ id: 'DELIVERY', label: 'Entrega' }, { id: 'DINE_IN', label: 'Consumir no local' }, { id: 'PICKUP', label: 'Retirada no local' }];
type Step = 'menu' | 'cart' | 'delivery' | 'payment' | 'review' | 'checkout' | 'sent';
const TOP_DRINKS = ['refrigerante lata', 'água mineral sem gás', 'refrigerante 1l', 'água mineral com gás', 'long neck', 'suco de maracujá'];
export const DONENESS:{ id: MeatDoneness; label: string }[] = [
  { id: 'MAL_PASSADA', label: 'Mal passada' },
  { id: 'AO_PONTO', label: 'Ao ponto' },
  { id: 'BEM_PASSADA', label: 'Bem passada' },
];
const PAYMENTS: { id: DeliveryPaymentMethod; label: string; hint: string }[] = [
  { id: 'PIX', label: 'PIX', hint: 'Código gerado após enviar o pedido' },
  { id: 'CARTAO_ENTREGA', label: 'Cartão na entrega', hint: 'Débito ou crédito na maquininha' },
  { id: 'DINHEIRO', label: 'Dinheiro', hint: 'Pague ao entregador' },
];
// "X" e "X com acompanhamento" viram um card só, com as duas opções (o cadastro continua igual)
const ESPETOS = 'Espetos';
const COMBO_SIDES = '★ Completo inclui arroz, vinagrete, farofa e purê';
const display = "font-['Oswald',sans-serif]";
const COMBO_SUFFIX = /\s+com acompanhamento\s*$/i;
/** Hora em que a loja abre (aviso de loja fechada no cardápio). */
const STORE_OPENS_AT = 18;
const NO_RICE = 'Sem arroz';
export const COMBO_SIDE_ITEMS = ['Vinagrete', 'Farofa', 'Purê'];
/** Caminho inverso de comboNotes, para editar o item na sacola. */
export function parseComboNotes(text: string, riceOptions: string[]) {
  const tags = text.split(',').map((tag) => tag.trim()).filter(Boolean);
  const rice = tags.find((tag) => tag === NO_RICE || riceOptions.includes(tag)) ?? null;
  const removed = COMBO_SIDE_ITEMS.filter((side) => tags.includes(`Sem ${side.toLocaleLowerCase('pt-BR')}`));
  const notes = tags.filter((tag) => tag !== rice && !removed.some((side) => tag === `Sem ${side.toLocaleLowerCase('pt-BR')}`)).join(', ');
  return { rice, removed, notes };
}
/** Observação que vai para a cozinha: arroz escolhido, o que o cliente tirou e o texto livre. */
export function comboNotes(rice: string | null, removed: string[], notes: string) {
  return [rice, ...removed.map((side) => `Sem ${side.toLocaleLowerCase('pt-BR')}`), notes.trim()].filter(Boolean).join(', ');
}
export const CATEGORY_ORDER = [ESPETOS, 'Entradas', 'Acompanhamentos', 'Sem álcool', 'Cervejas', 'Drinks e doses', 'Sobremesas', 'Outros'];
const SAVED_KEY = 'ponto.cardapio.cliente';

/** Aba do cardápio. Produtos da categoria "Entradas" do cadastro ganham aba própria. */
export function categoryOf(p: Product, categoryName?: string) {
  if (categoryName && /^entradas?$/i.test(categoryName.trim())) return 'Entradas';
  if (p.type === 'ESPETO') return ESPETOS;
  if (p.type === 'PORCAO') return 'Acompanhamentos';
  if (p.type === 'BEBIDA') return /\bdose\b|caipi|\bgin\b|coquetel|drink|whisky|vodka|cacha/i.test(`${p.name} ${p.description ?? ''}`) ? 'Drinks e doses' : /cerveja|long neck|heineken|original|skol|chopp|600ml/i.test(p.name) ? 'Cervejas' : 'Sem álcool';
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

/** Celular com DDD (11 dígitos, ou com 55 na frente) e sem número repetido tipo 00000000000. */
export function isValidWhatsApp(phone: string) {
  const digits = phone.replace(/\D/g, '').replace(/^55(?=\d{11}$)/, '');
  return digits.length === 11 && !/^(\d)\1+$/.test(digits);
}

/** Centraliza o elemento no painel que rola (sem scrollIntoView, que mexe na página inteira). */
function scrollToCenter(el: HTMLElement | null) {
  if (!el) return;
  let box: HTMLElement | null = el.parentElement;
  while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
  if (!box) { window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - window.innerHeight / 2, behavior: 'smooth' }); return; }
  const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - box.clientHeight / 2 + el.clientHeight / 2;
  box.scrollTo({ top, behavior: 'smooth' });
}

/** Aviso de loja fechada: o mesmo no cardápio e na sacola. */
const ClosedNotice = () => <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[14px] text-amber-900">A loja está fechada agora. Você pode olhar o cardápio, mas os pedidos só são aceitos no horário de funcionamento.</p>;

/* ---------- peças visuais ---------- */
const inputCls = 'h-12 w-full rounded-md border border-line bg-surface px-3.5 text-[16px] text-ink placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-50';
const labelCls = 'mb-1.5 block text-[14px] font-medium text-ink-secondary';

function Photo({ product, className, variant = 'm', priority = false }: { product: Product; className: string; variant?: 'm' | 's'; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Se a versão leve faltar, cai na foto original
  const src = failed ? product.image_url : menuPhotoUrl(product.image_url, variant);
  if (product.image_url) return (
    <span className={`${className} block overflow-hidden bg-surface-muted`}>
      <img src={src ?? ''} alt="" loading={priority ? 'eager' : 'lazy'} decoding="async" {...(priority ? { fetchpriority: 'high' } : {})}
        ref={(el) => { if (el?.complete && el.naturalWidth && !loaded) setLoaded(true); }}
        onLoad={() => setLoaded(true)} onError={() => { if (!failed) setFailed(true); }}
        className={`block h-full w-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
    </span>
  );
  return <div aria-hidden="true" className={`${className} flex items-center justify-center bg-[repeating-linear-gradient(135deg,rgb(var(--color-surface-muted))_0_8px,rgb(var(--color-canvas))_8px_16px)] text-[24px] font-semibold text-ink-muted`}>{product.name.replace(/^espeto (de )?/i, '').charAt(0).toUpperCase()}</div>;
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md bg-surface-muted p-1">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
          className={`min-h-[44px] flex-1 rounded-md px-1.5 text-[14px] leading-tight sm:text-[15px] ${value === o.id ? 'bg-brand-500 font-semibold text-white' : 'font-medium text-ink-secondary'}`}>{o.label}</button>
      ))}
    </div>
  );
}

function Radio({ on }: { on: boolean }) {
  return <span aria-hidden="true" className={`block h-[22px] w-[22px] shrink-0 rounded-full bg-surface ${on ? 'border-[7px] border-brand-500' : 'border-2 border-line-strong'}`} />;
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
function ProductSheet({ product, riceOptions, juiceOptions, initial, onClose, onAdd }: { product: Product; riceOptions: string[]; juiceOptions: string[]; initial?: { qty: number; doneness: MeatDoneness | null; notes: string }; onClose: () => void; onAdd: (qty: number, doneness: MeatDoneness | null, notes: string) => string | null }) {
  const flavors = menuFlavors(product, juiceOptions);
  const parsed = parseComboNotes(initial?.notes ?? '', flavors.length ? flavors : riceOptions);
  const [qty, setQty] = useState(initial?.qty ?? 1);
  const [doneness, setDoneness] = useState<MeatDoneness | null>(initial?.doneness ?? null);
  const [notes, setNotes] = useState(parsed.notes);
  const [err, setErr] = useState<string | null>(null);
  const [flagDoneness, setFlagDoneness] = useState(false);
  const donenessRef = useRef<HTMLFieldSetElement>(null);
  const needsDoneness = product.allows_doneness;
  const missingDoneness = needsDoneness && !doneness;
  // Combo: o cliente escolhe um dos arrozes do dia (Configurações)
  const isCombo = COMBO_SUFFIX.test(product.name);
  const needsRice = flavors.length > 0 || (isCombo && riceOptions.length > 0);
  const [removedSides, setRemovedSides] = useState<string[]>(parsed.removed);
  const [rice, setRice] = useState<string | null>(parsed.rice);
  const [flagRice, setFlagRice] = useState(false);
  const riceRef = useRef<HTMLDivElement>(null);
  const missingRice = needsRice && !rice;
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
      scrollToCenter(donenessRef.current);
      return;
    }
    if (missingRice) {
      setFlagRice(true);
      scrollToCenter(riceRef.current);
      return;
    }
    const e = onAdd(qty, doneness, comboNotes(rice, removedSides, notes)); if (e) setErr(e); };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(43,33,28,.5)] lg:items-center lg:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={product.name} onClick={(e) => e.stopPropagation()}
        className="pm-sheet flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[12px] bg-surface lg:grid lg:h-[560px] lg:max-h-[90vh] lg:max-w-[860px] lg:grid-cols-[400px_1fr] lg:rounded-2xl">
        <div className="relative shrink-0">
          <Photo product={product} className="h-[120px] w-full min-[375px]:h-[200px] lg:h-full" />
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
              <fieldset ref={donenessRef} className={`rounded-md border-2 border-brand-500 bg-brand-50 px-4 pb-2 pt-3 ${flagDoneness && missingDoneness ? 'ring-4 ring-brand-500/30' : ''}`}>
                <legend className="sr-only">Ponto da carne</legend>
                <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"><span className="text-[17px] font-semibold">Ponto da carne</span><span className="text-[13px] font-semibold text-brand-700">Escolha 1 · obrigatório</span></p>
                {flagDoneness && missingDoneness && <p role="alert" className="mt-1 text-[14px] font-semibold text-rose-700">Escolha o ponto da carne para continuar.</p>}
                <div className="mt-1 divide-y divide-brand-500/15 lg:mt-3 lg:grid lg:grid-cols-3 lg:gap-2 lg:divide-y-0">
                  {DONENESS.map((d) => (
                    <button key={d.id} type="button" role="radio" aria-checked={doneness === d.id} onClick={() => { setDoneness(d.id); setErr(null); setFlagDoneness(false); }}
                      className={`flex h-12 w-full items-center gap-3 text-left text-[16px] lg:justify-center lg:rounded-md lg:border lg:text-[15px] ${doneness === d.id ? 'lg:border-2 lg:border-brand-500 lg:bg-brand-500 lg:font-semibold lg:text-white' : 'lg:border-line-strong lg:bg-surface'}`}>
                      <span className="shrink-0 lg:hidden"><Radio on={doneness === d.id} /></span>{d.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            {needsRice && <div ref={riceRef}>
              <OptionGroup title={flavors.length ? 'Sabor' : 'Arroz do dia'} hint="escolha 1" options={flavors.length ? flavors : [...riceOptions, NO_RICE]} value={rice} onChange={(value) => { setRice(value); setFlagRice(false); }} />
              {flagRice && missingRice && <p role="alert" className="mt-2 text-[14px] font-semibold text-rose-700">{flavors.length ? 'Escolha o sabor para continuar.' : 'Escolha o arroz para continuar.'}</p>}
            </div>}
            {isCombo && <div>
              <p className="mb-2 text-base font-semibold text-ink">Acompanhamentos <span className="font-normal text-ink-muted">· toque para tirar</span></p>
              <div className="grid grid-cols-3 gap-2">
                {COMBO_SIDE_ITEMS.map((side) => {
                  const included = !removedSides.includes(side);
                  return <button key={side} type="button" aria-pressed={included} onClick={() => setRemovedSides((list) => (included ? [...list, side] : list.filter((item) => item !== side)))}
                    className={`flex min-h-[48px] min-w-0 items-center justify-center gap-1 rounded-md border px-1 text-[14px] font-semibold ${included ? 'border-brand-500 bg-brand-50 text-ink' : 'border-line-strong text-ink-muted line-through'}`}>
                    {included ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <X className="h-4 w-4 shrink-0" aria-hidden="true" />}{side}
                  </button>;
                })}
              </div>
            </div>}
            <div><label htmlFor="pm-notes" className="mb-2 block text-[17px] font-semibold">Observação</label><input id="pm-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
              onFocus={(e) => { const el = e.currentTarget; window.setTimeout(() => scrollToCenter(el), 300); }} placeholder="Ex.: pouco sal" className={inputCls} /></div>
            {err && <Alert>{err}</Alert>}
          </div>
          <div className="flex items-center gap-3 border-t border-line px-5 pt-3 lg:px-7 lg:pb-5" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
            <div className="flex h-[52px] shrink-0 items-center rounded-md border border-line-strong bg-surface">
              <button type="button" aria-label="Diminuir" onClick={() => setQty((q) => Math.max(1, q - 1))} className="flex h-[52px] w-11 items-center justify-center text-ink-muted"><Minus className="h-5 w-5" /></button>
              <span className="w-9 text-center text-[17px] font-semibold tabular-nums">{qty}</span>
              <button type="button" aria-label="Aumentar" onClick={() => setQty((q) => q + 1)} className="flex h-[52px] w-11 items-center justify-center text-brand-500"><Plus className="h-5 w-5" /></button>
            </div>
            <Button size="lg" block onClick={submit} aria-disabled={missingDoneness || missingRice} className={`min-w-0 px-2 text-[15px] font-semibold leading-tight min-[360px]:whitespace-nowrap`}>{missingDoneness ? 'Escolha o ponto da carne' : missingRice ? (flavors.length ? 'Escolha o sabor' : 'Escolha o arroz') : `${initial ? 'Salvar' : 'Adicionar'} · ${formatBRL(product.price * qty)}`}</Button>
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
  const deliveryEta = settings.delivery_eta?.trim() || DEFAULT_DELIVERY_ETA;
  const pickupEta = settings.pickup_eta?.trim() || DEFAULT_PICKUP_ETA;
  const isDesktop = useIsDesktop();
  const isOpen = currentShift?.status === 'ABERTO';

  const [step, setStep] = useState<Step>('menu');
  const [orderMode, setOrderMode] = useState<OrderMode>('DELIVERY');
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
  const [editingItem, setEditingItem] = useState<(typeof cart)[number] | null>(null);
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

  const stockOf = (p: Product) => {
    const availability = getProductAvailability(p, dailyPrepStock.find((s) => s.product_id === p.id));
    return comboBlockedByBase(p, products, dailyPrepStock) ? { ...availability, isAvailable: false } : availability;
  };
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    return products.filter((p) => p.active && (!q || `${p.name} ${p.description || ''}`.toLocaleLowerCase('pt-BR').includes(q)));
  }, [products, query]);
  const catName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  // Espeto com a versão "com acompanhamento": o combo sai da lista e vira opção do card
  const comboOf = useMemo(() => {
    const byName = new Map(products.filter((p) => p.active && COMBO_SUFFIX.test(p.name)).map((p) => [p.name.replace(COMBO_SUFFIX, '').trim().toLowerCase(), p]));
    return new Map(products.filter((p) => p.active && !COMBO_SUFFIX.test(p.name) && byName.has(p.name.trim().toLowerCase())).map((p) => [p.id, byName.get(p.name.trim().toLowerCase())!]));
  }, [products]);
  const groups = useMemo(() => {
    const merged = new Set([...comboOf.values()].map((p) => p.id));
    const baseOfCombo = new Map([...comboOf].map(([baseId, combo]) => [combo.id, baseId]));
    // Busca achou só o combo: mostra o card do espeto, que tem as duas opções
    const shown = visible.filter((p) => !merged.has(p.id) || !visible.some((v) => v.id === baseOfCombo.get(p.id)));
    return CATEGORY_ORDER.map((c) => ({ name: c, items: shown.filter((p) => categoryOf(p, catName.get(p.category_id)) === c) })).filter((g) => g.items.length);
  }, [visible, catName, comboOf]);
  const qtyInCart = (id: string) => cart.filter((c) => c.productId === id).reduce((s, c) => s + c.quantity, 0);
  const count = cart.reduce((s, c) => s + c.quantity, 0);
  const subtotal = cart.reduce((s, c) => s + c.product.price * c.quantity, 0);
  const isPickup = orderMode !== 'DELIVERY';
  const isDineIn = orderMode === 'DINE_IN';
  const orderType: DeliveryOrderType = isPickup ? 'PICKUP' : 'DELIVERY';
  const localLabel = isDineIn ? 'Consumir no local' : 'Retirada no local';
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
  // No início da página vale a 1ª categoria, mesmo se a lista mudar depois de carregar
  useEffect(() => { if (groups[0] && (!activeCat || window.scrollY < 80)) setActiveCat(groups[0].name); }, [groups]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const chip = document.getElementById(`chip-${slug(activeCat)}`);
    const bar = chip?.parentElement;
    if (chip && bar) bar.scrollTo({ left: chip.offsetLeft - bar.clientWidth / 2 + chip.clientWidth / 2, behavior: 'smooth' });
  }, [activeCat]);
  // No topo da página vale sempre a 1ª categoria
  useEffect(() => {
    if (step !== 'menu') return;
    const onScroll = () => { if (window.scrollY < 200 && groups[0]) setActiveCat(groups[0].name); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [groups, step]);
  const jumpTo = (cat: string) => {
    setActiveCat(cat);
    const el = sectionsRef.current[cat];
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - (isDesktop ? 96 : 128), behavior: 'smooth' });
  };

  const tryAdd = (p: Product, qty: number, doneness: MeatDoneness | null = null, notes = '') => {
    try { addToCart(p, qty, doneness, notes); return null; }
    catch (e) { return e instanceof Error ? e.message.replace('não possui quantidade suficiente em estoque', 'não tem mais unidades disponíveis hoje') : 'Não foi possível adicionar.'; }
  };
  const juiceFlavors = settings.daily_juice_flavors ?? [];
  const onPlus = (p: Product) => {
    setMenuError(null);
    if (p.allows_doneness) { setSheetProduct(p); return; }
    const e = tryAdd(p, 1); if (e) setMenuError(e);
  };

  useEffect(() => {
    if (!menuError) return;
    const id = window.setTimeout(() => setMenuError(null), 5000);
    return () => window.clearTimeout(id);
  }, [menuError]);

  const saveCustomer = (patch: Partial<Customer>) => setCustomer((c) => { const n = { ...c, ...patch }; try { localStorage.setItem(SAVED_KEY, JSON.stringify(n)); } catch { /* sem armazenamento */ } return n; });

  const validateDelivery = () => {
    if (!customer.name.trim()) return 'Informe o seu nome.';
    if (!isValidWhatsApp(customer.phone)) return 'Confira o WhatsApp com DDD.';
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
        shiftId: currentShift.id, orderType, notes: isDineIn ? DINE_IN_NOTE : undefined, customerName: customer.name.trim(), phone: customer.phone.trim(),
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

  /* ---------- telas ---------- */

  const statusLine = (
    <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-muted">
      <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${isOpen ? 'bg-emerald-600' : 'bg-rose-600'}`} />
      {isOpen ? `Aberto agora · ${isPickup ? pickupEta : deliveryEta}` : 'Fechado no momento'}
    </p>
  );
  const logo = <img src="/brand/logo-sabor-da-carne-288.webp" alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-full border border-[#e8b64a] object-cover" />;
  const searchBox = (
    <label className="relative block">
      <span className="sr-only">Buscar no cardápio</span>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-muted" />
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar no cardápio" className="h-11 w-full rounded-md border border-line bg-surface pl-10 pr-3 text-[16px] placeholder:text-ink-muted focus:border-brand-500 focus:outline-none" />
    </label>
  );

  const pickProduct = (p: Product) => (p.allows_doneness || COMBO_SUFFIX.test(p.name) || menuFlavors(p, juiceFlavors).length ? setSheetProduct(p) : onPlus(p));
  /** Tira a última linha do item na sacola. */
  const removeOne = (p: Product) => {
    const line = [...cart].reverse().find((c) => c.productId === p.id);
    if (line) updateCartQuantity(line.id, -1);
  };

  /** Uma opção de compra: caixa com rótulo e preço; depois do primeiro toque, mostra a quantidade. */
  const buyBox = (p: Product, label: string, featured = false) => {
    const { isAvailable } = stockOf(p);
    const soldOut = isOpen && !isAvailable;
    const q = qtyInCart(p.id);
    return (
      <div className="min-w-0 space-y-2">
        <button type="button" disabled={!isOpen || !isAvailable} onClick={() => pickProduct(p)} aria-label={`Adicionar ${p.name}, ${formatBRL(p.price)}`}
          className={`block min-h-[64px] w-full rounded-[10px] border px-3 py-2.5 text-left disabled:cursor-not-allowed ${featured ? 'border-brand-500 bg-brand-50' : 'border-line-strong'}`}>
          <span className={`block text-[13px] ${featured ? 'text-[#f0b9a8]' : 'text-ink-muted'}`}>{label}</span>
          {soldOut ? <StatusTag kind="alert" className="mt-1 text-[13px] font-semibold">Esgotado</StatusTag> : <span className={`mt-0.5 block text-[17px] font-semibold tabular-nums ${featured ? 'text-[#ff6a55]' : ''}`}>{formatBRL(p.price)}</span>}
        </button>
        {q > 0 && <div className="flex justify-center"><Stepper qty={q} label={p.name} onMinus={() => removeOne(p)} onPlus={() => pickProduct(p)} /></div>}
      </div>
    );
  };

  const productBody = (p: Product, priority = false) => {
    const combo = comboOf.get(p.id);
    const isCombo = COMBO_SUFFIX.test(p.name);
    const featuredCard = !!combo || isCombo;
    const soldOut = isOpen && !stockOf(p).isAvailable && (!combo || !stockOf(combo).isAvailable);
    const dailyJuices = !p.description && menuFlavors(p, juiceFlavors).length ? `Sabores: ${juiceFlavors.join(', ')}` : null;
    const description = dailyJuices ?? (p.description && !(isSidesDescription(p.description)) ? p.description : null);
    const title = <h3 className={`${display} text-[21px] font-semibold uppercase leading-tight tracking-[.3px]`}>{p.name.replace(COMBO_SUFFIX, '')}</h3>;
    // Espeto: foto grande e as duas opções, como no layout. Demais itens: linha compacta para a página não ficar enorme
    if (featuredCard) return (
      <article className="overflow-hidden rounded-2xl border border-line bg-surface-soft">
        <Photo product={p} priority={priority} className={`aspect-video w-full ${soldOut ? 'opacity-50 grayscale' : ''}`} />
        <div className="p-4">
          {title}
          {description && <p className="mt-1 line-clamp-2 text-[14px] leading-[1.4] text-ink-muted">{description}</p>}
          <div className={`mt-3 grid gap-2.5 ${combo ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {combo ? <>{buyBox(p, 'Só o espeto')}{buyBox(combo, 'Completo', true)}</> : buyBox(p, 'Completo', true)}
          </div>
        </div>
      </article>
    );
    return (
      <article className="flex gap-3 rounded-2xl border border-line bg-surface-soft p-3">
        <Photo product={p} variant="s" className={`h-[92px] w-[92px] shrink-0 rounded-[10px] ${soldOut ? 'opacity-50 grayscale' : ''}`} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-semibold leading-snug">{p.name}</h3>
          {description && <p className="mt-0.5 line-clamp-2 text-[13px] leading-[1.35] text-ink-muted">{description}</p>}
          <div className="mt-2">{buyBox(p, 'Adicionar')}</div>
        </div>
      </article>
    );
  };

  const productRow = (p: Product, index = 9) => <li key={p.id}>{productBody(p, index < 2)}</li>;

  const productCard = (p: Product, index = 9) => <div key={p.id}>{productBody(p, index < 4)}</div>;

  const cartLines = (compact = false) => (
    <ul className="divide-y divide-surface-muted">
      {cart.map((item) => (
        <li key={item.id} className={`flex items-center gap-3 ${compact ? 'py-3' : 'py-4'}`}>
          <div className="min-w-0 flex-1">
            <p className={`${compact ? 'text-[15px]' : 'text-[16px]'} font-semibold leading-snug`}>{item.product.name}</p>
            {(item.doneness || item.notes) && <p className="mt-0.5 text-[14px] text-ink-muted">{[item.doneness && formatDoneness(item.doneness), item.notes && `“${item.notes}”`].filter(Boolean).join(' · ')}</p>}
            <p className="mt-0.5 text-[15px] font-semibold tabular-nums">{formatBRL(item.product.price * item.quantity)}</p>
          </div>
          <Stepper size={44} qty={item.quantity} onMinus={() => updateCartQuantity(item.id, -1)} onPlus={() => { setCartError(null); const e = tryAdd(item.product, 1, item.doneness ?? null, item.notes || ''); if (e) setCartError(e); }} />
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
        <p className={`rounded-md border border-line bg-canvas px-3 py-2.5 text-[14px] text-ink-secondary ${twoCols ? 'col-span-2' : ''}`}>{isDineIn ? 'Você consome aqui na loja. Avisamos no WhatsApp quando estiver pronto.' : 'Avisamos no WhatsApp quando estiver pronto para buscar.'}{settings.address && <> Endereço: <strong className="font-semibold">{settings.address}</strong></>}</p>
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
          <div key={m.id} className={`rounded-md bg-surface ${on ? 'border-2 border-brand-500 p-[15px]' : 'border border-line p-4'}`}>
            <button type="button" role="radio" aria-checked={on} onClick={() => { setPayment(m.id); setFormError(null); }} className="flex w-full items-start gap-3 text-left">
              <Radio on={on} />
              <span><span className="block text-[16px] font-semibold">{m.id === 'CARTAO_ENTREGA' && isPickup ? 'Cartão no local' : m.label}</span><span className="mt-0.5 block text-[14px] text-ink-muted">{m.id === 'DINHEIRO' && isPickup ? 'Pague no balcão' : m.hint}</span></span>
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
      className={`min-h-[44px] rounded-md px-3.5 text-[15px] ${on ? 'border-2 border-brand-500 bg-brand-50 font-semibold text-ink' : 'border border-line-strong bg-surface font-medium text-ink-secondary'}`}>{label}</button>
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
      <div className="flex justify-between text-ink-secondary"><span>{isPickup ? localLabel : zone ? `Entrega · ${zone.name}` : 'Entrega'}</span><span className="tabular-nums">{isPickup ? 'Grátis' : zone ? formatBRL(fee) : 'escolha o bairro'}</span></div>
      <div className="flex justify-between border-t border-line pt-3 font-semibold" style={{ fontSize: big }}><span>Total</span><span className="tabular-nums">{formatBRL(total)}</span></div>
    </div>
  );

  const closedNotice = !isOpen && <ClosedNotice />;

  const trackingBanner = tracking && (
    <button type="button" onClick={() => go('sent')} className="flex w-full items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3 text-left">
      <span><span className="block font-mono text-[13px] text-ink-muted">Pedido #{tracking.order_number}</span><span className="block text-[15px] font-semibold">Acompanhar o seu pedido</span></span>
      <span className="text-[14px] font-semibold text-brand-700">Ver</span>
    </button>
  );

  let screen: ReactNode;

  if (step === 'sent' && activeTrackingOrder) {
    const o = activeTrackingOrder;
    const showPixColumn = o.payment_method === 'PIX' && !o.paid_at && !['DELIVERED', 'CANCELLED'].includes(o.status);
    screen = isDesktop ? (
      <div className="min-h-screen px-12 py-10">
        <div className={`mx-auto grid max-w-[1000px] gap-10 rounded-2xl border border-line bg-surface p-8 ${showPixColumn ? 'grid-cols-[420px_1fr]' : 'max-w-[620px]'}`}>
          {showPixColumn && <div className="space-y-4 border-r border-surface-muted pr-10"><h2 className="text-[24px] font-semibold">Pague o PIX</h2><p className="text-[15px] text-ink-muted">Pague pelo app do seu banco. Seu pedido já foi para o preparo.</p><OrderPixBlock order={o} /></div>}
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
            <h2 className="mt-1 text-[24px] font-semibold">Pague o PIX</h2>
            <p className="mx-auto mt-2 max-w-sm text-[15px] text-ink-muted">Pague pelo app do seu banco. Seu pedido já foi para o preparo.</p>
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
        <TopBar title="Sua sacola" onBack={back} />
        <div className="space-y-7 px-4 pb-6 pt-5">
          {cartError && <Alert>{cartError}</Alert>}
          {closedNotice}
          <section className="space-y-3">
            <h2 className="text-[13px] uppercase tracking-[.08em] text-ink-muted">Seu pedido</h2>
            {cart.length ? cart.map((item) => (
              <article key={item.id} className="rounded-xl border border-line bg-surface-soft p-4">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[17px] font-semibold leading-snug">{item.product.name}</h3>
                    {(item.doneness || item.notes) && <p className="mt-1 text-[14px] text-ink-muted">{[item.doneness && formatDoneness(item.doneness), item.notes && `“${item.notes}”`].filter(Boolean).join(' · ')}</p>}
                  </div>
                  <p className="whitespace-nowrap text-[16px] font-semibold tabular-nums">{formatBRL(item.product.price * item.quantity)}</p>
                </div>
                <div className="mt-3.5 flex items-center justify-between border-t border-line pt-3">
                  <button type="button" onClick={() => setEditingItem(item)} className="min-h-[44px] text-[14px] text-ink-muted underline">Editar item</button>
                  <Stepper qty={item.quantity} label={item.product.name} onMinus={() => updateCartQuantity(item.id, -1)} onPlus={() => { setCartError(null); const e = tryAdd(item.product, 1, item.doneness ?? null, item.notes || ''); if (e) setCartError(e); }} />
                </div>
              </article>
            )) : <p className="py-10 text-center text-[15px] text-ink-muted">Sua sacola está vazia.</p>}
            <button type="button" onClick={back} className="flex min-h-[44px] items-center gap-1.5 text-[16px] font-medium text-[#e2b04a]"><Plus className="h-4 w-4" />Adicionar mais itens</button>
          </section>
          {drinks.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[13px] uppercase tracking-[.08em] text-ink-muted">Que tal uma bebida?</h2>
              <ul className="space-y-2" aria-label="Bebidas sugeridas">
                {drinks.slice(0, 3).map((d) => {
                  const q = qtyInCart(d.id);
                  return (
                    <li key={d.id} className="grid grid-cols-[56px_1fr_auto] items-center gap-3 rounded-xl border border-line bg-surface-soft p-2.5">
                      <Photo product={d} variant="s" className="h-14 w-14 rounded-lg" />
                      <div className="min-w-0"><p className="text-[15px] font-medium leading-snug">{d.name}</p><p className="mt-0.5 text-[14px] tabular-nums text-ink-muted">{formatBRL(d.price)}</p></div>
                      <button type="button" onClick={() => { if (menuFlavors(d, juiceFlavors).length) { setSheetProduct(d); return; } const e = tryAdd(d, 1); setCartError(e); }} aria-label={`Adicionar ${d.name}, ${formatBRL(d.price)}`} className="flex h-11 min-w-[44px] items-center justify-center rounded-full bg-brand-500 px-2 text-[15px] font-semibold text-white">{q > 0 ? q : <Plus className="h-5 w-5" />}</button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
        <Footer>
          <div className="mb-3 flex justify-between text-[15px]"><span className="text-ink-secondary">Subtotal · {count} {count === 1 ? 'item' : 'itens'}</span><span className="font-semibold tabular-nums">{formatBRL(subtotal)}</span></div>
          {isOpen ? (
            <Button size="lg" block disabled={!cart.length} onClick={() => { setCartError(null); go('delivery'); }} className="font-semibold">Continuar</Button>
          ) : (
            <div className="space-y-1.5 text-center">
              <Button size="lg" block disabled className="font-semibold opacity-60">Loja fechada no momento</Button>
              <p className="text-xs text-ink-muted">Aguarde o início do expediente para enviar seu pedido.</p>
            </div>
          )}
        </Footer>
      </div>
    );
  } else if (step === 'delivery') {
    screen = (
      <div className="mx-auto max-w-xl pb-44">
        <TopBar title={isPickup ? localLabel : 'Entrega'} onBack={back} />
        <Progress n={1} />
        <div className="space-y-5 px-5 pt-5">
          <Segmented label="Como você quer receber" value={orderMode} onChange={setOrderMode} options={MODE_OPTIONS} />
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
          {block(isPickup ? (isDineIn ? 'Consumir em' : 'Retirar em') : 'Entregar em', () => window.history.go(-2), isPickup
            ? <p className="text-[16px]">{settings.address || 'Na loja'}<span className="block text-[14px] text-ink-muted">Pronto em {pickupEta} · {customer.name}</span></p>
            : <p className="text-[16px]">{customer.street}, {customer.number}{customer.complement ? ` · ${customer.complement}` : ''}<span className="block text-[14px] text-ink-muted">{customer.neighborhood} · {deliveryEta} · {customer.name}</span></p>)}
          {block('Pagamento', back, <p className="text-[16px]">{paymentSummary}</p>)}
          {block('Itens', () => window.history.go(-3), <ul className="space-y-2.5">{cart.map((c) => <li key={c.id} className="flex justify-between gap-3 text-[15px]"><span className="min-w-0">{c.quantity}× {c.product.name}{(c.doneness || c.notes) && <span className="mt-0.5 block text-[14px] text-ink-muted">{c.doneness && formatDoneness(c.doneness)}{c.doneness && c.notes && <br />}{c.notes && `“${c.notes}”`}</span>}</span><span className="shrink-0 tabular-nums">{formatBRL(c.product.price * c.quantity)}</span></li>)}</ul>)}
          <div className="pt-4">{totals()}</div>
          {closedNotice && <div className="pt-4">{closedNotice}</div>}
          {formError && <div className="pt-4"><Alert>{formError}</Alert></div>}
        </div>
        <Footer>
          <Button size="lg" block disabled={sending || !cart.length || !isOpen} onClick={() => void send()} className="font-semibold">{!isOpen ? 'Loja fechada no momento' : sending ? 'Enviando...' : `Enviar pedido · ${formatBRL(total)}`}</Button>
          <p className="mt-2 text-center text-[13px] text-ink-muted">A confirmação chega no seu WhatsApp.</p>
        </Footer>
      </div>
    );
  } else if (step === 'checkout') {
    const num = (n: number) => <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-surface">{n}</span>;
    screen = (
      <div className="min-h-screen">
        <header className="border-b border-line bg-surface"><div className="mx-auto flex h-[76px] max-w-[1366px] items-center gap-4 px-12"><button type="button" onClick={back} aria-label="Voltar ao cardápio" className="flex h-11 w-11 items-center justify-center rounded-md hover:bg-surface-muted"><ChevronLeft className="h-6 w-6" /></button><h1 className="text-[24px] font-semibold">Finalizar pedido</h1></div></header>
        <div className="mx-auto grid max-w-[1366px] grid-cols-[1fr_400px] gap-12 px-12 py-7">
          <div className="space-y-10">
            <section>
              <h2 className="mb-4 flex items-center gap-3 text-[20px] font-semibold">{num(1)}Como você quer receber?</h2>
              <div className="mb-5 grid grid-cols-3 gap-3">
                {MODE_OPTIONS.map((m) => m.id).map((t) => <button key={t} type="button" role="radio" aria-checked={orderMode === t} onClick={() => setOrderMode(t)} className={`flex items-center gap-3 rounded-md bg-surface text-left ${orderMode === t ? 'border-2 border-brand-500 p-[15px]' : 'border border-line p-4'}`}><Radio on={orderMode === t} /><span><span className="block text-[16px] font-semibold">{MODE_OPTIONS.find((m) => m.id === t)!.label}</span><span className="block text-[14px] text-ink-muted">{t === 'DELIVERY' ? `${deliveryEta}${zones.length ? ` · a partir de ${formatBRL(minFee)}` : ''}` : `${pickupEta} · sem taxa`}</span></span></button>)}
              </div>
              {deliveryFields(true)}
            </section>
            <section><h2 className="mb-4 flex items-center gap-3 text-[20px] font-semibold">{num(2)}Pagamento</h2>{paymentOptions(true)}</section>
          </div>
          <aside className="sticky top-6 h-fit space-y-4 rounded-md border border-line bg-surface p-5">
            <h2 className="text-[20px] font-semibold">Resumo do pedido</h2>
            {cartError && <Alert>{cartError}</Alert>}
            {cartLines(true)}
            <p className="rounded-md border border-line bg-canvas px-3 py-2 text-[13px] text-ink-secondary">O que você tirou do acompanhamento aparece no item, acima.</p>
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
            <div className="min-w-0 flex-1"><h1 className="truncate text-[20px] font-semibold">{settings.name}</h1>{statusLine}</div>
            <div className="w-[320px]">{searchBox}</div>
          </div>
        </header>
        <div className="mx-auto grid max-w-[1366px] grid-cols-[180px_1fr_320px] xl:grid-cols-[200px_1fr_360px]">
          <nav aria-label="Categorias" className="sticky top-[76px] h-[calc(100vh-76px)] space-y-1 overflow-y-auto px-4 py-6">
            {groups.map((g) => <button key={g.name} type="button" onClick={() => jumpTo(g.name)} aria-current={activeCat === g.name ? 'true' : undefined} className={`block w-full rounded-2xl px-3 py-2.5 text-left text-[15px] ${activeCat === g.name ? 'bg-brand-500 font-semibold text-white' : 'text-ink-secondary hover:bg-surface-muted'}`}>{g.name}</button>)}
          </nav>
          <main className="min-w-0 space-y-8 border-l border-line px-8 py-6">
            {trackingBanner}
            {closedNotice}
            {groups.length === 0 && <p className="py-16 text-center text-[16px] text-ink-muted">Nada encontrado para “{query}”.</p>}
            {groups.map((g) => (
              <section key={g.name} data-cat={g.name} ref={(el) => { sectionsRef.current[g.name] = el; }}>
                <h2 className={`${display} text-[26px] font-semibold uppercase tracking-[.5px] ${g.name === ESPETOS ? '' : 'mb-4'}`}>{g.name}</h2>
                {g.name === ESPETOS && <p className="mb-4 mt-2.5 rounded-[10px] border border-[#4d3c22] bg-[#2a2116] px-3 py-2.5 text-[13.5px] text-[#f0d9a8]">{COMBO_SIDES}</p>}
                <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">{g.items.map((p, i) => productCard(p, g === groups[0] ? i : 9))}</div>
              </section>
            ))}
          </main>
          <aside className="sticky top-[76px] flex h-[calc(100vh-76px)] flex-col border-l border-line bg-surface">
            <h2 className="px-5 pb-2 pt-6 text-[20px] font-semibold">Sua sacola</h2>
            <div className="flex-1 overflow-y-auto px-5">
              {cartError && <Alert>{cartError}</Alert>}
              {cart.length ? cartLines(true) : <p className="py-10 text-center text-[15px] text-ink-muted">Escolha os itens no cardápio.</p>}
            </div>
            <div className="space-y-2 border-t border-line p-5 text-[15px]">
              <div className="flex justify-between"><span className="text-ink-secondary">Subtotal</span><span className="font-semibold tabular-nums">{formatBRL(subtotal)}</span></div>
              <p className="text-[14px] text-ink-muted">{isPickup ? `${localLabel}: sem taxa` : 'Entrega: calculada no bairro'}</p>
              <Button size="lg" block disabled={!cart.length || !isOpen} onClick={() => go('checkout')} className="mt-2 font-semibold">{!isOpen ? 'Loja fechada no momento' : `Finalizar pedido · ${formatBRL(subtotal)}`}</Button>
            </div>
          </aside>
        </div>
      </div>
    );
  } else {
    screen = (
      <div className="mx-auto max-w-xl pb-32 md:max-w-4xl">
        <header className="pb-1">
          {/* Brasa acesa atrás da logo */}
          <div aria-hidden="true" className="h-[170px]" style={{ background: 'radial-gradient(circle at 50% 100%,rgba(255,170,70,.55) 0%,rgba(232,96,40,.45) 18%,rgba(196,38,31,.28) 38%,rgba(120,30,20,.12) 58%,rgba(23,18,15,0) 78%)', WebkitMaskImage: 'linear-gradient(180deg,#000 60%,transparent 100%)', maskImage: 'linear-gradient(180deg,#000 60%,transparent 100%)' }} />
          <div className="relative -mt-[110px] flex flex-col items-center px-5">
            <div className="rounded-full bg-surface p-[5px] shadow-[0_0_0_1px_rgba(232,182,74,.4),0_0_40px_rgba(232,120,40,.35)]"><img src="/brand/logo-sabor-da-carne-288.webp" alt="" width={128} height={128} className="h-32 w-32 rounded-full border-2 border-[#e8b64a] object-cover" /></div>
            <h1 className={`${display} mt-4 text-center text-[21px] font-semibold uppercase leading-tight tracking-[1px]`}>{settings.name}</h1>
            <p className="mt-2 flex items-center gap-2.5 text-[12px] uppercase tracking-[3px] text-[#e8b64a]"><span aria-hidden="true" className="h-px w-7 bg-[#e8b64a]/50" />Espetos na brasa<span aria-hidden="true" className="h-px w-7 bg-[#e8b64a]/50" /></p>
          </div>
          <div className="mt-[18px] space-y-3 px-5">
            <p className={`flex items-center gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-[14px] ${isOpen ? 'border-line bg-surface-soft' : 'border-[#4a2620] bg-[#2a1a16]'}`}><span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${isOpen ? 'bg-emerald-500' : 'bg-[#d8382f]'}`} />{isOpen ? <span><b className="font-semibold">Aberto agora</b> · {isPickup ? pickupEta : deliveryEta}</span> : <span><b className="font-semibold">Fechado</b> · abre {new Date().getHours() < STORE_OPENS_AT ? 'hoje' : 'amanhã'} às {STORE_OPENS_AT}h</span>}</p>
            
            {searchBox}
          </div>
        </header>
        <nav aria-label="Categorias" className="no-scrollbar sticky top-0 z-20 mt-2 flex gap-2 overflow-x-auto border-b border-line bg-surface px-5 py-3">
          {groups.map((g) => <button id={`chip-${slug(g.name)}`} key={g.name} type="button" onClick={() => jumpTo(g.name)} aria-current={activeCat === g.name ? 'true' : undefined} className={`min-h-[44px] shrink-0 rounded-md border px-4 text-[15px] ${activeCat === g.name ? 'border-brand-500 bg-brand-500 font-semibold text-white' : 'border-line-strong bg-surface text-ink-secondary'}`}>{g.name}</button>)}
        </nav>
        <main className="space-y-8 px-5 pt-5">
          {trackingBanner}
          {groups.length === 0 && <p className="py-16 text-center text-[16px] text-ink-muted">Nada encontrado para “{query}”.</p>}
          {groups.map((g) => (
            <section key={g.name} data-cat={g.name} ref={(el) => { sectionsRef.current[g.name] = el; }}>
              <h2 className={`${display} text-[26px] font-semibold uppercase tracking-[.5px]`}>{g.name}</h2>
              {g.name === ESPETOS && <p className="mt-2.5 rounded-[10px] border border-[#4d3c22] bg-[#2a2116] px-3 py-2.5 text-[13.5px] text-[#f0d9a8]">{COMBO_SIDES}</p>}
              <ul className={`mt-4 grid grid-cols-1 md:grid-cols-2 ${g.name === ESPETOS ? 'gap-5' : 'gap-3'}`}>{g.items.map((p, i) => productRow(p, g === groups[0] ? i : 9))}</ul>
            </section>
          ))}
        </main>
        {/* Barra do carrinho flutuante: acessível de qualquer ponto da rolagem */}
        {count > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-30 px-4" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
            <button type="button" onClick={() => { setCartError(null); go('cart'); }}
              className="mx-auto flex h-14 w-full max-w-xl items-center justify-between gap-3 rounded-[14px] bg-brand-500 px-5 text-[17px] font-semibold text-white shadow-[0_8px_24px_rgba(43,33,28,.35)] active:opacity-90">
              <span className="truncate">Ver pedido · {count} {count === 1 ? 'item' : 'itens'}</span>
              <span className="shrink-0 tabular-nums">{formatBRL(subtotal)}</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="menu-dark min-h-screen bg-surface font-sans text-ink">
      {screen}
      {/* Erro ao adicionar: fica à vista em qualquer ponto da rolagem */}
      {menuError && step === 'menu' && <div className="fixed inset-x-4 bottom-[88px] z-40 mx-auto max-w-md lg:bottom-6"><Alert>{menuError}</Alert></div>}
      {editingItem && (
        <ProductSheet key={editingItem.id} product={editingItem.product} riceOptions={settings.daily_rice_flavors ?? []} juiceOptions={juiceFlavors} initial={{ qty: editingItem.quantity, doneness: editingItem.doneness ?? null, notes: editingItem.notes || '' }} onClose={() => setEditingItem(null)}
          onAdd={(q, d, n) => {
            // Troca o item: se o estoque recusar, o item antigo volta como estava
            updateCartQuantity(editingItem.id, -editingItem.quantity);
            const e = tryAdd(editingItem.product, q, d, n);
            if (e) tryAdd(editingItem.product, editingItem.quantity, editingItem.doneness ?? null, editingItem.notes || '');
            else setEditingItem(null);
            return e;
          }} />
      )}
      {sheetProduct && (
        <ProductSheet product={sheetProduct} riceOptions={settings.daily_rice_flavors ?? []} juiceOptions={juiceFlavors} onClose={() => setSheetProduct(null)} onAdd={(q, d, n) => { const e = tryAdd(sheetProduct, q, d, n); if (!e) setSheetProduct(null); return e; }} />
      )}
    </div>
  );
}
