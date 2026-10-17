import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Edit3, CheckCircle2, AlertCircle, MapPin } from 'lucide-react';
import { callRpc } from '../../lib/remote';
import { isSupabaseConfigured } from '../../lib/supabase';
import { logger } from '../../lib/logger';
import { formatBRL } from '../../lib/formatters';
import { useConfirm } from '../../components/ui/ConfirmDialog';

interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  active: boolean;
  display_order: number;
}

export const DeliveryZonesView: React.FC = () => {
  const confirm = useConfirm();
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formFee, setFormFee] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadZones = async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    try {
      const { supabase } = await import('../../lib/supabase');
      const { data } = await supabase
        .from('delivery_zones')
        .select('*')
        .order('display_order', { ascending: true });
      if (data) setZones(data);
    } catch (err) {
      logger.error({ context: 'DeliveryZones', message: 'Erro ao carregar bairros', data: { err } });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadZones(); }, []);

  const resetForm = () => {
    setFormName('');
    setFormFee('');
    setIsAdding(false);
    setEditingId(null);
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const name = formName.trim();
    const fee = parseFloat(formFee.replace(',', '.'));

    if (name.length < 2) {
      setError('Nome do bairro deve ter pelo menos 2 caracteres.');
      return;
    }
    if (isNaN(fee) || fee < 0) {
      setError('Taxa de entrega deve ser zero ou positiva.');
      return;
    }

    try {
      if (isSupabaseConfigured) {
        await callRpc('upsert_delivery_zone', {
          p_name: name,
          p_fee: fee,
        }, 'DeliveryZones');
      }
      setSuccess(editingId ? `Bairro "${name}" atualizado.` : `Bairro "${name}" criado.`);
      logger.info({ context: 'DeliveryZones', message: `Bairro ${editingId ? 'editado' : 'criado'}: ${name}` });
      resetForm();
      setTimeout(() => setSuccess(null), 3000);
      void loadZones();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar bairro.');
    }
  };

  const handleEdit = (zone: DeliveryZone) => {
    setEditingId(zone.id);
    setFormName(zone.name);
    setFormFee(String(zone.fee));
    setIsAdding(true);
    setError(null);
    setSuccess(null);
  };

  const handleDeactivate = async (zone: DeliveryZone) => {
    const confirmed = await confirm({ title: 'Desativar bairro', message: `Desativar o bairro "${zone.name}"? Ele deixará de aparecer no cardápio digital.`, confirmText: 'Desativar', variant: 'danger' });
    if (!confirmed) return;
    try {
      if (isSupabaseConfigured) {
        await callRpc('deactivate_delivery_zone', { p_zone_id: zone.id }, 'DeliveryZones');
      }
      setSuccess(`Bairro "${zone.name}" desativado.`);
      logger.info({ context: 'DeliveryZones', message: `Bairro ${zone.id} (${zone.name}) desativado.` });
      setTimeout(() => setSuccess(null), 3000);
      void loadZones();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao desativar bairro.');
    }
  };

  const activeZones = zones.filter((z) => z.active);

  if (loading) {
    return <div className="py-12 text-center text-sm text-ink-muted">Carregando bairros...</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="notice border-rose-200 bg-rose-50 text-rose-800" role="alert">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}
      {success && (
        <div className="notice border-emerald-200 bg-emerald-50 text-emerald-800" role="status">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{success}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink">Bairros e taxas de entrega</h3>
          <p className="text-xs text-ink-muted">
            Configure os bairros atendidos e a taxa de entrega de cada um. Aparece no cardápio digital.
          </p>
        </div>
        {!isAdding && (
          <button type="button" onClick={() => { resetForm(); setIsAdding(true); }} className="btn-primary text-xs">
            <Plus className="h-4 w-4" />
            Novo Bairro
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleSave} className="card space-y-4 max-w-md">
          <h4 className="text-sm font-bold text-ink">
            {editingId ? 'Editar bairro' : 'Adicionar novo bairro'}
          </h4>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Nome do bairro</label>
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Ex: Jardim das Américas"
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Taxa de entrega (R$)</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-ink-muted font-mono font-bold">R$</span>
              <input
                type="text"
                required
                value={formFee}
                onChange={(e) => setFormFee(e.target.value)}
                placeholder="7.00"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-line bg-surface text-sm font-mono font-bold"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary text-xs">
              <CheckCircle2 className="h-4 w-4" />
              {editingId ? 'Salvar alterações' : 'Criar bairro'}
            </button>
            <button type="button" onClick={resetForm} className="btn-secondary text-xs">Cancelar</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {activeZones.map((zone) => (
          <div key={zone.id} className="card flex items-center justify-between gap-3 border-l-4 border-l-brand-500">
            <div className="flex items-center gap-3 min-w-0">
              <span className="icon-tile bg-brand-100 text-brand-700 shrink-0">
                <MapPin className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h4 className="text-sm font-bold text-ink truncate">{zone.name}</h4>
                <p className="text-xs text-ink-muted tabular-nums">{formatBRL(zone.fee)}</p>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleEdit(zone)}
                className="rounded-lg bg-surface-soft px-2 py-1.5 text-[11px] font-semibold text-ink-secondary hover:bg-brand-50 hover:text-brand-700 transition"
                title="Editar bairro"
              >
                <Edit3 className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handleDeactivate(zone)}
                className="rounded-lg bg-surface-soft px-2 py-1.5 text-ink-muted hover:bg-rose-50 hover:text-rose-700 transition"
                title="Desativar bairro"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {activeZones.length === 0 && !isAdding && (
        <div className="py-12 text-center text-sm text-ink-muted">
          Nenhum bairro ativo cadastrado. Clique em "Novo Bairro" para começar.
        </div>
      )}
    </div>
  );
};