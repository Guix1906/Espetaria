import { RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { Switch } from '../../components/ui/Switch';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  WHATSAPP_EVENTS,
  WHATSAPP_VARIABLES,
  type WhatsAppTemplates,
  renderWhatsAppTemplate,
  resolveWhatsAppTemplates,
  whatsAppVariables,
} from '../../lib/whatsappTemplates';
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

/** Mensagens automáticas do delivery: liga/desliga geral, cada etapa e o texto de cada uma. */
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
  const info = WHATSAPP_EVENTS.find((e) => e.event === selected);
  const preview = renderWhatsAppTemplate(current.text, whatsAppVariables(SAMPLE_ORDER, settings.name, publicAppUrl()));

  const toggle = (value: boolean) => {
    updateSettings({
      whatsapp_auto_enabled: value,
      whatsapp_dispatch_url: settings.whatsapp_dispatch_url || defaultDispatchUrl(),
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
    <section className="surface-card overflow-hidden" aria-labelledby="wa-auto-title">
      <header className="flex items-center justify-between gap-4 border-b border-line p-4 sm:px-5">
        <div className="min-w-0">
          <h3 id="wa-auto-title" className="text-base font-semibold text-ink">Mensagens automáticas do pedido</h3>
          <p className="text-sm text-ink-muted">O cliente recebe uma mensagem a cada etapa do delivery e da retirada.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-medium text-ink-secondary">{enabled ? 'Ligadas' : 'Desligadas'}</span>
          <Switch checked={enabled} onChange={toggle} label="Mensagens automáticas" />
        </div>
      </header>

      <div className={`grid lg:grid-cols-[15rem_minmax(0,1fr)] ${enabled ? '' : 'opacity-60'}`}>
        <nav className="border-b border-line p-2 lg:border-b-0 lg:border-r" aria-label="Etapas do pedido">
          <ul className="flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
            {WHATSAPP_EVENTS.map(({ event, label }) => (
              <li key={event} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSelected(event)}
                  aria-pressed={selected === event}
                  className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-sm px-3 text-left text-sm ${selected === event ? 'bg-brand-50 font-semibold text-brand-900' : 'text-ink hover:bg-surface-muted'}`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${draft[event].enabled ? 'bg-emerald-600' : 'bg-line-strong'}`} aria-hidden="true" />
                  <span className="whitespace-nowrap">{label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-ink">{info?.label}</p>
              <p className="text-sm text-ink-muted">{info?.when}</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-secondary">
              Enviar
              <Switch checked={current.enabled} onChange={(v) => edit({ enabled: v })} label={`Enviar a mensagem ${info?.label ?? ''}`} />
            </label>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div>
              <label htmlFor="wa-template" className="mb-1.5 block text-sm font-medium text-ink-secondary">Texto</label>
              <textarea
                id="wa-template"
                rows={9}
                value={current.text}
                onChange={(e) => edit({ text: e.target.value })}
                disabled={!current.enabled}
                className="w-full rounded-sm border border-line-strong bg-surface p-3 text-sm leading-relaxed text-ink disabled:opacity-60"
              />
              <details className="mt-2 text-sm text-ink-secondary">
                <summary className="cursor-pointer text-ink-muted">Palavras que o sistema troca sozinho</summary>
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {WHATSAPP_VARIABLES.map((v) => (
                    <li key={v.key}><code className="text-brand-800">{`{${v.key}}`}</code> {v.label}</li>
                  ))}
                </ul>
                <p className="mt-2">Negrito no WhatsApp: coloque entre asteriscos, <code>*assim*</code>.</p>
              </details>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-ink-secondary">Como o cliente vê</p>
              <div className="rounded-sm bg-surface-muted p-3">
                <div className="ml-auto max-w-[95%] whitespace-pre-wrap break-words rounded-md bg-emerald-50 p-3 text-sm leading-relaxed text-ink shadow-xs">
                  {current.enabled ? preview : 'Esta mensagem não será enviada.'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <button type="button" className="btn-secondary min-h-[44px]" onClick={() => edit({ text: DEFAULT_WHATSAPP_TEMPLATES[selected].text })}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />Texto padrão
            </button>
            <button type="button" className="btn-primary min-h-[44px]" onClick={save} disabled={!dirty}>Salvar mensagens</button>
          </div>
        </div>
      </div>
    </section>
  );
}
