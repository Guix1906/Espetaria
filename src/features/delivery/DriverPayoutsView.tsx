import { Bike, CheckCircle2, ChevronDown, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { EmptyState } from '../../components/ui/EmptyState';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { formatBRL } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { useDeliveryStore } from '../../stores/useDeliveryStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { payoutRows, summarizeDrivers, type DeliveryPayState, type DriverSummary, type PayoutOrder, type PayoutRecord } from './driverPayouts';

type Period = 'SHIFT' | 'WEEK' | 'MONTH';
const PERIODS: { id: Period; label: string; days?: number }[] = [
  { id: 'SHIFT', label: 'Turno atual' },
  { id: 'WEEK', label: '7 dias', days: 7 },
  { id: 'MONTH', label: '30 dias', days: 30 },
];
const STATE: Record<DeliveryPayState, { label: string; className: string }> = {
  TO_PAY: { label: 'A pagar', className: 'text-amber-800' },
  PAID: { label: 'Pago', className: 'text-emerald-700' },
  ON_ROUTE: { label: 'Em rota', className: 'text-ink-muted' },
};
const ORDER_COLUMNS = 'id, order_number, customer_name, address_neighborhood, driver_name, delivery_fee, status, shift_id, created_at, dispatched_at, delivered_at';

const moment = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '');
const parseMoney = (text: string) => { const clean = text.trim().replace(',', '.') || '0'; return /^\d+(\.\d{1,2})?$/.test(clean) ? Number(clean) : NaN; };

/** Cada entrega concluída soma no motoboy até o pagamento ser registrado. */
export function DriverPayoutsView() {
  const { notify, requestChoice } = useFeedback();
  const canManage = useAuthStore((s) => ['MASTER', 'GERENTE'].includes(s.currentProfile.role));
  const shiftId = useShiftStore((s) => s.currentShift?.id ?? null);
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const localOrders = useDeliveryStore((s) => s.deliveryOrders);
  const rates = { perDelivery: Number(settings.driver_per_delivery ?? 0), fixedPerShift: Number(settings.driver_fuel_fixed ?? 0) };

  const [period, setPeriod] = useState<Period>(shiftId ? 'SHIFT' : 'WEEK');
  const [orders, setOrders] = useState<PayoutOrder[]>([]);
  const [records, setRecords] = useState<PayoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [rateText, setRateText] = useState(() => rates.perDelivery.toFixed(2).replace('.', ','));
  const [fixedText, setFixedText] = useState(() => rates.fixedPerShift.toFixed(2).replace('.', ','));

  // Pedido que muda de etapa em qualquer aparelho atualiza a lista sozinho
  const changeKey = localOrders.map((o) => `${o.id}:${o.status}`).join('|');
  const since = useMemo(() => {
    const days = PERIODS.find((p) => p.id === period)?.days;
    return days ? new Date(Date.now() - days * 86400000).toISOString() : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, changeKey]);

  useEffect(() => {
    let alive = true;
    const scoped = period === 'SHIFT' ? shiftId : null;
    if (!isSupabaseConfigured) {
      setOrders(localOrders
        .filter((o) => o.order_type === 'DELIVERY' && (scoped ? o.shift_id === scoped : !since || o.created_at >= since))
        .map((o) => ({ ...o, driver_name: o.driver_name ?? null })) as PayoutOrder[]);
      setLoading(false);
      return;
    }
    if (period === 'SHIFT' && !shiftId) { setOrders([]); setRecords([]); setLoading(false); return; }
    setLoading(true);
    void (async () => {
      let orderQuery = supabase.from('delivery_orders').select(ORDER_COLUMNS).eq('order_type', 'DELIVERY').in('status', ['DELIVERED', 'OUT_FOR_DELIVERY']);
      let payoutQuery = supabase.from('driver_payouts').select('*');
      if (scoped) { orderQuery = orderQuery.eq('shift_id', scoped); payoutQuery = payoutQuery.eq('shift_id', scoped); }
      else if (since) { orderQuery = orderQuery.gte('created_at', since); payoutQuery = payoutQuery.gte('created_at', since); }
      const [ordersResult, payoutsResult] = await Promise.all([orderQuery.order('created_at', { ascending: false }).limit(1000), payoutQuery.limit(1000)]);
      if (!alive) return;
      if (ordersResult.error || payoutsResult.error) notify('Não foi possível carregar as entregas. Tente de novo.', 'error');
      else {
        setOrders((ordersResult.data ?? []) as unknown as PayoutOrder[]);
        setRecords((payoutsResult.data ?? []) as unknown as PayoutRecord[]);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, shiftId, since]);

  const drivers = summarizeDrivers(orders, records, rates);
  const delivered = drivers.reduce((sum, d) => sum + d.deliveries.filter((x) => x.state !== 'ON_ROUTE').length, 0);
  const toPay = drivers.reduce((sum, d) => sum + d.total, 0);
  const paidTotal = drivers.reduce((sum, d) => sum + d.paidTotal, 0);

  const saveRates = (event: FormEvent) => {
    event.preventDefault();
    const perDelivery = parseMoney(rateText);
    const fixed = parseMoney(fixedText);
    if (isNaN(perDelivery) || isNaN(fixed)) { notify('Informe valores válidos (ex.: 5 ou 5,50).', 'error'); return; }
    updateSettings({ driver_per_delivery: perDelivery, driver_fuel_fixed: fixed });
    notify('Valores salvos.', 'success');
  };

  const pay = async (driver: DriverSummary) => {
    const answer = await requestChoice({ title: `Pagar ${driver.name}`, message: `Registrar ${formatBRL(driver.total)} por ${driver.toPayCount} ${driver.toPayCount === 1 ? 'entrega' : 'entregas'}? Esse valor sai do faturamento líquido no Financeiro.`, choices: [{ value: 'yes', label: 'Registrar pagamento' }, { value: 'no', label: 'Voltar' }] });
    if (answer !== 'yes') return;
    const paidAt = new Date().toISOString();
    const rows = payoutRows(driver, records, rates, paidAt);
    setPaying(driver.key);
    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('driver_payouts').insert(rows).select('*');
        if (error) throw new Error(error.message);
        setRecords((current) => [...current, ...((data ?? []) as unknown as PayoutRecord[])]);
      } else {
        setRecords((current) => [...current, ...rows.map((row, i) => ({ ...row, id: `local-${paidAt}-${i}`, created_at: paidAt }))]);
      }
      notify(`Pagamento de ${driver.name} registrado.`, 'success');
    } catch {
      notify('Não foi possível registrar o pagamento. Nada foi alterado.', 'error');
    } finally {
      setPaying(null);
    }
  };

  const stat = (label: string, value: string, hint?: string, strong = false) => (
    <div className={`rounded-lg border p-4 ${strong && toPay > 0 ? 'border-amber-300 bg-amber-50' : 'border-line bg-surface'}`}>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1 font-mono text-2xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[13px] text-ink-muted">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[12rem] flex-1">
          <h2 className="text-xl font-semibold text-ink">Pagamento dos motoboys</h2>
          <p className="mt-0.5 text-sm text-ink-muted">{rates.perDelivery > 0 ? `${formatBRL(rates.perDelivery)} por entrega` : 'Cada entrega vale a taxa de entrega do pedido'}{rates.fixedPerShift > 0 ? ` + ${formatBRL(rates.fixedPerShift)} fixo por turno` : ''}</p>
        </div>
        <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-md bg-surface-muted p-1" role="group" aria-label="Período">
          {PERIODS.map((p) => <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)} className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-sm px-3 text-sm font-medium ${period === p.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted'}`}>{p.label}</button>)}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Resumo">
        {stat('Entregas concluídas', String(delivered))}
        {stat('A pagar', formatBRL(toPay), undefined, true)}
        {stat('Já pago', formatBRL(paidTotal))}
      </section>

      {period === 'SHIFT' && !shiftId && isSupabaseConfigured ? (
        <EmptyState title="Nenhum turno aberto" description="Escolha 7 ou 30 dias para ver as entregas já feitas." icon={Bike} />
      ) : loading ? (
        <p className="py-10 text-center text-sm text-ink-muted" role="status">Carregando entregas...</p>
      ) : drivers.length === 0 ? (
        <EmptyState title="Nenhuma entrega neste período" description="Quando um pedido sair para entrega com o nome do motoboy, ele aparece aqui e vai somando." icon={Bike} />
      ) : (
        <ul className="space-y-3" aria-label="Motoboys">
          {drivers.map((driver) => {
            const isOpen = Boolean(open[driver.key]);
            return (
              <li key={driver.key} className="overflow-hidden rounded-lg border border-line bg-surface">
                <div className="flex flex-wrap items-center gap-3 p-4">
                  <button type="button" onClick={() => setOpen((c) => ({ ...c, [driver.key]: !c[driver.key] }))} aria-expanded={isOpen} className="flex min-h-[44px] min-w-[12rem] flex-1 items-center gap-3 text-left">
                    <ChevronDown className={`h-5 w-5 shrink-0 text-ink-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-lg font-semibold text-ink">{driver.name}</span>
                      <span className="block text-sm text-ink-muted">{driver.toPayCount} a pagar · {driver.deliveries.length} no período{driver.paidTotal > 0 ? ` · já pago ${formatBRL(driver.paidTotal)}` : ''}</span>
                    </span>
                  </button>
                  <div className="flex w-full items-center justify-between gap-3 sm:ml-auto sm:w-auto">
                    <span className="text-left sm:text-right">
                      <span className="block text-[13px] text-ink-muted">A pagar</span>
                      <span className="block font-mono text-xl font-bold text-ink">{formatBRL(driver.total)}</span>
                    </span>
                    {canManage && (driver.toPayCount > 0 && driver.named
                      ? <button type="button" onClick={() => void pay(driver)} disabled={paying === driver.key} className="btn-primary min-h-[44px] shrink-0"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{paying === driver.key ? 'Registrando...' : 'Pagar'}</button>
                      : driver.named && <span className="shrink-0 text-sm font-semibold text-emerald-700">Em dia</span>)}
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-line">
                    <ul className="divide-y divide-line" aria-label={`Entregas de ${driver.name}`}>
                      {driver.deliveries.map(({ order, value, state }) => (
                        <li key={order.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[5rem_1fr_8rem_5rem_6rem]">
                          <span className="font-mono text-sm font-semibold text-ink">#{order.order_number}</span>
                          <span className="order-3 col-span-2 min-w-0 truncate text-sm text-ink-secondary sm:order-none sm:col-span-1">{order.customer_name}{order.address_neighborhood ? ` · ${order.address_neighborhood}` : ''}</span>
                          <span className="order-4 col-span-2 font-mono text-[13px] text-ink-muted sm:order-none sm:col-span-1">{moment(order.delivered_at ?? order.dispatched_at ?? order.created_at)}</span>
                          <span className={`order-5 col-span-2 text-[13px] font-semibold sm:order-none sm:col-span-1 ${STATE[state].className}`}>{STATE[state].label}</span>
                          <span className="text-right font-mono text-sm font-semibold text-ink">{formatBRL(value)}</span>
                        </li>
                      ))}
                    </ul>
                    {driver.fixedDue > 0 && (
                      <p className="flex justify-between gap-3 border-t border-line px-4 py-2.5 text-sm text-ink-secondary"><span>Entregas {formatBRL(driver.deliveriesValue)} + fixo por turno</span><span className="font-mono font-semibold text-ink">{formatBRL(driver.fixedDue)}</span></p>
                    )}
                    {!driver.named && <p className="border-t border-line px-4 py-2.5 text-sm text-amber-800">Estes pedidos saíram sem o nome do motoboy, então não entram em nenhum pagamento.</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <details className="group rounded-lg border border-line bg-surface">
          <summary className="flex min-h-[48px] cursor-pointer list-none items-center gap-2 px-4 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <Settings2 className="h-4 w-4 text-ink-muted" aria-hidden="true" /><span className="flex-1">Valores do pagamento</span>
            <ChevronDown className="h-4 w-4 text-ink-muted transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <form onSubmit={saveRates} className="grid gap-4 border-t border-line p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="block text-sm text-ink-secondary">Valor combinado por entrega (R$)
              <input inputMode="decimal" className="mt-1 block min-h-[44px] w-full rounded-md border px-3 font-mono" value={rateText} onChange={(e) => setRateText(e.target.value)} placeholder="0,00" />
            </label>
            <label className="block text-sm text-ink-secondary">Fixo por turno (R$)
              <input inputMode="decimal" className="mt-1 block min-h-[44px] w-full rounded-md border px-3 font-mono" value={fixedText} onChange={(e) => setFixedText(e.target.value)} placeholder="0,00" />
            </label>
            <button type="submit" className="btn-secondary min-h-[44px]">Salvar valores</button>
            <p className="text-[13px] text-ink-muted sm:col-span-3">Deixe o valor por entrega em 0,00 para usar a taxa de entrega de cada pedido.</p>
          </form>
        </details>
      )}
    </div>
  );
}
