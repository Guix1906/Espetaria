import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface KDSElapsedTimerProps {
  createdAt: string;
  warningMinutes?: number;
  urgentMinutes?: number;
}

export const KDSElapsedTimer: React.FC<KDSElapsedTimerProps> = ({
  createdAt,
  warningMinutes = 10,
  urgentMinutes = 20,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
    return Math.max(0, diff);
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
      setElapsedSeconds(Math.max(0, diff));
    }, 1000);

    return () => clearInterval(interval);
  }, [createdAt]);

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isUrgent = minutes >= urgentMinutes;
  const isWarning = minutes >= warningMinutes && !isUrgent;

  let colorClasses = 'bg-slate-800/80 text-slate-300 border-slate-700';
  if (isUrgent) {
    colorClasses = 'bg-rose-950/90 text-rose-300 border-rose-600 animate-pulse font-bold shadow-lg shadow-rose-950/50';
  } else if (isWarning) {
    colorClasses = 'bg-amber-950/80 text-amber-300 border-amber-600 font-semibold';
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-mono text-xs ${colorClasses}`}
      title={`Pedido feito às ${new Date(createdAt).toLocaleTimeString()}`}
    >
      {isUrgent ? (
        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
      ) : (
        <Clock className="w-3.5 h-3.5 opacity-70" />
      )}
      <span>{timeFormatted}</span>
      {isUrgent && <span className="text-[10px] uppercase tracking-wider font-extrabold ml-0.5">SLA!</span>}
    </div>
  );
};
