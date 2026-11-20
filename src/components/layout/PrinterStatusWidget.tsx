import React, { useState, useEffect } from 'react';
import { Printer, AlertTriangle, CheckCircle2, RefreshCw, Server, X } from 'lucide-react';
import { usePrintStore } from '../../stores/usePrintStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { Dialog } from '../ui/Dialog';
import { useFeedback } from '../ui/FeedbackProvider';

const BANNER_ROLES: string[] = ['MASTER', 'GERENTE', 'CAIXA'];

export const usePrinterHealth = () => {
  const { printerStatus, jobs, dismissedFailedJobIds } = usePrintStore();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const heartbeatAgeSeconds = printerStatus?.last_heartbeat
    ? Math.max(0, Math.floor((now - new Date(printerStatus.last_heartbeat).getTime()) / 1000))
    : 999;

  const isBridgeAlive = heartbeatAgeSeconds < 60;

  // Cupons com falha ativos (não dispensados pelo usuário e nos últimos 60 minutos)
  const failedJobs = jobs.filter(
    (j) =>
      j.status === 'FAILED' &&
      !(dismissedFailedJobIds || []).includes(j.id) &&
      now - new Date(j.created_at).getTime() < 60 * 60 * 1000
  );

  const grillFailedJobs = failedJobs.filter((j) => j.sector === 'GRILL');
  const kitchenFailedJobs = failedJobs.filter((j) => j.sector === 'KITCHEN');

  const isGrillOk = isBridgeAlive && Boolean(printerStatus?.grill_online) && grillFailedJobs.length === 0;
  const isKitchenOk = isBridgeAlive && Boolean(printerStatus?.kitchen_online) && kitchenFailedJobs.length === 0;
  const allOk = isBridgeAlive && failedJobs.length === 0;

  return {
    heartbeatAgeSeconds,
    isBridgeAlive,
    isGrillOk,
    isKitchenOk,
    allOk,
    printerStatus,
    failedJobs,
    grillFailedJobs,
    kitchenFailedJobs,
    grillFailure: grillFailedJobs[0] || null,
    kitchenFailure: kitchenFailedJobs[0] || null,
  };
};

export const PrinterAlertBanner: React.FC = () => {
  const { isBridgeAlive, failedJobs, allOk } = usePrinterHealth();
  const { currentProfile } = useAuthStore();
  const { retryAllFailedJobs } = usePrintStore();
  const { notify } = useFeedback();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  const isManagerOrCashier = BANNER_ROLES.includes(currentProfile.role);

  if (allOk || !isManagerOrCashier) return null;

  const handleRetryAll = async () => {
    setIsRetrying(true);
    try {
      const count = await retryAllFailedJobs();
      notify(`${count} cupom(ns) reenviados para a fila de impressão.`, 'success');
    } catch (err: any) {
      notify(`Erro ao reenviar cupons: ${err.message || 'Falha'}`, 'error');
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <>
      <div
        className={`px-4 py-1.5 text-sm font-medium flex items-center justify-between gap-3 border-b animate-fadeIn ${
          !isBridgeAlive ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-950'
        }`}
        role="alert"
      >
        {/* Faixa fina e clara: avisa sem tomar o topo de todas as telas */}
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className={`w-4 h-4 shrink-0 ${!isBridgeAlive ? 'text-rose-600' : 'text-amber-600'}`} />
          <span>
            {!isBridgeAlive
              ? 'Impressão sem sinal: confira se o computador da loja está ligado e com internet.'
              : `${failedJobs.length} ${failedJobs.length === 1 ? 'cupom não foi impresso' : 'cupons não foram impressos'} (impressora desligada ou sem energia).`}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isBridgeAlive && failedJobs.length > 0 && (
            <button
              type="button"
              disabled={isRetrying}
              onClick={handleRetryAll}
              className="btn-primary min-h-[32px] px-3 py-1 text-xs"
            >
              <RefreshCw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Reenviando...' : `Reenviar cupons (${failedJobs.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="btn-secondary min-h-[32px] px-3 py-1 text-xs"
          >
            Ver detalhes
          </button>
        </div>
      </div>

      <PrinterDiagnosticsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};

export const PrinterStatusWidget: React.FC = () => {
  const { isBridgeAlive, failedJobs, allOk } = usePrinterHealth();
  const { currentProfile } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);

  // Com problema, quem vê a faixa (PrinterAlertBanner) não precisa do mesmo aviso duplicado no topo
  if (!allOk && BANNER_ROLES.includes(currentProfile.role)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Status das impressoras"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition shadow-xs ${
          allOk
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            : !isBridgeAlive
            ? 'border-rose-400 bg-rose-50 text-rose-800 hover:bg-rose-100 animate-pulse'
            : 'border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100'
        }`}
        title={
          allOk
            ? 'Cozinha e Churrasqueira conectadas e prontas'
            : !isBridgeAlive
            ? 'Atenção: Computador de impressão da loja offline. Clique para detalhes.'
            : `Atenção: ${failedJobs.length} cupom(ns) não impressos. Clique para detalhes.`
        }
      >
        {allOk ? (
          <>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <Printer className="w-3.5 h-3.5 text-emerald-700" />
            <span className="hidden md:inline">Impressoras OK</span>
          </>
        ) : !isBridgeAlive ? (
          <>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>PC Impressão Offline</span>
          </>
        ) : (
          <>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>
              {failedJobs.length} {failedJobs.length === 1 ? 'falha pendente' : 'falhas pendentes'}
            </span>
          </>
        )}
      </button>

      <PrinterDiagnosticsModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};

export const PrinterDiagnosticsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const {
    isBridgeAlive,
    heartbeatAgeSeconds,
    printerStatus,
    failedJobs,
    grillFailedJobs,
    kitchenFailedJobs,
  } = usePrinterHealth();
  const { loadPrinterStatus, sendTestPrintAll, retryAllFailedJobs, dismissFailedJobs, processJob } = usePrintStore();
  const { notify } = useFeedback();
  const [isTesting, setIsTesting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [testSuccessMessage, setTestSuccessMessage] = useState<string | null>(null);

  const handleTestPrint = async () => {
    setIsTesting(true);
    setTestSuccessMessage(null);
    try {
      await sendTestPrintAll();
      setTestSuccessMessage('Cupons de teste enviados para a Cozinha e Churrasqueira!');
      setTimeout(() => setTestSuccessMessage(null), 5000);
    } catch (err: any) {
      notify(`Falha ao disparar teste: ${err.message || 'Erro desconhecido'}`, 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleRetryAll = async () => {
    setIsRetrying(true);
    try {
      const count = await retryAllFailedJobs();
      notify(`${count} cupom(ns) reenviados com sucesso para a impressora.`, 'success');
    } catch (err: any) {
      notify(`Erro ao reenviar cupons: ${err.message || 'Falha'}`, 'error');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDismissAll = () => {
    dismissFailedJobs();
    notify('Avisos de cupons com falha dispensados.', 'info');
  };

  const handleRefresh = async () => {
    await loadPrinterStatus();
  };

  if (!isOpen) return null;

  return (
    <Dialog label="Diagnóstico das impressoras" onClose={onClose}>
      <div className="dialog-panel relative w-full max-w-lg bg-surface border border-line rounded-2xl shadow-card overflow-hidden my-auto max-h-[90vh] flex flex-col text-ink p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-line">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">Diagnóstico das impressoras</h2>
              <p className="text-xs text-ink-muted">Conexão de rede e hardware em tempo real</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-muted transition"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-ink-muted">
          O computador da loja gerencia a fila física. Se a energia cair, os cupons são retidos e podem ser reenviados abaixo com 1 clique, sem precisar excluir nenhum pedido.
        </p>

        {/* Card de Alerta de Cupons com Falha (Queda de energia ou impressora desligada) */}
        {failedJobs.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="font-bold text-sm text-amber-900">
                  Cupons pendentes de impressão ({failedJobs.length})
                </span>
              </div>
              <span className="text-xs bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                Queda de energia / Desligada
              </span>
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              Estes pedidos falharam ao imprimir enquanto as impressoras estavam sem energia ou reiniciando. Você pode reenviá-los agora com 1 clique ou dispensar os avisos se já foram preparados.
            </p>
            <div className="max-h-36 overflow-y-auto divide-y divide-amber-200/70 rounded-lg border border-amber-200 bg-white/70 px-3 py-1 text-xs">
              {failedJobs.map((j) => (
                <div key={j.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs font-bold shrink-0 ${
                        j.sector === 'GRILL' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
                      }`}
                    >
                      {j.sector === 'GRILL' ? 'Churrasqueira' : 'Cozinha'}
                    </span>
                    <span className="font-bold text-ink">#{j.order_number}</span>
                    <span className="text-ink-muted truncate">
                      {j.origin === 'DELIVERY' ? `Delivery (${j.customer_name || 'Cliente'})` : `Mesa ${j.table_number}`}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={isRetrying}
                    onClick={async () => {
                      await processJob(j.id);
                      notify(`Comanda #${j.order_number} reenviada.`, 'success');
                    }}
                    className="text-xs font-bold text-brand-700 hover:text-brand-900 underline shrink-0"
                  >
                    Reenviar
                  </button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isRetrying}
                onClick={handleRetryAll}
                className="btn-primary py-1.5 px-3 text-xs font-bold flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                {isRetrying ? 'Reenviando...' : `Reenviar todos os ${failedJobs.length} cupons`}
              </button>
              <button
                type="button"
                onClick={handleDismissAll}
                className="btn-secondary py-1.5 px-3 text-xs font-semibold"
              >
                Dispensar avisos
              </button>
            </div>
          </div>
        )}

        {/* Cartão do Bridge Local */}
        <div className="rounded-xl border border-line bg-surface p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-bold text-ink">
              <Server className="w-4 h-4 text-brand-700" />
              Serviço de Impressão Local (PC da Loja)
            </span>
            <span
              className={`status-badge text-[13px] font-bold ${
                isBridgeAlive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}
            >
              {isBridgeAlive ? 'Conectado' : 'Sem sinal'}
            </span>
          </div>
          <p className="text-xs text-ink-muted">
            {isBridgeAlive
              ? `Operando normalmente no ${printerStatus?.worker_name ?? 'PC da Loja'} (sinal recebido há ${heartbeatAgeSeconds}s).`
              : 'O programa de impressão (printer-bridge) não enviou sinal no último minuto. Verifique se o computador da loja está ligado.'}
          </p>
        </div>

        {/* Cartões das Impressoras de Rede */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Cozinha */}
          <div
            className={`rounded-xl border p-3.5 space-y-2 ${
              !isBridgeAlive
                ? 'border-rose-200 bg-rose-50/40'
                : kitchenFailedJobs.length > 0
                ? 'border-amber-200 bg-amber-50/40'
                : 'border-emerald-200 bg-emerald-50/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-ink flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-ink-muted" />
                Cozinha
              </span>
              <span
                className={`status-badge text-[13px] font-bold ${
                  !isBridgeAlive
                    ? 'bg-rose-600 text-white'
                    : kitchenFailedJobs.length > 0
                    ? 'bg-amber-600 text-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {!isBridgeAlive
                  ? 'Sem sinal'
                  : kitchenFailedJobs.length > 0
                  ? `Atenção (${kitchenFailedJobs.length})`
                  : 'Online'}
              </span>
            </div>
            <p className="text-xs font-mono text-ink-secondary">
              IP: {printerStatus?.kitchen_ip ?? '192.168.3.12:9100'}
            </p>
            <p className="text-xs text-ink-muted">
              {!isBridgeAlive
                ? 'Aguardando comunicação do computador da loja.'
                : kitchenFailedJobs.length > 0
                ? `${kitchenFailedJobs.length} cupom(ns) com falha recente. Clique em reenviar acima.`
                : 'Conectada e pronta para imprimir.'}
            </p>
          </div>

          {/* Churrasqueira */}
          <div
            className={`rounded-xl border p-3.5 space-y-2 ${
              !isBridgeAlive
                ? 'border-rose-200 bg-rose-50/40'
                : grillFailedJobs.length > 0
                ? 'border-amber-200 bg-amber-50/40'
                : 'border-emerald-200 bg-emerald-50/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-ink flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-ink-muted" />
                Churrasqueira
              </span>
              <span
                className={`status-badge text-[13px] font-bold ${
                  !isBridgeAlive
                    ? 'bg-rose-600 text-white'
                    : grillFailedJobs.length > 0
                    ? 'bg-amber-600 text-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {!isBridgeAlive
                  ? 'Sem sinal'
                  : grillFailedJobs.length > 0
                  ? `Atenção (${grillFailedJobs.length})`
                  : 'Online'}
              </span>
            </div>
            <p className="text-xs font-mono text-ink-secondary">
              IP: {printerStatus?.grill_ip ?? '192.168.3.17:9100'}
            </p>
            <p className="text-xs text-ink-muted">
              {!isBridgeAlive
                ? 'Aguardando comunicação do computador da loja.'
                : grillFailedJobs.length > 0
                ? `${grillFailedJobs.length} cupom(ns) com falha recente. Clique em reenviar acima.`
                : 'Conectada e pronta para imprimir.'}
            </p>
          </div>
        </div>

        {testSuccessMessage && (
          <div className="p-3 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-700" />
            <span>{testSuccessMessage}</span>
          </div>
        )}

        {/* Ações */}
        <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-line">
          <button
            type="button"
            disabled={isTesting}
            onClick={handleTestPrint}
            className="btn-primary w-full sm:flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            {isTesting ? 'Enviando teste...' : 'Imprimir cupom de teste nas duas'}
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            className="btn-secondary w-full sm:w-auto py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar Status
          </button>
        </div>
      </div>
    </Dialog>
  );
};
