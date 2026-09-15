import { AlertCircle, CheckCircle2, MessageSquareText, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';

type Tone = 'info' | 'success' | 'error';
interface TextRequestOptions {
  title: string;
  message: string;
  label: string;
  initialValue?: string;
  confirmText?: string;
  required?: boolean;
  multiline?: boolean;
  danger?: boolean;
}
interface FeedbackContextValue {
  requestText: (options: TextRequestOptions) => Promise<string | null>;
  notify: (message: string, tone?: Tone) => void;
}
type FeedbackRequest =
  | { id: number; kind: 'text'; options: TextRequestOptions; resolve: (value: string | null) => void }
  | { id: number; kind: 'notice'; message: string; tone: Tone };

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

function TextRequest({ options, onFinish }: { options: TextRequestOptions; onFinish: (value: string | null) => void }) {
  const [value, setValue] = useState(options.initialValue || '');
  const inputClass = 'w-full rounded-xl border border-line-strong bg-surface p-3 text-sm text-ink';
  return (
    <Dialog label={options.title} onClose={() => onFinish(null)} placement="sheet">
      <div className="dialog-panel w-full max-w-md space-y-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div><span className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${options.danger ? 'bg-rose-50 text-rose-700' : 'bg-brand-50 text-brand-700'}`}><MessageSquareText className="h-5 w-5" aria-hidden="true" /></span><h2 className="font-semibold text-ink">{options.title}</h2></div>
          <button type="button" className="icon-button" onClick={() => onFinish(null)} aria-label="Fechar solicitação"><X className="h-5 w-5" /></button>
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-ink-secondary">{options.message}</p>
        <form onSubmit={(event) => { event.preventDefault(); onFinish(value.trim()); }} className="space-y-5">
          <div><label htmlFor="operation-input" className="mb-2 block text-sm font-medium">{options.label}{options.required === false && <span className="font-normal text-ink-muted"> (opcional)</span>}</label>{options.multiline === false ? <input id="operation-input" value={value} onChange={(event) => setValue(event.target.value)} required={options.required !== false} className={inputClass} /> : <textarea id="operation-input" value={value} onChange={(event) => setValue(event.target.value)} required={options.required !== false} rows={3} className={inputClass} />}</div>
          <div className="flex flex-wrap justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => onFinish(null)}>Voltar</button><button type="submit" disabled={options.required !== false && !value.trim()} className={options.danger ? 'btn-danger' : 'btn-primary'}>{options.confirmText || 'Confirmar'}</button></div>
        </form>
      </div>
    </Dialog>
  );
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<FeedbackRequest[]>([]);
  const nextId = useRef(0);
  const pending = useRef(new Set<(value: string | null) => void>());
  const requestText = useCallback((options: TextRequestOptions) => new Promise<string | null>((resolve) => {
    pending.current.add(resolve);
    setQueue((current) => [...current, { id: ++nextId.current, kind: 'text', options, resolve }]);
  }), []);
  const notify = useCallback((message: string, tone: Tone = 'info') => {
    setQueue((current) => [...current, { id: ++nextId.current, kind: 'notice', message, tone }]);
  }, []);
  useEffect(() => () => {
    pending.current.forEach((resolve) => resolve(null));
    pending.current.clear();
  }, []);
  const context = useMemo(() => ({ requestText, notify }), [requestText, notify]);
  const current = queue[0];
  const finish = (value: string | null) => {
    if (!current) return;
    if (current.kind === 'text') { pending.current.delete(current.resolve); current.resolve(value); }
    setQueue((requests) => requests.filter((request) => request.id !== current.id));
  };
  const title = current?.kind === 'notice' ? current.tone === 'success' ? 'Tudo certo' : current.tone === 'error' ? 'Não foi possível concluir' : 'Atenção' : '';

  return (
    <FeedbackContext.Provider value={context}>
      {children}
      {current?.kind === 'text' && <TextRequest key={current.id} options={current.options} onFinish={finish} />}
      {current?.kind === 'notice' && <Dialog key={current.id} label={title} onClose={() => finish(null)}><div className="dialog-panel w-full max-w-md space-y-4 p-6"><span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${current.tone === 'success' ? 'bg-emerald-50 text-emerald-700' : current.tone === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-brand-50 text-brand-700'}`}>{current.tone === 'success' ? <CheckCircle2 className="h-6 w-6" aria-hidden="true" /> : <AlertCircle className="h-6 w-6" aria-hidden="true" />}</span><h2 className="font-semibold text-ink">{title}</h2><p className="whitespace-pre-line text-sm leading-relaxed text-ink-secondary" role={current.tone === 'error' ? 'alert' : 'status'}>{current.message}</p><button type="button" className="btn-primary w-full" onClick={() => finish(null)}>Entendi</button></div></Dialog>}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback requires FeedbackProvider.');
  return context;
}
