import { useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { FilterChip } from '../../components/ui/FilterChip';
import { useSettingsStore } from '../../stores/useSettingsStore';
import {
  DEFAULT_PRINT_TEMPLATES,
  LAYOUT_LABELS,
  type PrintLayout,
  previewSectorTicket,
  resolvePrintTemplates,
  type PrintTemplates,
  type SectorTemplate,
} from '../../lib/printTemplates';

type Target = 'GRILL' | 'KITCHEN' | 'EXPEDICAO';

const SAMPLE_ITEMS = {
  GRILL: [
    { quantity: 2, name: 'Espeto de picanha', doneness: 'AO PONTO', notes: 'Sem sal grosso', price: 12 },
    { quantity: 1, name: 'Espeto de frango com bacon', price: 10 },
  ],
  KITCHEN: [
    { quantity: 1, name: 'Mandioca frita', notes: 'Bem sequinha', price: 18 },
    { quantity: 2, name: 'Vinagrete', price: 4 },
  ],
  EXPEDICAO: [
    { quantity: 2, name: 'Espeto de picanha', doneness: 'AO PONTO', price: 12 },
    { quantity: 1, name: 'Mandioca frita', price: 18 },
  ],
};

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm">
      <span>{label}</span>
      <input type="checkbox" className="h-5 w-5" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export function PrintTemplatesEditor() {
  const { settings, updateSettings } = useSettingsStore();
  const [draft, setDraft] = useState<PrintTemplates>(() => resolvePrintTemplates(settings.print_templates));
  const [target, setTarget] = useState<Target>('GRILL');
  const [deliveryPreview, setDeliveryPreview] = useState(false);
  const [saved, setSaved] = useState(false);

  const tpl = draft[target];
  const label = draft.DELIVERY_LABEL;
  const setTpl = (patch: Partial<SectorTemplate>) => { setSaved(false); setDraft((d) => ({ ...d, [target]: { ...d[target], ...patch } })); };
  const setLabel = (patch: Partial<PrintTemplates['DELIVERY_LABEL']>) => { setSaved(false); setDraft((d) => ({ ...d, DELIVERY_LABEL: { ...d.DELIVERY_LABEL, ...patch } })); };

  const preview = previewSectorTicket(tpl, label, {
    restaurantName: settings.name,
    width: settings.print_paper_width === '58mm' ? 32 : 42,
    delivery: deliveryPreview,
    items: SAMPLE_ITEMS[target],
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="surface-card space-y-5 p-5 lg:col-span-7">
        <div>
          <h2 className="text-lg font-bold">Modelos de impressão</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Pedidos do garçom e do delivery são divididos automaticamente: <strong>espetos</strong> vão para a impressora da
            churrasqueira e <strong>acompanhamentos</strong> para a da cozinha (conforme o setor de cada produto). No delivery, cada
            cupom sai com uma etiqueta do cliente para identificar a embalagem.
          </p>
        </div>

        <div className="filter-bar" aria-label="Modelo">
          <FilterChip active={target === 'GRILL'} onClick={() => setTarget('GRILL')}>Churrasqueira (espetos)</FilterChip>
          <FilterChip active={target === 'KITCHEN'} onClick={() => setTarget('KITCHEN')}>Cozinha (acompanhamentos)</FilterChip>
          <FilterChip active={target === 'EXPEDICAO'} onClick={() => { setTarget('EXPEDICAO'); setDeliveryPreview(true); }}>Expedição delivery (caixa)</FilterChip>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="tpl-layout">Modelo do cupom</label>
            <select id="tpl-layout" className="mt-1 w-full rounded-xl border p-3" value={tpl.layout} onChange={(e) => setTpl({ layout: e.target.value as PrintLayout })}>
              {(Object.keys(LAYOUT_LABELS) as PrintLayout[]).filter((key) => target !== 'EXPEDICAO' || key !== 'ANOTA_PRODUCAO').map((key) => <option key={key} value={key}>{LAYOUT_LABELS[key]}</option>)}
            </select>
            <p className="mt-1 text-xs text-ink-muted">Produção e Completo seguem os cupons que a loja já usava no Anota AI.</p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="tpl-title">Título do cupom</label>
            <input id="tpl-title" className="mt-1 w-full rounded-xl border p-3" maxLength={40} value={tpl.title} onChange={(e) => setTpl({ title: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <label htmlFor="tpl-size">Tamanho dos itens</label>
            <select id="tpl-size" className="mt-1 w-full rounded-xl border p-3" value={tpl.item_size} onChange={(e) => setTpl({ item_size: Number(e.target.value) as 1 | 3 })}>
              <option value={3}>Grande (altura dupla)</option>
              <option value={1}>Normal</option>
            </select>
          </div>
          <div>
            <label htmlFor="tpl-copies">Vias</label>
            <select id="tpl-copies" className="mt-1 w-full rounded-xl border p-3" value={tpl.copies} onChange={(e) => setTpl({ copies: Number(e.target.value) })}>
              <option value={1}>1 via</option><option value={2}>2 vias</option><option value={3}>3 vias</option>
            </select>
          </div>
          <Toggle label="Nome da espetaria no topo" checked={tpl.show_restaurant_name} onChange={(v) => setTpl({ show_restaurant_name: v })} />
          <Toggle label="Ponto da carne" checked={tpl.show_doneness} onChange={(v) => setTpl({ show_doneness: v })} />
          <Toggle label="Observações" checked={tpl.show_notes} onChange={(v) => setTpl({ show_notes: v })} />
          <Toggle label="Nome do garçom" checked={tpl.show_waiter} onChange={(v) => setTpl({ show_waiter: v })} />
          <Toggle label="Data e hora" checked={tpl.show_time} onChange={(v) => setTpl({ show_time: v })} />
          <Toggle label="Bip ao imprimir" checked={tpl.beep} onChange={(v) => setTpl({ beep: v })} />
          <div className="sm:col-span-2">
            <label htmlFor="tpl-footer">Rodapé (opcional)</label>
            <input id="tpl-footer" className="mt-1 w-full rounded-xl border p-3" maxLength={60} value={tpl.footer} onChange={(e) => setTpl({ footer: e.target.value })} />
          </div>
        </div>

        <div className="space-y-3 border-t border-line pt-5">
          <h3 className="font-bold">Etiqueta de delivery</h3>
          <p className="text-sm text-ink-muted">Sai logo abaixo do cupom da churrasqueira e da cozinha, para colar na embalagem.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle label="Imprimir etiqueta" checked={label.enabled} onChange={(v) => setLabel({ enabled: v })} />
            <Toggle label="Telefone" checked={label.show_phone} onChange={(v) => setLabel({ show_phone: v })} />
            <Toggle label="Endereço e bairro" checked={label.show_address} onChange={(v) => setLabel({ show_address: v })} />
            <Toggle label="Ponto de referência" checked={label.show_reference} onChange={(v) => setLabel({ show_reference: v })} />
            <Toggle label="Forma de pagamento / troco" checked={label.show_payment} onChange={(v) => setLabel({ show_payment: v })} />
            <Toggle label="Total do pedido" checked={label.show_total} onChange={(v) => setLabel({ show_total: v })} />
            <div className="sm:col-span-2">
              <label htmlFor="label-footer">Rodapé da etiqueta</label>
              <input id="label-footer" className="mt-1 w-full rounded-xl border p-3" maxLength={60} value={label.footer} onChange={(e) => setLabel({ footer: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={() => { updateSettings({ print_templates: draft }); setSaved(true); }}>
            <Save className="h-4 w-4" />Salvar modelos
          </button>
          <button type="button" className="btn-secondary" onClick={() => { setDraft(DEFAULT_PRINT_TEMPLATES); setSaved(false); }}>
            <RotateCcw className="h-4 w-4" />Restaurar padrão
          </button>
          {saved && <p role="status" className="self-center text-sm font-semibold text-emerald-700">Modelos salvos. As impressoras usam o novo modelo em até 30 segundos.</p>}
        </div>
      </div>

      <div className="surface-card space-y-3 p-5 lg:col-span-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold">Prévia</h3>
          <div className="filter-bar">
            <FilterChip active={!deliveryPreview} onClick={() => setDeliveryPreview(false)}>Salão</FilterChip>
            <FilterChip active={deliveryPreview} onClick={() => setDeliveryPreview(true)}>Delivery</FilterChip>
          </div>
        </div>
        <pre aria-label="Prévia do cupom" className="overflow-x-auto rounded-xl bg-white p-4 font-mono text-xs leading-5 text-black shadow-inner">{preview}</pre>
      </div>
    </div>
  );
}
