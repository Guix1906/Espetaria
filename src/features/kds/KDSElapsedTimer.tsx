import { AlertTriangle, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

export type ElapsedLevel = 'ok' | 'warning' | 'urgent';

/** Nível de espera do pedido, para pintar o cartão inteiro (visível de longe). */
export function elapsedLevel(createdAt: string, now: number, warningMinutes: number, urgentMinutes: number): ElapsedLevel {
  const minutes = (now - new Date(createdAt).getTime()) / 60000;
  return minutes >= urgentMinutes ? 'urgent' : minutes >= warningMinutes ? 'warning' : 'ok';
}

/** Borda do cartão por nível: faixa grossa à esquerda, sem mudar o fundo. */
export const LEVEL_CARD: Record<ElapsedLevel, string> = {
  ok: 'border-l-emerald-600',
  warning: 'border-l-amber-500',
  urgent: 'border-l-rose-600 ring-2 ring-rose-200',
};

/** Relógio único da tela (atualiza a cada 15 s) para recalcular os níveis. */
export function useNow(intervalMs = 15000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(interval);
  }, [intervalMs]);
  return now;
}

interface KDSElapsedTimerProps {
  createdAt: string;
  warningMinutes?: number;
  urgentMinutes?: number;
}

export function KDSElapsedTimer({ createdAt, warningMinutes = 10, urgentMinutes = 20 }: KDSElapsedTimerProps) {
  const elapsed = () => Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  const [elapsedSeconds, setElapsedSeconds] = useState(elapsed);

  useEffect(() => {
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [createdAt]);

  const minutes = Math.floor(elapsedSeconds / 60);
  const time = `${String(minutes).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
  const isUrgent = minutes >= urgentMinutes;
  const isWarning = minutes >= warningMinutes;
  const label = isUrgent ? 'Atrasado' : isWarning ? 'Atenção' : 'No prazo';
  const colors = isUrgent ? 'bg-rose-50 text-rose-800' : isWarning ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800';

  return (
    <div className={`inline-flex shrink-0 flex-col items-end gap-0.5 rounded-sm px-2.5 py-1.5 ${colors}`} aria-label={`${label}. Tempo de espera: ${minutes} minutos e ${elapsedSeconds % 60} segundos`} title={`Pedido feito às ${new Date(createdAt).toLocaleTimeString('pt-BR')}`}>
      <span className="flex items-center gap-1.5 font-mono text-xl font-bold tabular-nums">{isUrgent ? <AlertTriangle className="h-5 w-5" aria-hidden="true" /> : <Clock className="h-4 w-4" aria-hidden="true" />}{time}</span>
      <span className="text-xs font-semibold">{label}</span>
    </div>
  );
}
