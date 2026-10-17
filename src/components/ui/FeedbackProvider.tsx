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
interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
}
interface ChoiceRequestOptions {
  title: string;
  message: string;
  choices: ChoiceOption[];
}
interface FeedbackContextValue {
  requestText: (options: TextRequestOptions) => Promise<string | null>;
  /** Pergunta com botões grandes (uma opção por botão). Fechar = null. */
  requestChoice: (options: ChoiceRequestOptions) => Promise<string | null>;
  notify: (message: string, tone?: Tone) => void;
}
type FeedbackRequest =
  | { id: number; kind: 'text'; options: TextRequestOptions; resolve: (value: string | null) => void }
  | { id: number; kind: 'choice'; options: ChoiceRequestOptions; resolve: (value: string | null) => void }
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

function ChoiceRequest({ options, onFinish }: { options: ChoiceRequestOptions; onFinish: (value: string | null) => void }) {
  return (
    <Dialog label={options.title} onClose={() => onFinish(null)} placement="sheet">
      <div className="dialog-panel w-full max-w-md space-y-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-ink">{options.title}</h2>
          <button type="button" className="icon-button" onClick={() => onFinish(null)} aria-label="Fechar pergunta"><X className="h-5 w-5" /></button>
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-ink-secondary">{options.message}</p>
        <div className="space-y-2">
          {options.choices.map((choice) => (
            <button key={choice.value} type="button" onClick={() => onFinish(choice.value)} className="w-full rounded-lg border border-line-strong bg-surface p-3.5 text-left transition hover:border-brand-500 hover:bg-brand-50">
              <span className="block text-sm font-semibold text-ink">{choice.label}</span>
              {choice.description && <span className="mt-0.5 block text-xs text-ink-muted">{choice.description}</span>}
            </button>
          ))}
        </div>
        <div className="flex justify-end"><button type="button" className="btn-secondary" onClick={() => onFinish(null)}>Voltar</button></div>
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
  const requestChoice = useCallback((options: ChoiceRequestOptions) => new Promise<string | null>((resolve) => {
    pending.current.add(resolve);
    setQueue((current) => [...current, { id: ++nextId.current, kind: 'choice', options, resolve }]);
  }), []);
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  // Sucesso/informação: aviso discreto que some sozinho. Erro: janela que exige leitura.
  const notify = useCallback((message: string, tone: Tone = 'info') => {
    const id = ++nextId.current;
    if (tone === 'error') { setQueue((current) => [...current, { id, kind: 'notice', message, tone }]); return; }
    setToasts((current) => [...current.slice(-2), { id, message }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3500);
  }, []);
  useEffect(() => () => {
    pending.current.forEach((resolve) => resolve(null));
    pending.current.clear();
  }, []);
  const context = useMemo(() => ({ requestText, requestChoice, notify }), [requestText, requestChoice, notify]);
  const current = queue[0];
  const finish = (value: string | null) => {
    if (!current) return;
    if (current.kind !== 'notice') { pending.current.delete(current.resolve); current.resolve(value); }
    setQueue((requests) => requests.filter((request) => request.id !== current.id));
  };
  const title = current?.kind === 'notice' ? current.tone === 'success' ? 'Tudo certo' : current.tone === 'error' ? 'Não foi possível concluir' : 'Atenção' : '';

  return (
    <FeedbackContext.Provider value={context}>
      {children}
      {current?.kind === 'text' && <TextRequest key={current.id} options={current.options} onFinish={finish} />}
      {current?.kind === 'choice' && <ChoiceRequest key={current.id} options={current.options} onFinish={finish} />}
      {current?.kind === 'notice' && <Dialog key={current.id} label={title} onClose={() => finish(null)}><div className="dialog-panel w-full max-w-md space-y-4 p-6"><span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${current.tone === 'success' ? 'bg-emerald-50 text-emerald-700' : current.tone === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-brand-50 text-brand-700'}`}>{current.tone === 'success' ? <CheckCircle2 className="h-6 w-6" aria-hidden="true" /> : <AlertCircle className="h-6 w-6" aria-hidden="true" />}</span><h2 className="font-semibold text-ink">{title}</h2><p className="whitespace-pre-line text-sm leading-relaxed text-ink-secondary" role={current.tone === 'error' ? 'alert' : 'status'}>{current.message}</p><button type="button" className="btn-primary w-full" onClick={() => finish(null)}>Entendi</button></div></Dialog>}
      {toasts.length > 0 && <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">{toasts.map((toast) => <div key={toast.id} className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-lg bg-stone-900 px-4 py-3 text-sm text-white shadow-floating"><CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" /><span>{toast.message}</span><button type="button" className="-mr-2 ml-1 inline-flex !min-h-0 !min-w-0 rounded p-1 text-stone-400 hover:text-white" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} aria-label="Fechar aviso"><X className="h-4 w-4" /></button></div>)}</div>}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback requires FeedbackProvider.');
  return context;
}
