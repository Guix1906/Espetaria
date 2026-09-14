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

  let colorClasses = 'bg-white/5 text-stone-300 border-white/10';
  if (isUrgent) {
    colorClasses = 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse font-bold shadow-md shadow-rose-950/40';
  } else if (isWarning) {
    colorClasses = 'bg-amber-500/20 text-amber-300 border-amber-500/50 font-semibold';
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border font-mono text-xs ${colorClasses}`}
      title={`Pedido feito às ${new Date(createdAt).toLocaleTimeString()}`}
    >
      {isUrgent ? (
        <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
      ) : (
        <Clock className="w-3.5 h-3.5 opacity-80 text-stone-400" />
      )}
      <span className="font-bold">{timeFormatted}</span>
      {isUrgent && <span className="text-[10px] uppercase tracking-wider font-black ml-0.5 text-rose-300">SLA!</span>}
    </div>
  );
};
