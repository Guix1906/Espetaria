import { Bike, Calculator, CheckCircle2, Clock3, DollarSign } from 'lucide-react';
import { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { EmptyState } from '../../components/ui/EmptyState';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatBRL } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';

interface DriverPayout {
  id: string;
  driver_name: string;
  deliveries_count: number;
  per_delivery_rate: number;
  fuel_fixed: number;
  total: number;
  created_at: string;
  paid_at: string | null;
}

export function DriverPayoutsView() {
  const { notify } = useFeedback();
  const { currentProfile } = useAuthStore();
  const { currentShift } = useShiftStore();
  const [payouts, setPayouts] = useState<DriverPayout[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);

  const canManage = ['MASTER', 'GERENTE'].includes(currentProfile.role);

  const loadPayouts = async () => {
    if (!isSupabaseConfigured || !currentShift) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('driver_payouts')
        .select('*')
        .eq('shift_id', currentShift.id)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      setPayouts((data as DriverPayout[]) || []);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao carregar pagamentos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = async () => {
    if (!isSupabaseConfigured || !currentShift) return;
    setCalculating(true);
    try {
      const { data, error } = await supabase.rpc('close_delivery_shift', { p_shift_id: currentShift.id });
      if (error) throw new Error(error.message);
      const result = data as { message?: string } | Array<{ driver: string; deliveries: number; total: number }>;
      if (Array.isArray(result) && result.length > 0) {
        notify(`Pagamentos calculados para ${result.length} entregador(es).`, 'success');
        await loadPayouts();
      } else if (result && 'message' in result) {
        notify(result.message!, 'info');
      } else {
        notify('Nenhuma entrega concluída neste turno.', 'info');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao calcular pagamentos.', 'error');
    } finally {
      setCalculating(false);
    }
  };

  const handleMarkPaid = async (payoutId: string) => {
    if (!isSupabaseConfigured) return;
    try {
      const { error } = await supabase
        .from('driver_payouts')
        .update({ paid_at: new Date().toISOString() })
        .eq('id', payoutId);
      if (error) throw new Error(error.message);
      setPayouts((prev) => prev.map((p) => p.id === payoutId ? { ...p, paid_at: new Date().toISOString() } : p));
      notify('Pagamento marcado como pago.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Erro ao marcar pagamento.', 'error');
    }
  };

  const totalDeliveries = payouts.reduce((sum, p) => sum + p.deliveries_count, 0);
  const totalAmount = payouts.reduce((sum, p) => sum + Number(p.total), 0);
  const pendingAmount = payouts.filter((p) => !p.paid_at).reduce((sum, p) => sum + Number(p.total), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagamentos de Entregadores"
        description={`R$ 5,00 por entrega + R$ 10,00 fixo combustível · Turno: ${currentShift?.status === 'ABERTO' ? 'Aberto' : 'Fechado'}`}
        icon={Bike}
      />

      {!currentShift ? (
        <EmptyState
          title="Nenhum turno aberto"
          description="Abra um turno antes de gerenciar pagamentos de entregadores."
          icon={Clock3}
        />
      ) : (
        <>
          {/* Cards de resumo */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <div className="icon-tile bg-brand-50 text-brand-700"><Bike className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs font-medium text-ink-muted">Entregas concluídas</p>
                  <p className="text-2xl font-bold tabular-nums text-ink">{totalDeliveries}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <div className="icon-tile bg-emerald-50 text-emerald-700"><DollarSign className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs font-medium text-ink-muted">Total a pagar</p>
                  <p className="text-2xl font-bold tabular-nums text-ink">{formatBRL(totalAmount)}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center gap-3">
                <div className="icon-tile bg-amber-50 text-amber-700"><Clock3 className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs font-medium text-ink-muted">Pendente</p>
                  <p className="text-2xl font-bold tabular-nums text-ink">{formatBRL(pendingAmount)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Ações */}
          {canManage && (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleCalculate}
                disabled={calculating}
                className="btn-primary"
              >
                <Calculator className="h-4 w-4" aria-hidden="true" />
                {calculating ? 'Calculando...' : 'Calcular pagamentos do turno'}
              </button>
              <button
                type="button"
                onClick={loadPayouts}
                disabled={loading}
                className="btn-secondary"
              >
                {loading ? 'Atualizando...' : 'Atualizar lista'}
              </button>
            </div>
          )}

          {/* Lista de pagamentos */}
          {payouts.length === 0 ? (
            <EmptyState
              title="Nenhum pagamento calculado"
              description="Clique em 'Calcular pagamentos do turno' para gerar os valores por entregador."
              icon={DollarSign}
            />
          ) : (
            <div className="space-y-3">
              {payouts.map((payout) => (
                <div
                  key={payout.id}
                  className={`rounded-xl border p-4 ${payout.paid_at ? 'border-emerald-200 bg-emerald-50/50' : 'border-line bg-surface'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-ink">{payout.driver_name}</h3>
                        {payout.paid_at ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            <CheckCircle2 className="h-3 w-3" /> Pago
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            <Clock3 className="h-3 w-3" /> Pendente
                          </span>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                        <div>
                          <span className="block text-xs text-ink-muted">Entregas</span>
                          <span className="font-semibold tabular-nums text-ink">{payout.deliveries_count}</span>
                        </div>
                        <div>
                          <span className="block text-xs text-ink-muted">Taxa/entrega</span>
                          <span className="font-semibold tabular-nums text-ink">{formatBRL(Number(payout.per_delivery_rate))}</span>
                        </div>
                        <div>
                          <span className="block text-xs text-ink-muted">Combustível</span>
                          <span className="font-semibold tabular-nums text-ink">{formatBRL(Number(payout.fuel_fixed))}</span>
                        </div>
                        <div>
                          <span className="block text-xs text-ink-muted">Total</span>
                          <span className="text-lg font-bold tabular-nums text-brand-700">{formatBRL(Number(payout.total))}</span>
                        </div>
                      </div>
                    </div>
                    {canManage && !payout.paid_at && (
                      <button
                        type="button"
                        onClick={() => handleMarkPaid(payout.id)}
                        className="btn-secondary shrink-0 text-sm"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        Marcar como pago
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}