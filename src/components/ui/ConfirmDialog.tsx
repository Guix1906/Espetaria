import { useState, useCallback, type ReactNode } from 'react';
import { Dialog } from './Dialog';
import { AlertTriangle } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'default';
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

let globalSetState: ((state: ConfirmState | null) => void) | null = null;

export function useConfirm() {
  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      if (globalSetState) {
        globalSetState({ ...options, resolve });
      } else {
        const msg = typeof options.message === 'string' ? options.message : '';
        resolve(window.confirm(options.title + '\n' + msg));
      }
    });
  }, []);
  return confirm;
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  globalSetState = setState;

  const handleConfirm = () => {
    state?.resolve(true);
    setState(null);
  };

  const handleCancel = () => {
    state?.resolve(false);
    setState(null);
  };

  const variant = state?.variant ?? 'default';
  const btnClass = variant === 'danger' ? 'btn-danger' : 'btn-primary';

  return (
    <>
      {children}
      {state && (
        <Dialog label={state.title} onClose={handleCancel}>
          <div className="dialog-panel w-full max-w-md p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="icon-tile shrink-0 mt-0.5">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-ink leading-snug">{state.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">{state.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="btn-secondary" onClick={handleCancel}>
                {state.cancelText ?? 'Cancelar'}
              </button>
              <button type="button" className={btnClass} onClick={handleConfirm}>
                {state.confirmText ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}