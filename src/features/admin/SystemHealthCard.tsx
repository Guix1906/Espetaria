import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { StatusTag } from '../../components/ui/StatusTag';
import type { StatusKind } from '../../lib/statusStyles';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/useAuthStore';

type HealthItem = { item: string; ok: boolean; nivel: 'erro' | 'aviso'; detalhe: string };
type HealthCheck = { id: string; created_at: string; finished_at: string | null; trigger: string; status: 'RUNNING' | 'OK' | 'AVISO' | 'FALHA'; results: HealthItem[]; alert_status: string };

const LABEL: Record<HealthCheck['status'], string> = { RUNNING: 'Verificando...', OK: 'Tudo certo', AVISO: 'Atenção', FALHA: 'Falha' };
const KIND: Record<HealthCheck['status'], StatusKind> = { RUNNING: 'preparing', OK: 'free', AVISO: 'bill', FALHA: 'alert' };

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Robô de verificação diária (00060): roda às 17h e manda o resultado no WhatsApp do dono. */
export function SystemHealthCard() {
  const role = useAuthStore((s) => s.currentProfile?.role);
  const [check, setCheck] = useState<HealthCheck | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const allowed = isSupabaseConfigured && (role === 'MASTER' || role === 'GERENTE');

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from('system_health_checks').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (err) { setMissing(true); return; }
    setMissing(false);
    setCheck(data as HealthCheck | null);
  }, []);

  useEffect(() => { if (allowed) void load(); }, [allowed, load]);
  // Enquanto verifica, atualiza sozinho
  useEffect(() => {
    if (!allowed || check?.status !== 'RUNNING') return;
    const id = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(id);
  }, [allowed, check?.status, load]);

  if (!allowed || missing) return null;

  const runNow = async () => {
    setBusy(true); setError(null);
    const { error: err } = await supabase.rpc('run_health_check_now');
    setBusy(false);
    if (err) { setError(err.message); return; }
    await load();
  };

  const failed = check?.results.filter((r) => !r.ok) ?? [];
  const shown = open ? check?.results ?? [] : failed;

  return (
    <section className="surface-card space-y-3 p-4" aria-labelledby="health-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="health-title" className="text-base font-semibold text-ink">Verificação diária do sistema</h2>
          <p className="text-sm text-ink-muted">
            Todo dia às 17h o robô confere banco, cardápio, área do garçom, painel e impressão, e manda o resultado no seu WhatsApp.
          </p>
        </div>
        <Button variant="secondary"disabled={busy || check?.status === 'RUNNING'} onClick={() => void runNow()}>
          {busy || check?.status === 'RUNNING' ? 'Verificando...' : 'Verificar agora'}
        </Button>
      </div>
      {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}
      {!check ? (
        <p className="text-sm text-ink-muted">Ainda não rodou. A primeira verificação sai hoje às 17h.</p>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm text-ink-secondary">
            <StatusTag kind={KIND[check.status]} className="font-semibold">{LABEL[check.status]}</StatusTag>
            <span>{check.trigger === 'MANUAL' ? 'Verificação manual' : 'Verificação das 17h'} · {when(check.created_at)}</span>
            {check.status !== 'RUNNING' && <span>· {check.results.length - failed.length} de {check.results.length} itens ok</span>}
            {check.alert_status === 'FAILED' && <span className="text-rose-700">· aviso no WhatsApp não foi enviado</span>}
          </p>
          {shown.length > 0 && (
            <ul className="divide-y divide-line rounded-md border border-line">
              {shown.map((r) => (
                <li key={r.item} className="flex items-start gap-2 px-3 py-2 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.ok ? 'bg-emerald-600' : r.nivel === 'erro' ? 'bg-rose-600' : 'bg-amber-500'}`} aria-hidden="true" />
                  <span className="min-w-0"><span className="font-semibold text-ink">{r.item}</span> <span className="text-ink-secondary">{r.detalhe}</span></span>
                </li>
              ))}
            </ul>
          )}
          {check.status !== 'RUNNING' && (
            <button type="button" className="text-sm font-semibold text-brand-700" onClick={() => setOpen((v) => !v)}>
              {open ? 'Mostrar só os problemas' : 'Ver todos os itens conferidos'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
