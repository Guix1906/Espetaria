import { MessageCircle, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  WHATSAPP_EVENTS,
  WHATSAPP_VARIABLES,
  type WhatsAppTemplates,
  renderWhatsAppTemplate,
  resolveWhatsAppTemplates,
  whatsAppVariables,
} from '../../lib/whatsappTemplates';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { useSettingsStore } from '../../stores/useSettingsStore';
import type { WhatsAppEvent } from '../../types/domain';
import { publicAppUrl } from '../../lib/publicUrl';

/** URL da Edge Function que envia as mensagens (derivada do projeto Supabase). */
function defaultDispatchUrl(): string {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  return base ? `${base}/functions/v1/whatsapp-dispatch` : '';
}

/** Pedido de exemplo para a prévia das mensagens. */
const SAMPLE_ORDER = {
  id: 'exemplo',
  customer_name: 'Maria Souza',
  order_number: 1042,
  total: 86.5,
  delivery_fee: 6.5,
  payment_method: 'DINHEIRO' as const,
  cash_change_for: 100,
  address_street: 'Rua das Flores',
  address_number: '120',
  address_neighborhood: 'Centro',
  driver_name: 'Carlos',
  cancel_reason: 'Cliente pediu o cancelamento',
  items: [{ quantity: 4, product_name: 'Espeto de picanha' }, { quantity: 2, product_name: 'Refrigerante lata' }],
};

type ConnectionResult = { connected?: boolean; state?: string; provider?: string; instance?: string | null; error?: string };

/** Pergunta ao servidor (Edge Function whatsapp-status) se o WhatsApp está conectado. A chave fica no servidor. */
function ConnectionCheck() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ConnectionResult | null>(null);

  const check = async () => {
    setChecking(true);
    try {
      if (!isSupabaseConfigured) {
        setResult({ connected: false, error: 'Modo demonstração: sem servidor.' });
        return;
      }
      const { data, error } = await supabase.functions.invoke('whatsapp-status', { body: {} });
      setResult(error ? { connected: false, error: error.message } : (data as ConnectionResult));
    } catch (err) {
      setResult({ connected: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-sm border border-line p-3 text-xs">
      <button type="button" className="btn-secondary text-xs" onClick={check} disabled={checking}>
        {checking ? 'Verificando...' : 'Testar conexão do WhatsApp'}
      </button>
      {result && (
        <span className={result.connected ? 'font-semibold text-emerald-700' : 'font-semibold text-red-700'}>
          {result.connected
            ? `Conectado (instância ${result.instance ?? ''})`
            : `Não conectado${result.state && result.state !== 'error' ? ` (estado: ${result.state})` : ''}${result.error ? ` — ${result.error}` : ''}`}
        </span>
      )}
    </div>
  );
}

/** Liga/desliga o envio automático de WhatsApp e edita o texto de cada mensagem. */
export function WhatsAppAutoCard() {
  const { settings, updateSettings } = useSettingsStore();
  const { notify } = useFeedback();
  const enabled = !!settings.whatsapp_auto_enabled;

  const saved = useMemo(() => resolveWhatsAppTemplates(settings.whatsapp_templates), [settings.whatsapp_templates]);
  const [draft, setDraft] = useState<WhatsAppTemplates>(saved);
  const [selected, setSelected] = useState<WhatsAppEvent>('CONFIRMED');
  useEffect(() => setDraft(saved), [saved]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const current = draft[selected];
  const preview = renderWhatsAppTemplate(current.text, whatsAppVariables(SAMPLE_ORDER, settings.name, publicAppUrl()));

  const toggle = (value: boolean) => {
    updateSettings({
      whatsapp_auto_enabled: value,
      whatsapp_dispatch_url: settings.whatsapp_dispatch_url || defaultDispatchUrl(),
      // Token dedicado deve ser gerado nos secrets da Edge Function; nunca usar anon_key
      whatsapp_dispatch_token: settings.whatsapp_dispatch_token ?? null,
    });
  };

  const edit = (patch: Partial<WhatsAppTemplates[WhatsAppEvent]>) =>
    setDraft((d) => ({ ...d, [selected]: { ...d[selected], ...patch } }));

  const save = () => {
    updateSettings({ whatsapp_templates: draft });
    notify('Mensagens salvas.', 'success');
  };

  return (
    <div className="surface-card p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="icon-tile"><MessageCircle className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h3 className="text-base font-bold text-ink">WhatsApp automático do delivery</h3>
            <p className="text-xs text-ink-muted">O cliente recebe uma mensagem em cada etapa do pedido. Escolha quais mensagens enviar e ajuste o texto.</p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-brand-900">
          <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} className="h-5 w-5 rounded border-line text-brand-700" />
          <span>{enabled ? 'Ativado' : 'Desativado'}</span>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <ul className="space-y-1" aria-label="Mensagens automáticas">
          {WHATSAPP_EVENTS.map(({ event, label }) => (
            <li key={event}>
              <button
                type="button"
                onClick={() => setSelected(event)}
                aria-pressed={selected === event}
                className={`flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-sm ${selected === event ? 'bg-brand-50 font-semibold text-brand-900' : 'text-ink hover:bg-surface-muted'}`}
              >
                <span>{label}</span>
                <span className={`text-[11px] ${draft[event].enabled ? 'text-emerald-700' : 'text-ink-muted'}`}>{draft[event].enabled ? 'ligada' : 'desligada'}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-ink-muted">{WHATSAPP_EVENTS.find((e) => e.event === selected)?.when}</p>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
              <input type="checkbox" checked={current.enabled} onChange={(e) => edit({ enabled: e.target.checked })} className="h-4 w-4 rounded border-line text-brand-700" />
              Enviar esta mensagem
            </label>
          </div>

          <label htmlFor="wa-template" className="sr-only">Texto da mensagem</label>
          <textarea
            id="wa-template"
            rows={7}
            value={current.text}
            onChange={(e) => edit({ text: e.target.value })}
            disabled={!current.enabled}
            className="w-full rounded-sm border border-line bg-surface p-3 font-mono text-xs text-ink disabled:opacity-60"
          />

          <details className="text-xs text-ink-secondary">
            <summary className="cursor-pointer font-semibold">Variáveis que você pode usar</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {WHATSAPP_VARIABLES.map((v) => (
                <li key={v.key}><code className="text-brand-800">{`{${v.key}}`}</code> {v.label}</li>
              ))}
            </ul>
            <p className="mt-2">Para deixar um trecho em negrito no WhatsApp, coloque entre asteriscos: <code>*assim*</code>.</p>
          </details>

          <div>
            <p className="mb-1 text-xs font-semibold text-ink-muted">Prévia (pedido de exemplo)</p>
            <div className="whitespace-pre-wrap break-words rounded-sm bg-emerald-50 p-3 text-xs text-ink">{current.enabled ? preview : 'Esta mensagem não será enviada.'}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary text-xs" onClick={save} disabled={!dirty}>Salvar mensagens</button>
            <button type="button" className="btn-secondary text-xs" onClick={() => edit({ text: DEFAULT_WHATSAPP_TEMPLATES[selected].text })}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Voltar ao texto padrão
            </button>
          </div>
        </div>
      </div>

      <ConnectionCheck />

      <p className="rounded-sm bg-surface-soft p-3 text-xs text-ink-secondary">
        O envio usa o número conectado no provedor de WhatsApp (Evolution API ou Z-API, configurado no Supabase). O status de cada mensagem (enviada, na fila, desligada ou com falha) aparece no cartão do pedido, na tela Delivery.
      </p>
    </div>
  );
}
