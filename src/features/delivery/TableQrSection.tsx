import { Printer, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { Dialog } from '../../components/ui/Dialog';
import { useFeedback } from '../../components/ui/FeedbackProvider';
import { publicAppUrl } from '../../lib/publicUrl';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { PixQrCode } from '../pix/PixQrCode';

interface TableQr { id: string; number: number; qr_token: string }

/** QR Code de cada mesa: o cliente pede do celular e o pedido entra na comanda. */
export function TableQrSection() {
  const confirm = useConfirm();
  const { notify } = useFeedback();
  const [tables, setTables] = useState<TableQr[] | null>(null);
  const [printing, setPrinting] = useState<TableQr[] | null>(null);
  const urlOf = (t: TableQr) => `${publicAppUrl()}/#/mesa/${t.qr_token}`;

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) { setTables([]); return; }
    const { data, error } = await supabase.from('restaurant_tables').select('id, number, qr_token').eq('active', true).order('number');
    // Coluna ainda não existe (migração 00055 pendente)
    setTables(error ? [] : (data as TableQr[]));
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!printing) return;
    const id = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(id);
  }, [printing]);

  const rotate = async (t: TableQr) => {
    const ok = await confirm({ title: `Trocar QR da mesa ${t.number}`, message: 'O QR Code impresso desta mesa para de funcionar. Depois, imprima o novo.', confirmText: 'Trocar', variant: 'danger' });
    if (!ok) return;
    const { error } = await supabase.rpc('rotate_table_qr_token', { p_table_id: t.id });
    if (error) { notify(error.message, 'error'); return; }
    await load();
    notify('QR Code trocado. Imprima o novo.', 'success');
  };

  return (
    <section className="surface-card space-y-4 p-4 sm:p-5" aria-labelledby="table-qr-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="table-qr-title" className="text-lg font-semibold text-ink">QR Code das mesas</h2>
          <p className="text-sm text-ink-muted">O cliente aponta a câmera, escolhe os itens e o pedido entra direto na comanda da mesa e na produção.</p>
        </div>
        {!!tables?.length && <button type="button" className="btn-secondary min-h-[44px]" onClick={() => setPrinting(tables)}><Printer className="h-4 w-4" aria-hidden="true" />Imprimir todos</button>}
      </div>
      {tables === null && <p className="text-sm text-ink-muted">Carregando...</p>}
      {tables?.length === 0 && <p className="text-sm text-ink-muted">Nenhum QR Code disponível. A atualização do banco (00055) precisa ser aplicada, e a demonstração não gera QR Codes.</p>}
      {!!tables?.length && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {tables.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-md border border-line p-2">
              <span className="flex-1 font-mono font-semibold text-ink">Mesa {String(t.number).padStart(2, '0')}</span>
              <button type="button" className="btn-secondary min-h-[44px] px-3" onClick={() => setPrinting([t])}><Printer className="h-4 w-4" aria-hidden="true" />Imprimir</button>
              <button type="button" className="icon-button h-11 w-11" aria-label={`Trocar QR da mesa ${t.number}`} title="Trocar QR Code" onClick={() => void rotate(t)}><RefreshCw className="h-4 w-4" aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
      {printing && (
        <Dialog label="Imprimir QR Code das mesas" onClose={() => setPrinting(null)}>
          <div className="dialog-panel max-h-[85dvh] overflow-y-auto p-4">
            <div className="print-section space-y-8 text-center">
              {printing.map((t) => (
                <div key={t.id} className="break-after-page space-y-2">
                  <p className="text-2xl font-bold">Mesa {String(t.number).padStart(2, '0')}</p>
                  <p className="text-sm">Aponte a câmera e faça seu pedido</p>
                  <div className="mx-auto flex w-fit bg-white p-2"><PixQrCode payload={urlOf(t)} size={220} /></div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn-primary min-h-[44px] flex-1 justify-center" onClick={() => window.print()}>Imprimir</button>
              <button type="button" className="btn-secondary min-h-[44px] flex-1 justify-center" onClick={() => setPrinting(null)}>Fechar</button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
