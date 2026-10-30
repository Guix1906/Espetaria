import React, { useState, useEffect } from 'react';
import { Printer, AlertTriangle, CheckCircle2, RefreshCw, Server } from 'lucide-react';
import { usePrintStore } from '../../stores/usePrintStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { Dialog } from '../ui/Dialog';

export const usePrinterHealth = () => {
  const { printerStatus } = usePrintStore();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const heartbeatAgeSeconds = printerStatus?.last_heartbeat
    ? Math.max(0, Math.floor((now - new Date(printerStatus.last_heartbeat).getTime()) / 1000))
    : 999;

  const isBridgeAlive = heartbeatAgeSeconds < 60;
  const isGrillOk = isBridgeAlive && Boolean(printerStatus?.grill_online);
  const isKitchenOk = isBridgeAlive && Boolean(printerStatus?.kitchen_online);
  const allOk = isGrillOk && isKitchenOk;

  return {
    heartbeatAgeSeconds,
    isBridgeAlive,
    isGrillOk,
    isKitchenOk,
    allOk,
    printerStatus,
  };
};

export const PrinterAlertBanner: React.FC = () => {
  const { isBridgeAlive, isGrillOk, isKitchenOk, allOk } = usePrinterHealth();
  const { currentProfile } = useAuthStore();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const isManagerOrCashier = ['MASTER', 'GERENTE', 'CAIXA'].includes(currentProfile.role);

  if (allOk || !isManagerOrCashier) return null;

  return (
    <>
      <div className="bg-rose-600 text-white px-4 py-2 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 shadow-md animate-fadeIn">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-300" />
          <span className="truncate">
            {!isBridgeAlive
              ? 'Computador de impressão local da loja está desconectado. Verifique se o PC da loja está ligado.'
              : `Atenção: ${!isKitchenOk ? 'Impressora da Cozinha (192.168.3.12)' : ''}${
                  !isKitchenOk && !isGrillOk ? ' e ' : ''
                }${!isGrillOk ? 'Impressora da Churrasqueira (192.168.3.17)' : ''} não respondeu ao teste na rede local.`}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="bg-white text-rose-900 px-3 py-1 rounded-lg text-xs font-bold hover:bg-rose-50 transition shrink-0 shadow-xs"
        >
          Diagnosticar / Testar
        </button>
      </div>

      <PrinterDiagnosticsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};

export const PrinterStatusWidget: React.FC = () => {
  const { isBridgeAlive, isGrillOk, isKitchenOk, allOk } = usePrinterHealth();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Status das impressoras"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition shadow-xs ${
          allOk
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            : 'border-rose-400 bg-rose-50 text-rose-800 hover:bg-rose-100 animate-pulse'
        }`}
        title={
          allOk
            ? 'Cozinha e Churrasqueira conectadas e prontas'
            : 'Atenção: Falha na conexão com as impressoras. Clique para detalhes.'
        }
      >
        {allOk ? (
          <>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <Printer className="w-3.5 h-3.5 text-emerald-700" />
            <span className="hidden md:inline">Impressoras OK</span>
          </>
        ) : (
          <>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>
              {!isBridgeAlive
                ? 'PC Impressão Offline'
                : !isKitchenOk && !isGrillOk
                ? 'Impressoras Offline'
                : !isKitchenOk
                ? 'Cozinha Offline'
                : 'Churrasqueira Offline'}
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
  const { isBridgeAlive, isGrillOk, isKitchenOk, heartbeatAgeSeconds, printerStatus } = usePrinterHealth();
  const { loadPrinterStatus, sendTestPrintAll } = usePrintStore();
  const [isTesting, setIsTesting] = useState(false);
  const [testSuccessMessage, setTestSuccessMessage] = useState<string | null>(null);

  const handleTestPrint = async () => {
    setIsTesting(true);
    setTestSuccessMessage(null);
    try {
      await sendTestPrintAll();
      setTestSuccessMessage('Cupons de teste enviados para a Cozinha e Churrasqueira!');
      setTimeout(() => setTestSuccessMessage(null), 5000);
    } catch (err: any) {
      alert(`Falha ao disparar teste: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleRefresh = async () => {
    await loadPrinterStatus();
  };

  if (!isOpen) return null;

  return (
    <Dialog label="Diagnóstico das Impressoras" onClose={onClose}>
      <div className="dialog-panel relative w-full max-w-lg bg-surface border border-line rounded-2xl shadow-card overflow-hidden my-auto max-h-[90vh] flex flex-col text-ink p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-line">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">Diagnóstico das Impressoras</h2>
              <p className="text-xs text-ink-muted">Conexão de rede e hardware em tempo real</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-muted transition"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-ink-muted">
          O sistema monitora a conexão contínua entre o computador da loja e as impressoras de rede da Cozinha e Churrasqueira.
        </p>

        {/* Cartão do Bridge Local */}
        <div className="rounded-xl border border-line bg-surface p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-bold text-ink">
              <Server className="w-4 h-4 text-brand-700" />
              Serviço de Impressão Local (PC da Loja)
            </span>
            <span
              className={`status-badge text-[11px] font-bold ${
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
              isKitchenOk ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-200 bg-rose-50/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-ink flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-ink-muted" />
                Cozinha
              </span>
              <span
                className={`status-badge text-[11px] font-bold ${
                  isKitchenOk ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                }`}
              >
                {isKitchenOk ? 'Online' : 'Offline'}
              </span>
            </div>
            <p className="text-xs font-mono text-ink-secondary">
              IP: {printerStatus?.kitchen_ip ?? '192.168.3.12:9100'}
            </p>
            <p className="text-xs text-ink-muted">
              {isKitchenOk
                ? `Resposta em ${printerStatus?.kitchen_latency_ms ?? 2}ms (acompanhamentos e porções).`
                : `Não respondeu: ${printerStatus?.kitchen_error || 'verifique cabo e energia'}.`}
            </p>
          </div>

          {/* Churrasqueira */}
          <div
            className={`rounded-xl border p-3.5 space-y-2 ${
              isGrillOk ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-200 bg-rose-50/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-ink flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-ink-muted" />
                Churrasqueira
              </span>
              <span
                className={`status-badge text-[11px] font-bold ${
                  isGrillOk ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                }`}
              >
                {isGrillOk ? 'Online' : 'Offline'}
              </span>
            </div>
            <p className="text-xs font-mono text-ink-secondary">
              IP: {printerStatus?.grill_ip ?? '192.168.3.17:9100'}
            </p>
            <p className="text-xs text-ink-muted">
              {isGrillOk
                ? `Resposta em ${printerStatus?.grill_latency_ms ?? 3}ms (espetos e carnes).`
                : `Não respondeu: ${printerStatus?.grill_error || 'verifique cabo e energia'}.`}
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
            {isTesting ? 'Enviando teste...' : 'Imprimir Cupom de Teste nas Duas'}
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
