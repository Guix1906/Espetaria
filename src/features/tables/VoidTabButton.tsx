import { Trash2 } from 'lucide-react';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { askReturnToStock } from '../../lib/askReturnToStock';
import { formatBRL } from '../../lib/formatters';
import { useAuthStore } from '../../stores/useAuthStore';
import { useStockStore } from '../../stores/useStockStore';
import { useTableStore } from '../../stores/useTableStore';
import type { Tab } from '../../types/domain';

/**
 * Exclui (anula) a comanda inteira: para lançamentos de teste ou feitos por engano.
 * Só aparece para proprietário e gerente.
 */
export function VoidTabButton({ tab, tableNumber, compact = false, onDone }: { tab: Tab; tableNumber: number; compact?: boolean; onDone?: () => void }) {
  const { currentProfile } = useAuthStore();
  const { voidTabAtomic, getTabOrderItems } = useTableStore();
  const { notify, requestText, requestChoice } = useFeedback();
  if (!['MASTER', 'GERENTE'].includes(currentProfile.role)) return null;

  const run = async () => {
    const reason = await requestText({
      title: `Excluir comanda da mesa ${String(tableNumber).padStart(2, '0')}`,
      message: `Todos os itens serão cancelados (${formatBRL(tab.total)}), a produção recebe o aviso, o estoque do que não foi preparado volta, pagamentos lançados são estornados e a mesa fica livre.\n\nA exclusão fica registrada na auditoria.`,
      label: 'Motivo',
      initialValue: 'Lançamento de teste',
      confirmText: 'Excluir comanda',
      danger: true,
    });
    if (!reason) return;
    // Espetos na brasa: pergunta se voltam ao estoque
    let returnStock: boolean | undefined;
    const products = useStockStore.getState().products;
    const onGrill = getTabOrderItems(tab.id).filter((i) => i.status === 'IN_PREPARATION' && products.find((p) => p.id === i.product_id)?.tracks_stock);
    if (onGrill.length > 0) {
      const count = onGrill.reduce((sum, i) => sum + i.quantity, 0);
      const answer = await askReturnToStock(requestChoice, count === 1 ? '1 item' : `${count} itens`);
      if (answer === null) return;
      returnStock = answer;
    }
    try {
      voidTabAtomic(tab.id, reason, currentProfile.id, returnStock);
      notify(`Comanda da mesa ${String(tableNumber).padStart(2, '0')} excluída.`, 'success');
      onDone?.();
    } catch (error: unknown) {
      notify(error instanceof Error ? error.message : 'Não foi possível excluir a comanda.', 'error');
    }
  };

  return compact
    ? <button type="button" className="icon-button text-rose-700 hover:bg-rose-50 hover:text-rose-800" onClick={() => void run()} aria-label={`Excluir comanda da mesa ${tableNumber}`} title="Excluir comanda"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
    : <button type="button" className="btn-secondary text-rose-700 hover:border-rose-600 hover:bg-rose-50 hover:text-rose-800" onClick={() => void run()}><Trash2 className="h-4 w-4" aria-hidden="true" />Excluir comanda</button>;
}
