import { AlertCircle, CheckCircle2, Coins, Flame, History, Minus, Plus, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { formatBRL } from '../../lib/formatters';
import { loadLastClosedShiftPrep } from '../../lib/lastShift';
import { useAuthStore } from '../../stores/useAuthStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { PrepItemInput, useStockStore } from '../../stores/useStockStore';
import type { Product } from '../../types/domain';

interface ShiftOpenModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** '' = ainda não preenchido (fica destacado). */
type PrepValue = { quantity: string; cubas: string };

const toNumber = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v) || 0));

export const ShiftOpenModal: React.FC<ShiftOpenModalProps> = ({ isOpen, onClose }) => {
  const { products } = useStockStore();
  const { openShift } = useShiftStore();
  const { currentProfile } = useAuthStore();

  const [shiftName, setShiftName] = useState<string>(`${new Date().toLocaleDateString('pt-BR')} — Noite`);
  const [cashStart, setCashStart] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [prepValues, setPrepValues] = useState<Record<string, PrepValue>>({});
  /** Rendimento por cuba vindo do último turno (senão, do cadastro do produto). */
  const [portionsOverride, setPortionsOverride] = useState<Record<string, number>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [repeatState, setRepeatState] = useState<{ loading: boolean; message: string | null }>({ loading: false, message: null });

  // Campos começam vazios a cada abertura
  useEffect(() => {
    if (!isOpen) return;
    setPrepValues({});
    setPortionsOverride({});
    setCashStart('');
    setErrorMsg(null);
    setRepeatState({ loading: false, message: null });
  }, [isOpen]);

  if (!isOpen) return null;

  const stockProducts = products.filter((p) => p.active && p.tracks_stock);
  const grillProducts = stockProducts.filter((p) => !p.is_cubas && p.sector !== 'BAR');
  const cubaProducts = stockProducts.filter((p) => p.is_cubas);
  const barProducts = stockProducts.filter((p) => !p.is_cubas && p.sector === 'BAR');

  const portionsOf = (p: Product) => portionsOverride[p.id] || p.portions_per_cuba || 1;
  const valueOf = (id: string): PrepValue => prepValues[id] ?? { quantity: '', cubas: '' };
  const isFilled = (p: Product) => (p.is_cubas ? valueOf(p.id).cubas : valueOf(p.id).quantity).trim() !== '';
  const missingCount = stockProducts.filter((p) => !isFilled(p)).length;

  const setField = (productId: string, field: keyof PrepValue, value: string) =>
    setPrepValues((prev) => ({ ...prev, [productId]: { ...valueOf(productId), [field]: value } }));
  const step = (productId: string, field: keyof PrepValue, delta: number) => {
    const current = toNumber(valueOf(productId)[field]) ?? 0;
    setField(productId, field, String(Math.max(0, current + delta)));
  };

  const repeatLastShift = async () => {
    setRepeatState({ loading: true, message: null });
    try {
      const last = await loadLastClosedShiftPrep();
      if (!last) { setRepeatState({ loading: false, message: 'Ainda não há turno fechado para repetir.' }); return; }
      const next: Record<string, PrepValue> = {};
      const portions: Record<string, number> = {};
      last.items.forEach((item) => {
        const prod = stockProducts.find((p) => p.id === item.productId);
        if (!prod) return;
        if (prod.is_cubas) {
          next[prod.id] = { quantity: '', cubas: String(item.cubas) };
          if (item.portions > 0) portions[prod.id] = item.portions;
        } else {
          next[prod.id] = { quantity: String(item.quantity), cubas: '' };
        }
      });
      setPrepValues(next);
      setPortionsOverride(portions);
      setCashStart(String(last.cashStart));
      setRepeatState({ loading: false, message: `Preenchido com "${last.shiftName}". Confira antes de abrir.` });
    } catch (err) {
      setRepeatState({ loading: false, message: err instanceof Error ? err.message : 'Não foi possível buscar o último turno.' });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      const items: PrepItemInput[] = [];
      stockProducts.forEach((prod) => {
        const val = valueOf(prod.id);
        if (prod.is_cubas) {
          const cubas = toNumber(val.cubas) ?? 0;
          if (cubas > 0) items.push({ productId: prod.id, cubasCount: cubas, portionsPerCuba: portionsOf(prod) });
        } else {
          const qty = toNumber(val.quantity) ?? 0;
          if (qty > 0) items.push({ productId: prod.id, quantity: qty });
        }
      });

      if (items.length === 0) {
        setErrorMsg('Informe pelo menos um produto preparado para abrir o turno.');
        return;
      }

      openShift(shiftName, notes, toNumber(cashStart) ?? 0, items, currentProfile.id);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro inesperado ao abrir turno.');
    }
  };

  const fieldClass = (filled: boolean) =>
    `h-11 rounded-md border px-2 text-center font-mono text-base sm:text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand-600 ${filled ? 'bg-surface border-line-strong' : 'bg-amber-50 border-amber-300'}`;
  const stepButton = 'flex h-11 min-w-[44px] items-center justify-center rounded-md border border-line-strong bg-surface px-2 font-mono text-sm font-bold text-ink hover:bg-surface-muted transition';

  const unitRow = (p: Product) => {
    const val = valueOf(p.id).quantity;
    return (
      <div key={p.id} className={`flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between p-3 rounded-2xl border ${isFilled(p) ? 'bg-surface border-line' : 'bg-amber-50/60 border-amber-200'}`}>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink">{p.name}</div>
          <div className="text-[13px] text-ink-muted font-mono">{formatBRL(p.price)}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => step(p.id, 'quantity', -5)} className={stepButton} aria-label={`Tirar 5 de ${p.name}`}>−5</button>
          <input type="number" min="0" inputMode="numeric" value={val} placeholder="—" onChange={(e) => setField(p.id, 'quantity', e.target.value)} className={`w-16 ${fieldClass(isFilled(p))}`} aria-label={`Quantidade de ${p.name}`} />
          <button type="button" onClick={() => step(p.id, 'quantity', 5)} className={stepButton} aria-label={`Somar 5 em ${p.name}`}>+5</button>
        </div>
      </div>
    );
  };

  return (
    <Dialog label="Abrir turno" onClose={onClose}>
      <div className="dialog-panel relative w-full max-w-3xl bg-surface border border-line rounded-2xl shadow-card overflow-hidden my-auto max-h-[90vh] flex flex-col text-ink zoom-in-95 duration-200">

        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Abrir turno</h2>
              <p className="text-sm text-ink-muted">Confira o fundo de troco e os produtos preparados.</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-surface-muted transition" aria-label="Fechar" type="button">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-6 flex-1 text-sm">

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-line bg-surface-soft p-3">
            <p className="text-sm text-ink-secondary">Comece igual ao último turno fechado e ajuste o que mudou.</p>
            <button type="button" onClick={repeatLastShift} disabled={repeatState.loading} className="btn-secondary h-11 px-4 rounded-md text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
              <History className="w-4 h-4" />
              <span>{repeatState.loading ? 'Buscando...' : 'Repetir último turno'}</span>
            </button>
          </div>
          {repeatState.message && <p className="-mt-3 text-sm text-ink-secondary" role="status">{repeatState.message}</p>}

          {errorMsg && (
            <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2.5" role="alert">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-ink mb-1.5" htmlFor="shift-open-name">Nome do turno</label>
              <input id="shift-open-name" type="text" value={shiftName} onChange={(e) => setShiftName(e.target.value)} required
                className="w-full h-11 bg-surface border border-line-strong rounded-md px-3.5 text-base sm:text-sm text-ink focus:outline-none focus:ring-1 focus:ring-brand-600" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink mb-1.5 flex items-center gap-1.5" htmlFor="shift-open-cash">
                <Coins className="w-4 h-4 text-amber-700" />
                <span>Fundo de troco inicial</span>
              </label>
              <input id="shift-open-cash" type="number" step="0.01" min="0" inputMode="decimal" value={cashStart} placeholder="0,00" onChange={(e) => setCashStart(e.target.value)}
                className={`w-full px-3.5 text-left font-bold ${fieldClass(cashStart.trim() !== '')}`} />
            </div>
          </div>

          {grillProducts.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-ink text-sm border-b border-line pb-2">Espetos e porções preparados (unidades)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{grillProducts.map(unitRow)}</div>
            </div>
          )}

          {cubaProducts.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-ink text-sm border-b border-line pb-2">Acompanhamentos (cubas)</h3>
              <div className="space-y-3">
                {cubaProducts.map((p) => {
                  const cubasRaw = valueOf(p.id).cubas;
                  const cubas = toNumber(cubasRaw) ?? 0;
                  const portions = portionsOf(p);
                  return (
                    <div key={p.id} className={`p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${isFilled(p) ? 'bg-surface border-line' : 'bg-amber-50/60 border-amber-200'}`}>
                      <div>
                        <div className="font-semibold text-ink">{p.name}</div>
                        <div className="text-sm text-ink-secondary mt-0.5 font-mono">
                          {cubas} {cubas === 1 ? 'cuba' : 'cubas'} × {portions} = <strong className="text-ink">{cubas * portions} porções</strong>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => step(p.id, 'cubas', -1)} className={stepButton} aria-label={`Tirar 1 cuba de ${p.name}`}><Minus className="w-4 h-4" /></button>
                        <input type="number" min="0" step="0.5" inputMode="decimal" value={cubasRaw} placeholder="—" onChange={(e) => setField(p.id, 'cubas', e.target.value)} className={`w-20 ${fieldClass(isFilled(p))}`} aria-label={`Cubas de ${p.name}`} />
                        <button type="button" onClick={() => step(p.id, 'cubas', 1)} className={stepButton} aria-label={`Somar 1 cuba em ${p.name}`}><Plus className="w-4 h-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {barProducts.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-bold text-ink text-sm border-b border-line pb-2">Bebidas disponíveis (unidades)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{barProducts.map(unitRow)}</div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-ink mb-1.5" htmlFor="shift-open-notes">Observações da noite (opcional)</label>
            <textarea id="shift-open-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Ex.: sexta com música ao vivo, previsão de 150 clientes..."
              className="w-full bg-surface border border-line-strong rounded-md px-3.5 py-2 text-base sm:text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-600" />
          </div>

          <div className="pt-2 space-y-2">
            {missingCount > 0 && (
              <p className="text-sm font-semibold text-amber-800" role="status">
                {missingCount === 1 ? '1 produto sem quantidade' : `${missingCount} produtos sem quantidade`} (ficam fora do turno).
              </p>
            )}
            <button type="submit" className="btn-primary w-full h-12 rounded-md text-[15px] font-semibold flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              <span>Confirmar e abrir turno</span>
            </button>
          </div>

        </form>
      </div>
    </Dialog>
  );
};
