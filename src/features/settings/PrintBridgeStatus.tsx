import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Link2, MessageCircle, Server, Printer, RefreshCw } from 'lucide-react';
import { usePrintStore } from '../../stores/usePrintStore';
import { isSupabaseConfigured } from '../../lib/supabase';
import type { PrintJob } from '../../types/domain';
import { publicAppUrl } from '../../lib/publicUrl';

const STALE_AFTER_MS = 60_000;

export type PrinterSector = PrintJob['sector'];
export type PrinterHealth = 'ON' | 'NO_SIGNAL' | 'NOT_SET';

/** Mesmo critério do quadro geral, por setor: cupom travado ou com falha = sem sinal; nunca imprimiu = sem configuração. */
export function sectorPrinterHealth(jobs: PrintJob[], sector: PrinterSector, now: number): PrinterHealth {
  const mine = jobs.filter((j) => j.sector === sector);
  const stuck = mine.some((j) => j.status === 'FAILED' || ((j.status === 'PENDING' || j.status === 'PRINTING') && now - new Date(j.created_at).getTime() > STALE_AFTER_MS));
  if (stuck) return 'NO_SIGNAL';
  return mine.some((j) => j.status === 'PRINTED') ? 'ON' : 'NOT_SET';
}

const HEALTH_TAG: Record<PrinterHealth, { label: string; className: string }> = {
  ON: { label: 'Ligada', className: 'bg-emerald-600 text-white' },
  NO_SIGNAL: { label: 'Sem sinal', className: 'bg-rose-600 text-white' },
  NOT_SET: { label: 'Sem configuração', className: 'bg-surface-muted text-ink-secondary' },
};

export function PrinterHealthTag({ jobs, sector }: { jobs: PrintJob[]; sector: PrinterSector }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  const tag = HEALTH_TAG[sectorPrinterHealth(jobs, sector, now)];
  return <span className={`status-badge whitespace-nowrap ${tag.className}`}>{tag.label}</span>;
}

/**
 * Saúde do printer-bridge deduzida da fila: se há cupom pendente há mais de
 * 1 minuto, o PC de impressão provavelmente está desligado ou sem internet.
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
  const isGrillOk = isBridgeAlive && Boolean(printerStatus?.grill_online);
  const isKitchenOk = isBridgeAlive && Boolean(printerStatus?.kitchen_online);
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

  const bySector = (['GRILL', 'KITCHEN', 'BAR', 'NONE'] as const).map((sector) => {
    const last = jobs.find((j) => j.sector === sector && j.status === 'PRINTED');
    return { sector, printer: last?.printer ?? null, at: last?.printed_at ?? null };
  });
  const sectorLabel = { GRILL: 'Churrasqueira', KITCHEN: 'Cozinha', BAR: 'Bar', NONE: 'Caixa/Expedição' };

  const healthy = stuck.length === 0 && failed.length === 0;
  return (
    <div className={`surface-card space-y-3 p-4 sm:p-5 ${healthy ? '' : 'border-rose-200'}`}>
      <div className="flex items-start gap-3">
        {healthy ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-rose-700" />}
        <div className="text-sm">
          <p className="font-bold text-ink">{healthy ? 'Impressão funcionando' : 'Atenção na impressão'}</p>
          <p className="text-xs text-ink-muted">
            {stuck.length > 0 && `${stuck.length} cupom(ns) aguardando há mais de 1 minuto — verifique se o PC do printer-bridge está ligado e com internet. `}
            {failed.length > 0 && `${failed.length} cupom(ns) com falha — veja o erro na aba Fila e use "Reenviar". `}
            {healthy && (lastPrinted ? `Último cupom confirmado às ${new Date(lastPrinted.printed_at!).toLocaleTimeString('pt-BR')} (${lastPrinted.printer}).` : 'Nenhum cupom impresso ainda neste período. Use os botões de teste abaixo.')}
          </p>
        </div>
      </div>
      {/* Monitoramento em Tempo Real do Hardware (Bridge + Impressoras de Rede) */}
      <div className="rounded-xl border border-line bg-surface-soft p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-brand-700" />
            <span className="text-xs font-bold uppercase tracking-wider text-ink">Conexão de Hardware (Tempo Real)</span>
          </div>
          <span className="text-[11px] text-ink-muted">
            {isBridgeAlive ? `PC da Loja online (sinal há ${heartbeatAgeSeconds}s)` : 'PC da Loja desconectado'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className={`p-2.5 rounded-xl border flex items-center justify-between ${isKitchenOk ? 'border-emerald-200 bg-emerald-50/60' : 'border-rose-200 bg-rose-50/60'}`}>
            <div>
              <p className="font-bold text-ink">Cozinha (Acompanhamentos)</p>
              <p className="font-mono text-[11px] text-ink-muted">IP: {printerStatus?.kitchen_ip ?? '192.168.3.12:9100'}</p>
            </div>
            <span className={`status-badge font-bold text-[10px] ${isKitchenOk ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
              {isKitchenOk ? `Online (${printerStatus?.kitchen_latency_ms ?? 2}ms)` : 'Sem Sinal'}
            </span>
          </div>

          <div className={`p-2.5 rounded-xl border flex items-center justify-between ${isGrillOk ? 'border-emerald-200 bg-emerald-50/60' : 'border-rose-200 bg-rose-50/60'}`}>
            <div>
              <p className="font-bold text-ink">Churrasqueira (Espetos)</p>
              <p className="font-mono text-[11px] text-ink-muted">IP: {printerStatus?.grill_ip ?? '192.168.3.17:9100'}</p>
            </div>
            <span className={`status-badge font-bold text-[10px] ${isGrillOk ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
              {isGrillOk ? `Online (${printerStatus?.grill_latency_ms ?? 3}ms)` : 'Sem Sinal'}
            </span>
          </div>
        </div>

        {testSuccess && (
          <p className="text-xs font-semibold text-emerald-800 bg-emerald-100 p-2 rounded-lg">{testSuccess}</p>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
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
            className="btn-primary py-2 text-xs font-bold flex items-center justify-center gap-1.5 flex-1"
          >
            <Printer className="w-3.5 h-3.5" />
            {testingAll ? 'Enviando teste...' : 'Imprimir Teste nas Duas Impressoras'}
          </button>

          <button
            type="button"
            onClick={() => loadPrinterStatus()}
            className="btn-secondary py-2 text-xs font-semibold flex items-center justify-center gap-1 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar Status
          </button>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        {bySector.map((s) => (
          <li key={s.sector} className="rounded-lg border border-line bg-surface p-2">
            <p className="font-semibold text-ink">{sectorLabel[s.sector]}</p>
            <p className="truncate text-ink-muted">{s.printer ? `${s.printer} · ${new Date(s.at!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'sem confirmação'}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Link público do cardápio para enviar aos clientes pelo WhatsApp. */
export function DigitalMenuLinkCard() {
  const [copied, setCopied] = useState(false);
  const url = `${publicAppUrl()}/cardapio`;
  const shareText = encodeURIComponent(`Peça seu churrasco pelo nosso cardápio digital: ${url}`);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* navegador sem permissão de área de transferência */ }
  };

  return (
    <div className="surface-card space-y-3 p-4 sm:p-5">
      <div className="flex items-center gap-2"><Link2 className="h-5 w-5 text-brand-700" /><h3 className="font-bold text-ink">Link do cardápio digital (delivery)</h3></div>
      <p className="text-xs text-ink-muted">Envie este link aos clientes ou coloque na mensagem automática / catálogo do WhatsApp. Os pedidos caem direto na churrasqueira, cozinha e expedição.</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-surface-soft px-3 py-2 text-xs">{url}</code>
        <button type="button" className="btn-secondary text-xs" onClick={() => void copy()}><Copy className="h-4 w-4" />{copied ? 'Copiado!' : 'Copiar'}</button>
        <a className="btn-primary text-xs" href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />Compartilhar no WhatsApp</a>
      </div>
    </div>
  );
}
