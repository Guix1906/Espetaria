import { X } from 'lucide-react';
import { useRemoteErrorStore } from '../../lib/remote';

/** Aviso fixo quando o servidor recusa uma operação (a tela já foi re-sincronizada). */
export function RemoteErrorBanner() {
  const { lastError, clear } = useRemoteErrorStore();
  if (!lastError) return null;
  return (
    <div role="alert" className="notice fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-xl items-start justify-between gap-3 border-rose-200 bg-rose-50 text-rose-800 shadow-floating">
      <span><strong>Operação não confirmada pelo servidor:</strong> {lastError} Os dados foram recarregados do banco.</span>
      <button type="button" className="icon-button shrink-0" aria-label="Fechar aviso" onClick={clear}><X className="h-4 w-4" /></button>
    </div>
  );
}
