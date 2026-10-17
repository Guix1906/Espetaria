import React, { useState } from 'react';
import { Plus, Trash2, Edit3, CheckCircle2, AlertCircle, Users } from 'lucide-react';
import { useTableStore } from '../../stores/useTableStore';
import { callRpc } from '../../lib/remote';
import { isSupabaseConfigured } from '../../lib/supabase';
import { logger } from '../../lib/logger';
import { useConfirm } from '../../components/ui/ConfirmDialog';

export const TableManagementView: React.FC = () => {
  const { tables } = useTableStore();
  const confirm = useConfirm();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formNumber, setFormNumber] = useState('');
  const [formCapacity, setFormCapacity] = useState('4');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeTables = tables.filter((t) => t.active).sort((a, b) => a.number - b.number);

  const resetForm = () => {
    setFormNumber('');
    setFormCapacity('4');
    setIsAdding(false);
    setEditingId(null);
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const num = parseInt(formNumber, 10);
    const cap = parseInt(formCapacity, 10);

    if (!num || num < 1 || num > 99) {
      setError('Número da mesa deve estar entre 1 e 99.');
      return;
    }
    if (!cap || cap < 1 || cap > 50) {
      setError('Capacidade deve estar entre 1 e 50.');
      return;
    }

    try {
      if (editingId) {
        if (isSupabaseConfigured) {
          await callRpc('update_restaurant_table', {
            p_table_id: editingId,
            p_number: num,
            p_capacity: cap,
          }, 'TableManagement');
        }
        useTableStore.getState().applyRemoteTableUpdate({
          id: editingId,
          number: num,
          capacity: cap,
        });
        setSuccess(`Mesa ${num} atualizada com sucesso.`);
        logger.info({ context: 'TableManagement', message: `Mesa ${editingId} editada para nº ${num}.` });
      } else {
        if (isSupabaseConfigured) {
          await callRpc('create_restaurant_table', {
            p_number: num,
            p_capacity: cap,
          }, 'TableManagement');
        } else {
          // Modo demo: adiciona localmente
          const { generateId } = await import('../../lib/utils');
          useTableStore.getState().applyRemoteTableUpdate({
            id: generateId(),
            number: num,
            capacity: cap,
            status: 'LIVRE',
            active: true,
            version: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        setSuccess(`Mesa ${num} criada com sucesso.`);
        logger.info({ context: 'TableManagement', message: `Nova mesa ${num} criada.` });
      }
      resetForm();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar mesa.');
    }
  };

  const handleEdit = (table: typeof activeTables[0]) => {
    setEditingId(table.id);
    setFormNumber(String(table.number));
    setFormCapacity(String(table.capacity));
    setIsAdding(true);
    setError(null);
    setSuccess(null);
  };

  const handleDeactivate = async (table: typeof activeTables[0]) => {
    if (table.status === 'OCUPADA') {
      setError(`Não é possível desativar a Mesa ${table.number}: ela está ocupada. Encerre a comanda primeiro.`);
      return;
    }
    const confirmed = await confirm({ title: 'Desativar mesa', message: `Tem certeza que deseja desativar a Mesa ${table.number}? Ela deixará de aparecer no salão.`, confirmText: 'Desativar', variant: 'danger' });
    if (!confirmed) return;

    try {
      if (isSupabaseConfigured) {
        await callRpc('deactivate_restaurant_table', { p_table_id: table.id }, 'TableManagement');
      }
      useTableStore.getState().applyRemoteTableUpdate({
        id: table.id,
        active: false,
      });
      setSuccess(`Mesa ${table.number} desativada.`);
      logger.info({ context: 'TableManagement', message: `Mesa ${table.id} (${table.number}) desativada.` });
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao desativar mesa.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Feedback */}
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

      {/* Header + Add Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink">Mesas do salão</h3>
          <p className="text-xs text-ink-muted">
            Adicione, edite ou desative mesas. Mesas ocupadas não podem ser removidas.
          </p>
        </div>
        {!isAdding && (
          <button
            type="button"
            onClick={() => { resetForm(); setIsAdding(true); }}
            className="btn-primary text-xs"
          >
            <Plus className="h-4 w-4" />
            Nova Mesa
          </button>
        )}
      </div>

      {/* Form */}
      {isAdding && (
        <form onSubmit={handleSave} className="surface-card p-4 sm:p-5 space-y-4 max-w-md">
          <h4 className="text-sm font-bold text-ink">
            {editingId ? 'Editar mesa' : 'Adicionar nova mesa'}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Número</label>
              <input
                type="number"
                min={1}
                max={99}
                required
                value={formNumber}
                onChange={(e) => setFormNumber(e.target.value)}
                placeholder="Ex: 21"
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-mono font-bold"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Capacidade</label>
              <input
                type="number"
                min={1}
                max={50}
                required
                value={formCapacity}
                onChange={(e) => setFormCapacity(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm font-mono font-bold"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="btn-primary text-xs">
              <CheckCircle2 className="h-4 w-4" />
              {editingId ? 'Salvar alterações' : 'Criar mesa'}
            </button>
            <button type="button" onClick={resetForm} className="btn-secondary text-xs">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Table Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {activeTables.map((table) => (
          <div
            key={table.id}
            className={`surface-card p-4 sm:p-5 relative space-y-2 border-l-4 ${
              table.status === 'OCUPADA'
                ? 'border-l-amber-500 bg-amber-50/30'
                : table.status === 'AGUARDANDO_CONTA'
                  ? 'border-l-rose-500 bg-rose-50/30'
                  : 'border-l-emerald-500'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tabular-nums text-ink">
                  {String(table.number).padStart(2, '0')}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-ink-muted">
                  <Users className="h-3 w-3" />
                  {table.capacity}
                </span>
              </div>
              <span
                className={`rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${
                  table.status === 'OCUPADA'
                    ? 'bg-amber-100 text-amber-800'
                    : table.status === 'AGUARDANDO_CONTA'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {table.status === 'OCUPADA' ? 'Ocupada' : table.status === 'AGUARDANDO_CONTA' ? 'Conta' : 'Livre'}
              </span>
            </div>

            <div className="flex gap-1 pt-1">
              <button
                type="button"
                onClick={() => handleEdit(table)}
                className="flex-1 rounded-lg bg-surface-soft py-1.5 text-[11px] font-semibold text-ink-secondary hover:bg-brand-50 hover:text-brand-700 transition"
                title="Editar mesa"
              >
                <Edit3 className="mr-1 inline h-3 w-3" />
                Editar
              </button>
              <button
                type="button"
                onClick={() => handleDeactivate(table)}
                disabled={table.status === 'OCUPADA'}
                className="rounded-lg bg-surface-soft px-2 py-1.5 text-ink-muted hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
                title="Desativar mesa"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {activeTables.length === 0 && (
        <div className="py-12 text-center text-sm text-ink-muted">
          Nenhuma mesa ativa cadastrada. Clique em "Nova Mesa" para começar.
        </div>
      )}
    </div>
  );
};