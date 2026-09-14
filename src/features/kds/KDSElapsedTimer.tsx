import { AlertTriangle,Clock } from 'lucide-react';
import { useEffect,useState } from 'react';

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
  const colors = isUrgent ? 'border-rose-300 bg-rose-50 text-rose-800' : isWarning ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800';

  return (
    <div className={`inline-flex shrink-0 flex-col items-end gap-0.5 rounded-xl border px-2.5 py-1.5 ${colors}`} aria-label={`${label}. Tempo de espera: ${minutes} minutos e ${elapsedSeconds % 60} segundos`} title={`Pedido feito às ${new Date(createdAt).toLocaleTimeString('pt-BR')}`}>
      <span className="flex items-center gap-1.5 text-sm font-bold tabular-nums">{isUrgent ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <Clock className="h-4 w-4" aria-hidden="true" />}{time}</span>
      <span className="text-xs font-semibold">{label}</span>
    </div>
  );
}
