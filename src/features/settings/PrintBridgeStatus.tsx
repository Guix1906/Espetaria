import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Server, Printer, RefreshCw } from 'lucide-react';
import { usePrintStore } from '../../stores/usePrintStore';
import { isSupabaseConfigured } from '../../lib/supabase';
import type { PrintJob } from '../../types/domain';

const STALE_AFTER_MS = 60_000;

export type PrinterSector = PrintJob['sector'];
export type PrinterHealth = 'ON' | 'NO_SIGNAL' | 'NOT_SET';

/** Status deduzido da fila: se há cupom travado ou com falha = sem sinal; se já imprimiu = ligada. */
export function sectorPrinterHealth(jobs: PrintJob[], sector: PrinterSector, now: number): PrinterHealth {
  const mine = jobs.filter((j) => j.sector === sector);
  const stuck = mine.some((j) => j.status === 'FAILED' || ((j.status === 'PENDING' || j.status === 'PRINTING') && now - new Date(j.created_at).getTime() > STALE_AFTER_MS));
  if (stuck) return 'NO_SIGNAL';
  return mine.some((j) => j.status === 'PRINTED') ? 'ON' : 'NOT_SET';
}

const HEALTH_TAG: Record<PrinterHealth, { label: string; className: string }> = {
  ON: { label: 'Ligada', className: 'bg-emerald-600 text-white' },
  NO_SIGNAL: { label: 'Sem sinal', className: 'bg-rose-600 text-white' },
  NOT_SET: { label: 'Integrada', className: 'bg-surface-muted text-ink-secondary' },
};

export function PrinterHealthTag({ jobs, sector }: { jobs: PrintJob[]; sector: PrinterSector }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  const tag = HEALTH_TAG[sectorPrinterHealth(jobs, sector, now)];
  return <span className={`status-badge whitespace-nowrap font-semibold ${tag.className}`}>{tag.label}</span>;
}

/**
 * Resumo do serviço de impressão: exibe se o PC da loja está conectado e
 * permite disparar teste unificado sem repetição visual.
 */
export function PrintBridgeStatus({ jobs }: { jobs: PrintJob[] }) {
  const [now, setNow] = useState(() => Date.now());
  const { printerStatus, loadPrinterStatus, sendTestPrintAll } = usePrintStore();
  const [testingAll, setTestingAll] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);

  const heartbeatAgeSeconds = printerStatus?.last_heartbeat
    ? Math.max(0, Math.floor((now - new Date(printerStatus.last_heartbeat).getTime()) / 1000))
    : 999;
  const isBridgeAlive = heartbeatAgeSeconds < 60;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <div className="notice border-amber-200 bg-amber-50 text-amber-900">
        <Server className="h-5 w-5 shrink-0" />
        <p className="text-xs">Modo demonstração: a impressão é simulada no navegador. Com o Supabase configurado, os cupons são gerados pelo banco e impressos pelo <strong>printer-bridge</strong> instalado no PC da loja.</p>
      </div>
    );
  }

  const stuck = jobs.filter((j) => (j.status === 'PENDING' || j.status === 'PRINTING') && now - new Date(j.created_at).getTime() > STALE_AFTER_MS);
  const failed = jobs.filter((j) => j.status === 'FAILED');
  const lastPrinted = jobs.filter((j) => j.status === 'PRINTED' && j.printed_at).sort((a, b) => (b.printed_at ?? '').localeCompare(a.printed_at ?? ''))[0];
  const healthy = stuck.length === 0 && failed.length === 0;

  return (
    <div className={`surface-card p-4 sm:p-5 space-y-4 ${healthy ? '' : 'border-rose-200'}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          {healthy ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700 mt-0.5" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-700 mt-0.5" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-ink">{healthy ? 'Serviço de impressão funcionando' : 'Atenção na impressão'}</p>
              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${isBridgeAlive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${isBridgeAlive ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'}`} />
                {isBridgeAlive ? `PC da Loja online (${heartbeatAgeSeconds}s)` : 'PC da Loja sem sinal'}
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-1">
              {stuck.length > 0 && `${stuck.length} cupom(ns) aguardando há mais de 1 minuto — verifique se o PC do caixa está ligado. `}
              {failed.length > 0 && `${failed.length} cupom(ns) com falha — veja o erro na aba Fila. `}
              {healthy && (lastPrinted ? `Último cupom confirmado às ${new Date(lastPrinted.printed_at!).toLocaleTimeString('pt-BR')} (${lastPrinted.printer}).` : 'Fila limpa. Use os botões abaixo para testar as impressoras.')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={testingAll}
            onClick={async () => {
              setTestingAll(true);
              setTestSuccess(null);
              try {
                await sendTestPrintAll();
                setTestSuccess('Cupom de teste enviado para a Cozinha e Churrasqueira!');
                setTimeout(() => setTestSuccess(null), 5000);
              } catch (e: any) {
                alert('Erro ao disparar teste: ' + (e.message || 'Erro desconhecido'));
              } finally {
                setTestingAll(false);
              }
            }}
            className="btn-primary py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            {testingAll ? 'Enviando teste...' : 'Testar todas as impressoras'}
          </button>

          <button
            type="button"
            onClick={() => loadPrinterStatus()}
            className="btn-secondary py-2 px-2.5 text-xs font-semibold flex items-center justify-center gap-1"
            title="Atualizar status de conexão"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {testSuccess && (
        <p className="text-xs font-semibold text-emerald-800 bg-emerald-100 p-2.5 rounded-lg">{testSuccess}</p>
      )}
    </div>
  );
}
