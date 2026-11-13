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

  const [selectedRiceFlavors, setSelectedRiceFlavors] = useState<string[]>(() => {
    return settings.daily_rice_flavors && settings.daily_rice_flavors.length > 0
      ? settings.daily_rice_flavors
      : ['Arroz Branco'];
  });
  const [customRiceInput, setCustomRiceInput] = useState('');
  const [isAddingCustomRice, setIsAddingCustomRice] = useState(false);
  const [activeTab, setActiveTab] = useState<'skewers' | 'sides'>('skewers');
  const [showCombosPreview, setShowCombosPreview] = useState(false);

  // Catálogo completo salvo de sabores de arroz (persistente entre turnos)
  const [localSavedRices, setLocalSavedRices] = useState<string[]>(() => {
    try {
      const fromLocal = localStorage.getItem('espetaria_saved_rice_flavors');
      if (fromLocal) return JSON.parse(fromLocal);
    } catch {}
    return settings.saved_rice_flavors || DEFAULT_RICE_OPTIONS;
  });

  // Lista consolidada de arrozes cadastrados
  const allSavedRices = React.useMemo(() => {
    const list = [
      ...(settings.saved_rice_flavors || []),
      ...(settings.daily_rice_flavors || []),
      ...localSavedRices,
      ...DEFAULT_RICE_OPTIONS,
    ];
    // Remove "Arroz" puro genérico se já existirem opções mais específicas
    const unique = Array.from(new Set(list))
      .map((r) => r.trim())
      .filter((r) => Boolean(r) && r.toLowerCase() !== 'arroz');
    return unique;
  }, [settings.saved_rice_flavors, settings.daily_rice_flavors, localSavedRices]);

  useEffect(() => {
    if (!isOpen) return;
    setPrepValues({});
    setDisabledProducts({});
    setPortionsOverride({});
    setCashStart('');
    setErrorMsg(null);
    setRepeatState({ loading: false, message: null });
    setSelectedRiceFlavors(
      settings.daily_rice_flavors && settings.daily_rice_flavors.length > 0
        ? settings.daily_rice_flavors
        : ['Arroz Branco']
    );
    setCustomRiceInput('');
    setIsAddingCustomRice(false);
  }, [isOpen, settings.daily_rice_flavors]);

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
    if (selectedRiceFlavors.includes(flavor)) {
      if (selectedRiceFlavors.length > 1) {
        setSelectedRiceFlavors(selectedRiceFlavors.filter((f) => f !== flavor));
      }
    } else {
      setSelectedRiceFlavors([...selectedRiceFlavors, flavor]);
    }
  };

  const handleAddCustomRice = () => {
    const trimmed = customRiceInput.trim();
    if (!trimmed) return;

    // Normaliza para reaproveitar maiúsculas/minúsculas se já existir
    const existing = allSavedRices.find((r) => r.toLowerCase() === trimmed.toLowerCase());
    const flavorToAdd = existing || trimmed;

    // 1. Marca como selecionado no turno de hoje
    if (!selectedRiceFlavors.includes(flavorToAdd)) {
      setSelectedRiceFlavors((prev) => [...prev, flavorToAdd]);
    }

    // 2. Salva permanentemente no catálogo de arrozes
    if (!allSavedRices.some((r) => r.toLowerCase() === trimmed.toLowerCase())) {
      const updated = [...allSavedRices, flavorToAdd];
      setLocalSavedRices(updated);
      try {
        localStorage.setItem('espetaria_saved_rice_flavors', JSON.stringify(updated));
      } catch {}
      updateSettings({ saved_rice_flavors: updated });
    }

    setCustomRiceInput('');
    setIsAddingCustomRice(false);
  };

  const handleRemoveSavedRice = (flavor: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = allSavedRices.filter((r) => r.toLowerCase() !== flavor.toLowerCase());
    setLocalSavedRices(updated);
    try {
      localStorage.setItem('espetaria_saved_rice_flavors', JSON.stringify(updated));
    } catch {}
    updateSettings({ saved_rice_flavors: updated });
    if (selectedRiceFlavors.includes(flavor)) {
      setSelectedRiceFlavors((prev) => prev.filter((r) => r !== flavor));
    }
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

      if (selectedRiceFlavors.length > 0) {
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
              <span className="text-[10px] font-bold text-brand-700 bg-brand-50 px-1.5 py-0.2 rounded border border-brand-200">
                {selectedRiceFlavors.join(' & ')}
              </span>
            )}
          </div>
          <div className="text-[11px] text-ink-muted font-mono shrink-0">
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

          {/* Destaque: Botão de 1 Clique para Repetir Último Turno */}
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
              <span>{repeatState.loading ? 'Copiando...' : 'Repetir Último Turno'}</span>
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
                <span>Identificação do Turno</span>
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
          <div className="p-3.5 rounded-xl border border-line bg-surface space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold text-ink">Arroz do Dia (visível para os garçons)</span>
                <p className="text-[11px] text-ink-muted">Toque para ativar os sabores preparados hoje (ficam sempre salvos aqui):</p>
              </div>
              <span className="text-[11px] font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-200">
                {selectedRiceFlavors.length > 0 ? selectedRiceFlavors.join(' & ') : 'Nenhum selecionado'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {allSavedRices.map((option) => {
                const isSelected = selectedRiceFlavors.includes(option);
                const isCustom = !DEFAULT_RICE_OPTIONS.includes(option);
                return (
                  <div
                    key={option}
                    className={`inline-flex items-center rounded-lg text-xs font-bold transition border shadow-2xs ${
                      isSelected
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-line bg-white text-ink hover:border-brand-400'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleRiceFlavor(option)}
                      className="h-8 px-2.5 flex items-center gap-1.5"
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                      <span>{option}</span>
                    </button>
                    {isCustom && (
                      <button
                        type="button"
                        onClick={(e) => handleRemoveSavedRice(option, e)}
                        title={`Remover "${option}" dos salvos`}
                        className={`h-8 pr-2 pl-0.5 text-xs opacity-60 hover:opacity-100 transition ${
                          isSelected ? 'text-white hover:text-rose-200' : 'text-ink-muted hover:text-rose-600'
                        }`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}

              {!isAddingCustomRice ? (
                <button
                  type="button"
                  onClick={() => setIsAddingCustomRice(true)}
                  className="h-8 px-2.5 rounded-lg border border-dashed border-brand-400 bg-brand-50/60 text-xs font-bold text-brand-700 hover:bg-brand-100 flex items-center gap-1 transition"
                >
                  <span>+ Outro sabor</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-brand-300 shadow-xs">
                  <input
                    type="text"
                    autoFocus
                    value={customRiceInput}
                    onChange={(e) => setCustomRiceInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomRice();
                      } else if (e.key === 'Escape') {
                        setIsAddingCustomRice(false);
                      }
                    }}
                    placeholder="Nome do arroz (ex: cuxa)..."
                    className="h-7 px-2 text-xs rounded border border-line text-ink focus:outline-none focus:ring-1 focus:ring-brand-600 w-36 sm:w-44 font-medium"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomRice}
                    disabled={!customRiceInput.trim()}
                    className="btn-primary h-7 px-2.5 text-xs font-bold disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingCustomRice(false);
                      setCustomRiceInput('');
                    }}
                    className="h-7 px-1.5 text-xs text-ink-muted hover:text-ink"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
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
                  className="text-[11px] font-semibold text-brand-700 hover:text-brand-900"
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
                    <span className="text-xs font-bold text-ink-secondary block mb-1">Porções de Arroz</span>
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
            <span>Confirmar e Abrir Turno</span>
          </button>
        </div>

      </div>
    </Dialog>
  );
};
