import React, { useState } from 'react';
import { ArrowLeftRight, Check, Search, X } from 'lucide-react';
import { Dialog } from '../../components/ui/Dialog';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { triggerHaptic } from '../../lib/haptics';
import { useAuthStore } from '../../stores/useAuthStore';
import { useTableStore } from '../../stores/useTableStore';
import type { RestaurantTable, Tab } from '../../types/domain';
import { formatBRL } from '../../lib/formatters';

const pad2 = (n: number) => String(n).padStart(2, '0');

interface TableTransferModalProps {
  sourceTable: RestaurantTable;
  currentTab: Tab;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newTable: RestaurantTable) => void;
}

export const TableTransferModal: React.FC<TableTransferModalProps> = ({
  sourceTable,
  currentTab,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { tables, transferTableAtomic } = useTableStore();
  const { currentProfile } = useAuthStore();
  const { notify } = useFeedback();

  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const freeTables = tables
    .filter((t) => (t.status === 'LIVRE' || !t.status) && t.id !== sourceTable.id && t.active !== false)
    .sort((a, b) => a.number - b.number);

  const filtered = search.trim()
    ? freeTables.filter((t) => String(t.number).includes(search.trim()))
    : freeTables;

  const targetTable = tables.find((t) => t.id === selectedTargetId);

  const handleConfirm = () => {
    if (!targetTable) {
      notify('Selecione uma mesa livre para transferir.', 'error');
      return;
    }
    setIsSubmitting(true);
    triggerHaptic(40);

    try {
      transferTableAtomic(currentTab.id, targetTable.id, currentProfile.id);
      triggerHaptic(70);
      notify(
        `Atendimento transferido da Mesa ${pad2(sourceTable.number)} para a Mesa ${pad2(targetTable.number)}!`,
        'success'
      );
      onSuccess(targetTable);
      onClose();
    } catch (err: unknown) {
      triggerHaptic(80);
      notify(
        err instanceof Error ? err.message : 'Não foi possível transferir a mesa.',
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog label="Trocar mesa" onClose={onClose} placement="sheet">
      <div className="dialog-panel flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl sm:rounded-2xl border border-line bg-surface p-4 sm:p-6 shadow-card space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 border border-brand-200">
              <ArrowLeftRight className="h-6 w-6" />
            </span>
            <div>
              <h3 className="text-xl font-bold text-ink">Trocar de Mesa</h3>
              <p className="text-sm text-ink-muted">
                Transferir comanda da <strong className="text-ink">Mesa {pad2(sourceTable.number)}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-ink-muted hover:bg-surface-soft hover:text-ink"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Resumo da comanda atual */}
        <div className="rounded-xl border border-line bg-surface-soft p-3 text-base flex items-center justify-between">
          <div>
            <span className="font-semibold text-ink block">{currentTab.customer_name || 'Comanda aberta'}</span>
            <span className="text-sm text-ink-muted">{currentTab.people_count} {currentTab.people_count === 1 ? 'pessoa' : 'pessoas'}</span>
          </div>
          <div className="text-right">
            <span className="text-sm text-ink-muted block">Consumo atual</span>
            <span className="font-mono text-base font-bold text-brand-700">{formatBRL(currentTab.total)}</span>
          </div>
        </div>

        {/* Campo de busca rápida */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            inputMode="numeric"
            placeholder="Buscar número da mesa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-4 text-base text-ink placeholder:text-ink-muted focus:border-brand-600 focus:outline-none"
          />
        </div>

        {/* Grade de mesas livres */}
        <div className="flex-1 overflow-y-auto space-y-2">
          <p className="text-sm font-semibold text-ink-muted uppercase tracking-wide">
            Mesas livres ({freeTables.length}):
          </p>
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-base text-ink-muted">
              {search.trim() ? `Nenhuma mesa livre encontrada com o número "${search}".` : 'Não há outras mesas livres no momento.'}
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-60 overflow-y-auto p-1">
              {filtered.map((t) => {
                const isSelected = selectedTargetId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic(20);
                      setSelectedTargetId(t.id);
                    }}
                    className={`flex h-14 flex-col items-center justify-center rounded-xl border-2 font-mono transition active:scale-95 ${
                      isSelected
                        ? 'border-brand-600 bg-brand-50 text-brand-900 shadow-sm'
                        : 'border-emerald-600/40 bg-white text-ink hover:border-emerald-600'
                    }`}
                  >
                    <span className="text-lg font-bold">{pad2(t.number)}</span>
                    <span className="text-sm font-sans text-ink-muted">
                      {isSelected ? '✓ Selecionada' : 'Livre'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Ação de confirmação */}
        <div className="border-t border-line pt-3 space-y-2">
          {targetTable && (
            <div className="flex items-center justify-center gap-2 text-base font-semibold text-ink py-1">
              <span>Mesa {pad2(sourceTable.number)}</span>
              <ArrowLeftRight className="h-4 w-4 text-brand-600" />
              <span className="text-brand-700 font-bold">Mesa {pad2(targetTable.number)}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-secondary h-12 text-[15px]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!targetTable || isSubmitting}
              className="btn-primary h-12 text-[15px] flex items-center justify-center gap-2"
            >
              <Check className="h-4 w-4" />
              <span>{isSubmitting ? 'Transferindo...' : 'Confirmar troca'}</span>
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
