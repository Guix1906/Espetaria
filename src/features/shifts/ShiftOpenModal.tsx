import {
  AlertCircle,
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  Flame,
  History,
  RotateCcw,
  Sparkles,
  X,
  Pencil,
  Trash2,
  Plus,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { formatBRL } from '../../lib/formatters';
import { isComboProduct } from '../../lib/comboStock';
import { loadLastClosedShiftPrep } from '../../lib/lastShift';
import { useAuthStore } from '../../stores/useAuthStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useShiftStore } from '../../stores/useShiftStore';
import { PrepItemInput, useStockStore } from '../../stores/useStockStore';
import type { Product } from '../../types/domain';

interface ShiftOpenModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type PrepValue = { quantity: string; cubas: string };

const toNumber = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v.replace(',', '.')) || 0));
const isRice = (p: Product) => /^arroz(\b|$)/i.test(p.name.trim());

const DEFAULT_RICE_OPTIONS = [
  'Arroz Branco',
  'Baião de Dois',
  'Arroz Carreteiro',
  'Arroz de Alho',
  'Arroz com Brócolis',
  'Arroz à Grega',
  'Arroz de Cenoura',
  'Arroz de Cuxá',
  'Arroz de Fava',
];

const DEFAULT_NON_SKEWER = '8';
const DEFAULT_RICE_PORTIONS = '130';

export const ShiftOpenModal: React.FC<ShiftOpenModalProps> = ({ isOpen, onClose }) => {
  const { products, categories } = useStockStore();
  const { openShift } = useShiftStore();
  const { currentProfile } = useAuthStore();
  const { settings, updateSettings } = useSettingsStore();

  const [shiftName, setShiftName] = useState<string>(`${new Date().toLocaleDateString('pt-BR')} — Noite`);
  const [cashStart, setCashStart] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [prepValues, setPrepValues] = useState<Record<string, PrepValue>>({});
  const [disabledProducts, setDisabledProducts] = useState<Record<string, boolean>>({});
  const [portionsOverride, setPortionsOverride] = useState<Record<string, number>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [repeatState, setRepeatState] = useState<{ loading: boolean; message: string | null; success?: boolean }>({
    loading: false,
    message: null,
  });

  const [selectedRiceFlavors, setSelectedRiceFlavors] = useState<string[]>(() => settings.daily_rice_flavors ?? []);
  const [newRice, setNewRice] = useState('');
  const [editingRice, setEditingRice] = useState<{ original: string; value: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'skewers' | 'sides'>('skewers');
  const [showCombosPreview, setShowCombosPreview] = useState(false);

  // Arrozes cadastrados (banco). Novos sabores entram pelo gerente em Estoque.
  const allSavedRices = React.useMemo(() => {
    const base = settings.saved_rice_flavors && settings.saved_rice_flavors.length > 0
      ? settings.saved_rice_flavors
      : DEFAULT_RICE_OPTIONS;
    const seen = new Set<string>();
    return [...base, ...(settings.daily_rice_flavors || [])]
      .map((r) => r.trim())
      .filter((r) => {
        const k = r.toLowerCase();
        if (!r || k === 'arroz' || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }, [settings.saved_rice_flavors, settings.daily_rice_flavors]);

  useEffect(() => {
    if (!isOpen) return;
    setPrepValues({});
    setDisabledProducts({});
    setPortionsOverride({});
    setCashStart('');
    setErrorMsg(null);
    setRepeatState({ loading: false, message: null });
    setSelectedRiceFlavors(settings.daily_rice_flavors ?? []);
    setNewRice('');
    setEditingRice(null);
    // Só ao abrir: editar/excluir um arroz não pode desfazer o que já foi marcado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const activeTracked = products.filter((p) => p.active && p.tracks_stock);
  const combos = activeTracked.filter(isComboProduct);
  const isStarter = (p: Product) => /entrada/i.test(categories.find((c) => c.id === p.category_id)?.name ?? '');
  const rice = activeTracked.find(isRice);
  const skewers = activeTracked.filter((p) => !isComboProduct(p) && p.sector === 'GRILL' && p !== rice && !isStarter(p));
  const starters = activeTracked.filter((p) => !isComboProduct(p) && p !== rice && isStarter(p));
  const otherSides = activeTracked.filter(
    (p) => !isComboProduct(p) && p !== rice && !skewers.some((s) => s.id === p.id) && !starters.some((s) => s.id === p.id)
  );
  const stockProducts = [...skewers, ...(rice ? [rice] : []), ...starters, ...otherSides];

  const usesCubas = (p: Product) => p.is_cubas && p !== rice;
  const portionsOf = (p: Product) => portionsOverride[p.id] || p.portions_per_cuba || 1;

  const valueOf = (id: string): PrepValue => {
    if (prepValues[id]) return prepValues[id];
    const p = stockProducts.find((s) => s.id === id);
    if (!p || skewers.some((s) => s.id === id)) return { quantity: '', cubas: '' };
    if (isRice(p)) return { quantity: DEFAULT_RICE_PORTIONS, cubas: '' };
    return usesCubas(p) ? { quantity: '', cubas: DEFAULT_NON_SKEWER } : { quantity: DEFAULT_NON_SKEWER, cubas: '' };
  };

  const qtyOf = (p: Product) => {
    if (disabledProducts[p.id]) return 0;
    return usesCubas(p)
      ? Math.round((toNumber(valueOf(p.id).cubas) ?? 0) * portionsOf(p))
      : toNumber(valueOf(p.id).quantity) ?? 0;
  };
  const riceQty = rice ? qtyOf(rice) : 0;

  const baseOf = (combo: Product) => {
    const name = combo.name.replace(/\s+com acompanhamento\s*$/i, '').trim().toLocaleLowerCase('pt-BR');
    return stockProducts.find((p) => p.name.trim().toLocaleLowerCase('pt-BR') === name);
  };

  const setField = (productId: string, field: keyof PrepValue, value: string) =>
    setPrepValues((prev) => ({ ...prev, [productId]: { ...valueOf(productId), [field]: value } }));

  const step = (productId: string, field: keyof PrepValue, delta: number) => {
    const current = toNumber(valueOf(productId)[field]) ?? 0;
    setField(productId, field, String(Math.max(0, current + delta)));
  };

  const toggleDisable = (productId: string) => {
    setDisabledProducts((prev) => {
      const nextState = !prev[productId];
      if (nextState) {
        setPrepValues((p) => ({ ...p, [productId]: { quantity: '', cubas: '' } }));
      }
      return { ...prev, [productId]: nextState };
    });
  };

  // Repete tudo do último turno fechado
  const repeatLastShift = async () => {
    setRepeatState({ loading: true, message: null, success: false });
    try {
      const last = await loadLastClosedShiftPrep();
      if (!last) {
        setRepeatState({ loading: false, message: 'Nenhum turno anterior encontrado para repetir.', success: false });
        return;
      }
      const next: Record<string, PrepValue> = {};
      const portions: Record<string, number> = {};
      const nextDisabled: Record<string, boolean> = {};

      last.items.forEach((item) => {
        const prod = stockProducts.find((p) => p.id === item.productId);
        if (!prod) return;
        if (item.quantity === 0 && item.cubas === 0) {
          nextDisabled[prod.id] = true;
          return;
        }
        if (usesCubas(prod)) {
          next[prod.id] = { quantity: '', cubas: String(item.cubas) };
          if (item.portions > 0) portions[prod.id] = item.portions;
        } else {
          next[prod.id] = { quantity: String(item.quantity), cubas: '' };
        }
      });
      setPrepValues(next);
      setDisabledProducts(nextDisabled);
      setPortionsOverride(portions);
      if (last.cashStart) setCashStart(String(last.cashStart));
      setRepeatState({
        loading: false,
        message: `Quantidades e troco copiados do turno anterior com sucesso!`,
        success: true,
      });
    } catch (err) {
      setRepeatState({
        loading: false,
        message: err instanceof Error ? err.message : 'Erro ao buscar o último turno.',
        success: false,
      });
    }
  };

  // Atalho para preencher espetos com quantidade padrão (ex: 20 un cada)
  const fillDefaultSkewers = (amount = 20) => {
    const next: Record<string, PrepValue> = { ...prepValues };
    skewers.forEach((s) => {
      if (!disabledProducts[s.id]) {
        next[s.id] = { quantity: String(amount), cubas: '' };
      }
    });
    setPrepValues(next);
  };

  const toggleRiceFlavor = (flavor: string) => {
    setErrorMsg(null);
    setSelectedRiceFlavors((prev) => (prev.includes(flavor) ? prev.filter((f) => f !== flavor) : [...prev, flavor]));
  };

  const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  const addRice = () => {
    const name = newRice.trim();
    if (!name) return;
    const existing = allSavedRices.find((r) => sameName(r, name));
    const flavor = existing ?? name;
    if (!existing) updateSettings({ saved_rice_flavors: [...allSavedRices, flavor] });
    setSelectedRiceFlavors((prev) => (prev.includes(flavor) ? prev : [...prev, flavor]));
    setNewRice('');
    setErrorMsg(null);
  };

  const saveRename = () => {
    if (!editingRice) return;
    const name = editingRice.value.trim();
    const old = editingRice.original;
    if (!name || name === old) return setEditingRice(null);
    if (allSavedRices.some((r) => r !== old && sameName(r, name))) {
      setErrorMsg(`Já existe um arroz chamado "${name}".`);
      return;
    }
    const swap = (list: string[]) => list.map((r) => (r === old ? name : r));
    const daily = settings.daily_rice_flavors ?? [];
    updateSettings({
      saved_rice_flavors: swap(allSavedRices),
      ...(daily.includes(old) ? { daily_rice_flavors: swap(daily) } : {}),
    });
    setSelectedRiceFlavors(swap);
    setEditingRice(null);
  };

  const deleteRice = (flavor: string) => {
    if (!window.confirm(`Excluir "${flavor}" da lista de arrozes?`)) return;
    const daily = settings.daily_rice_flavors ?? [];
    updateSettings({
      saved_rice_flavors: allSavedRices.filter((r) => r !== flavor),
      ...(daily.includes(flavor) ? { daily_rice_flavors: daily.filter((r) => r !== flavor) } : {}),
    });
    setSelectedRiceFlavors((prev) => prev.filter((r) => r !== flavor));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      const items: PrepItemInput[] = [];
      const disabledIds: string[] = [];

      stockProducts.forEach((prod) => {
        if (disabledProducts[prod.id]) {
          disabledIds.push(prod.id);
          return;
        }

        const val = valueOf(prod.id);
        if (usesCubas(prod)) {
          const cubas = toNumber(val.cubas) ?? 0;
          if (cubas > 0) items.push({ productId: prod.id, cubasCount: cubas, portionsPerCuba: portionsOf(prod) });
          else disabledIds.push(prod.id);
        } else {
          const qty = toNumber(val.quantity) ?? 0;
          if (qty > 0) items.push({ productId: prod.id, quantity: qty });
          // Em branco (ou zero) = não tem hoje: fica esgotado, igual a marcar o botão de indisponível.
          else disabledIds.push(prod.id);
        }
      });

      // "X com acompanhamento" sem o espeto X contado (ou sem arroz) também fica esgotado.
      const riceOff = !rice || disabledIds.includes(rice.id);
      combos.forEach((combo) => {
        const base = baseOf(combo);
        if (riceOff || !base || disabledIds.includes(base.id)) disabledIds.push(combo.id);
      });

      if (items.length === 0) {
        setErrorMsg('Informe a quantidade de pelo menos um produto para abrir o turno.');
        return;
      }

      if (selectedRiceFlavors.length === 0) {
        setErrorMsg('Escolha os arrozes de hoje: toque nos botões em "Quais arrozes tem hoje?" (lá em cima).');
        document.getElementById('shift-open-rice')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      {
        updateSettings({
          daily_rice_flavors: selectedRiceFlavors,
          saved_rice_flavors: allSavedRices,
        });
      }

      openShift(shiftName, notes, toNumber(cashStart) ?? 0, items, currentProfile.id, disabledIds);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro inesperado ao abrir turno.');
    }
  };

  const unitRow = (p: Product) => {
    const isDisabled = Boolean(disabledProducts[p.id]);
    const isCuba = usesCubas(p);
    const field = isCuba ? 'cubas' : 'quantity';
    const stepDelta = isCuba ? 1 : 5;
    const val = isCuba ? valueOf(p.id).cubas : valueOf(p.id).quantity;

    return (
      <div
        key={p.id}
        className={`flex flex-col gap-2 p-2.5 sm:p-3 rounded-xl border transition ${
          isDisabled
            ? 'bg-rose-50/40 border-rose-200 opacity-60'
            : val.trim() !== '' && val !== '0'
            ? 'bg-white border-line shadow-2xs'
            : 'bg-surface-soft border-line'
        }`}
      >
        <div className="min-w-0 flex items-baseline justify-between gap-2">
          <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
            <span className={`font-semibold text-xs sm:text-sm leading-tight break-words min-w-0 ${isDisabled ? 'line-through text-ink-muted' : 'text-ink'}`}>
              {p.name}
            </span>
            {isRice(p) && selectedRiceFlavors.length > 0 && (
              <span className="text-xs font-bold text-brand-700 bg-brand-50 px-1.5 py-0.2 rounded border border-brand-200">
                {selectedRiceFlavors.join(' & ')}
              </span>
            )}
          </div>
          <div className="text-xs text-ink-muted font-mono shrink-0">
            {formatBRL(p.price)}
          </div>
        </div>

        {isDisabled ? (
          <button
            type="button"
            onClick={() => toggleDisable(p.id)}
            className="self-end text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 px-2.5 py-1 rounded-lg flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Habilitar</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => step(p.id, field, -stepDelta)}
              className="w-8 h-8 rounded-lg border border-line bg-surface hover:bg-surface-muted text-ink font-bold flex items-center justify-center text-xs"
            >
              −{stepDelta}
            </button>

            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={val}
              placeholder="0"
              onChange={(e) => setField(p.id, field, e.target.value)}
              className="w-14 h-8 text-center rounded-lg border border-line-strong font-mono font-bold text-sm bg-white text-ink focus:ring-1 focus:ring-brand-600 focus:outline-none"
            />

            <button
              type="button"
              onClick={() => step(p.id, field, stepDelta)}
              className="w-8 h-8 rounded-lg border border-line bg-surface hover:bg-surface-muted text-ink font-bold flex items-center justify-center text-xs"
            >
              +{stepDelta}
            </button>

            <button
              type="button"
              onClick={() => toggleDisable(p.id)}
              title="Marcar como indisponível hoje"
              className="w-8 h-8 rounded-lg border border-line text-ink-muted hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center ml-0.5"
            >
              <Ban className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Dialog label="Abrir turno" onClose={onClose}>
      <div className="dialog-panel relative w-full max-w-6xl bg-surface border border-line rounded-2xl shadow-card overflow-hidden my-auto max-h-[95vh] flex flex-col text-ink zoom-in-95 duration-200">

        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-ink">Abrir turno</h2>
              <p className="text-xs text-ink-muted">Inicie o caixa e prepare o cardápio da noite.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition"
            aria-label="Fechar"
            type="button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-sm custom-scrollbar">

          {/* Destaque: Botão de 1 Clique para Repetir último turno */}
          <div className="p-3.5 rounded-2xl border-2 border-brand-200 bg-brand-50/40 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
            <div className="text-left w-full sm:w-auto">
              <span className="text-xs font-bold text-brand-800 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-brand-700" />
                <span>Abertura Rápida em 1 Clique</span>
              </span>
              <p className="text-xs text-ink-secondary mt-0.5">
                Preenche o troco e as quantidades do último turno automaticamente.
              </p>
            </div>
            <button
              type="button"
              onClick={repeatLastShift}
              disabled={repeatState.loading}
              className="btn-primary w-full sm:w-auto h-10 px-4 text-xs font-bold flex items-center justify-center gap-2 rounded-xl shrink-0 shadow-xs"
            >
              <History className="w-3.5 h-3.5" />
              <span>{repeatState.loading ? 'Copiando...' : 'Repetir último turno'}</span>
            </button>
          </div>

          {repeatState.message && (
            <div className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              repeatState.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{repeatState.message}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2 text-xs font-semibold" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Fundo de Troco e Nome do Turno */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl border border-line bg-surface space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-ink" htmlFor="shift-open-cash">
                <Coins className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Fundo de troco inicial</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted font-mono">
                  R$
                </span>
                <input
                  id="shift-open-cash"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={cashStart}
                  placeholder="0,00"
                  onChange={(e) => setCashStart(e.target.value)}
                  className="w-full h-10 bg-white border border-line-strong rounded-lg pl-8 pr-3 text-sm font-bold text-ink font-mono focus:ring-2 focus:ring-brand-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl border border-line bg-surface space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-ink" htmlFor="shift-open-name">
                <Calendar className="w-4 h-4 text-ink-muted shrink-0" />
                <span>Identificação do turno</span>
              </label>
              <input
                id="shift-open-name"
                type="text"
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                required
                className="w-full h-10 bg-white border border-line-strong rounded-lg px-3 text-xs sm:text-sm font-semibold text-ink focus:ring-2 focus:ring-brand-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Observações da noite (opcional) */}
          <div className="space-y-1">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações do turno (opcional, ex.: previsão de chuva ou música ao vivo)..."
              className="w-full h-9 bg-surface border border-line rounded-lg px-3 text-xs text-ink placeholder-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-600"
            />
          </div>

          {/* Arroz do Dia (Seleção Rápida de 1 Toque - Salvo Permanentemente) */}
          <div
            id="shift-open-rice"
            className={`p-4 rounded-xl border-2 space-y-3 ${
              selectedRiceFlavors.length === 0 ? 'border-amber-400 bg-amber-50' : 'border-brand-600 bg-surface'
            }`}
          >
            <div>
              <p className="text-base font-bold text-ink">Quais arrozes tem hoje?</p>
              <p className="text-sm text-ink-secondary">
                Toque em cada arroz que foi feito hoje. Pode marcar mais de um. Os garçons só vão ver os marcados.
              </p>
            </div>

            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-3 gap-2">
              {allSavedRices.map((option) => {
                const isSelected = selectedRiceFlavors.includes(option);
                if (editingRice?.original === option) {
                  return (
                    <div key={option} className="min-h-12 p-1.5 rounded-lg border-2 border-brand-600 bg-white flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        aria-label="Novo nome do arroz"
                        value={editingRice.value}
                        onChange={(e) => setEditingRice({ original: option, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); saveRename(); }
                          if (e.key === 'Escape') setEditingRice(null);
                        }}
                        className="flex-1 min-w-0 h-9 px-2 text-sm rounded border border-line-strong text-ink focus:outline-none focus:ring-2 focus:ring-brand-600"
                      />
                      <button type="button" onClick={saveRename} title="Salvar nome" aria-label="Salvar nome"
                        className="w-9 h-9 rounded bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <Check className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => setEditingRice(null)} title="Cancelar" aria-label="Cancelar"
                        className="w-9 h-9 rounded text-ink-muted hover:bg-surface flex items-center justify-center shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                }
                return (
                  <div
                    key={option}
                    className={`min-h-12 rounded-lg border-2 flex items-center transition ${
                      isSelected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-line-strong bg-white text-ink hover:border-brand-400'
                    }`}
                  >
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => toggleRiceFlavor(option)}
                      className="flex-1 min-w-0 self-stretch px-3 text-sm font-bold flex items-center gap-2 text-left"
                    >
                      <span
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                          isSelected ? 'border-white bg-white text-emerald-700' : 'border-line-strong'
                        }`}
                      >
                        {isSelected && <Check className="w-4 h-4" />}
                      </span>
                      <span className="break-words">{option}</span>
                    </button>
                    <button type="button" onClick={() => setEditingRice({ original: option, value: option })}
                      title={`Editar ${option}`} aria-label={`Editar ${option}`}
                      className={`w-9 h-9 rounded flex items-center justify-center shrink-0 ${isSelected ? 'hover:bg-emerald-700' : 'text-ink-muted hover:bg-surface hover:text-ink'}`}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => deleteRice(option)}
                      title={`Excluir ${option}`} aria-label={`Excluir ${option}`}
                      className={`w-9 h-9 mr-1 rounded flex items-center justify-center shrink-0 ${isSelected ? 'hover:bg-emerald-700' : 'text-ink-muted hover:bg-surface hover:text-rose-600'}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newRice}
                aria-label="Nome de um arroz que não está na lista"
                onChange={(e) => setNewRice(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRice(); } }}
                placeholder="Não está na lista? Escreva o nome do arroz"
                className="flex-1 min-w-0 h-12 px-3 text-sm rounded-lg border-2 border-line-strong bg-white text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              <button
                type="button"
                onClick={addRice}
                disabled={!newRice.trim()}
                className="btn-primary h-12 px-4 rounded-lg text-sm font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </button>
            </div>

            <p className={`text-sm font-bold ${selectedRiceFlavors.length === 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
              {selectedRiceFlavors.length === 0
                ? 'Nenhum arroz marcado ainda.'
                : `Hoje tem: ${selectedRiceFlavors.join(', ')}`}
            </p>
          </div>

          {/* Seção de Contagem dos Produtos */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('skewers')}
                  className={`text-xs sm:text-sm font-bold pb-1 transition border-b-2 ${
                    activeTab === 'skewers'
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-ink-muted hover:text-ink'
                  }`}
                >
                  Espetos ({skewers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('sides')}
                  className={`text-xs sm:text-sm font-bold pb-1 transition border-b-2 ${
                    activeTab === 'sides'
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-ink-muted hover:text-ink'
                  }`}
                >
                  Acompanhamentos ({starters.length + otherSides.length + (rice ? 1 : 0)})
                </button>
              </div>

              {activeTab === 'skewers' && (
                <button
                  type="button"
                  onClick={() => fillDefaultSkewers(20)}
                  className="text-xs font-semibold text-brand-700 hover:text-brand-900"
                >
                  Preencher todos com 20 un.
                </button>
              )}
            </div>

            {activeTab === 'skewers' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {skewers.map(unitRow)}
              </div>
            )}

            {activeTab === 'sides' && (
              <div className="space-y-2">
                {rice && (
                  <div className="p-2 rounded-xl bg-surface-soft border border-line">
                    <span className="text-xs font-bold text-ink-secondary block mb-1">Porções de arroz</span>
                    {unitRow(rice)}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {[...starters, ...otherSides].map(unitRow)}
                </div>
              </div>
            )}
          </div>

          {/* Prévia de Combos Opcional */}
          {combos.length > 0 && (
            <div className="rounded-xl border border-line bg-surface overflow-hidden">
              <button
                type="button"
                onClick={() => setShowCombosPreview(!showCombosPreview)}
                className="w-full p-2.5 flex items-center justify-between text-xs font-semibold text-ink-muted hover:bg-surface-muted transition"
              >
                <span>Ver disponibilidade calculada dos espetos com acompanhamento</span>
                {showCombosPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showCombosPreview && (
                <div className="p-3 border-t border-line grid grid-cols-2 lg:grid-cols-3 gap-2 text-xs bg-surface-soft">
                  {combos.map((combo) => {
                    const base = baseOf(combo);
                    const baseQty = base && !disabledProducts[base.id] ? qtyOf(base) : 0;
                    const avail = Math.min(baseQty, riceQty);
                    return (
                      <div key={combo.id} className="flex justify-between items-center gap-1 py-1">
                        <span className="min-w-0 break-words leading-tight pr-1 text-ink-secondary">{combo.name}</span>
                        <span className="font-mono font-bold text-brand-700 shrink-0">{avail} disp.</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </form>

        {/* Rodapé com Ação Principal */}
        <div className="p-4 border-t border-line bg-surface flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary h-11 px-4 text-xs sm:text-sm font-semibold rounded-xl"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            className="btn-primary h-11 px-6 text-xs sm:text-sm font-bold flex items-center gap-2 rounded-xl shadow-xs"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Confirmar e abrir turno</span>
          </button>
        </div>

      </div>
    </Dialog>
  );
};
