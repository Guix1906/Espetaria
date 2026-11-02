import { Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatBRL } from '../../lib/formatters';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useStockStore } from '../../stores/useStockStore';
import type { MeatDoneness } from '../../types/enums';
import type { Product } from '../../types/domain';
import { CATEGORY_ORDER, DONENESS, categoryOf } from './PublicMenuApp';

interface TableInfo { table_number: number; waiting_bill: boolean; is_open: boolean }
interface Line { key: string; product: Product; quantity: number; doneness: MeatDoneness | null }

const newKey = () => crypto.randomUUID();

/** Pedido do cliente pelo QR Code da mesa: entra na comanda como um pedido do salão. */
export function TableOrderPage({ token }: { token: string }) {
  const loadPublicMenu = useDeliveryStore((s) => s.loadPublicMenu);
  const products = useStockStore((s) => s.products);
  const categories = useStockStore((s) => s.categories);
  const stock = useStockStore((s) => s.dailyPrepStock);
  const [info, setInfo] = useState<TableInfo | null | undefined>(undefined);
  const [lines, setLines] = useState<Line[]>([]);
  const [choosing, setChoosing] = useState<Product | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNumber, setSentNumber] = useState<number | null>(null);
  // Mesma chave nas repetições: enviar duas vezes não duplica o pedido
  const orderKey = useRef(newKey());

  const load = async () => {
    if (!isSupabaseConfigured) { setInfo(null); return; }
    const { data, error: rpcError } = await supabase.rpc('get_table_qr_info', { p_token: token });
    setInfo(rpcError ? null : (data as TableInfo | null));
    await loadPublicMenu().catch(() => setError('Não foi possível atualizar o cardápio.'));
  };
  useEffect(() => {
    document.title = 'Pedido na mesa';
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const groups = useMemo(() => {
    const byName = new Map(categories.map((c) => [c.id, c.name]));
    const map = new Map<string, Product[]>();
    products.filter((p) => p.active && p.available).forEach((p) => {
      const name = categoryOf(p, byName.get(p.category_id));
      map.set(name, [...(map.get(name) ?? []), p]);
    });
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ name: c, items: map.get(c)! }));
  }, [products, categories]);

  const remaining = (product: Product, except = 0) => {
    if (!product.tracks_stock) return Infinity;
    const inCart = lines.filter((l) => l.product.id === product.id).reduce((s, l) => s + l.quantity, 0) - except;
    return (stock.find((s) => s.product_id === product.id)?.current_quantity ?? 0) - inCart;
  };

  const add = (product: Product, doneness: MeatDoneness | null) => {
    if (remaining(product) <= 0) return;
    const key = `${product.id}:${doneness ?? ''}`;
    setLines((cur) => cur.some((l) => l.key === key)
      ? cur.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l))
      : [...cur, { key, product, quantity: 1, doneness }]);
    setChoosing(null);
  };
  const change = (key: string, delta: number) =>
    setLines((cur) => cur.flatMap((l) => {
      if (l.key !== key) return [l];
      if (delta > 0 && remaining(l.product) <= 0) return [l];
      const quantity = l.quantity + delta;
      return quantity > 0 ? [{ ...l, quantity }] : [];
    }));

  const total = lines.reduce((s, l) => s + l.product.price * l.quantity, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  const send = async () => {
    setSending(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('create_table_qr_order', {
      p_token: token,
      p_idempotency_key: orderKey.current,
      p_items: lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity, doneness: l.doneness })),
    });
    setSending(false);
    if (rpcError) {
      setError(rpcError.message);
      void load();
      return;
    }
    setSentNumber((data as { order_number: number }).order_number);
    setLines([]);
    setReviewing(false);
    orderKey.current = newKey();
    void load();
  };

  const page = 'min-h-[100dvh] bg-canvas text-ink';
  const centered = (title: string, text: string) => (
    <main className={`${page} flex flex-col items-center justify-center gap-2 p-6 text-center`}>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="max-w-sm text-[15px] text-ink-secondary">{text}</p>
    </main>
  );

  if (info === undefined) return centered('Carregando...', 'Só um instante.');
  if (info === null) return centered('QR Code inválido', 'Chame o garçom para fazer o seu pedido.');
  if (!info.is_open) return centered('Ainda não abrimos', 'Chame o garçom para mais informações.');
  if (info.waiting_bill) return centered(`Mesa ${info.table_number}`, 'A conta desta mesa já foi pedida. Para pedir mais, chame o garçom.');

  if (sentNumber !== null) {
    return (
      <main className={`${page} flex flex-col items-center justify-center gap-3 p-6 text-center`}>
        <h1 className="text-2xl font-semibold">Pedido enviado</h1>
        <p className="text-[15px] text-ink-secondary">Pedido #{sentNumber} da mesa {info.table_number}. Já está indo para a produção.</p>
        <p className="text-[15px] text-ink-secondary">Para pagar, é só chamar o garçom.</p>
        <button type="button" className="btn-primary min-h-[44px]" onClick={() => setSentNumber(null)}>Pedir mais</button>
      </main>
    );
  }

  return (
    <main className={`${page} pb-28`}>
      <header className="sticky top-0 z-10 border-b border-line bg-surface px-4 py-3">
        <h1 className="text-xl font-semibold">Mesa {info.table_number}</h1>
        <p className="text-[13px] text-ink-muted">Escolha os itens e envie direto para a produção.</p>
      </header>
      {error && <p role="alert" className="mx-4 mt-3 rounded-md bg-rose-50 px-3 py-2 text-[15px] text-rose-900">{error}</p>}
      <div className="mx-auto max-w-2xl space-y-6 p-4">
        {groups.length === 0 && <p className="py-10 text-center text-ink-muted">Cardápio indisponível no momento. Chame o garçom.</p>}
        {groups.map((group) => (
          <section key={group.name} aria-label={group.name}>
            <h2 className="mb-2 text-lg font-semibold">{group.name}</h2>
            <ul className="space-y-2">
              {group.items.map((p) => {
                const soldOut = remaining(p) <= 0;
                return (
                  <li key={p.id} className="flex items-center gap-3 rounded-md border border-line bg-surface p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{p.name}</p>
                      {p.description && <p className="text-[13px] text-ink-muted">{p.description}</p>}
                      <p className="mt-0.5 font-mono text-sm">{formatBRL(p.price)}</p>
                    </div>
                    <button type="button" disabled={soldOut} aria-label={`Adicionar ${p.name}`} onClick={() => (p.allows_doneness ? setChoosing(p) : add(p, null))} className="btn-secondary min-h-[44px] shrink-0 px-3">
                      {soldOut ? 'Limite' : <Plus className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {count > 0 && !reviewing && (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface p-3">
          <button type="button" className="btn-primary min-h-[48px] w-full justify-center" onClick={() => setReviewing(true)}>Ver pedido · {count} {count === 1 ? 'item' : 'itens'} · {formatBRL(total)}</button>
        </div>
      )}

      {choosing && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={`Ponto da carne: ${choosing.name}`}>
          <div className="w-full max-w-md space-y-2 rounded-t-lg bg-surface p-4 sm:rounded-lg">
            <h2 className="text-lg font-semibold">{choosing.name}</h2>
            <p className="text-sm text-ink-muted">Escolha o ponto da carne</p>
            {DONENESS.map((d) => <button key={d.id} type="button" className="btn-secondary min-h-[44px] w-full justify-center" onClick={() => add(choosing, d.id)}>{d.label}</button>)}
            <button type="button" className="min-h-[44px] w-full text-sm font-medium text-ink-muted" onClick={() => setChoosing(null)}>Voltar</button>
          </div>
        </div>
      )}

      {reviewing && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Seu pedido">
          <div className="flex max-h-[90dvh] w-full max-w-md flex-col gap-3 rounded-t-lg bg-surface p-4 sm:rounded-lg">
            <h2 className="text-lg font-semibold">Seu pedido · Mesa {info.table_number}</h2>
            {error && <p role="alert" className="rounded-md bg-rose-50 px-3 py-2 text-[15px] text-rose-900">{error}</p>}
            <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
              {lines.map((l) => (
                <li key={l.key} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{l.product.name}</p>
                    {l.doneness && <p className="text-[13px] text-ink-muted">{DONENESS.find((d) => d.id === l.doneness)?.label}</p>}
                  </div>
                  <button type="button" className="icon-button h-11 w-11" aria-label={`Tirar um ${l.product.name}`} onClick={() => change(l.key, -1)}><Minus className="h-4 w-4" aria-hidden="true" /></button>
                  <span className="w-6 text-center font-mono font-semibold">{l.quantity}</span>
                  <button type="button" className="icon-button h-11 w-11" aria-label={`Mais um ${l.product.name}`} onClick={() => change(l.key, 1)}><Plus className="h-4 w-4" aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
            <p className="flex justify-between font-semibold"><span>Total</span><span className="font-mono">{formatBRL(total)}</span></p>
            <button type="button" className="btn-primary min-h-[48px] w-full justify-center" disabled={sending || count === 0} onClick={() => void send()}>{sending ? 'Enviando...' : 'Enviar pedido'}</button>
            <button type="button" className="min-h-[44px] w-full text-sm font-medium text-ink-muted" onClick={() => { setReviewing(false); setError(null); }}>Continuar escolhendo</button>
          </div>
        </div>
      )}
    </main>
  );
}
