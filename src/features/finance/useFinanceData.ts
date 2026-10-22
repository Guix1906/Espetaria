import { useCallback, useEffect, useState } from 'react';
import { loadFinanceData, type FinanceDataset } from '../../lib/financeData';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import type { Period } from '../../components/ui/PeriodPicker';

/** Último resultado de cada período: ao voltar para Financeiro/Relatórios a tela aparece na hora e atualiza por trás. */
const cache = new Map<string, FinanceDataset>();

/** Carrega o período e recarrega sozinho quando entra venda ou conta nova. */
export function useFinanceData(period: Period) {
  const key = `${period.from}|${period.to}`;
  const [state, setState] = useState<{ key: string; data: FinanceDataset | null }>(() => ({ key, data: cache.get(key) ?? null }));
  const data = state.key === key ? state.data : cache.get(key) ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await loadFinanceData(period.from, period.to);
      cache.set(`${period.from}|${period.to}`, fresh);
      setState({ key: `${period.from}|${period.to}`, data: fresh });
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível carregar os dados.');
    } finally {
      setLoading(false);
    }
  }, [period.from, period.to]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let timer: number | undefined;
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void reload(), 1500); };
    const channel = supabase
      .channel(`finance-${period.from}-${period.to}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_orders' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_entries' }, schedule)
      .subscribe();
    return () => { window.clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [period.from, period.to, reload]);

  return { data, loading, error, reload };
}
